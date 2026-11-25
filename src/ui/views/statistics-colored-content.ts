import { StyledText, fg } from '@opentui/core';

import type { TextChunk } from '@opentui/core';

import type { AppSettings } from '../../config/settings.ts';
import type {
  DailyStatistics,
  StatisticsCategoryValue,
  StatisticsReport,
} from '../../types/statistics.ts';
import { chartColor } from '../theme/chart-palette.ts';

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

type StatisticsPanel = 'overview' | 'rhythm' | 'trends' | 'calendar';

export function renderColoredStatisticsPanel(
  panel: StatisticsPanel,
  report: StatisticsReport,
  month: StatisticsReport,
  year: StatisticsReport,
  settings: AppSettings,
  width: number,
  _calendarContent: string,
): StyledText {
  switch (panel) {
    case 'overview':
      return overview(report, width, settings);
    case 'rhythm':
      return rhythm(report, width, settings);
    case 'trends':
      return trends(report, width, settings);
    case 'calendar':
      return renderColoredCalendar(month, year, settings, width);
  }
}

function overview(report: StatisticsReport, width: number, settings: AppSettings): StyledText {
  const { accentColor: accent, mutedColor: muted } = settings.theme;
  const { summary } = report;
  const chunks: TextChunk[] = [];

  // Top Metric Cards
  const metrics: Array<[string, string]> = [
    ['TOTAL TIME', formatDuration(summary.totalDurationMs)],
    ['DAILY AVG', formatDuration(summary.averagePerDayMs)],
    ['ACTIVE AVG', formatDuration(summary.averagePerActiveDayMs)],
    [
      'ACTIVE DAYS',
      `${summary.activeDays}/${report.range.dayCount} (${formatPercent(summary.activeDayPercentage)})`,
    ],
  ];

  const colW = Math.max(12, Math.floor((width - 6) / 4));
  metrics.forEach(([label], i) => {
    chunks.push(fg(muted)(center(label, colW)));
    if (i < 3) chunks.push(fg(muted)('│'));
  });
  chunks.push(fg(muted)('\n'));
  metrics.forEach(([, value], i) => {
    chunks.push(fg(accent)(center(value, colW)));
    if (i < 3) chunks.push(fg(muted)('│'));
  });
  chunks.push(fg(muted)('\n' + '─'.repeat(colW * 4 + 3) + '\n\n'));

  // Daily Total Time Graph
  chunks.push(fg(accent)('■  DAILY TOTAL TIME\n'));
  chunks.push(
    fg(chartColor(1))(
      `${verticalBars(
        report.days.map((day) => day.totalDurationMs),
        width,
        6,
      )}\n`,
    ),
  );
  chunks.push(
    fg(muted)(
      padBetween(report.days[0]?.workday ?? '', report.days.at(-1)?.workday ?? '', width) + '\n\n',
    ),
  );

  // Workday Activity Windows
  chunks.push(fg(accent)('■  WORKDAY ACTIVITY WINDOWS\n'));
  chunks.push(
    fg(muted)('Start '),
    fg(chartColor(0))(
      `${sparkline(
        report.days.map((day) => day.firstStartMinute ?? 0),
        width - 8,
      )}\n`,
    ),
    fg(muted)('End   '),
    fg(chartColor(2))(
      `${sparkline(
        report.days.map((day) => day.lastEndMinute ?? 0),
        width - 8,
      )}\n\n`,
    ),
  );

  // Category Share
  chunks.push(fg(accent)('■  CATEGORY SHARE\n'));
  if (report.categories.length === 0) {
    chunks.push(fg(muted)('No category activity in this range.\n'));
  } else {
    report.categories.slice(0, 12).forEach((category, index) => {
      chunks.push(fg(chartColor(index))(`${categoryBar(category, width)}\n`));
    });
  }

  // Daily Category Mix
  chunks.push(fg(accent)('\n■  DAILY CATEGORY MIX\n'));
  chunks.push(...dailyCategoryMix(report.days, report.categories, width, accent));

  return new StyledText(chunks);
}

