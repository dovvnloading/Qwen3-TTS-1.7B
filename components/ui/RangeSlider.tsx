import React from 'react';

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({ value, min, max, onChange, disabled, className = '' }) => {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`relative h-10 flex items-center ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      
      {/* Neumorphic Track (Inset) */}
      <div className="absolute w-full h-3 bg-background rounded-full shadow-neu-slider-track overflow-hidden">
        {/* Fill (Optional, usually neomorphism sliders are just the knob, but let's add a subtle fill) */}
        <div 
          className="h-full bg-gray-700/30 transition-all duration-100" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* Interactive Input */}
      <input 
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="absolute w-full h-full opacity-0 cursor-pointer z-10"
      />

      {/* Neumorphic Thumb (Floating above) */}
      <div 
        className="absolute w-6 h-6 bg-background rounded-full shadow-neu-slider-thumb pointer-events-none border border-gray-700/20"
        style={{ left: `calc(${percentage}% - 12px)` }}
      />
    </div>
  );
};