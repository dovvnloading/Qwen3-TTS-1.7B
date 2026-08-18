import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full group">
      <label className="text-[10px] font-bold text-text-muted uppercase tracking-[0.12em] pl-0.5">
        {label}
      </label>
      <div className="relative">
        <select
          className={`
            w-full appearance-none bg-background text-text rounded-lg pl-3.5 pr-9 py-2.5
            shadow-neu-pressed border-none outline-none cursor-pointer
            text-[13px] font-medium transition-colors
            focus-visible:ring-2 focus-visible:ring-accent/40 hover:text-strong
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-hover:text-text transition-colors"
        />
      </div>
    </div>
  );
};
