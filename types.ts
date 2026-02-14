import { type GenerateContentResponse } from "@google/genai";

export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  OMNI_CHAT = 'OMNI_CHAT',
  LIVE_VOICE = 'LIVE_VOICE',
  VISION_LAB = 'VISION_LAB',
  AUDIO_SCRIBE = 'AUDIO_SCRIBE'
}

export enum ChatModelType {
  FAST = 'FAST', // gemini-2.5-flash-lite
  SMART = 'SMART', // gemini-3-pro-preview (Thinking)
  SEARCH = 'SEARCH', // gemini-3-flash-preview + Google Search
  MAPS = 'MAPS' // gemini-2.5-flash + Google Maps
}

export interface NavigationData {
  isActive: boolean;
  destination: string | null;
  direction: 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'UTURN' | 'ARRIVED';
  distance: string;
  eta: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isLoading?: boolean;
  groundingMetadata?: any; // For search/maps results
  images?: string[]; // Base64 strings
}

// Global window extension for AI Studio key selection
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
