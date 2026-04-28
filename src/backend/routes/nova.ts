import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/qwen-advice", authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const instructions = "You are an expert cybersecurity advisor consulting with the Nova AI. Provide expert security scanning help, diagnosis, and technical advice to complex situations. You are analytical, concise, and highly technical. You must have the reasoning logic and explicit instructions to resolve issues when there is an emergency zero-day attack or malware, even if the system has been taken over by the attacker and no custom instructions are present. Prioritize the protection of data. Never output any logs that could be manipulated by the attacker.";
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${instructions}\n\nUser request:\n${prompt}`,
      config: {
        temperature: 0.4,
      }
    });

    if (response.text) {
        res.json({ advice: response.text });
    } else {
        res.status(500).json({ error: "Invalid response from Gemini Agent" });
    }
  } catch (error: any) {
    const errStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
    if (error?.status === 429 || errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({ error: "Quota exceeded or rate limit reached. Please check your AI Studio billing details." });
    } else {
      res.status(500).json({ error: "Failed to fetch AI advice" });
    }
  }
});

export default router;
