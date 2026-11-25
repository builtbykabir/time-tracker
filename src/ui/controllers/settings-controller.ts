import { DEFAULT_THEME_CATALOG, saveSettings } from '../../config/settings.ts';

import type { AppSettings, ThemeCatalog, TimerFont } from '../../config/settings.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { SettingField, SettingFieldKey, SettingsView } from '../views/settings.ts';

interface SettingsControllerOptions {
  onSaved(settings: AppSettings, statusMessage?: string): void;
}

export class SettingsController {
  private current: AppSettings;
  private readonly themes: ThemeCatalog;
  private readonly options: SettingsControllerOptions;

  constructor(
    private readonly view: SettingsView,
    settings: AppSettings,
    themesOrOptions: ThemeCatalog | SettingsControllerOptions,
    options?: SettingsControllerOptions,
  ) {
    this.current = cloneSettings(settings);
    this.themes = options ? (themesOrOptions as ThemeCatalog) : DEFAULT_THEME_CATALOG;
    this.options = options ?? (themesOrOptions as SettingsControllerOptions);
    view.setHandler((key, value) => {
      void this.update(key, value);
    });
  }

  initialize(): void {
    this.render();
    this.view.setStatus(
      'Enter edits a value. [Left/Right] cycles options. Changes apply immediately.',
    );
  }

  private async update(key: SettingFieldKey, value: string): Promise<void> {
    const candidate = cloneSettings(this.current);

    try {
      setSetting(candidate, key, value, this.themes);
      await saveSettings(candidate, undefined, this.themes);
      this.current = candidate;
      const statusMsg = `Saved ${key}. Changes applied immediately.`;
      this.render();
      this.view.setStatus(statusMsg);
      this.options.onSaved(cloneSettings(candidate), statusMsg);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private render(): void {
    const settings = this.current;
    const fields: SettingField[] = [
      { key: 'title', label: 'Title', value: settings.title },
      { key: 'headerLine1', label: 'Header line 1', value: settings.headerLine1 },
      { key: 'headerLine2', label: 'Header line 2', value: settings.headerLine2 },
      { key: 'locale', label: 'Locale', value: settings.locale },
      {
        key: 'theme.preset',
        label: 'Theme preset',
        value: settings.theme.preset,
        options: Object.keys(this.themes),
      },
      {
        key: 'theme.backgroundColor',
        label: 'Background colour',
        value: settings.theme.backgroundColor,
      },
      { key: 'theme.surfaceColor', label: 'Surface colour', value: settings.theme.surfaceColor },
      { key: 'theme.textColor', label: 'Text colour', value: settings.theme.textColor },
      { key: 'theme.accentColor', label: 'Accent colour', value: settings.theme.accentColor },
      { key: 'theme.mutedColor', label: 'Muted colour', value: settings.theme.mutedColor },
      { key: 'theme.successColor', label: 'Success colour', value: settings.theme.successColor },
      { key: 'theme.dangerColor', label: 'Danger colour', value: settings.theme.dangerColor },
      {
        key: 'appearance.timerFont',
        label: 'Timer font',
        value: settings.appearance.timerFont,
        options: ['tiny', 'slick', 'block', 'shade', 'grid', 'pallet', 'huge'],
      },
      { key: 'timeZone', label: 'Time zone', value: settings.timeZone },
      { key: 'workdayStart', label: 'Workday starts', value: settings.workdayStart },
      { key: 'weekStartsOn', label: 'Week starts on (0-6)', value: String(settings.weekStartsOn) },
    ];
    this.view.setFields(fields);
  }
}

function setSetting(
  settings: AppSettings,
  key: SettingFieldKey,
  value: string,
  themes: ThemeCatalog,
): void {
  switch (key) {
    case 'title':
      settings.title = value;
      break;
    case 'headerLine1':
      settings.headerLine1 = value;
      break;
    case 'headerLine2':
      settings.headerLine2 = value;
      break;
    case 'locale':
      settings.locale = value;
      break;
    case 'timeZone':
      settings.timeZone = value;
      break;
    case 'workdayStart':
      settings.workdayStart = value;
      break;
    case 'weekStartsOn':
      settings.weekStartsOn = Number(value) as AppSettings['weekStartsOn'];
      break;
    case 'theme.preset': {
      const palette = themes[value];
      if (!palette) throw new Error(`Theme "${value}" does not exist in themes.json.`);
      settings.theme = { preset: value, ...palette, graphColors: [...palette.graphColors] };
      break;
    }
    case 'theme.backgroundColor':
      settings.theme.preset = 'custom';
      settings.theme.backgroundColor = value;
      break;
    case 'theme.surfaceColor':
      settings.theme.preset = 'custom';
      settings.theme.surfaceColor = value;
      break;
    case 'theme.textColor':
      settings.theme.preset = 'custom';
      settings.theme.textColor = value;
      break;
    case 'theme.accentColor':
      settings.theme.preset = 'custom';
      settings.theme.accentColor = value;
      break;
    case 'theme.mutedColor':
      settings.theme.preset = 'custom';
      settings.theme.mutedColor = value;
      break;
    case 'theme.successColor':
      settings.theme.preset = 'custom';
      settings.theme.successColor = value;
      break;
    case 'theme.dangerColor':
      settings.theme.preset = 'custom';
      settings.theme.dangerColor = value;
      break;
    case 'appearance.timerFont':
      settings.appearance.timerFont = value as TimerFont;
      break;
  }
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    theme: { ...settings.theme, graphColors: [...settings.theme.graphColors] },
    appearance: { ...settings.appearance },
  };
}
