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
    
    // Set up LLM
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
       return res.json({ 
          response: "SYSTEM NOTE: AI integration is currently offline due to missing API Key. Please verify your environment configuration or continue to operate in fallback mode. The issue with process '" + (req.body.contextData?.process_name || 'unknown') + "' can be managed manually in the EDR panel."
       });
    }
    const ai = new GoogleGenAI({ apiKey });

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

    const chatSession = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2
      }
    });

    // Replay history for the chat session context (if using chats.create, we can optionally pass history or let it be stateless if we just pass everything as prompt)
    // Since we're keeping it simple, let's just make a single generateContent call with history appended
    let fullPrompt = history.map(h => `${h.role === 'user' ? 'User' : 'Aegix'}: ${h.text}`).join('\n') + `\nUser: ${query}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: fullPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2
      }
    });

    const replyText = response.text || 'I could not generate a response.';
    
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
