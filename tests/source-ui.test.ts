// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the two views of the DERIVED layer: ModuleSource.tsx and SourcePage.tsx.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` — there is no DOM, and adding one
 * would be a new dependency this project has ruled out. So, like tests/records-queries-pages.test.ts,
 * there are two kinds of test here:
 *
 *   - the pure functions (`freshnessOf`, `filesChangedAfterScan`, `searchFiles`, `groupByDir`,
 *     `claimedBy`, `reindexLine`) are called directly. They carry the claims these views make in
 *     words and numbers, and a wrong one is a lie on screen that no screenshot review would
 *     reliably catch — "unclaimed", "stale" and "behind the disk" are all accusations.
 *   - the presentational components are rendered to static markup with react-dom/server, which is
 *     enough to check what must be IN the markup: the fact that no control in it writes, that an
 *     unclaimed list is drawn as a normal panel and a stale list as an alarm, and that a module
 *     claiming nothing is listed rather than left out.
 *
 * What these do NOT cover: how it looks at 1440 and 390 in light and dark. That was checked with
 * screenshots against the real endpoints.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { createI18n, sayInEnglish, t, type WordKey } from '../src/shared/i18n.ts'
import type {
  ModuleClaims,
  ReindexReport,
  SourceCoverage,
  SourceFile,
  SourceIndexStamp,
} from '../src/shared/types.ts'

type ModuleSource = typeof import('../src/web/components/ModuleSource.tsx')
type SourcePage = typeof import('../src/web/pages/SourcePage.tsx')
let ms: ModuleSource
let sp: SourcePage

beforeAll(async () => {
  // Both files reach src/web/api.ts, which reads window.localStorage at module scope to restore
  // who you are acting as. This is the smallest stand-in that lets the modules load; nothing here
  // is under test.
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
})

