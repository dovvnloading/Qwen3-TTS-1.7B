import React from 'react';
import { Settings } from 'lucide-react';

interface TopBarProps {
  isModelReady: boolean;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ isModelReady, onOpenSettings }) => {
  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-line/70">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[13px] font-extrabold tracking-[0.14em] text-white">
          QWEN3<span className="text-text-muted font-bold">TTS</span>
        </h1>
        <span className="text-[10px] font-semibold text-text-muted px-1.5 py-0.5 rounded border border-line">
          1.7B
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted"
          title={isModelReady ? 'Model loaded and ready' : 'Loading model into VRAM'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isModelReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
          />
          {isModelReady ? 'Ready' : 'Loading'}
        </div>

        <button
          onClick={onOpenSettings}
          title="Model source settings"
          aria-label="Model source settings"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-background text-text-muted shadow-neu-icon hover:text-white active:shadow-neu-icon-pressed transition-colors focus-visible:ring-2 focus-visible:ring-white/25 outline-none"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
};
