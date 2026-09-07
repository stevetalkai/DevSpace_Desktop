import { useState, type JSX } from 'react'
import { TailscaleCommandButton } from './TailscaleCommandButton'

type Source = 'official' | 'ustc'
interface Props {
  platform: string
  homebrewPath: string | null
  t: (key: string, ...values: Array<string | number>) => string
}

export function installationCommand(homebrewPath: string | null, source: Source): string {
  const mirror = source === 'ustc'
    ? 'HOMEBREW_BREW_GIT_REMOTE=https://mirrors.ustc.edu.cn/brew.git HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles HOMEBREW_API_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles/api '
    : ''
  if (homebrewPath) return mirror + quote(homebrewPath) + ' install --formula tailscale'
  const url = source === 'ustc'
    ? 'https://mirrors.ustc.edu.cn/misc/brew-install.sh'
    : 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh'
  return mirror + '/bin/bash -c "$(curl -fsSL ' + url + ')"'
}

function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

export function TailscaleInstallGuide({ platform, homebrewPath, t }: Props): JSX.Element {
  const [source, setSource] = useState<Source>('official')
  if (platform !== 'darwin') return <></>
  return (
    <>
      <p role="status">{t(homebrewPath ? 'app.tailscale.brew.found' : 'app.tailscale.brew.missing')}</p>
      {homebrewPath && <code>{homebrewPath}</code>}
      <label>{t('app.tailscale.brew.source')}{' '}
        <select value={source} onChange={(event) => setSource(event.target.value as Source)}>
          <option value="official">{t('app.tailscale.brew.official')}</option>
          <option value="ustc">{t('app.tailscale.brew.ustc')}</option>
        </select>
      </label>
      {source === 'ustc' && <p>{t('app.tailscale.brew.mirror_note')}</p>}
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{installationCommand(homebrewPath, source)}</pre>
      <TailscaleCommandButton action="install" source={source} t={t} />
      {homebrewPath ? (
        <>
          <p>{t('app.tailscale.cli.after_install')}</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{'sudo ' + quote(homebrewPath) + ' services start tailscale\n' + quote(homebrewPath.replace(/brew$/, 'tailscale')) + ' login'}</pre>
        </>
      ) : <p>{t('app.tailscale.brew.next')}</p>}
    </>
  )
}
