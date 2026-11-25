import {
  ASCIIFontRenderable,
  BoxRenderable,
  ScrollBoxRenderable,
  StyledText,
  TextAttributes,
  TextRenderable,
  fg,
} from '@opentui/core';

import type { CliRenderer, TextChunk } from '@opentui/core';
import type { AppSettings, TimerFont } from '../../config/settings.ts';
import type {
  DailyStatistics,
  StatisticsCategoryValue,
  StatisticsReport,
} from '../../types/statistics.ts';
import { createActionButton } from '../components/action-button.ts';
import type { CurrentSessionState } from '../models/dashboard-state.ts';
import { chartColor } from '../theme/chart-palette.ts';

const FONT_WIDTHS: Record<TimerFont, number> = {
  tiny: 27,
  shade: 39,
  slick: 41,
  grid: 41,
  pallet: 41,
  block: 67,
  huge: 93,
};

export interface DashboardCategoryOption {
  id: number;
  name: string;
  selected: boolean;
}

export interface DashboardTodoItem {
  id: number;
  name: string;
  category: string;
  due: string;
  overdue: boolean;
  done: boolean;
}

export interface DashboardDeadlineItem {
  id: number;
  name: string;
  countdownLabel: string;
  daysRemaining: number;
  overdue: boolean;
}

export interface DashboardViewHandlers {
  onToggleSession?(): void;
  onCycleCategory?(): void;
}

export interface DashboardView {
  root: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
  updateLayout(width: number, height: number): void;
  setCurrentSession(state: CurrentSessionState): void;
  setElapsedTime(elapsedMs: number): void;
  setTodayReport(report: StatisticsReport): void;
  setSevenDayReport(report: StatisticsReport): void;
  setWeeklyReport(report: StatisticsReport): void;
  setMonthReport(report: StatisticsReport): void;
  setCategories(categories: DashboardCategoryOption[]): void;
  setTodoPreview(todos: DashboardTodoItem[]): void;
  setDeadlinePreview(deadlines: DashboardDeadlineItem[]): void;
  setStatusMessage(message: string): void;
  setHandlers(handlers: DashboardViewHandlers): void;
}

