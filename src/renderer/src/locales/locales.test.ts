import { describe, expect, it } from 'vitest';
import { catalogFor, normalizeLocale, parseStrings, resolveLocale, strings } from './locales';

const placeholders = (value: string) => [...value.matchAll(/%(?:([1-9]\d*)\$)?([a-zA-Z])/g)].map((m) => `${m[1] ?? ''}$${m[2]}`);

describe('locale resources', () => {
  it('has identical keys in both languages', () => {
    expect(Object.keys(strings.en).sort()).toEqual(Object.keys(strings['zh-Hans']).sort());
    expect(Object.keys(strings.en).every((key) => key.startsWith('app.'))).toBe(true);
  });

  it('has identical placeholder signatures', () => {
    for (const key of Object.keys(strings.en)) {
      expect(placeholders(strings.en[key] ?? '')).toEqual(placeholders(strings['zh-Hans'][key] ?? ''))
    }
  });

  it('includes project management messages in both languages', () => {
    const requiredKeys = [
      'app.project.added',
      'app.project.removed',
      'app.project.path',
      'app.project.invalid_directory',
      'app.project.read_failed',
      'app.project.home_directory_risk_title',
      'app.project.home_directory_risk_description',
      'app.project.root_directory_risk_title',
      'app.project.root_directory_risk_description',
      'app.project.confirm_authorization',
      'app.project.risk_title',
      'app.project.risk_description',
      'app.project.confirm_high_risk',
      'app.project.unavailable',
      'app.project.save_failed',
      'app.project.candidate_expired',
      'app.project.restart_notice',
      'app.common.cancel',
      'app.core.restart_required',
      'app.project.count.one',
      'app.project.count.other',
      'app.settings.language.english_short',
      'app.settings.language.chinese_short',
    ];

    for (const key of requiredKeys) {
      expect(strings.en[key]).toBeTruthy();
      expect(strings['zh-Hans'][key]).toBeTruthy();
    }
  });

  it('parses escaped .strings values', () => expect(parseStrings('"app.example" = "A\\nB";')['app.example']).toBe('A\nB'));

  it('uses Chinese for Chinese system languages and English otherwise', () => {
    expect(normalizeLocale('zh')).toBe('zh-Hans');
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
    expect(resolveLocale({ systemLanguage: 'zh-Hans' })).toBe('zh-Hans');
    expect(resolveLocale({ systemLanguage: 'fr-FR' })).toBe('en');
  });

  it('prefers a saved language choice', () => {
    const storage = { getItem: () => 'en', setItem: () => undefined };
    expect(resolveLocale({ storage, systemLanguage: 'zh-CN' })).toBe('en');
  });

  it('keeps the two public catalogs usable', () => expect(catalogFor('en')['app.name']).toBe('DevSpace Desktop'));
});
