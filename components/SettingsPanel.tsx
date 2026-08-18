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
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-bold text-text-muted uppercase tracking-[0.12em] pl-0.5">
      {label}
    </label>
    {children}
  </div>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  setConfig,
  onGenerate,
  isGenerating,
  isModelReady,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (field: keyof TTSConfig, value: string) =>
    setConfig((prev) => ({ ...prev, [field]: value }));

  const setMode = (mode: 'preset' | 'clone') => setConfig((prev) => ({ ...prev, mode }));

  const isClone = config.mode === 'clone';
  const canGenerate = config.text.trim().length > 0 && (!isClone || !!config.refAudioFile);

  const textareaClass =
    'w-full bg-background rounded-lg shadow-neu-pressed px-3.5 py-2.5 text-[13px] leading-relaxed ' +
    'text-text placeholder:text-text-muted/70 outline-none resize-none border-none ' +
    'focus-visible:ring-2 focus-visible:ring-white/20';

  return (
    <aside className="w-full md:w-[330px] shrink-0 flex flex-col border-l border-line/70">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* Mode: segmented control */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg shadow-neu-pressed">
          {(
            [
              { key: 'preset', label: 'Preset', Icon: Wand2 },
              { key: 'clone', label: 'Clone', Icon: Mic },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              aria-pressed={config.mode === key}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-bold uppercase tracking-[0.1em] transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                config.mode === key
                  ? 'bg-background shadow-neu-flat text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        <Select
          label="Language"
          options={LANGUAGES}
          value={config.language}
          onChange={(e) => handleChange('language', e.target.value)}
        />

        {!isClone ? (
          <>
            <Select
              label="Speaker"
              options={SPEAKERS}
              value={config.speaker}
              onChange={(e) => handleChange('speaker', e.target.value)}
            />

            <Field label="Style Instruction">
              <textarea
                value={config.styleInstruction}
                onChange={(e) => handleChange('styleInstruction', e.target.value)}
                placeholder="e.g. whispering, excited, urgent…"
                rows={3}
                className={textareaClass}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Reference Audio">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => setConfig((p) => ({ ...p, refAudioFile: e.target.files?.[0] ?? null }))}
                className="hidden"
              />
              {config.refAudioFile ? (
                <div className="flex items-center gap-2.5 rounded-lg shadow-neu-pressed px-3.5 py-2.5">
                  <AudioLines size={14} className="text-text-muted shrink-0" />
                  <span className="flex-1 min-w-0 text-[12px] text-text truncate">
                    {config.refAudioFile.name}
                  </span>
                  <button
                    onClick={() => setConfig((p) => ({ ...p, refAudioFile: null }))}
                    aria-label="Remove reference audio"
                    className="text-text-muted hover:text-white shrink-0 transition-colors"
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-lg shadow-neu-pressed py-5
                             text-text-muted hover:text-text transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  <UploadCloud size={17} />
                  <span className="text-[11px] font-semibold">Upload a voice sample</span>
                </button>
              )}
            </Field>

            <Field label="Reference Text">
              <textarea
                value={config.refText}
                onChange={(e) => handleChange('refText', e.target.value)}
                placeholder="Transcript of the sample — optional, improves fidelity"
                rows={3}
                className={textareaClass}
              />
            </Field>
          </>
        )}
      </div>

      <div className="p-5 pt-0">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={onGenerate}
          loading={isGenerating}
          disabled={!isModelReady || !canGenerate}
        >
          {isGenerating ? 'SYNTHESIZING…' : 'GENERATE'}
        </Button>
      </div>
    </aside>
  );
};
