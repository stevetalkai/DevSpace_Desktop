import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { installationCommand, TailscaleInstallGuide } from './TailscaleInstallGuide'

describe('Homebrew installation guidance', () => {
  it('skips Homebrew installation when already detected', () => {
    const html = renderToStaticMarkup(<TailscaleInstallGuide platform="darwin" homebrewPath="/opt/homebrew/bin/brew" t={(key) => key} />)
    expect(html).toContain('app.tailscale.brew.found')
    expect(html).toContain('install --formula tailscale')
    expect(html).not.toContain('install.sh')
  })
  it('guides Homebrew installation first when missing', () => {
    const html = renderToStaticMarkup(<TailscaleInstallGuide platform="darwin" homebrewPath={null} t={(key) => key} />)
    expect(html).toContain('app.tailscale.brew.missing')
    expect(html).toContain('Homebrew/install/HEAD/install.sh')
    expect(html).not.toContain('services start tailscale')
  })
  it('uses the selected mirror without writing shell configuration', () => {
    expect(installationCommand(null, 'ustc')).toContain('https://mirrors.ustc.edu.cn/misc/brew-install.sh')
    expect(installationCommand('/usr/local/bin/brew', 'ustc')).toContain('HOMEBREW_API_DOMAIN=')
    expect(installationCommand('/usr/local/bin/brew', 'official')).not.toContain('ustc')
    expect(installationCommand(null, 'ustc')).not.toContain('>>')
  })
})
