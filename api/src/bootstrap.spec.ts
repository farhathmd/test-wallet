import { parseCorsOrigins } from './bootstrap';

/**
 * The CORS allow-list is the only thing standing between a logged-in browser and any other site, and
 * its shape decides whether the middleware compares origins or blindly echoes one. These cases pin
 * the shape; the browser-visible behaviour is covered by `test/cors.e2e-spec.ts`.
 */
describe('parseCorsOrigins', () => {
  it('returns a one-origin list, not a bare string', () => {
    // A string would be echoed to every caller without comparison.
    expect(parseCorsOrigins('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });

  it('splits on commas and trims, so spacing in the env value is not a footgun', () => {
    expect(parseCorsOrigins(' http://localhost:5173 , http://127.0.0.1:5173 ')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseCorsOrigins('http://a.example, ,')).toEqual(['http://a.example']);
  });

  it('keeps `*` as the wildcard wherever it appears', () => {
    expect(parseCorsOrigins('*')).toBe('*');
    expect(parseCorsOrigins('http://a.example,*')).toBe('*');
    expect(parseCorsOrigins('* , http://a.example')).toBe('*');
  });

  it('allows nothing when the value is empty, rather than everything', () => {
    expect(parseCorsOrigins(' , ')).toEqual([]);
  });
});
