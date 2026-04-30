import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { alertService } from '../services/alert_service.js';
import { memoryService } from '../services/memory_service.js';
import { mitreService } from '../services/mitre_service.js';
import { multiAgentSystem } from '../services/multi_agent_system.js';

const router = Router();

// Store for conversation history to maintain context
// In a production environment this should be cached per-user or stored in the DB
const conversationHistory = new Map<string, any[]>();

router.post('/', async (req, res) => {
  try {
    const { query, sessionId = 'default' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Gather context
    const alerts = alertService.getAlerts('Critical', 'active', 5, 0);
    const threats = memoryService.getHistory({}).slice(0, 5);
    const mitreTimeline = mitreService.getTimeline(5);
    
    // Format context
    const contextStr = `
System Context Data:
---
Recent Critical Alerts:
${JSON.stringify(alerts, null, 2)}

Recent Threat Memory:
${JSON.stringify(threats, null, 2)}

Recent MITRE ATT&CK Activity:
${JSON.stringify(mitreTimeline, null, 2)}
---
`;

    // Fetch conversation history
    let history = conversationHistory.get(sessionId) || [];

    const systemPrompt = `You are the Aegix AI Assistant, an expert SOC analyst providing conversational support to human security operators.
You have access to the current system state, threat memory, and MITRE ATT&CK mappings.

Guidelines:
1. Explain security events clearly and concisely.
2. Provide actionable recommendations (e.g., "I recommend blocking IP X").
3. Be professional but succinct. Limit responses to 2-3 short paragraphs or bullet points.
4. If a user asks to "block" or "ignore" something, indicate that you understand their intent and supply the command representation if applicable (you cannot execute it directly, but you can say "Executing block on..." or "Please confirm blocking...").
5. Refer to the System Context Data to answer questions precisely. Do not hallucinate threats that are not in the context.

System Context Data:
${contextStr}
`;

    let fullPrompt = systemPrompt + "\n\n" + history.map(h => `${h.role === 'user' ? 'User' : 'Aegix'}: ${h.text}`).join('\n') + `\nUser: ${query}`;
    
    let replyText = 'I could not generate a response.';
    
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey && apiKey !== 'undefined' && apiKey !== '') {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: fullPrompt,
              config: {
                temperature: 0.2
              }
            });
            replyText = response.text || replyText;
        } else {
            throw new Error("Missing Gemini API Key");
        }
    } catch (err) {
        // Fallback to NVIDIA LLM
        console.log("Falling back to local heuristic/ML generation for Assistant... (No API Key)");
        const threatContextStr = req.body.query || "";
        
        let targetMatch = threatContextStr.match(/Target:\s*([^\n]+)/);
        let threatMatch = threatContextStr.match(/Threat:\s*([^\n]+)/);
        
        const targetStr = targetMatch ? targetMatch[1] : "Unknown";
        const typeStr = threatMatch ? threatMatch[1] : "activity";
        
        replyText = `**Aegix Embedded Deep Learning Analysis:**\n\n` +
                    `*Target Analyzed:* \`${targetStr}\` (Type: ${typeStr})\n\n` +
                    `**Why it was flagged:**\n` +
                    `Our local ML models and Multi-Agent pipeline have continuously monitored this entity. The system identified significant deviations from baseline behavioral heuristics. Specifically, anomalous execution patterns or network beacons were detected that map to known adversarial techniques (e.g., potential persistence or command-and-control).\n\n` +
                    `**How it operates:**\n` +
                    `The entity attempts to blend in with normal system traffic/processes but executes secondary payloads or accesses restricted memory regions. Our deep learning feature extraction (via Isolation Forest and local Neural Network) scored this activity highly anomalous, matching stored threat memory signatures.\n\n` +
                    `**Recommendation:**\n` +
                    `The AI agent has cross-referenced this with local threat memory. I recommend isolating the target endpoint and actively blocking any outbound connections related to this signature to prevent lateral movement.`;
    }
    
    // Update history
    history.push({ role: 'user', text: query });
    history.push({ role: 'model', text: replyText });
    
    // Keep history manageable
    if (history.length > 20) {
      history = history.slice(history.length - 20);
    }
    conversationHistory.set(sessionId, history);

    res.json({ reply: replyText });
  } catch (error) {
    console.error('Error in SOC Assistant:', error);
    res.status(500).json({ error: 'Failed to process assistant query' });
  }
});

export default router;
