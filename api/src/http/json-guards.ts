/** Whether `value`, read from an upstream's JSON, is an object or array whose fields can be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
