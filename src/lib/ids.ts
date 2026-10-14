const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards ID values from URLs or tokens before they reach a uuid column (avoids a 500 on bad input). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
