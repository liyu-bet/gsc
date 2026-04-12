import Link from 'next/link';

type ActiveFilter = {
  label: string;
  value: string;
  href: string;
};

export function SiteFilterBar({
  filters,
  clearHref,
}: {
  filters: ActiveFilter[];
  clearHref: string;
}) {
  if (!filters.length) return null;

  return (
    <section className="panel site-detail-panel site-filter-panel">
      <div className="site-filter-bar">
        <div className="site-filter-title">Active filters</div>
        <div className="site-filter-chips">
          {filters.map((filter) => (
            <Link key={`${filter.label}:${filter.value}`} href={filter.href} className="site-filter-chip" prefetch>
              <span>{filter.label} is {filter.value}</span>
              <strong>×</strong>
            </Link>
          ))}
        </div>
        <Link href={clearHref} className="site-filter-clear" prefetch>
          Clear all
        </Link>
      </div>
    </section>
  );
}
