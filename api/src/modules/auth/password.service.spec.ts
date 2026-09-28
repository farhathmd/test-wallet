import { PasswordService } from './password.service';

describe('modules/auth/password.service', () => {
  const passwords = new PasswordService();

  it('never stores the plaintext password', async () => {
    const hash = await passwords.hash('correct horse battery');

    expect(hash).not.toBe('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('stores salt and derived key, so the parameters travel with the hash', async () => {
    const [scheme, salt, key] = (await passwords.hash('correct horse battery')).split('$');

    expect(scheme).toBe('scrypt');
    expect(salt).toHaveLength(32); // 16 random bytes, hex encoded
    expect(key).toHaveLength(128); // 64 byte key, hex encoded
  });

  it('salts every hash, so the same password produces two different hashes', async () => {
    const first = await passwords.hash('same password');
    const second = await passwords.hash('same password');

    expect(first).not.toBe(second);
    await expect(passwords.verify('same password', first)).resolves.toBe(true);
    await expect(passwords.verify('same password', second)).resolves.toBe(true);
  });

  it('verifies only the matching password', async () => {
    const hash = await passwords.hash('s3cret-password');

    await expect(passwords.verify('s3cret-password', hash)).resolves.toBe(true);
    await expect(passwords.verify('s3cret-passwore', hash)).resolves.toBe(false);
    await expect(passwords.verify('', hash)).resolves.toBe(false);
    await expect(passwords.verify('S3CRET-PASSWORD', hash)).resolves.toBe(false);
  });

  it('answers false — without throwing — for a missing or malformed stored hash', async () => {
    for (const stored of [null, undefined, '', 'not-a-hash', 'bcrypt$aa$bb', 'scrypt$$', 'scrypt$zz$zz']) {
      await expect(passwords.verify('anything', stored)).resolves.toBe(false);
    }
  });

  it('verifies a hash against its own parameters, not the service defaults', async () => {
    const small = new PasswordService({ keyLength: 16, saltBytes: 8 });
    const hash = await small.hash('parameterised');

    await expect(small.verify('parameterised', hash)).resolves.toBe(true);
    await expect(passwords.verify('parameterised', hash)).resolves.toBe(true);
  });
});
