export const REGION_COLORS = [
  '#DC2626', '#EA580C', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#991B1B', '#9A3412', '#92400E', '#3F6212', '#166534', '#115E59', '#155E75',
  '#1E40AF', '#3730A3', '#5B21B6', '#86198F', '#9D174D', '#475569', '#78716C', '#0F172A',
] as const;

export const DEFAULT_OPACITY = 0.4;

export function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((char) => char + char).join('') : match[1];
  return `#${hex.toUpperCase()}`;
}

export function nextColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((color) => color.toUpperCase()));
  return REGION_COLORS.find((color) => !used.has(color)) ?? REGION_COLORS[usedColors.length % REGION_COLORS.length];
}

/** Black or white text, whichever has better WCAG contrast on the given background. */
export function readableTextColor(hex: string): '#000000' | '#FFFFFF' {
  const normalized = normalizeHex(hex) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}
