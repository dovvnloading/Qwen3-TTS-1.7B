import React, { useRef } from 'react';
import { Wand2, Mic, UploadCloud, X as XIcon, AudioLines } from 'lucide-react';
import { TTSConfig } from '../types';
import { SPEAKERS, LANGUAGES } from '../constants';
import { Select } from './ui/Select';
import { Button } from './ui/Button';

interface SettingsPanelProps {
  config: TTSConfig;
  setConfig: React.Dispatch<React.SetStateAction<TTSConfig>>;
  onGenerate: () => void;
  isGenerating: boolean;
  isModelReady: boolean;
  isModelAvailable: boolean;
  speakerOptions: string[];
  languageOptions: string[];
}
const NATIVE_LANGUAGE: Record<string, string> = {
  Ryan: 'English', Aiden: 'English', Ono_Anna: 'Japanese', Sohee: 'Korean',
  Vivian: 'Chinese', Serena: 'Chinese', Uncle_Fu: 'Chinese',
  Dylan: 'Chinese', Eric: 'Chinese',
};
const inputClass = 'w-full bg-background rounded-lg shadow-neu-pressed px-3.5 py-2.5 text-[12px] leading-relaxed text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40';
const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  <p className="text-[10px] text-text-muted leading-relaxed">{children}</p>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) =>
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.12em]">{label}</span>
    {children}
  </div>;

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config, setConfig, onGenerate, isGenerating, isModelReady, isModelAvailable,
  speakerOptions, languageOptions,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setField = <K extends keyof TTSConfig>(key: K, value: TTSConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));
  const isClone = config.mode === 'clone';
  const canGenerate = config.text.trim().length > 0 &&
    (config.longForm || config.text.length <= 1200) &&
    (!isClone || !!config.refAudioFile) && isModelReady && isModelAvailable;
  const suggested = NATIVE_LANGUAGE[config.speaker];
  const showNativeHint = !isClone && config.language !== 'Auto' &&
    config.language !== suggested;
  return (
    <aside className="w-full md:w-[330px] shrink-0 flex flex-col border-l border-line/70">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg shadow-neu-pressed">
          {([{ mode: 'preset', label: 'Preset', Icon: Wand2 },
            { mode: 'clone', label: 'Clone', Icon: Mic }] as const)
            .map(({ mode, label, Icon }) => (
              <button key={mode} onClick={() => setField('mode', mode)}
                aria-pressed={config.mode === mode}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-bold uppercase tracking-[0.1em] focus-visible:ring-2 focus-visible:ring-accent/45 ${
                  config.mode === mode ? 'shadow-neu-flat text-strong' : 'text-text-muted hover:text-text'
                }`}>
                <Icon size={12} />{label}
              </button>
            ))}
        </div>
        <Select label="Language" options={languageOptions.length ? languageOptions : LANGUAGES} value={config.language}
          onChange={(e) => setField('language', e.target.value)} />
        {!isClone ? <>
          <Select label="Speaker" options={speakerOptions.length ? speakerOptions : SPEAKERS} value={config.speaker}
            onChange={(e) => setField('speaker', e.target.value)} />
          {showNativeHint && <Caption>{config.speaker} is native to {suggested}; matching languages generally sound most natural.</Caption>}
          <Field label="Style instruction">
            <textarea value={config.styleInstruction} maxLength={1000}
              onChange={(e) => setField('styleInstruction', e.target.value)}
              placeholder="Whisper softly; warm, excited, and deliberate…" rows={3}
              className={`${inputClass} resize-none`} />
          </Field>
        </> : <>
          <Field label="Reference audio">
            <input ref={fileInputRef} className="hidden" type="file"
              accept=".wav,.flac,.ogg,.mp3,audio/*"
              onChange={(e) => setField('refAudioFile', e.target.files?.[0] ?? null)} />
            {config.refAudioFile ? <div className="flex items-center gap-2.5 rounded-lg shadow-neu-pressed px-3.5 py-2.5">
              <AudioLines size={14} className="text-text-muted shrink-0" />
              <span className="flex-1 min-w-0 text-[12px] truncate">{config.refAudioFile.name}</span>
              <button onClick={() => { setField('refAudioFile', null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                aria-label="Remove reference audio" className="text-text-muted hover:text-strong"><XIcon size={14}/></button>
            </div> : <button onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg shadow-neu-pressed py-5 text-text-muted hover:text-strong">
              <UploadCloud size={17}/><span className="text-[11px]">Choose voice sample</span>
            </button>}
            <Caption>Use clean single-speaker audio, ideally 3–15 seconds (1–90s and 20MB maximum). WAV or FLAC is most reliable.</Caption>
          </Field>
          <Field label="Reference transcript">
            <textarea value={config.refText} maxLength={5000}
              onChange={(e) => setField('refText', e.target.value)}
              placeholder="Exact words spoken in the reference clip…" rows={3}
              className={`${inputClass} resize-none`} />
            <Caption>{config.refText.trim()
              ? 'High-fidelity in-context cloning: transcript and speech are both used.'
              : 'Quick clone uses speaker embedding only. Add the exact transcript to improve fidelity.'}</Caption>
          </Field>
        </>}
        <div className="border-t border-line/70 pt-4 flex flex-col gap-4">
          <Field label="Quality preset">
            <select className={inputClass} value={config.qualityPreset}
              onChange={(e) => setField('qualityPreset', e.target.value as TTSConfig['qualityPreset'])}>
              <option value="default">Model defaults (recommended baseline)</option>
              <option value="consistent">Consistent (less sampling variation)</option>
              <option value="expressive">Expressive (more variation)</option>
              <option value="custom">Custom generation parameters</option>
            </select>
          </Field>
          {config.qualityPreset === 'custom' && <div className="grid grid-cols-2 gap-3">
            {([
              ['advancedTemperature', 'Temperature (0.1–2)', 0.1, 2, 0.05],
              ['advancedTopP', 'Top P (0–1)', 0.01, 1, 0.05],
              ['advancedTopK', 'Top K (1–200)', 1, 200, 1],
              ['advancedRepetitionPenalty', 'Repetition penalty (1–2)', 1, 2, 0.05],
              ['advancedMaxNewTokens', 'Max new tokens (64–4096)', 64, 4096, 64],
            ] as const).map(([name, label, min, max, step]) =>
              <Field label={label} key={name}>
                <input type="number" value={config[name]} min={min} max={max} step={step}
                  onChange={(e) => setField(name, e.target.value)}
                  placeholder="Model default" className={inputClass}/>
              </Field>
            )}
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Candidate takes">
              <select value={config.candidates} className={inputClass}
                onChange={(e) => setField('candidates', Number(e.target.value))}>
                <option value={1}>1 take</option>
                <option value={2}>2 takes</option>
                <option value={3}>3 takes</option>
              </select>
            </Field>
            <Field label="Seed (optional)">
              <input value={config.seed} inputMode="numeric" placeholder="Random"
                onChange={(e) => setField('seed', e.target.value.replace(/\D/g, '').slice(0, 10))}
                className={inputClass} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={config.longForm}
              onChange={(e) => setField('longForm', e.target.checked)} />
            Long-form mode (up to 20,000 characters)
          </label>
          <Field label="Pause between segments (ms)">
            <input type="number" min={0} max={1500} step={50} value={config.pauseMs}
              onChange={(e) => setField('pauseMs', Math.max(0, Math.min(1500, Number(e.target.value) || 0)))}
              className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={config.normalize}
              onChange={(e) => setField('normalize', e.target.checked)} />
            Normalize output peaks
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={config.trimSilence}
              onChange={(e) => setField('trimSilence', e.target.checked)} />
            Trim excess leading/trailing silence
          </label>
          <Caption>Quality presets are starting points, not universal improvements. Compare takes by listening.</Caption>
        </div>
      </div>
      <div className="p-5 pt-2 flex flex-col gap-2">
        {!isModelAvailable && <Caption>The selected model is missing. Add its weights in Settings or enable downloads.</Caption>}
        <Button variant="primary" size="lg" className="w-full" onClick={onGenerate}
          loading={isGenerating} disabled={!canGenerate}>
          {isGenerating ? 'SYNTHESIZING…' : 'GENERATE'}
        </Button>
      </div>
    </aside>
  );
};
