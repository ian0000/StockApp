function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function addSafeIntegers(left: number, right: number): number {
  return requireSafeInteger(left + right, 'Integer arithmetic result');
}

function multiplySafeIntegers(left: number, right: number): number {
  return requireSafeInteger(left * right, 'Integer arithmetic result');
}

function doubleModulo(
  remainder: number,
  divisor: number,
): { carry: number; remainder: number } {
  const distanceToDivisor = divisor - remainder;

  if (remainder >= distanceToDivisor) {
    return { carry: 1, remainder: remainder - distanceToDivisor };
  }

  return { carry: 0, remainder: remainder + remainder };
}

function addModulo(
  left: number,
  right: number,
  divisor: number,
): { carry: number; remainder: number } {
  const distanceToDivisor = divisor - right;

  if (left >= distanceToDivisor) {
    return { carry: 1, remainder: left - distanceToDivisor };
  }

  return { carry: 0, remainder: left + right };
}

function multiplyRemainderAndDivide(
  multiplicand: number,
  multiplier: number,
  divisor: number,
): { quotient: number; remainder: number } {
  const bits: number[] = [];
  let remainingMultiplier = multiplier;

  while (remainingMultiplier > 0) {
    bits.push(remainingMultiplier % 2);
    remainingMultiplier = Math.floor(remainingMultiplier / 2);
  }

  let quotient = 0;
  let remainder = 0;

  for (let index = bits.length - 1; index >= 0; index -= 1) {
    const doubled = doubleModulo(remainder, divisor);
    quotient = addSafeIntegers(
      multiplySafeIntegers(quotient, 2),
      doubled.carry,
    );
    remainder = doubled.remainder;

    if (bits[index] === 1) {
      const added = addModulo(remainder, multiplicand, divisor);
      quotient = addSafeIntegers(quotient, added.carry);
      remainder = added.remainder;
    }
  }

  return { quotient, remainder };
}

export function multiplyDivideAndRoundHalfAwayFromZero(
  multiplicand: number,
  multiplier: number,
  divisor: number,
): number {
  const safeMultiplicand = requireSafeInteger(multiplicand, 'Multiplicand');
  const safeMultiplier = requireSafeInteger(multiplier, 'Multiplier');
  const safeDivisor = requireSafeInteger(divisor, 'Divisor');

  if (safeDivisor === 0) {
    throw new RangeError('Divisor must not be zero.');
  }

  const multiplicandMagnitude = Math.abs(safeMultiplicand);
  const multiplierMagnitude = Math.abs(safeMultiplier);
  const divisorMagnitude = Math.abs(safeDivisor);
  const multiplicandRemainder = multiplicandMagnitude % divisorMagnitude;
  const wholeMultiplicand =
    (multiplicandMagnitude - multiplicandRemainder) / divisorMagnitude;
  const wholeQuotient = multiplySafeIntegers(
    wholeMultiplicand,
    multiplierMagnitude,
  );
  const fractional = multiplyRemainderAndDivide(
    multiplicandRemainder,
    multiplierMagnitude,
    divisorMagnitude,
  );
  let roundedMagnitude = addSafeIntegers(wholeQuotient, fractional.quotient);

  if (fractional.remainder >= divisorMagnitude / 2) {
    roundedMagnitude = addSafeIntegers(roundedMagnitude, 1);
  }

  const isNegative =
    Math.sign(safeMultiplicand) *
      Math.sign(safeMultiplier) *
      Math.sign(safeDivisor) <
    0;

  return isNegative ? -roundedMagnitude : roundedMagnitude;
}

export function divideAndRoundHalfAwayFromZero(
  dividend: number,
  divisor: number,
): number {
  return multiplyDivideAndRoundHalfAwayFromZero(dividend, 1, divisor);
}
