import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProjectList } from './ProjectList'

describe('ProjectList', () => {
  it('shows the platform-specific open action and disables it for an unavailable project', () => {
    const html = renderToStaticMarkup(
      <ProjectList
        projects={[
          { id: 'available', name: 'Available', path: '/projects/available', addedAt: 'now', available: true },
          { id: 'missing', name: 'Missing', path: '/projects/missing', addedAt: 'now', available: false }
        ]}
        openLabel="在 Finder 中打开"
        removeLabel="移除项目"
        unavailableLabel="项目文件夹不可用"
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        disabled={false}
      />
    )

    expect(html.match(/在 Finder 中打开/g)).toHaveLength(2)
    expect(html).toContain('disabled=""')
    expect(html).toContain('移除项目: Available')
  })
})
