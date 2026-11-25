import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  StyledText,
  TextAttributes,
  TextRenderable,
  bg,
  fg,
} from '@opentui/core';

import type { CliRenderer, KeyEvent, TextChunk } from '@opentui/core';
import type { ThemeSettings } from '../../config/settings.ts';
import { chartColor } from '../theme/chart-palette.ts';

export interface CategoryListItem {
  id: number;
  name: string;
  archived: boolean;
  totalDurationMs: number;
  percentage: number;
  activeDays: number;
  dailyValues: number[];
}

export interface CategoriesView {
  root: BoxRenderable;
  setItems(items: CategoryListItem[]): void;
  setStatus(message: string): void;
  setHandlers(handlers: CategoriesViewHandlers): void;
  handleKey(key: KeyEvent): boolean;
  isEditing(): boolean;
  deactivate(): void;
  updateLayout(width: number, height: number): void;
}

interface CategoriesViewHandlers {
  create(name: string): void;
  toggleArchived(id: number): void;
  refresh(): void;
}

export function createCategoriesView(renderer: CliRenderer, theme: ThemeSettings): CategoriesView {
  const { backgroundColor, surfaceColor, textColor, accentColor, mutedColor, successColor } = theme;
  let items: CategoryListItem[] = [];
  let selectedIndex = 0;
  let editing = false;
  let visibleRows = 10;
  let detailWidth = 48;
  let currentWidth = renderer.width;
  let currentHeight = renderer.height;
  let lastStatus = '';
  let handlers: CategoriesViewHandlers = { create() {}, toggleArchived() {}, refresh() {} };

  const root = new BoxRenderable(renderer, {
    height: '100%',
    flexGrow: 1,
    minWidth: 0,
    border: false,
    backgroundColor,
    paddingX: 1,
    flexDirection: 'column',
  });

  // Top Header Card
  const headerCard = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  });

  const headerTitle = new TextRenderable(renderer, {
    content: '◈  CATEGORIES // DIRECTORY',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const headerSummary = new TextRenderable(renderer, {
    content: '0 ACTIVE  │  0 ARCHIVED  │  0 TOTAL',
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
  });

  headerCard.add(headerTitle);
  headerCard.add(headerSummary);

  // Input Card (for creating new category)
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

  const input = new InputRenderable(renderer, {
    width: '100%',
    placeholder: 'New category name · Press Enter to create, Esc to cancel',
    backgroundColor: surfaceColor,
    focusedBackgroundColor: surfaceColor,
    textColor: accentColor,
    cursorColor: accentColor,
    maxLength: 80,
  });
  inputCard.add(input);

  // Content Row: Left List Card & Right Profile Card
  const content = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    flexDirection: 'row',
  });

  // Left Card: Category Directory Table
  const listCard = new BoxRenderable(renderer, {
    minWidth: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  });

  const listCardHeading = new TextRenderable(renderer, {
    width: '100%',
    height: 1,
    content: '■  CATEGORY LIST',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const list = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: '',
    selectable: false,
  });

  const listInspector = new TextRenderable(renderer, {
    width: '100%',
    height: 2,
    flexShrink: 0,
    content: '',
    fg: mutedColor,
    selectable: false,
  });

  listCard.add(listCardHeading);
  listCard.add(list);
  listCard.add(listInspector);

  // Right Card: Category Profile
  const detailCard = new BoxRenderable(renderer, {
    minWidth: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'column',
  });

  const detailHeading = new TextRenderable(renderer, {
    width: '100%',
    height: 1,
    content: '◈  CATEGORY PROFILE',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const detail = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: '',
    selectable: false,
  });

  detailCard.add(detailHeading);
  detailCard.add(detail);

  content.add(listCard);
  content.add(detailCard);

  root.add(headerCard);
  root.add(inputCard);
  root.add(content);

  const render = (): void => {
    const activeCount = items.filter((item) => !item.archived).length;
    const archivedCount = items.length - activeCount;
    headerSummary.content = `${activeCount} ACTIVE  │  ${archivedCount} ARCHIVED  │  ${items.length} TOTAL`;

    const available = currentWidth - (currentWidth >= 105 ? 30 : 6);
    const split = available >= 75;
    const cardInnerWidth = Math.max(20, Math.floor(available * (split ? 0.48 : 1)) - 4);

    if (items.length === 0) {
      list.content = '\n  No categories recorded yet. Press [N] to create one.';
      listInspector.content = '';
      detail.content = 'Select a category to inspect its profile.';
      return;
    }

    selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

    const colIdx = 6;
    const colStatus = 8;
    const colTime = 8;
    const colCat = Math.max(12, cardInnerWidth - (colIdx + colStatus + colTime));

    const chunks: TextChunk[] = [];

    // Table Header
    chunks.push(
      fg(mutedColor)(
        `  #   ${'CATEGORY'.padEnd(colCat)}${'STATUS'.padEnd(colStatus)}${'TIME'.padStart(colTime)}\n`,
      ),
    );
    chunks.push(fg(mutedColor)(` ─${'─'.repeat(Math.max(4, cardInnerWidth - 3))}\n`));

    // Visible window
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleRows / 2), items.length - visibleRows),
    );
    const shown = items.slice(start, start + visibleRows);

    shown.forEach((item, offset) => {
      const index = start + offset;
      const isSel = index === selectedIndex;
      const numStr = (isSel ? '▶ ' : '  ') + `[${index + 1}] `;
      const nameStr = truncate(item.name, colCat - 2).padEnd(colCat);
      const statusText = item.archived ? 'ARCHIVED' : 'ACTIVE';
      const statusStr = statusText.padEnd(colStatus);
      const timeStr = formatDuration(item.totalDurationMs).padStart(colTime);

      if (isSel) {
        const row = `${numStr}${nameStr}${statusStr}${timeStr}`;
        chunks.push(fg(backgroundColor)(bg(accentColor)(row.padEnd(cardInnerWidth))));
      } else {
        chunks.push(fg(mutedColor)(numStr));
        chunks.push(fg(item.archived ? mutedColor : textColor)(nameStr));
        chunks.push(fg(item.archived ? mutedColor : successColor)(statusStr));
        chunks.push(fg(accentColor)(timeStr));
      }
      chunks.push(fg(mutedColor)('\n'));
    });

    list.content = new StyledText(chunks);

    const sel = items[selectedIndex];
    if (sel) {
      const statusSuffix = lastStatus ? ` · ${lastStatus}` : '';
      listInspector.content = ` ─${'─'.repeat(Math.max(4, cardInnerWidth - 3))}\n [N] NEW  [A] ${sel.archived ? 'RESTORE' : 'ARCHIVE'}  [R] REFRESH${statusSuffix}`;
      renderDetail(sel, selectedIndex);
    } else {
      listInspector.content = '';
      detail.content = '';
    }
  };

  const renderDetail = (item: CategoryListItem, index: number): void => {
    const sparkWidth = Math.max(12, detailWidth - 4);
    const weeklyValues = groupByWeek(item.dailyValues);
    const weeklyMaximum = Math.max(0, ...weeklyValues);
    const barWidth = Math.max(8, Math.min(28, detailWidth - 20));
    const shareFilled = Math.round((item.percentage / 100) * barWidth);
    const chunks: TextChunk[] = [
      fg(chartColor(index))(`●  ${item.name.toUpperCase()}\n`),
      fg(item.archived ? mutedColor : accentColor)(
        `${item.archived ? 'ARCHIVED' : 'ACTIVE'} CATEGORY\n\n`,
      ),
      fg(mutedColor)('TOTAL TIME          '),
      fg(accentColor)(`${formatDuration(item.totalDurationMs)}\n`),
      fg(mutedColor)('SHARE OF MONTH      '),
      fg(accentColor)(`${item.percentage.toFixed(1)}%\n`),
      fg(mutedColor)('ACTIVE DAYS         '),
      fg(accentColor)(`${item.activeDays}\n\n`),
      fg(mutedColor)('30-DAY ACTIVITY\n'),
      fg(chartColor(index))(`${sparkline(item.dailyValues, sparkWidth)}\n`),
      fg(mutedColor)(`${'LOW'.padEnd(Math.max(4, sparkWidth - 4))}HIGH\n\n`),
      fg(mutedColor)('DAILY PEAK          '),
      fg(accentColor)(`${formatDuration(Math.max(0, ...item.dailyValues))}\n`),
      fg(mutedColor)('AVERAGE / ACTIVE    '),
      fg(accentColor)(
        `${formatDuration(item.activeDays === 0 ? 0 : item.totalDurationMs / item.activeDays)}\n`,
      ),
      fg(mutedColor)('CONSISTENCY         '),
      fg(accentColor)(
        `${item.dailyValues.length === 0 ? '0' : ((item.activeDays / item.dailyValues.length) * 100).toFixed(0)}%\n\n`,
      ),
      fg(mutedColor)('MONTH SHARE\n'),
      fg(chartColor(index))('█'.repeat(shareFilled)),
      fg(mutedColor)(
        `${'░'.repeat(Math.max(0, barWidth - shareFilled))}  ${item.percentage.toFixed(1)}%\n\n`,
      ),
      fg(mutedColor)('WEEKLY LOAD\n'),
    ];
    weeklyValues.forEach((value, weekIndex) => {
      const filled = weeklyMaximum === 0 ? 0 : Math.round((value / weeklyMaximum) * barWidth);
      chunks.push(fg(mutedColor)(`W${weekIndex + 1}  `));
      chunks.push(fg(chartColor(index))('█'.repeat(filled)));
      chunks.push(
        fg(mutedColor)(`${'░'.repeat(Math.max(0, barWidth - filled))}  ${formatDuration(value)}\n`),
      );
    });
    detail.content = new StyledText(chunks);
  };

  const stopEditing = (): void => {
    editing = false;
    input.blur();
    inputCard.visible = false;
    input.value = '';
  };

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    stopEditing();
    if (value.trim()) {
      handlers.create(value.trim());
    }
  });

  return {
    root,
    setItems(nextItems) {
      items = nextItems;
      selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
      render();
    },
    setStatus(message) {
      lastStatus = message;
      render();
    },
    setHandlers(nextHandlers) {
      handlers = nextHandlers;
    },
    handleKey(key) {
      if (editing) {
        if (key.name === 'escape') {
          stopEditing();
          lastStatus = 'Creation cancelled.';
          render();
          return true;
        }
        return false;
      }
      if (key.name === 'n') {
        editing = true;
        inputCard.visible = true;
        input.focus();
        return true;
      }
      if (key.name === 'up' && items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
        return true;
      }
      if (key.name === 'down' && items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
        return true;
      }
      const selected = items[selectedIndex];
      if (key.name === 'a' && selected) {
        handlers.toggleArchived(selected.id);
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
    deactivate() {
      if (editing) stopEditing();
    },
    updateLayout(width, height) {
      currentWidth = width;
      currentHeight = height;
      const available = width - (width >= 105 ? 30 : 6);
      const split = available >= 75;

      content.flexDirection = split ? 'row' : 'column';
      if (split) {
        listCard.width = undefined;
        listCard.flexBasis = 0;
        listCard.flexGrow = 48;
        listCard.height = '100%';
        listCard.marginRight = 1;
        listCard.marginBottom = 0;

        detailCard.width = undefined;
        detailCard.flexBasis = 0;
        detailCard.flexGrow = 52;
        detailCard.height = '100%';
        detailCard.marginRight = 0;
        detailCard.marginBottom = 0;
      } else {
        listCard.width = '100%';
        listCard.flexBasis = 'auto';
        listCard.flexGrow = 0;
        listCard.height = '48%';
        listCard.marginRight = 0;
        listCard.marginBottom = 1;

        detailCard.width = '100%';
        detailCard.flexBasis = 'auto';
        detailCard.flexGrow = 0;
        detailCard.height = '50%';
        detailCard.marginRight = 0;
        detailCard.marginBottom = 0;
      }

      visibleRows = Math.max(
        3,
        split ? height - (editing ? 21 : 17) : Math.floor((height - 18) * 0.45),
      );
      detailWidth = Math.max(24, Math.floor((available - 4) * (split ? 0.5 : 1)));
      render();
    },
  };
}

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function sparkline(values: number[], width: number): string {
  const sampled =
    values.length <= width
      ? values
      : Array.from(
          { length: width },
          (_, index) => values[Math.floor((index * values.length) / width)] ?? 0,
        );
  const maximum = Math.max(0, ...sampled);
  if (maximum === 0) return '▁'.repeat(Math.max(1, sampled.length));
  return sampled.map((value) => SPARKS[Math.min(7, Math.floor((value / maximum) * 7))]).join('');
}
function groupByWeek(values: number[]): number[] {
  const groups: number[] = [];
  for (let index = 0; index < values.length; index += 7) {
    groups.push(values.slice(index, index + 7).reduce((total, value) => total + value, 0));
  }
  return groups;
}
function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  return `${Math.floor(minutes / 60)}h ${(minutes % 60).toString().padStart(2, '0')}m`;
}
function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}.`;
}
