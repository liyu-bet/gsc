'use client';

import type { GoogleScopeCapabilities } from '@/lib/google-scopes';
import {
  googleScopeBadgeHint,
  googleScopeBadgeLabel,
  googleScopeUiKind,
  googleScopeUpgradeCtaLabel,
} from '@/lib/google-scopes';

type GoogleScopeBadgeProps = {
  capabilities: Pick<
    GoogleScopeCapabilities,
    'canManageSitemaps' | 'requiresSitemapUpgrade' | 'scopeKnown' | 'isReadonly'
  >;
  connectionId: string;
  /** When true, show upgrade CTA (not when reconnect is required). */
  allowUpgrade?: boolean;
  compact?: boolean;
};

function ScopeIcon({ kind }: { kind: 'full' | 'readonly' | 'unknown' }) {
  if (kind === 'full') {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === 'readonly') {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function GoogleScopeBadge({
  capabilities,
  connectionId,
  allowUpgrade = true,
  compact = false,
}: GoogleScopeBadgeProps) {
  const kind = googleScopeUiKind(capabilities);
  const label = googleScopeBadgeLabel(capabilities);
  const hint = googleScopeBadgeHint(capabilities);
  const cta = allowUpgrade ? googleScopeUpgradeCtaLabel(capabilities) : null;
  const upgradeHref = `/api/google/connect?connectionId=${encodeURIComponent(connectionId)}&intent=upgrade_sitemap`;

  return (
    <div className={`google-scope google-scope-${kind}${compact ? ' google-scope-compact' : ''}`}>
      <span className="google-scope-main" aria-label={label}>
        <ScopeIcon kind={kind} />
        <span>{label}</span>
      </span>
      {!compact ? <span className="google-scope-meta muted small-text">{hint}</span> : null}
      {cta ? (
        <a
          className="button ghost small google-scope-upgrade"
          href={upgradeHref}
          aria-label={`${cta} для этого аккаунта Google`}
        >
          {cta}
        </a>
      ) : null}
    </div>
  );
}
