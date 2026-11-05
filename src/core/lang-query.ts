/** `?lang=en` → "en"; anything else → null. Dependency-free so the edge middleware stays tiny. */
export function langFromQuery(search: string): "zh" | "en" | null {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("lang");
  return v === "zh" || v === "en" ? v : null;
}
