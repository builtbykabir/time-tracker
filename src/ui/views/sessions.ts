import { BoxRenderable, StyledText, TextAttributes, TextRenderable, bg, fg } from '@opentui/core';

import type { CliRenderer, KeyEvent, TextChunk } from '@opentui/core';
import type { ThemeSettings } from '../../config/settings.ts';

export interface SessionListItem {
  id: number;
  date: string;
  category: string;
  categoryColor: string;
  start: string;
  end: string;
  duration: string;
  durationMs: number;
  active: boolean;
}

export interface SessionsView {
  root: BoxRenderable;
  setItems(items: SessionListItem[]): void;
  setStatus(message: string): void;
  setHandlers(handlers: SessionsViewHandlers): void;
  handleKey(key: KeyEvent): boolean;
  updateLayout(terminalWidth: number, terminalHeight: number): void;
}

interface SessionsViewHandlers {
  refresh(): void;
  delete(id: number): void;
}

export function createSessionsView(renderer: CliRenderer, theme: ThemeSettings): SessionsView {
  const { backgroundColor, surfaceColor, textColor, accentColor, mutedColor, successColor } = theme;
  let items: SessionListItem[] = [];
  let selectedIndex = 0;
  let visibleRows = 12;
  let currentWidth = renderer.width;
  let currentHeight = renderer.height;
  let lastStatus = '';
  let handlers: SessionsViewHandlers = { refresh() {}, delete() {} };

  const root = new BoxRenderable(renderer, {
    height: '100%',
    flexGrow: 1,
    minWidth: 0,
    border: false,
    backgroundColor,
    paddingX: 1,
  });

  // Top Container: Stats Header Bar
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
    content: '◈  SESSION HISTORY // LOG',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const headerSummary = new TextRenderable(renderer, {
    content: '',
    fg: textColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  headerCard.add(headerTitle);
  headerCard.add(headerSummary);

  // Main Table Container
  const tableCard = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  });

  const tableText = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: '',
    selectable: false,
  });

  const inspectorText = new TextRenderable(renderer, {
    width: '100%',
    height: 2,
    flexShrink: 0,
    content: '',
    fg: mutedColor,
    selectable: false,
  });

  tableCard.add(tableText);
  tableCard.add(inspectorText);

  root.add(headerCard);
  root.add(tableCard);

  const render = (): void => {
    const completed = items.filter((item) => !item.active);
    const totalMs = completed.reduce((total, item) => total + item.durationMs, 0);
    const activeCount = items.filter((item) => item.active).length;

    if (currentWidth < 100) {
      headerSummary.content = `${items.length} SESS  │  ${formatDuration(totalMs)}  │  ${activeCount > 0 ? `${activeCount} LIVE` : 'IDLE'}`;
    } else {
      headerSummary.content = `${items.length} SESSIONS  │  ${formatDuration(totalMs)} TRACKED  │  ${activeCount > 0 ? `${activeCount} ACTIVE` : 'NONE RUNNING'}`;
    }

    const tableInnerWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 36 : 10));

    if (items.length === 0) {
      tableText.content = '\n  No sessions recorded yet. Start one from the dashboard [1].';
      inspectorText.content = '';
      return;
    }

    selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

    const colIdx = 7;
    const colDate = 14;
    const colTime = 13;
    const colDur = 13;
    const colStatus = 12;
    const fixedCols = colIdx + colDate + colTime * 2 + colDur + colStatus;
    const colCat = Math.max(12, tableInnerWidth - fixedCols);

    const chunks: TextChunk[] = [];

    // Table Header
    chunks.push(
      fg(mutedColor)(
        `  #    ${'DATE'.padEnd(colDate)}${'CATEGORY'.padEnd(colCat)}${'START'.padEnd(colTime)}${'END'.padEnd(colTime)}${'DURATION'.padEnd(colDur)}${'STATUS'.padEnd(colStatus)}\n`,
      ),
    );
    chunks.push(fg(mutedColor)(` ─${'─'.repeat(Math.max(4, tableInnerWidth - 3))}\n`));

    // Visible window
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleRows / 2), items.length - visibleRows),
    );
    const shown = items.slice(start, start + visibleRows);

    shown.forEach((item, offset) => {
      const idx = start + offset;
      const isSel = idx === selectedIndex;
      const num = `[${idx + 1}]`.padStart(4);
      const numStr = (isSel ? `▶ ${num} ` : `   ${num} `).padEnd(colIdx);
      const dateStr = item.date.slice(0, colDate - 2).padEnd(colDate);
      const catStr = `● ${item.category}`.slice(0, colCat - 3).padEnd(colCat);
      const startStr = item.start.slice(0, colTime - 2).padEnd(colTime);
      const endStr = item.end.slice(0, colTime - 2).padEnd(colTime);
      const durStr = item.duration.slice(0, colDur - 2).padEnd(colDur);
      const statusText = item.active ? '● LIVE' : 'COMPLETED';
      const statusStr = statusText.padEnd(colStatus);

      if (isSel) {
        const row = `${numStr}${dateStr}${item.category.slice(0, colCat - 3).padEnd(colCat)}${startStr}${endStr}${durStr}${statusStr}`;
        chunks.push(fg(backgroundColor)(bg(accentColor)(row.padEnd(tableInnerWidth))));
      } else {
        chunks.push(fg(mutedColor)(numStr));
        chunks.push(fg(textColor)(dateStr));
        chunks.push(fg(item.categoryColor)(catStr));
        chunks.push(fg(textColor)(startStr));
        chunks.push(fg(textColor)(endStr));
        chunks.push(fg(accentColor)(durStr));
        chunks.push(fg(item.active ? successColor : mutedColor)(statusStr));
      }
      chunks.push(fg(mutedColor)('\n'));
    });

    tableText.content = new StyledText(chunks);

    // Bottom detail inspector
    const sel = items[selectedIndex];
    if (sel) {
      const detailMsg = sel.active
        ? `DETAILS: Session #${sel.id} · ${sel.category} · Started ${sel.start} (Currently Active)`
        : `DETAILS: Session #${sel.id} · ${sel.category} · ${sel.start} → ${sel.end} (${sel.duration})`;
      const statusSuffix = lastStatus ? `   │   ${lastStatus}` : '';
      inspectorText.content = ` ─${'─'.repeat(Math.max(4, tableInnerWidth - 3))}\n ${truncate(detailMsg + statusSuffix, tableInnerWidth - 2)}`;
    } else {
      inspectorText.content = '';
    }
  };

  return {
    root,
    setItems(nextItems) {
      items = nextItems;
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
      if (key.name === 'r') {
        handlers.refresh();
        return true;
      }
      const selected = items[selectedIndex];
      if ((key.name === 'd' || key.name === 'delete') && selected && !selected.active) {
        handlers.delete(selected.id);
        return true;
      }
      return false;
    },
    updateLayout(terminalWidth, terminalHeight) {
      currentWidth = terminalWidth;
      currentHeight = terminalHeight;
      // Header is 3 + 1 margin = 4. Table card borders and inspector = 6. App shell = 7.
      visibleRows = Math.max(3, terminalHeight - 17);
      render();
    },
  };
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}.`;
}
