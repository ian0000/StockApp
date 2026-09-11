// Locale-friendly normalization only; value objects own precision and range validation.
export function normalizeDecimalInput(value: string): string | null {
  const normalized = value.trim();
  if (!/^(?:\d+|\d*[.,]\d+)$/.test(normalized)) return null;
  const withLeadingZero = /^[.,]/.test(normalized)
    ? `0${normalized}`
    : normalized;
  return withLeadingZero.replace(',', '.');
}
