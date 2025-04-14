export function stripPathFromUrl(url) {
  const u = new URL(url);
  return u.origin; // returns protocol + host + port if present
}
