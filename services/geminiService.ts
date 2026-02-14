import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ChatModelType } from "../types";

// Helper to ensure API Key is present
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found in environment");
    // In a real app, handle this gracefully. For this demo, we assume injection works.
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

// --- OMNI CHAT SERVICES ---

export const sendChatMessage = async (
  message: string,
  modelType: ChatModelType,
  history: { role: string; parts: { text: string }[] }[],
  location?: GeolocationCoordinates
) => {
  const ai = getAIClient();
  let modelName = 'gemini-flash-lite-latest'; // Default FAST
  let tools: any[] | undefined = undefined;
  let toolConfig: any | undefined = undefined;
  let thinkingConfig: any | undefined = undefined;
  let systemInstruction: string | undefined = undefined;

  switch (modelType) {
    case ChatModelType.FAST:
      modelName = 'gemini-flash-lite-latest';
      systemInstruction = "You are Ebo, a fast and efficient AI assistant.";
      break;
    case ChatModelType.SMART:
      modelName = 'gemini-3-pro-preview';
      thinkingConfig = { thinkingBudget: 32768 }; // Max thinking
      systemInstruction = "You are Ebo, a deep-thinking AI. Take your time to reason complexly.";
      break;
    case ChatModelType.SEARCH:
      modelName = 'gemini-3-flash-preview';
      tools = [{ googleSearch: {} }];
      systemInstruction = "You are Ebo. Use Google Search to provide up-to-date information.";
      break;
    case ChatModelType.MAPS:
      modelName = 'gemini-2.5-flash';
      tools = [{ googleMaps: {} }];
      if (location) {
        toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        };
      }
      systemInstruction = "You are Ebo. Help the user find places using Google Maps.";
      break;
  }

  // Convert history for the API if needed, or just use generateContent with the full context + new message
  // For simplicity in this demo, we'll use a chat session.
  const chat = ai.chats.create({
    model: modelName,
    config: {
      systemInstruction,
      tools,
      toolConfig,
      thinkingConfig,
    },
    history: history.map(h => ({
      role: h.role,
      parts: h.parts
    }))
  });

  const result = await chat.sendMessage({ message });
  return result;
};

// --- VISION LAB SERVICES ---

export const analyzeMedia = async (
  fileBase64: string,
  mimeType: string,
  prompt: string,
  isVideo: boolean
) => {
  const ai = getAIClient();
  const model = 'gemini-3-pro-preview'; // Used for both Image and Video understanding

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: fileBase64,
            mimeType: mimeType
          }
        },
        { text: prompt }
      ]
    }
  });

  return response.text;
};

export const generateProImage = async (prompt: string, size: '1K' | '2K' | '4K') => {
  // Ensure we use the latest key for paid features
  if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
     // Re-init client to ensure we have the user-selected key if applicable
  }
  
  const ai = getAIClient();
  const model = 'gemini-3-pro-image-preview';
  
  const response = await ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        imageSize: size,
        aspectRatio: '1:1' // Defaulting to square
      }
    }
  });

  // Extract image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

// --- AUDIO SCRIBE SERVICES ---

export const transcribeAudioFile = async (base64Audio: string, mimeType: string) => {
  const ai = getAIClient();
  const model = 'gemini-3-flash-preview';

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType
          }
        },
        { text: "Transcribe this audio accurately." }
      ]
    }
  });

  return response.text;
};

// --- TTS SERVICE ---

export const generateSpeech = async (text: string) => {
  const ai = getAIClient();
  const model = 'gemini-2.5-flash-preview-tts';

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio; // Returns raw base64 PCM usually, but SDK handles structure
};

// Helper for PCM decoding (used in TTS playback)
export const decodeAudioData = async (
  base64Data: string,
  ctx: AudioContext,
  sampleRate: number = 24000
) => {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const frameCount = dataInt16.length / numChannels;
  
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
};
