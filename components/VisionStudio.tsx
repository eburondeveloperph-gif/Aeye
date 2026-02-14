
import React, { useState, useRef } from 'react';
import { Upload, Zap, Aperture, ScanLine, Mic, Square, Loader2 } from 'lucide-react';
import { analyzeMedia, generateProImage, transcribeAudioFile } from '../services/geminiService';

export const VisionStudio: React.FC = () => {
  const [mode, setMode] = useState<'SCAN' | 'DREAM'>('DREAM');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genImage, setGenImage] = useState<string | null>(null);
  const [isDreaming, setIsDreaming] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      setFile(f);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    }
  };

  const executeScan = async () => {
    if (!preview || !file) return;
    setIsScanning(true);
    try {
      const base64 = preview.split(',')[1];
      const res = await analyzeMedia(base64, file.type, "Analyze visual data.", file.type.startsWith('video'));
      setScanResult(res || "NO DATA.");
    } catch { setScanResult("SCAN FAILED."); }
    finally { setIsScanning(false); }
  };

  const executeDream = async () => {
    if (!prompt) return;
    setIsDreaming(true);
    try {
      const res = await generateProImage(prompt, '1K');
      setGenImage(res);
    } catch { alert("GEN FAILED"); }
    finally { setIsDreaming(false); }
  };

  const startVoice = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(s);
      mediaRecorderRef.current = r;
      audioChunksRef.current = [];
      r.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      r.onstop = async () => {
        const b = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        s.getTracks().forEach(t => t.stop());
        setIsTranscribing(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          const text = await transcribeAudioFile((reader.result as string).split(',')[1], 'audio/webm');
          if (text) setPrompt(text.trim());
          setIsTranscribing(false);
        };
        reader.readAsDataURL(b);
      };
      r.start();
      setIsRecordingVoice(true);
    } catch { console.error("Mic error"); }
  };

  const stopVoice = () => {
    mediaRecorderRef.current?.stop();
    setIsRecordingVoice(false);
  };

  return (
    <div className="h-full flex flex-col relative text-cyan-50 font-mono-tech">
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
         <button onClick={() => setMode('DREAM')} className={`p-2 rounded border ${mode === 'DREAM' ? 'border-cyan-500 bg-cyan-900/20 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'border-gray-800 text-gray-600'}`}>
            <Zap size={16} />
         </button>
         <button onClick={() => setMode('SCAN')} className={`p-2 rounded border ${mode === 'SCAN' ? 'border-cyan-500 bg-cyan-900/20 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'border-gray-800 text-gray-600'}`}>
            <Aperture size={16} />
         </button>
      </div>

      {mode === 'DREAM' ? (
        <div className="flex-1 flex flex-col justify-end p-6 z-10">
          {genImage && (
             <div className="absolute inset-0 z-0 opacity-80"><img src={genImage} className="w-full h-full object-cover" /></div>
          )}
          <div className="relative z-10 bg-black/60 backdrop-blur p-4 rounded-lg border border-cyan-900/50">
             <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] text-cyan-400 uppercase tracking-widest">Visual Cortex</label>
                <button onClick={isRecordingVoice ? stopVoice : startVoice} className={`p-2 rounded-full ${isRecordingVoice ? 'bg-red-500 animate-pulse' : 'text-cyan-400 hover:bg-cyan-900/50'}`}>
                  {isRecordingVoice ? <Square size={14} /> : <Mic size={14} />}
                </button>
             </div>
             <textarea 
               value={isTranscribing ? "TRANSCRIBING..." : prompt} 
               onChange={(e) => setPrompt(e.target.value)} 
               disabled={isTranscribing}
               className="w-full bg-transparent border-none text-white focus:outline-none text-sm resize-none mb-2"
               rows={2}
               placeholder="Visual prompt..."
             />
             <button onClick={executeDream} disabled={isDreaming || !prompt} className="w-full py-2 bg-cyan-900/40 border border-cyan-500/50 text-cyan-300 text-xs flex items-center justify-center gap-2">
               {isDreaming ? <Loader2 className="animate-spin" size={14}/> : <Zap size={14}/>} {isDreaming ? "RENDERING..." : "GENERATE"}
             </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col z-10">
          <div className="flex-1 relative bg-gray-900/20 flex items-center justify-center cursor-pointer">
             {preview ? <img src={preview} className="w-full h-full object-cover opacity-60" /> : <Upload size={32} className="opacity-20"/>}
             <input type="file" onChange={handleFile} className="absolute inset-0 opacity-0 cursor-pointer" />
             {isScanning && <div className="absolute inset-0 bg-cyan-500/10 flex items-center justify-center"><div className="w-full h-1 bg-cyan-500 animate-pulse shadow-[0_0_15px_cyan]"></div></div>}
          </div>
          <div className="h-1/3 bg-black/80 border-t border-cyan-900/50 p-4 overflow-y-auto">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-cyan-500">ANALYSIS</span>
                <button onClick={executeScan} disabled={!file || isScanning} className="text-xs text-cyan-400 border border-cyan-900 px-2 py-1">SCAN</button>
             </div>
             <p className="text-xs text-green-400 leading-relaxed">{scanResult || "Waiting..."}</p>
          </div>
        </div>
      )}
    </div>
  );
};
