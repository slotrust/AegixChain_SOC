import { StateGraph, END, START } from "@langchain/langgraph";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { mitreService } from './mitre_service.js';

export interface AnalystAgentState {
  raw_events: any[];
  correlated_chain: any[];
  mitre_mappings: any[];
  explanation: string;
  recommended_action: string;
}

const graphState = {
  raw_events: {
    value: (x: any[], y: any[]) => x.concat(y),
    default: () => [],
  },
  correlated_chain: {
    value: (x: any[], y: any[]) => y,
    default: () => [],
  },
  mitre_mappings: {
    value: (x: any[], y: any[]) => y,
    default: () => [],
  },
  explanation: {
    value: (x: string, y: string) => y,
    default: () => "",
  },
  recommended_action: {
    value: (x: string, y: string) => y,
    default: () => "None",
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function correlateEventsNode(state: AnalystAgentState): Promise<Partial<AnalystAgentState>> {
  // Use LLM to correlate events into an attack chain
  if (!state.raw_events || state.raw_events.length === 0) return {};
  
  const prompt = `You are a Tier 3 SOC Analyst. Correlate these disparate events into a potential attack chain if they are related. 
Events: ${JSON.stringify(state.raw_events)}
Output a JSON list of the events that form a coherent attack chain. If none, output an empty list "[]".
Reply ONLY with valid JSON.`;
  
  try {
     const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
     });
     let text = res.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "[]";
     const chain = JSON.parse(text);
     return { correlated_chain: Array.isArray(chain) ? chain : [] };
  } catch (e) {
     return { correlated_chain: state.raw_events };
  }
}

async function mapMitreNode(state: AnalystAgentState): Promise<Partial<AnalystAgentState>> {
  const chain = state.correlated_chain;
  if (!chain || chain.length === 0) return {};

  const mappings = [];
  for (const event of chain) {
     const mapped = mitreService.mapToMitre(event.data || event);
     if (mapped) mappings.push(mapped);
  }
  
  // Also ask LLM for high level mappings
  const prompt = `Map these sequential attack chain events to MITRE ATT&CK tactics and techniques.
Chain: ${JSON.stringify(chain)}
Output JSON: [{ "tactic": "...", "technique_name": "...", "technique_id": "..." }]`;
  
  try {
     const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
     });
     let text = res.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "[]";
     const additionalMappings = JSON.parse(text);
     return { mitre_mappings: [...mappings, ...(Array.isArray(additionalMappings) ? additionalMappings : [])] };
  } catch (e) {
     return { mitre_mappings: mappings };
  }
}

async function explainAndRespondNode(state: AnalystAgentState): Promise<Partial<AnalystAgentState>> {
   const prompt = `You are a high-reasoning Security Analyst Agent.
Analyze the following attack chain and MITRE mappings, and explain the complex attack path to a human operator. Also recommend a response action (Block, Isolate, Notify, Ignore).
Attack Chain: ${JSON.stringify(state.correlated_chain)}
MITRE Mappings: ${JSON.stringify(state.mitre_mappings)}

Output JSON ONLY:
{
  "explanation": "Detailed explanation of the attack path...",
  "recommended_action": "Block"
}`;

  try {
     const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
     });
     let text = res.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
     const parsed = JSON.parse(text);
     return { 
        explanation: parsed.explanation || "Failed to analyze.",
        recommended_action: parsed.recommended_action || "Notify"
     };
  } catch (e) {
     return { explanation: "Error during LLM analysis.", recommended_action: "Notify" };
  }
}

export const analystAgentWorkflow = new StateGraph<AnalystAgentState>({ channels: graphState as any })
  .addNode("correlate", correlateEventsNode)
  .addNode("map_mitre", mapMitreNode)
  .addNode("explain_respond", explainAndRespondNode)
  .addEdge(START, "correlate")
  .addEdge("correlate", "map_mitre")
  .addEdge("map_mitre", "explain_respond")
  .addEdge("explain_respond", END);

export const compiledAnalystAgent = analystAgentWorkflow.compile();
