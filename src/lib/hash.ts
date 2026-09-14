/** FNV-1a 32-bit, returned as 8 hex chars. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Longer, collision-resistant enough key for caching paragraph results. */
export function hashKey(input: string): string {
  const reversed = [...input].reverse().join('');
  return fnv1a(input) + fnv1a(reversed);
}
