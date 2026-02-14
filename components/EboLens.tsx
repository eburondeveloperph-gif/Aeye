
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

// Audio Processing Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function createBlob(data: Float32Array): any {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000'
  };
}

async function decodeAudioData(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}

const TOOLS = [{
  functionDeclarations: [
    {
      name: "capture_and_analyze",
      description: "Analyze the current view. Triggered by queries about the environment.",
      parameters: {
        type: Type.OBJECT,
        properties: { task: { type: Type.STRING } },
        required: ["task"]
      }
    },
    {
      name: "record_video_clip",
      description: "Record a video to device storage.",
      parameters: {
        type: Type.OBJECT,
        properties: { duration: { type: Type.NUMBER } }
      }
    }
  ]
}];

const SYSTEM_INSTRUCTION = `
You are Ebo, an AR OS for smart glasses. 
The user sees the real world through the lenses; you are an overlay.
Confirm actions with extremely brief, calm voice cues.
Tone: Deep, soothing (Fenrir).
Primary tools: record_video_clip (saves to storage), capture_and_analyze (visual query).
`;

export const EboLens: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState("LINKING");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const videoChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, video: { facingMode: 'environment', width: 1280, height: 720 } 
        });
        streamRef.current = stream;
        if (hiddenVideoRef.current) hiddenVideoRef.current.srcObject = stream;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        inputCtxRef.current = new AudioContext({ sampleRate: 16000 });
        outputCtxRef.current = new AudioContext({ sampleRate: 24000 });

        const session = await ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: TOOLS
          },
          callbacks: {
            onopen: () => {
              setStatus("ACTIVE");
              const source = inputCtxRef.current!.createMediaStreamSource(stream);
              const processor = inputCtxRef.current!.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                const data = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
                setVolume(Math.sqrt(sum / data.length) * 100);
                session.sendRealtimeInput({ media: createBlob(data) });
              };
              source.connect(processor);
              processor.connect(inputCtxRef.current!.destination);
            },
            onmessage: async (msg) => {
              const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audio && outputCtxRef.current) {
                setIsAiSpeaking(true);
                const ctx = outputCtxRef.current;
                const buffer = await decodeAudioData(audio, ctx);
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.onended = () => setIsAiSpeaking(false);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
              }
              if (msg.toolCall) {
                const responses: any[] = [];
                for (const fc of msg.toolCall.functionCalls) {
                  if (fc.name === "capture_and_analyze") {
                    setIsCapturing(true);
                    if (hiddenVideoRef.current && canvasRef.current) {
                      const canvas = canvasRef.current;
                      canvas.width = 1280; canvas.height = 720;
                      canvas.getContext('2d')?.drawImage(hiddenVideoRef.current, 0, 0);
                      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                      session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
                    }
                    setTimeout(() => setIsCapturing(false), 2000);
                  }
                  if (fc.name === "record_video_clip") startRec(fc.args?.duration || 10);
                  responses.push({ id: fc.id, name: fc.name, response: { ok: true } });
                }
                session.sendToolResponse({ functionResponses: responses });
              }
            }
          }
        });
      } catch { setStatus("LINK_LOST"); }
    };
    init();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const startRec = (sec: number) => {
    if (isRecording || !streamRef.current) return;
    setIsRecording(true);
    videoChunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => videoChunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `EBO_REC_${Date.now()}.webm`;
      a.click();
      setIsRecording(false);
    };
    recorder.start();
    setTimeout(() => recorder.state === 'recording' && recorder.stop(), sec * 1000);
  };

  const EyeHUD = () => (
    <div className="flex-1 h-full relative p-8 flex flex-col justify-between overflow-hidden">
      {/* HUD Top Outer Corner - Vital Stats */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1 opacity-20">
          <div className="flex items-center gap-1.5 text-[7px] tracking-[0.4em] font-mono-tech text-cyan-500 uppercase">
            <div className={`w-1 h-1 rounded-full ${status === 'ACTIVE' ? 'bg-cyan-400 shadow-[0_0_4px_cyan]' : 'bg-red-500'}`} />
            {status}
          </div>
          <div className="text-[6px] text-cyan-400/50">CORTEX_LINK_v2.5</div>
        </div>
        
        {isRecording && (
          <div className="flex items-center gap-1 text-[8px] font-mono-tech text-red-500/60 animate-pulse font-bold tracking-[0.2em]">
            <div className="w-1.5 h-1.5 bg-red-600 rounded-full shadow-[0_0_6px_red]" /> REC
          </div>
        )}
      </div>

      {/* Center Aura (Minimalist Focal Point - User stays focused on center) */}
      <div className="flex-1 flex items-center justify-center pointer-events-none">
        <div 
          className={`transition-all duration-700 rounded-full
            ${isAiSpeaking ? 'w-1 h-1 bg-white/40 blur-[1px] shadow-[0_0_8px_white]' : 
              isCapturing ? 'w-2 h-2 bg-red-500/30 blur-[2px] shadow-[0_0_12px_red]' : 
              'w-0.5 h-0.5 bg-cyan-500/10'}`}
          style={{ transform: `scale(${1 + (volume / 100)})` }}
        />
        
        {isCapturing && (
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-full h-[0.5px] bg-cyan-500/5 shadow-[0_0_15px_cyan] opacity-20 animate-[sweep_2.5s_ease-in-out_infinite]" />
          </div>
        )}
      </div>

      {/* Bottom HUD Layer - Peripheral Monitoring */}
      <div className="flex items-end justify-between w-full opacity-30">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5 h-1.5 items-end">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className="w-[1px] bg-cyan-400/40 transition-all duration-100"
                style={{ height: `${(isAiSpeaking || volume > 1 ? Math.random() * 100 : 20)}%` }}
              />
            ))}
          </div>
          <div className="text-[5px] text-cyan-500/40 tracking-[0.5em] uppercase">Audio_In</div>
        </div>

        <div className="text-[5px] text-white/10 uppercase tracking-[0.4em]">
          Ebo_Vision_Platform
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex font-mono-tech select-none overflow-hidden cursor-none">
      <video ref={hiddenVideoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* 
        STEREOSCOPIC MIRRORED HUD
        - side-by-side (SBS) for stereoscopic lenses.
        - scale-x-[-1] mirrors the entire UI for reflection-off-glass projection.
        - Peripheral placement ensures central vision is unobstructed.
      */}
      <div className="flex w-full h-full transform scale-x-[-1]">
        <EyeHUD /> {/* Project to Left Eye */}
        <EyeHUD /> {/* Project to Right Eye */}
      </div>

      {/* Transparent overlay for the shutdown click if needed (emergency only) */}
      <div className="absolute top-0 right-0 w-24 h-24 z-[100] cursor-pointer opacity-0" onClick={onClose} />

      <style>{`
        @keyframes sweep {
          0% { transform: translateY(-40vh); opacity: 0; }
          50% { opacity: 0.15; }
          100% { transform: translateY(40vh); opacity: 0; }
        }
        
        /* Hide mouse cursor to maintain immersion */
        body { cursor: none; }
      `}</style>
    </div>
  );
};
