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

    let animationId: number;
    let step = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      // Configuration
      const barWidth = 4;
      const gap = 3;
      const barCount = Math.floor(width / (barWidth + gap));
      
      // Gradient for bars
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#ffffff'); // Top (bright)
      gradient.addColorStop(0.5, '#a0a0a0'); 
      gradient.addColorStop(1, '#505050'); // Bottom (darker)
      ctx.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 2; // Minimum height
        
        if (isPlaying) {
            // Complex sine wave simulation for "natural" look
            const t = step + i * 0.15;
            const noise = Math.sin(t) * Math.sin(t * 0.5) * Math.cos(t * 0.3);
            const amplitude = Math.abs(noise) + Math.random() * 0.1;
            
            // Apply a window function (Hanning-ish) to taper edges
            const window = Math.sin((i / barCount) * Math.PI);
            
            barHeight = Math.max(2, amplitude * height * 0.9 * window);
        } else {
            // Idle animation: subtle wave
            const t = step * 0.05 + i * 0.1;
            barHeight = 4 + Math.sin(t) * 2;
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2; // Center vertically
        
        // Draw Pill Shape
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, barHeight, 50);
        } else {
            ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }
      
      step += isPlaying ? 0.2 : 0.5;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isPlaying]);

  return (
    <div className={`relative rounded-xl bg-background ${className}`}>
        {/* Deep Inset Shadow for the "Screen" look */}
        <div className="absolute inset-0 shadow-neu-pressed rounded-xl pointer-events-none z-10 opacity-80"></div>
        {/* Inner Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent rounded-xl pointer-events-none z-0"></div>
        
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={64} 
            className="w-full h-full opacity-90 relative z-0"
        />
    </div>
  );
};