import React from 'react';
import { Settings, Sun, Moon } from 'lucide-react';
import { ModelState } from '../types';
import type { Theme } from '../useTheme';

interface TopBarProps {
  modelState: ModelState;
  modelDetail: string;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

const STATUS_STYLES: Record<ModelState, { label: string; dot: string; text: string }> = {
  ready: { label: 'Ready', dot: 'bg-emerald-400', text: 'text-text-muted' },
  loading: { label: 'Loading', dot: 'bg-amber-400 animate-pulse', text: 'text-text-muted' },
  idle: { label: 'Idle', dot: 'bg-text-muted', text: 'text-text-muted' },
  error: { label: 'No model', dot: 'bg-red-400', text: 'text-red-400' },
};

export const TopBar: React.FC<TopBarProps> = ({
  modelState,
  modelDetail,
  theme,
  onToggleTheme,
  onOpenSettings,
}) => {
  const s = STATUS_STYLES[modelState];
  const iconButton =
    'w-8 h-8 flex items-center justify-center rounded-full bg-background text-text-muted ' +
    'shadow-neu-icon hover:text-strong active:shadow-neu-icon-pressed transition-colors ' +
    'focus-visible:ring-2 focus-visible:ring-accent/45 outline-none';

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-line/70">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[13px] font-extrabold tracking-[0.14em] text-strong">
          QWEN3<span className="text-text-muted font-bold">TTS</span>
        </h1>
        <span className="text-[10px] font-semibold text-text-muted px-1.5 py-0.5 rounded border border-line">
          1.7B
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${s.text}`}
          title={modelDetail || s.label}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </div>

        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className={iconButton}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <button
          onClick={onOpenSettings}
          title="Model source settings"
          aria-label="Model source settings"
          className={iconButton}
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
};
