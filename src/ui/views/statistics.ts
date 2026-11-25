import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';

import type { CliRenderer, KeyEvent } from '@opentui/core';

import type { AppSettings } from '../../config/settings.ts';
import type {
  DailyStatistics,
  StatisticsCategoryValue,
  StatisticsReport,
} from '../../types/statistics.ts';
import { renderColoredStatisticsPanel } from './statistics-colored-content.ts';

type StatisticsPanel = 'overview' | 'rhythm' | 'trends' | 'calendar';
type QuickRange = 'day' | 'week' | 'month';

interface StatisticsViewHandlers {
  selectRange(range: QuickRange): void;
  selectCustomRange(value: string): void;
  shiftRange(direction: -1 | 1): void;
  refresh(): void;
}

export interface StatisticsView {
  root: BoxRenderable;
  setReports(report: StatisticsReport, month: StatisticsReport, year: StatisticsReport): void;
  setStatus(message: string): void;
  setHandlers(handlers: StatisticsViewHandlers): void;
  handleKey(key: KeyEvent): boolean;
  isEditing(): boolean;
  activate(): void;
  deactivate(): void;
  updateLayout(terminalWidth: number): void;
}

const PANELS: StatisticsPanel[] = ['overview', 'rhythm', 'trends', 'calendar'];
const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const STACK_SYMBOLS = ['█', '▓', '▒', '░', '●', '◆', '■', '▲'];

