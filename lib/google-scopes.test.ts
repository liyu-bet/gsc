import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import {
  GOOGLE_WEBMASTERS_READONLY_SCOPE,
  GOOGLE_WEBMASTERS_SCOPE,
  assertCanManageSitemaps,
  canConnectionManageSitemaps,
  getGoogleScopeCapabilities,
  googleScopeBadgeLabel,
  googleScopeUpgradeCtaLabel,
  parseGoogleScopes,
} from './google-scopes';
import {
  assertNoSecretsInJson,
  serializePublicConnection,
} from './connection-health';
import { assertReconnectGoogleSub } from './google-reconnect';

const FULL =
  `openid email profile ${GOOGLE_WEBMASTERS_SCOPE}`;
const READONLY =
  `openid email profile ${GOOGLE_WEBMASTERS_READONLY_SCOPE}`;

describe('parseGoogleScopes', () => {
  it('parses full scope', () => {
    const set = parseGoogleScopes(FULL);
    assert.equal(set.has(GOOGLE_WEBMASTERS_SCOPE), true);
    assert.equal(set.has('openid'), true);
  });

  it('parses readonly scope', () => {
    assert.equal(parseGoogleScopes(READONLY).has(GOOGLE_WEBMASTERS_READONLY_SCOPE), true);
  });

  it('handles duplicates, spaces, tabs, newlines', () => {
    const messy = `openid\topenid  email\n${GOOGLE_WEBMASTERS_SCOPE}\r\n${GOOGLE_WEBMASTERS_SCOPE}`;
    const set = parseGoogleScopes(messy);
    assert.equal(set.size, 3);
    assert.equal(set.has(GOOGLE_WEBMASTERS_SCOPE), true);
  });

  it('treats empty / null / undefined as empty set', () => {
    assert.equal(parseGoogleScopes('').size, 0);
    assert.equal(parseGoogleScopes('   ').size, 0);
    assert.equal(parseGoogleScopes(null).size, 0);
    assert.equal(parseGoogleScopes(undefined).size, 0);
  });

  it('rejects lookalike URLs that embed scope as substring', () => {
    const evilFull = `https://evil.test/${GOOGLE_WEBMASTERS_SCOPE}`;
    const evilReadonly = `https://evil.test/${GOOGLE_WEBMASTERS_READONLY_SCOPE}`;
    assert.equal(parseGoogleScopes(evilFull).has(GOOGLE_WEBMASTERS_SCOPE), false);
    assert.equal(parseGoogleScopes(evilReadonly).has(GOOGLE_WEBMASTERS_READONLY_SCOPE), false);
    assert.equal(getGoogleScopeCapabilities(evilFull).canManageSitemaps, false);
    assert.equal(getGoogleScopeCapabilities(evilReadonly).isReadonly, false);
  });
});

describe('Google scope capabilities', () => {
  it('full scope capabilities', () => {
    const caps = getGoogleScopeCapabilities(FULL);
    assert.equal(caps.canReadSearchConsole, true);
    assert.equal(caps.canManageSitemaps, true);
    assert.equal(caps.isReadonly, false);
    assert.equal(caps.scopeKnown, true);
    assert.equal(caps.requiresSitemapUpgrade, false);
  });

  it('readonly scope capabilities', () => {
    const caps = getGoogleScopeCapabilities(READONLY);
    assert.equal(caps.canReadSearchConsole, true);
    assert.equal(caps.canManageSitemaps, false);
    assert.equal(caps.isReadonly, true);
    assert.equal(caps.scopeKnown, true);
    assert.equal(caps.requiresSitemapUpgrade, true);
  });

  it('unknown legacy / null capabilities keep analytics available', () => {
    for (const scope of [null, undefined, '', 'openid email', 'https://other/scope']) {
      const caps = getGoogleScopeCapabilities(scope);
      assert.equal(caps.canReadSearchConsole, true);
      assert.equal(caps.canManageSitemaps, false);
      assert.equal(caps.scopeKnown, false);
      assert.equal(caps.requiresSitemapUpgrade, true);
    }
  });

  it('assertCanManageSitemaps succeeds for full and throws INSUFFICIENT_SCOPE otherwise', () => {
    assert.doesNotThrow(() => assertCanManageSitemaps(FULL));
    assert.throws(
      () => assertCanManageSitemaps(READONLY),
      (error: unknown) =>
        error instanceof GoogleApiError && error.code === 'INSUFFICIENT_SCOPE'
    );
    assert.equal(canConnectionManageSitemaps({ scope: FULL }), true);
    assert.equal(canConnectionManageSitemaps({ scope: READONLY }), false);
  });
});

describe('scope UI helpers', () => {
  it('shows correct labels and CTAs', () => {
    const full = getGoogleScopeCapabilities(FULL);
    const readonly = getGoogleScopeCapabilities(READONLY);
    const unknown = getGoogleScopeCapabilities(null);
    assert.equal(googleScopeBadgeLabel(full), 'Sitemap: доступ разрешён');
    assert.equal(googleScopeUpgradeCtaLabel(full), null);
    assert.equal(googleScopeBadgeLabel(readonly), 'Только чтение');
    assert.equal(googleScopeUpgradeCtaLabel(readonly), 'Разрешить управление sitemap');
    assert.equal(googleScopeBadgeLabel(unknown), 'Разрешения не подтверждены');
    assert.equal(googleScopeUpgradeCtaLabel(unknown), 'Проверить разрешения');
  });
});

describe('public connection serializer capabilities', () => {
  it('returns capability booleans without raw scope or secrets', () => {
    const view = serializePublicConnection({
      id: 'conn_1',
      email: 'a@example.com',
      name: 'A',
      status: 'ACTIVE',
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      lastSuccessAt: new Date('2026-08-01T12:00:00.000Z'),
      propertiesCount: 2,
      scope: READONLY,
    });
    assert.equal(view.canManageSitemaps, false);
    assert.equal(view.requiresSitemapUpgrade, true);
    assert.equal(view.scopeKnown, true);
    assert.equal(view.isReadonly, true);
    assert.equal(view.statusLabel, 'Активно');
    const raw = JSON.stringify(view);
    assert.equal(raw.includes('"scope"'), false);
    assert.equal(raw.includes('encryptedAccess'), false);
    assert.equal(raw.includes('googleUserId'), false);
    assert.equal(raw.includes(GOOGLE_WEBMASTERS_READONLY_SCOPE), false);
    assertNoSecretsInJson(view);
  });
});

describe('reconnect sub guard ordering', () => {
  it('rejects mismatched Google sub before any connection mutation', () => {
    let mutated = false;
    const mutate = () => {
      mutated = true;
    };
    assert.throws(() => {
      assertReconnectGoogleSub('sub-a', 'sub-b');
      mutate();
    });
    assert.equal(mutated, false);
  });
});
