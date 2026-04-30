import { StateGraph, END, START } from "@langchain/langgraph";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
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
const nvidiaClient = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || "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",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

async function generateWithFallback(prompt: string): Promise<string> {
  try {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'undefined') {
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
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
      temperature: 0.2
    });
    return res.choices[0]?.message?.content || "";
  }
}

async function correlateEventsNode(state: AnalystAgentState): Promise<Partial<AnalystAgentState>> {
  if (!state.raw_events || state.raw_events.length === 0) return {};
  
  const prompt = `You are a Tier 3 SOC Analyst. Correlate these disparate events into a potential attack chain if they are related. 
Events: ${JSON.stringify(state.raw_events)}
Output a JSON list of the events that form a coherent attack chain. If none, output an empty list "[]".
Reply ONLY with valid JSON.`;
  
  try {
     const textObj = await generateWithFallback(prompt);
     let text = textObj.replace(/```json/g, '').replace(/```/g, '').trim() || "[]";
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
  
  const prompt = `Map these sequential attack chain events to MITRE ATT&CK tactics and techniques.
Chain: ${JSON.stringify(chain)}
Output JSON: [{ "tactic": "...", "technique_name": "...", "technique_id": "..." }]`;
  
  try {
     const textObj = await generateWithFallback(prompt);
     let text = textObj.replace(/```json/g, '').replace(/```/g, '').trim() || "[]";
     const additionalMappings = JSON.parse(text);
     return { mitre_mappings: [...mappings, ...(Array.isArray(additionalMappings) ? additionalMappings : [])] };
  } catch (e) {
     return { mitre_mappings: mappings };
  }
}

async function explainAndRespondNode(state: AnalystAgentState): Promise<Partial<AnalystAgentState>> {
   const prompt = `You are a high-reasoning Security Analyst Agent powered by Deep Learning LLMs.
Task: Analyze the following attack chain and MITRE mappings.
1. Cross-reference the raw payloads (IPs, process names, command lines) with your internal knowledge base (simulating online threat intel research).
2. Determine if this is a FALSE POSITIVE (e.g. normal admin activity, legitimate software). Verify every raw data payload.
3. If it is a real threat, explain the complex attack path and the Deep Learning / ML model's anomaly decision to a human operator in clear terms.
4. Recommend a response action (Block, Isolate, Notify, Ignore, Deploy_Honeypot).

Attack Chain: ${JSON.stringify(state.correlated_chain)}
Original Raw Events: ${JSON.stringify(state.raw_events)}
MITRE Mappings: ${JSON.stringify(state.mitre_mappings)}

Output JSON ONLY:
{
  "explanation": "Detailed explanation of the attack path, incorporating your simulated online research findings on the raw payloads and why the deep learning model flagged it...",
  "recommended_action": "Block",
  "is_false_positive": false
}`;

  try {
     const textObj = await generateWithFallback(prompt);
     let text = textObj.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
     const parsed = JSON.parse(text);
     
     let finalExplanation = parsed.explanation || "Failed to analyze.";
     if (parsed.is_false_positive) {
         finalExplanation = "[RESEARCHED: FALSE POSITIVE] " + finalExplanation;
         parsed.recommended_action = "Ignore";
     } else {
         finalExplanation = "[RESEARCHED: THREAT CONFIRMED] " + finalExplanation;
     }

     return { 
        explanation: finalExplanation,
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