function rhythm(report: StatisticsReport, width: number, settings: AppSettings): StyledText {
  const { accentColor: accent, mutedColor: muted } = settings.theme;
  const start = formatClockMinute(report.summary.averageStartMinute, report.workdayStart);
  const end = formatClockMinute(report.summary.averageEndMinute, report.workdayStart);
  const bins = report.distribution;

  const colW = Math.max(16, Math.floor((width - 4) / 2));
  const chunks: TextChunk[] = [];

  // Metrics
  chunks.push(fg(muted)(center('AVERAGE START', colW) + '│' + center('AVERAGE END', colW) + '\n'));
  chunks.push(fg(accent)(center(start, colW) + '│' + center(end, colW) + '\n'));
  chunks.push(fg(muted)('─'.repeat(colW * 2 + 1) + '\n\n'));

  // Start distribution
  chunks.push(fg(accent)('■  START-TIME DISTRIBUTION · 30-minute bins\n'));
  chunks.push(
    fg(chartColor(0))(
      `${sparkline(
        bins.map((bin) => bin.startCount),
        width,
      )}\n`,
    ),
  );
  chunks.push(fg(muted)(`${timeAxis(report.workdayStart, width)}\n\n`));

  // End distribution
  chunks.push(fg(accent)('■  END-TIME DISTRIBUTION · 30-minute bins\n'));
  chunks.push(
    fg(chartColor(2))(
      `${sparkline(
        bins.map((bin) => bin.endCount),
        width,
      )}\n`,
    ),
  );
  chunks.push(fg(muted)(`${timeAxis(report.workdayStart, width)}\n\n`));

  // Total tracked time by time of day
  chunks.push(fg(accent)('■  TOTAL TRACKED TIME BY TIME OF DAY\n'));
  chunks.push(
    fg(chartColor(1))(
      `${verticalBars(
        bins.map((bin) => bin.activeDurationMs),
        width,
        8,
      )}\n`,
    ),
  );
  chunks.push(fg(muted)(timeAxis(report.workdayStart, width)));

  return new StyledText(chunks);
}

function trends(report: StatisticsReport, width: number, settings: AppSettings): StyledText {
  const { accentColor: accent, mutedColor: muted } = settings.theme;
  const cumulative = report.cumulative.map((point) => point.totalDurationMs);
  const chunks: TextChunk[] = [];

  chunks.push(
    fg(muted)('DAILY MAXIMUM  '),
    fg(accent)(`${formatDuration(report.summary.dailyMaximumMs)}`),
    fg(muted)(`  ·  ${report.summary.dailyMaximumWorkday ?? '—'}\n\n`),
  );

  chunks.push(fg(accent)('■  CUMULATIVE TOTAL TIME\n'));
  chunks.push(fg(chartColor(1))(`${verticalBars(cumulative, width, 6)}\n\n`));

  chunks.push(fg(accent)('■  CUMULATIVE BY CATEGORY\n'));
  report.categories.slice(0, 8).forEach((category, index) => {
    const values = report.cumulative.map(
      (point) =>
        point.categories.find((value) => value.categoryId === category.categoryId)?.durationMs ?? 0,
    );
    chunks.push(
      fg(chartColor(index))(
        `${truncate(category.categoryName, 14).padEnd(14)} ${sparkline(values, Math.max(8, width - 15))}\n`,
      ),
    );
  });

  chunks.push(fg(accent)('\n■  WEEKLY TOTALS\n'));
  chunks.push(fg(chartColor(0))(`${periodBars(report.weeks, width).join('\n')}\n`));
  chunks.push(fg(accent)('\n■  MONTHLY TOTALS\n'));
  chunks.push(fg(chartColor(2))(periodBars(report.months, width).join('\n')));

  return new StyledText(chunks);
}

