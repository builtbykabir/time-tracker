import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { StatisticsRepository } from '../repositories/statistics-repository.ts';
import type {
  CumulativeStatisticsPoint,
  DailyStatistics,
  PeriodStatistics,
  StatisticsCategoryValue,
  StatisticsQuery,
  StatisticsReport,
  StatisticsSessionRecord,
  TimeDistributionBin,
} from '../types/statistics.ts';
import {
  WorkdayClock,
  addDays,
  dayOfWeek,
  monthKey,
  resolveStatisticsRange,
} from './statistics-range.ts';

const DISTRIBUTION_BIN_MINUTES = 30;
const DISTRIBUTION_BIN_COUNT = 1_440 / DISTRIBUTION_BIN_MINUTES;

interface MutableCategoryTotal {
  categoryId: number;
  categoryName: string;
  durationMs: number;
}

interface MutableDay {
  workday: string;
  startAt: number;
  endAt: number;
  totalDurationMs: number;
  sessionCount: number;
  firstSessionStartAt: number | null;
  lastSessionEndAt: number | null;
  categories: Map<number, MutableCategoryTotal>;
}

interface MutablePeriod {
  key: string;
  startWorkday: string;
  endWorkday: string;
  totalDurationMs: number;
  activeDays: number;
  categories: Map<number, MutableCategoryTotal>;
}

export class StatisticsService {
  constructor(private readonly repository: StatisticsRepository) {}

  getReport(query: StatisticsQuery): StatisticsReport {
    const now = query.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new AppError(
        AppErrorCode.InvalidStatisticsRange,
        'Statistics query now must be a non-negative timestamp.',
        { now },
      );
    }

    const clock = new WorkdayClock(query.timeZone, query.workdayStart);
    const range = resolveStatisticsRange(query, clock);
    const sessions = this.repository.findSessionsOverlapping(range.startAt, range.endAt);
    const mutableDays = createDays(range.startWorkday, range.dayCount, clock);
    const distribution = createDistribution();

    for (const day of mutableDays) {
      for (const session of sessions) {
        addSessionSlice(day, session, now, clock, distribution);
      }
    }

    const days = mutableDays.map((day) => finalizeDay(day, clock));
    addDailyStartsAndEndsToDistribution(days, distribution);
    const totalDurationMs = days.reduce((total, day) => total + day.totalDurationMs, 0);
    const activeDays = days.filter((day) => day.totalDurationMs > 0);
    const categories = aggregateCategories(days, totalDurationMs);
    const maximumDay = activeDays.reduce<DailyStatistics | null>(
      (maximum, day) =>
        maximum === null || day.totalDurationMs > maximum.totalDurationMs ? day : maximum,
      null,
    );

    return {
      generatedAt: now,
      timeZone: query.timeZone,
      workdayStart: query.workdayStart,
      range,
      summary: {
        totalDurationMs,
        averagePerDayMs: range.dayCount === 0 ? 0 : totalDurationMs / range.dayCount,
        averagePerActiveDayMs: activeDays.length === 0 ? 0 : totalDurationMs / activeDays.length,
        activeDays: activeDays.length,
        activeDayPercentage:
          range.dayCount === 0 ? 0 : percentage(activeDays.length, range.dayCount),
        dailyMaximumMs: maximumDay?.totalDurationMs ?? 0,
        dailyMaximumWorkday: maximumDay?.workday ?? null,
        averageStartMinute: average(
          activeDays.flatMap((day) =>
            day.firstStartMinute === null ? [] : [day.firstStartMinute],
          ),
        ),
        averageEndMinute: average(
          activeDays.flatMap((day) => (day.lastEndMinute === null ? [] : [day.lastEndMinute])),
        ),
      },
      days,
      categories,
      distribution,
      cumulative: buildCumulative(days),
      weeks: buildPeriods(days, 'week', query.weekStartsOn ?? 1),
      months: buildPeriods(days, 'month', query.weekStartsOn ?? 1),
    };
  }
}

function createDays(startWorkday: string, count: number, clock: WorkdayClock): MutableDay[] {
  return Array.from({ length: count }, (_, index) => {
    const workday = addDays(startWorkday, index);
    return {
      workday,
      startAt: clock.boundaryForWorkday(workday),
      endAt: clock.boundaryForWorkday(addDays(workday, 1)),
      totalDurationMs: 0,
      sessionCount: 0,
      firstSessionStartAt: null,
      lastSessionEndAt: null,
      categories: new Map(),
    };
  });
}

function addSessionSlice(
  day: MutableDay,
  session: StatisticsSessionRecord,
  now: number,
  clock: WorkdayClock,
  distribution: TimeDistributionBin[],
): void {
  const sessionEnd = session.endedAt ?? now;
  const startAt = Math.max(session.startedAt, day.startAt);
  const endAt = Math.min(sessionEnd, day.endAt);
  if (endAt <= startAt) return;

  const durationMs = endAt - startAt;
  day.totalDurationMs += durationMs;
  day.sessionCount += 1;
  day.firstSessionStartAt =
    day.firstSessionStartAt === null ? startAt : Math.min(day.firstSessionStartAt, startAt);
  day.lastSessionEndAt =
    day.lastSessionEndAt === null ? endAt : Math.max(day.lastSessionEndAt, endAt);

  const category = day.categories.get(session.categoryId) ?? {
    categoryId: session.categoryId,
    categoryName: session.categoryName,
    durationMs: 0,
  };
  category.durationMs += durationMs;
  day.categories.set(session.categoryId, category);
  addSliceToDistribution(day.workday, startAt, endAt, clock, distribution);
}

