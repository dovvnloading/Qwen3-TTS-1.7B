import React, { ButtonHTMLAttributes } from 'react';

interface NeumorphicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'primary' | 'secondary' | 'icon';
  children: React.ReactNode;
}

export const NeumorphicButton: React.FC<NeumorphicButtonProps> = ({ 
  children, 
  className = '', 
  active = false,
  variant = 'secondary',
  disabled,
  ...props 
}) => {
  
  const baseStyles = "transition-all duration-200 ease-out flex items-center justify-center outline-none select-none active:scale-[0.98]";
  
  let variantStyles = "";
  
  if (variant === 'primary') {
    // High contrast white button
    variantStyles = `
      bg-white text-black font-bold rounded-md border border-white
      hover:bg-gray-200 hover:border-gray-200
      disabled:bg-[#333] disabled:text-[#666] disabled:border-[#333] disabled:cursor-not-allowed
      shadow-[0_0_15px_rgba(255,255,255,0.1)]
    `;
  } else if (variant === 'icon') {
    // Circular icon button
    variantStyles = `
      rounded-full w-12 h-12
      ${active 
        ? 'bg-surface shadow-neu-btn-pressed text-accent' 
        : 'bg-surface shadow-neu-btn text-text hover:text-accent'
      }
      disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed
    `;
  } else {
    // Standard secondary button (unused in this specific design but good to have)
    variantStyles = `
      bg-surface text-text rounded-md font-medium
      ${active ? 'shadow-neu-pressed' : 'shadow-neu-flat hover:text-white'}
    `;
  }

  return (
    <button 
      className={`${baseStyles} ${variantStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};