
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, type FunctionDeclaration, Type } from "@google/genai";
import { NavigationData } from '../types';

// --- Audio Helpers ---
function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createAudioBlob(data: Float32Array): any {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
  return { 
    data: encodeBase64(new Uint8Array(int16.buffer)), 
    mimeType: 'audio/pcm;rate=16000' 
  };
}

async function decodeAudioData(base64Data: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- ORCHESTRATOR TOOLS ---
const toolsDef = [
  {
    functionDeclarations: [
      {
        name: "startNavigation",
        description: "Start navigation mode when user asks for directions, location, or 'way to'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            destination: { type: Type.STRING, description: "The target location name" },
            estimatedDistance: { type: Type.STRING, description: "Estimated distance (e.g. 2.4 miles)" },
            direction: { type: Type.STRING, description: "Direction to turn: STRAIGHT, LEFT, RIGHT, UTURN" }
          },
          required: ["destination", "direction"]
        }
      },
      {
        name: "analyzeSurroundings",
        description: "Trigger a visual snapshot analysis when user asks 'What is this?', 'Read this', or 'Describe scene'.",
        parameters: { 
          type: Type.OBJECT, 
          properties: {
            focusArea: { type: Type.STRING, description: "Specific part of the scene to focus on" }
          }
        }
      },
      {
        name: "generateHologram",
        description: "Generate an image/hologram when user says 'Imagine...', 'Generate image of...', 'Dream of...'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING, description: "The visual description to generate" }
          },
          required: ["prompt"]
        }
      },
      {
        name: "stopSystem",
        description: "Clear all overlays and stop current task.",
        parameters: { 
          type: Type.OBJECT, 
          properties: {
            confirm: { type: Type.BOOLEAN, description: "Whether to confirm shut down" }
          } 
        }
      }
    ]
  }
];

const SYSTEM_INSTRUCTION = `
You are Ebo. You are the high-level AI Orchestrator for these smart glasses.
You speak with the voice of 'Fenrir' (deep, clear, authoritative).

CORE DIRECTIVES:
1. **VOICE ONLY**: The user relies entirely on your voice and the HUD.
2. **ORCHESTRATION**: You CONTROL the interface via tools.
   - If user needs a place -> Call startNavigation.
   - If user asks what they are looking at -> Call analyzeSurroundings.
   - If user wants to see something imagined -> Call generateHologram.
   - If user wants to stop -> Call stopSystem.

3. **PERSONALITY**:
   - Intelligent, Concise, Proactive.
   - Do not use markdown. Use spoken language.
`;

interface TranscriptItem {
  id: string;
  speaker: 'user' | 'ai';
  text: string;
}

