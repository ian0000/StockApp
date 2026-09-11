import { divideAndRoundHalfAwayFromZero } from '../internal/integer-arithmetic';
import { parseDecimalScaledUnits } from '../internal/decimal-scaled-units';

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
    return Money.fromScaledUnits(parseDecimalScaledUnits(value));
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
    return Money.fromScaledUnits(
      divideAndRoundHalfAwayFromZero(this.#value, divisor),
    );
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
