import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon' | 'active-icon';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  className = '', 
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  ...props 
}) => {
  
  // Base: All buttons have the flat shadow by default, transition to pressed
  // Added 'overflow-hidden' to ensure inner loaders never break the border radius
  const baseStyles = "relative inline-flex items-center justify-center font-bold transition-all duration-200 outline-none disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed select-none active:scale-[0.98] overflow-hidden";
  
  // Neumorphic Variants
  const variants = {
    // Primary: Dark Neumorphic (extruded) but with bright text/border to signify action
    primary: "bg-background text-white border border-[#333] rounded-xl shadow-neu-flat hover:text-blue-400 active:shadow-neu-pressed active:border-transparent",
    
    // Secondary: Standard Neumorphic
    secondary: "bg-background text-text rounded-xl shadow-neu-flat hover:text-white active:shadow-neu-pressed active:text-accent",
    
    // Icon: Circular
    icon: "bg-background text-text-muted rounded-full shadow-neu-icon hover:text-white active:shadow-neu-icon-pressed",
    
    // Active Icon (toggled on state)
    'active-icon': "bg-background text-blue-400 rounded-full shadow-neu-icon-pressed"
  };

  const sizes = {
    sm: "text-xs px-4 py-2",
    md: "text-sm px-6 py-3",
    lg: "text-base px-8 py-4 uppercase tracking-wider",
    icon: "w-20 h-20 p-0" // Fixed size for player controls
  };

  // Determine border radius class based on variant/size for the loader overlay
  const borderRadiusClass = (variant === 'icon' || variant === 'active-icon') ? 'rounded-full' : 'rounded-xl';

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className={`absolute inset-0 flex items-center justify-center bg-background ${borderRadiusClass} z-10`}>
           <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
        </span>
      )}
      <span className={`flex items-center gap-2 ${loading ? "opacity-0" : ""}`}>
        {children}
      </span>
    </button>
  );
};