export function createDashboard(renderer: CliRenderer, settings: AppSettings): DashboardView {
  const { backgroundColor, surfaceColor, textColor, accentColor, mutedColor, dangerColor } =
    settings.theme;
  let handlers: DashboardViewHandlers = {};
  let lastTodayReport: StatisticsReport | null = null;
  let lastSevenDayReport: StatisticsReport | null = null;
  let lastWeekReport: StatisticsReport | null = null;
  let lastMonthReport: StatisticsReport | null = null;
  let todoItems: DashboardTodoItem[] = [];
  let deadlineItems: DashboardDeadlineItem[] = [];
  let selectedCategory = 'NONE';
  let sessionActive = false;
  let activeStartedAt = 0;
  let currentWidth = renderer.width;

  const root = new BoxRenderable(renderer, {
    height: '100%',
    flexGrow: 1,
    minWidth: 0,
    border: false,
    backgroundColor,
    paddingX: 1,
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: '100%',
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 0,
    rootOptions: { backgroundColor },
    viewportOptions: { backgroundColor },
    contentOptions: { backgroundColor, flexDirection: 'column', paddingRight: 1 },
    verticalScrollbarOptions: { trackOptions: { foregroundColor: accentColor, backgroundColor } },
  });

  // ==========================================
  // ROW 1: Current Session & Today's Overview
  // ==========================================
  const tierOne = new BoxRenderable(renderer, {
    width: '100%',
    height: 11,
    flexShrink: 0,
    flexDirection: 'row',
    marginBottom: 1,
  });

  // Card 1: Current Session
  const sessionCard = card(renderer, settings, '● CURRENT SESSION', 11);
  sessionCard.flexDirection = 'column';

  // Session middle row: Timer on left, Category on right separated by vertical divider
  const sessionMiddle = new BoxRenderable(renderer, {
    width: '100%',
    height: 5,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  });

  const timerBox = new BoxRenderable(renderer, {
    minWidth: 0,
    flexGrow: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const configuredFont: TimerFont = settings.appearance?.timerFont ?? 'tiny';
  let currentTimeString = '00:00:00';

  const timer = new ASCIIFontRenderable(renderer, {
    text: '00:00:00',
    font: configuredFont,
    color: accentColor,
    backgroundColor: surfaceColor,
    selectable: false,
  });

  const timerText = new TextRenderable(renderer, {
    content: '00:00:00',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
    visible: false,
  });

  timerBox.add(timer);
  timerBox.add(timerText);

  const sessionDivider = new TextRenderable(renderer, {
    content: ' │\n │\n │\n │',
    fg: mutedColor,
    selectable: false,
  });

  const categorySection = new BoxRenderable(renderer, {
    width: 20,
    height: '100%',
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingX: 1,
  });

  const categoryLabel = new TextRenderable(renderer, {
    width: '100%',
    content: 'CATEGORY',
    fg: mutedColor,
    attributes: TextAttributes.BOLD,
    textAlign: 'center',
    selectable: false,
  });

  const categoryBox = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    alignItems: 'center',
    justifyContent: 'center',
  });

  const categoryBoxText = new TextRenderable(renderer, {
    content: '● NONE',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });
  categoryBox.add(categoryBoxText);

  categorySection.add(categoryLabel);
  categorySection.add(categoryBox);

  const categoryInline = new TextRenderable(renderer, {
    width: '100%',
    content: '● NONE',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    textAlign: 'center',
    selectable: false,
    visible: false,
  });

  sessionMiddle.add(timerBox);
  sessionMiddle.add(sessionDivider);
  sessionMiddle.add(categorySection);
  sessionMiddle.add(categoryInline);

  // Action buttons
  const actions = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    flexDirection: 'row',
  });

  const primaryAction = createActionButton(renderer, {
    label: '[S] START SESSION',
    variant: 'primary',
    theme: settings.theme,
  });
  const categoryAction = createActionButton(renderer, {
    label: '[C] CHANGE CATEGORY',
    variant: 'secondary',
    theme: settings.theme,
  });
  primaryAction.root.marginRight = 1;
  actions.add(primaryAction.root);
  actions.add(categoryAction.root);

  sessionCard.add(sessionMiddle);
  sessionCard.add(actions);

  // Card 2: Today's Overview
  const overviewCard = card(renderer, settings, "◈ TODAY'S OVERVIEW", 11);
  overviewCard.flexDirection = 'column';

  // Row 1 of overview: Total Time, Daily Avg, Active Avg
  const overviewRow1 = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  });

  const totalTimeCol = metricCol(renderer, 'TOTAL TIME', '0m', accentColor, mutedColor);
  const dailyAvgCol = metricCol(renderer, 'DAILY AVG', '0m', accentColor, mutedColor);
  const activeAvgCol = metricCol(renderer, 'ACTIVE AVG', '0m', accentColor, mutedColor);

  overviewRow1.add(totalTimeCol.box);
  overviewRow1.add(
    new TextRenderable(renderer, {
      content: '│\n│',
      fg: mutedColor,
      selectable: false,
    }),
  );
  overviewRow1.add(dailyAvgCol.box);
  overviewRow1.add(
    new TextRenderable(renderer, {
      content: '│\n│',
      fg: mutedColor,
      selectable: false,
    }),
  );
  overviewRow1.add(activeAvgCol.box);

  const overviewDivider = new TextRenderable(renderer, {
    width: '100%',
    content: '─',
    fg: mutedColor,
    selectable: false,
  });

  // Row 2 of overview: Active Days, Absent Days
  const overviewRow2 = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  });

  const activeDaysCol = metricCol(renderer, 'ACTIVE DAYS', '0', accentColor, mutedColor);
  const absentDaysCol = metricCol(renderer, 'ABSENT DAYS', '0', accentColor, mutedColor);

  overviewRow2.add(activeDaysCol.box);
  overviewRow2.add(
    new TextRenderable(renderer, {
      content: '│\n│',
      fg: mutedColor,
      selectable: false,
    }),
  );
  overviewRow2.add(absentDaysCol.box);

  overviewCard.add(overviewRow1);
  overviewCard.add(overviewDivider);
  overviewCard.add(overviewRow2);

  tierOne.add(sessionCard);
  tierOne.add(overviewCard);

  // ==========================================
  // ROW 2: Today's Breakdown & Quick Links
  // ==========================================
  const tierTwo = new BoxRenderable(renderer, {
    width: '100%',
    height: 13,
    flexShrink: 0,
    flexDirection: 'row',
    marginBottom: 1,
  });

  // Card 3: Today's Breakdown
  const breakdownCard = card(renderer, settings, "▰ TODAY'S BREAKDOWN", 13);
  const breakdownContent = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: 'Loading breakdown...',
    fg: accentColor,
    selectable: false,
  });
  breakdownCard.add(breakdownContent);

  // Card 4: Quick Links
  const quickCard = card(renderer, settings, '▶ QUICK LINKS', 13);
  quickCard.paddingX = 2;
  quickCard.paddingY = 1;
  const quickContent = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: '',
    fg: accentColor,
    selectable: false,
  });
  quickCard.add(quickContent);

  tierTwo.add(breakdownCard);
  tierTwo.add(quickCard);

  // ==========================================
  // ROW 3: Activity Progress, Todos & Period Stats
  // ==========================================
  const tierThree = new BoxRenderable(renderer, {
    width: '100%',
    height: 12,
    flexShrink: 0,
    flexDirection: 'row',
    marginBottom: 1,
  });

  // Card 5: Activity Progress
  const progressCard = card(renderer, settings, '▲ ACTIVITY PROGRESS', 12);
  const progressBody = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  });
  const progressContent = new TextRenderable(renderer, {
    content: 'Loading 7-day activity progress...',
    fg: mutedColor,
    selectable: false,
  });
  progressBody.add(progressContent);
  progressCard.add(progressBody);

  // Card 6: Upcoming Todos
  const todosCard = card(renderer, settings, '■ UPCOMING TODOS', 12);
  const todosBody = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  });
  const todosContent = new TextRenderable(renderer, {
    content: 'No pending todos.',
    fg: accentColor,
    selectable: false,
  });
  todosBody.add(todosContent);
  todosCard.add(todosBody);

  // Card 7: Period Statistics
  const periodCard = card(renderer, settings, '◈ PERIOD STATISTICS', 12);
  const periodBody = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  });
  const periodContent = new TextRenderable(renderer, {
    content: 'Loading period stats...',
    fg: accentColor,
    selectable: false,
  });
  periodBody.add(periodContent);
  periodCard.add(periodBody);

  tierThree.add(progressCard);
  tierThree.add(todosCard);
  tierThree.add(periodCard);

  scrollBox.add(tierOne);
  scrollBox.add(tierTwo);
  scrollBox.add(tierThree);

  root.add(scrollBox);

  // ==========================================
  // Render Helpers
  // ==========================================
  const renderQuickLinks = (): void => {
    if (deadlineItems.length === 0) {
      quickContent.content = new StyledText([fg(mutedColor)('No active deadlines.')]);
      return;
    }

    const availableWidth = Math.max(20, currentWidth - (currentWidth >= 105 ? 30 : 4));
    const cardInnerWidth =
      currentWidth >= 105
        ? Math.max(18, Math.floor((availableWidth - 2) * 0.32) - 8)
        : Math.max(18, availableWidth - 8);
    const chunks: TextChunk[] = [];

    deadlineItems.slice(0, 5).forEach((deadline) => {
      const daysLabel = formatDeadlineDistance(deadline.daysRemaining);
      const nameWidth = Math.max(8, cardInnerWidth - daysLabel.length - 2);
      chunks.push(fg(textColor)(truncate(deadline.name, nameWidth).padEnd(nameWidth)));
      chunks.push(fg(mutedColor)('  '));
      chunks.push(fg(deadline.overdue ? dangerColor : accentColor)(daysLabel));
      chunks.push(fg(mutedColor)('\n'));
    });

    quickContent.content = new StyledText(chunks);
  };

  const renderBreakdown = (): void => {
    if (!lastTodayReport) return;
    const day = lastTodayReport.days[0];
    const categories = day?.categories ?? [];
    const totalDurationMs = lastTodayReport.summary.totalDurationMs;
    const availableWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 28 : 4));
    const cardInnerWidth = Math.max(20, Math.floor(availableWidth * 0.66) - 4);
    const barWidth = Math.max(16, Math.min(65, cardInnerWidth - 4));

    const chunks: TextChunk[] = [];
    chunks.push(fg(mutedColor)('Total Tracked: '));
    chunks.push(fg(textColor)(bold(`${formatDuration(totalDurationMs)}\n\n`)));

    // Progress Bar: [██████░░░░]
    chunks.push(fg(mutedColor)('['));
    if (categories.length === 0 || totalDurationMs === 0) {
      chunks.push(fg(mutedColor)('░'.repeat(barWidth)));
    } else {
      let allocatedChars = 0;
      categories.forEach((cat, index) => {
        const catChars = Math.max(1, Math.round((cat.percentage / 100) * barWidth));
        const charsToDraw = Math.min(catChars, barWidth - allocatedChars);
        if (charsToDraw > 0) {
          chunks.push(fg(chartColor(index))('█'.repeat(charsToDraw)));
          allocatedChars += charsToDraw;
        }
      });
      if (allocatedChars < barWidth) {
        chunks.push(fg(mutedColor)('░'.repeat(barWidth - allocatedChars)));
      }
    }
    chunks.push(fg(mutedColor)(']\n\n'));

    // Category breakdown list
    if (categories.length === 0) {
      chunks.push(fg(mutedColor)('No activity recorded today.'));
    } else {
      categories.slice(0, 5).forEach((cat, index) => {
        chunks.push(fg(chartColor(index))('● '));
        chunks.push(fg(textColor)(truncate(cat.categoryName, 18).padEnd(20)));
        chunks.push(fg(accentColor)(formatDuration(cat.durationMs).padStart(8)));
        chunks.push(fg(mutedColor)(`   (${cat.percentage.toFixed(0)}%)\n`));
      });
    }

    breakdownContent.content = new StyledText(chunks);
  };

  const renderActivityProgress = (): void => {
    if (!lastSevenDayReport) return;
    const availableWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 30 : 4));
    const cardInnerWidth = Math.max(20, Math.floor((availableWidth - 2) * 0.36) - 4);
    progressContent.content = renderBarChart(
      lastSevenDayReport.days,
      cardInnerWidth,
      mutedColor,
      accentColor,
      textColor,
    );
  };

  const renderTodos = (): void => {
    const availableWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 30 : 4));
    const cardInnerWidth = Math.max(16, Math.floor((availableWidth - 2) * 0.32) - 4);
    if (todoItems.length === 0) {
      todosContent.content = new StyledText([fg(mutedColor)('No pending todos.')]);
      return;
    }

    const chunks: TextChunk[] = [];
    const maxItems = 3;
    const displayItems = todoItems.slice(0, maxItems);
    const dividerWidth = Math.max(12, cardInnerWidth - 4);

    displayItems.forEach((todo, index) => {
      chunks.push(fg(accentColor)('● '));
      const titleWidth = Math.max(8, cardInnerWidth - 14);
      chunks.push(fg(textColor)(truncate(todo.name, titleWidth).padEnd(titleWidth)));

      if (todo.overdue) {
        chunks.push(fg(dangerColor)(bold(' ! OVERDUE')));
      } else if (todo.due) {
        chunks.push(fg(accentColor)(` ${todo.due}`));
      }
      chunks.push(fg(mutedColor)('\n'));

      if (index < displayItems.length - 1) {
        chunks.push(fg(mutedColor)('┄'.repeat(dividerWidth) + '\n'));
      }
    });

    const remaining = todoItems.length - maxItems;
    chunks.push(fg(mutedColor)('\n'));
    chunks.push(fg(accentColor)(bold('[5] View All')));
    if (remaining > 0) {
      chunks.push(fg(mutedColor)(` (${remaining} more)`));
    }

    todosContent.content = new StyledText(chunks);
  };

  const renderPeriod = (): void => {
    const availableWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 30 : 4));
    const cardInnerWidth = Math.max(16, Math.floor((availableWidth - 2) * 0.32) - 4);
    const chunks: TextChunk[] = [];

    const appendSection = (title: string, report: StatisticsReport | null) => {
      chunks.push(fg(accentColor)(bold(`◈ ${title}\n`)));
      const total = formatDuration(report?.summary.totalDurationMs ?? 0);
      const avg = formatDuration(report?.summary.averagePerDayMs ?? 0);
      const active = String(report?.summary.activeDays ?? 0);

      const colW = Math.max(6, Math.floor((cardInnerWidth - 2) / 3));
      chunks.push(
        fg(mutedColor)(
          center('TOTAL', colW) + center('DAILY', colW) + center('ACTIVE', colW) + '\n',
        ),
      );
      chunks.push(
        fg(textColor)(bold(center(total, colW))),
        fg(textColor)(bold(center(avg, colW))),
        fg(accentColor)(bold(center(active, colW))),
        fg(mutedColor)('\n'),
      );
    };

    appendSection('THIS WEEK', lastWeekReport);
    const colW = Math.max(6, Math.floor((cardInnerWidth - 2) / 3));
    const dividerWidth = Math.max(12, colW * 3);
    chunks.push(fg(mutedColor)('─'.repeat(dividerWidth) + '\n\n'));
    appendSection('THIS MONTH', lastMonthReport);

    periodContent.content = new StyledText(chunks);
  };

  const updateOverviewValues = (): void => {
    const totalMs = lastTodayReport?.summary.totalDurationMs ?? 0;
    const dailyAvgMs = lastMonthReport?.summary.averagePerDayMs ?? 0;
    const activeAvgMs = lastMonthReport?.summary.averagePerActiveDayMs ?? 0;
    const activeDays = lastMonthReport?.summary.activeDays ?? 0;

    let absentDays = 0;
    if (lastMonthReport) {
      const todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: settings.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const elapsedWorkdays = lastMonthReport.days.filter((d) => d.workday <= todayKey).length;
      absentDays = Math.max(0, elapsedWorkdays - activeDays);
    }

    totalTimeCol.setValue(formatDuration(totalMs));
    dailyAvgCol.setValue(formatDuration(dailyAvgMs));
    activeAvgCol.setValue(formatDuration(activeAvgMs));
    activeDaysCol.setValue(String(activeDays));
    absentDaysCol.setValue(String(absentDays));
  };

  renderQuickLinks();

  return {
    root,
    scrollBox,
    updateLayout(width) {
      currentWidth = width;
      const availableWidth = Math.max(20, width - (width >= 105 ? 30 : 4));
      const wide = availableWidth >= 80;

      // Tier One responsive
      tierOne.flexDirection = wide ? 'row' : 'column';
      tierOne.height = wide ? 11 : 22;
      if (wide) {
        sessionCard.width = undefined;
        sessionCard.flexBasis = 0;
        sessionCard.flexGrow = 52;
        sessionCard.minWidth = 0;
        sessionCard.marginRight = 1;
        sessionCard.marginBottom = 0;

        overviewCard.width = undefined;
        overviewCard.flexBasis = 0;
        overviewCard.flexGrow = 48;
        overviewCard.minWidth = 0;
        overviewCard.marginRight = 0;
        overviewCard.marginBottom = 0;
      } else {
        sessionCard.width = '100%';
        sessionCard.flexBasis = 'auto';
        sessionCard.flexGrow = 0;
        sessionCard.marginRight = 0;
        sessionCard.marginBottom = 1;

        overviewCard.width = '100%';
        overviewCard.flexBasis = 'auto';
        overviewCard.flexGrow = 0;
        overviewCard.marginRight = 0;
        overviewCard.marginBottom = 0;
      }
      sessionCard.height = 11;
      overviewCard.height = 11;

      const overviewInnerWidth = Math.max(
        10,
        Math.floor((availableWidth - 2) * (wide ? 0.48 : 0.94)) - 4,
      );
      overviewDivider.content = '─'.repeat(overviewInnerWidth);

      const sessionCardInnerWidth = Math.max(
        10,
        Math.floor((availableWidth - 2) * (wide ? 0.52 : 1.0)) - 4,
      );

      // Responsive session card & timer layout
      let availableTimerWidth: number;
      if (sessionCardInnerWidth >= 52) {
        sessionMiddle.flexDirection = 'row';
        sessionMiddle.justifyContent = undefined;
        timerBox.width = undefined;
        timerBox.flexGrow = 1;
        timerBox.height = '100%';
        sessionDivider.visible = true;
        categorySection.visible = true;
        categoryInline.visible = false;
        availableTimerWidth = sessionCardInnerWidth - 22;
      } else {
        sessionMiddle.flexDirection = 'column';
        sessionMiddle.justifyContent = 'center';
        timerBox.width = '100%';
        timerBox.flexGrow = 0;
        timerBox.height = 3;
        sessionDivider.visible = false;
        categorySection.visible = false;
        categoryInline.visible = true;
        categoryInline.content = `CATEGORY: ● ${selectedCategory.toUpperCase()}`;
        availableTimerWidth = sessionCardInnerWidth;
      }

      // Timer display fallback: Configured ASCII -> 'tiny' ASCII -> Bold monospace text
      const reqWidth = FONT_WIDTHS[configuredFont] ?? 27;
      const fitsConfigured =
        configuredFont === 'tiny'
          ? availableTimerWidth >= 28
          : availableTimerWidth >= reqWidth + 2 && sessionMiddle.flexDirection === 'row';

      if (fitsConfigured) {
        if (timer.font !== configuredFont) {
          timer.font = configuredFont;
        }
        timer.visible = true;
        timerText.visible = false;
      } else if (availableTimerWidth >= 28) {
        if (timer.font !== 'tiny') {
          timer.font = 'tiny';
        }
        timer.visible = true;
        timerText.visible = false;
      } else {
        timer.visible = false;
        timerText.visible = true;
        timerText.content = currentTimeString;
      }

      // Compact button labels when card is narrow
      if (sessionCardInnerWidth < 36) {
        primaryAction.setLabel(sessionActive ? '[S] STOP' : '[S] START');
        categoryAction.setLabel('[C] CATEGORY');
      } else {
        primaryAction.setLabel(sessionActive ? '[S] STOP SESSION' : '[S] START SESSION');
        categoryAction.setLabel('[C] CHANGE CATEGORY');
      }

      // Tier Two responsive
      tierTwo.flexDirection = wide ? 'row' : 'column';
      tierTwo.height = wide ? 13 : 26;
      if (wide) {
        breakdownCard.width = undefined;
        breakdownCard.flexBasis = 0;
        breakdownCard.flexGrow = 68;
        breakdownCard.minWidth = 0;
        breakdownCard.marginRight = 1;
        breakdownCard.marginBottom = 0;

        quickCard.width = undefined;
        quickCard.flexBasis = 0;
        quickCard.flexGrow = 32;
        quickCard.minWidth = 0;
        quickCard.marginRight = 0;
        quickCard.marginBottom = 0;
      } else {
        breakdownCard.width = '100%';
        breakdownCard.flexBasis = 'auto';
        breakdownCard.flexGrow = 0;
        breakdownCard.marginRight = 0;
        breakdownCard.marginBottom = 1;

        quickCard.width = '100%';
        quickCard.flexBasis = 'auto';
        quickCard.flexGrow = 0;
        quickCard.marginRight = 0;
        quickCard.marginBottom = 0;
      }
      breakdownCard.height = 13;
      quickCard.height = 13;

      // Tier Three responsive
      tierThree.flexDirection = wide ? 'row' : 'column';
      tierThree.height = wide ? 12 : 36;
      if (wide) {
        progressCard.width = undefined;
        progressCard.flexBasis = 0;
        progressCard.flexGrow = 36;
        progressCard.minWidth = 0;
        progressCard.marginRight = 1;
        progressCard.marginBottom = 0;

        todosCard.width = undefined;
        todosCard.flexBasis = 0;
        todosCard.flexGrow = 32;
        todosCard.minWidth = 0;
        todosCard.marginRight = 1;
        todosCard.marginBottom = 0;

        periodCard.width = undefined;
        periodCard.flexBasis = 0;
        periodCard.flexGrow = 32;
        periodCard.minWidth = 0;
        periodCard.marginRight = 0;
        periodCard.marginBottom = 0;
      } else {
        progressCard.width = '100%';
        progressCard.flexBasis = 'auto';
        progressCard.flexGrow = 0;
        progressCard.marginRight = 0;
        progressCard.marginBottom = 1;

        todosCard.width = '100%';
        todosCard.flexBasis = 'auto';
        todosCard.flexGrow = 0;
        todosCard.marginRight = 0;
        todosCard.marginBottom = 1;

        periodCard.width = '100%';
        periodCard.flexBasis = 'auto';
        periodCard.flexGrow = 0;
        periodCard.marginRight = 0;
        periodCard.marginBottom = 0;
      }
      progressCard.height = 12;
      todosCard.height = 12;
      periodCard.height = 12;

      renderBreakdown();
      renderQuickLinks();
      renderActivityProgress();
      renderTodos();
      renderPeriod();
    },
    setElapsedTime(elapsedMs) {
      const formatted = formatElapsedTime(elapsedMs);
      currentTimeString = formatted;
      timer.text = formatted;
      timerText.content = formatted;
    },
    setCurrentSession(state) {
      sessionActive = state.status === 'active';
      const isNarrow = currentWidth < 80 || (currentWidth >= 105 && currentWidth < 125);
      if (state.status === 'idle') {
        selectedCategory = state.categoryName ?? 'NONE';
        const catUpper = selectedCategory.toUpperCase();
        categoryBoxText.content = truncate(`● ${catUpper}`, 16);
        categoryInline.content = `CATEGORY: ● ${catUpper}`;
        primaryAction.setLabel(isNarrow ? '[S] START' : '[S] START SESSION');
        currentTimeString = '00:00:00';
        timer.text = '00:00:00';
        timerText.content = '00:00:00';
        return;
      }
      activeStartedAt = state.startedAt;
      selectedCategory = state.categoryName;
      const catUpper = state.categoryName.toUpperCase();
      categoryBoxText.content = truncate(`● ${catUpper}`, 16);
      categoryInline.content = `CATEGORY: ● ${catUpper}`;
      primaryAction.setLabel(isNarrow ? '[S] STOP' : '[S] STOP SESSION');
      const formatted = formatElapsedTime(Math.max(0, Date.now() - state.startedAt));
      currentTimeString = formatted;
      timer.text = formatted;
      timerText.content = formatted;
    },
    setTodayReport(report) {
      lastTodayReport = report;
      updateOverviewValues();
      renderBreakdown();
    },
    setSevenDayReport(report) {
      lastSevenDayReport = report;
      renderActivityProgress();
    },
    setWeeklyReport(report) {
      lastWeekReport = report;
      renderPeriod();
    },
    setMonthReport(report) {
      lastMonthReport = report;
      updateOverviewValues();
      renderPeriod();
    },
    setCategories(categories) {
      if (!sessionActive) {
        selectedCategory = categories.find((cat) => cat.selected)?.name ?? 'NONE';
      }
      const catUpper = selectedCategory.toUpperCase();
      categoryBoxText.content = truncate(`● ${catUpper}`, 16);
      categoryInline.content = `CATEGORY: ● ${catUpper}`;
    },
    setTodoPreview(todos) {
      todoItems = todos;
      renderTodos();
    },
    setDeadlinePreview(deadlines) {
      deadlineItems = deadlines;
      renderQuickLinks();
    },
    setStatusMessage(_message) {
      // Status message handled
    },
    setHandlers(nextHandlers) {
      handlers = nextHandlers;
    },
  };
}