export function createStatisticsView(renderer: CliRenderer, settings: AppSettings): StatisticsView {
  const { backgroundColor, surfaceColor, accentColor, mutedColor } = settings.theme;
  let report: StatisticsReport | null = null;
  let monthReport: StatisticsReport | null = null;
  let yearReport: StatisticsReport | null = null;
  let panelIndex = 0;
  let chartWidth = 56;
  let editing = false;
  let handlers: StatisticsViewHandlers = {
    selectRange() {},
    selectCustomRange() {},
    shiftRange() {},
    refresh() {},
  };

  const root = new BoxRenderable(renderer, {
    height: '100%',
    flexGrow: 1,
    minWidth: 0,
    border: false,
    backgroundColor,
    flexDirection: 'column',
    paddingX: 1,
  });

  // Merged Top Header & Navigation Card
  const headerCard = new BoxRenderable(renderer, {
    width: '100%',
    height: 4,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 1,
  });

  const topRow = new BoxRenderable(renderer, {
    width: '100%',
    height: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const headerTitle = new TextRenderable(renderer, {
    content: '◈  STATISTICS // ANALYTICS & INSIGHTS',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const headerSummary = new TextRenderable(renderer, {
    content: 'LOADING...',
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
  });

  topRow.add(headerTitle);
  topRow.add(headerSummary);

  const bottomRow = new BoxRenderable(renderer, {
    width: '100%',
    height: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const tabs = new TextRenderable(renderer, {
    content: '',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
    flexShrink: 0,
  });

  const controls = new TextRenderable(renderer, {
    content: '[D/W/M] Range · [X] Custom · [←/→] Shift · [Tab] Panel',
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
    flexShrink: 0,
  });

  bottomRow.add(tabs);
  bottomRow.add(controls);

  headerCard.add(topRow);
  headerCard.add(bottomRow);

  // Input Card (for custom range)
  const inputCard = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    marginBottom: 1,
    visible: false,
  });

  const rangeInput = new InputRenderable(renderer, {
    width: '100%',
    placeholder: '2026-11-01..2026-11-30 · Enter to apply, Esc to cancel',
    backgroundColor: surfaceColor,
    focusedBackgroundColor: surfaceColor,
    textColor: accentColor,
    cursorColor: accentColor,
    maxLength: 32,
  });
  inputCard.add(rangeInput);

  // Main ScrollBox with Main Card
  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    rootOptions: { backgroundColor },
    viewportOptions: { backgroundColor },
    contentOptions: { backgroundColor, flexDirection: 'column' },
    verticalScrollbarOptions: {
      trackOptions: { foregroundColor: accentColor, backgroundColor },
    },
  });

  const mainCard = new BoxRenderable(renderer, {
    width: '100%',
    minHeight: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    paddingY: 1,
  });

  const content = new TextRenderable(renderer, {
    width: '100%',
    content: 'Loading statistics...',
    fg: accentColor,
    selectable: false,
  });
  mainCard.add(content);
  scrollBox.add(mainCard);

  const status = new TextRenderable(renderer, {
    width: '100%',
    content: 'Ready',
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
  });

  const render = (): void => {
    const tabLabels: Record<StatisticsPanel, string> = {
      overview: '◈ OVERVIEW',
      rhythm: '▲ RHYTHM',
      trends: '▰ TRENDS',
      calendar: '■ CALENDAR',
    };
    tabs.content = PANELS.map((panel, index) =>
      index === panelIndex ? `[ ${tabLabels[panel]} ]` : `  ${tabLabels[panel]}  `,
    ).join('│');

    if (!report || !monthReport || !yearReport) return;
    headerSummary.content = `${report.range.startWorkday} → ${report.range.endWorkday}  (${report.range.dayCount} DAYS)`;
    const panel = PANELS[panelIndex]!;
    content.content = renderColoredStatisticsPanel(
      panel,
      report,
      monthReport,
      yearReport,
      settings,
      chartWidth,
      renderCalendar(monthReport, yearReport, settings.weekStartsOn, chartWidth),
    );
  };

  const stopEditing = (): void => {
    editing = false;
    rangeInput.blur();
    inputCard.visible = false;
    rangeInput.value = '';
  };
  rangeInput.on(InputRenderableEvents.ENTER, (value: string) => {
    stopEditing();
    handlers.selectCustomRange(value);
  });
  root.add(headerCard);
  root.add(inputCard);
  root.add(scrollBox);
  root.add(status);

  return {
    root,
    setReports(nextReport, nextMonth, nextYear) {
      report = nextReport;
      monthReport = nextMonth;
      yearReport = nextYear;
      render();
    },
    setStatus(message) {
      status.content = message;
    },
    setHandlers(nextHandlers) {
      handlers = nextHandlers;
    },
    handleKey(key) {
      if (editing) {
        if (key.name === 'escape') {
          stopEditing();
          status.content = 'Custom range cancelled.';
          return true;
        }
        return false;
      }
      if (key.name === 'tab') {
        panelIndex = (panelIndex + 1) % PANELS.length;
        render();
        return true;
      }
      if (key.name === 'd' || key.name === 'w' || key.name === 'm') {
        handlers.selectRange(key.name === 'd' ? 'day' : key.name === 'w' ? 'week' : 'month');
        return true;
      }
      if (key.name === 'x') {
        editing = true;
        inputCard.visible = true;
        rangeInput.value = report ? `${report.range.startWorkday}..${report.range.endWorkday}` : '';
        rangeInput.focus();
        return true;
      }
      if (key.name === 'left') {
        handlers.shiftRange(-1);
        return true;
      }
      if (key.name === 'right') {
        handlers.shiftRange(1);
        return true;
      }
      if (key.name === 'r') {
        handlers.refresh();
        return true;
      }
      return false;
    },
    isEditing() {
      return editing;
    },
    activate() {
      scrollBox.focus();
    },
    deactivate() {
      if (editing) stopEditing();
      scrollBox.blur();
    },
    updateLayout(terminalWidth) {
      const sidebarWidth = terminalWidth >= 105 ? 26 : 0;
      chartWidth = Math.max(30, terminalWidth - sidebarWidth - 8);
      if (terminalWidth < 95) {
        controls.content = '[D/W/M] Range · [Tab] Panel';
      } else if (terminalWidth < 125) {
        controls.content = '[D/W/M] Range · [X] Custom · [←/→] Shift · [Tab] Panel';
      } else {
        controls.content = '[D/W/M] Range · [X] Custom · [←/→] Shift · [Tab] Panel · [R] Refresh';
      }
      render();
    },
  };
}

function renderOverview(report: StatisticsReport, width: number): string {
  const { summary, range } = report;
  const lines = [
    `${range.startWorkday} → ${range.endWorkday}  ·  ${range.dayCount} day${range.dayCount === 1 ? '' : 's'}`,
    '',
    metricRow(
      [
        ['TOTAL', formatDuration(summary.totalDurationMs)],
        ['AVG / DAY', formatDuration(summary.averagePerDayMs)],
        ['AVG / ACTIVE', formatDuration(summary.averagePerActiveDayMs)],
        [
          'ACTIVE',
          `${summary.activeDays}/${range.dayCount} (${formatPercent(summary.activeDayPercentage)})`,
        ],
      ],
      width,
    ),
    '',
    'DAILY TOTAL TIME',
    verticalBars(
      report.days.map((day) => day.totalDurationMs),
      width,
      6,
    ),
    padBetween(report.days[0]?.workday ?? '', report.days.at(-1)?.workday ?? '', width),
    '',
    'START / END BY WORKDAY',
    `Start ${sparkline(
      report.days.map((day) => day.firstStartMinute ?? 0),
      width - 8,
    )}`,
    `End   ${sparkline(
      report.days.map((day) => day.lastEndMinute ?? 0),
      width - 8,
    )}`,
    '',
    'CATEGORY SHARE',
    ...categoryBars(report.categories, width),
    '',
    'DAILY CATEGORY MIX',
    ...stackedCategoryDays(report.days, report.categories, width),
  ];
  return lines.join('\n');
}

function renderRhythm(report: StatisticsReport, width: number): string {
  const start = formatClockMinute(report.summary.averageStartMinute, report.workdayStart);
  const end = formatClockMinute(report.summary.averageEndMinute, report.workdayStart);
  const bins = report.distribution;
  return [
    `${report.range.startWorkday} → ${report.range.endWorkday}`,
    '',
    metricRow(
      [
        ['AVERAGE START', start],
        ['AVERAGE END', end],
      ],
      width,
    ),
    '',
    'START-TIME DISTRIBUTION · 30-minute bins',
    sparkline(
      bins.map((bin) => bin.startCount),
      width,
    ),
    timeAxis(report.workdayStart, width),
    '',
    'END-TIME DISTRIBUTION · 30-minute bins',
    sparkline(
      bins.map((bin) => bin.endCount),
      width,
    ),
    timeAxis(report.workdayStart, width),
    '',
    'TOTAL TRACKED TIME BY TIME OF DAY',
    verticalBars(
      bins.map((bin) => bin.activeDurationMs),
      width,
      8,
    ),
    timeAxis(report.workdayStart, width),
  ].join('\n');
}

function renderTrends(report: StatisticsReport, width: number): string {
  const cumulativeValues = report.cumulative.map((point) => point.totalDurationMs);
  const lines = [
    `${report.range.startWorkday} → ${report.range.endWorkday}`,
    '',
    `DAILY MAXIMUM  ${formatDuration(report.summary.dailyMaximumMs)}  ${report.summary.dailyMaximumWorkday ?? '—'}`,
    '',
    'CUMULATIVE TOTAL',
    verticalBars(cumulativeValues, width, 6),
    '',
    'CUMULATIVE BY CATEGORY',
  ];
  for (const category of report.categories.slice(0, 8)) {
    const values = report.cumulative.map(
      (point) =>
        point.categories.find((value) => value.categoryId === category.categoryId)?.durationMs ?? 0,
    );
    lines.push(
      `${truncate(category.categoryName, 14).padEnd(14)} ${sparkline(values, Math.max(8, width - 15))}`,
    );
  }
  lines.push('', 'WEEKLY TOTALS', ...periodBars(report.weeks, width));
  lines.push('', 'MONTHLY TOTALS', ...periodBars(report.months, width));
  return lines.join('\n');
}

export function renderCalendar(
  month: StatisticsReport,
  year: StatisticsReport,
  weekStartsOn: number,
  width: number,
): string {
  const first = month.days[0];
  const monthName = first
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${first.workday}T00:00:00Z`))
        .toUpperCase()
    : 'MONTH';
  const colWidth = Math.max(8, Math.min(10, Math.floor((width - 8) / 7)));
  const totalGridWidth = colWidth * 7 + 6;
  const dayNames = rotate(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], weekStartsOn);
  const offset = first
    ? (new Date(`${first.workday}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7
    : 0;

  const lines: string[] = [
    `◈  ${monthName} // ACTIVITY HEATMAP`,
    '',
    dayNames.map((name) => center(name, colWidth)).join('│'),
    '─'.repeat(totalGridWidth),
  ];

  const totalCells = offset + month.days.length;
  const totalWeeks = Math.ceil(totalCells / 7);

  for (let w = 0; w < totalWeeks; w++) {
    const dRow: string[] = [];
    const vRow: string[] = [];
    for (let d = 0; d < 7; d++) {
      const cellIndex = w * 7 + d;
      const dayIndex = cellIndex - offset;
      if (dayIndex < 0 || dayIndex >= month.days.length) {
        dRow.push(' '.repeat(colWidth));
        vRow.push(' '.repeat(colWidth));
      } else {
        const day = month.days[dayIndex]!;
        const dateNum = day.workday.slice(-2);
        dRow.push(center(dateNum, colWidth));
        if (day.totalDurationMs === 0) {
          vRow.push(center('·', colWidth));
        } else {
          const durStr = compactDuration(day.totalDurationMs);
          const durHours = day.totalDurationMs / 3_600_000;
          const glyph = durHours >= 3 ? '█' : durHours >= 2 ? '▓' : durHours >= 1 ? '▒' : '░';
          vRow.push(center(`${durStr} ${glyph}`, colWidth));
        }
      }
    }
    lines.push(dRow.join('│'));
    lines.push(vRow.join('│'));
    if (w < totalWeeks - 1) {
      lines.push('┄'.repeat(totalGridWidth));
    }
  }

  lines.push('─'.repeat(totalGridWidth));
  lines.push('');
  lines.push(
    `◈  MONTH SUMMARY: TOTAL ${formatDuration(month.summary.totalDurationMs)}  │  ACTIVE ${month.summary.activeDays}/${month.range.dayCount} (${formatPercent(month.summary.activeDayPercentage)})  │  DAILY AVG ${formatDuration(month.summary.averagePerDayMs)}`,
  );
  lines.push('◈  HEATMAP:  · 0m   ░ <1h   ▒ 1-2h   ▓ 2-3h   █ >3h');
  lines.push('');
  lines.push('■  YEAR AT A GLANCE // MONTHLY TOTALS');
  lines.push('');

  const maxMonthMs = Math.max(1, ...year.months.map((p) => p.totalDurationMs));
  const numCols = width >= 75 ? 3 : 2;
  const numRows = Math.ceil(year.months.length / numCols);
  const barWidth = 8;

  for (let r = 0; r < numRows; r++) {
    const rowItems: string[] = [];
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
        rowItems.push(`${label}  ${durStr} ${bar}`);
      }
    }
    lines.push(rowItems.join('   '));
  }

  return lines.join('\n');
}

