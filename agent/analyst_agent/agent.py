import sys
import json
import sqlite3
import os
import requests

HAS_LANGGRAPH = False
try:
    from langgraph.graph import StateGraph, END
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import SystemMessage, HumanMessage
    from typing import Dict, TypedDict, List
    HAS_LANGGRAPH = True
except ImportError:
    pass

class AgentState(TypedDict):
    alert_id: str
    db_path: str
    raw_alert: Dict
    logs: List[Dict]
    normalized_events: List[Dict]
    mitre_mapped: List[Dict]
    attack_path: List[Dict]
    response_plan: Dict
    summary: str

def load_context(state: AgentState):
    # Fetch from SQLite
    db_path = state["db_path"]
    alert_id = state["alert_id"]
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    alert = cur.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    if not alert:
        return {"raw_alert": {}}
    
    alert_dict = dict(alert)
    # Fetch recent logs around the alert time
    log_id = alert_dict.get("log_id")
    logs = []
    if log_id:
        # fetch this log + a few before and after
        log = cur.execute("SELECT * FROM normalized_events WHERE id = ?", (log_id,)).fetchone()
        if log:
            time_val = log["timestamp"]
            recent_logs = cur.execute('''SELECT * FROM normalized_events 
                                        ORDER BY ABS(julianday(timestamp) - julianday(?)) 
                                        LIMIT 10''', (time_val,)).fetchall()
            logs = [dict(r) for r in recent_logs]
    
    conn.close()
    return {"raw_alert": alert_dict, "logs": logs}

def normalize_events(state: AgentState):
    # Already somewhat normalized, standard schema matching required by task
    normalized_events = []
    for log in state["logs"]:
        dt = log.get("details", "")
        parsed_dt = {}
        try:
            parsed_dt = json.loads(dt) if isinstance(dt, str) else dt
        except:
            pass
        
        normalized_events.append({
            "timestamp": log.get("timestamp"),
            "source_ip": log.get("source_ip", parsed_dt.get("remote_address", "Unknown")),
            "user": log.get("user_id", "Unknown"),
            "event_type": log.get("event_type", "Unknown"),
            "process_name": parsed_dt.get("name", "Unknown"),
            "severity": state["raw_alert"].get("severity", "Medium")
        })
    return {"normalized_events": normalized_events}

def process_with_llm(state: AgentState):
    if not HAS_LANGGRAPH:
        return process_dummy(state)
        
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return process_dummy(state)
        
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro", google_api_key=api_key)
    
    messages = [
        SystemMessage(content="You are a Cybersecurity SOC Analyst. Map events to MITRE ATT&CK, trace the attack path, and recommend response actions. Output ONLY raw JSON matching the following schema: {\"mitre\": [{\"technique\": \"Txxx\", \"name\": \"...\", \"confidence\": 0.9, \"evidence\": [\"...\"] }], \"attack_path\": [{\"stage\": \"...\", \"description\": \"...\"}], \"recommended_actions\": [\"...\"], \"autonomous_action_recommendation\": {\"action\": \"...\", \"confidence\": 0.8}, \"summary\": \"...\"}"),
        HumanMessage(content=f"Alert: {json.dumps(state['raw_alert'])}\nLogs: {json.dumps(state['normalized_events'])}")
    ]
    
    try:
        res = llm.invoke(messages)
        content = res.content.replace('```json', '').replace('```', '').strip()
        parsed = json.loads(content)
        return {
            "mitre_mapped": parsed.get("mitre", []),
            "attack_path": parsed.get("attack_path", []),
            "response_plan": {
                "actions": parsed.get("recommended_actions", []),
                "autonomous": parsed.get("autonomous_action_recommendation", {})
            },
            "summary": parsed.get("summary", "Analysis complete.")
        }
    except Exception as e:
        return process_dummy(state)

def process_dummy(state: AgentState):
    alert = state["raw_alert"]
    reason = alert.get("reason", "")
    
    mitre_tech = "T1110" if "Brute" in reason else "T1059"
    mitre_name = "Brute Force" if "Brute" in reason else "Command and Scripting Interpreter"
    
    return {
        "mitre_mapped": [{"technique": mitre_tech, "name": mitre_name, "confidence": 0.85, "evidence": [reason]}],
        "attack_path": [{"stage": "Initial Access", "description": reason}],
        "response_plan": {
            "actions": ["Isolate host", "Reset credentials"],
            "autonomous": {"action": "Block Origin IP", "confidence": 0.9}
        },
        "summary": f"Detected suspicious activity matching {mitre_name}. Immediate triage required."
    }

def build_graph():
    if not HAS_LANGGRAPH:
        return None
    workflow = StateGraph(AgentState)
    workflow.add_node("load_context", load_context)
    workflow.add_node("normalize_events", normalize_events)
    workflow.add_node("process_with_llm", process_with_llm) # Combines mitre_mapper, correlator, responder for simplicity and speed
    
    workflow.set_entry_point("load_context")
    workflow.add_edge("load_context", "normalize_events")
    workflow.add_edge("normalize_events", "process_with_llm")
    workflow.add_edge("process_with_llm", END)
    
    return workflow.compile()

def run_agent(alert_id: str):
    db_path = os.path.join(os.getcwd(), "database.sqlite")
    
    if HAS_LANGGRAPH:
        app = build_graph()
        result = app.invoke({"alert_id": alert_id, "db_path": db_path})
        
        final_output = {
            "summary": result.get("summary", ""),
            "mitre": result.get("mitre_mapped", []),
            "attack_path": result.get("attack_path", []),
            "recommended_actions": result.get("response_plan", {}).get("actions", []),
            "autonomous_action_recommendation": result.get("response_plan", {}).get("autonomous", {})
        }
    else:
        # Fallback to direct python chaining if langgraph isn't installed
        state = {"alert_id": alert_id, "db_path": db_path}
        state.update(load_context(state))
        state.update(normalize_events(state))
        state.update(process_dummy(state))
        
        final_output = {
            "summary": state.get("summary", ""),
            "mitre": state.get("mitre_mapped", []),
            "attack_path": state.get("attack_path", []),
            "recommended_actions": state.get("response_plan", {}).get("actions", []),
            "autonomous_action_recommendation": state.get("response_plan", {}).get("autonomous", {})
        }
        
    print(json.dumps(final_output))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing alert ID"}))
        sys.exit(1)
    run_agent(sys.argv[1])