function addSliceToDistribution(
  workday: string,
  startAt: number,
  endAt: number,
  clock: WorkdayClock,
  distribution: TimeDistributionBin[],
): void {
  for (let index = 0; index < DISTRIBUTION_BIN_COUNT; index += 1) {
    const binStart = clock.instantForWorkdayMinute(workday, index * DISTRIBUTION_BIN_MINUTES);
    const binEnd = clock.instantForWorkdayMinute(workday, (index + 1) * DISTRIBUTION_BIN_MINUTES);
    const overlap = Math.max(0, Math.min(endAt, binEnd) - Math.max(startAt, binStart));
    distribution[index]!.activeDurationMs += overlap;
  }
}

function finalizeDay(day: MutableDay, clock: WorkdayClock): DailyStatistics {
  return {
    workday: day.workday,
    startAt: day.startAt,
    endAt: day.endAt,
    totalDurationMs: day.totalDurationMs,
    sessionCount: day.sessionCount,
    firstSessionStartAt: day.firstSessionStartAt,
    lastSessionEndAt: day.lastSessionEndAt,
    firstStartMinute:
      day.firstSessionStartAt === null
        ? null
        : clock.minuteWithinWorkday(day.firstSessionStartAt, day.workday),
    lastEndMinute:
      day.lastSessionEndAt === null
        ? null
        : clock.minuteWithinWorkday(day.lastSessionEndAt, day.workday, true),
    categories: toCategoryValues(day.categories.values(), day.totalDurationMs),
  };
}

function createDistribution(): TimeDistributionBin[] {
  return Array.from({ length: DISTRIBUTION_BIN_COUNT }, (_, index) => ({
    startMinute: index * DISTRIBUTION_BIN_MINUTES,
    endMinute: (index + 1) * DISTRIBUTION_BIN_MINUTES,
    startCount: 0,
    endCount: 0,
    activeDurationMs: 0,
  }));
}

function addDailyStartsAndEndsToDistribution(
  days: DailyStatistics[],
  distribution: TimeDistributionBin[],
): void {
  for (const day of days) {
    if (day.firstStartMinute !== null) {
      distribution[distributionIndex(day.firstStartMinute)]!.startCount += 1;
    }
    if (day.lastEndMinute !== null) {
      distribution[distributionIndex(day.lastEndMinute)]!.endCount += 1;
    }
  }
}

function distributionIndex(minute: number): number {
  return Math.min(DISTRIBUTION_BIN_COUNT - 1, Math.max(0, Math.floor(minute / 30)));
}

function aggregateCategories(
  days: DailyStatistics[],
  totalDurationMs: number,
): StatisticsCategoryValue[] {
  const totals = new Map<number, MutableCategoryTotal>();
  for (const day of days) {
    for (const category of day.categories) addCategoryDuration(totals, category);
  }
  return toCategoryValues(totals.values(), totalDurationMs);
}

function buildCumulative(days: DailyStatistics[]): CumulativeStatisticsPoint[] {
  let totalDurationMs = 0;
  const categoryTotals = new Map<number, MutableCategoryTotal>();
  return days.map((day) => {
    totalDurationMs += day.totalDurationMs;
    for (const category of day.categories) addCategoryDuration(categoryTotals, category);
    return {
      workday: day.workday,
      totalDurationMs,
      categories: toCategoryValues(categoryTotals.values(), totalDurationMs),
    };
  });
}

function buildPeriods(
  days: DailyStatistics[],
  granularity: 'week' | 'month',
  weekStartsOn: number,
): PeriodStatistics[] {
  const periods = new Map<string, MutablePeriod>();
  for (const day of days) {
    const key =
      granularity === 'month' ? monthKey(day.workday) : weekKey(day.workday, weekStartsOn);
    const period = periods.get(key) ?? {
      key,
      startWorkday: day.workday,
      endWorkday: day.workday,
      totalDurationMs: 0,
      activeDays: 0,
      categories: new Map(),
    };
    period.endWorkday = day.workday;
    period.totalDurationMs += day.totalDurationMs;
    if (day.totalDurationMs > 0) period.activeDays += 1;
    for (const category of day.categories) addCategoryDuration(period.categories, category);
    periods.set(key, period);
  }
  return [...periods.values()].map((period) => ({
    key: period.key,
    startWorkday: period.startWorkday,
    endWorkday: period.endWorkday,
    totalDurationMs: period.totalDurationMs,
    activeDays: period.activeDays,
    categories: toCategoryValues(period.categories.values(), period.totalDurationMs),
  }));
}

function weekKey(workday: string, weekStartsOn: number): string {
  const offset = (dayOfWeek(workday) - weekStartsOn + 7) % 7;
  return addDays(workday, -offset);
}

function addCategoryDuration(
  totals: Map<number, MutableCategoryTotal>,
  category: Pick<StatisticsCategoryValue, 'categoryId' | 'categoryName' | 'durationMs'>,
): void {
  const total = totals.get(category.categoryId) ?? {
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    durationMs: 0,
  };
  total.durationMs += category.durationMs;
  totals.set(category.categoryId, total);
}

function toCategoryValues(
  categories: Iterable<MutableCategoryTotal>,
  totalDurationMs: number,
): StatisticsCategoryValue[] {
  return [...categories]
    .map((category) => ({
      ...category,
      percentage: totalDurationMs === 0 ? 0 : percentage(category.durationMs, totalDurationMs),
    }))
    .sort((a, b) => b.durationMs - a.durationMs || a.categoryName.localeCompare(b.categoryName));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(part: number, total: number): number {
  return (part / total) * 100;
}
