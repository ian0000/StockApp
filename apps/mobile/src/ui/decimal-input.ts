// Locale-friendly normalization only; value objects own precision and range validation.
export function normalizeDecimalInput(value: string): string | null {
  const normalized = value.trim();
  if (!/^(?:\d+|\d*[.,]\d+)$/.test(normalized)) return null;
  const withLeadingZero = /^[.,]/.test(normalized)
    ? `0${normalized}`
    : normalized;
  return withLeadingZero.replace(',', '.');
}

// Presentation only: both existing value objects use six scaled decimal places.
// Callers retain the original value separately until the input is explicitly edited.
export function formatScaledUnitsForInput(scaledUnits: number): string {
  const magnitude = Math.abs(scaledUnits);
  const unitsPerHundredth = 10_000;
  let hundredths = Math.floor(magnitude / unitsPerHundredth);
  if (magnitude % unitsPerHundredth >= unitsPerHundredth / 2) hundredths += 1;
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, '0');
  return `${scaledUnits < 0 ? '-' : ''}${whole}.${fraction}`;
}
