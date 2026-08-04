import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSitemapDateDisplayState,
  SITEMAP_DATE_FALLBACK,
} from './sitemap-date-display';

describe('getSitemapDateDisplayState', () => {
  it('mounted=false returns stable fallback matching server/client initial output', () => {
    const server = getSitemapDateDisplayState({
      value: '2026-08-04T12:00:00.000Z',
      mounted: false,
    });
    const clientInitial = getSitemapDateDisplayState({
      value: '2026-08-04T12:00:00.000Z',
      mounted: false,
    });
    assert.deepEqual(server, clientInitial);
    assert.equal(server.text, SITEMAP_DATE_FALLBACK);
    assert.equal(server.title, '2026-08-04T12:00:00.000Z');
    assert.equal(server.ready, false);
  });

  it('mounted=true formats valid ISO with optional timezone', () => {
    const display = getSitemapDateDisplayState({
      value: '2026-08-04T12:00:00.000Z',
      mounted: true,
      timeZone: 'UTC',
    });
    assert.equal(display.ready, true);
    assert.equal(display.title, '2026-08-04T12:00:00.000Z');
    assert.notEqual(display.text, SITEMAP_DATE_FALLBACK);
    assert.match(display.text, /2026|04\.08|8\/4/);
  });

  it('invalid and null become em dash without title', () => {
    assert.deepEqual(getSitemapDateDisplayState({ value: null, mounted: true }), {
      text: SITEMAP_DATE_FALLBACK,
      title: null,
      ready: true,
    });
    assert.deepEqual(getSitemapDateDisplayState({ value: 'not-a-date', mounted: true }), {
      text: SITEMAP_DATE_FALLBACK,
      title: null,
      ready: true,
    });
    assert.deepEqual(getSitemapDateDisplayState({ value: 'not-a-date', mounted: false }), {
      text: SITEMAP_DATE_FALLBACK,
      title: 'not-a-date',
      ready: false,
    });
  });
});
