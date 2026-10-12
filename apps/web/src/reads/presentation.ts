import type { HistoryEntryDto } from '@stock-app/contracts';

export function reportingDateKey(timestamp: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(timestamp);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return 'unavailable';
  }
}
export function reportingDateLabel(
  timestamp: number,
  timeZone: string,
  now = Date.now(),
): string {
  const today = reportingDateKey(now, timeZone),
    date = reportingDateKey(timestamp, timeZone);
  if (today === 'unavailable' || date === 'unavailable')
    return 'Fecha no disponible';
  if (date === today) return 'Hoy';
  // Subtract a civil calendar date, not 24 hours from an instant (DST days may be 23/25h).
  const [year, month, day] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(year!, month! - 1, day! - 1))
    .toISOString()
    .slice(0, 10);
  if (date === yesterday) return 'Ayer';
  return new Intl.DateTimeFormat('es', { timeZone, dateStyle: 'long' }).format(
    timestamp,
  );
}
export function historyGroups(
  entries: readonly HistoryEntryDto[],
  timeZone: string,
  now = Date.now(),
): { key: string; label: string; items: HistoryEntryDto[] }[] {
  const groups: { key: string; label: string; items: HistoryEntryDto[] }[] = [];
  for (const entry of entries) {
    const key = reportingDateKey(entry.effectiveAt, timeZone),
      last = groups.at(-1);
    if (last?.key === key) last.items.push(entry);
    else
      groups.push({
        key,
        label: reportingDateLabel(entry.effectiveAt, timeZone, now),
        items: [entry],
      });
  }
  return groups;
}
