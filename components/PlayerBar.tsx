import React from 'react';
import { Play, Pause, Volume2, VolumeX, Download, RotateCcw } from 'lucide-react';
import { PlaybackState } from '../types';
import { RangeSlider } from './ui/RangeSlider';
import { Button } from './ui/Button';
import { AudioVisualizer } from './ui/AudioVisualizer';

interface PlayerBarProps {
  theme?: string;
  audioBlob: Blob | null;
  playback: PlaybackState;
  onPlayPause: () => void;
  onSeek: (val: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onSave: () => void;
}
const formatTime = (n: number) => {
  if (!Number.isFinite(n) || n < 0) n = 0;
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
};
export const PlayerBar: React.FC<PlayerBarProps> = ({
  theme, audioBlob, playback, onPlayPause, onSeek, onVolumeChange,
  onToggleMute, onRestart, onSave,
}) => {
  const silent = playback.muted || playback.volume === 0;
  return (
    <div className="h-[88px] shrink-0 flex items-center gap-3 px-4 border-t border-line/70">
      <Button variant={playback.isPlaying ? 'active-icon' : 'icon'} size="icon"
        onClick={onPlayPause} disabled={!playback.isReady}
        aria-label={playback.isPlaying ? 'Pause' : 'Play'} className="shrink-0">
        {playback.isPlaying ? <Pause size={17} fill="currentColor" />
          : <Play size={17} fill="currentColor" />}
      </Button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="h-8 w-full rounded-lg shadow-neu-pressed overflow-hidden">
          <AudioVisualizer theme={theme} audioBlob={audioBlob}
            duration={playback.duration} currentTime={playback.currentTime} onSeek={onSeek} />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums text-text-muted">
          <span>{formatTime(playback.currentTime)}</span><span>{formatTime(playback.duration)}</span>
        </div>
      </div>
      <button onClick={onRestart} disabled={!playback.isReady}
        title="Restart audio" aria-label="Restart audio"
        className="p-2 rounded-lg text-text-muted hover:text-strong disabled:opacity-30"><RotateCcw size={17}/></button>
      <button onClick={onSave} disabled={!audioBlob}
        title="Save WAV" aria-label="Save WAV"
        className="p-2 rounded-lg text-text-muted hover:text-strong disabled:opacity-30"><Download size={17}/></button>
      <div className="hidden md:flex items-center gap-2 shrink-0 w-32">
        <button onClick={onToggleMute} aria-label={playback.muted ? 'Unmute' : 'Mute'}
          className="text-text-muted hover:text-strong">{silent ? <VolumeX size={15}/> : <Volume2 size={15}/>}</button>
        <RangeSlider min={0} max={1} value={playback.volume} onChange={onVolumeChange}
          className={`flex-1 ${playback.muted ? 'opacity-40' : ''}`} />
      </div>
    </div>
  );
};
