export interface TTSConfig {
  text: string;
  speaker: string;
  language: string;
  styleInstruction: string;
  mode: 'preset' | 'clone';
  refAudioFile: File | null;
  refText: string;
  qualityPreset: 'default' | 'consistent' | 'expressive';
  seed: string;
  candidates: number;
  longForm: boolean;
  pauseMs: number;
  normalize: boolean;
  trimSilence: boolean;
}
export interface AudioTake {
  id: string;
  clipId: string | null;
  text: string;
  speaker: string;
  seed: number | null;
  createdAt: number;
  url: string;
  blob: Blob;
  label: string;
}
export interface PlaybackState {
  isPlaying: boolean;
  progress: number;
  duration: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  isReady: boolean;
}
export enum AppStatus {
  IDLE = 'Ready',
  GENERATING = 'Synthesizing...',
  ERROR = 'Error',
  SUCCESS = 'Success',
}
export type ModelState = 'idle' | 'loading' | 'ready' | 'error';
export interface BackendStatus {
  status: ModelState;
  detail: string;
  modelType: string | null;
}
export interface ModelAvailability { custom: boolean; base: boolean; }
export interface AppConfig {
  modelsDir: string;
  downloadMode: boolean;
  precision: 'auto' | 'float16' | 'bfloat16' | 'float32';
  models: ModelAvailability;
}
