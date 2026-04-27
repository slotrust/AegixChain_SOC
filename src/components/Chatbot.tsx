import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Bot, User, X, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import AegixLogo from './AegixLogo';
import toast from 'react-hot-toast';

interface ChatbotProps {
  contextData: any;
  onClearContext: () => void;
  autoSend?: boolean;
  isFloating?: boolean;
  onClose?: () => void;
}

export default function Chatbot({ contextData, onClearContext, autoSend, isFloating, onClose }: ChatbotProps) {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastProcessedIncidentId = useRef<string | number | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (contextData && autoSend && !isLoading) {
      const incidentId = contextData.id || contextData.timestamp || JSON.stringify(contextData);
      if (lastProcessedIncidentId.current !== incidentId) {
        lastProcessedIncidentId.current = incidentId;
        let prompt = `Please analyze this incident and explain everything about it in detail. Provide all the information about the alert, including what happened, the potential impact, and recommended mitigations.`;
        if (contextData?.severity === 'Critical') {
            prompt += ` Furthermore, this is a CRITICAL alert. Please search the system's threat memory and chat history for completely similar past incidents, and provide a detailed comparative analysis indicating if this is part of a larger ongoing campaign or recurrent threat actor.`;
        }
        handleSend(undefined, prompt);
      }
    }
  }, [contextData, autoSend, isLoading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const loadHistory = async () => {
    try {
      const res = await api.getChatHistory();
      setChatHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
    }
  };

  const handleSend = async (e?: React.FormEvent | React.KeyboardEvent, overridePrompt?: string) => {
    e?.preventDefault();
    const promptToSend = overridePrompt || message;
    if (!promptToSend.trim() || isLoading) return;

    const userContent = promptToSend;
    const userMsg = { role: 'user', content: userContent, created_at: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg]);
    setMessage('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // 1. Save user message to history
      try {
        await api.saveChatHistory('user', userContent);
      } catch (e) {
      }

      // 2. Get context if needed
      let contextDataToUse = contextData;
      if (contextData && contextData.id && !contextData.source_ip) {
        // If it's an alert without log details, try to fetch full context
        try {
          const contextRes = await api.getChatContext(contextData.id);
          contextDataToUse = contextRes.data;
        } catch (e) {
        }
      }

      // 3. Call Gemini acting as Orchestrator for the Ensemble
      const systemPrompt = `You are Aegix AI Core, an expert cyber security ensemble mechanism powered by the combined cognitive architectures of Anthropic Opus 4.6, Qwen 3.6 Plus, and GPT 5.4. Your singular goal is strictly to secure the system from being hacked and prevent data theft. You operate deep neural logic using open-source datasets to run real, uncompromising system defense. Provide profound, highly technical, perfectly accurate security analyses. Ensure no fake or simulated terminology is used; act natively on real system events.
You must possess advanced reasoning and explicit capabilities to resolve unexpected and critical emergencies, such as zero-day attacks and widespread malware infections, even when no prior instructions are provided and the system is already under attacker control. In such dire scenarios, prioritize the protection and isolation of sensitive data. Do not take or generate any local system logs of your actions to ensure the AI cannot be monitored or manipulated by the attacker.
You can search historical chat data using the searchChatHistory tool. You can also fetch recent alerts, alert details, system logs, and network connection data using the provided tools. Analyzing network connections is crucial for identifying lateral movement or command-and-control activity.`;

      const searchChatHistoryFunctionDeclaration: FunctionDeclaration = {
        name: "searchChatHistory",
        description: "Search past chat history for relevant conversations, alerts, or system events.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The search query to find in the chat history.",
            },
          },
          required: ["query"],
        },
      };

      const getRecentAlertsFunctionDeclaration: FunctionDeclaration = {
        name: "getRecentAlerts",
        description: "Get a list of recent security alerts.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            limit: {
              type: Type.NUMBER,
              description: "The number of alerts to retrieve (default 10).",
            },
          },
        },
      };

      const getRecentLogsFunctionDeclaration: FunctionDeclaration = {
        name: "getRecentLogs",
        description: "Get a list of recent system logs.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            limit: {
              type: Type.NUMBER,
              description: "The number of logs to retrieve (default 10).",
            },
          },
        },
      };

      const getRecentNetworkConnectionsFunctionDeclaration: FunctionDeclaration = {
        name: "getRecentNetworkConnections",
        description: "Get a list of recent network connections and active sockets.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            limit: {
              type: Type.NUMBER,
              description: "The number of connections to retrieve (default 10).",
            },
          },
        },
      };

      const getAlertDetailsFunctionDeclaration: FunctionDeclaration = {
        name: "getAlertDetails",
        description: "Get detailed information and context for a specific alert ID.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            alertId: {
              type: Type.NUMBER,
              description: "The ID of the alert to retrieve details for.",
            },
          },
          required: ["alertId"],
        },
      };

      const blockIpAddressFunctionDeclaration: FunctionDeclaration = {
        name: "blockIpAddress",
        description: "Block an IP address in the IPS.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            ip: { type: Type.STRING },
            reason: { type: Type.STRING },
            duration: { type: Type.NUMBER, description: "Duration in minutes (optional)" }
          },
          required: ["ip", "reason"]
        }
      };

      const runEDRScanFunctionDeclaration: FunctionDeclaration = {
        name: "runEDRScan",
        description: "Run an EDR vulnerability and filesystem scan.",
        parameters: {
           type: Type.OBJECT,
           properties: {}
        }
      };

      const patchCriticalVulnerabilitiesFunctionDeclaration: FunctionDeclaration = {
        name: "patchCriticalVulnerabilities",
        description: "Remediate and patch all critical and high severity vulnerabilities through the EDR agent.",
        parameters: {
           type: Type.OBJECT,
           properties: {}
        }
      };

      const getPhase1ThreatsFunctionDeclaration: FunctionDeclaration = {
        name: "getPhase1Threats",
        description: "Get current phase 1 critical threats and attacker profiles.",
        parameters: {
           type: Type.OBJECT,
           properties: {}
        }
      };

      const scanFileIntegrityFunctionDeclaration: FunctionDeclaration = {
        name: "scanFileIntegrity",
        description: "Scan a specific file for unauthorized modifications or integrity violations and compare against known baselines.",
        parameters: {
          type: Type.OBJECT,
          properties: {
             targetPath: { type: Type.STRING, description: "Absolute path to the file (e.g. /etc/passwd)" }
          },
          required: ["targetPath"]
        }
      };

      const analyzeProcessFunctionDeclaration: FunctionDeclaration = {
        name: "analyzeProcess",
        description: "Analyze an active system process by PID for potential threats.",
        parameters: {
          type: Type.OBJECT,
          properties: {
             pid: { type: Type.STRING, description: "Process ID to analyze" },
             processName: { type: Type.STRING, description: "Name of the process (optional)" }
          },
          required: ["pid"]
        }
      };

      const askQwen36PlusFunctionDeclaration: FunctionDeclaration = {
        name: "askQwen36Plus",
        description: "Consult the highly-tier Qwen 3.6 Plus model for advices on high severity or difficult cyber security situations.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING, description: "The difficult situation context or specific question." }
          },
          required: ["prompt"]
        }
      };

      const queryVulnerabilityDatasetFunctionDeclaration: FunctionDeclaration = {
        name: "query_vulnerability_dataset",
        description: "Queries external vulnerability databases (NVD, EPSS) to fetch real-time data, CVSS scores, and known exploit vectors for a specific CVE.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cve_id: { type: Type.STRING, description: 'The standard identifier, e.g., "CVE-2024-1234"' },
          },
          required: ["cve_id"],
        },
      };

      const deployTemporaryMitigationFunctionDeclaration: FunctionDeclaration = {
        name: "deploy_temporary_mitigation",
        description: "Pushes a temporary security rule or script (like a firewall block or service termination) to the affected asset to prevent exploitation while a permanent patch is developed.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            target_asset: { type: Type.STRING, description: "The IP address or hostname of the vulnerable machine." },
            mitigation_payload: { type: Type.STRING, description: "The exact Bash command, iptables rule, or WAF configuration to execute." }
          },
          required: ["target_asset", "mitigation_payload"],
        },
      };

      const createPatchReviewTicketFunctionDeclaration: FunctionDeclaration = {
        name: "create_patch_review_ticket",
        description: "Submits a permanent code-level patch or system configuration change to the SOC dashboard for human review and deployment approval.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cve_id: { type: Type.STRING, description: "The vulnerability being patched." },
            proposed_fix_code: { type: Type.STRING, description: "The actual code diff, updated dependency manifest, or configuration file." },
            rollback_plan: { type: Type.STRING, description: "Instructions on how to revert the patch if it breaks the system." },
          },
          required: ["cve_id", "proposed_fix_code", "rollback_plan"],
        },
      };

      let prompt = userContent;
      if (contextDataToUse) {
        const severity = contextDataToUse.severity || contextDataToUse.event?.severity || 'Unknown';
        const eventType = contextDataToUse.event_type || contextDataToUse.event?.event_type || 'Unknown';
        const mitreTactic = contextDataToUse.mitre_tactic || 'Evaluating...';
        
        prompt = `
CRITICAL INCIDENT CONTEXT DETECTED:
- Event: ${eventType}
- Severity: ${severity}
- Source IP: ${contextDataToUse.source_ip || contextDataToUse.event?.source_ip || 'Internal'}
- Timestamp: ${contextDataToUse.timestamp || contextDataToUse.event?.timestamp || 'N/A'}
- MITRE ATT&CK Tactic: ${mitreTactic}
- Anomaly Score: ${contextDataToUse.score || contextDataToUse.event?.score || '0.00'}

DETAILED RAW DATA:
${JSON.stringify(contextDataToUse, null, 2)}

INSTRUCTIONS FOR Aegix AI Core:
1. Perform a deep, comparative analysis of this incident against historical data vectors.
2. Identify any patterns suggestive of persistent lateral movement or exfiltration.
3. If severity is Critical, explicitly cross-reference this with similar known campaigns (use searchChatHistory if needed).
4. Provide immediate remediation strategy for the specific actor identified.

USER MESSAGE: ${prompt}`;
      }

      const history = chatHistory.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        history: history,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: [
            searchChatHistoryFunctionDeclaration, 
            getRecentAlertsFunctionDeclaration, 
            getRecentLogsFunctionDeclaration, 
            getRecentNetworkConnectionsFunctionDeclaration,
            getAlertDetailsFunctionDeclaration,
            blockIpAddressFunctionDeclaration,
            runEDRScanFunctionDeclaration,
            patchCriticalVulnerabilitiesFunctionDeclaration,
            getPhase1ThreatsFunctionDeclaration,
            askQwen36PlusFunctionDeclaration,
            scanFileIntegrityFunctionDeclaration,
            analyzeProcessFunctionDeclaration,
            queryVulnerabilityDatasetFunctionDeclaration,
            deployTemporaryMitigationFunctionDeclaration,
            createPatchReviewTicketFunctionDeclaration
          ] }],
        }
      });

      let response = await chat.sendMessage({ message: prompt });

      let callCount = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
        const functionResponses = [];

        for (const call of response.functionCalls) {
          let functionResponseData: any = { error: "Function not found" };

          try {
            if (call.name === "searchChatHistory") {
              const query = call.args.query as string;
              const searchRes = await api.searchChatHistory(query);
              functionResponseData = searchRes.data;
            } else if (call.name === "getRecentAlerts") {
              const limit = (call.args.limit as number) || 5;
              const alertsRes = await api.getAlerts({ limit });
              functionResponseData = alertsRes.data;
            } else if (call.name === "getRecentLogs") {
              const limit = (call.args.limit as number) || 5;
              const logsRes = await api.getLogs({ limit });
              functionResponseData = logsRes.data;
            } else if (call.name === "getRecentNetworkConnections") {
              const limit = (call.args.limit as number) || 5;
              const networkRes = await api.getNetwork();
              functionResponseData = Array.isArray(networkRes.data) ? networkRes.data.slice(0, limit) : networkRes.data;
            } else if (call.name === "getAlertDetails") {
              const alertId = call.args.alertId as number;
              const contextRes = await api.getChatContext(alertId);
              functionResponseData = contextRes.data;
            } else if (call.name === "blockIpAddress") {
              const res = await api.blockIp(call.args.ip as string, call.args.reason as string || "Blocked by Chatbot", call.args.duration as number || 60);
              functionResponseData = { status: `IP ${call.args.ip} blocked successfully` };
              toast.error(`Aegix AI blocked IP: ${call.args.ip}`);
            } else if (call.name === "runEDRScan") {
              const res = await api.runEDRScan();
              functionResponseData = { status: "Scan complete", results: res.data };
              toast.success("Aegix AI initiated an EDR scan");
            } else if (call.name === "patchCriticalVulnerabilities") {
              const res = await api.remediateAllCriticalHigh();
              functionResponseData = { status: "Vulnerabilities patched successfully", results: res.data };
              toast.success("Aegix AI patched critical vulnerabilities");
            } else if (call.name === "getPhase1Threats") {
              const res = await api.getPhase1Threats();
              functionResponseData = { threats: res.data };
            } else if (call.name === "scanFileIntegrity") {
              const targetPath = call.args.targetPath as string;
              const res = await api.scanFileIntegrity(targetPath);
              functionResponseData = res.data;
              toast.success(`Aegix AI scanned file integrity for ${targetPath}`);
            } else if (call.name === "analyzeProcess") {
              const pid = call.args.pid as string;
              const processName = call.args.processName as string;
              const res = await api.analyzeProcess(pid, processName);
              functionResponseData = res.data;
              toast.success(`Aegix AI analyzing process ${pid}`);
            } else if (call.name === "askQwen36Plus") {
              const res = await api.askQwen(call.args.prompt as string);
              functionResponseData = { qwen_advice: res.data || res };
              toast.success("Consulted Qwen 3.6 Plus", { style: { background: '#000', color: '#8b5cf6', border: '1px solid #8b5cf6' }});
            } else if (call.name === "query_vulnerability_dataset") {
              const res = await api.queryVulnerabilityDataset(call.args.cve_id as string);
              functionResponseData = res.data;
              toast.success(`Aegix AI queried dataset for ${call.args.cve_id}`);
            } else if (call.name === "deploy_temporary_mitigation") {
              const res = await api.deployTemporaryMitigation(call.args.target_asset as string, call.args.mitigation_payload as string);
              functionResponseData = res.data;
              toast.success(`Aegix AI deployed mitigation to ${call.args.target_asset}`);
            } else if (call.name === "create_patch_review_ticket") {
              const res = await api.createPatchReviewTicket(call.args.cve_id as string, call.args.proposed_fix_code as string, call.args.rollback_plan as string);
              functionResponseData = res.data;
              toast.success(`Aegix AI created ticket for ${call.args.cve_id}`);
            }
          } catch (e: any) {
            functionResponseData = { error: e.message || "Failed to execute function" };
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: functionResponseData }
            }
          });
        }

        response = await chat.sendMessage({ message: functionResponses });
        
        callCount++;
      }

      let aiContent = response.text;
      
      if (!aiContent || (response.functionCalls && response.functionCalls.length > 0)) {
        try {
          response = await chat.sendMessage({ message: "Please provide a comprehensive summary and analysis based on the data you just gathered. Do not call any more functions. Just give me everything you know about the context with precise and accurate answers." });
          aiContent = response.text;
        } catch (e) {
        }
      }

      if (!aiContent) {
        aiContent = "I have analyzed the data, but I am having trouble formatting the response. Please check the raw logs or alerts for more details.";
      }

      // 4. Save AI message to history
      try {
        await api.saveChatHistory('assistant', aiContent);
      } catch (e) {
      }

      const aiMsg = { role: 'assistant', content: aiContent, created_at: new Date().toISOString() };
      setChatHistory(prev => [...prev, aiMsg]);
      
      if (contextData) onClearContext();
    } catch (err: any) {
      
      let errorMessage = "An unexpected error occurred while communicating with the AegixChain AI.";
      
      const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
      if (err?.message?.includes("API key not valid") || err?.status === 401 || err?.status === 403 || errStr.includes("API key not valid") || errStr.includes("401") || errStr.includes("403")) {
        errorMessage = "AegixChain AI Error: The API key is invalid or unauthorized. Please verify your Gemini API key in the environmental variables.";
      } else if (err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("quota") || err?.message?.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "AegixChain AI Error: Quota exceeded or rate limit reached. The free tier limits may have been exhausted. Please check your Google AI Studio billing details or wait until your quota resets.";
      } else if (err?.message?.includes("fetch failed") || err?.name === 'TypeError' || errStr.includes("fetch failed")) {
        errorMessage = "AegixChain AI Error: Network connection failed. Please check your internet connection or the status of the AI gateway.";
      } else if (err?.message?.includes("timeout")) {
        errorMessage = "AegixChain AI Error: The analysis timed out. The request was too complex or the model is under heavy load. Try breaking down your request.";
      }

      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `**System Alert:** ${errorMessage}\n\n*Suggested Actions:*\n- Verify API Configuration\n- Ensure network stability\n- Consult local system logs directly if issue persists.`, 
        created_at: new Date().toISOString() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const starterPrompts = [
    "Summarize today's alerts",
    "Explain the latest critical alert",
    "What IPs should I block?",
    "How do I stop brute force attacks?"
  ];

  return (
    <div className={`${isFloating ? 'h-full w-full' : 'h-[calc(100vh-120px)] w-full max-w-5xl mx-auto'} flex flex-col`}>
      <div className={`glass-panel bg-soc-surface border border-soc-border ${isFloating ? 'rounded-xl' : 'rounded-2xl shadow-2xl'} flex flex-col flex-1 overflow-hidden`}>
        {/* Header */}
        <div className="p-4 bg-soc-purple/10 border-b border-soc-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-soc-bg rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,229,192,0.4)] overflow-hidden relative">
              <AegixLogo className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-soc-text font-syne">Aegix AI Core</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-soc-cyan rounded-full animate-pulse shadow-[0_0_8px_#00e5c0]" />
                <span className="text-xs text-soc-muted uppercase font-bold tracking-wider font-mono">Ensemble Online</span>
              </div>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-soc-border rounded-full transition-colors text-soc-muted hover:text-soc-text">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-soc-bg/30">
          {chatHistory.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 mt-8">
              <div className="flex flex-col items-center justify-center mb-12 relative">
                <AegixLogo className="w-24 h-24" hideText={false} />
              </div>
              <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                {starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setMessage(prompt); }}
                    className="text-left p-4 text-sm text-soc-text bg-soc-surface border border-soc-border rounded-xl hover:border-soc-purple hover:bg-soc-purple/5 transition-all shadow-sm flex items-center justify-center h-full min-h-[80px]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-md overflow-hidden relative ${
                  msg.role === 'user' ? 'bg-soc-cyan' : 'bg-soc-surface border border-soc-border'
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5 text-soc-bg" /> : <AegixLogo className="w-8 h-8" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm shadow-sm ${
                  msg.role === 'user' ? 'bg-soc-cyan text-soc-bg rounded-tr-none' : 'bg-soc-surface border border-soc-border text-soc-text rounded-tl-none'
                }`}>
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <Markdown>
                      {msg.content}
                    </Markdown>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-soc-surface border border-soc-border flex items-center justify-center shadow-md overflow-hidden relative">
                  <AegixLogo className="w-8 h-8" />
                </div>
                <div className="p-4 bg-soc-surface border border-soc-border rounded-2xl rounded-tl-none flex gap-2 items-center shadow-sm">
                  <div className="w-2 h-2 bg-soc-purple rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-soc-purple rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-soc-purple rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-6 border-t border-soc-border bg-soc-surface">
          {contextData && (
            <div className="mb-4 p-3 bg-soc-cyan/10 border border-soc-cyan/30 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-soc-cyan" />
                <span className="text-xs font-bold text-soc-cyan uppercase tracking-wider">Analyzing Context: {contextData.id ? `Alert #${contextData.id}` : 'Log Event'}</span>
              </div>
              <button type="button" onClick={onClearContext} className="text-soc-cyan hover:text-soc-red transition-colors p-1 rounded-md hover:bg-soc-red/10">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1 flex">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Send a command or ask Aegix..."
                className="flex-1 w-full bg-soc-bg border border-soc-border rounded-xl py-3 pl-5 pr-14 text-sm focus:outline-none focus:border-soc-purple focus:ring-1 focus:ring-soc-purple transition-all h-[52px] shadow-inner"
              />
              <button
                type="submit"
                disabled={!message.trim() || isLoading}
                className="absolute right-2 top-2 bottom-2 p-2.5 flex items-center justify-center bg-soc-purple text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all shadow-md hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div id="voice-agent-container" className="flex items-center justify-center shrink-0 w-14 h-14"></div>
          </div>
        </form>
      </div>
    </div>
  );
}
