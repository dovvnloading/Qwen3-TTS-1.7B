import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, X, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { AudioTake, TTSConfig, PlaybackState, AppStatus, AppConfig, ModelState } from './types';
import { SPEAKERS, LANGUAGES } from './constants';
import { TopBar } from './components/TopBar';
import { EditorPanel } from './components/EditorPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerBar } from './components/PlayerBar';
import { SettingsModal } from './components/SettingsModal';
import { Button } from './components/ui/Button';
import { useTheme } from './useTheme';
import { apiFetch, readApiError } from './api';

const initialConfig: TTSConfig = {
  text: '', speaker: SPEAKERS[0], language: LANGUAGES[0], styleInstruction: '',
  mode: 'preset', refAudioFile: null, refText: '',
  qualityPreset: 'default', seed: '', candidates: 1, longForm: false,
  advancedTemperature: '', advancedTopP: '', advancedTopK: '',
  advancedRepetitionPenalty: '', advancedMaxNewTokens: '',
  pauseMs: 250, normalize: false, trimSilence: false,
};
const initialPlayback: PlaybackState = {
  isPlaying: false, progress: 0, duration: 0, currentTime: 0,
  volume: 0.7, muted: false, isReady: false,
};

const App: React.FC = () => {
  const [config, setConfig] = useState<TTSConfig>(initialConfig);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [modelState, setModelState] = useState<ModelState>('loading');
  const [modelDetail, setModelDetail] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [speakerOptions, setSpeakerOptions] = useState<string[]>(SPEAKERS);
  const [languageOptions, setLanguageOptions] = useState<string[]>(LANGUAGES);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
  const [takes, setTakes] = useState<AudioTake[]>([]);
  const [activeTake, setActiveTake] = useState<AudioTake | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const { theme, toggleTheme } = useTheme();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const takesRef = useRef<AudioTake[]>([]);
  const busyRef = useRef(false);
  const modelTypeRef = useRef<string | null>(null);
  const capabilitiesLoadingRef = useRef(false);
  const generateRef = useRef<() => void>(() => {});

  const selectedModel = config.mode === 'clone' ? 'base' : 'custom';
  const isModelAvailable = !!(appConfig?.downloadMode || appConfig?.models[selectedModel]);
  // Model availability is mode-specific. A Base model can still load after
  // an unsuccessful CustomVoice preload and vice versa.
  const canTryGenerate = modelState !== 'loading' && isModelAvailable;

  const refreshAppConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/config');
      if (!res.ok) throw new Error('Configuration could not be loaded');
      setAppConfig(await res.json());
    } catch (e) { console.error('Failed to load app config', e); }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    try {
      const response = await apiFetch('/api/capabilities');
      if (!response.ok) return false;
      const data = await response.json();
      const normalize = (values: unknown, defaults: string[]): string[] =>
        Array.isArray(values)
          ? values.filter((value): value is string => typeof value === 'string')
              .map((value) => defaults.find((item) => item.toLowerCase() === value.toLowerCase()) || value)
          : [];
      const speakers = normalize(data.speakers, SPEAKERS);
      const languages = normalize(data.languages, LANGUAGES);
      if (speakers.length) setSpeakerOptions(speakers);
      if (languages.length) {
        setLanguageOptions([...new Map(
          ['Auto', ...languages].map((value) => [value.toLowerCase(), value])
        ).values()]);
      }
      return true;
    } catch (e) {
      console.warn('Capabilities unavailable; using built-in options', e);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const poll = async () => {
      // Never allow a stalled HTTP request to stop the status poll permanently.
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 7000);
      try {
        const res = await apiFetch('/api/status', { signal: controller.signal });
        if (!res.ok) throw new Error('Status endpoint unavailable');
        const data = await res.json();
        if (cancelled) return;
        failures = 0;
        setModelState(data.status);
        setModelDetail(data.detail || '');
        if (data.modelType && data.modelType !== modelTypeRef.current
            && !capabilitiesLoadingRef.current) {
          capabilitiesLoadingRef.current = true;
          const type = data.modelType as string;
          void refreshCapabilities().then((ok) => {
            if (ok) modelTypeRef.current = type;
          }).finally(() => { capabilitiesLoadingRef.current = false; });
        }
      } catch {
        if (++failures >= 3 && !cancelled) {
          setModelState('error');
          setModelDetail('Local backend is unreachable. Check the server console.');
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!cancelled) timer = window.setTimeout(poll, 1500);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refreshCapabilities]);

  const retryLoad = useCallback(async () => {
    setModelState('loading');
    setModelDetail(`Loading ${selectedModel === 'base' ? 'Voice Clone' : 'CustomVoice'} model…`);
    try {
      const res = await apiFetch(`/api/load?model_type=${selectedModel}`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Load failed'));
      }
    } catch (e) {
      setModelState('error');
      setModelDetail(e instanceof Error ? e.message : String(e));
    }
  }, [selectedModel]);

  useEffect(() => {
    refreshAppConfig();
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;
    const onEnded = () => setPlayback((p) => ({ ...p, isPlaying: false, progress: 100 }));
    const onPlaying = () => setPlayback((p) => ({ ...p, isPlaying: true }));
    const onPause = () => setPlayback((p) => ({ ...p, isPlaying: false }));
    const onTime = () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      setPlayback((p) => ({ ...p,
        currentTime: audio.currentTime,
        progress: dur > 0 ? audio.currentTime / dur * 100 : 0,
      }));
    };
    const onMeta = () => setPlayback((p) => ({
      ...p, duration: Number.isFinite(audio.duration) ? audio.duration : 0, isReady: true,
    }));
    const onError = () => setError('This generated audio could not be decoded by the player.');
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('error', onError);
    return () => {
      audio.pause();
      for (const [event, listener] of [
        ['ended', onEnded], ['playing', onPlaying], ['pause', onPause],
        ['timeupdate', onTime], ['loadedmetadata', onMeta],
        ['durationchange', onMeta], ['error', onError],
      ] as const) audio.removeEventListener(event, listener);
      takesRef.current.forEach((take) => URL.revokeObjectURL(take.url));
    };
  }, [refreshAppConfig]);

  const selectTake = (take: AudioTake) => {
    const audio = audioRef.current;
    setActiveTake(take);
    if (!audio) return;
    audio.pause();
    setPlayback((p) => ({ ...p, isPlaying: false, isReady: false,
      progress: 0, currentTime: 0, duration: 0 }));
    audio.src = take.url;
    audio.load();
    audio.play().catch(() => { /* Playback may be blocked; manual Play is available. */ });
  };

  const addTake = (take: AudioTake) => {
    const next = [take, ...takesRef.current].slice(0, 12);
    const removed = takesRef.current.filter((old) => !next.some((item) => item.id === old.id));
    removed.forEach((old) => URL.revokeObjectURL(old.url));
    takesRef.current = next;
    setTakes(next);
  };

  const handleGenerate = async () => {
    if (busyRef.current || !config.text.trim() || !canTryGenerate) return;
    if (config.mode === 'clone' && !config.refAudioFile) return;
    if (config.text.length > 20000) {
      setError('Text exceeds the 20,000-character maximum.');
      return;
    }
    if (!config.longForm && config.text.length > 1200) {
      setError('Enable Long-form mode to synthesize more than 1,200 characters.');
      return;
    }
    if (config.seed && Number(config.seed) > 2147483647) {
      setError('Seed must be between 0 and 2147483647.');
      return;
    }
    busyRef.current = true;
    setStatus(AppStatus.GENERATING);
    setError(null);
    const count = Math.max(1, Math.min(3, config.candidates));
    // One default take leaves stochastic Qwen settings untouched if no seed
    // was entered. Multiple candidates require independent, recorded seeds.
    const baseSeed = config.seed ? Number(config.seed)
      : count > 1 ? Math.floor(Math.random() * 2147483600) : null;
    let successes = 0;
    const completedTakes: AudioTake[] = [];
    try {
      for (let index = 0; index < count; index++) {
        setGenerationProgress(`Generating take ${index + 1} of ${count}…`);
        const form = new FormData();
        form.append('text', config.text);
        form.append('language', config.language);
        if (config.mode === 'clone' && config.refAudioFile) {
          form.append('speaker', 'Voice Clone');
          form.append('ref_audio', config.refAudioFile);
          if (config.refText.trim()) form.append('ref_text', config.refText.trim());
        } else {
          form.append('speaker', config.speaker);
          if (config.styleInstruction.trim())
            form.append('styleInstruction', config.styleInstruction.trim());
        }
        form.append('long_form', String(config.longForm));
        form.append('pause_ms', String(config.pauseMs));
        form.append('normalize', String(config.normalize));
        form.append('trim_silence', String(config.trimSilence));
        if (config.qualityPreset === 'consistent') {
          form.append('temperature', '0.65');
          form.append('top_p', '0.85');
          form.append('repetition_penalty', '1.10');
        } else if (config.qualityPreset === 'expressive') {
          form.append('temperature', '1.05');
          form.append('top_p', '0.98');
          form.append('repetition_penalty', '1.02');
        }
        if (config.qualityPreset === 'custom') {
          for (const [name, setting] of [
            ['temperature', config.advancedTemperature],
            ['top_p', config.advancedTopP],
            ['top_k', config.advancedTopK],
            ['repetition_penalty', config.advancedRepetitionPenalty],
            ['max_new_tokens', config.advancedMaxNewTokens],
          ] as const) {
            if (setting.trim()) form.append(name, setting);
          }
        }
        const seed = baseSeed === null ? null : (baseSeed + index) % 2147483648;
        if (seed !== null) form.append('seed', String(seed));
        const response = await apiFetch('/api/generate', { method: 'POST', body: form });
        if (!response.ok) {
          throw new Error(await readApiError(response, `Server error (${response.status})`));
        }
        const blob = await response.blob();
        if (blob.size < 44) throw new Error('The server returned empty audio.');
        const take: AudioTake = {
          id: `${Date.now()}-${index}`,
          clipId: response.headers.get('X-TTS-Clip-ID'),
          text: config.text,
          speaker: config.mode === 'clone' ? 'Voice clone' : config.speaker,
          seed,
          createdAt: Date.now(),
          url: URL.createObjectURL(blob),
          blob,
          label: `Take ${index + 1} · ${config.mode === 'clone' ? 'Clone' : config.speaker}`,
          rtf: response.headers.get('X-TTS-RTF')
            ? Number(response.headers.get('X-TTS-RTF')) : null,
        };
        addTake(take);
        completedTakes.push(take);
        successes++;
      }
      setStatus(AppStatus.SUCCESS);
      refreshAppConfig();
    } catch (err) {
      console.error('Generation failed', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(successes ? AppStatus.SUCCESS : AppStatus.ERROR);
    } finally {
      // Avoid cutting off each candidate's playback while subsequent takes
      // are still generating. Play the first complete candidate only once.
      if (completedTakes.length) selectTake(completedTakes[0]);
      busyRef.current = false;
      setGenerationProgress('');
    }
  };
  generateRef.current = handleGenerate;

  const handlePlayPause = () => {
    const el = audioRef.current;
    if (!el || !playback.isReady) return;
    if (el.paused) {
      el.play().catch((e) => setError(`Cannot play audio: ${String(e)}`));
    } else el.pause();
  };
  const handleSeek = (time: number) => {
    const el = audioRef.current;
    if (el && Number.isFinite(time)) el.currentTime = time;
  };
  const handleRestart = () => {
    if (audioRef.current && playback.isReady) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => setError(String(e)));
    }
  };
  const handleVolume = (volume: number) => {
    const el = audioRef.current;
    setPlayback((p) => ({ ...p, volume, muted: volume > 0 ? false : p.muted }));
    if (el) { el.volume = volume; if (volume > 0) el.muted = false; }
  };
  const handleToggleMute = () => {
    const muted = !playback.muted;
    setPlayback((p) => ({ ...p, muted }));
    if (audioRef.current) audioRef.current.muted = muted;
  };
  const handleSave = async () => {
    if (!activeTake) return;
    const name = `qwen3-tts-${activeTake.speaker.replace(/[^\w-]/g, '_')}-${activeTake.createdAt}.wav`;
    const bridge = (window as any).pywebview?.api?.save_audio;
    if (bridge && activeTake.clipId) {
      try {
        const result = await bridge(activeTake.clipId, name);
        if (result?.saved) return;
        if (result?.error) {
          setError(`Native Save failed: ${result.error}. Falling back to download.`);
        } else {
          return; // User cancelled the native Save dialog.
        }
      } catch (err) {
        setError(`Native Save failed: ${String(err)}. Falling back to download.`);
      }
    }
    const link = document.createElement('a');
    link.href = activeTake.url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  };
  const handleConfigSaved = () => { refreshAppConfig(); retryLoad(); };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-text overflow-hidden font-sans">
      <TopBar modelState={modelState} modelDetail={modelDetail} theme={theme}
        onToggleTheme={toggleTheme} onOpenSettings={() => setIsSettingsOpen(true)} />
      {modelState === 'error' && <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-danger-line bg-danger-bg">
        <AlertTriangle size={15} className="text-danger-text mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-[11px]">
          <strong>Model not loaded:</strong> {modelDetail || 'Model could not load.'}
        </div>
        <Button size="sm" onClick={() => setIsSettingsOpen(true)}><SlidersHorizontal size={12}/> Settings</Button>
        <Button size="sm" onClick={retryLoad}><RefreshCw size={12}/> Retry</Button>
      </div>}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <EditorPanel text={config.text}
            onChange={(value) => setConfig((p) => ({ ...p, text: value }))}
            onSubmit={() => generateRef.current()} />
          {takes.length > 0 && <div className="shrink-0 px-5 pb-4 border-t border-line/50 max-h-40 overflow-auto">
            <div className="text-[10px] font-bold uppercase text-text-muted tracking-[.12em] py-2">
              Recent takes · select to play / save
            </div>
            <div className="flex gap-2 flex-wrap">
              {takes.map((take) => <button key={take.id} onClick={() => selectTake(take)}
                title={`${take.text.slice(0, 120)} · seed ${take.seed ?? 'random'}`}
                className={`text-[11px] px-3 py-2 rounded-lg border border-line/70 text-left ${
                  activeTake?.id === take.id ? 'shadow-neu-pressed text-strong' : 'shadow-neu-flat text-text-muted'
                }`}>
                {take.label}{take.seed !== null ? ` · #${take.seed}` : ''}
                {take.rtf !== null ? ` · RTF ${take.rtf.toFixed(2)}` : ''}
              </button>)}
            </div>
          </div>}
        </div>
        <SettingsPanel config={config} setConfig={setConfig} onGenerate={handleGenerate}
          speakerOptions={speakerOptions} languageOptions={languageOptions}
          isGenerating={status === AppStatus.GENERATING}
          isModelReady={canTryGenerate} isModelAvailable={isModelAvailable} />
        {(error || generationProgress) && <div className="absolute bottom-3 left-4 right-4 md:right-[350px] rounded-lg border border-line bg-background shadow-neu-flat px-3 py-2.5 flex items-start gap-2">
          {error && <AlertTriangle size={14} className="text-danger-text mt-0.5 shrink-0"/>}
          <span role={error ? 'alert' : 'status'} className="text-[11px] flex-1 break-words">{error || generationProgress}</span>
          {error && <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={13}/></button>}
        </div>}
      </div>
      <PlayerBar theme={theme} audioBlob={activeTake?.blob || null}
        playback={playback} onPlayPause={handlePlayPause} onSeek={handleSeek}
        onVolumeChange={handleVolume} onToggleMute={handleToggleMute}
        onRestart={handleRestart} onSave={handleSave} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}
        appConfig={appConfig} onSaved={handleConfigSaved} />
    </div>
  );
};
export default App;
