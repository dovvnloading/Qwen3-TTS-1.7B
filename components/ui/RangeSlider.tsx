import React from 'react';

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Width of the slider handle. The native <input type="range"> thumb is sized to
 * match in index.css, because the browser insets the usable track by half a
 * thumb at each end when turning a click position into a value. Drawing the
 * visual thumb with plain `left: pct%` ignores that inset, so the handle drifts
 * away from the cursor — worst at the two ends. Keep both in sync.
 */
const THUMB_PX = 14;

export const RangeSlider: React.FC<RangeSliderProps> = ({
  value,
  min,
  max,
  onChange,
  disabled,
  className = '',
}) => {
  const span = max - min;
  const fraction = span > 0 ? Math.min(Math.max((value - min) / span, 0), 1) : 0;
  const percentage = fraction * 100;

  // Mirrors the browser's own mapping: thumb left edge = fraction * (W - THUMB).
  const thumbLeft = `calc(${percentage}% - ${fraction * THUMB_PX}px)`;
  // Fill should stop under the middle of the thumb, not at the raw percentage.
  const fillWidth = `calc(${percentage}% - ${fraction * THUMB_PX - THUMB_PX / 2}px)`;

  return (
    <div
      className={`group relative h-5 flex items-center ${className} ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {/* Inset track */}
      <div className="absolute w-full h-1.5 bg-background rounded-full shadow-neu-slider-track overflow-hidden">
        <div
          className="h-full bg-track-fill/70 group-hover:bg-track-fill transition-colors"
          style={{ width: fillWidth }}
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
        className="absolute rounded-full bg-background shadow-neu-slider-thumb pointer-events-none transition-transform group-hover:scale-110"
        style={{ left: thumbLeft, width: THUMB_PX, height: THUMB_PX }}
      />
    </div>
  );
};
