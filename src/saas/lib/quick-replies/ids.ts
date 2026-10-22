const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Both tables key on a UUID column: Postgres rejects anything else with a
 * type error (22P02) that would surface as a 500. Routes check the shape
 * first so a bad id is a plain 404.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
