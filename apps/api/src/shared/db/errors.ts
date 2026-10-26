const UNIQUE_VIOLATION = '23505';

/** True when Postgres rejected a write because it would duplicate a unique value. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}