/** Markup with the hoisted <style> blocks removed, so a class name mentioned in the CSS cannot be
 *  mistaken for evidence that something rendered it. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ---------------------------------------------------------------------------- fixtures

function stamp(over: Partial<SourceIndexStamp> = {}): SourceIndexStamp {
  return {
    builtAt: '2026-08-08 09:00:00',
    ageSeconds: 42,
    age: '42s',
    fileCount: 3,
    root: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    scanMs: 180,
    builtBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    skipped: ['node_modules — third-party code, not this repository'],
    howRead: 'Imports and exports are read with a regular expression over the source text.',
    derived: 'Derived by scanning the repository. Rebuilt, never edited.',
    ...over,
  }
}

function file(over: Partial<SourceFile> = {}): SourceFile {
  return {
    path: 'src/web/components/ui.tsx',
    language: 'tsx',
    sizeBytes: 64000,
    lines: 2033,
    imports: ['react', '@shared/types.ts', '../api.ts'],
    exports: ['Panel', 'Row', 'useAsync'],
    modifiedAt: '2026-08-08 08:30:00',
    ...over,
  }
}

const FILES: SourceFile[] = [
  file(),
  file({
    path: 'src/web/pages/HomePage.tsx',
    sizeBytes: 30000,
    lines: 887,
    imports: ['react', '../api.ts'],
    exports: ['HomePage'],
    modifiedAt: '2026-08-07 12:00:00',
  }),
  file({
    path: 'scripts/reset.ts',
    language: 'typescript',
    sizeBytes: 900,
    lines: 40,
    imports: [],
    exports: [],
    modifiedAt: '2026-08-01 10:00:00',
  }),
]

function moduleClaims(over: Partial<ModuleClaims> = {}): ModuleClaims {
  return {
    moduleId: 'mod-web',
    moduleTitle: 'The browser app',
    claims: [
      { pattern: 'src/web', matched: ['src/web/components/ui.tsx', 'src/web/pages/HomePage.tsx'], problem: null },
      { pattern: 'src/web/panels', matched: [], problem: null },
    ],
    files: ['src/web/components/ui.tsx', 'src/web/pages/HomePage.tsx'],
    problem: null,
    ...over,
  }
}

function coverage(over: Partial<SourceCoverage> = {}): SourceCoverage {
  const modules = over.modules ?? [moduleClaims()]
  return {
    totalFiles: 3,
    claimedFiles: 2,
    unclaimedFiles: 1,
    percentClaimed: 66.7,
    unclaimed: ['scripts/reset.ts'],
    staleClaims: [
      { moduleId: 'mod-web', moduleTitle: 'The browser app', pattern: 'src/web/panels', problem: null },
    ],
    repositories: null,
    ...over,
    modules,
  }
}

// ============================================================================ how old is it

describe('freshnessOf', () => {
  it('is fresh for a recent scan that nothing contradicts', () => {
    expect(ms.freshnessOf(stamp(), FILES)).toEqual({ kind: 'fresh' })
  })

  it('is provably behind when a file changed after the scan that indexed it', () => {
    const late = [...FILES, file({ path: 'src/web/api.ts', modifiedAt: '2026-08-08 09:30:00' })]
    expect(ms.freshnessOf(stamp(), late)).toEqual({ kind: 'behind', changedAfterScan: 1 })
  })

  it('is merely aging past the threshold — a suspicion, not a claim about the disk', () => {
    const old = stamp({ ageSeconds: ms.INDEX_STALE_AFTER_SECONDS + 1, age: '16m' })
    expect(ms.freshnessOf(old, FILES)).toEqual({ kind: 'aging' })
  })

  it('reports proof over suspicion when both are true', () => {
    const old = stamp({ ageSeconds: ms.INDEX_STALE_AFTER_SECONDS + 1 })
    const late = [file({ modifiedAt: '2026-08-08 09:30:00' })]
    expect(ms.freshnessOf(old, late).kind).toBe('behind')
  })

  it('names the files whose change time is later than the scan', () => {
    const late = [...FILES, file({ path: 'a.ts', modifiedAt: '2026-08-09 00:00:00' })]
    expect(ms.filesChangedAfterScan(stamp(), late).map((f) => f.path)).toEqual(['a.ts'])
  })
})

describe('IndexAge', () => {
  it('always says how old the index is', () => {
    expect(body(h(ms.IndexAge, { stamp: stamp(), files: FILES }))).toMatch(/42s ago/)
  })

  it('says so when the index is provably behind the disk', () => {
    const late = [file({ modifiedAt: '2026-08-08 09:30:00' })]
    expect(body(h(ms.IndexAge, { stamp: stamp(), files: late }))).toContain('older than the files')
  })

  it('does not claim currency for an old scan, and does not call it behind either', () => {
    const html = body(h(ms.IndexAge, { stamp: stamp({ ageSeconds: 3600, age: '1h' }), files: FILES }))
    expect(html).toContain('may be out of date')
    expect(html).not.toContain('older than the files')
  })

  it('says nothing extra about a fresh one', () => {
    const html = body(h(ms.IndexAge, { stamp: stamp(), files: FILES }))
    expect(html).not.toContain('may be out of date')
    expect(html).not.toContain('older than the files')
  })
})

// ============================================================================ the scan's folder and facts

/**
 * THE SCAN'S FOLDER AND FACTS ARE ROWS OF THEIR OWN. The index age held them in a title sentence, "Scanned {root} at
 * {at} by {by}: {files} in {ms} ms.", and the limits block said "The scan says it skipped nothing under {root}." Both
 * sentences go. The limits block draws the folder and each fact on a labelled row in the code style, and the folder's
 * row ends with a state word when the scan skipped nothing.
 */
