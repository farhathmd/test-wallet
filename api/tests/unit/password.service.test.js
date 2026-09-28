import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPasswordService } from '../../src/services/password.service.js';

describe('services/password.service', () => {
  const passwordService = createPasswordService();

  it('never stores the plaintext password', async () => {
    const hash = await passwordService.hash('correct horse battery');
    assert.notEqual(hash, 'correct horse battery');
    assert.ok(hash.startsWith('scrypt$'));
  });

  it('stores salt and derived key so parameters travel with the hash', async () => {
    const hash = await passwordService.hash('correct horse battery');
    const [scheme, salt, key] = hash.split('$');
    assert.equal(scheme, 'scrypt');
    assert.equal(salt.length, 32); // 16 random bytes, hex encoded
    assert.equal(key.length, 128); // 64 byte key, hex encoded
  });

  it('salts every hash, so equal passwords produce different hashes', async () => {
    const first = await passwordService.hash('same password');
    const second = await passwordService.hash('same password');
    assert.notEqual(first, second);
    assert.equal(await passwordService.verify('same password', first), true);
    assert.equal(await passwordService.verify('same password', second), true);
  });

  it('verifies only the matching password', async () => {
    const hash = await passwordService.hash('s3cret-password');
    assert.equal(await passwordService.verify('s3cret-password', hash), true);
    assert.equal(await passwordService.verify('s3cret-passwore', hash), false);
    assert.equal(await passwordService.verify('', hash), false);
    assert.equal(await passwordService.verify('S3CRET-PASSWORD', hash), false);
  });

  it('returns false (without throwing) for missing or malformed stored hashes', async () => {
    for (const stored of [null, undefined, '', 'not-a-hash', 'bcrypt$aa$bb', 'scrypt$$', 'scrypt$zz$zz']) {
      assert.equal(await passwordService.verify('anything', stored), false, `stored=${String(stored)}`);
    }
  });

  it('verifies a hash produced with custom parameters', async () => {
    const small = createPasswordService({ keyLength: 16, saltBytes: 8 });
    const hash = await small.hash('parameterised');
    assert.equal(await small.verify('parameterised', hash), true);
    // A hash is verified against its own parameters, not the service defaults.
    assert.equal(await passwordService.verify('parameterised', hash), true);
  });
});
