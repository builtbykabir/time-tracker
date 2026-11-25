export type StatisticsRangeSelection =
  | { type: 'day'; anchorAt: number }
  | { type: 'week'; anchorAt: number }
  | { type: 'month'; anchorAt: number }
  | { type: 'custom'; startWorkday: string; endWorkday: string };

export interface StatisticsQuery {
  range: StatisticsRangeSelection;
  timeZone: string;
  workdayStart: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  now?: number;
}

export interface ResolvedStatisticsRange {
  type: StatisticsRangeSelection['type'];
  startAt: number;
  endAt: number;
  startWorkday: string;
  endWorkday: string;
  dayCount: number;
}

export interface StatisticsSessionRecord {
  id: number;
  categoryId: number;
  categoryName: string;
  startedAt: number;
  endedAt: number | null;
}

export interface StatisticsCategoryValue {
  categoryId: number;
  categoryName: string;
  durationMs: number;
  percentage: number;
}

export interface DailyStatistics {
  workday: string;
  startAt: number;
  endAt: number;
  totalDurationMs: number;
  sessionCount: number;
  firstSessionStartAt: number | null;
  lastSessionEndAt: number | null;
  firstStartMinute: number | null;
  lastEndMinute: number | null;
  categories: StatisticsCategoryValue[];
}

export interface StatisticsSummary {
  totalDurationMs: number;
  averagePerDayMs: number;
  averagePerActiveDayMs: number;
  activeDays: number;
  activeDayPercentage: number;
  dailyMaximumMs: number;
  dailyMaximumWorkday: string | null;
  averageStartMinute: number | null;
  averageEndMinute: number | null;
}

export interface TimeDistributionBin {
  startMinute: number;
  endMinute: number;
  startCount: number;
  endCount: number;
  activeDurationMs: number;
}

export interface CumulativeStatisticsPoint {
  workday: string;
  totalDurationMs: number;
  categories: StatisticsCategoryValue[];
}

export interface PeriodStatistics {
  key: string;
  startWorkday: string;
  endWorkday: string;
  totalDurationMs: number;
  activeDays: number;
  categories: StatisticsCategoryValue[];
}

export interface StatisticsReport {
  generatedAt: number;
  timeZone: string;
  workdayStart: string;
  range: ResolvedStatisticsRange;
  summary: StatisticsSummary;
  days: DailyStatistics[];
  categories: StatisticsCategoryValue[];
  distribution: TimeDistributionBin[];
  cumulative: CumulativeStatisticsPoint[];
  weeks: PeriodStatistics[];
  months: PeriodStatistics[];
}
