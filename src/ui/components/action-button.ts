import { BoxRenderable, TextAttributes, TextRenderable } from '@opentui/core';

import type { CliRenderer } from '@opentui/core';
import type { ThemeSettings } from '../../config/settings.ts';

export interface ActionButtonOptions {
  label: string;
  variant: 'primary' | 'secondary';
  theme: ThemeSettings;
}

export interface ActionButton {
  root: BoxRenderable;
  setLabel(label: string): void;
}

export function createActionButton(
  renderer: CliRenderer,
  options: ActionButtonOptions,
): ActionButton {
  const { surfaceColor, accentColor } = options.theme;

  const button = new BoxRenderable(renderer, {
    height: 3,
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    alignItems: 'center',
    justifyContent: 'center',
  });

  const label = new TextRenderable(renderer, {
    content: options.label,
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  button.add(label);

  return {
    root: button,
    setLabel(content: string): void {
      label.content = content;
    },
  };
}
