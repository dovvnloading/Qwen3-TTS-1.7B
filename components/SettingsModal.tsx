import React, { useEffect, useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { AppConfig } from '../types';
import { Button } from './ui/Button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appConfig: AppConfig | null;
  onSaved: (restarting: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  appConfig,
  onSaved,
}) => {
  const [modelsDir, setModelsDir] = useState('');
  const [downloadMode, setDownloadMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && appConfig) {
      setModelsDir(appConfig.modelsDir);
      setDownloadMode(appConfig.downloadMode);
      setError(null);
    }
  }, [isOpen, appConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelsDir, downloadMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save settings');
      onClose();
      onSaved(data.status === 'restarting');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Model source settings"
        className="w-full max-w-[440px] bg-background rounded-xl shadow-neu-flat border border-line/70 p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold tracking-[0.1em] uppercase text-strong">
            Model Source
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-background text-text-muted shadow-neu-icon hover:text-strong active:shadow-neu-icon-pressed transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-text-muted uppercase tracking-[0.12em] pl-0.5">
            Models Directory
          </label>
          <div className="relative">
            <FolderOpen
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={modelsDir}
              onChange={(e) => setModelsDir(e.target.value)}
              placeholder="D:\Models"
              spellCheck={false}
              className="w-full bg-background rounded-lg shadow-neu-pressed pl-9 pr-3.5 py-2.5 text-[12px] font-mono
                         text-text placeholder:text-text-muted/70 outline-none border-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </div>
          <p className="text-[10px] text-text-muted leading-relaxed pl-0.5">
            Hugging Face cache layout — folders named{' '}
            <code className="text-text/80">models--org--repo</code>.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-line/70 px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-text uppercase tracking-[0.1em]">
              Allow Download
            </div>
            <div className="text-[10px] text-text-muted mt-0.5 leading-relaxed">
              {downloadMode
                ? 'Missing models are fetched from Hugging Face.'
                : 'Local only — nothing is downloaded automatically.'}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={downloadMode}
            aria-label="Allow download"
            onClick={() => setDownloadMode((v) => !v)}
            className={`relative w-11 h-6 rounded-full shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
              downloadMode ? 'bg-accent' : 'shadow-neu-pressed'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full shadow-neu-icon transition-transform ${
                downloadMode ? 'translate-x-5 bg-white' : 'bg-background'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg shadow-neu-pressed px-3.5 py-3">
          {(
            [
              { key: 'custom', label: 'CustomVoice' },
              { key: 'base', label: 'Base (Clone)' },
            ] as const
          ).map(({ key, label }) => {
            const found = appConfig?.models[key];
            return (
              <div key={key} className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-text-muted uppercase tracking-[0.08em]">{label}</span>
                <span className={`flex items-center gap-1.5 ${found ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${found ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {found ? 'Found' : 'Not found'}
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="text-[11px] text-danger-text font-medium rounded-lg border border-danger-line bg-danger-bg px-3 py-2">
            {error}
          </div>
        )}

        <Button variant="primary" size="lg" className="w-full" onClick={handleSave} loading={saving}>
          SAVE &amp; APPLY
        </Button>
      </div>
    </div>
  );
};
