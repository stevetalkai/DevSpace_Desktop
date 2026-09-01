import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import type { DesktopSnapshot } from '../../shared/contracts'

type SupportedLocale = 'zh-Hans' | 'en'

interface TrayActions {
  showWindow: () => void
  openChatGPT: () => Promise<void>
  pauseConnection: () => Promise<unknown>
  resumeConnection: () => Promise<unknown>
  quit: () => void
}

const messages = {
  'zh-Hans': {
    connected: 'ChatGPT 已连接', waiting: '等待 ChatGPT 连接', paused: '连接已暂停', stopped: '连接已停止', projects: (count: number) => `${count} 个项目已授权`,
    open: '打开 DevSpace', chatgpt: '打开 ChatGPT', pause: '暂停连接', resume: '继续连接', quit: '退出'
  },
  en: {
    connected: 'ChatGPT connected', waiting: 'Waiting for ChatGPT', paused: 'Connection paused', stopped: 'Connection stopped', projects: (count: number) => `${count} approved project${count === 1 ? '' : 's'}`,
    open: 'Open DevSpace', chatgpt: 'Open ChatGPT', pause: 'Pause connection', resume: 'Resume connection', quit: 'Quit'
  }
} as const

export class TrayController {
  private readonly tray: Tray
  private locale: SupportedLocale

  constructor(
    icon: NativeImage,
    private readonly getSnapshot: () => DesktopSnapshot,
    private readonly actions: TrayActions,
    locale: SupportedLocale
  ) {
    this.locale = locale
    this.tray = new Tray(icon)
    this.tray.setToolTip('DevSpace Desktop')
    this.tray.on('click', actions.showWindow)
    this.refresh()
  }

  setLocale(locale: SupportedLocale): void {
    this.locale = locale
    this.refresh()
  }

  refresh(): void {
    const snapshot = this.getSnapshot()
    const text = messages[this.locale]
    const connectionRunning = snapshot.tunnel.phase === 'connected'
    const status = snapshot.chatgpt.phase === 'connected'
      ? text.connected
      : connectionRunning ? text.waiting : snapshot.settings.resumeConnection ? text.paused : text.stopped
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: status, enabled: false },
      { label: text.projects(snapshot.projects.length), enabled: false },
      { type: 'separator' },
      { label: text.open, click: this.actions.showWindow },
      { label: text.chatgpt, enabled: connectionRunning, click: () => { void this.actions.openChatGPT() } },
      connectionRunning
        ? { label: text.pause, click: () => { void this.actions.pauseConnection() } }
        : { label: text.resume, click: () => { void this.actions.resumeConnection() } },
      { type: 'separator' },
      { label: text.quit, click: this.actions.quit }
    ]))
  }

  destroy(): void {
    this.tray.destroy()
  }
}

export function createTrayIcon(): NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="8" fill="#1f7155"/><rect x="10" y="10" width="12" height="12" rx="4" fill="white"/></svg>`
  const icon = nativeImage.createFromBuffer(Buffer.from(svg)).resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  return icon
}