export function renderColoredCalendar(
  month: StatisticsReport,
  year: StatisticsReport,
  settings: AppSettings,
  width: number,
): StyledText {
  const { textColor, accentColor, mutedColor } = settings.theme;
  const first = month.days[0];
  const monthName = first
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${first.workday}T00:00:00Z`))
        .toUpperCase()
    : 'MONTH';

  const colWidth = Math.max(8, Math.min(10, Math.floor((width - 8) / 7)));
  const totalGridWidth = colWidth * 7 + 6;
  const dayNames = rotate(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], settings.weekStartsOn);
  const offset = first
    ? (new Date(`${first.workday}T00:00:00Z`).getUTCDay() - settings.weekStartsOn + 7) % 7
    : 0;

  const chunks: TextChunk[] = [];

  // Header Title
  chunks.push(fg(accentColor)(`◈  ${monthName} // ACTIVITY HEATMAP\n\n`));

  // Weekday Header Row
  dayNames.forEach((name, i) => {
    chunks.push(fg(accentColor)(center(name, colWidth)));
    if (i < 6) chunks.push(fg(mutedColor)('│'));
  });
  chunks.push(fg(mutedColor)('\n' + '─'.repeat(totalGridWidth) + '\n'));

  // Day Cells
  const totalCells = offset + month.days.length;
  const totalWeeks = Math.ceil(totalCells / 7);

  for (let w = 0; w < totalWeeks; w++) {
    // Row 1: Day numbers
    for (let d = 0; d < 7; d++) {
      const cellIndex = w * 7 + d;
      const dayIndex = cellIndex - offset;
      if (dayIndex < 0 || dayIndex >= month.days.length) {
        chunks.push(fg(mutedColor)(' '.repeat(colWidth)));
      } else {
        const day = month.days[dayIndex]!;
        const dateNum = day.workday.slice(-2);
        chunks.push(fg(textColor)(center(dateNum, colWidth)));
      }
      if (d < 6) chunks.push(fg(mutedColor)('│'));
    }
    chunks.push(fg(mutedColor)('\n'));

    // Row 2: Duration & Intensity
    for (let d = 0; d < 7; d++) {
      const cellIndex = w * 7 + d;
      const dayIndex = cellIndex - offset;
      if (dayIndex < 0 || dayIndex >= month.days.length) {
        chunks.push(fg(mutedColor)(' '.repeat(colWidth)));
      } else {
        const day = month.days[dayIndex]!;
        if (day.totalDurationMs === 0) {
          chunks.push(fg(mutedColor)(center('·', colWidth)));
        } else {
          const durStr = compactDuration(day.totalDurationMs);
          const durHours = day.totalDurationMs / 3_600_000;
          let glyph = '░';
          let color = chartColor(0);
          if (durHours >= 3) {
            glyph = '█';
            color = accentColor;
          } else if (durHours >= 2) {
            glyph = '▓';
            color = chartColor(2);
          } else if (durHours >= 1) {
            glyph = '▒';
            color = chartColor(1);
          }
          chunks.push(fg(color)(center(`${durStr} ${glyph}`, colWidth)));
        }
      }
      if (d < 6) chunks.push(fg(mutedColor)('│'));
    }
    chunks.push(fg(mutedColor)('\n'));

    if (w < totalWeeks - 1) {
      chunks.push(fg(mutedColor)('┄'.repeat(totalGridWidth) + '\n'));
    }
  }

  chunks.push(fg(mutedColor)('─'.repeat(totalGridWidth) + '\n\n'));

  // Month Summary
  chunks.push(fg(accentColor)('◈  MONTH SUMMARY: '));
  chunks.push(fg(mutedColor)('TOTAL '));
  chunks.push(fg(accentColor)(formatDuration(month.summary.totalDurationMs)));
  chunks.push(fg(mutedColor)('  │  ACTIVE '));
  chunks.push(
    fg(accentColor)(
      `${month.summary.activeDays}/${month.range.dayCount} (${formatPercent(month.summary.activeDayPercentage)})`,
    ),
  );
  chunks.push(fg(mutedColor)('  │  DAILY AVG '));
  chunks.push(fg(accentColor)(formatDuration(month.summary.averagePerDayMs)));
  chunks.push(fg(mutedColor)('  │  ACTIVE AVG '));
  chunks.push(fg(accentColor)(formatDuration(month.summary.averagePerActiveDayMs) + '\n\n'));

  // Heatmap Legend
  chunks.push(fg(mutedColor)('◈  HEATMAP:  · 0m   '));
  chunks.push(fg(chartColor(0))('░ <1h   '));
  chunks.push(fg(chartColor(1))('▒ 1-2h   '));
  chunks.push(fg(chartColor(2))('▓ 2-3h   '));
  chunks.push(fg(accentColor)('█ >3h\n\n'));

  // Year at a glance
  chunks.push(fg(accentColor)('■  YEAR AT A GLANCE // MONTHLY TOTALS\n\n'));

  const maxMonthMs = Math.max(1, ...year.months.map((p) => p.totalDurationMs));
  const numCols = width >= 75 ? 3 : 2;
  const numRows = Math.ceil(year.months.length / numCols);
  const barWidth = 8;

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const idx = r + c * numRows;
      if (idx < year.months.length) {
        const period = year.months[idx]!;
        const label = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
          .format(new Date(`${period.key}-01T00:00:00Z`))
          .toUpperCase();
        const durStr = formatDuration(period.totalDurationMs).padStart(7);
        const fraction = period.totalDurationMs / maxMonthMs;
        const filled = Math.round(fraction * barWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

        chunks.push(fg(mutedColor)(label + '  '));
        chunks.push(fg(textColor)(durStr + ' '));
        chunks.push(fg(filled > 0 ? chartColor(c % 4) : mutedColor)(bar));
        if (c < numCols - 1) chunks.push(fg(mutedColor)('   '));
      }
    }
    chunks.push(fg(mutedColor)('\n'));
  }

  return new StyledText(chunks);
}

function categoryBar(category: StatisticsCategoryValue, width: number): string {
  const labelWidth = Math.min(18, Math.max(10, Math.floor(width * 0.28)));
  const barWidth = Math.max(6, width - labelWidth - 13);
  const filled = Math.round((category.percentage / 100) * barWidth);
  return `${truncate(category.categoryName, labelWidth).padEnd(labelWidth)} ${'█'.repeat(filled)}${'·'.repeat(barWidth - filled)} ${formatPercent(category.percentage).padStart(6)} ${formatDuration(category.durationMs).padStart(7)}`;
}

