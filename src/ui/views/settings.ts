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

export type SettingFieldKey =
  | 'title'
  | 'headerLine1'
  | 'headerLine2'
  | 'locale'
  | 'timeZone'
  | 'workdayStart'
  | 'weekStartsOn'
  | 'theme.preset'
  | 'theme.backgroundColor'
  | 'theme.surfaceColor'
  | 'theme.textColor'
  | 'theme.accentColor'
  | 'theme.mutedColor'
  | 'theme.successColor'
  | 'theme.dangerColor'
  | 'appearance.timerFont';

export interface SettingField {
  key: SettingFieldKey;
  label: string;
  value: string;
  options?: readonly string[];
}

export interface SettingsView {
  root: BoxRenderable;
  setFields(fields: SettingField[]): void;
  setStatus(message: string): void;
  setHandler(handler: (key: SettingFieldKey, value: string) => void): void;
  handleKey(key: KeyEvent): boolean;
  isEditing(): boolean;
  deactivate(): void;
  updateLayout(width: number, height: number): void;
  getSelectedIndex(): number;
  setSelectedIndex(index: number): void;
}

export function createSettingsView(renderer: CliRenderer, theme: ThemeSettings): SettingsView {
  const { backgroundColor, surfaceColor, textColor, accentColor, mutedColor, successColor } = theme;
  let fields: SettingField[] = [];
  let selectedIndex = 0;
  let editing = false;
  let currentWidth = renderer.width;
  let currentHeight = renderer.height;
  let visibleRows = 12;
  let lastStatus = 'Loading settings...';
  let saveHandler = (_key: SettingFieldKey, _value: string): void => {};

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
    content: '◈  SETTINGS // CONFIGURATION',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const headerSummary = new TextRenderable(renderer, {
    content: 'PREFERENCES CONFIGURED',
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
  });

  headerCard.add(headerTitle);
  headerCard.add(headerSummary);

  // Input Card (for editing text values)
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
    placeholder: 'Enter new value · Press Enter to save, Esc to cancel',
    backgroundColor: surfaceColor,
    focusedBackgroundColor: surfaceColor,
    textColor: accentColor,
    cursorColor: accentColor,
    maxLength: 160,
  });
  inputCard.add(input);

  // Main Settings Table Container
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

  const render = (): void => {
    headerSummary.content = `${fields.length} PREFERENCES CONFIGURED`;
    const tableInnerWidth = Math.max(40, currentWidth - (currentWidth >= 105 ? 36 : 10));

    if (fields.length === 0) {
      tableText.content = '\n  Loading preferences...';
      inspectorText.content = '';
      return;
    }

    selectedIndex = Math.min(selectedIndex, Math.max(0, fields.length - 1));

    const colIdx = 7;
    const colType = 18;
    const colKey = Math.max(22, Math.floor(tableInnerWidth * 0.35));
    const fixedCols = colIdx + colKey + colType;
    const colVal = Math.max(20, tableInnerWidth - fixedCols);

    const chunks: TextChunk[] = [];

    // Table Header
    chunks.push(
      fg(mutedColor)(
        `  #    ${'PREFERENCE'.padEnd(colKey)}${'CURRENT VALUE'.padEnd(colVal)}${'CONTROL'.padEnd(colType)}\n`,
      ),
    );
    chunks.push(fg(mutedColor)(` ─${'─'.repeat(Math.max(4, tableInnerWidth - 3))}\n`));

    // Visible window
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleRows / 2), fields.length - visibleRows),
    );
    const shown = fields.slice(start, start + visibleRows);

    shown.forEach((field, offset) => {
      const idx = start + offset;
      const isSel = idx === selectedIndex;
      const num = `[${idx + 1}]`.padStart(4);
      const numStr = (isSel ? `▶ ${num} ` : `   ${num} `).padEnd(colIdx);
      const keyStr = field.label.slice(0, colKey - 3).padEnd(colKey);
      const valStr = truncate(field.value, colVal - 3).padEnd(colVal);
      const controlText = field.options ? '◀ MENU CHOICE ▶' : '[ENTER TO EDIT]';
      const controlStr = controlText.padEnd(colType);

      if (isSel) {
        const row = `${numStr}${keyStr}${valStr}${controlStr}`;
        chunks.push(fg(backgroundColor)(bg(accentColor)(row.padEnd(tableInnerWidth))));
      } else {
        chunks.push(fg(mutedColor)(numStr));
        chunks.push(fg(textColor)(keyStr));
        chunks.push(fg(accentColor)(valStr));
        chunks.push(fg(field.options ? successColor : mutedColor)(controlStr));
      }
      chunks.push(fg(mutedColor)('\n'));
    });

    tableText.content = new StyledText(chunks);

    // Bottom detail inspector
    const sel = fields[selectedIndex];
    if (sel) {
      const editHint = sel.options
        ? '[ENTER] or [◀ / ▶] to cycle choices'
        : '[ENTER] to type new value';
      const detailMsg = `DETAILS: ${sel.label} (${sel.key}) · ${editHint}`;
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
    const field = fields[selectedIndex];
    stopEditing();
    if (field && value.trim()) {
      saveHandler(field.key, value.trim());
    }
  });

  return {
    root,
    setFields(nextFields) {
      fields = nextFields;
      selectedIndex = Math.min(selectedIndex, Math.max(0, fields.length - 1));
      render();
    },
    setStatus(message) {
      lastStatus = message;
      render();
    },
    setHandler(handler) {
      saveHandler = handler;
    },
    handleKey(key) {
      if (editing) {
        if (key.name === 'escape') {
          stopEditing();
          lastStatus = 'Edit cancelled.';
          render();
          return true;
        }
        return false;
      }
      if (key.name === 'up' && fields.length > 0) {
        selectedIndex = (selectedIndex - 1 + fields.length) % fields.length;
        render();
        return true;
      }
      if (key.name === 'down' && fields.length > 0) {
        selectedIndex = (selectedIndex + 1) % fields.length;
        render();
        return true;
      }
      const selected = fields[selectedIndex];
      if ((key.name === 'left' || key.name === 'right') && selected?.options) {
        const currentIndex = Math.max(0, selected.options.indexOf(selected.value));
        const direction = key.name === 'right' ? 1 : -1;
        const nextIndex =
          (currentIndex + direction + selected.options.length) % selected.options.length;
        saveHandler(selected.key, selected.options[nextIndex]!);
        return true;
      }
      if (key.name === 'return' && selected) {
        if (selected.options) {
          const currentIndex = Math.max(0, selected.options.indexOf(selected.value));
          saveHandler(
            selected.key,
            selected.options[(currentIndex + 1) % selected.options.length]!,
          );
          return true;
        }
        editing = true;
        input.value = selected.value;
        inputCard.visible = true;
        input.focus();
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
    getSelectedIndex() {
      return selectedIndex;
    },
    setSelectedIndex(index: number) {
      selectedIndex = Math.max(0, index);
      if (fields.length > 0) {
        selectedIndex = Math.min(selectedIndex, fields.length - 1);
      }
      render();
    },
  };
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}.`;
}