function center(value: string, width: number): string {
  const text = truncate(value, width);
  const left = Math.floor((width - text.length) / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(Math.max(0, width - left - text.length))}`;
}

export function metricRow(metrics: Array<[string, string]>, width: number): string {
  if (width < metrics.length * 16) {
    const columns = width >= 34 ? 2 : 1;
    const cell = Math.floor(width / columns);
    const rows: string[] = [];
    for (let index = 0; index < metrics.length; index += columns) {
      rows.push(
        metrics
          .slice(index, index + columns)
          .map(([label, value]) => `${label}: ${value}`.padEnd(cell))
          .join('')
          .trimEnd(),
      );
    }
    return rows.join('\n');
  }
  const cell = Math.floor(width / metrics.length);
  return metrics
    .map(([label, value]) => `${label} ${value}`.padEnd(cell))
    .join('')
    .trimEnd();
}

export function verticalBars(values: number[], width: number, height: number): string {
  const sampled = resample(values, Math.max(1, width - 1));
  const maximum = Math.max(0, ...sampled);
  if (sampled.length === 0 || maximum === 0)
    return Array.from({ length: height }, () => '·'.repeat(Math.max(1, sampled.length))).join('\n');
  const rows: string[] = [];
  for (let row = height; row >= 1; row -= 1) {
    rows.push(sampled.map((value) => (value / maximum >= row / height ? '█' : ' ')).join(''));
  }
  return rows.join('\n');
}

export function sparkline(values: number[], width: number): string {
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

function categoryBars(categories: StatisticsCategoryValue[], width: number): string[] {
  if (categories.length === 0) return ['No category activity in this range.'];
  const labelWidth = Math.min(18, Math.max(10, Math.floor(width * 0.28)));
  const barWidth = Math.max(6, width - labelWidth - 13);
  return categories.slice(0, 12).map((category) => {
    const filled = Math.round((category.percentage / 100) * barWidth);
    return `${truncate(category.categoryName, labelWidth).padEnd(labelWidth)} ${'█'.repeat(filled)}${'·'.repeat(barWidth - filled)} ${formatPercent(category.percentage).padStart(6)} ${formatDuration(category.durationMs).padStart(7)}`;
  });
}

function stackedCategoryDays(
  days: DailyStatistics[],
  categories: StatisticsCategoryValue[],
  width: number,
): string[] {
  if (categories.length === 0) return ['No category activity in this range.'];
  const shown =
    days.length > 14 ? days.filter((_, index) => index % Math.ceil(days.length / 12) === 0) : days;
  const barWidth = Math.max(10, width - 14);
  const lines = shown.map((day) => {
    if (day.totalDurationMs === 0) return `${day.workday} ${'·'.repeat(barWidth)}`;
    let bar = '';
    for (const category of day.categories) {
      const categoryIndex = Math.max(
        0,
        categories.findIndex((value) => value.categoryId === category.categoryId),
      );
      const size = Math.max(1, Math.round((category.durationMs / day.totalDurationMs) * barWidth));
      bar += STACK_SYMBOLS[categoryIndex % STACK_SYMBOLS.length]!.repeat(size);
    }
    return `${day.workday} ${bar.slice(0, barWidth).padEnd(barWidth, '·')}`;
  });
  const legend = categories
    .slice(0, 8)
    .map(
      (category, index) =>
        `${STACK_SYMBOLS[index % STACK_SYMBOLS.length]} ${category.categoryName}`,
    )
    .join('  ');
  return [...lines, legend];
}

export function periodBars(periods: StatisticsReport['weeks'], width: number): string[] {
  const maximum = Math.max(0, ...periods.map((period) => period.totalDurationMs));
  const barWidth = Math.max(8, width - 22);
  return periods.map((period) => {
    const filled = maximum === 0 ? 0 : Math.round((period.totalDurationMs / maximum) * barWidth);
    return `${period.key.padEnd(10)} ${'█'.repeat(filled)}${'·'.repeat(barWidth - filled)} ${formatDuration(period.totalDurationMs).padStart(8)}`;
  });
}

function calendarCell(day: DailyStatistics, width: number): string {
  const date = day.workday.slice(-2);
  const duration = day.totalDurationMs === 0 ? '--' : compactDuration(day.totalDurationMs);
  return truncate(`${date} ${duration}`, width - 1);
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
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 || ''}`;
  return `${minutes}m`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

export function formatClockMinute(minute: number | null, workdayStart: string): string {
  if (minute === null) return '—';
  const [hour = 0, minutes = 0] = workdayStart.split(':').map(Number);
  const absolute = (hour * 60 + minutes + Math.round(minute)) % 1_440;
  return `${Math.floor(absolute / 60)
    .toString()
    .padStart(2, '0')}:${(absolute % 60).toString().padStart(2, '0')}`;
}

export function timeAxis(workdayStart: string, width: number): string {
  const start = workdayStart;
  const [hour = 0, minute = 0] = start.split(':').map(Number);
  const middleValue = (hour * 60 + minute + 720) % 1_440;
  const middle = `${Math.floor(middleValue / 60)
    .toString()
    .padStart(2, '0')}:${(middleValue % 60).toString().padStart(2, '0')}`;
  return `${start}${padBetween('', middle, Math.floor(width / 2) - start.length)}${padBetween('', start, Math.ceil(width / 2) - middle.length)}`;
}

function intensity(value: number, maximum: number): string {
  if (value === 0 || maximum === 0) return '·';
  return SPARKS[Math.min(7, Math.floor((value / maximum) * 7))]!;
}

export function padBetween(left: string, right: string, width: number): string {
  return `${left}${' '.repeat(Math.max(1, width - left.length - right.length))}${right}`;
}

function rotate<T>(values: T[], offset: number): T[] {
  return [...values.slice(offset), ...values.slice(0, offset)];
}
export function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`;
}
function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
