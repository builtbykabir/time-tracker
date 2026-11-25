const FALLBACK_CHART_PALETTE = [
  '#ff9f1c',
  '#2ecf73',
  '#3a86ff',
  '#4cc9f0',
  '#b26cff',
  '#ff5d8f',
  '#ffd166',
  '#ff595e',
  '#00b8a9',
  '#f15bb5',
] as const;

let activeChartPalette: readonly string[] = FALLBACK_CHART_PALETTE;

export function configureChartPalette(colors: readonly string[]): void {
  activeChartPalette = colors.length > 0 ? [...colors] : FALLBACK_CHART_PALETTE;
}

export function chartColor(index: number): string {
  const normalizedIndex = Math.abs(Math.trunc(index));
  return activeChartPalette[normalizedIndex % activeChartPalette.length]!;
}
