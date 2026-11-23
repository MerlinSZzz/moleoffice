// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SOURCE PAGES NAME THE REPOSITORY EACH COUNT IS FROM, in the reader's language. Problem
 * ZXD3MbidIya1, wave 13s round 23: coverage and the source door count each stated row against the
 * stored scan of the repository the row names, so a count with no repository beside it says less than
 * the answer holds. Rendered to static markup, as tests/source-ui.test.ts renders these views.
 *
 *   1. The module page's source panel says how many files were counted in each repository, names a
 *      repository with no stored scan as not counted with how to scan it, and keeps a path claimed in
 *      two repositories as two files. Mutation (a): the per-repository lines left out. Mutation (b):
 *      files looked up by path alone, so one repository's file is drawn under the other's claim. Mutation (f):
 *      the not-counted line names a button other than Settings' "Scan now", the one that scans it.
 *   2. The Source page, in Chinese, gives each repository's claimed count under the sums and names the
 *      one with no scan; its unclaimed list is listed per repository and does not call another
 *      repository's path missing. Mutation (c): the unclaimed list drawn off the workspace file list
 *      as before. Mutation (d): the per-repository lines under the sums left out.
 *   3. A stale claim and a module's claims and counts name their repository. Mutation (e): the
 *      repository left off a stale claim.
 *   4. Wave 13s round 24 (a look at round 23's pictures): the not-counted line names the
 *      category Settings draws the Repositories panel under, and says that panel is drawn only in
 *      Developer mode and where that mode is chosen, read against Settings' own whereThePanelIs, in
 *      English and Chinese. Mutation (g): the line leaves out the Developer-mode sentence. Mutation (h):
 *      the line names another category than the one Settings puts the panel in.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import type { CoverageInOneRepository, SourceCoverage, SourceFile, SourceIndexStamp } from '../src/shared/types.ts'

type ModuleSource = typeof import('../src/web/components/ModuleSource.tsx')
type SourcePage = typeof import('../src/web/pages/SourcePage.tsx')
type SettingsPage = typeof import('../src/web/pages/SettingsPage.tsx')
let ms: ModuleSource
let sp: SourcePage
let settings: SettingsPage

beforeAll(async () => {
  // Both files reach src/web/api.ts, which reads window.localStorage at module scope; this is the
  // stand-in tests/source-ui.test.ts uses for the same reason.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  ms = await import('../src/web/components/ModuleSource.tsx')
  sp = await import('../src/web/pages/SourcePage.tsx')
  settings = await import('../src/web/pages/SettingsPage.tsx')
})

afterEach(() => setWordLanguage('en'))

function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const FIRMWARE = { id: 'repo-firmware', name: 'firmware' }
const SERVER = { id: 'repo-server', name: 'server' }

function stamp(over: Partial<SourceIndexStamp> = {}): SourceIndexStamp {
  return {
    builtAt: '2026-10-06 09:00:00',
    ageSeconds: 42,
    age: '42s',
    fileCount: 2,
    root: '/scratch/firmware',
    scanMs: 12,
    builtBy: 'agent:test',
    skipped: [],
    howRead: 'Imports and exports are read with a regular expression over the source text.',
    derived: 'Derived by scanning the repository. Rebuilt, never edited.',
    ...over,
  }
}

function file(path: string, lines: number): SourceFile {
  return { path, language: 'typescript', sizeBytes: 100, lines, imports: [], exports: [], modifiedAt: '2026-10-06 08:00:00' }
}

describe('the source pages name the repository each count is from', () => {
  it('the module panel counts each repository, names the one not counted, and keeps a shared path apart (a, b)', () => {
    const claims = [
      { pattern: 'src/shared.ts', matched: ['src/shared.ts'], problem: null, repository: FIRMWARE },
      { pattern: 'src/shared.ts', matched: ['src/shared.ts'], problem: null, repository: SERVER },
    ]
    const answer = {
      index: stamp(),
      module: { id: 'mod-1', title: 'Shared code' },
      claims,
      files: [
        { ...file('src/shared.ts', 1111), repository: FIRMWARE },
        { ...file('src/shared.ts', 2222), repository: SERVER },
      ],
      staleClaims: [],
      problem: null,
      repositories: [
        { repository: FIRMWARE, scan: stamp(), claims: [claims[0]!], files: ['src/shared.ts'], notCounted: null },
        { repository: SERVER, scan: stamp(), claims: [claims[1]!], files: ['src/shared.ts'], notCounted: null },
        { repository: { id: 'repo-board', name: 'board' }, scan: null, claims: [], files: [], notCounted: 'No scan of the repository "board" is stored.' },
      ],
    } as Parameters<ModuleSource['ModuleSourceBody']>[0]['answer']

    const html = body(h(ms.ModuleSourceBody, { answer }))
    expect(html).toContain('1 file in “firmware”')
    expect(html).toContain('1 file in “server”')
    expect(html).toContain(
      'Not counted in “board”: no scan of this repository is stored. To scan it, press “Scan now” beside it in ' +
        'Settings, under “Developer: computers and access”, in Repositories. That panel is shown only in Developer ' +
        'mode, which you choose in Settings, under “Normal or Developer”. The button is there when this machine has ' +
        'a checkout of it.',
    )
    // Each claim says its repository, and each draws its own repository's file.
    expect(html).toContain('in “firmware”')
    expect(html).toContain('in “server”')
    expect(html).toContain('1111')
    expect(html).toContain('2222')
  })

  it('the Source page, in Chinese, counts each repository under the sums and lists the unclaimed files by repository (c, d)', () => {
    setWordLanguage('zh')
    const repositories: CoverageInOneRepository[] = [
      {
        repository: FIRMWARE,
        scan: stamp(),
        totalFiles: 2,
        claimedFiles: 1,
        unclaimedFiles: 1,
        percentClaimed: 50,
        unclaimed: ['lib/firmware-only.ts'],
        notCounted: null,
      },
      { repository: SERVER, scan: null, notCounted: 'No scan of the repository "server" is stored.' },
    ]
    const coverage: SourceCoverage = {
      totalFiles: 2,
      claimedFiles: 1,
      unclaimedFiles: 1,
      percentClaimed: 50,
      // Not in the workspace file list below: it is firmware's, and the page is not to call it missing.
      unclaimed: ['lib/firmware-only.ts'],
      staleClaims: [],
      modules: [],
      repositories,
    }
    const html = body(
      h(sp.SourceBody, {
        stamp: stamp(),
        files: [file('src/other.ts', 3)],
        coverage,
        coverageStamp: stamp(),
        rebuild: { run: () => undefined, busy: false, error: null, report: null },
        onReload: () => undefined,
      }),
    )
    const claimedLine = t('sourceRepo.claimedIn', { n: 2, claimed: 1, name: 'firmware' })
    const notCounted = ms.notCountedIn('server')
    const unclaimedLine = t('sourceRepo.unclaimedIn', { n: 1, name: 'firmware' })
    // The words are the Chinese list's, not an English fallback.
    expect(claimedLine).toContain('已认领')
    expect(notCounted).toContain('没有计数')
    expect(notCounted).toContain(`“${t('settingsPanel.repos.scanNow')}”`)
    expect(notCounted).toContain('只在开发者模式下显示')
    expect(notCounted).toContain('“开发者：电脑和访问”')
    expect(html).toContain(t('sourceRepo.heading'))
    expect(html).toContain(claimedLine)
    expect(html).toContain(notCounted)
    expect(html).toContain(unclaimedLine)
    expect(html).toContain('lib/firmware-only.ts')
    expect(html).not.toContain('are not in the file')
  })

  it('a stale claim and a module’s claims and counts name their repository (e)', () => {
    const counted = { pattern: 'lib', matched: ['lib/a.ts'], problem: null, repository: FIRMWARE }
    const stale = { pattern: 'src/gone.ts', matched: [], problem: null, repository: SERVER }
    const coverage: SourceCoverage = {
      totalFiles: 3,
      claimedFiles: 1,
      unclaimedFiles: 2,
      percentClaimed: 33.3,
      unclaimed: [],
      staleClaims: [{ moduleId: 'mod-1', moduleTitle: 'Two places', pattern: 'src/gone.ts', problem: null, repository: SERVER }],
      modules: [
        {
          moduleId: 'mod-1',
          moduleTitle: 'Two places',
          claims: [counted, stale],
          files: ['lib/a.ts'],
          problem: null,
          repositories: [
            { repository: FIRMWARE, scan: stamp(), claims: [counted], files: ['lib/a.ts'], notCounted: null },
            { repository: SERVER, scan: stamp(), claims: [stale], files: [], notCounted: null },
            { repository: { id: 'repo-board', name: 'board' }, scan: null, claims: [], files: [], notCounted: 'not counted' },
          ],
        },
      ],
      repositories: [],
    }
    const props = { coverage, stamp: stamp(), files: [] as SourceFile[] }
    const staleHtml = body(h(sp.StaleClaimsPanel, props))
    expect(staleHtml).toContain('in “server” · claimed by “Two places”')

    const modulesHtml = body(h(sp.ModuleClaimsPanel, props))
    expect(modulesHtml).toContain('lib (in “firmware”), src/gone.ts (in “server”)')
    expect(modulesHtml).toContain('1 file in “firmware”')
    expect(modulesHtml).toContain('0 files in “server”')
    expect(modulesHtml).toContain('Not counted in “board”')
  })

  it('the not-counted line sends the person where Settings draws the Repositories panel, in both languages (g, h)', () => {
    const where = settings.whereThePanelIs('settings.repositories')
    for (const lang of ['en', 'zh'] as const) {
      setWordLanguage(lang)
      const said = ms.notCountedIn('board')
      expect(said).toContain(`“${t(where.category)}”`)
      expect(said).toContain(t('settingsPanel.title.repositories'))
      // Settings draws the panel only in developer mode, so the line has to say that mode, and where it is chosen.
      expect(where.developerOnly).toBe(true)
      expect(said).toContain(t('settingsPanel.mode.developer'))
      expect(said).toContain(`“${t('settingsPanel.title.mode')}”`)
    }
  })
})
