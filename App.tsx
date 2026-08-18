import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { TTSConfig, PlaybackState, AppStatus, AppConfig } from './types';
import { SPEAKERS, LANGUAGES } from './constants';
import { TopBar } from './components/TopBar';
import { EditorPanel } from './components/EditorPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerBar } from './components/PlayerBar';
import { SettingsModal } from './components/SettingsModal';

const App: React.FC = () => {
  const [config, setConfig] = useState<TTSConfig>({
    text: '',
    speaker: SPEAKERS[0],
    language: LANGUAGES[0],
    styleInstruction: '',
    mode: 'preset',
    refAudioFile: null,
    refText: '',
  });

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    progress: 0,
    duration: 0,
    currentTime: 0,
    volume: 0.7,
    isReady: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Kept in a ref so the Ctrl+Enter handler never fires a stale closure.
  const generateRef = useRef<() => void>(() => {});

  const refreshAppConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      setAppConfig(await res.json());
    } catch (e) {
      console.error('Failed to load app config', e);
    }
  }, []);

  const waitForBackend = useCallback((onReady: () => void) => {
    const poll = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.status === 'ready') onReady();
        else setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 2000); // backend not up yet
      }
    };
    poll();
  }, []);

  useEffect(() => {
    waitForBackend(() => {
      setIsModelReady(true);
      setStatus(AppStatus.IDLE);
    });
    refreshAppConfig();

    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;

    const handleEnded = () =>
      setPlayback((p) => ({ ...p, isPlaying: false, currentTime: 0, progress: 0 }));

    const handleTimeUpdate = () => {
      const el = audioRef.current;
      if (!el) return;
      const duration = el.duration || 1;
      setPlayback((p) => ({
        ...p,
        currentTime: el.currentTime,
        progress: (el.currentTime / duration) * 100,
      }));
    };

    const handleLoadedMetadata = () =>
      setPlayback((p) => ({ ...p, duration: audioRef.current?.duration || 0, isReady: true }));

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.pause();
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (audio.src) URL.revokeObjectURL(audio.src);
    };
  }, [waitForBackend, refreshAppConfig]);

  const handleConfigSaved = useCallback(
    (restarting: boolean) => {
      if (!restarting) {
        refreshAppConfig();
        return;
      }
      setIsRestarting(true);
      setIsModelReady(false);
      // Let the old process actually exit before polling the new one.
      setTimeout(() => {
        waitForBackend(() => {
          setIsRestarting(false);
          setIsModelReady(true);
          setStatus(AppStatus.IDLE);
          refreshAppConfig();
        });
      }, 2000);
    },
    [waitForBackend, refreshAppConfig],
  );

  const handleGenerate = async () => {
    if (!config.text.trim()) return;
    if (config.mode === 'clone' && !config.refAudioFile) return;
    if (!isModelReady || status === AppStatus.GENERATING) return;

    setStatus(AppStatus.GENERATING);
    setError(null);
    setPlayback((p) => ({ ...p, isReady: false, isPlaying: false, currentTime: 0, duration: 0 }));

    if (audioRef.current?.src) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current.src = '';
    }

    try {
      const formData = new FormData();
      formData.append('text', config.text);
      formData.append('language', config.language);

      if (config.mode === 'clone' && config.refAudioFile) {
        formData.append('speaker', 'Voice Clone');
        formData.append('ref_audio', config.refAudioFile);
        if (config.refText.trim()) formData.append('ref_text', config.refText);
      } else {
        formData.append('speaker', config.speaker);
        if (config.styleInstruction.trim())
          formData.append('styleInstruction', config.styleInstruction);
      }

      const response = await fetch('/api/generate', { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${response.status})`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        setStatus(AppStatus.SUCCESS);
        audioRef.current
          .play()
          .then(() => setPlayback((p) => ({ ...p, isPlaying: true, isReady: true })))
          .catch(() => setPlayback((p) => ({ ...p, isReady: true })));
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setStatus(AppStatus.ERROR);
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  generateRef.current = handleGenerate;

  const handlePlayPause = () => {
    const el = audioRef.current;
    if (!el || !playback.isReady) return;
    if (playback.isPlaying) {
      el.pause();
      setPlayback((p) => ({ ...p, isPlaying: false }));
    } else {
      el.play();
      setPlayback((p) => ({ ...p, isPlaying: true }));
    }
  };

  const handleSeek = (time: number) => {
    setPlayback((p) => ({ ...p, currentTime: time }));
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handleVolume = (vol: number) => {
    setPlayback((p) => ({ ...p, volume: vol }));
    if (audioRef.current) audioRef.current.volume = vol;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-text overflow-hidden font-sans selection:bg-white selection:text-black">
      <TopBar isModelReady={isModelReady} onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <EditorPanel
          text={config.text}
          onChange={(val) => setConfig((p) => ({ ...p, text: val }))}
          onSubmit={() => generateRef.current()}
        />
        <SettingsPanel
          config={config}
          setConfig={setConfig}
          onGenerate={handleGenerate}
          isGenerating={status === AppStatus.GENERATING}
          isModelReady={isModelReady}
        />

        {error && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md flex items-start gap-2.5 rounded-lg border border-red-400/30 bg-[#2a1f1f] px-3.5 py-2.5 shadow-neu-flat">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="flex-1 text-[11px] leading-relaxed text-text/90 break-words">{error}</p>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-text-muted hover:text-white shrink-0 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      <PlayerBar
        playback={playback}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onVolumeChange={handleVolume}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appConfig={appConfig}
        onSaved={handleConfigSaved}
      />

      {isRestarting && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <div className="text-[11px] font-bold text-white tracking-[0.12em] uppercase">
            Applying settings &amp; restarting
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
