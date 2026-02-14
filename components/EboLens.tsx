
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { Smartphone } from 'lucide-react';

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
    let isActive = true;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, video: { facingMode: 'environment', width: 1280, height: 720 } 
        });
        if (!isActive) return;
        streamRef.current = stream;
        if (hiddenVideoRef.current) hiddenVideoRef.current.srcObject = stream;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        inputCtxRef.current = new AudioContext({ sampleRate: 16000 });
        outputCtxRef.current = new AudioContext({ sampleRate: 24000 });

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: TOOLS
          },
          callbacks: {
            onopen: () => {
              if (!isActive) return;
              setStatus("ACTIVE");
              const source = inputCtxRef.current!.createMediaStreamSource(stream);
              const processor = inputCtxRef.current!.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                if (!isActive) return;
                const data = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
                const rms = Math.sqrt(sum / data.length);
                setVolume(rms * 200); 
                sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(data) }));
              };
              source.connect(processor);
              processor.connect(inputCtxRef.current!.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              if (!isActive) return;
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
                      sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
                    }
                    setTimeout(() => setIsCapturing(false), 2000);
                  }
                  if (fc.name === "record_video_clip") startRec((fc.args as any)?.duration || 10);
                  responses.push({ id: fc.id, name: fc.name, response: { ok: true } });
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: responses }));
              }
            },
            onclose: () => { if (isActive) setStatus("LINK_CLOSED"); },
            onerror: () => { if (isActive) setStatus("LINK_LOST"); }
          }
        });
      } catch (err) {
        if (isActive) setStatus("HW_ERROR");
      }
    };
    init();
    return () => {
      isActive = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      inputCtxRef.current?.close();
      outputCtxRef.current?.close();
    };
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
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, sec * 1000);
  };

  const EyeHUD = () => (
    <div className="flex-1 h-full relative p-10 flex flex-col justify-between overflow-hidden">
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-150"
        style={{
          background: `radial-gradient(circle, transparent 65%, rgba(6, 182, 212, ${Math.min(0.06, volume / 1200)}))`,
          boxShadow: `inset 0 0 ${volume / 2}px rgba(6, 182, 212, ${Math.min(0.1, volume / 800)})`
        }}
      />
      <div className="flex justify-between items-start z-10">
        <div className="flex flex-col gap-1 opacity-10">
          <div className="flex items-center gap-1.5 text-[6px] tracking-[0.4em] font-mono-tech text-cyan-500 uppercase">
            <div className={`w-1 h-1 rounded-full ${status === 'ACTIVE' ? 'bg-cyan-400' : 'bg-red-500'}`} />
            {status}
          </div>
        </div>
        {isRecording && (
          <div className="flex items-center gap-1 text-[7px] font-mono-tech text-red-500/40 animate-pulse font-bold tracking-[0.2em]">
            <div className="w-1 h-1 bg-red-600 rounded-full" /> REC
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center pointer-events-none z-10">
        <div 
          className={`transition-all duration-700 rounded-full
            ${isAiSpeaking ? 'w-1 h-1 bg-white/20 blur-[1px]' : 
              isCapturing ? 'w-2 h-2 bg-red-500/10 blur-[2px]' : 
              'w-0.5 h-0.5 bg-cyan-500/5'}`}
          style={{ transform: `scale(${1 + (volume / 150)})` }}
        />
      </div>
      <div className="flex items-end justify-between w-full opacity-10 z-10">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5 h-1 items-end">
            {[...Array(4)].map((_, i) => (
              <div 
                key={i} 
                className="w-[1px] bg-cyan-400/20"
                style={{ height: `${(isAiSpeaking || volume > 2 ? Math.random() * 80 + 20 : 10)}%` }}
              />
            ))}
          </div>
          <div className="text-[4px] text-cyan-500/20 tracking-[0.6em] uppercase">LINK_STABLE</div>
        </div>
        <div className="text-[4px] text-white/5 uppercase tracking-[0.4em]">EYEGLASSES_VIEW_IFACE</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex font-mono-tech select-none overflow-hidden cursor-none">
      <video ref={hiddenVideoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex w-full h-full transform scale-x-[-1]">
        <EyeHUD />
        <EyeHUD />
      </div>
      <div 
        className="absolute bottom-6 right-6 z-[100] cursor-pointer opacity-[0.05] hover:opacity-30 transition-opacity pointer-events-auto" 
        onClick={onClose}
      >
        <Smartphone className="text-white" size={24} />
      </div>
      <style>{`
        @keyframes sweep {
          0% { transform: translateY(-30vh); opacity: 0; }
          50% { opacity: 0.1; }
          100% { transform: translateY(30vh); opacity: 0; }
        }
        body { cursor: none; background: black; }
      `}</style>
    </div>
  );
};
