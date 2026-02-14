
import React, { useState } from 'react';
import { EboLens } from './components/EboLens';
import { PhoneDashboard } from './components/PhoneDashboard';
import { Zap, Smartphone, Glasses } from 'lucide-react';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [viewMode, setViewMode] = useState<'PHONE' | 'GLASSES'>('PHONE');

  if (!isActive) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-6 text-center font-mono-tech">
        <div className="mb-12 animate-pulse">
           <div className="w-24 h-24 rounded-full border-2 border-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)]">
             <Zap className="text-cyan-400" size={40} />
           </div>
        </div>
        <h1 className="text-2xl text-cyan-500 tracking-[0.3em] mb-4">EBO A-EYE</h1>
        <p className="text-gray-500 text-[10px] max-w-xs mb-12 uppercase tracking-widest leading-loose">
          Next-generation vision OS.<br/>Neural orchestration system.
        </p>
        <button 
          onClick={() => setIsActive(true)}
          className="px-8 py-3 bg-cyan-900/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all tracking-[0.4em] text-xs uppercase"
        >
          Initiate Core
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative">
      {viewMode === 'PHONE' ? (
        <PhoneDashboard onSwitchToGlasses={() => setViewMode('GLASSES')} onShutdown={() => setIsActive(false)} />
      ) : (
        <EboLens onClose={() => setViewMode('PHONE')} />
      )}
    </div>
  );
};

export default App;
