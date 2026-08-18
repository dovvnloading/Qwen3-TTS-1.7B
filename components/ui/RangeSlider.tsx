import React from 'react';

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({
  value,
  min,
  max,
  onChange,
  disabled,
  className = '',
}) => {
  const span = max - min;
  const percentage = span > 0 ? ((value - min) / span) * 100 : 0;

  return (
    <div
      className={`group relative h-5 flex items-center ${className} ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {/* Inset track */}
      <div className="absolute w-full h-1.5 bg-background rounded-full shadow-neu-slider-track overflow-hidden">
        <div
          className="h-full bg-white/25 group-hover:bg-white/40 transition-colors"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="absolute w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
      />

      {/* Raised thumb */}
      <div
        className="absolute w-3.5 h-3.5 bg-background rounded-full shadow-neu-slider-thumb pointer-events-none transition-transform group-hover:scale-110"
        style={{ left: `calc(${percentage}% - 7px)` }}
      />
    </div>
  );
};
