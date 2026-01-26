import React from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { PlaybackState, AppStatus } from '../types';
import { RangeSlider } from './ui/RangeSlider';
import { Button } from './ui/Button';
import { AudioVisualizer } from './ui/AudioVisualizer';

interface PlayerBarProps {
  status: AppStatus;
  playback: PlaybackState;
  onPlayPause: () => void;
  onSeek: (val: number) => void;
  onVolumeChange: (val: number) => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ 
  status, 
  playback, 
  onPlayPause, 
  onSeek, 
  onVolumeChange 
}) => {
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="h-40 bg-background relative z-30 px-8 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.3)] border-t border-[#2a2a2a]">
      
      {/* Container for the control surface */}
      <div className="w-full h-full flex items-center gap-10">
        
        {/* Play Button - Isolated Left */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <Button 
                variant={playback.isPlaying ? "active-icon" : "icon"}
                size="icon"
                onClick={onPlayPause}
                disabled={!playback.isReady}
                className="!w-20 !h-20 !rounded-full"
            >
                {playback.isPlaying ? 
                <Pause size={32} fill="currentColor" /> : 
                <Play size={32} fill="currentColor" className="ml-1" />
                }
            </Button>
            <span className="text-[10px] font-bold text-text-muted tracking-widest uppercase">
                {playback.isPlaying ? 'Playing' : 'Paused'}
            </span>
        </div>

        {/* Center: Visualizer & Seeker */}
        <div className="flex-1 flex flex-col justify-center gap-4 py-4">
            
            {/* Top Row: Visualizer Screen */}
            <AudioVisualizer isPlaying={playback.isPlaying} className="w-full h-16" />

            {/* Bottom Row: Scrubber & Info */}
            <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-text-muted font-mono w-10 text-right">
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
                
                <span className="text-xs font-bold text-text-muted font-mono w-10">
                    {formatTime(playback.duration)}
                </span>
            </div>
        </div>

        {/* Right: Volume Control */}
        <div className="w-56 hidden md:flex flex-col justify-center gap-3 pl-10 border-l-2 border-[#1a1a1a] h-24 my-auto">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Master Vol</span>
                <span className="text-[10px] font-bold text-text font-mono">{Math.round(playback.volume * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => onVolumeChange(playback.volume === 0 ? 0.7 : 0)}
                    className={`transition-colors ${playback.volume === 0 ? 'text-gray-600' : 'text-text'}`}
                >
                    {playback.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <RangeSlider 
                    min={0} 
                    max={1} 
                    value={playback.volume} 
                    onChange={onVolumeChange}
                    className="flex-1"
                />
            </div>
        </div>

      </div>
    </div>
  );
};