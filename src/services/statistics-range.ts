import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type {
  ResolvedStatisticsRange,
  StatisticsQuery,
  StatisticsRangeSelection,
} from '../types/statistics.ts';

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export class WorkdayClock {
  readonly workdayStartMinute: number;
  private readonly formatter: Intl.DateTimeFormat;

  constructor(
    readonly timeZone: string,
    workdayStart: string,
  ) {
    try {
      this.formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch (cause) {
      throw configurationError(`Invalid IANA time zone “${timeZone}”.`, { timeZone }, cause);
    }

    const match = /^(\d{2}):(\d{2})$/.exec(workdayStart);
    const hour = Number(match?.[1]);
    const minute = Number(match?.[2]);
    if (!match || hour > 23 || minute > 59) {
      throw configurationError('workdayStart must use 24-hour HH:mm format.', { workdayStart });
    }
    this.workdayStartMinute = hour * 60 + minute;
  }

  workdayForInstant(timestamp: number): string {
    const parts = this.localParts(timestamp);
    const localDate = formatDateKey(parts.year, parts.month, parts.day);
    const localMinute = parts.hour * 60 + parts.minute;
    return localMinute < this.workdayStartMinute ? addDays(localDate, -1) : localDate;
  }

  boundaryForWorkday(workday: string): number {
    const date = parseDateKey(workday);
    return this.localDateTimeToEpoch({
      ...date,
      hour: Math.floor(this.workdayStartMinute / 60),
      minute: this.workdayStartMinute % 60,
      second: 0,
    });
  }

  instantForWorkdayMinute(workday: string, minuteAfterStart: number): number {
    const absoluteMinute = this.workdayStartMinute + minuteAfterStart;
    const date = addDays(workday, Math.floor(absoluteMinute / 1_440));
    const normalizedMinute = ((absoluteMinute % 1_440) + 1_440) % 1_440;
    const parts = parseDateKey(date);
    return this.localDateTimeToEpoch({
      ...parts,
      hour: Math.floor(normalizedMinute / 60),
      minute: normalizedMinute % 60,
      second: 0,
    });
  }

  minuteWithinWorkday(timestamp: number, workday: string, endOfDay = false): number {
    if (endOfDay && timestamp === this.boundaryForWorkday(addDays(workday, 1))) return 1_440;
    const parts = this.localParts(timestamp);
    const localMinute = parts.hour * 60 + parts.minute + parts.second / 60;
    const offset = localMinute - this.workdayStartMinute;
    return Math.round((offset < 0 ? offset + 1_440 : offset) * 1_000) / 1_000;
  }

  private localParts(timestamp: number): LocalDateTimeParts {
    const values = new Map(
      this.formatter
        .formatToParts(new Date(timestamp))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: values.get('year')!,
      month: values.get('month')!,
      day: values.get('day')!,
      hour: values.get('hour')!,
      minute: values.get('minute')!,
      second: values.get('second')!,
    };
  }

  private localDateTimeToEpoch(desired: LocalDateTimeParts): number {
    const desiredAsUtc = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second,
    );
    let candidate = desiredAsUtc;
    const attempted: Array<{ candidate: number; observedAsUtc: number }> = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const observed = this.localParts(candidate);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
      attempted.push({ candidate, observedAsUtc });
      const correction = desiredAsUtc - observedAsUtc;
      if (correction === 0) return candidate;
      candidate += correction;
    }

    // A configured boundary can fall inside a daylight-saving gap. There is no
    // exact instant for that wall-clock time, so use the first attempted local
    // time after the gap (Temporal's "compatible" disambiguation behaviour).
    const firstAfterGap = attempted
      .filter((attempt) => attempt.observedAsUtc > desiredAsUtc)
      .sort((a, b) => a.observedAsUtc - b.observedAsUtc || a.candidate - b.candidate)[0];
    return firstAfterGap?.candidate ?? candidate;
  }
}

export function resolveStatisticsRange(
  query: StatisticsQuery,
  clock: WorkdayClock,
): ResolvedStatisticsRange {
  const weekStartsOn = query.weekStartsOn ?? 1;
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw configurationError('weekStartsOn must be an integer from 0 (Sunday) to 6 (Saturday).', {
      weekStartsOn,
    });
  }

  const { startWorkday, endWorkday } = resolveWorkdayKeys(query.range, clock, weekStartsOn);
  const dayCount = daysBetween(startWorkday, endWorkday) + 1;
  return {
    type: query.range.type,
    startAt: clock.boundaryForWorkday(startWorkday),
    endAt: clock.boundaryForWorkday(addDays(endWorkday, 1)),
    startWorkday,
    endWorkday,
    dayCount,
  };
}

function resolveWorkdayKeys(
  range: StatisticsRangeSelection,
  clock: WorkdayClock,
  weekStartsOn: number,
): { startWorkday: string; endWorkday: string } {
  if (range.type === 'custom') {
    parseDateKey(range.startWorkday);
    parseDateKey(range.endWorkday);
    if (range.startWorkday > range.endWorkday) {
      throw rangeError('Custom range start must not be after its end.', range);
    }
    return { startWorkday: range.startWorkday, endWorkday: range.endWorkday };
  }

  if (!Number.isSafeInteger(range.anchorAt) || range.anchorAt < 0) {
    throw rangeError('Statistics range anchorAt must be a non-negative timestamp.', range);
  }

  const anchorWorkday = clock.workdayForInstant(range.anchorAt);
  if (range.type === 'day') {
    return { startWorkday: anchorWorkday, endWorkday: anchorWorkday };
  }
  if (range.type === 'week') {
    const day = dayOfWeek(anchorWorkday);
    const startWorkday = addDays(anchorWorkday, -((day - weekStartsOn + 7) % 7));
    return { startWorkday, endWorkday: addDays(startWorkday, 6) };
  }

  const { year, month } = parseDateKey(anchorWorkday);
  const startWorkday = formatDateKey(year, month, 1);
  const nextMonth =
    month === 12 ? formatDateKey(year + 1, 1, 1) : formatDateKey(year, month + 1, 1);
  return { startWorkday, endWorkday: addDays(nextMonth, -1) };
}

export function addDays(dateKey: string, amount: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysBetween(start: string, end: string): number {
  const a = parseDateKey(start);
  const b = parseDateKey(end);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

export function dayOfWeek(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw rangeError('Workday dates must use YYYY-MM-DD format.', { dateKey });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw rangeError(`Invalid workday date “${dateKey}”.`, { dateKey });
  }
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

function rangeError(message: string, details: Record<string, unknown>): AppError {
  return new AppError(AppErrorCode.InvalidStatisticsRange, message, details);
}

function configurationError(
  message: string,
  details: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return new AppError(
    AppErrorCode.InvalidStatisticsConfiguration,
    message,
    details,
    cause === undefined ? undefined : { cause },
  );
}
