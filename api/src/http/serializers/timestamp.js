/**
 * @param {Date|string|null|undefined} value
 * @returns {string|null} RFC 3339 timestamp (what `new Date()` on the client understands)
 */
export function toIsoTimestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
