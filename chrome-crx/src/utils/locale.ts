export function isChineseLocale(locale?: string) {
  return !!locale && locale.toLowerCase().startsWith('zh');
}
