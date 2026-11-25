import type { AppSettings } from '../../config/settings.ts';
import type { StatisticsService } from '../../services/statistics-service.ts';
import { WorkdayClock, addDays } from '../../services/statistics-range.ts';
import type { StatisticsRangeSelection } from '../../types/statistics.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { StatisticsView } from '../views/statistics.ts';

type QuickRange = 'day' | 'week' | 'month';

export class StatisticsController {
  private settings: AppSettings;
  private anchorAt = Date.now();
  private selection: StatisticsRangeSelection = { type: 'month', anchorAt: this.anchorAt };
  private lastRange: { startWorkday: string; endWorkday: string; dayCount: number } | null = null;

  constructor(
    private readonly view: StatisticsView,
    private readonly statisticsService: StatisticsService,
    settings: AppSettings,
  ) {
    this.settings = cloneSettings(settings);
    view.setHandlers({
      selectRange: (range) => this.selectRange(range),
      selectCustomRange: (value) => this.selectCustomRange(value),
      shiftRange: (direction) => this.shiftRange(direction),
      refresh: () => this.refresh(),
    });
  }

  initialize(): void {
    this.refresh();
  }

  updateSettings(settings: AppSettings): void {
    this.settings = cloneSettings(settings);
    this.refresh();
  }

  refresh(): void {
    try {
      const now = Date.now();
      const report = this.statisticsService.getReport(this.query(this.selection, now));
      this.lastRange = report.range;
      const clock = new WorkdayClock(this.settings.timeZone, this.settings.workdayStart);
      const calendarAnchor = clock.boundaryForWorkday(report.range.startWorkday) + 60_000;
      const month =
        report.range.type === 'month'
          ? report
          : this.statisticsService.getReport(
              this.query({ type: 'month', anchorAt: calendarAnchor }, now),
            );
      const year = report.range.startWorkday.slice(0, 4);
      const yearReport = this.statisticsService.getReport(
        this.query(
          { type: 'custom', startWorkday: `${year}-01-01`, endWorkday: `${year}-12-31` },
          now,
        ),
      );
      this.view.setReports(report, month, yearReport);
      this.view.setStatus(
        `${titleCase(report.range.type)} · ${report.range.startWorkday} → ${report.range.endWorkday} · generated ${new Intl.DateTimeFormat(this.settings.locale, { timeZone: this.settings.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)}`,
      );
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private selectRange(range: QuickRange): void {
    this.selection = { type: range, anchorAt: this.anchorAt };
    this.refresh();
  }

  private selectCustomRange(value: string): void {
    const match = /^\s*(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(value);
    if (!match?.[1] || !match[2]) {
      this.view.setStatus('Use a custom range like 2026-11-01..2026-11-30.');
      return;
    }
    this.selection = { type: 'custom', startWorkday: match[1], endWorkday: match[2] };
    this.refresh();
  }

  private shiftRange(direction: -1 | 1): void {
    if (!this.lastRange) return;
    const clock = new WorkdayClock(this.settings.timeZone, this.settings.workdayStart);

    if (this.selection.type === 'custom') {
      this.selection = {
        type: 'custom',
        startWorkday: addDays(this.lastRange.startWorkday, direction * this.lastRange.dayCount),
        endWorkday: addDays(this.lastRange.endWorkday, direction * this.lastRange.dayCount),
      };
      this.anchorAt = clock.boundaryForWorkday(this.selection.startWorkday) + 60_000;
    } else if (this.selection.type === 'month') {
      const shifted = shiftMonth(this.lastRange.startWorkday, direction);
      this.anchorAt = clock.boundaryForWorkday(shifted) + 60_000;
      this.selection = { type: 'month', anchorAt: this.anchorAt };
    } else {
      const amount = this.selection.type === 'week' ? 7 : 1;
      const shifted = addDays(this.lastRange.startWorkday, direction * amount);
      this.anchorAt = clock.boundaryForWorkday(shifted) + 60_000;
      this.selection = { type: this.selection.type, anchorAt: this.anchorAt };
    }
    this.refresh();
  }

  private query(range: StatisticsRangeSelection, now: number) {
    return {
      range,
      timeZone: this.settings.timeZone,
      workdayStart: this.settings.workdayStart,
      weekStartsOn: this.settings.weekStartsOn,
      now,
    };
  }
}

function shiftMonth(workday: string, amount: number): string {
  const [year = 0, month = 1] = workday.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-01`;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return { ...settings, theme: { ...settings.theme }, appearance: { ...settings.appearance } };
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
