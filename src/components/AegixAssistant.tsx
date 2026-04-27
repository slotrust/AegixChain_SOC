import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { Bot, User, Mic, Send, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { toast } from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AegixAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // A simple static session ID for the demo
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const query = input.trim();
    setInput('');
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await api.askAssistant(query, sessionId);
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.data.reply,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to get response from Aegix Assistant');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '*Error:* Connection to the SOC Assistant failed. Please check network connectivity or API key configuration.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeechToText = () => {
    // Simple Web Speech API implementation
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setIsListening(true);
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    
    recognition.onerror = (event: any) => {
      console.error(event.error);
      toast.error(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognition.start();
  };

  const suggestPrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-[600px] border border-soc-border rounded-xl bg-black/40 overflow-hidden">
      {/* Header */}
      <div className="bg-soc-purple/10 border-b border-soc-purple/30 p-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-soc-purple/20 flex items-center justify-center border border-soc-purple/50 shadow-[0_0_15px_rgba(147,51,234,0.3)]">
             <Bot className="w-6 h-6 text-soc-purple" />
          </div>
          <div>
            <h3 className="font-bold text-lg font-syne text-soc-purple">Aegix Operator Assistant</h3>
            <p className="text-[10px] uppercase tracking-widest text-soc-purple/70 font-mono">Conversational AI Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
           <span className="w-2 h-2 rounded-full bg-soc-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse"></span>
           <span className="text-soc-cyan">Online</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-70">
            <Bot className="w-16 h-16 text-soc-purple/50" />
            <div className="space-y-2">
              <h4 className="text-soc-text font-syne text-xl">How can I assist you today?</h4>
              <p className="text-soc-muted font-mono text-sm max-w-sm">
                Interact with the SOC via natural language. I can analyze recent threats, recall memory, and execute defensive patterns.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg mt-8">
              {[
                "What is the current threat status?",
                "Are there any active persistence mechanisms?",
                "Summarize today's critical alerts",
                "Explain the most recent MITRE mapped technique"
              ].map(prompt => (
                <button 
                  key={prompt}
                  onClick={() => suggestPrompt(prompt)}
                  className="bg-soc-bg border border-soc-border hover:border-soc-purple/50 hover:bg-soc-purple/10 p-3 rounded-lg text-left text-xs font-mono text-soc-text transition-all"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 max-w-[85%] \${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border \${
                  msg.role === 'user' 
                    ? 'bg-soc-cyan/20 border-soc-cyan/50 text-soc-cyan' 
                    : 'bg-soc-purple/20 border-soc-purple/50 text-soc-purple'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                
                <div className={`p-4 rounded-xl \${
                  msg.role === 'user'
                    ? 'bg-soc-cyan/10 border border-soc-cyan/20 text-soc-cyan'
                    : 'bg-soc-bg border border-soc-border text-soc-text markdown-body'
                }`}>
                  {msg.role === 'user' ? (
                    <div className="text-sm">{msg.content}</div>
                  ) : (
                    <div className="text-sm prose prose-invert max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                  <div className="text-[9px] mt-2 opacity-50 font-mono tracking-widest text-right">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 max-w-[85%]">
             <div className="w-8 h-8 rounded-full bg-soc-purple/20 border border-soc-purple/50 flex items-center justify-center shrink-0">
               <RefreshCw className="w-4 h-4 text-soc-purple animate-spin" />
             </div>
             <div className="p-4 rounded-xl bg-soc-bg border border-soc-border flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-soc-purple animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-soc-purple animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 rounded-full bg-soc-purple animate-bounce" style={{ animationDelay: '300ms' }}></span>
             </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-soc-border bg-soc-bg shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            onClick={handleSpeechToText}
            className={`p-3 rounded-lg border transition-colors \${
              isListening ? 'bg-soc-red/20 border-soc-red text-soc-red animate-pulse' : 'bg-soc-bg border-soc-border text-soc-muted hover:border-soc-cyan/50 hover:text-soc-cyan'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query system intelligence... e.g. 'Show recent attacks'"
            className="flex-1 bg-black/40 border border-soc-border rounded-lg px-4 py-3 text-sm text-soc-text focus:outline-none focus:border-soc-cyan focus:ring-1 focus:ring-soc-cyan transition-all"
            disabled={isLoading}
          />
          
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-soc-cyan text-black px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-[#08d9f9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
