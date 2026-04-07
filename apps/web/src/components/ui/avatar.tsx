import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  src?: string | null;
  size?: AvatarSize;
};

const initialsFromName = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function Avatar({ className, name, src, size = 'md', ...props }: AvatarProps) {
  const initials = initialsFromName(name) || name.slice(0, 2).toUpperCase();

  return (
    <div className={cn('ui-avatar', `ui-avatar--${size}`, className)} {...props}>
      {src ? <img src={src} alt={name} className="ui-avatar__image" /> : <span>{initials}</span>}
    </div>
  );
}
