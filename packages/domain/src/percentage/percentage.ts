function requireSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Percentage scaled units must be a safe integer.');
  }

  return value === 0 ? 0 : value;
}

export class Percentage {
  readonly #value: number;

  private constructor(scaledUnits: number) {
    this.#value = scaledUnits;
    Object.freeze(this);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  static fromScaledUnits(scaledUnits: number): Percentage {
    return new Percentage(requireSafeInteger(scaledUnits));
  }

  get scaledUnits(): number {
    return this.#value;
  }

  equals(other: Percentage): boolean {
    return this.#value === other.#value;
  }

  compare(other: Percentage): -1 | 0 | 1 {
    if (this.#value < other.#value) {
      return -1;
    }

    if (this.#value > other.#value) {
      return 1;
    }

    return 0;
  }
}
