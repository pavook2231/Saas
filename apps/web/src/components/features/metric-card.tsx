import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

type MetricCardProps = {
  label: string;
  value: string;
  meta?: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value, meta, icon }: MetricCardProps) {
  return (
    <Card tone="interactive" className="metric-card">
      <div className="metric-card__head">
        <span>{label}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      {meta ? <p>{meta}</p> : null}
    </Card>
  );
}
