const DECIMAL_PLACES = 6;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,6}))?$/;

// Shared exact textual parsing for six-decimal value objects; no floating-point conversion.
export function parseDecimalScaledUnits(value: string): number {
  if (typeof value !== 'string') {
    throw new TypeError('Decimal value must be a string.');
  }
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (match === null) {
    throw new TypeError(
      `Decimal value must use plain decimal notation with at most ${DECIMAL_PLACES} decimal places.`,
    );
  }
  const [, sign, wholeUnits, fractionalUnits = ''] = match;
  const magnitude = Number(
    `${wholeUnits}${fractionalUnits.padEnd(DECIMAL_PLACES, '0')}`,
  );
  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError('Decimal scaled units must be a safe integer.');
  }
  return magnitude === 0 ? 0 : sign === '-' ? -magnitude : magnitude;
}
