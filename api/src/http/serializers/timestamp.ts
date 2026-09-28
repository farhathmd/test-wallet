/** Timestamps go out as ISO-8601 UTC strings, which is what the dashboard parses. */
export function toIsoTimestamp(value: Date | string | number): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