describe('the scan’s folder and facts, each on a row of its own', () => {
  const en = (key: string): string => createI18n('en').t(key as WordKey)

  /** Each row's label, with the tag and text of the first element in its value and the state word after it. */
  function theRows(markup: string): { label: string; tag: string; value: string; state: string | null }[] {
    return [...markup.matchAll(/<dt>([^<]*)<\/dt><dd><(\w+)[^>]*>([^<]*)<\/\2>(?:<span[^>]*>([^<]*)<\/span>)?<\/dd>/g)].map((m) => ({
      label: m[1]!, tag: m[2]!, value: m[3]!, state: m[4] ?? null,
    }))
  }

  it('the index age holds the scan’s folder in no title', () => {
    expect(body(h(ms.IndexAge, { stamp: stamp(), files: FILES }))).not.toContain(stamp().root)
  })

  it('the limits block draws the folder and the facts as rows, and says on the folder’s row that nothing was skipped', () => {
    const scan = stamp({ skipped: [] })
    const html = body(h(ms.ScanLimits, { stamp: scan }))
    expect(theRows(html)).toEqual([
      { label: en('moduleSource.row.scannedFolder'), tag: 'code', value: scan.root, state: en('moduleSource.row.skippedNothing') },
      { label: en('moduleSource.row.scannedAt'), tag: 'code', value: scan.builtAt, state: null },
      { label: en('moduleSource.row.scannedBy'), tag: 'code', value: scan.builtBy, state: null },
      { label: en('moduleSource.row.files'), tag: 'code', value: String(scan.fileCount), state: null },
      { label: en('moduleSource.row.scanTook'), tag: 'code', value: `${String(scan.scanMs)} ms`, state: null },
    ])
    expect(html.replace(/<dl[\s\S]*?<\/dl>/g, ''), 'a sentence holds the scan’s folder').not.toContain(scan.root)
  })

  it('the folder’s row has no state word when the scan skipped something, which the list below says', () => {
    const rows = theRows(body(h(ms.ScanLimits, { stamp: stamp() })))
    expect(rows[0]).toEqual({ label: en('moduleSource.row.scannedFolder'), tag: 'code', value: stamp().root, state: null })
  })
})

// ============================================================================ formatting

describe('formatting', () => {
  it('matches the units a terminal would print beside it', () => {
    expect(ms.formatBytes(999)).toBe('999 B')
    expect(ms.formatBytes(64000)).toBe('64.0 kB')
    expect(ms.formatBytes(2_400_000)).toBe('2.4 MB')
  })

  it('calls the repository root "." rather than an empty heading', () => {
    expect(ms.dirOf('package.json')).toBe('.')
    expect(ms.dirOf('src/web/api.ts')).toBe('src/web')
  })
})

// ============================================================================ search and grouping

describe('searchFiles', () => {
  it('returns everything for an empty query, with no notes', () => {
    const all = sp.searchFiles(FILES, '   ')
    expect(all).toHaveLength(3)
    expect(all.every((m) => m.note === null)).toBe(true)
  })

  it('matches the path and says nothing extra, because the row already shows the path', () => {
    const found = sp.searchFiles(FILES, 'pages')
    expect(found.map((m) => m.file.path)).toEqual(['src/web/pages/HomePage.tsx'])
    expect(found[0]?.note).toBeNull()
  })

  it('matches an import specifier and says so, because the reason is nowhere on the row', () => {
    const found = sp.searchFiles(FILES, '@shared')
    expect(found.map((m) => m.file.path)).toEqual(['src/web/components/ui.tsx'])
    expect(found[0]?.note).toBe('imports @shared/types.ts')
  })

  it('matches an exported name', () => {
    expect(sp.searchFiles(FILES, 'useasync')[0]?.note).toBe('exports useAsync')
  })

  it('matches the language', () => {
    expect(sp.searchFiles(FILES, 'tsx')).toHaveLength(2)
  })
})

describe('groupByDir', () => {
  it('groups by directory in path order and totals the sizes', () => {
    const groups = sp.groupByDir(FILES)
    expect(groups.map((g) => g.dir)).toEqual(['scripts', 'src/web/components', 'src/web/pages'])
    expect(groups[0]?.bytes).toBe(900)
  })
})

describe('claimedBy', () => {
  it('reads the modules list as the only authority on who claims a file', () => {
    const map = sp.claimedBy(coverage())
    expect(map.get('src/web/components/ui.tsx')?.map((m) => m.title)).toEqual(['The browser app'])
    expect(map.has('scripts/reset.ts')).toBe(false)
  })
})

describe('reindexLine', () => {
  const report = (over: Partial<ReindexReport> = {}): ReindexReport => ({
    firstScan: false,
    previousBuiltAt: '2026-08-08 09:00:00',
    added: [],
    removed: [],
    changed: [],
    unchanged: 95,
    ...over,
  })

  it('says the index was current when a rebuild found nothing moved', () => {
    expect(sp.reindexLine(report())).toMatch(/was current/)
  })

  it('says the index was behind the disk when the rebuild found changes', () => {
    expect(sp.reindexLine(report({ changed: [{ path: 'a.ts', what: '1 -> 2 lines' }] }))).toMatch(
      /behind the disk/,
    )
  })

  it('does not claim a comparison on a first scan', () => {
    const line = sp.reindexLine(report({ firstScan: true, previousBuiltAt: null, added: ['a.ts'] }))
    expect(line).toMatch(/First scan/)
    expect(line).not.toMatch(/behind the disk/)
  })
})

