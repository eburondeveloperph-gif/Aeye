
import React, { useState } from 'react';
import { EboLens } from './components/EboLens';
import { Zap } from 'lucide-react';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);

  if (!isActive) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-6 text-center font-mono-tech">
        <div className="mb-12 animate-pulse">
           <div className="w-24 h-24 rounded-full border-2 border-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)]">
             <Zap className="text-cyan-400" size={40} />
           </div>
        </div>
        <h1 className="text-2xl text-cyan-500 tracking-[0.3em] mb-4">EBO A-EYE</h1>
        <p className="text-gray-500 text-xs max-w-xs mb-12 uppercase leading-loose">
          Next-generation vision OS. Voice-first orchestration.
        </p>
        <button 
          onClick={() => setIsActive(true)}
          className="px-8 py-3 bg-cyan-900/30 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 transition-all tracking-widest text-sm"
        >
          INITIATE SYSTEM
        </button>
      </div>
    );
  }

  return <EboLens onClose={() => setIsActive(false)} />;
};

export default App;
