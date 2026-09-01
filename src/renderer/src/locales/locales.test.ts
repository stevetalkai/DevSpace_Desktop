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

  it('includes Tailscale and Funnel messages in both languages', () => {
    const requiredKeys = [
      'app.tailscale.status.checking',
      'app.tailscale.status.not_installed',
      'app.tailscale.status.daemon_not_running',
      'app.tailscale.status.not_logged_in',
      'app.tailscale.status.offline',
      'app.tailscale.status.online_not_enabled',
      'app.tailscale.status.enabling',
      'app.tailscale.status.connected',
      'app.tailscale.status.failed',
      'app.tailscale.login',
      'app.tailscale.install',
      'app.tailscale.enable_connection',
      'app.tailscale.stop_connection',
      'app.tailscale.retry',
      'app.tailscale.mcp_address',
      'app.tailscale.copy_address',
      'app.tailscale.beta_risk_title',
      'app.tailscale.beta_risk_description',
    ];

    for (const key of requiredKeys) {
      expect(strings.en[key]).toBeTruthy();
      expect(strings['zh-Hans'][key]).toBeTruthy();
    }
  });

  it('includes ChatGPT connection wizard messages in both languages', () => {
    const requiredKeys = [
      'app.chatgpt.wizard.title',
      'app.chatgpt.wizard.step.copy_address',
      'app.chatgpt.wizard.step.open_settings',
      'app.chatgpt.wizard.step.authorize',
      'app.chatgpt.wizard.status.preparing',
      'app.chatgpt.wizard.status.waiting_for_request',
      'app.chatgpt.wizard.status.waiting_for_authorization',
      'app.chatgpt.wizard.status.connected',
      'app.chatgpt.wizard.status.recent_connection',
      'app.chatgpt.wizard.status.expired',
      'app.chatgpt.wizard.copy_address',
      'app.chatgpt.wizard.copy_owner_password',
      'app.chatgpt.wizard.password_copied',
      'app.chatgpt.wizard.open_chatgpt',
      'app.chatgpt.wizard.require_service_and_connection',
      'app.chatgpt.wizard.password_security_note',
      'app.chatgpt.wizard.complete',
    ];

    for (const key of requiredKeys) {
      expect(strings.en[key]).toBeTruthy();
      expect(strings['zh-Hans'][key]).toBeTruthy();
    }
  });

  it('includes settings, diagnostics, tray, restore, and port messages in both languages', () => {
    const requiredKeys = [
      'app.settings.title',
      'app.settings.description',
      'app.settings.launch_at_login',
      'app.settings.launch_at_login.on',
      'app.settings.launch_at_login.off',
      'app.advanced.title',
      'app.advanced.description',
      'app.diagnostics.title',
      'app.diagnostics.copy',
      'app.diagnostics.open_log_folder',
      'app.diagnostics.copied',
      'app.tray.status.connected',
      'app.tray.status.paused',
      'app.tray.status.stopped',
      'app.tray.menu.open_devspace',
      'app.tray.menu.open_chatgpt',
      'app.tray.menu.pause_connection',
      'app.tray.menu.resume_connection',
      'app.tray.menu.quit',
      'app.core.auto_restore',
      'app.core.port_occupied',
      'app.core.port_auto_selected',
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