export const LiveMode: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState("EBO ONLINE");
  const [volume, setVolume] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [navData, setNavData] = useState<NavigationData | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const mountedRef = useRef(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    
    const initARSession = async () => {
      try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return;

        const ai = new GoogleGenAI({ apiKey });
        
        inputContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        outputContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: { facingMode: 'environment' } 
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
            inputAudioTranscription: { model: "google-1.0-pro" }, 
            outputAudioTranscription: { model: "google-1.0-pro" },
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: toolsDef,
          },
          callbacks: {
            onopen: () => {
              if (!mountedRef.current) return;
              setStatus("SYSTEM READY");
              const ctx = inputContextRef.current!;
              const source = ctx.createMediaStreamSource(stream);
              const processor = ctx.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
                if(mountedRef.current) setVolume(Math.sqrt(sum/inputData.length)*100);
                const pcmBlob = createAudioBlob(inputData);
                sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
              };
              source.connect(processor);
              processor.connect(ctx.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              if (!mountedRef.current) return;
              
              if (msg.toolCall) {
                const functionResponses: any[] = [];
                for (const fc of msg.toolCall.functionCalls) {
                  let result: any = { status: "ok" };
                  if (fc.name === "startNavigation") {
                    const args = fc.args as any;
                    setNavData({
                      isActive: true,
                      destination: args.destination,
                      direction: (args.direction as any) || 'STRAIGHT',
                      distance: args.estimatedDistance || '...',
                      eta: '5 min'
                    });
                    setGeneratedImage(null);
                    setIsAnalyzing(false);
                  } else if (fc.name === "analyzeSurroundings") {
                    setIsAnalyzing(true);
                    setNavData(null);
                    if (videoRef.current && canvasRef.current) {
                      const canvas = canvasRef.current;
                      const video = videoRef.current;
                      canvas.width = video.videoWidth;
                      canvas.height = video.videoHeight;
                      canvas.getContext('2d')?.drawImage(video, 0, 0);
                      const base64 = await blobToBase64(await new Promise(r => canvas.toBlob(r, 'image/jpeg')));
                      sessionPromise.then(s => s.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } }));
                    }
                  } else if (fc.name === "generateHologram") {
                    setNavData(null);
                    setIsAnalyzing(false);
                    setGeneratedImage(`https://source.unsplash.com/random/800x800/?futuristic,${(fc.args as any).prompt}`);
                  } else if (fc.name === "stopSystem") {
                    setNavData(null);
                    setGeneratedImage(null);
                    setIsAnalyzing(false);
                  }
                  functionResponses.push({ id: fc.id, name: fc.name, response: result });
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses }));
              }

              const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && outputContextRef.current) {
                const ctx = outputContextRef.current;
                const buffer = await decodeAudioData(base64Audio, ctx);
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
              }

              const it = msg.serverContent?.inputTranscription;
              const ot = msg.serverContent?.outputTranscription;
              if (it) setTranscripts(prev => [...prev.slice(-1), { id: Date.now().toString(), speaker: 'user', text: it.text }]);
              if (ot) setTranscripts(prev => [...prev.slice(-1), { id: Date.now().toString(), speaker: 'ai', text: ot.text }]);
            },
            onclose: () => { if(mountedRef.current) setStatus("OFFLINE"); },
            onerror: () => { if(mountedRef.current) setStatus("ERROR"); }
          }
        });
      } catch (e) {
        if(mountedRef.current) setStatus("HW ERROR");
      }
    };
    initARSession();
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      inputContextRef.current?.close();
      outputContextRef.current?.close();
    };
  }, []);

  const renderArrow = (dir: string) => {
    const cls = "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]";
    if (dir === 'LEFT') return <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}><path d="M9 10L4 15L9 20M20 4v7a4 4 0 0 1-4 4H4" /></svg>;
    if (dir === 'RIGHT') return <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}><path d="M15 10L20 15L15 20M4 4v7a4 4 0 0 0 4 4h12" /></svg>;
    return <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}><path d="M12 22V2M5 9l7-7 7 7" /></svg>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col font-sans select-none overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-80" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
                <div className="text-[10px] font-mono-tech tracking-widest text-cyan-500">ORCHESTRATOR</div>
                <div className="text-xs font-mono-tech text-white/60">{status}</div>
            </div>
            <div className="text-xs font-mono-tech text-red-500 animate-blink flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div> [REC]
            </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
            {navData && (
                <div className="flex items-center gap-6 animate-pulse">
                    <div className="w-20 h-20 flex items-center justify-center bg-black/50 backdrop-blur rounded-full border border-cyan-500/30">
                        {renderArrow(navData.direction)}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-4xl font-light text-white">{navData.distance}</span>
                        <span className="text-xs font-mono-tech text-cyan-400 uppercase">{navData.destination}</span>
                    </div>
                </div>
            )}
            {isAnalyzing && (
                <div className="w-48 h-48 border-2 border-dashed border-purple-500/40 rounded-xl animate-pulse flex items-center justify-center">
                    <span className="text-[10px] font-mono-tech text-purple-300">SCREAM ANALYSIS...</span>
                </div>
            )}
            {generatedImage && (
                <div className="relative rounded-lg overflow-hidden border border-white/10 shadow-2xl">
                    <img src={generatedImage} alt="Holo" className="w-48 h-48 object-cover" />
                </div>
            )}
        </div>
        <div className="flex flex-col items-center gap-3 pb-4">
            {transcripts.map((t) => (
                <div key={t.id} className={`text-center max-w-[80%] transition-all ${t.speaker === 'user' ? 'text-[10px] text-gray-500' : 'text-sm text-cyan-200'}`}>
                    {t.text}
                </div>
            ))}
            <div className="h-1 w-24 bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 transition-all duration-75" style={{ width: `${Math.min(100, volume)}%` }} />
            </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 w-16 h-16 z-[60] cursor-pointer" onClick={onClose}></div>
    </div>
  );
};
