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
  const baseStyles =
    'relative inline-flex items-center justify-center font-semibold transition-all duration-150 outline-none select-none overflow-hidden ' +
    'focus-visible:ring-2 focus-visible:ring-white/25 ' +
    'disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed active:scale-[0.99]';

  const variants = {
    primary:
      'bg-background text-white rounded-lg shadow-neu-flat hover:text-white/90 active:shadow-neu-pressed',
    secondary:
      'bg-background text-text rounded-lg shadow-neu-flat hover:text-white active:shadow-neu-pressed',
    icon: 'bg-background text-text-muted rounded-full shadow-neu-icon hover:text-white active:shadow-neu-icon-pressed',
    'active-icon': 'bg-background text-white rounded-full shadow-neu-icon-pressed',
  };

  const sizes = {
    sm: 'text-[11px] px-3 py-1.5 gap-1.5',
    md: 'text-xs px-4 py-2 gap-2',
    lg: 'text-[13px] px-5 py-3 tracking-wide gap-2',
    icon: 'w-11 h-11 p-0',
  };

  const radiusClass = variant === 'icon' || variant === 'active-icon' ? 'rounded-full' : 'rounded-lg';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className={`absolute inset-0 flex items-center justify-center bg-background ${radiusClass} z-10`}>
          <svg className="animate-spin h-4 w-4 text-white/80" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      )}
      <span className={`flex items-center gap-2 ${loading ? 'opacity-0' : ''}`}>{children}</span>
    </button>
  );
};
