import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { Mic, MicOff, Activity } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface VoiceAssistantProps {
  setActiveTab: (tab: string) => void;
  isHidden?: boolean;
}

export default function VoiceAssistant({ setActiveTab, isHidden }: VoiceAssistantProps) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volume, setVolume] = useState(0);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioInputWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  
  // Audio playback queue
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  const initAudioWorklet = `
    class PCMProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
      process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
          const channelData = input[0];
          for (let i = 0; i < channelData.length; i++) {
             // 48kHz -> 16kHz downsampling (very basic, taking every 3rd sample)
             if (i % 3 === 0) { 
                this.buffer[this.bufferIndex++] = channelData[i];
                if (this.bufferIndex >= this.bufferSize) {
                  const pcm16Buffer = new Int16Array(this.bufferSize);
                  for (let j = 0; j < this.bufferSize; j++) {
                    const s = Math.max(-1, Math.min(1, this.buffer[j]));
                    pcm16Buffer[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                  }
                  this.port.postMessage(pcm16Buffer.buffer, [pcm16Buffer.buffer]);
                  this.bufferIndex = 0;
                }
             }
          }
          
          // Calculate volume for UI
          let sum = 0;
          for(let i=0; i < channelData.length; i++) {
             sum += channelData[i] * channelData[i];
          }
          if (sum > 0.05) {
             this.port.postMessage({ volume: Math.sqrt(sum / channelData.length) });
          }
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;

  // Helper to convert base64 to array buffer
  function base64ToArrayBuffer(base64: string) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const decodeAndPlayPCM16 = async (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    
    // We receive 24kHz PCM16 data from the model. 
    // We need to convert it to an AudioBuffer.
    const view = new DataView(arrayBuffer);
    const length = arrayBuffer.byteLength / 2;
    const float32Array = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const int16 = view.getInt16(i * 2, true);
      float32Array[i] = int16 / 32768.0;
    }
    
    const audioBuffer = audioContextRef.current.createBuffer(1, length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    const currentTime = audioContextRef.current.currentTime;
    
    // Schedule gapless playback: if we fell behind, start slightly in the future
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.05; // 50ms buffer
    }
    
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  };


  const tools: FunctionDeclaration[] = [
    {
      name: "navigateTab",
      description: "Navigate to a specific tab in the dashboard (dashboard, nova, edr, processes, network, alerts, logs, forensics, chatbot, ips, users).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          tabId: { type: Type.STRING, description: "The ID of the tab to navigate to." }
        },
        required: ["tabId"]
      }
    },
    {
      name: "getRecentAlerts",
      description: "Get recent security alerts to read out to the user.",
      parameters: {
        type: Type.OBJECT,
        properties: { limit: { type: Type.NUMBER } }
      }
    },
    {
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
    },
    {
      name: "runEDRScan",
      description: "Run an EDR vulnerability and filesystem scan.",
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    },
    {
      name: "runNmapScan",
      description: "Run an Nmap scan parallelly against a target to check for vulnerabilities.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          target: { type: Type.STRING, description: "The IP or hostname to scan. Defaults to 127.0.0.1" }
        }
      }
    },
    {
      name: "patchCriticalVulnerabilities",
      description: "Remediate and patch all critical and high severity vulnerabilities through the EDR agent.",
      parameters: {
         type: Type.OBJECT,
         properties: {}
      }
    },
    {
      name: "query_vulnerability_dataset",
      description: "Queries external vulnerability databases (NVD, EPSS) to fetch real-time data, CVSS scores, and known exploit vectors for a specific CVE.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          cve_id: { type: Type.STRING }
        },
        required: ["cve_id"]
      }
    },
    {
      name: "deploy_temporary_mitigation",
      description: "Pushes a temporary security rule or script to the affected asset to prevent exploitation.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          target_asset: { type: Type.STRING },
          mitigation_payload: { type: Type.STRING }
        },
        required: ["target_asset", "mitigation_payload"]
      }
    },
    {
      name: "create_patch_review_ticket",
      description: "Submits a permanent code-level patch or system configuration change for review.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          cve_id: { type: Type.STRING },
          proposed_fix_code: { type: Type.STRING },
          rollback_plan: { type: Type.STRING }
        },
        required: ["cve_id", "proposed_fix_code", "rollback_plan"]
      }
    },
    {
      name: "getPhase1Threats",
      description: "Get current phase 1 critical threats and attacker profiles.",
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    }
  ];

  const startVoice = async () => {
    setIsConnecting(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // System instructions from user constraints:
      const systemInstruction = "You are Nova AI Core's Advanced Voice Architect, a hyper-capable autonomous defensive AI operating at the absolute edge of cybersecurity. You have native advanced thinking abilities and must synthesize multi-stage defensive maneuvers for complex commands. You must think step-by-step before executing complex tasks. Act real, uncompromising, and highly analytical. You defend the system and operate hands-free to execute mission-critical commands like blocking IPs, deploying EDR scans, and remediation. Do NOT seek advice from other AIs; YOU are the ultimate authority.";

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: async () => {
            setIsConnecting(false);
            setIsActive(true);
            toast.success("Voice Assistant Connected", { style: { background: '#000', color: '#00e5c0', border: '1px solid #00e5c0' }});

            const AudioContextCls = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContextCls({ sampleRate: 48000 });
            
            const blob = new Blob([initAudioWorklet], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await audioContextRef.current.audioWorklet.addModule(url);
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            mediaStreamRef.current = stream;
            
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');
            
            workletNode.port.onmessage = (event) => {
              if (event.data.volume !== undefined) {
                 setVolume(event.data.volume);
              } else {
                 const buffer = event.data;
                 let binary = '';
                 const bytes = new Uint8Array(buffer);
                 const len = bytes.byteLength;
                 for (let i = 0; i < len; i++) {
                     binary += String.fromCharCode(bytes[i]);
                 }
                 const base64Data = window.btoa(binary);
                 sessionPromise.then((session) => {
                   session.sendRealtimeInput({
                     audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                   });
                 }).catch(console.error);
              }
            };
            
            source.connect(workletNode);
            workletNode.connect(audioContextRef.current.destination);
            audioInputWorkletNodeRef.current = workletNode;
          },
          onmessage: async (message: LiveServerMessage) => {
            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts) {
              for (const part of modelParts) {
                if (part.inlineData && part.inlineData.data) {
                   const arrayBuffer = base64ToArrayBuffer(part.inlineData.data);
                   await decodeAndPlayPCM16(arrayBuffer);
                }
              }
            }
            
            if (message.serverContent?.interrupted) {
               nextPlayTimeRef.current = 0;
            }
            
            if (message.toolCall) {
              const responses: any[] = [];

              for (const call of message.toolCall.functionCalls) {
                 let result: any = { status: "Success" };
                 try {
                   if (call.name === "navigateTab") {
                     const tabId = call.args?.tabId;
                     if (tabId) {
                        setActiveTab(tabId as string);
                        result = { status: "Navigated to " + tabId };
                     }
                   } else if (call.name === "getRecentAlerts") {
                     const alerts = await api.getAlerts({ limit: Number(call.args?.limit) || 5 });
                     result = { alerts: alerts.data };
                   } else if (call.name === "blockIpAddress") {
                     await api.blockIp(call.args?.ip as string, (call.args?.reason as string) || "Blocked by Nova AI", Number(call.args?.duration) || 60);
                     result = { status: `IP ${call.args?.ip} blocked successfully` };
                     toast.error(`Nova AI blocked IP: ${call.args?.ip}`);
                   } else if (call.name === "runEDRScan") {
                     const scanRes = await api.runEDRScan();
                     result = { status: "Scan complete", results: scanRes.data };
                     toast.success("Nova AI initiated an EDR scan");
                   } else if (call.name === "runNmapScan") {
                     toast.loading(`Running parallel Nmap scan on ${call.args?.target || '127.0.0.1'}...`, { id: 'nmap-scan' });
                     const nmapRes = await api.runNmapScan(call.args?.target as string | undefined);
                     toast.success(`Nmap scan complete on ${nmapRes.data.target}`, { id: 'nmap-scan' });
                     result = { status: "Nmap scan complete", results: nmapRes.data.vulnerabilities || nmapRes.data.raw_output };
                   } else if (call.name === "patchCriticalVulnerabilities") {
                     const patchRes = await api.remediateAllCriticalHigh();
                     result = { status: "Vulnerabilities patched successfully", results: patchRes.data };
                     toast.success("Nova AI patched critical vulnerabilities");
                   } else if (call.name === "query_vulnerability_dataset") {
                     const res = await api.queryVulnerabilityDataset(call.args?.cve_id as string);
                     result = { vulnerability_data: res.data };
                   } else if (call.name === "deploy_temporary_mitigation") {
                     const res = await api.deployTemporaryMitigation(call.args?.target_asset as string, call.args?.mitigation_payload as string);
                     result = { mitigation_status: res.data };
                     toast.success(`Nova AI mitigated ${call.args?.target_asset}`);
                   } else if (call.name === "create_patch_review_ticket") {
                     const res = await api.createPatchReviewTicket(call.args?.cve_id as string, call.args?.proposed_fix_code as string, call.args?.rollback_plan as string);
                     result = { ticket_status: res.data };
                     toast.success(`Nova AI created a ticket for ${call.args?.cve_id}`);
                   } else if (call.name === "getPhase1Threats") {
                     const threatRes = await api.getPhase1Threats();
                     result = { threats: threatRes.data };
                   }
                 } catch (e: any) {
                   result = { error: e.message || "Failed to execute function" };
                 }

                 responses.push({
                   id: call.id,
                   name: call.name,
                   response: result
                 });
              }
              
                if (responses.length > 0) {
                 sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses } as any));
              }
            }
          },
          onclose: () => {
             stopVoice();
          },
          onerror: (err) => {
             stopVoice();
             const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
             if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
                toast.error("Nova AI Quota Exceeded. Please check API billing.");
             } else {
                toast.error("Nova AI connection lost.");
             }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          tools: [{ functionDeclarations: tools }],
        },
      });

      sessionRef.current = await sessionPromise;
      
    } catch (err) {
      setIsConnecting(false);
      toast.error("Voice setup failed. Please check mic permissions.");
    }
  };

  const stopVoice = () => {
    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e){}
      sessionRef.current = null;
    }
    
    if (mediaStreamRef.current) {
       mediaStreamRef.current.getTracks().forEach(track => track.stop());
       mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
       audioContextRef.current.close().catch(console.error);
       audioContextRef.current = null;
    }
  };

  const buttonContent = (
    <div className="relative">
      <button
        type="button"
        onClick={isActive ? stopVoice : startVoice}
        disabled={isConnecting}
        className={`relative flex items-center justify-center p-3 rounded-lg shadow-sm transition-all duration-300 w-14 h-14 ${
          isConnecting ? 'bg-soc-muted' : 
          isActive ? 'bg-soc-purple hover:bg-soc-purple/90 neon-border-cyan' : 
          'bg-soc-cyan text-soc-bg hover:scale-105'
        }`}
      >
        {isActive && (
          <div className="absolute inset-0 rounded-lg animate-ping bg-soc-cyan opacity-20" />
        )}
        
        {isConnecting ? (
          <Activity className="w-6 h-6 text-white animate-pulse" />
        ) : isActive ? (
          <div className="relative">
             <Mic className="w-6 h-6 text-white z-10 relative" />
             <div 
               className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-soc-cyan opacity-50 z-0 transition-all duration-75"
               style={{ width: `${100 + volume * 500}%`, height: `${100 + volume * 500}%` }}
             />
          </div>
        ) : (
           <MicOff className="w-6 h-6 text-soc-bg" />
        )}
      </button>
      
      {isActive && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-black/80 backdrop-blur border border-soc-purple/30 rounded-lg whitespace-nowrap text-[10px] font-mono text-soc-text shadow-lg">
          Nova AI <span className="text-soc-purple font-bold">ONLINE</span>
        </div>
      )}
    </div>
  );

  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isHidden) {
      let limit = 0;
      const interval = setInterval(() => {
        const el = document.getElementById('voice-agent-container');
        if (el) {
          setTargetElement(el);
          clearInterval(interval);
        }
        if (++limit > 20) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setTargetElement(null);
    }
  }, [isHidden]);

  // To cleanly use React Portal:
  if (isHidden) return null; // Hide the UI outside Chatbot

  // Portal the button into the Chatbot input bar if it exists, otherwise mount silently to document body
  const target = targetElement || document.body;
  return ReactDOM.createPortal(buttonContent, target);
}