function dailyCategoryMix(
  days: DailyStatistics[],
  categories: StatisticsCategoryValue[],
  width: number,
  accent: string,
): TextChunk[] {
  if (categories.length === 0) return [fg(accent)('No category activity in this range.')];
  const chunks: TextChunk[] = [];
  const shown =
    days.length > 14 ? days.filter((_, index) => index % Math.ceil(days.length / 12) === 0) : days;
  const barWidth = Math.max(10, width - 14);

  for (const day of shown) {
    chunks.push(fg(accent)(`${day.workday} `));
    if (day.totalDurationMs === 0) {
      chunks.push(fg(accent)(`${'·'.repeat(barWidth)}\n`));
      continue;
    }
    let remaining = barWidth;
    day.categories.forEach((category) => {
      if (remaining === 0) return;
      const index = Math.max(
        0,
        categories.findIndex((value) => value.categoryId === category.categoryId),
      );
      const requested = Math.max(
        1,
        Math.round((category.durationMs / day.totalDurationMs) * barWidth),
      );
      const size = Math.min(remaining, requested);
      chunks.push(fg(chartColor(index))('█'.repeat(size)));
      remaining -= size;
    });
    chunks.push(fg(accent)(`${'·'.repeat(remaining)}\n`));
  }

  categories.slice(0, 10).forEach((category, index) => {
    chunks.push(fg(chartColor(index))(`■ ${category.categoryName}  `));
  });
  return chunks;
}

function verticalBars(values: number[], width: number, height: number): string {
  const sampled = resample(values, Math.max(1, width - 1));
  const maximum = Math.max(0, ...sampled);
  if (sampled.length === 0 || maximum === 0) {
    return Array.from({ length: height }, () => '·'.repeat(Math.max(1, sampled.length))).join('\n');
  }
  const rows: string[] = [];
  for (let row = height; row >= 1; row -= 1) {
    rows.push(sampled.map((value) => (value / maximum >= row / height ? '█' : ' ')).join(''));
  }
  return rows.join('\n');
}

function sparkline(values: number[], width: number): string {
  const sampled = resample(values, Math.max(1, width));
  const maximum = Math.max(0, ...sampled);
  if (sampled.length === 0) return '—';
  if (maximum === 0) return '·'.repeat(sampled.length);
  return sampled.map((value) => SPARKS[Math.min(7, Math.floor((value / maximum) * 7))]).join('');
}

function resample(values: number[], width: number): number[] {
  if (values.length <= width) return values;
  return Array.from({ length: width }, (_, index) => {
    const start = Math.floor((index * values.length) / width);
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / width));
    const group = values.slice(start, end);
    return group.reduce((sum, value) => sum + value, 0) / group.length;
  });
}

function periodBars(periods: StatisticsReport['weeks'], width: number): string[] {
  const maximum = Math.max(0, ...periods.map((period) => period.totalDurationMs));
  const barWidth = Math.max(8, width - 22);
  return periods.map((period) => {
    const filled = maximum === 0 ? 0 : Math.round((period.totalDurationMs / maximum) * barWidth);
    return `${period.key.padEnd(10)} ${'█'.repeat(filled)}${'·'.repeat(barWidth - filled)} ${formatDuration(period.totalDurationMs).padStart(8)}`;
  });
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 30_000) return '<1m';
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}

function compactDuration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 30_000) return '<1m';
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
  }
  return `${minutes}m`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function formatClockMinute(minute: number | null, workdayStart: string): string {
  if (minute === null) return '—';
  const [hour = 0, minutes = 0] = workdayStart.split(':').map(Number);
  const absolute = (hour * 60 + minutes + Math.round(minute)) % 1_440;
  return `${Math.floor(absolute / 60)
    .toString()
    .padStart(2, '0')}:${(absolute % 60).toString().padStart(2, '0')}`;
}

function timeAxis(workdayStart: string, width: number): string {
  const [hour = 0, minute = 0] = workdayStart.split(':').map(Number);
  const middleValue = (hour * 60 + minute + 720) % 1_440;
  const middle = `${Math.floor(middleValue / 60)
    .toString()
    .padStart(2, '0')}:${(middleValue % 60).toString().padStart(2, '0')}`;
  return `${workdayStart}${padBetween('', middle, Math.floor(width / 2) - workdayStart.length)}${padBetween('', workdayStart, Math.ceil(width / 2) - middle.length)}`;
}

function padBetween(left: string, right: string, width: number): string {
  return `${left}${' '.repeat(Math.max(1, width - left.length - right.length))}${right}`;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`;
}

function center(value: string, width: number): string {
  const text = truncate(value, width);
  const left = Math.floor((width - text.length) / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(Math.max(0, width - left - text.length))}`;
}

function rotate<T>(values: T[], offset: number): T[] {
  return [...values.slice(offset), ...values.slice(0, offset)];
}
