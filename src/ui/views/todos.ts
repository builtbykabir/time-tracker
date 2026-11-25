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

export interface TodoListItem {
  id: number;
  name: string;
  description: string;
  done: boolean;
  category: string;
  categoryColor: string;
  due: string;
  overdue: boolean;
}

export interface TodosView {
  root: BoxRenderable;
  setItems(items: TodoListItem[]): void;
  setStatus(message: string): void;
  setHandlers(handlers: TodosViewHandlers): void;
  handleKey(key: KeyEvent): boolean;
  isEditing(): boolean;
  deactivate(): void;
  updateLayout(width: number, height: number): void;
}

interface TodosViewHandlers {
  create(name: string): void;
  toggle(id: number, done: boolean): void;
  delete(id: number): void;
  refresh(): void;
}

type TodoFilter = 'all' | 'pending' | 'completed';

export function createTodosView(renderer: CliRenderer, theme: ThemeSettings): TodosView {
  const {
    backgroundColor,
    surfaceColor,
    textColor,
    accentColor,
    mutedColor,
    successColor,
    dangerColor,
  } = theme;
  let items: TodoListItem[] = [];
  let selectedIndex = 0;
  let editing = false;
  let visibleRows = 12;
  let filter: TodoFilter = 'all';
  let currentWidth = renderer.width;
  let currentHeight = renderer.height;
  let lastStatus = '';
  let handlers: TodosViewHandlers = { create() {}, toggle() {}, delete() {}, refresh() {} };

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
    content: '◈  TASKS',
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

  // New Task Input Panel (when [N] is pressed)
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
    placeholder:
      'Task title [@category] [#due (today, tomorrow, YYYY-MM-DD)] · Enter to save, Esc to cancel',
    backgroundColor: surfaceColor,
    focusedBackgroundColor: surfaceColor,
    textColor: accentColor,
    cursorColor: accentColor,
    maxLength: 160,
  });
  inputCard.add(input);

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
  root.add(inputCard);
  root.add(tableCard);

  const visibleItems = (): TodoListItem[] =>
    items.filter((item) => filter === 'all' || (filter === 'completed' ? item.done : !item.done));

  const render = (): void => {
    const pending = items.filter((item) => !item.done).length;
    const completed = items.filter((item) => item.done).length;
    const overdue = items.filter((item) => item.overdue && !item.done).length;

    if (currentWidth < 100) {
      headerSummary.content = `${pending}P  │  ${completed}D  │  ${overdue}!  │  [${filter.toUpperCase()}]`;
    } else {
      headerSummary.content = `${pending} PENDING  │  ${completed} DONE  │  ${overdue} OVERDUE  │  FILTER: ${filter.toUpperCase()}`;
    }

    const filtered = visibleItems();
    const tableInnerWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 36 : 10));

    if (filtered.length === 0) {
      tableText.content = `\n  No ${filter === 'all' ? '' : `${filter} `}tasks to display. Press [N] to create a task.`;
      inspectorText.content = '';
      return;
    }

    selectedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

    const colIdx = 7;
    const colCat = Math.max(16, Math.floor(tableInnerWidth * 0.2));
    const colDue = Math.max(16, Math.floor(tableInnerWidth * 0.18));
    const colStatus = 12;
    const fixedCols = colIdx + colCat + colDue + colStatus;
    const colTask = Math.max(18, tableInnerWidth - fixedCols);

    const chunks: TextChunk[] = [];

    // Table Header
    chunks.push(
      fg(mutedColor)(
        `  #    ${'TASK'.padEnd(colTask)}${'CATEGORY'.padEnd(colCat)}${'DUE DATE'.padEnd(colDue)}${'STATUS'.padEnd(colStatus)}\n`,
      ),
    );
    chunks.push(fg(mutedColor)(` ─${'─'.repeat(Math.max(4, tableInnerWidth - 3))}\n`));

    // Visible window
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleRows / 2), filtered.length - visibleRows),
    );
    const shown = filtered.slice(start, start + visibleRows);

    shown.forEach((item, offset) => {
      const idx = start + offset;
      const isSel = idx === selectedIndex;
      const num = `[${idx + 1}]`.padStart(4);
      const numStr = (isSel ? `▶ ${num} ` : `   ${num} `).padEnd(colIdx);
      const taskStr = truncate(item.name, colTask - 3).padEnd(colTask);
      const rawCat = item.category || 'General';
      const catStr = `● ${rawCat}`.slice(0, colCat - 3).padEnd(colCat);
      const dueStr = (item.due || 'No date').slice(0, colDue - 3).padEnd(colDue);
      const statusText = item.done ? 'DONE' : item.overdue ? '! OVERDUE' : 'PENDING';
      const statusStr = statusText.padEnd(colStatus);

      if (isSel) {
        const row = `${numStr}${taskStr}${rawCat.slice(0, colCat - 3).padEnd(colCat)}${dueStr}${statusStr}`;
        chunks.push(fg(backgroundColor)(bg(accentColor)(row.padEnd(tableInnerWidth))));
      } else {
        chunks.push(fg(mutedColor)(numStr));
        chunks.push(fg(item.done ? mutedColor : textColor)(taskStr));
        chunks.push(fg(item.categoryColor)(catStr));
        chunks.push(fg(item.overdue && !item.done ? dangerColor : mutedColor)(dueStr));
        chunks.push(
          fg(item.done ? successColor : item.overdue ? dangerColor : accentColor)(statusStr),
        );
      }
      chunks.push(fg(mutedColor)('\n'));
    });

    tableText.content = new StyledText(chunks);

    // Bottom detail inspector
    const sel = filtered[selectedIndex];
    if (sel) {
      const descPart = sel.description ? ` · Note: ${sel.description}` : '';
      const duePart = sel.due ? ` · ${sel.due}` : '';
      const detailMsg = `DETAILS: Task #${sel.id} "${sel.name}"${duePart}${descPart}`;
      const statusSuffix = lastStatus ? `   │   ${lastStatus}` : '';
      inspectorText.content = ` ─${'─'.repeat(Math.max(4, tableInnerWidth - 3))}\n ${truncate(detailMsg + statusSuffix, tableInnerWidth - 2)}`;
    } else {
      inspectorText.content = '';
    }
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
      const filtered = visibleItems();
      if (key.name === 'up' && filtered.length > 0) {
        selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
        render();
        return true;
      }
      if (key.name === 'down' && filtered.length > 0) {
        selectedIndex = (selectedIndex + 1) % filtered.length;
        render();
        return true;
      }
      if (key.name === 'f') {
        filter = filter === 'all' ? 'pending' : filter === 'pending' ? 'completed' : 'all';
        selectedIndex = 0;
        render();
        return true;
      }
      const selected = filtered[selectedIndex];
      if (key.name === 'space' && selected) {
        handlers.toggle(selected.id, selected.done);
        return true;
      }
      if ((key.name === 'd' || key.name === 'delete') && selected) {
        handlers.delete(selected.id);
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
      visibleRows = Math.max(3, height - (editing ? 21 : 17));
      render();
    },
  };
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}.`;
}
