import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import path from 'node:path';
import { assertNoSecretsInJson, serializePublicConnection } from './connection-health';

describe('connection retry route', () => {
  it('requires admin session via auth.getSession gate', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'app/api/connections/[id]/retry/route.ts'),
      'utf8'
    );
    assert.match(source, /auth\.getSession\(/);
    assert.match(source, /status:\s*401/);
    assert.match(source, /Unauthorized/);
  });

  it('public connection serializer omits encrypted fields', () => {
    const connection = serializePublicConnection({
      id: 'conn_1',
      email: 'a@example.com',
      name: null,
      status: 'REVOKED',
      lastErrorCode: 'INVALID_GRANT',
      lastErrorMessage: 'Доступ отозван — переподключите аккаунт',
      lastErrorAt: new Date(),
      lastSuccessAt: null,
      propertiesCount: 1,
    });
    assertNoSecretsInJson({ connection });
    assert.equal(connection.canReconnect, true);
    assert.equal(connection.canRetry, false);
    assert.equal(JSON.stringify(connection).includes('encryptedAccess'), false);
    assert.equal(JSON.stringify(connection).includes('encryptedRefresh'), false);
  });
});
