import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  oauthCancelNotice,
  oauthUpgradeShouldKeepAnalyticsHealthy,
  oauthUpgradeSitemapNotice,
} from './google-oauth-outcome';
import { chooseOAuthScope } from './google-reconnect';
import {
  GOOGLE_WEBMASTERS_READONLY_SCOPE,
  GOOGLE_WEBMASTERS_SCOPE,
} from './google-scopes';

describe('OAuth callback outcomes', () => {
  it('upgrade success / refused notices', () => {
    assert.equal(
      oauthUpgradeSitemapNotice(true),
      'Доступ к управлению sitemap предоставлен'
    );
    assert.equal(
      oauthUpgradeSitemapNotice(false),
      'Разрешение на управление sitemap не было предоставлено'
    );
  });

  it('cancel notices do not imply revocation', () => {
    assert.equal(
      oauthCancelNotice('upgrade_sitemap'),
      'Расширение разрешений Google отменено'
    );
    assert.equal(
      oauthCancelNotice('connect'),
      'Авторизация Google отменена или отклонена'
    );
    assert.equal(oauthUpgradeShouldKeepAnalyticsHealthy(false), true);
  });

  it('upgrade without new scope preserves old readonly scope', () => {
    const preserved = chooseOAuthScope(
      undefined,
      `openid ${GOOGLE_WEBMASTERS_READONLY_SCOPE}`
    );
    assert.equal(preserved?.includes(GOOGLE_WEBMASTERS_READONLY_SCOPE), true);
  });

  it('successful full scope replaces readonly scope', () => {
    const next = chooseOAuthScope(
      `openid ${GOOGLE_WEBMASTERS_SCOPE}`,
      `openid ${GOOGLE_WEBMASTERS_READONLY_SCOPE}`
    );
    assert.equal(next?.includes(GOOGLE_WEBMASTERS_SCOPE), true);
    assert.equal(next?.includes(GOOGLE_WEBMASTERS_READONLY_SCOPE), false);
  });
});
