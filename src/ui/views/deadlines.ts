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

export interface DeadlineListItem {
  id: number;
  name: string;
  deadlineWorkday: string;
  countdownLabel: string;
  daysRemaining: number;
  overdue: boolean;
  completed: boolean;
}

interface DeadlineViewHandlers {
  create(value: string): void;
  toggle(id: number, completed: boolean): void;
  delete(id: number): void;
  refresh(): void;
}

export interface DeadlinesView {
  root: BoxRenderable;
  setItems(items: DeadlineListItem[]): void;
  setStatus(message: string): void;
  setHandlers(handlers: DeadlineViewHandlers): void;
  handleKey(key: KeyEvent): boolean;
  isEditing(): boolean;
  deactivate(): void;
  updateLayout(width: number, height: number): void;
}

type Filter = 'all' | 'active' | 'completed';

export function createDeadlinesView(renderer: CliRenderer, theme: ThemeSettings): DeadlinesView {
  const { backgroundColor, surfaceColor, accentColor, mutedColor, dangerColor, successColor } =
    theme;
  let items: DeadlineListItem[] = [];
  let selectedIndex = 0;
  let visibleRows = 10;
  let filter: Filter = 'active';
  let editing = false;
  let width = renderer.width;
  let lastStatus = '';
  let handlers: DeadlineViewHandlers = { create() {}, toggle() {}, delete() {}, refresh() {} };

  const root = new BoxRenderable(renderer, {
    height: '100%',
    flexGrow: 1,
    minWidth: 0,
    border: false,
    backgroundColor,
    paddingX: 1,
  });

  const header = new BoxRenderable(renderer, {
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
  const title = new TextRenderable(renderer, {
    content: '◆  DEADLINES',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });
  const summary = new TextRenderable(renderer, { content: '', fg: accentColor, selectable: false });
  header.add(title);
  header.add(summary);

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
    placeholder: 'Deadline name / YYYY-MM-DD  ·  Enter to save  ·  Esc to cancel',
    backgroundColor: surfaceColor,
    focusedBackgroundColor: surfaceColor,
    textColor: accentColor,
    cursorColor: accentColor,
    maxLength: 174,
  });
  inputCard.add(input);

  const listCard = new BoxRenderable(renderer, {
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
  const list = new TextRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    content: '',
    selectable: false,
  });
  const inspector = new TextRenderable(renderer, {
    width: '100%',
    height: 2,
    flexShrink: 0,
    content: '',
    fg: mutedColor,
    selectable: false,
  });
  listCard.add(list);
  listCard.add(inspector);
  root.add(header);
  root.add(inputCard);
  root.add(listCard);

  const visibleItems = (): DeadlineListItem[] =>
    items.filter((item) => filter === 'all' || item.completed === (filter === 'completed'));

  const render = (): void => {
    const active = items.filter((item) => !item.completed).length;
    const overdue = items.filter((item) => item.overdue).length;
    const completed = items.length - active;
    summary.content =
      width < 65
        ? `${active}A · ${overdue}! · ${filter[0]!.toUpperCase()}`
        : width < 90
          ? `${active} ACTIVE  ·  ${overdue} LATE  ·  [${filter.toUpperCase()}]`
          : `${active} ACTIVE  ·  ${overdue} OVERDUE  ·  ${completed} COMPLETED  ·  FILTER: ${filter.toUpperCase()}`;

    const filtered = visibleItems();
    const innerWidth = Math.max(20, width - (width >= 105 ? 36 : 10));
    if (filtered.length === 0) {
      list.content = `\n  No ${filter === 'all' ? '' : `${filter} `}deadlines. Press [N] to create one.`;
      inspector.content = lastStatus ? `\n ${truncate(lastStatus, innerWidth - 2)}` : '';
      return;
    }
    selectedIndex = Math.min(selectedIndex, filtered.length - 1);

    if (width < 75) {
      const chunks: TextChunk[] = [
        fg(mutedColor)(`  DEADLINE${' '.repeat(Math.max(1, innerWidth - 22))}COUNTDOWN\n`),
        fg(mutedColor)(`  ${'─'.repeat(Math.max(8, innerWidth - 4))}\n`),
      ];
      const start = Math.max(
        0,
        Math.min(selectedIndex - Math.floor(visibleRows / 2), filtered.length - visibleRows),
      );
      filtered.slice(start, start + visibleRows).forEach((item, offset) => {
        const index = start + offset;
        const isSelected = index === selectedIndex;
        const countdownWidth = 9;
        const nameWidth = Math.max(10, innerWidth - countdownWidth - 5);
        const name = `${isSelected ? '›' : ' '} ${truncate(item.name, nameWidth - 2)}`.padEnd(
          nameWidth,
        );
        const countdown = item.countdownLabel.padStart(countdownWidth);
        const firstLine = `  ${name}${countdown}`;
        if (isSelected) {
          chunks.push(fg(backgroundColor)(bg(accentColor)(firstLine.padEnd(innerWidth))));
        } else {
          chunks.push(fg(item.completed ? mutedColor : accentColor)(`  ${name}`));
          chunks.push(fg(item.overdue ? dangerColor : accentColor)(countdown));
        }
        const status = item.completed ? 'DONE' : item.overdue ? 'OVERDUE' : 'ACTIVE';
        chunks.push(fg(mutedColor)(`\n    ${item.deadlineWorkday} · ${status}\n`));
      });
      list.content = new StyledText(chunks);
      const selected = filtered[selectedIndex];
      inspector.content = selected
        ? ` ${selected.countdownLabel} · ${truncate(lastStatus || selected.name, innerWidth - 12)}`
        : '';
      return;
    }

    const countWidth = 12;
    const dateWidth = 14;
    const statusWidth = 12;
    const nameWidth = Math.max(12, innerWidth - countWidth - dateWidth - statusWidth - 4);
    const chunks: TextChunk[] = [
      fg(mutedColor)(
        `  ${'DEADLINE'.padEnd(nameWidth)}${'DATE'.padEnd(dateWidth)}${'COUNTDOWN'.padEnd(countWidth)}STATUS\n`,
      ),
      fg(mutedColor)(`  ${'─'.repeat(Math.max(8, innerWidth - 4))}\n`),
    ];
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleRows / 2), filtered.length - visibleRows),
    );
    filtered.slice(start, start + visibleRows).forEach((item, offset) => {
      const index = start + offset;
      const selected = index === selectedIndex;
      const name = `${selected ? '›' : ' '} ${truncate(item.name, nameWidth - 2)}`.padEnd(
        nameWidth,
      );
      const date = item.deadlineWorkday.padEnd(dateWidth);
      const countdown = item.countdownLabel.padEnd(countWidth);
      const status = (item.completed ? 'DONE' : item.overdue ? 'OVERDUE' : 'ACTIVE').padEnd(
        statusWidth,
      );
      const row = `  ${name}${date}${countdown}${status}`;
      if (selected) {
        chunks.push(fg(backgroundColor)(bg(accentColor)(row.padEnd(innerWidth))));
      } else {
        chunks.push(fg(item.completed ? mutedColor : accentColor)(`  ${name}`));
        chunks.push(fg(mutedColor)(date));
        chunks.push(fg(item.overdue ? dangerColor : accentColor)(countdown));
        chunks.push(
          fg(item.completed ? successColor : item.overdue ? dangerColor : mutedColor)(status),
        );
      }
      chunks.push(fg(mutedColor)('\n'));
    });
    list.content = new StyledText(chunks);
    const selected = filtered[selectedIndex];
    inspector.content = selected
      ? ` ${selected.completed ? 'Completed' : selected.countdownLabel} · ${selected.deadlineWorkday} · ${truncate(lastStatus || selected.name, Math.max(8, innerWidth - 30))}`
      : '';
  };

  const stopEditing = (): void => {
    editing = false;
    input.blur();
    input.value = '';
    inputCard.visible = false;
  };

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    stopEditing();
    if (value.trim()) handlers.create(value.trim());
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
        filter = filter === 'active' ? 'completed' : filter === 'completed' ? 'all' : 'active';
        selectedIndex = 0;
        render();
        return true;
      }
      const selected = filtered[selectedIndex];
      if (key.name === 'space' && selected) {
        handlers.toggle(selected.id, selected.completed);
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
    isEditing: () => editing,
    deactivate() {
      if (editing) stopEditing();
    },
    updateLayout(nextWidth, height) {
      width = nextWidth;
      visibleRows = Math.max(3, height - (editing ? 21 : 17));
      render();
    },
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
