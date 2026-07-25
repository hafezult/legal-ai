/** Deduplicate and drop empty storage object paths. */
export function normalizeStoragePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => Boolean(path?.trim())))]
}
