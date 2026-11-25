import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface ThemePalette {
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
  successColor: string;
  dangerColor: string;
  graphColors: readonly string[];
}

export interface ThemeSettings extends ThemePalette {
  preset: string;
}

export type ThemeCatalog = Readonly<Record<string, Readonly<ThemePalette>>>;
export type TimerFont = 'tiny' | 'block' | 'shade' | 'slick' | 'huge' | 'grid' | 'pallet';

export interface AppearanceSettings {
  timerFont: TimerFont;
}

export interface AppSettings {
  title: string;
  headerLine1: string;
  headerLine2: string;
  locale: string;
  timeZone: string;
  workdayStart: string;
  weekStartsOn: Weekday;
  theme: ThemeSettings;
  appearance: AppearanceSettings;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_SETTINGS_PATH = resolve(import.meta.dir, '../../data/settings.json');
export const DEFAULT_THEMES_PATH = resolve(import.meta.dir, '../../data/themes.json');

export const DEFAULT_THEME_CATALOG: ThemeCatalog = Object.freeze({
  matrix: Object.freeze({
    backgroundColor: '#020A03',
    surfaceColor: '#061408',
    textColor: '#D8FFD3',
    accentColor: '#57FF3A',
    mutedColor: '#2FAA29',
    successColor: '#57FF3A',
    dangerColor: '#FF5F5F',
    graphColors: ['#57FF3A', '#00E5A8', '#B6FF5C', '#00C8FF', '#FFD166'],
  }),
  green: Object.freeze({
    backgroundColor: '#031008',
    surfaceColor: '#071D0F',
    textColor: '#D7FBE4',
    accentColor: '#40D878',
    mutedColor: '#27864B',
    successColor: '#40D878',
    dangerColor: '#FF6B6B',
    graphColors: ['#40D878', '#74E39A', '#22C55E', '#2DD4BF', '#67E8F9'],
  }),
  orange: Object.freeze({
    backgroundColor: '#0D0802',
    surfaceColor: '#1D1104',
    textColor: '#FFE4BF',
    accentColor: '#FF9F1C',
    mutedColor: '#A96716',
    successColor: '#2EC4B6',
    dangerColor: '#FF5D5D',
    graphColors: ['#FF9F1C', '#FFBF69', '#FFD166', '#2EC4B6', '#4CC9F0'],
  }),
  blue: Object.freeze({
    backgroundColor: '#020817',
    surfaceColor: '#07152D',
    textColor: '#DDE9FF',
    accentColor: '#4D8DFF',
    mutedColor: '#315FA8',
    successColor: '#2ECF73',
    dangerColor: '#FF5D8F',
    graphColors: ['#4D8DFF', '#4CC9F0', '#7B61FF', '#F15BB5', '#FFD166'],
  }),
  'light-blue': Object.freeze({
    backgroundColor: '#021013',
    surfaceColor: '#062126',
    textColor: '#DDFBFF',
    accentColor: '#52E5FF',
    mutedColor: '#2A93A4',
    successColor: '#4ADE80',
    dangerColor: '#FB7185',
    graphColors: ['#52E5FF', '#38BDF8', '#2DD4BF', '#818CF8', '#F472B6'],
  }),
  violet: Object.freeze({
    backgroundColor: '#0C0615',
    surfaceColor: '#190C29',
    textColor: '#F0DEFF',
    accentColor: '#C77DFF',
    mutedColor: '#7D4FA0',
    successColor: '#2ECF73',
    dangerColor: '#FF5D8F',
    graphColors: ['#C77DFF', '#9D4EDD', '#F15BB5', '#4CC9F0', '#FFD166'],
  }),
  mono: Object.freeze({
    backgroundColor: '#080808',
    surfaceColor: '#171717',
    textColor: '#F5F5F5',
    accentColor: '#EEEEEE',
    mutedColor: '#888888',
    successColor: '#D9D9D9',
    dangerColor: '#999999',
    graphColors: Object.freeze([
      '#FFFFFF',
      '#E5E5E5',
      '#CCCCCC',
      '#B3B3B3',
      '#999999',
      '#808080',
      '#666666',
      '#BFBFBF',
      '#D9D9D9',
      '#737373',
    ]),
  }),
});

const DEFAULT_APPEARANCE: Readonly<AppearanceSettings> = Object.freeze({ timerFont: 'slick' });

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze(
  createDefaultSettings(DEFAULT_THEME_CATALOG),
);

export async function loadThemeCatalog(
  themesPath: string = DEFAULT_THEMES_PATH,
): Promise<ThemeCatalog> {
  try {
    return parseThemeCatalog(JSON.parse(await readFile(themesPath, 'utf8')));
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    await mkdir(dirname(themesPath), { recursive: true });
    await writeFile(themesPath, `${JSON.stringify(DEFAULT_THEME_CATALOG, null, 2)}\n`, 'utf8');
    return cloneThemeCatalog(DEFAULT_THEME_CATALOG);
  }
}

export async function loadSettings(
  settingsPath: string = DEFAULT_SETTINGS_PATH,
  themes: ThemeCatalog = DEFAULT_THEME_CATALOG,
): Promise<AppSettings> {
  try {
    return parseSettings(JSON.parse(await readFile(settingsPath, 'utf8')), themes);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    const settings = createDefaultSettings(themes);
    await saveSettings(settings, settingsPath, themes);
    return settings;
  }
}

export async function saveSettings(
  settings: AppSettings,
  settingsPath: string = DEFAULT_SETTINGS_PATH,
  themes: ThemeCatalog = DEFAULT_THEME_CATALOG,
): Promise<void> {
  const validated = parseSettings(settings, themes);
  const storedTheme =
    validated.theme.preset === 'custom' ? validated.theme : { preset: validated.theme.preset };
  const storedSettings = { ...validated, theme: storedTheme };
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(storedSettings, null, 2)}\n`, 'utf8');
}

function createDefaultSettings(themes: ThemeCatalog): AppSettings {
  const preset = themes.mono ? 'mono' : firstTheme(themes)[0];
  const palette = themes[preset]!;
  return {
    title: 'Time Tracker',
    headerLine1: 'TRACK // ANALYSE',
    headerLine2: 'IMPROVE // ONE SESSION AT A TIME',
    locale: 'en-US',
    timeZone: 'UTC',
    workdayStart: '00:00',
    weekStartsOn: 1,
    theme: { preset, ...clonePalette(palette) },
    appearance: { ...DEFAULT_APPEARANCE },
  };
}

function parseSettings(value: unknown, themes: ThemeCatalog): AppSettings {
  if (!isRecord(value)) throw new Error('Settings must be a JSON object.');
  if ('theme' in value && !isRecord(value.theme)) {
    throw new Error('Setting "theme" must be a JSON object.');
  }
  if ('appearance' in value && !isRecord(value.appearance)) {
    throw new Error('Setting "appearance" must be a JSON object.');
  }

  const defaults = createDefaultSettings(themes);
  const rawTheme = isRecord(value.theme) ? value.theme : {};
  const requestedPreset = isNonEmptyString(rawTheme.preset)
    ? rawTheme.preset
    : defaults.theme.preset;
  const catalogPalette = themes[requestedPreset];
  const usesCustomTheme = requestedPreset === 'custom';
  const preset = catalogPalette || usesCustomTheme ? requestedPreset : defaults.theme.preset;
  const basePalette = catalogPalette ?? defaults.theme;
  const theme: ThemeSettings = {
    preset,
    backgroundColor: usesCustomTheme
      ? readString(rawTheme.backgroundColor, basePalette.backgroundColor)
      : basePalette.backgroundColor,
    surfaceColor: usesCustomTheme
      ? readString(rawTheme.surfaceColor, basePalette.surfaceColor)
      : basePalette.surfaceColor,
    textColor: usesCustomTheme
      ? readString(rawTheme.textColor, basePalette.textColor)
      : basePalette.textColor,
    accentColor: usesCustomTheme
      ? readString(rawTheme.accentColor, basePalette.accentColor)
      : basePalette.accentColor,
    mutedColor: usesCustomTheme
      ? readString(rawTheme.mutedColor, basePalette.mutedColor)
      : basePalette.mutedColor,
    successColor: usesCustomTheme
      ? readString(rawTheme.successColor, basePalette.successColor)
      : basePalette.successColor,
    dangerColor: usesCustomTheme
      ? readString(rawTheme.dangerColor, basePalette.dangerColor)
      : basePalette.dangerColor,
    graphColors: usesCustomTheme
      ? readColorArray(rawTheme.graphColors, basePalette.graphColors)
      : [...basePalette.graphColors],
  };

  const rawAppearance = isRecord(value.appearance) ? value.appearance : {};
  const appearance: AppearanceSettings = {
    timerFont: (rawAppearance.timerFont ??
      rawAppearance.timerFontCompact ??
      rawAppearance.timerFontWide ??
      DEFAULT_APPEARANCE.timerFont) as TimerFont,
  };
  const settings: AppSettings = {
    title: readString(value.title, defaults.title),
    headerLine1: readString(value.headerLine1, defaults.headerLine1),
    headerLine2: readString(value.headerLine2, defaults.headerLine2),
    locale: readString(value.locale, defaults.locale),
    timeZone: readString(value.timeZone, defaults.timeZone),
    workdayStart: readString(value.workdayStart, defaults.workdayStart),
    weekStartsOn: (value.weekStartsOn ?? defaults.weekStartsOn) as Weekday,
    theme,
    appearance,
  };

  validateSettings(settings);
  return settings;
}

function parseThemeCatalog(value: unknown): ThemeCatalog {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error('Theme catalog must be a non-empty JSON object.');
  }
  const catalog: Record<string, ThemePalette> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!name.trim() || name === 'custom') {
      throw new Error(`Theme name "${name}" is invalid or reserved.`);
    }
    if (!isRecord(candidate)) throw new Error(`Theme "${name}" must be a JSON object.`);
    const palette: ThemePalette = {
      backgroundColor: readRequiredColor(candidate.backgroundColor, name, 'backgroundColor'),
      surfaceColor: readRequiredColor(candidate.surfaceColor, name, 'surfaceColor'),
      textColor: readRequiredColor(candidate.textColor, name, 'textColor'),
      accentColor: readRequiredColor(candidate.accentColor, name, 'accentColor'),
      mutedColor: readRequiredColor(candidate.mutedColor, name, 'mutedColor'),
      successColor: readRequiredColor(candidate.successColor, name, 'successColor'),
      dangerColor: readRequiredColor(candidate.dangerColor, name, 'dangerColor'),
      graphColors: readColorArray(candidate.graphColors, []),
    };
    if (palette.graphColors.length < 3) {
      throw new Error(`Theme "${name}" must define at least three graphColors.`);
    }
    catalog[name] = palette;
  }
  return catalog;
}

function validateSettings(settings: AppSettings): void {
  for (const [key, value] of [
    ['title', settings.title],
    ['headerLine1', settings.headerLine1],
    ['headerLine2', settings.headerLine2],
  ] as const) {
    if (!isNonEmptyString(value)) throw new Error(`Setting "${key}" must be non-empty text.`);
  }
  if (!isValidLocale(settings.locale)) throw new Error('Setting "locale" must be a valid locale.');
  if (!isValidTimeZone(settings.timeZone)) throw new Error('Setting "timeZone" must be valid.');
  if (!isValidTime(settings.workdayStart)) {
    throw new Error('Setting "workdayStart" must use 24-hour HH:mm format.');
  }
  if (!isWeekday(settings.weekStartsOn)) {
    throw new Error('Setting "weekStartsOn" must be an integer from 0 to 6.');
  }
  for (const [key, color] of [
    ['backgroundColor', settings.theme.backgroundColor],
    ['surfaceColor', settings.theme.surfaceColor],
    ['textColor', settings.theme.textColor],
    ['accentColor', settings.theme.accentColor],
    ['mutedColor', settings.theme.mutedColor],
    ['successColor', settings.theme.successColor],
    ['dangerColor', settings.theme.dangerColor],
  ] as const) {
    if (!isHexColor(color))
      throw new Error(`Setting "theme.${key}" must be a six-digit hex colour.`);
  }
  if (settings.theme.graphColors.length < 3 || !settings.theme.graphColors.every(isHexColor)) {
    throw new Error('Setting "theme.graphColors" must contain at least three hex colours.');
  }
  if (!isTimerFont(settings.appearance.timerFont)) {
    throw new Error('Setting "appearance.timerFont" must be a supported ASCII font.');
  }
}

function firstTheme(themes: ThemeCatalog): [string, Readonly<ThemePalette>] {
  const entry = Object.entries(themes)[0];
  if (!entry) throw new Error('Theme catalog cannot be empty.');
  return entry;
}
function clonePalette(palette: Readonly<ThemePalette>): ThemePalette {
  return { ...palette, graphColors: [...palette.graphColors] };
}
function cloneThemeCatalog(themes: ThemeCatalog): ThemeCatalog {
  return Object.fromEntries(
    Object.entries(themes).map(([name, palette]) => [name, clonePalette(palette)]),
  );
}
function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
function readColorArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const colors = value.filter((color): color is string => typeof color === 'string');
  if (!colors.every(isHexColor)) throw new Error('Graph colors must be six-digit hex colours.');
  return colors;
}
function readRequiredColor(value: unknown, theme: string, field: string): string {
  if (!isHexColor(value))
    throw new Error(`Theme "${theme}" field "${field}" must be a six-digit hex colour.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
function isValidLocale(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new Intl.DateTimeFormat(value);
    return true;
  } catch {
    return false;
  }
}
function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function isValidTime(value: unknown): value is string {
  const match = typeof value === 'string' ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}
function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}
function isTimerFont(value: unknown): value is TimerFont {
  return (
    typeof value === 'string' &&
    ['tiny', 'block', 'shade', 'slick', 'huge', 'grid', 'pallet'].includes(value)
  );
}
function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
