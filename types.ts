export interface TTSConfig {
  text: string;
  speaker: string;
  language: string;
  styleInstruction: string;
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