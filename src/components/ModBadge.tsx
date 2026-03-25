import React from 'react';
import { Shield } from 'lucide-react';

export const ModBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
    : 'text-xs px-2.5 py-1 gap-1';
  const iconSize = size === 'sm' ? 10 : 13;

  return (
    <span
      className={`inline-flex items-center ${sizeClasses} font-bold rounded-full 
        bg-gradient-to-r from-primary via-blue-400 to-primary text-primary-foreground 
        shadow-[0_0_8px_hsl(var(--primary)/0.5)] animate-pulse`}
      style={{ animationDuration: '3s' }}
    >
      <Shield size={iconSize} className="fill-current" />
      MOD
    </span>
  );
};
