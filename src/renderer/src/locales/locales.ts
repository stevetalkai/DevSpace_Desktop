import englishSource from './en.strings?raw';
import chineseSource from './zh-Hans.strings?raw';

export type Locale = 'en' | 'zh-Hans';
export type StringCatalog = Record<string, string>;
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const LOCALE_STORAGE_KEY = 'app.locale';
const SOURCES: Record<Locale, string> = { en: englishSource, 'zh-Hans': chineseSource };

function decode(value: string): string {
  return value.replace(/\\([\\"nrt])/g, (_, escaped: string) => ({ '\\': '\\', '"': '"', n: '\n', r: '\r', t: '\t' }[escaped] ?? escaped));
}

/** Parses the key/value syntax used by Apple .strings files. */
export function parseStrings(source: string): StringCatalog {
  const catalog: StringCatalog = {};
  const entry = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
  for (const match of source.matchAll(entry)) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined && value !== undefined) catalog[decode(key)] = decode(value)
  }
  return catalog;
}

export function catalogFor(locale: Locale): StringCatalog { return parseStrings(SOURCES[locale]); }

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  if (value === 'en' || value.toLowerCase().startsWith('en-')) return 'en';
  if (value === 'zh' || value.toLowerCase().startsWith('zh-')) return 'zh-Hans';
  return undefined;
}

export function resolveLocale(options: { storage?: StorageLike; systemLanguage?: string } = {}): Locale {
  const stored = normalizeLocale(options.storage?.getItem(LOCALE_STORAGE_KEY));
  return stored ?? normalizeLocale(options.systemLanguage ?? globalThis.navigator?.language) ?? 'en';
}

export function saveLocale(locale: Locale, storage: StorageLike = globalThis.localStorage): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function translate(key: string, locale: Locale = resolveLocale(), ...values: Array<string | number>): string {
  const template = catalogFor(locale)[key] ?? catalogFor('en')[key] ?? key;
  let index = 0;
  return template.replace(/%(?:([1-9]\d*)\$)?[a-zA-Z]/g, (token, position?: string) => {
    const value = values[position ? Number(position) - 1 : index++];
    return value === undefined ? token : String(value);
  });
}

export const strings = { en: catalogFor('en'), 'zh-Hans': catalogFor('zh-Hans') } as const;
