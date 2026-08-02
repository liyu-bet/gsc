import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { requireLowApiToken, timingSafeTokenEqual } from './low-api-auth';

const ORIGINAL_TOKEN = process.env.GSC_LOW_API_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.GSC_LOW_API_TOKEN;
  else process.env.GSC_LOW_API_TOKEN = ORIGINAL_TOKEN;
});

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set('authorization', header);
  return new Request('http://localhost/api/integrations/low/health', { headers });
}

describe('low-api-auth', () => {
  it('rejects request without Authorization', () => {
    process.env.GSC_LOW_API_TOKEN = 'test-low-token-value-123456';
    const result = requireLowApiToken(requestWithAuth());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.response.status, 401);
  });

  it('rejects wrong Bearer token', () => {
    process.env.GSC_LOW_API_TOKEN = 'test-low-token-value-123456';
    const result = requireLowApiToken(requestWithAuth('Bearer wrong-token-value-xxxxxx'));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.response.status, 401);
  });

  it('accepts correct Bearer token', () => {
    process.env.GSC_LOW_API_TOKEN = 'test-low-token-value-123456';
    const result = requireLowApiToken(requestWithAuth('Bearer test-low-token-value-123456'));
    assert.equal(result.ok, true);
  });

  it('fails closed when GSC_LOW_API_TOKEN is missing', () => {
    delete process.env.GSC_LOW_API_TOKEN;
    const result = requireLowApiToken(requestWithAuth('Bearer anything'));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.response.status, 401);
  });

  it('fails closed when GSC_LOW_API_TOKEN is empty', () => {
    process.env.GSC_LOW_API_TOKEN = '   ';
    const result = requireLowApiToken(requestWithAuth('Bearer anything'));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.response.status, 401);
  });

  it('rejects token passed without Bearer scheme', () => {
    process.env.GSC_LOW_API_TOKEN = 'test-low-token-value-123456';
    const result = requireLowApiToken(requestWithAuth('test-low-token-value-123456'));
    assert.equal(result.ok, false);
  });

  it('timingSafeTokenEqual compares equal strings', () => {
    assert.equal(timingSafeTokenEqual('abc', 'abc'), true);
    assert.equal(timingSafeTokenEqual('abc', 'abd'), false);
    assert.equal(timingSafeTokenEqual('abc', 'ab'), false);
  });
});
