
import React, { useState } from 'react';
import { ChatInterface } from './ChatInterface';
import { VisionStudio } from './VisionStudio';
import { AudioScribe } from './AudioScribe';
import { MessageSquare, Scan, Mic2, Glasses, LogOut } from 'lucide-react';

interface PhoneDashboardProps {
  onSwitchToGlasses: () => void;
  onShutdown: () => void;
}

export const PhoneDashboard: React.FC<PhoneDashboardProps> = ({ onSwitchToGlasses, onShutdown }) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'VISION' | 'AUDIO'>('CHAT');

  return (
    <div className="flex flex-col h-full bg-[#020617] text-slate-200 font-sans">
      {/* Header */}
      <header className="p-4 pt-8 border-b border-cyan-900/30 bg-black/40 backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_cyan]" />
          <h1 className="text-xs font-mono-tech tracking-[0.3em] text-cyan-500">EBO_MOBILE_IFACE</h1>
        </div>
        <button 
          onClick={onShutdown}
          className="p-2 text-slate-500 hover:text-red-400 transition-colors"
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full w-full">
          {activeTab === 'CHAT' && <ChatInterface />}
          {activeTab === 'VISION' && <VisionStudio />}
          {activeTab === 'AUDIO' && <AudioScribe />}
        </div>
      </main>

      {/* Bottom Actions & Navigation */}
      <footer className="bg-black/80 backdrop-blur-xl border-t border-cyan-900/30 pb-safe">
        {/* Glasses Quick Launch */}
        <div className="px-4 py-3 border-b border-cyan-900/10 flex justify-center">
          <button 
            onClick={onSwitchToGlasses}
            className="flex items-center gap-3 px-6 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 transition-all text-[10px] tracking-[0.2em] font-mono-tech uppercase"
          >
            <Glasses size={14} />
            Link Eyeglasses View
          </button>
        </div>

        {/* Tab Bar */}
        <nav className="flex justify-around p-2">
          <button 
            onClick={() => setActiveTab('CHAT')}
            className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'CHAT' ? 'text-cyan-400 scale-110' : 'text-slate-600'}`}
          >
            <MessageSquare size={20} />
            <span className="text-[9px] uppercase tracking-widest font-mono-tech">Chat</span>
          </button>
          <button 
            onClick={() => setActiveTab('VISION')}
            className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'VISION' ? 'text-cyan-400 scale-110' : 'text-slate-600'}`}
          >
            <Scan size={20} />
            <span className="text-[9px] uppercase tracking-widest font-mono-tech">Vision</span>
          </button>
          <button 
            onClick={() => setActiveTab('AUDIO')}
            className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'AUDIO' ? 'text-cyan-400 scale-110' : 'text-slate-600'}`}
          >
            <Mic2 size={20} />
            <span className="text-[9px] uppercase tracking-widest font-mono-tech">Scribe</span>
          </button>
        </nav>
      </footer>
    </div>
  );
};
