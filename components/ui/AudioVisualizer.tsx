import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let step = 0;

    // Match the backing store to the element's real size so bars stay crisp.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const barWidth = 3;
      const gap = 3;
      const barCount = Math.floor(width / (barWidth + gap));
      const mid = height / 2;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
      gradient.addColorStop(0.5, 'rgba(190,190,190,0.75)');
      gradient.addColorStop(1, 'rgba(110,110,110,0.6)');
      ctx.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        let barHeight: number;

        if (isPlaying) {
          const t = step + i * 0.15;
          const noise = Math.sin(t) * Math.sin(t * 0.5) * Math.cos(t * 0.3);
          const amplitude = Math.abs(noise) + Math.random() * 0.08;
          // Taper the edges so the waveform reads as a contained clip.
          const window = Math.sin((i / barCount) * Math.PI);
          barHeight = Math.max(2, amplitude * height * 0.85 * window);
        } else {
          barHeight = 2;
        }

        const x = i * (barWidth + gap);
        const y = mid - barHeight / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, 2);
        else ctx.rect(x, y, barWidth, barHeight);
        ctx.fill();
      }
    };

    const loop = () => {
      step += 0.2;
      paint();
      animationId = requestAnimationFrame(loop);
    };

    resize();
    if (isPlaying) {
      loop();
    } else {
      // Idle draws a single flat frame — no animation loop burning frames
      // while the app just sits there.
      paint();
    }

    const observer = new ResizeObserver(() => {
      resize();
      paint();
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [isPlaying]);

  return (
    <div className={`relative rounded-lg bg-background overflow-hidden ${className}`}>
      <div className="absolute inset-0 shadow-neu-pressed rounded-lg pointer-events-none z-10" />
      <canvas ref={canvasRef} className="w-full h-full relative z-0" />
    </div>
  );
};
