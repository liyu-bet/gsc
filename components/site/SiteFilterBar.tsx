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
  return (
    <section className="panel site-detail-panel site-filter-panel">
      <div className="site-filter-bar">
        <div className="site-filter-title">Активные фильтры</div>

        {filters.length ? (
          <div className="site-filter-chips">
            {filters.map((filter) => (
              <Link key={`${filter.label}:${filter.value}`} href={filter.href} className="site-filter-chip" prefetch>
                <span>
                  {filter.label}: {filter.value}
                </span>
                <strong>×</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="muted">Без дополнительных фильтров</div>
        )}

        {filters.length ? (
          <Link href={clearHref} className="site-filter-clear" prefetch>
            Сбросить фильтры
          </Link>
        ) : null}
      </div>
    </section>
  );
}
