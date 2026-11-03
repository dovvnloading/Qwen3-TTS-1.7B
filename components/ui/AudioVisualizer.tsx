import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  audioBlob: Blob | null;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  theme?: string;
  className?: string;
}

/** Extract actual peaks from the PCM16 WAV written by the Python backend. */
function wavPeaks(buffer: ArrayBuffer, bars = 480): number[] {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || view.getUint32(0, false) !== 0x52494646
      || view.getUint32(8, false) !== 0x57415645) return [];
  let offset = 12, channels = 0, blockAlign = 0, bits = 0, format = 0;
  let dataOffset = -1, dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (size > view.byteLength - start) break;
    if (id === 0x666d7420 && size >= 16) { // fmt
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      blockAlign = view.getUint16(start + 12, true);
      bits = view.getUint16(start + 14, true);
    }
    if (id === 0x64617461) { dataOffset = start; dataSize = size; break; }
    offset = start + size + (size % 2);
  }
  if (format !== 1 || bits !== 16 || channels < 1 || !blockAlign || dataOffset < 0) return [];
  const frames = Math.floor(dataSize / blockAlign);
  if (!frames) return [];
  const values: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor(bar * frames / bars);
    const end = Math.max(start + 1, Math.floor((bar + 1) * frames / bars));
    const stride = Math.max(1, Math.floor((end - start) / 160));
    let maxPeak = 0;
    for (let i = start; i < end; i += stride) {
      // Using the loudest channel avoids making opposite-phase stereo vanish.
      for (let c = 0; c < channels; c++) {
        const sample = Math.abs(view.getInt16(dataOffset + i * blockAlign + c * 2, true)) / 32768;
        if (sample > maxPeak) maxPeak = sample;
      }
    }
    values.push(maxPeak);
  }
  return values;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioBlob, duration, currentTime, onSeek, theme, className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const fraction = Number.isFinite(duration) && duration > 0
    ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  useEffect(() => {
    let cancelled = false;
    setPeaks([]);
    if (audioBlob) {
      audioBlob.arrayBuffer().then((buffer) => {
        if (!cancelled) setPeaks(wavPeaks(buffer));
      }).catch(() => { if (!cancelled) setPeaks([]); });
    }
    return () => { cancelled = true; };
  }, [audioBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let retries = 0;
    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) {
        if (retries++ < 60) frame = requestAnimationFrame(paint);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const css = getComputedStyle(canvas);
      const played = css.getPropertyValue('--app-accent').trim() || '#d97757';
      const unplayed = css.getPropertyValue('--app-text-muted').trim() || '#7a7a7a';
      const count = Math.max(1, Math.floor(width / 4));
      for (let i = 0; i < count; i++) {
        const peak = peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor(i * peaks.length / count))] : 0.04;
        const barHeight = Math.max(2, Math.min(height - 2, peak * height * 0.9));
        ctx.fillStyle = i / count <= fraction ? played : unplayed;
        ctx.fillRect(i * (width / count), (height - barHeight) / 2, Math.max(1, width / count - 1), barHeight);
      }
    };
    paint();
    const observer = new ResizeObserver(() => { retries = 0; paint(); });
    observer.observe(canvas);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [peaks, fraction, theme]);

  const pointerSeek = (clientX: number) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds?.width || !Number.isFinite(duration) || duration <= 0) return;
    onSeek(Math.max(0, Math.min(duration, (clientX - bounds.left) / bounds.width * duration)));
  };
  return (
    <canvas ref={canvasRef} className={`w-full h-full cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-accent/50 ${className}`}
      role="slider" tabIndex={audioBlob ? 0 : -1}
      aria-label="Audio waveform seek" aria-valuemin={0} aria-valuemax={Math.floor(duration || 0)}
      aria-valuenow={Math.floor(currentTime)} aria-disabled={!audioBlob}
      onPointerDown={(e) => {
        if (!audioBlob) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerSeek(e.clientX);
      }}
      onPointerMove={(e) => { if (audioBlob && e.buttons) pointerSeek(e.clientX); }}
      onKeyDown={(e) => {
        if (!audioBlob) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onSeek(Math.min(duration, Math.max(0, currentTime + (e.key === 'ArrowRight' ? 5 : -5))));
        }
      }} />
  );
};