function card(
  renderer: CliRenderer,
  settings: AppSettings,
  title: string,
  height: number,
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    width: '100%',
    height,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: settings.theme.accentColor,
    backgroundColor: settings.theme.surfaceColor,
    paddingX: 1,
  });

  const heading = new TextRenderable(renderer, {
    width: '100%',
    height: 1,
    content: title.includes('QUICK LINKS')
      ? '◆ DEADLINES'
      : title.includes('UPCOMING')
        ? '◆ UPCOMING TODOS'
        : title,
    fg: settings.theme.accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  container.add(heading);
  return container;
}

interface MetricCol {
  box: BoxRenderable;
  setValue(val: string): void;
}

function metricCol(
  renderer: CliRenderer,
  label: string,
  initialValue: string,
  accentColor: string,
  mutedColor: string,
): MetricCol {
  const box = new BoxRenderable(renderer, {
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const labelText = new TextRenderable(renderer, {
    width: '100%',
    content: label,
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    textAlign: 'center',
    selectable: false,
  });

  const valueText = new TextRenderable(renderer, {
    width: '100%',
    content: initialValue,
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    textAlign: 'center',
    selectable: false,
  });

  box.add(labelText);
  box.add(valueText);

  return {
    box,
    setValue(val: string) {
      valueText.content = val;
    },
  };
}

function renderBarChart(
  days: DailyStatistics[],
  width: number,
  muted: string,
  accent: string,
  text: string,
): StyledText {
  const shown = days.slice(-7);
  if (shown.length === 0) {
    return new StyledText([fg(muted)('No weekly activity recorded.')]);
  }
  const maxMs = Math.max(1, ...shown.map((d) => d.totalDurationMs));
  const maxHours = Math.max(1, Math.ceil(maxMs / 3_600_000));
  const chartHeight = 4;
  const chunks: TextChunk[] = [];

  const yAxisWidth = 4;
  const plotWidth = Math.max(14, width - yAxisWidth - 2);
  const colWidth = Math.max(3, Math.floor(plotWidth / shown.length));
  const barWidth = Math.max(1, Math.min(colWidth - 1, 3));
  const totalChartWidth = yAxisWidth + colWidth * shown.length;
  const chartLeftIndent = Math.max(0, Math.floor((width - totalChartWidth) / 2));
  const indent = ' '.repeat(chartLeftIndent);

  for (let row = chartHeight; row >= 1; row -= 1) {
    const isTop = row === chartHeight;
    const isMid = row === Math.round(chartHeight / 2);
    let yLabel = '   │';
    if (isTop) {
      yLabel = `${String(maxHours).padStart(2)}h┼`;
    } else if (isMid) {
      if (maxHours > 1) {
        const midHours = Math.round(maxHours / 2);
        yLabel = `${String(midHours).padStart(2)}h┼`;
      } else {
        yLabel = '30m┼';
      }
    }
    chunks.push(fg(muted)(`${indent}${yLabel}`));

    for (const day of shown) {
      const fraction = day.totalDurationMs / maxMs;
      const topThresh = row / chartHeight;
      const botThresh = (row - 1) / chartHeight;
      const midThresh = (botThresh + topThresh) / 2;

      let barChars = '';
      let isFilled = false;
      if (fraction >= topThresh) {
        barChars = '█'.repeat(barWidth);
        isFilled = true;
      } else if (fraction >= midThresh || (row === 1 && day.totalDurationMs > 0)) {
        barChars = '▄'.repeat(barWidth);
        isFilled = true;
      } else {
        barChars = isTop || isMid ? '┄'.repeat(barWidth) : ' '.repeat(barWidth);
      }

      const leftPad = Math.floor((colWidth - barWidth) / 2);
      const rightPad = colWidth - leftPad - barWidth;
      const gridChar = isTop || isMid ? '┄' : ' ';

      chunks.push(fg(muted)(gridChar.repeat(leftPad)));
      chunks.push(fg(isFilled ? accent : muted)(barChars));
      chunks.push(fg(muted)(gridChar.repeat(rightPad)));
    }
    chunks.push(fg(muted)('\n'));
  }

  // Baseline
  chunks.push(fg(muted)(`${indent} 0h┴${'─'.repeat(colWidth * shown.length)}\n`));

  // Day names (Mon, Tue)
  chunks.push(fg(muted)(`${indent}    `));
  for (const day of shown) {
    chunks.push(fg(text)(center(formatWeekday(day.workday, colWidth), colWidth)));
  }
  chunks.push(fg(muted)('\n'));

  // Dates
  chunks.push(fg(muted)(`${indent}    `));
  for (const day of shown) {
    const dateNum = day.workday.split('-')[2] ?? '';
    chunks.push(fg(muted)(center(dateNum, colWidth)));
  }

  return new StyledText(chunks);
}

function bold(text: string): string {
  return text;
}

function center(value: string, width: number): string {
  const text = truncate(value, width);
  const left = Math.floor((width - text.length) / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(Math.max(0, width - left - text.length))}`;
}

function formatWeekday(workday: string, colWidth = 4): string {
  const full = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${workday}T12:00:00Z`))
    .toUpperCase();
  return colWidth < 4 ? full.slice(0, 2) : full;
}

function formatSessionStart(timestamp: number, locale: string, timeZone: string): string {
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const date = new Date(timestamp);
  return `${timeFormatter.format(date)} · ${dateFormatter.format(date)}`;
}

function formatElapsedTime(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
  return [Math.floor(seconds / 3_600), Math.floor((seconds % 3_600) / 60), seconds % 60]
    .map((val) => val.toString().padStart(2, '0'))
    .join(':');
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins}m`;
}

function formatDeadlineDistance(daysRemaining: number): string {
  if (daysRemaining === 0) return 'Today';
  if (daysRemaining === 1) return '1 day left';
  if (daysRemaining > 1) return `${daysRemaining} days left`;
  if (daysRemaining === -1) return '1 day overdue';
  return `${Math.abs(daysRemaining)} days overdue`;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}.`;
}
