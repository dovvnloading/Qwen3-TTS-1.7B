import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-3 w-full group">
      <label className="text-xs font-bold text-text-muted uppercase tracking-widest pl-2">
        {label}
      </label>
      <div className="relative">
        <select
          className={`
            w-full appearance-none bg-background text-text rounded-xl px-6 py-4 pr-12
            shadow-neu-pressed border-none outline-none transition-all duration-200
            focus:text-white cursor-pointer text-sm font-semibold
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
        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-hover:text-white transition-colors">
          <ChevronDown size={18} />
        </div>
      </div>
    </div>
  );
};