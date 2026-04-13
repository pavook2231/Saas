'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ComponentType, SVGProps } from 'react';

import { cn } from '@/lib/cn';

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type MobileShellNavItem = {
  href: Route;
  label: string;
  icon: NavIcon;
};

type MobileShellNavProps = {
  items: MobileShellNavItem[];
  pathname: string;
};

export function MobileShellNav({ items, pathname }: MobileShellNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Основная навигация">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn('mobile-bottom-nav__item', isActive && 'is-active')}
          >
            <Icon width={20} height={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