// ============================================================================ the module block

/** A whole answer to GET /api/source?module=…, as the route builds it. */
function moduleAnswer(over: Record<string, unknown> = {}) {
  const claims = moduleClaims()
  return {
    index: stamp(),
    module: { id: claims.moduleId, title: claims.moduleTitle },
    claims: claims.claims,
    files: FILES.slice(0, 2),
    staleClaims: claims.claims.filter((c) => c.matched.length === 0),
    problem: null,
    ...over,
  } as Parameters<ModuleSource['ModuleSourceBody']>[0]['answer']
}

describe('the module block', () => {
  // IN CHINESE, every sentence and count the block itself writes (wave 13k round 43, problem oQdFG3cyRWI_). Paths, file
  // types and the program names inside the sentences are stored or proper names, and stay as they are.
  it('draws the block in Chinese, with no English sentence or count of its own', async () => {
    const { setWordLanguage, createI18n } = await import('../src/shared/i18n.ts')
    const zh = createI18n('zh').t
    setWordLanguage('zh')
    try {
      const text = body(h(ms.ModuleSourceBody, { answer: moduleAnswer() })).replace(/<[^>]+>/g, ' ')
      for (const said of [
        zh('moduleSource.fileCount', { n: 2 }),
        zh('moduleSource.lines', { n: 2033 }),
      ]) expect(text).toContain(said)
      expect(text).toContain('2 条认领下共有 2 个文件。')
      expect(text).not.toMatch(/\b(files?|lines?|claims?|built|imports?|exports?|nobody|stale|scan)\b/i)
    } finally {
      setWordLanguage('en')
    }
  })

  it("draws the server's own sentence in Developer mode", async () => {
    const { setMode } = await import('../src/web/lib/mode.ts')
    setMode('inspect')
    try {
      const html = body(h(ms.ModuleSourceBody, { answer: moduleAnswer() }))
      expect(html).toContain('Derived by scanning the repository')
      expect(html).toContain('Rebuilt, never edited')
      expect(html).toMatch(/regular expression over the source text/)
    } finally {
      setMode('normal')
    }
  })

  it('groups the files under the claim that reached them, with no control that writes', () => {
    const html = body(h(ms.ModuleSourceBody, { answer: moduleAnswer() }))
    expect(html).toContain('src/web/components/ui.tsx')
    expect(html).toContain('2033')
    // Read-only means read-only: no button, no input, and no link out of the derived list.
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<a ')
  })

  it('draws a claim that resolves to nothing as stale', () => {
    const html = body(h(ms.ModuleSourceBody, { answer: moduleAnswer() }))
    expect(html).toContain('stale claim')
  })

  it('tells a claim that can never match apart from one that merely went stale', () => {
    const html = body(
      h(ms.ClaimUnmatched, {
        problem: 'is an absolute path. Claims are written relative to the repository root.',
      }),
    )
    expect(html).toMatch(/This claim is an absolute path/)
    expect(html).toMatch(/relative to the repository root/)
    // The rename sentence belongs to the other case only; offering it here would send somebody
    // looking for a file that never moved.
    expect(html).not.toMatch(/rename/)
  })

  it('reports claims it could not count as unresolvable, not as stale', () => {
    const html = body(
      h(ms.ModuleSourceBody, {
        answer: moduleAnswer({
          problem: 'This project has 2 repositories (a, b), and the source index names none of them.',
          claims: [],
          files: [],
          staleClaims: [],
        }),
      }),
    )
    expect(html).toContain(t('moduleSource.claimsNotCounted'))
    // No stale-claim tag, and no "no files claimed" either: what it claims is unknown, which is
    // not the same as it claiming nothing.
    expect(html).not.toContain('>stale claim<')
    expect(html).not.toContain(t('moduleSource.noClaims'))
  })

  it('draws "no files claimed" for a module with no claims, rather than an empty box', () => {
    const html = body(
      h(ms.ModuleSourceBody, { answer: moduleAnswer({ claims: [], files: [], staleClaims: [] }) }),
    )
    expect(html).toContain(t('moduleSource.noClaims'))
  })
})

