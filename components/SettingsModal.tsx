import React, { useEffect, useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { AppConfig } from '../types';
import { Button } from './ui/Button';
import { apiFetch, readApiError } from '../api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appConfig: AppConfig | null;
  onSaved: (restarting: boolean) => void;
}
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, appConfig, onSaved,
}) => {
  const [modelsDir, setModelsDir] = useState('');
  const [downloadMode, setDownloadMode] = useState(false);
  const [precision, setPrecision] = useState<AppConfig['precision']>('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && appConfig) {
      setModelsDir(appConfig.modelsDir);
      setDownloadMode(appConfig.downloadMode);
      setPrecision(appConfig.precision || 'auto');
      setError(null);
    }
  }, [isOpen, appConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;
  const changed = !!appConfig && (
    modelsDir !== appConfig.modelsDir || downloadMode !== appConfig.downloadMode
    || precision !== (appConfig.precision || 'auto')
  );
  const handleSave = async () => {
    if (!changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelsDir, downloadMode, precision }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to save settings'));
      const data = await res.json();
      onClose();
      onSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Model source settings"
        className="w-full max-w-[440px] bg-background rounded-xl shadow-neu-flat border border-line/70 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold tracking-[0.1em] uppercase text-strong">Model Source</h2>
          <button onClick={onClose} disabled={saving} aria-label="Close settings"
            className="w-7 h-7 flex items-center justify-center rounded-full shadow-neu-icon text-text-muted hover:text-strong">
            <X size={13} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="models-dir" className="text-[10px] uppercase font-bold text-text-muted">Models Directory</label>
          <div className="relative">
            <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input id="models-dir" value={modelsDir} onChange={(e) => setModelsDir(e.target.value)}
              placeholder="Local model folder or HF cache" spellCheck={false}
              className="w-full bg-background rounded-lg shadow-neu-pressed pl-9 pr-3 py-2.5 text-[12px] font-mono text-text outline-none" />
          </div>
          <p className="text-[10px] text-text-muted">Accepts a Hugging Face cache or a parent containing Qwen model folders.</p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
          <span className="text-[11px] font-semibold">Allow model downloads
            <span className="block text-[10px] font-normal text-text-muted">Off: load verified local snapshots only.</span>
          </span>
          <input type="checkbox" checked={downloadMode} onChange={(e) => setDownloadMode(e.target.checked)}
            className="accent-accent w-4 h-4" />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="precision" className="text-[10px] uppercase font-bold text-text-muted">Inference Precision</label>
          <select id="precision" value={precision}
            onChange={(e) => setPrecision(e.target.value as AppConfig['precision'])}
            className="w-full rounded-lg p-2.5 text-[12px] shadow-neu-pressed bg-background text-text">
            <option value="auto">Auto (BF16 when supported, otherwise FP16)</option>
            <option value="float16">FP16</option>
            <option value="bfloat16">BF16 (requires supported GPU)</option>
            <option value="float32">FP32 (higher memory use)</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 rounded-lg shadow-neu-pressed p-3">
          {([{ key: 'custom', label: 'CustomVoice' }, { key: 'base', label: 'Base (Clone)' }] as const)
            .map(({ key, label }) => {
              const found = appConfig?.models[key];
              return <div key={key} className="flex justify-between text-[11px]">
                <span>{label}</span><span className={found ? 'text-emerald-400' : 'text-red-400'}>
                  {found ? 'Complete local model' : 'Missing / incomplete'}</span>
              </div>;
            })}
        </div>
        <p className="text-[10px] text-text-muted">Changes unload the current model and reload it without restarting the desktop process.</p>
        {error && <div role="alert" className="text-[11px] text-danger-text rounded border border-danger-line p-2">{error}</div>}
        <Button variant="primary" size="lg" className="w-full" onClick={handleSave}
          disabled={!changed} loading={saving}>SAVE &amp; APPLY</Button>
      </div>
    </div>
  );
};
