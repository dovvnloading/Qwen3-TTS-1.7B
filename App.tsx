import React, { useState, useEffect, useRef } from 'react';
import { TTSConfig, PlaybackState, AppStatus } from './types';
import { SPEAKERS, LANGUAGES } from './constants';
import { EditorPanel } from './components/EditorPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerBar } from './components/PlayerBar';

const App: React.FC = () => {
  // --- State ---
  const [config, setConfig] = useState<TTSConfig>({
    text: "",
    speaker: SPEAKERS[5], // Default to Ryan
    language: LANGUAGES[0], // Auto
    styleInstruction: ""
  });

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isModelReady, setIsModelReady] = useState(false);
  
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    progress: 0,
    duration: 0,
    currentTime: 0,
    volume: 0.7,
    isReady: false
  });

  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Initialization & Audio Event Listeners ---
  useEffect(() => {
    // Check backend status
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.status === 'ready') {
          setIsModelReady(true);
          setStatus(AppStatus.IDLE);
        } else {
          setTimeout(checkStatus, 2000); // Poll every 2s until ready
        }
      } catch (e) {
        console.error("Backend not reachable", e);
        setTimeout(checkStatus, 2000);
      }
    };
    checkStatus();

    // Audio Element Setup
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.7;

    const handleEnded = () => {
      setPlayback(prev => ({ ...prev, isPlaying: false, currentTime: 0, progress: 0 }));
    };
    
    const handleTimeUpdate = () => {
      if (audioRef.current) {
        const current = audioRef.current.currentTime;
        const duration = audioRef.current.duration || 1;
        setPlayback(prev => ({ 
          ...prev, 
          currentTime: current, 
          progress: (current / duration) * 100 
        }));
      }
    };

    const handleLoadedMetadata = () => {
       if (audioRef.current) {
         setPlayback(prev => ({ ...prev, duration: audioRef.current?.duration || 0, isReady: true }));
       }
    };

    // Attach Listeners
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.pause();
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (audio.src) {
        URL.revokeObjectURL(audio.src);
      }
    };
  }, []);

  // --- Logic: Generate Audio via API ---
  const handleGenerate = async () => {
    if (!config.text.trim()) return;

    setStatus(AppStatus.GENERATING);
    setPlayback(prev => ({ ...prev, isReady: false, isPlaying: false, currentTime: 0, duration: 0 }));
    
    // Clean up previous blob to avoid memory leaks
    if (audioRef.current && audioRef.current.src) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current.src = "";
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: config.text,
          speaker: config.speaker,
          language: config.language,
          styleInstruction: config.styleInstruction
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Server Error");
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load(); // Ensure metadata loads
        setStatus(AppStatus.SUCCESS);
        // Auto-play on success
        audioRef.current.play().then(() => {
             setPlayback(prev => ({ ...prev, isPlaying: true, isReady: true }));
        }).catch(err => {
             console.warn("Auto-play blocked", err);
             setPlayback(prev => ({ ...prev, isReady: true }));
        });
      }

    } catch (error) {
      console.error("Generation Failed:", error);
      setStatus(AppStatus.ERROR);
      alert(`Generation Failed: ${error}`);
    }
  };

  // --- Logic: Player Controls ---
  const handlePlayPause = () => {
    if (!audioRef.current || !playback.isReady) return;

    if (playback.isPlaying) {
      audioRef.current.pause();
      setPlayback(prev => ({ ...prev, isPlaying: false }));
    } else {
      audioRef.current.play();
      setPlayback(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const handleSeek = (time: number) => {
    setPlayback(prev => ({ ...prev, currentTime: time }));
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolume = (vol: number) => {
    setPlayback(prev => ({ ...prev, volume: vol }));
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-text overflow-hidden font-sans selection:bg-white selection:text-black">
      
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <EditorPanel 
          text={config.text} 
          onChange={(val) => setConfig(prev => ({ ...prev, text: val }))} 
        />
        <SettingsPanel 
          config={config} 
          setConfig={setConfig} 
          onGenerate={handleGenerate}
          isGenerating={status === AppStatus.GENERATING}
          isModelReady={isModelReady}
        />
      </div>

      {/* Bottom Player */}
      <PlayerBar 
        status={status}
        playback={playback}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onVolumeChange={handleVolume}
      />

    </div>
  );
};

export default App;