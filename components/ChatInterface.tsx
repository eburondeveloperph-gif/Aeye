import React, { useState, useRef, useEffect } from 'react';
import { Send, MapPin, Search, Zap, Brain, Loader2, Volume2, ArrowRight } from 'lucide-react';
import { ChatMessage, ChatModelType } from '../types';
import { sendChatMessage, generateSpeech, decodeAudioData } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: "SYSTEM ONLINE. EBO AI READY. AWAITING INPUT.",
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ChatModelType>(ChatModelType.FAST);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      const result = await sendChatMessage(userMsg.text, mode, history);
      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: result.response.text || "NO DATA RECEIVED.",
        timestamp: Date.now(),
        groundingMetadata: result.response.candidates?.[0]?.groundingMetadata
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "SYSTEM ERROR: CONNECTION INTERRUPTED.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTTS = async (text: string) => {
    try {
      const base64Audio = await generateSpeech(text);
      if (base64Audio) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        const buffer = await decodeAudioData(base64Audio, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (e) { console.error(e); }
  };

  const renderGrounding = (metadata: any) => {
    if (!metadata?.groundingChunks) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-2 opacity-80">
        {metadata.groundingChunks.map((chunk: any, i: number) => 
          chunk.web ? (
            <a key={i} href={chunk.web.uri} target="_blank" className="text-[10px] text-cyan-300 border border-cyan-800 px-1 rounded hover:bg-cyan-900/50">
              [{chunk.web.title}]
            </a>
          ) : null
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Mode Status Line (HUD Style) */}
      <div className="absolute top-0 left-0 w-full h-8 border-b border-white/5 flex items-center justify-between px-4 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-4 text-[10px] font-mono-tech text-cyan-500/60">
           <button onClick={() => setMode(ChatModelType.FAST)} className={mode === ChatModelType.FAST ? "text-cyan-400 text-glow" : "hover:text-cyan-400"}>[FAST]</button>
           <button onClick={() => setMode(ChatModelType.SMART)} className={mode === ChatModelType.SMART ? "text-purple-400 text-glow" : "hover:text-purple-400"}>[THINK]</button>
           <button onClick={() => setMode(ChatModelType.SEARCH)} className={mode === ChatModelType.SEARCH ? "text-blue-400 text-glow" : "hover:text-blue-400"}>[NET]</button>
           <button onClick={() => setMode(ChatModelType.MAPS)} className={mode === ChatModelType.MAPS ? "text-green-400 text-glow" : "hover:text-green-400"}>[LOC]</button>
        </div>
        <div className="text-[10px] text-gray-500 font-mono-tech">
           {isLoading ? "PROCESSING..." : "IDLE"}
        </div>
      </div>

      {/* Chat Log (Floating Text) */}
      <div className="flex-1 overflow-y-auto p-4 pt-12 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end text-right' : 'items-start text-left'}`}>
            <span className="text-[9px] font-mono-tech text-gray-600 mb-1 tracking-widest uppercase">
              {msg.role === 'user' ? '>> PILOT' : '>> EBO'} {new Date(msg.timestamp).toLocaleTimeString([],{hour12:false})}
            </span>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-white' : 'text-cyan-100'} text-sm md:text-base leading-relaxed font-light`}>
              <div className="prose prose-invert prose-sm">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
              {renderGrounding(msg.groundingMetadata)}
              {msg.role === 'model' && (
                 <button onClick={() => handleTTS(msg.text)} className="mt-1 opacity-50 hover:opacity-100"><Volume2 size={12} /></button>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-cyan-500/50 text-xs font-mono-tech animate-pulse flex items-center gap-2">
            <Loader2 size={12} className="animate-spin"/> COMPUTING RESPONSE...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Line (Terminal Style) */}
      <div className="p-4 bg-black/60 backdrop-blur-md border-t border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-cyan-500 animate-pulse">{'>'}</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="ENTER COMMAND OR QUERY..."
            className="flex-1 bg-transparent border-none outline-none text-white font-mono-tech text-sm placeholder-gray-700"
            autoFocus
          />
          <button onClick={handleSend} disabled={!input} className="text-cyan-500 disabled:opacity-30">
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
