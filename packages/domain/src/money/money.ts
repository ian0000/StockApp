const DECIMAL_PLACES = 6;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,6}))?$/;

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value === 0 ? 0 : value;
}

export class Money {
  readonly #value: number;

  private constructor(scaledUnits: number) {
    this.#value = scaledUnits;
    Object.freeze(this);
  }

  static zero(): Money {
    return new Money(0);
  }

  static fromScaledUnits(scaledUnits: number): Money {
    return new Money(requireSafeInteger(scaledUnits, 'Scaled units'));
  }

  static fromDecimal(value: string): Money {
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
    const scaledDigits = `${wholeUnits}${fractionalUnits.padEnd(DECIMAL_PLACES, '0')}`;
    const magnitude = requireSafeInteger(
      Number(scaledDigits),
      'Decimal scaled units',
    );
    const scaledUnits = sign === '-' ? -magnitude : magnitude;

    return Money.fromScaledUnits(scaledUnits);
  }

  get scaledUnits(): number {
    return this.#value;
  }

  add(other: Money): Money {
    return Money.fromScaledUnits(this.#value + other.#value);
  }

  subtract(other: Money): Money {
    return Money.fromScaledUnits(this.#value - other.#value);
  }

  multiplyByInteger(multiplier: number): Money {
    const safeMultiplier = requireSafeInteger(multiplier, 'Multiplier');

    return Money.fromScaledUnits(this.#value * safeMultiplier);
  }

  divideByInteger(divisor: number): Money {
    const safeDivisor = requireSafeInteger(divisor, 'Divisor');

    if (safeDivisor === 0) {
      throw new RangeError('Divisor must not be zero.');
    }

    const remainder = this.#value % safeDivisor;
    const quotient = (this.#value - remainder) / safeDivisor;
    const isNearestUnitAwayFromZero =
      Math.abs(remainder) >= Math.abs(safeDivisor) / 2;

    if (remainder === 0 || !isNearestUnitAwayFromZero) {
      return Money.fromScaledUnits(quotient);
    }

    const roundingDirection =
      Math.sign(this.#value) === Math.sign(safeDivisor) ? 1 : -1;

    return Money.fromScaledUnits(quotient + roundingDirection);
  }

  equals(other: Money): boolean {
    return this.#value === other.#value;
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.#value < other.#value) {
      return -1;
    }

    if (this.#value > other.#value) {
      return 1;
    }

    return 0;
  }
}
