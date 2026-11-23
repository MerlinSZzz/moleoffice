// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SESSIONS PAGE SAYS ABOUT A READING — approved decision 9.
 *
 * "Machine truth may refresh automatically. The reader's position must never be silently
 * disrupted. Anything that reads as current must say when it was read."
 *
 * THE SESSIONS PAGE says when its reading was taken. A page that reads as current with no time
 * beside it is the arrangement the decision forbids. A re-read that FAILED must keep the last good
 * reading and say that the newer one did not arrive.
 *
 * The page re-reads only when a person asks it to. The home page's panel re-read itself every 30
 * seconds and said so; it was removed in wave 13y round 32, and with it the interval and its words.
 *
 * A second section covers the honesty fix decision 4 cites: `GET /api/sessions` served an
 * observation of this machine under the authored-sounding name `storedState`.
 *
 * THE RANKED ATTENTION LIST LEFT HOME IN ROUND 19, by item 6 of a decision. Its comparison
 * tests left with it because no screen or hook uses that comparison now.
 *
 * Mutation: draw `ReadAt` without its stamp; the first case goes red because the page no longer
 * says when it was read.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`: no DOM, and adding one would be a new dependency this project
 * has ruled out. So, exactly as tests/sessions-ui.test.ts does it, the component is rendered to
 * static markup. `src/web/api.ts` reads `window.localStorage` at module scope, so the smallest
 * stand-in for a window is installed before anything that reaches it is loaded.
 *
 * What IS tested is what the screen can claim: the stamp, and the last good reading after a failed
 * re-read.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { t } from '../src/shared/i18n.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
// Type-only, and erased before this file runs: naming a type does not import the module, so
// nothing here loads browser code before the window stand-in is in place.
import type { MachineRead, SessionLine } from '../src/web/components/SessionPanel.tsx'

type SP = typeof import('../src/web/components/SessionPanel.tsx')
type PG = typeof import('../src/web/pages/SessionsPage.tsx')

let sp: SP
let pg: PG

/** The moment every fixture in this file is dated against. Local, like every stamp in Mole Office. */
const NOW = new Date(2026, 7, 9, 12, 0, 0).getTime()

/** The same moment written the way the product writes a moment. Not re-derived by hand: the
 *  assertion below is that the SCREEN says this, and the screen and this test must agree by
 *  construction rather than by two people typing the same string. */
let NOW_STAMP: string

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  sp = await import('../src/web/components/SessionPanel.tsx')
  pg = await import('../src/web/pages/SessionsPage.tsx')
  NOW_STAMP = sp.readingStamp(NOW)
})

/** The markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence
 *  that anything used it. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ============================================================================================
// 1 · THE SESSIONS PAGE SAYS WHEN IT WAS READ
// ============================================================================================

/** Two sessions, read through the real payload reader, so these are the rows the page draws. */
function lines(): SessionLine[] {
  const read = sp.readSessionsPayload({
    sessions: [
      {
        id: 'claude-code:alive',
        recordId: null,
        name: 'handover replay sweep',
        state: 'running',
        stateReason: 'process 4242 names this session and its log grew 12s ago.',
        lastActivityAt: '2026-08-09 11:59:00',
        placement: {
          kind: 'unassigned',
          reason: { why: 'no-links' },
          sentence: 'Nothing links this run to a pipeline or a module.',
          howToPlace: 'POST /api/sessions/<id>/link',
        },
      },
      {
        id: 'claude-code:gone',
        recordId: null,
        name: 'force-table collation',
        state: 'crashed',
        stateReason: 'the log ends on "exit 137" and no process names this session.',
        lastActivityAt: '2026-08-09 08:00:00',
        placement: {
          kind: 'unassigned',
          reason: { why: 'no-links' },
          sentence: 'Nothing links this run to a pipeline or a module.',
          howToPlace: 'POST /api/sessions/<id>/link',
        },
      },
    ],
  })
  expect(read.problems).toEqual([])
  return sp.joinSessionRecords(read.sessions, null)
}

function readAt(over: Partial<MachineRead> = {}): MachineRead {
  return {
    at: NOW,
    inFlight: false,
    inFlightFromAPress: false,
    theLastReadWasFromAPress: false,
    failed: null,
    onReadAgain: () => {
      throw new Error('the test never re-reads')
    },
    ...over,
  }
}

function page(read: MachineRead) {
  return body(
    h(pg.SessionsView, {
      lines: lines(),
      orphans: [],
      unclaimed: null,
      problems: [],
      now: NOW,
      read,
      onRelease: async () => {
        throw new Error('the test never releases anything')
      },
      onReread: () => {
        throw new Error('the test never re-reads')
      },
    }),
  )
}

describe('the sessions page says when it was read', () => {
  it('carries the moment of the reading, as a whole stamp and not a time of day', () => {
    const html = page(readAt())

    // Plan 7FEOshq3mBGG keeps the whole stamp inside one translated sentence.
    // The whole stamp. "Read at 12:00:00" on a page left open overnight reads as four minutes ago
    // and means eighteen hours, which is the failure a bare clock time produces and nothing warns
    // about.
    expect(html).toContain(`Last checked at ${NOW_STAMP}.`)
    expect(NOW_STAMP).toBe('2026-08-09 12:00:00')
    // THE STAMP IS THE POINT AND THE ESSAY IS NOT. This also asserted "This is an observation of
    // the machine, so it was already out of date when it was drawn" — the first sentence a person
    // read on the page, standing in front of the answer. A reading with a time on it already says
    // it is a reading; decision 9 requires the time, not the sentence. Finding 23, 19 August 2026.
    expect(html).not.toContain('already out of date')
    // Never without a way to take a newer reading.
    expect(html).toContain('Check again')
    // The page does not re-read by itself, and must not say it does.
    expect(html).not.toContain('Checked again every')
  })

  it('keeps a good reading on screen when a re-read fails, and says what failed', () => {
    const failedAt = NOW + 30_000
    const html = page(readAt({ failed: { at: failedAt, message: 'Cannot reach the Mole Office server.' } }))

    // The rows are still there. Throwing away a true reading of a machine in order to report that a
    // later one did not arrive would lose the only evidence on the screen.
    expect(html).toContain('handover replay sweep')
    expect(html).toContain('force-table collation')
    // And the failure is not silent, and the stamp keeps the time of the reading on screen.
    expect(html).toContain(t('g6a.sessions.readFailed', { failedAt: sp.readingStamp(failedAt), message: 'Cannot reach the Mole Office server.' }))
    expect(html).toContain(`Last checked at ${NOW_STAMP}.`)
  })
})

// ============================================================================================
// 4 · THE FIELD THAT WAS NAMED FOR SOMETHING A PERSON WROTE AND HELD SOMETHING PANELX OBSERVED
// ============================================================================================

/**
 * `design/invariants/provenance.md` §5, pinned.
 *
 * `GET /api/sessions` carried `storedState` on every row and never read a record to fill it: the
 * value is `storableState(observed.state)`, this request's observation put through the record's
 * vocabulary. On a run found on disk and never filed, every other record-derived field on the row
 * is correctly null and that one answers — with something nothing stored.
 *
 * The value is unchanged and the name now says what it is. The test is the measurement from the
 * finding, run again: the record-derived fields are null, and the observation is not.
 */
describe('GET /api/sessions names the observed state for what it is', () => {
  let db: TestDb
  let home: string
  let lib: typeof import('../src/server/lib/sessions.ts')

  beforeAll(async () => {
    db = await freshDb()
    lib = await import('../src/server/lib/sessions.ts')
  }, 60_000)

  afterAll(() => {
    db.close()
  })

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'mole-office-freshness-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  /** One Claude Code transcript on disk, and nothing filed about it anywhere. */
  function unfiledRun(): AdapterEnv {
    const dir = join(home, '.claude', 'projects', `${THE_TEST_FIXTURE_ROOT.replace(/\//g, '-')}-test-claude`)
    mkdirSync(dir, { recursive: true })
    const at = new Date(NOW - 20 * 60 * 60 * 1000).toISOString()
    writeFileSync(
      join(dir, 'bbbbbbbb-0000-0000-0000-000000000001.jsonl'),
      [
        {
          parentUuid: null,
          isSidechain: false,
          type: 'user',
          message: { role: 'user', content: 'collate the force tables' },
          timestamp: at,
          userType: 'external',
          entrypoint: 'cli',
          cwd: `${THE_TEST_FIXTURE_ROOT}/test_claude`,
          version: '2.1.223',
        },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n') + '\n',
    )
    return {
      homeDir: home,
      now: new Date(NOW),
      scanProcesses: () => ({ ok: true, processes: [] }),
      runningWithinSeconds: 5 * 60,
      orphanAfterSeconds: 6 * 60 * 60,
    }
  }

  it('carries `storableObservedState` and no field called `storedState`', () => {
    const views = lib.listSessions('default', unfiledRun())
    expect(views).toHaveLength(1)
    const view = views[0]
    if (view === undefined) throw new Error('the fixture produced no session')

    const keys = Object.keys(view)
    expect(keys).toContain('storableObservedState')
    // The whole point of the rename: nothing on this row may be named as though a person wrote it
    // when the server observed it.
    expect(keys).not.toContain('storedState')
  })

  it('means exactly what it meant before: the observation, in the record’s vocabulary', () => {
    const view = lib.listSessions('default', unfiledRun())[0]
    if (view === undefined) throw new Error('the fixture produced no session')

    expect(view.state).toBe('orphaned')
    expect(view.storableObservedState).toBe('orphaned')
  })

  it('answers on a run nothing has ever filed, where every record-derived field is null', () => {
    const view = lib.listSessions('default', unfiledRun())[0]
    if (view === undefined) throw new Error('the fixture produced no session')

    // The measurement from provenance.md §5, unchanged. These three are null because there is no
    // record; the fourth is not, because it never came from one.
    expect(view.recordId).toBeNull()
    expect(view.title).toBeNull()
    expect(view.recordedPurpose).toBeNull()
    expect(view.storableObservedState).not.toBeNull()
  })
})
