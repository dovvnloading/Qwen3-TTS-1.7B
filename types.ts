export interface TTSConfig {
  text: string;
  speaker: string;
  language: string;
  styleInstruction: string;
  mode: 'preset' | 'clone';
  refAudioFile: File | null;
  refText: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  progress: number; // 0 to 100
  duration: number; // in seconds
  currentTime: number; // in seconds
  volume: number; // 0 to 1
  isReady: boolean;
}

export enum AppStatus {
  IDLE = "Ready",
  GENERATING = "Synthesizing...",
  PLAYING = "Playing",
  ERROR = "Error",
  SUCCESS = "Success",
}

export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface BackendStatus {
  status: ModelState;
  detail: string;
  modelType: string | null;
}

export interface ModelAvailability {
  custom: boolean;
  base: boolean;
}

export interface AppConfig {
  modelsDir: string;
  downloadMode: boolean;
  models: ModelAvailability;
}
