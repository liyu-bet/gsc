import { ReactNode } from 'react';

export function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: ReactNode;
}) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">{note}</div>
    </article>
  );
}
