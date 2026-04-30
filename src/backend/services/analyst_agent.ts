import { StateGraph, END, START } from "@langchain/langgraph";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";
import { mitreService } from "./mitre_service.js";

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
  },
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const nvidiaClient = new OpenAI({
  apiKey:
    process.env.NVIDIA_API_KEY ||
    "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",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

async function generateWithFallback(prompt: string): Promise<string> {
  try {
    if (
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== "undefined"
    ) {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return res.text || "";
    } else {
      throw new Error("Gemini API Key missing");
    }
  } catch (err) {
    console.log("Falling back to NVIDIA LLM for Analyst Agent inference...");
    const res = await nvidiaClient.chat.completions.create({
      model: "meta/llama3-70b-instruct",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.2,
    });
    return res.choices[0]?.message?.content || "";
  }
}

async function correlateEventsNode(
  state: AnalystAgentState,
): Promise<Partial<AnalystAgentState>> {
  if (!state.raw_events || state.raw_events.length === 0) return {};

  const prompt = `You are a Tier 3 SOC Analyst. Correlate these disparate events into a potential attack chain if they are related. 
Events: ${JSON.stringify(state.raw_events)}
Output a JSON list of the events that form a coherent attack chain. If none, output an empty list "[]".
Reply ONLY with valid JSON.`;

  try {
    const textObj = await generateWithFallback(prompt);
    let text =
      textObj
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim() || "[]";
    const chain = JSON.parse(text);
    return { correlated_chain: Array.isArray(chain) ? chain : [] };
  } catch (e) {
    return { correlated_chain: state.raw_events };
  }
}

async function mapMitreNode(
  state: AnalystAgentState,
): Promise<Partial<AnalystAgentState>> {
  const chain = state.correlated_chain;
  if (!chain || chain.length === 0) return {};

  const mappings = [];
  for (const event of chain) {
    const mapped = mitreService.mapToMitre(event.data || event);
    if (mapped) mappings.push(mapped);
  }

  const prompt = `Map these sequential attack chain events to MITRE ATT&CK tactics and techniques.
Chain: ${JSON.stringify(chain)}
Output JSON: [{ "tactic": "...", "technique_name": "...", "technique_id": "..." }]`;

  try {
    const textObj = await generateWithFallback(prompt);
    let text =
      textObj
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim() || "[]";
    const additionalMappings = JSON.parse(text);
    return {
      mitre_mappings: [
        ...mappings,
        ...(Array.isArray(additionalMappings) ? additionalMappings : []),
      ],
    };
  } catch (e) {
    return { mitre_mappings: mappings };
  }
}

async function explainAndRespondNode(
  state: AnalystAgentState,
): Promise<Partial<AnalystAgentState>> {
  const prompt = `You are a group of three elite Security AI Agents (Agent Alpha: Aggressive Defender, Agent Beta: Threat Intel Researcher, Agent Gamma: ML Anomaly Specialist) powered by Deep Learning.
Task: Analyze the following attack chain and MITRE mappings by engaging in a short simulated debate.
1. Have the agents debate the raw payloads (IPs, process names, command lines) and their threat potential.
2. Cross-reference the raw payloads with your internal knowledge base. Determine if this is a FALSE POSITIVE (e.g. normal admin activity).
3. IMPORTANT: Even if it appears to be a FALSE POSITIVE, one agent MUST deeply analyze all logs and payload data for any hidden suspicious/malicious content or secondary payloads sent by the attacker.
4. If a hidden payload is found, mark "hidden_payload_found" as true, and recommend IP blocking.
5. Provide a summary of the debate, explain the complex attack path and the Deep Learning / ML model's anomaly decision to a human operator in clear terms.
6. Conclude with a final consensus on the response action (Block, Isolate, Notify, Ignore, Deploy_Honeypot).

Attack Chain: ${JSON.stringify(state.correlated_chain)}
Original Raw Events: ${JSON.stringify(state.raw_events)}
MITRE Mappings: ${JSON.stringify(state.mitre_mappings)}

Output JSON ONLY:
{
  "debate_log": "Agent Alpha: ..., Agent Beta: ..., Agent Gamma: ...",
  "explanation": "Summary of debate. Detailed explanation of the attack path and hidden data...",
  "recommended_action": "Block",
  "is_false_positive": false,
  "hidden_payload_found": false,
  "malicious_ip": "1.2.3.4 or null"
}`;

  try {
    const textObj = await generateWithFallback(prompt);
    let text =
      textObj
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim() || "{}";
    const parsed = JSON.parse(text);

    let finalExplanation = `[MULTI-AGENT DEBATE LOG]\n${parsed.debate_log}\n\n[CONSENSUS EXPLANATION]\n` + (parsed.explanation || "Failed to analyze.");

    if (parsed.hidden_payload_found && parsed.malicious_ip) {
      finalExplanation =
        `[CRITICAL: HIDDEN PAYLOAD DETECTED BY AI AGENT DEBATE] Although initially appearing normal, deep analysis uncovered malicious hidden payloads referencing IP ${parsed.malicious_ip}. Initiating immediate block. Details:\n` +
        finalExplanation;
      parsed.recommended_action = "Block_IP_Hidden";
      // Dynamically block
      import("./ips_service.js")
        .then(({ ipsService }) => {
          ipsService.blockIp(
            parsed.malicious_ip,
            "[AI Agent Consensus] Hidden Malicious Payload Detected",
            24,
          );
          // And also log a Critical Alert directly
          import("./alert_service.js").then(({ alertService }) => {
              alertService.createAlert({
                  severity: 'Critical',
                  reason: `[AI Agent Consensus] Hidden Malicious Payload blocked for IP ${parsed.malicious_ip}`,
                  score: 0.99,
                  status: 'auto_resolved',
                  resolution_action: 'Blocked IP',
                  mitigations: 'IP Blocked based on AI Debate'
              });
          });
        })
        .catch((e) => console.error("Could not dynamic block:", e));
    } else if (parsed.is_false_positive) {
      finalExplanation = "[DEBATE OUTCOME: FALSE POSITIVE] " + finalExplanation;
      parsed.recommended_action = "Ignore";
    } else {
      finalExplanation = "[DEBATE OUTCOME: THREAT CONFIRMED] " + finalExplanation;
    }

    return {
      explanation: finalExplanation,
      recommended_action: parsed.recommended_action || "Notify",
    };
  } catch (e) {
    return {
      explanation: "Error during LLM Multi-Agent debate analysis.",
      recommended_action: "Notify",
    };
  }
}

export const analystAgentWorkflow = new StateGraph<AnalystAgentState>({
  channels: graphState as any,
})
  .addNode("correlate", correlateEventsNode)
  .addNode("map_mitre", mapMitreNode)
  .addNode("explain_respond", explainAndRespondNode)
  .addEdge(START, "correlate")
  .addEdge("correlate", "map_mitre")
  .addEdge("map_mitre", "explain_respond")
  .addEdge("explain_respond", END);

export const compiledAnalystAgent = analystAgentWorkflow.compile();