// ============================================================================ the source page

describe('the panels on the source page', () => {
  it('draws unclaimed code as a finding, not as an alarm', () => {
    const html = body(h(sp.UnclaimedPanel, { coverage: coverage(), stamp: stamp(), files: FILES }))
    // rank 1 is the normal panel; rank 0 is the tinted, spined alarm.
    expect(html).toMatch(/data-rank="1"/)
    expect(html).toContain('scripts/reset.ts')
  })

  it('draws a stale claim as an alarm, and sends the reader to the module that has to change', () => {
    const html = body(h(sp.StaleClaimsPanel, { coverage: coverage(), stamp: stamp(), files: FILES }))
    expect(html).toMatch(/data-rank="0"/)
    expect(html).toContain('src/web/panels')
    expect(html).toContain('#/r/mod-web')
  })

  it('keeps the stale panel out of alarm when there is nothing stale', () => {
    const html = body(
      h(sp.StaleClaimsPanel, { coverage: coverage({ staleClaims: [] }), stamp: stamp(), files: FILES }),
    )
    expect(html).toMatch(/data-rank="1"/)
    expect(html).toContain(`<span class="px-empty-text">${sayInEnglish('absence.none')}</span>`)
  })

  it('lists a module that claims nothing, because that is the finding', () => {
    const html = body(
      h(sp.ModuleClaimsPanel, {
        coverage: coverage({
          modules: [
            moduleClaims(),
            moduleClaims({ moduleId: 'mod-quiet', moduleTitle: 'Nobody has claimed this', claims: [], files: [] }),
          ],
        }),
        stamp: stamp(),
        files: FILES,
      }),
    )
    expect(html).toContain('Nobody has claimed this')
    expect(html).toMatch(/claims nothing/)
  })

  it('names the module that claims each file, and marks the ones nobody claims', () => {
    const html = body(h(sp.IndexPanel, { coverage: coverage(), stamp: stamp(), files: FILES }))
    expect(html).toContain('no module claims this file')
    expect(html).toContain('The browser app')
  })

  it('draws the state word "none" for an empty index', () => {
    const html = body(
      h(sp.IndexPanel, {
        coverage: coverage({ totalFiles: 0, claimedFiles: 0, unclaimedFiles: 0, percentClaimed: null, unclaimed: [] }),
        stamp: stamp({ fileCount: 0 }),
        files: [],
      }),
    )
    expect(html).toContain(`<span class="px-empty-text">${sayInEnglish('absence.none')}</span>`)
  })

  it('says when the two answers on the page came from different scans', () => {
    const html = body(
      h(sp.SourceBody, {
        stamp: stamp(),
        files: FILES,
        coverage: coverage(),
        coverageStamp: stamp({ builtAt: '2026-08-08 09:05:00' }),
        rebuild: { run: () => undefined, busy: false, error: null, report: null },
        onReload: () => undefined,
      }),
    )
    expect(html).toMatch(/A rebuild landed between the two requests/)
  })

  it('lists what a rebuild changed, capped, and counts the rest', () => {
    const html = body(
      h(sp.RebuildReport, {
        report: {
          firstScan: false,
          previousBuiltAt: '2026-08-08 09:00:00',
          added: Array.from({ length: 11 }, (_, i) => `src/new-${i}.ts`),
          removed: ['src/web/panels/Old.tsx'],
          changed: [{ path: 'src/web/api.ts', what: '2 imports added' }],
          unchanged: 84,
        },
      }),
    )
    expect(html).toMatch(/behind the disk/)
    expect(html).toContain('src/web/panels/Old.tsx')
    expect(html).toContain('2 imports added')
    expect(html).toMatch(/and 3 more/)
  })

  it('puts what the scan could not see on the page rather than in a comment', () => {
    const html = body(
      h(sp.SourceBody, {
        stamp: stamp(),
        files: FILES,
        coverage: coverage(),
        coverageStamp: stamp(),
        rebuild: { run: () => undefined, busy: false, error: null, report: null },
        onReload: () => undefined,
      }),
    )
    expect(html).toMatch(/What this index does not see/)
    expect(html).toContain('node_modules — third-party code, not this repository')
  })
})
