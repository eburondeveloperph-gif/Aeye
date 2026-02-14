
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Zap, Aperture, Camera, RefreshCw, Mic, Square, Loader2, StopCircle, Scan } from 'lucide-react';
import { analyzeMedia, generateProImage, transcribeAudioFile } from '../services/geminiService';

export const VisionStudio: React.FC = () => {
  const [mode, setMode] = useState<'SCAN' | 'DREAM'>('SCAN');
  const [isLive, setIsLive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  
  const [prompt, setPrompt] = useState('');
  const [genImage, setGenImage] = useState<string | null>(null);
  const [isDreaming, setIsDreaming] = useState(false);
  
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const getDevices = async () => {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    };
    getDevices();
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsLive(false);
    }
  };

  useEffect(() => {
    if (isLive && mode === 'SCAN') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isLive, mode, selectedDeviceId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      setFile(f);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreview(ev.target?.result as string);
        setIsLive(false);
      };
      reader.readAsDataURL(f);
    }
  };

  const captureSnapshot = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setPreview(dataUrl);
      // Create a dummy file object for analysis service requirements
      const blob = dataURItoBlob(dataUrl);
      setFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      setIsLive(false);
    }
  };

  const dataURItoBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  const executeScan = async () => {
    if (!preview || !file) return;
    setIsScanning(true);
    setScanResult('');
    try {
      const base64 = preview.split(',')[1];
      const res = await analyzeMedia(base64, file.type, "Identify and analyze objects, text, or context in this visual data.", file.type.startsWith('video'));
      setScanResult(res || "NO DATA.");
    } catch (err) { 
      setScanResult("SCAN FAILED. " + err); 
    } finally { 
      setIsScanning(false); 
    }
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
    <div className="h-full flex flex-col relative text-cyan-50 font-mono-tech overflow-hidden">
      {/* HUD Mode Switcher */}
      <div className="absolute top-4 right-4 z-30 flex flex-col gap-3">
         <button 
           onClick={() => setMode('DREAM')} 
           className={`p-3 rounded-full border transition-all ${mode === 'DREAM' ? 'border-cyan-500 bg-cyan-900/40 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'border-gray-800 bg-black/40 text-gray-600'}`}
           title="Dream Mode"
         >
            <Zap size={18} />
         </button>
         <button 
           onClick={() => setMode('SCAN')} 
           className={`p-3 rounded-full border transition-all ${mode === 'SCAN' ? 'border-cyan-500 bg-cyan-900/40 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'border-gray-800 bg-black/40 text-gray-600'}`}
           title="Scan Mode"
         >
            <Aperture size={18} />
         </button>
      </div>

      {mode === 'DREAM' ? (
        <div className="flex-1 flex flex-col justify-end p-6 z-10 relative">
          {genImage && (
             <div className="absolute inset-0 z-0 bg-black">
               <img src={genImage} className="w-full h-full object-contain" alt="Generated" />
               <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
             </div>
          )}
          
          <div className="relative z-10 bg-black/70 backdrop-blur-xl p-5 rounded-2xl border border-cyan-900/50 shadow-2xl">
             <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] text-cyan-400 uppercase tracking-[0.3em]">Neural Dream Engine</label>
                <button 
                  onClick={isRecordingVoice ? stopVoice : startVoice} 
                  className={`p-2 rounded-full transition-all ${isRecordingVoice ? 'bg-red-500 animate-pulse' : 'bg-cyan-900/30 text-cyan-400 hover:bg-cyan-500/20'}`}
                >
                  {isRecordingVoice ? <StopCircle size={16} /> : <Mic size={16} />}
                </button>
             </div>
             <textarea 
               value={isTranscribing ? "ORCHESTRATING VOICE..." : prompt} 
               onChange={(e) => setPrompt(e.target.value)} 
               disabled={isTranscribing || isDreaming}
               className="w-full bg-transparent border-none text-white focus:outline-none text-base placeholder-gray-600 resize-none mb-4 min-h-[60px]"
               placeholder="Whisper your vision..."
             />
             <button 
               onClick={executeDream} 
               disabled={isDreaming || !prompt} 
               className="w-full py-3 bg-cyan-500/10 border border-cyan-500/40 rounded-xl text-cyan-400 text-xs font-bold tracking-widest hover:bg-cyan-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-20"
             >
               {isDreaming ? <Loader2 className="animate-spin" size={16}/> : <Zap size={16}/>} 
               {isDreaming ? "ARCHITECTING..." : "REALIZE VISION"}
             </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col z-10 overflow-hidden">
          {/* Main Visual Display */}
          <div className="flex-1 relative bg-black flex items-center justify-center group">
             {isLive ? (
               <div className="w-full h-full relative">
                 <video 
                   ref={videoRef} 
                   autoPlay 
                   playsInline 
                   className="w-full h-full object-cover grayscale-[0.3] contrast-125"
                 />
                 {/* Camera Overlays */}
                 <div className="absolute inset-0 pointer-events-none border-[1px] border-cyan-500/10 m-8" />
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-[0.5px] border-cyan-500/20 rounded-full" />
                 
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
                    <button 
                      onClick={captureSnapshot} 
                      className="w-16 h-16 rounded-full bg-white/10 border-4 border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                    >
                      <div className="w-12 h-12 bg-white rounded-full" />
                    </button>
                 </div>
               </div>
             ) : preview ? (
               <div className="w-full h-full relative">
                 <img src={preview} className="w-full h-full object-cover opacity-80" alt="Preview" />
                 <button 
                   onClick={() => setIsLive(true)}
                   className="absolute top-4 left-4 p-2 bg-black/60 rounded-full text-cyan-400 border border-cyan-900/50"
                 >
                   <RefreshCw size={16} />
                 </button>
               </div>
             ) : (
               <div className="flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full border border-dashed border-cyan-900 flex items-center justify-center text-cyan-900">
                    <Camera size={40} />
                  </div>
                  <button 
                    onClick={() => setIsLive(true)}
                    className="px-6 py-2 bg-cyan-900/20 border border-cyan-500/30 text-cyan-400 text-xs tracking-widest rounded-full hover:bg-cyan-500/10 transition-all"
                  >
                    INITIATE OPTICS
                  </button>
                  <label className="cursor-pointer text-[10px] text-gray-600 hover:text-cyan-400 transition-colors uppercase tracking-widest">
                    OR UPLOAD ARCHIVE
                    <input type="file" onChange={handleFile} className="hidden" />
                  </label>
               </div>
             )}
             
             {isScanning && (
               <div className="absolute inset-0 bg-cyan-500/5 backdrop-blur-[1px] flex items-center justify-center overflow-hidden">
                 <div className="w-full h-[2px] bg-cyan-500/50 shadow-[0_0_20px_cyan] animate-[scan_2s_ease-in-out_infinite]" />
               </div>
             )}
          </div>

          {/* Analysis Result Panel */}
          <div className="h-[40%] bg-[#020617] border-t border-cyan-900/30 p-6 flex flex-col overflow-hidden">
             <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  {/* Fixed error: ScanLine was not imported; using Scan from lucide-react instead */}
                  <Scan size={14} className="text-cyan-500" />
                  <span className="text-[10px] text-cyan-500 tracking-[0.4em] uppercase">Visual Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  {devices.length > 1 && (
                    <select 
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="bg-black/50 border border-cyan-900/50 text-[10px] text-cyan-700 px-2 py-1 rounded outline-none"
                    >
                      {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                      ))}
                    </select>
                  )}
                  <button 
                    onClick={executeScan} 
                    disabled={!preview || isScanning} 
                    className="text-[10px] font-bold text-cyan-400 border border-cyan-500/30 bg-cyan-500/5 px-4 py-1.5 rounded-full hover:bg-cyan-500/10 disabled:opacity-20 transition-all"
                  >
                    {isScanning ? "RECOGNIZING..." : "EXECUTE SCAN"}
                  </button>
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               {scanResult ? (
                 <p className="text-xs text-slate-300 leading-relaxed font-light">{scanResult}</p>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-700 italic text-[10px]">
                   Awaiting visual capture for synchronization...
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { transform: translateY(-50vh); }
          100% { transform: translateY(50vh); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.2);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
