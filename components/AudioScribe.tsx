import React, { useState, useRef } from 'react';
import { Mic, Square, FileText } from 'lucide-react';
import { transcribeAudioFile } from '../services/geminiService';

export const AudioScribe: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        processAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Mic error", e);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    setTranscript('');
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        // Note: Gemini API often expects standard PCM or specific formats. 
        // For 'gemini-3-flash-preview', generic audio files often work if encoded correctly in inlineData.
        // WebM is widely supported.
        const text = await transcribeAudioFile(base64, 'audio/webm');
        setTranscript(text || "No transcription available.");
        setIsProcessing(false);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      setTranscript("Error processing audio.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 space-y-8 bg-gray-900/30 rounded-xl border border-gray-800">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Audio Scribe</h2>
        <p className="text-gray-400">Transcribe voice notes instantly with Gemini 3 Flash</p>
      </div>

      <div className="relative">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
            isRecording 
              ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isRecording ? <Square size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
        </button>
        {isRecording && (
          <div className="absolute -bottom-8 left-0 right-0 text-center text-red-400 text-sm font-mono">
            RECORDING
          </div>
        )}
      </div>

      {isProcessing && (
        <div className="text-cyan-400 animate-pulse">Transcribing...</div>
      )}

      {transcript && (
        <div className="w-full max-w-2xl bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
           <div className="flex items-center gap-2 text-gray-400 mb-4 border-b border-gray-700 pb-2">
             <FileText size={16} />
             <span className="text-xs uppercase tracking-wider">Transcription Result</span>
           </div>
           <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </div>
  );
};
