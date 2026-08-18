import React from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { PlaybackState } from '../types';
import { RangeSlider } from './ui/RangeSlider';
import { Button } from './ui/Button';
import { AudioVisualizer } from './ui/AudioVisualizer';

interface PlayerBarProps {
  playback: PlaybackState;
  onPlayPause: () => void;
  onSeek: (val: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const PlayerBar: React.FC<PlayerBarProps> = ({
  playback,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
}) => {
  const muted = playback.volume === 0;

  return (
    <div className="h-[72px] shrink-0 flex items-center gap-4 px-4 border-t border-line/70">
      <Button
        variant={playback.isPlaying ? 'active-icon' : 'icon'}
        size="icon"
        onClick={onPlayPause}
        disabled={!playback.isReady}
        aria-label={playback.isPlaying ? 'Pause' : 'Play'}
        className="shrink-0"
      >
        {playback.isPlaying ? (
          <Pause size={17} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" className="ml-0.5" />
        )}
      </Button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <AudioVisualizer isPlaying={playback.isPlaying} className="w-full h-6" />
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold text-text-muted tabular-nums w-8 text-right">
            {formatTime(playback.currentTime)}
          </span>
          <RangeSlider
            min={0}
            max={playback.duration || 100}
            value={playback.currentTime}
            onChange={onSeek}
            disabled={!playback.isReady}
            className="flex-1"
          />
          <span className="text-[10px] font-semibold text-text-muted tabular-nums w-8">
            {formatTime(playback.duration)}
          </span>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 shrink-0 w-32">
        <button
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className={`shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded ${
            muted ? 'text-text-muted' : 'text-text hover:text-white'
          }`}
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <RangeSlider min={0} max={1} value={playback.volume} onChange={onVolumeChange} className="flex-1" />
      </div>
    </div>
  );
};
