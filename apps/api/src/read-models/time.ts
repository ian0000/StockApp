export function reportingDay(now: number, timeZone: string) {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isFinite(new Date(now).getTime())
  )
    throw new RangeError('Invalid reporting clock.');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  function calendarDay(epoch: number) {
    const parts = formatter.formatToParts(epoch);
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'));
  }
  const day = calendarDay(now);
  function boundary(target: number) {
    // Search local calendar dates, not a fixed UTC offset or a 24-hour local day.
    let low = target - 48 * 3600000,
      high = target + 48 * 3600000;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (calendarDay(middle) < target) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return {
    fromInclusive: boundary(day),
    toExclusive: boundary(day + 86400000),
  };
}
