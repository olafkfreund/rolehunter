/**
 * Recursively removes null bytes (\u0000) from any string, array, or object properties.
 * PostgreSQL character fields and JSONB do not support storing null characters.
 */
export function cleanNullBytes<T>(val: T): T {
  if (typeof val === "string") {
    return val.replace(/\u0000/g, "") as T;
  }
  if (Array.isArray(val)) {
    return val.map(cleanNullBytes) as unknown as T;
  }
  if (val !== null && typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      res[key.replace(/\u0000/g, "")] = cleanNullBytes(value);
    }
    return res as T;
  }
  return val;
}
