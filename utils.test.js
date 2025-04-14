import { stripPathFromUrl } from './utils';

test('removes path from URL', () => {
  expect(stripPathFromUrl('https://example.com/some/path')).toBe('https://example.com');
});

test('handles ports correctly', () => {
  expect(stripPathFromUrl('https://example.com:3000/api')).toBe('https://example.com:3000');
});

test("throws for invalid URL", () => {
  expect(() => stripPathFromUrl("not a url")).toThrow("Invalid URL");
});
