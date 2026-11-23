// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the sessions view: SessionPanel.tsx, which holds its pieces, and SessionsPage.tsx, which
 * draws them. The page is the only surface that draws them.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` — there is no DOM, and adding one
 * would be a new dependency this project has ruled out. So, exactly as tests/module-page.test.ts
 * does it, there are three kinds of test here:
 *
 *   - the pure functions are called directly. `readSessionsPayload` and `readOrphansPayload` are
 *     the whole substance of this view: everything drawn is what they decided they could read,
 *     and everything they could NOT read is a line the page prints. `readReleaseAction` (through
 *     the payload reader) is the one that decides whether a kill button exists at all.
 *   - the components are rendered to static markup, which is enough to check what must BE in the
 *     markup: all six state words in the tally when there are no sessions at all, the resume
 *     command character for character, the confirm phrase verbatim, every line of `alsoAffects` —
 *     and the important negatives: no release button on a resource that cannot say what it would
 *     kill, and no confirm phrase on screen before the reader asks for it.
 *   - the transport is driven against a stubbed `fetch`, because "the phrase you were shown goes
 *     back under `expect`" is a claim about the request body, and a claim about a request body is
 *     only worth anything if something reads the body.
 *
 * What these do NOT cover: how it looks. Whether all six states are visible without scrolling at
 * 390px is a screenshot question and was checked that way, at 1440 and 390 in light and dark,
 * rather than papered over with a test that only pretends to look.
 *
 * THE RULE EVERY TEST BELOW IS REALLY CHECKING: nothing is dropped quietly, and nothing
 * destructive is offered unless the server can say exactly what will die.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SECOND HALF OF THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 * The sessions page was rebuilt around three claims, and each has its own block of tests, because
 * each is a claim a reader could disagree with rather than a detail of the drawing:
 *
 *   1. A SESSION WITH NO STATE IS NOT A SESSION IN STATE `unknown`. GET /api/sessions reports both
 *      as `unknown`, so the page reads the RECORDS too and classifies `data.state` with the shared
 *      contract. Collapsing the two would turn "nobody has said" into a judgement nobody made.
 *   2. ONLY WHAT SOMEBODY WROTE DOWN AS FINISHED MAY BE FOLDED. A run that has gone quiet is not a
 *      run somebody said was done, and `finished-unwritten` exists so that the difference is drawn
 *      rather than assumed.
 *   3. AN EXPLANATION SEVERAL ROWS SHARE IS SAID ONCE, WITH ITS COUNT — including when the rows
 *      differ only in a number inside the sentence, which is what the server's per-row reason
 *      actually looks like on a machine with live logs.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
// Type-only, and erased before this file runs, exactly like the module handles below: naming a
// type does not import the module, so nothing here loads browser code at the top of the file.
import type { PanelRecord } from '@shared/types.ts'
// A value, not a type: the six session words, from the one place that declares them.
import { SESSION_STATES } from '@shared/types.ts'
// A value: the page words by key, so a check reads what the page draws and keeps no copy of it.
import { setWordLanguage, t } from '@shared/i18n.ts'
// A value: the tool word the server stores for a run no reader answers to, from the one place that says it.
import { NO_ADAPTED_TOOL } from '@shared/words.ts'
import type { Fault } from '../src/web/api.ts'
import type {
  MachineRead,
  Placement,
  ProjectRef,
  SessionLine,
  SessionView,
} from '../src/web/components/SessionPanel.tsx'

// SessionPanel reaches api.ts (for the actor headers on its own requests), which reads
// window.localStorage the moment it is imported. This is the smallest stand-in that lets the
// module load; nothing in it is under test.
type SP = typeof import('../src/web/components/SessionPanel.tsx')
type PG = typeof import('../src/web/pages/SessionsPage.tsx')
type API = typeof import('../src/web/api.ts')
type UI = typeof import('../src/web/components/ui.tsx')
let sp: SP
let pg: PG
let webApi: API
let ui: UI

beforeAll(async () => {
  // Plan 7FEOshq3mBGG keeps machine evidence in the inspect projection.
  const store = new Map<string, string>([['mole-office.mode', 'inspect']])
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  sp = await import('../src/web/components/SessionPanel.tsx')
  pg = await import('../src/web/pages/SessionsPage.tsx')
  webApi = await import('../src/web/api.ts')
  // The chip vocabulary the six session states borrow from, so the borrows can be checked against
  // what each one MEANS there rather than against a list of words copied into this file.
  ui = await import('../src/web/components/ui.tsx')
})

/** The markup with the hoisted <style> blocks removed, so a class name mentioned in the CSS
 *  cannot be mistaken for evidence that something used it. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** WHAT A READER SEES: the markup with the screen reader's copies and every tag taken out, so words that are only
 *  on a hover or read out are not mistaken for words on the screen. */
function seen(html: string): string {
  return html.replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')
}

/** A fixed clock, so every age in these tests is exact rather than nearly right. */
const NOW = new Date(2026, 7, 8, 12, 0, 0).getTime()

const neverReleases: SP['releaseOrphan'] = async () => {
  throw new Error('the test never releases anything')
}
const neverRereads = () => {
  throw new Error('the test never re-reads')
}

/**
 * When the reading on screen was taken — the prop approved decision 9 makes required.
 *
 * A reading taken at the same fixed instant every age is measured from, so nothing in this file
 * depends on the wall clock.
 */
const readAt: MachineRead = {
  at: NOW,
  inFlight: false,
  inFlightFromAPress: false,
  theLastReadWasFromAPress: false,
  failed: null,
  onReadAgain: () => {
    throw new Error('the test never re-reads')
  },
}

/**
 * GET /api/sessions, in the shape the server actually sends — `name`, `title`, `recordId`,
 * `lastActivityAt`, `stateReason`, and six states. Kept as one literal so a contract change
 * shows up as one diff here.
 */
function sessionsPayload() {
  return {
    sessions: [
      {
        id: 'claude-code:crash',
        recordId: 'rec-crash',
        name: 'force-table collation',
        title: 'force-table collation',
        state: 'crashed',
        stateReason: 'the log ends on "exit 137, out of memory" and no process names this session.',
        purpose: 'collate the force tables from the three v3 prints',
        doing: 'was collating the force tables from the three v3 prints',
        tool: 'claude-code',
        cwd: `${THE_TEST_FIXTURE_ROOT}/proj_1st_baseline`,
        lastActivityAt: '2026-08-05 12:00:00',
        resumeCommand: `cd '${THE_TEST_FIXTURE_ROOT}/proj_1st_baseline' && claude --resume crash`,
        logPath: '/tmp/panelx/crash.jsonl',
        workspace: { name: 'proj_1st_baseline', from: 'observed', path: `${THE_TEST_FIXTURE_ROOT}/proj_1st_baseline` },
        recordedAgent: 'claude-code',
        lastActivityFrom: 'log',
        placement: {
          kind: 'in',
          primary: {
            project: { id: 'mod-gripper', kind: 'module', title: 'Tray clamp' },
            evidence: { how: 'link', word: 'part of' },
            support: 1,
            sentence: 'A link joins this run and the module \u201cTray clamp\u201d \u2014 from this run\u2019s end it reads \u201cpart of\u201d.',
          },
          also: [],
        },
      },
      {
        id: 'claude-code:orph',
        recordId: null,
        name: 'gripper sweep, left behind',
        title: null,
        state: 'orphaned',
        stateReason: 'no process names this session and its log last grew 19h ago.',
        purpose: 'run the effort sweep',
        doing: null,
        tool: 'claude-code',
        cwd: `${THE_TEST_FIXTURE_ROOT}/test_claude`,
        lastActivityAt: '2026-08-07 17:24:00',
        resumeCommand: `cd '${THE_TEST_FIXTURE_ROOT}/test_claude' && claude --resume orph`,
        logPath: '/tmp/panelx/orph.jsonl',
        workspace: { name: 'test_claude', from: 'observed', path: `${THE_TEST_FIXTURE_ROOT}/test_claude` },
        recordedAgent: null,
        lastActivityFrom: 'log',
        placement: {
          kind: 'unassigned',
          reason: { why: 'not-filed' },
          sentence:
            'This run was found in an agent tool\u2019s log directory and never filed as a record, so there is nothing that could carry a link or a change row.',
          howToPlace: 'Nothing files this run under a piece of work yet. POST /api/sessions/claude-code:orph/link {"toTitle":"..."}',
        },
      },
      {
        id: 'claude-code:run',
        recordId: 'rec-run',
        name: 'gripper sweep',
        title: 'gripper sweep',
        state: 'running',
        stateReason: 'pid 3302512 is running this session and its log grew 12s ago.',
        purpose: 'run the effort sweep',
        doing: 'writing effort_sweep_v3.csv',
        tool: 'claude-code',
        cwd: `${THE_TEST_FIXTURE_ROOT}/test_claude`,
        lastActivityAt: '2026-08-08 11:58:00',
        resumeCommand: 'claude --resume run',
        logPath: '',
        workspace: { name: 'test_claude', from: 'observed', path: `${THE_TEST_FIXTURE_ROOT}/test_claude` },
        recordedAgent: 'claude-code',
        lastActivityFrom: 'log',
        placement: {
          kind: 'unassigned',
          reason: { why: 'wrote-nothing' },
          sentence:
            'It has a record, nothing is linked to that record, and no write in the change log names this run.',
          howToPlace: 'Nothing files this run under a piece of work yet. POST /api/sessions/claude-code:run/link {"toTitle":"..."}',
        },
      },
      {
        id: 'opencode:idle',
        recordId: 'rec-idle',
        name: 'urdf audit',
        title: 'urdf audit',
        state: 'idle',
        stateReason: 'pid 3319001 is alive but the log has not grown for 41m.',
        purpose: 'waiting on a decision about PETG',
        doing: 'asked whether to reprint in PETG',
        tool: 'opencode',
        cwd: `${THE_TEST_FIXTURE_ROOT}/yumi`,
        lastActivityAt: '2026-08-08 11:19:00',
        resumeCommand: 'opencode --session idle',
        logPath: '/tmp/panelx/idle.log',
        workspace: { name: 'yumi', from: 'observed', path: `${THE_TEST_FIXTURE_ROOT}/yumi` },
        recordedAgent: 'opencode',
        lastActivityFrom: 'log',
        placement: {
          kind: 'in',
          primary: {
            project: { id: 'pipe-handover', kind: 'pipeline', title: 'Transplant v2' },
            evidence: { how: 'changed' },
            support: 1,
            sentence: 'The change log says this run wrote to the pipeline \u201cTransplant v2\u201d.',
          },
          also: [
            {
              project: { id: 'mod-gripper', kind: 'module', title: 'Tray clamp' },
              evidence: { how: 'through', via: { id: 'tsk-reprint', kind: 'task', title: 'Reprint the v3 fingers' }, word: 'part of' },
              support: 1,
              sentence:
                'This run wrote to the task \u201cReprint the v3 fingers\u201d, which is linked to the module \u201cTray clamp\u201d \u2014 from that task\u2019s end the link reads \u201cpart of\u201d.',
            },
          ],
        },
      },
      {
        id: 'claude-code:unk',
        recordId: 'rec-unk',
        name: 'mystery run',
        title: 'mystery run',
        state: 'unknown',
        stateReason: 'the process table could not be read, so nothing can be said about this one.',
        purpose: null,
        doing: null,
        tool: 'claude-code',
        cwd: null,
        lastActivityAt: '2026-08-08 09:00:00',
        resumeCommand: null,
        logPath: '/tmp/panelx/unk.jsonl',
        workspace: { name: 'proj_1st_baseline', from: 'recorded', path: null },
        recordedAgent: 'claude-code (opus-5)',
        lastActivityFrom: 'change-log',
        placement: {
          kind: 'unassigned',
          reason: { why: 'reaches-nothing', touched: 2, linked: 1 },
          sentence:
            'It has 1 link and touched 2 records, and not one of them is a pipeline, a module, a block of one, or a record linked to one.',
          howToPlace: 'Nothing files this run under a piece of work yet. POST /api/sessions/claude-code:unk/link {"toTitle":"..."}',
        },
      },
      {
        id: 'claude-code:done',
        recordId: 'rec-done',
        name: 'seed rewrite',
        title: 'seed rewrite',
        state: 'finished',
        stateReason: 'the log ends with a clean exit marker.',
        purpose: 'rewrite the seed script',
        doing: 'finished cleanly, 12 records written',
        tool: 'claude-code',
        cwd: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        lastActivityAt: '2026-08-07 22:40:00',
        resumeCommand: 'claude --resume done',
        logPath: '/tmp/panelx/done.jsonl',
        workspace: null,
        recordedAgent: 'claude-code',
        lastActivityFrom: 'stated',
        placement: {
          kind: 'unassigned',
          reason: { why: 'wrote-nothing' },
          sentence:
            'It has a record, nothing is linked to that record, and no write in the change log names this run.',
          howToPlace: 'Nothing files this run under a piece of work yet. POST /api/sessions/claude-code:done/link {"toTitle":"..."}',
        },
      },
    ],
    searched: [{ tool: 'claude-code', looksIn: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/<project>/<id>.jsonl`, reportsCleanExit: false }],
    counts: { crashed: 1, orphaned: 1, running: 1, idle: 1, unknown: 1, finished: 1 },
    placementRule: 'A run is filed under one pipeline or module, by what was recorded and never by what its title says.',
    placementRead: { rule: 'A run is filed under one pipeline or module.', projects: 2, blocks: 6, links: 4, changes: 40, changesCapped: false },
  }
}

/** GET /api/resources/orphans, in the shape the release contract specifies. */
function orphansPayload() {
  return {
    orphans: [
      {
        id: 'orph-proc',
        kind: 'process',
        describe: 'node src/server/index.ts — pid 3302512, group 3302496, up 10d20h',
        ageSeconds: 936000,
        sessionId: 'rec-done',
        sessionTitle: 'seed rewrite',
        releaseAction: {
          verb: 'kill',
          target: 'process group 3302496',
          signal: 'SIGTERM',
          alsoAffects: [
            'tsx watch src/server/index.ts — pid 3302496, group 3302496, up 10d20h',
            'esbuild --service=0.27.1 — pid 3302518, group 3302496, up 10d20h',
          ],
          confirmPhrase:
            'Send SIGTERM to process group 3302496, killing node src/server/index.ts (pid 3302512) and 2 other processes in that group.',
        },
      },
      {
        id: 'orph-lock',
        kind: 'lock',
        describe: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/isaac/.lock — written 4d ago by pid 118822, which is gone`,
        ageSeconds: 345600,
        sessionId: null,
        sessionTitle: null,
        releaseAction: null,
      },
    ],
    searched: [
      'the process table (/proc)',
      'listening ports',
      'nvidia-smi',
      'docker ps',
      `lock files under ${THE_TEST_FIXTURE_ROOT}/PROJECTS`,
    ],
  }
}

const readSessions = () => sp.readSessionsPayload(sessionsPayload())
const readOrphans = () => sp.readOrphansPayload(orphansPayload())

// ============================================================================ readSessionsPayload

describe('readSessionsPayload reads what the server actually sends', () => {
  it('reads a well-formed payload and reports nothing', () => {
    const read = readSessions()
    expect(read.problems).toEqual([])
    expect(read.sessions).toHaveLength(6)
    expect(read.sessions.map((s) => s.state).sort()).toEqual(
      ['crashed', 'finished', 'idle', 'orphaned', 'running', 'unknown'].sort(),
    )
  })

  it('takes the record title when there is one and the tool name when there is not', () => {
    const read = readSessions()
    expect(read.sessions.find((s) => s.id === 'claude-code:orph')?.title).toBe('gripper sweep, left behind')
    expect(read.sessions.find((s) => s.id === 'claude-code:orph')?.recordId).toBeNull()
    expect(read.sessions.find((s) => s.id === 'claude-code:done')?.recordId).toBe('rec-done')
  })

  it('reads the clock from `lastActivityAt`, which is what the server calls it', () => {
    const read = readSessions()
    expect(read.sessions.find((s) => s.id === 'claude-code:run')?.lastOutputAt).toBe('2026-08-08 11:58:00')
  })

  it('reads blank strings as absent, so a row never prints an empty field', () => {
    const read = readSessions()
    // The running session's logPath is "" in the payload above, as the server sends it for a
    // session filed by hand with no log.
    expect(read.sessions.find((s) => s.id === 'claude-code:run')?.logPath).toBeNull()
  })

  it('refuses a session with no state, names it, and says what was expected', () => {
    const raw = sessionsPayload()
    delete (raw.sessions[0] as Record<string, unknown>)['state']
    const read = sp.readSessionsPayload(raw)
    expect(read.sessions).toHaveLength(5)
    expect(read.problems.join(' ')).toContain('force-table collation')
    expect(read.problems.join(' ')).toContain('crashed')
  })

  it('refuses a state outside the six and quotes the one it got', () => {
    const raw = sessionsPayload()
    ;(raw.sessions[0] as Record<string, unknown>)['state'] = 'zombie'
    const read = sp.readSessionsPayload(raw)
    expect(read.sessions).toHaveLength(5)
    expect(read.problems.join(' ')).toContain('"zombie"')
  })

  it('refuses a session with no id or no name rather than inventing one', () => {
    const raw = sessionsPayload()
    delete (raw.sessions[1] as Record<string, unknown>)['id']
    const read = sp.readSessionsPayload(raw)
    expect(read.sessions).toHaveLength(5)
    expect(read.problems.join(' ')).toContain('has no id')
  })

  it('keeps `searched` and `warning`, because "none found" needs a scope and a caveat', () => {
    const raw = { ...sessionsPayload(), warning: 'the process table could not be listed' }
    const read = sp.readSessionsPayload(raw)
    expect(read.searched[0]).toContain(`${THE_TEST_FIXTURE_ROOT}/.claude/projects`)
    expect(read.warning).toBe('the process table could not be listed')
  })

  it('says so when the reply is not an object at all', () => {
    expect(sp.readSessionsPayload('nope').problems[0]).toContain('not an object')
  })
})

// ============================================================================ readOrphansPayload

describe('readOrphansPayload reads the release contract', () => {
  it('reads a complete orphan, with every field of its release action', () => {
    const read = readOrphans()
    expect(read.problems).toEqual([])
    const proc = read.orphans.find((o) => o.id === 'orph-proc')
    expect(proc?.describe).toContain('pid 3302512, group 3302496')
    expect(proc?.ageSeconds).toBe(936000)
    expect(proc?.releaseAction?.verb).toBe('kill')
    expect(proc?.releaseAction?.target).toBe('process group 3302496')
    expect(proc?.releaseAction?.signal).toBe('SIGTERM')
    expect(proc?.releaseAction?.alsoAffects).toHaveLength(2)
    expect(proc?.releaseAction?.confirmPhrase).toContain('SIGTERM to process group 3302496')
  })

  it('accepts a null releaseAction without complaining — it is the contract, not a fault', () => {
    const read = readOrphans()
    expect(read.orphans.find((o) => o.id === 'orph-lock')?.releaseAction).toBeNull()
    expect(read.problems).toEqual([])
  })

  it('refuses a release action on a lock file, however well formed it is', () => {
    const raw = orphansPayload()
    ;(raw.orphans[1] as Record<string, unknown>)['releaseAction'] = {
      verb: 'kill',
      target: 'the lock file',
      alsoAffects: [],
      confirmPhrase: `Delete ${THE_TEST_FIXTURE_ROOT}/PROJECTS/isaac/.lock`,
    }
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans.find((o) => o.id === 'orph-lock')?.releaseAction).toBeNull()
    expect(read.problems.join(' ')).toContain('lock file, which Mole Office never deletes')
  })

  it('refuses an action with no `alsoAffects`, because what else dies is the dangerous half', () => {
    const raw = orphansPayload()
    delete (raw.orphans[0]!['releaseAction'] as Record<string, unknown>)['alsoAffects']
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans[0]?.releaseAction).toBeNull()
    expect(read.problems.join(' ')).toContain('alsoAffects')
    expect(read.problems.join(' ')).toContain('no release button is shown')
  })

  it('refuses an action with no confirmPhrase, and one with no target', () => {
    for (const field of ['confirmPhrase', 'target']) {
      const raw = orphansPayload()
      delete (raw.orphans[0]!['releaseAction'] as Record<string, unknown>)[field]
      const read = sp.readOrphansPayload(raw)
      expect(read.orphans[0]?.releaseAction).toBeNull()
      expect(read.problems.join(' ')).toContain(field === 'target' ? 'names no target' : 'confirmPhrase')
    }
  })

  it('refuses a verb it does not know rather than guessing what would happen', () => {
    const raw = orphansPayload()
    ;(raw.orphans[0]!['releaseAction'] as Record<string, unknown>)['verb'] = 'remove'
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans[0]?.releaseAction).toBeNull()
    expect(read.problems.join(' ')).toContain('"remove"')
  })

  it('keeps the orphan when only its action is unreadable, so a live process is never hidden', () => {
    const raw = orphansPayload()
    ;(raw.orphans[0] as Record<string, unknown>)['releaseAction'] = 'kill -TERM -3302496'
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans).toHaveLength(2)
    expect(read.orphans[0]?.releaseAction).toBeNull()
  })

  it('drops an orphan with no `describe`, because a row that cannot name anything is worse than none', () => {
    const raw = orphansPayload()
    delete (raw.orphans[0] as Record<string, unknown>)['describe']
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans).toHaveLength(1)
    expect(read.problems.join(' ')).toContain('`describe`')
  })

  it('refuses an orphan of an unknown kind and names the five it knows', () => {
    const raw = orphansPayload()
    ;(raw.orphans[0] as Record<string, unknown>)['kind'] = 'thread'
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans).toHaveLength(1)
    expect(read.problems.join(' ')).toContain('process, port, gpu, container, lock')
  })

  it('keeps an orphan whose age is missing, and says the age is missing', () => {
    const raw = orphansPayload()
    delete (raw.orphans[0] as Record<string, unknown>)['ageSeconds']
    const read = sp.readOrphansPayload(raw)
    expect(read.orphans).toHaveLength(2)
    expect(read.orphans[0]?.ageSeconds).toBeNull()
    expect(read.problems.join(' ')).toContain('no ageSeconds')
  })

  it('treats a missing `orphans` key as an unanswered question, not as "nothing is running"', () => {
    const read = sp.readOrphansPayload({ searched: [] })
    expect(read.orphans).toEqual([])
    expect(read.problems.join(' ')).toContain('did not answer')
  })

  /**
   * The difference found when this was tested against the running server on 2026-08-08.
   *
   * GET /api/resources/orphans still answers with the ledger's own `ResourceReport` rows —
   * `type`/`key`/`detail`/`age` — and no `describe`, `ageSeconds` or `releaseAction`. This test
   * pins what the view does about that: it shows nothing it cannot describe, and prints a line
   * per row naming the missing field. It is not asserting the old shape is correct; it is
   * asserting the disagreement is visible instead of silent.
   */
  it('prints a line per row when the server still sends the old ledger shape', () => {
    const legacy = {
      checkedAt: '2026-08-08 12:18:17',
      platform: 'linux',
      orphans: [
        {
          id: 'res-1',
          type: 'process',
          key: '3302512',
          detail: 'node src/server/index.ts',
          age: { seconds: 936000, human: '10d20h' },
        },
      ],
      stillOwned: [],
      unchecked: [],
    }
    const read = sp.readOrphansPayload(legacy)
    expect(read.orphans).toEqual([])
    expect(read.problems.join(' ')).toContain('`describe`')
  })
})

// ============================================================================ the release reply

describe('readReleaseReply refuses to call a release a success unless the server did', () => {
  const orphan = () => readOrphans().orphans[0]!

  it('reads the description and everything killed', () => {
    const report = sp.readReleaseReply(
      {
        released: true,
        describe: 'process group 3302496 (node src/server/index.ts, pid 3302512)',
        killed: ['pid 3302512', 'pid 3302496', 'pid 3302518'],
        outcome: 'SIGTERM sent; all three processes are gone.',
      },
      orphan(),
    )
    expect(report.describe).toContain('3302496')
    expect(report.killed).toHaveLength(3)
    expect(report.outcome).toContain('SIGTERM sent')
  })

  it('throws when the body does not say released:true', () => {
    expect(() => sp.readReleaseReply({ ok: true }, orphan())).toThrow(/released:true/)
  })

  it('throws when the server will not say what it acted on', () => {
    expect(() => sp.readReleaseReply({ released: true }, orphan())).toThrow(/did not describe/)
  })

  it('reports "not listed" rather than "nothing else died" when `killed` is absent', () => {
    const report = sp.readReleaseReply({ released: true, describe: 'process group 3302496' }, orphan())
    expect(report.killed).toBeNull()
  })
})

// ============================================================================ the refusal policy

describe('a refused release is never retried', () => {
  it('calls a 409 a stale reading and quotes the server', () => {
    const refusal = sp.releaseRefusal(new webApi.ApiError(409, 'port 8787 is now held by pid 9002.'))
    expect(refusal.stale).toBe(true)
    expect(refusal.message).toContain('Nothing was killed')
    expect(refusal.message).toContain('port 8787 is now held by pid 9002.')
    expect(refusal.message).toContain('not retried')
  })

  it('calls a 400 what it is: the screen and the server disagree about the phrase', () => {
    const refusal = sp.releaseRefusal(new webApi.ApiError(400, 'expect does not match the current confirmPhrase.'))
    expect(refusal.stale).toBe(true)
    expect(refusal.message).toContain('stale reading of the machine')
  })

  it('passes anything else through in the server’s own words, and still does not retry', () => {
    const refusal = sp.releaseRefusal(new webApi.ApiError(500, 'kill(2) failed: EPERM'))
    expect(refusal.stale).toBe(false)
    expect(refusal.message).toBe('kill(2) failed: EPERM')
  })
})

// ============================================================================ the request itself

describe('releaseOrphan sends back the phrase the reader was shown', () => {
  const real = globalThis.fetch

  it('POSTs { expect } to /api/resources/:id/release', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(
        JSON.stringify({ released: true, describe: 'process group 3302496', killed: ['pid 3302512'] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const orphan = readOrphans().orphans[0]!
      const phrase = orphan.releaseAction!.confirmPhrase
      const report = await sp.releaseOrphan(orphan, phrase)
      expect(report.describe).toBe('process group 3302496')
      expect(seen).toHaveLength(1)
      expect(seen[0]?.url).toBe('/api/resources/orph-proc/release')
      expect(seen[0]?.init.method).toBe('POST')
      expect(JSON.parse(String(seen[0]?.init.body))).toEqual({ expect: phrase })
    } finally {
      globalThis.fetch = real
    }
  })

  it('turns a 409 into an ApiError carrying the status, so the row can refuse to retry', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'pid 3302512 has been recycled since it was read.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    try {
      const orphan = readOrphans().orphans[0]!
      await expect(sp.releaseOrphan(orphan, 'whatever')).rejects.toMatchObject({
        status: 409,
        message: 'pid 3302512 has been recycled since it was read.',
      })
    } finally {
      globalThis.fetch = real
    }
  })
})

// ============================================================================ order and the cut

describe('sortSessionViews puts what needs you first', () => {
  it('orders crashed, orphaned, running, idle, unknown, finished', () => {
    const { sessions } = readSessions()
    const order = sp.sortSessionViews(sessions, NOW).map((s) => s.state)
    expect(order).toEqual(['crashed', 'orphaned', 'running', 'idle', 'unknown', 'finished'])
  })

  it('puts the newest output first inside one state', () => {
    const { sessions } = readSessions()
    const two = sessions
      .filter((s) => s.state === 'running')
      .concat({ ...sessions[2]!, id: 'x', title: 'older running', lastOutputAt: '2026-08-08 09:00:00' })
    const order = sp.sortSessionViews(two, NOW).map((s) => s.title)
    expect(order).toEqual(['gripper sweep', 'older running'])
  })
})

// ============================================================================ the state drawing

describe('a session state is drawn as the product draws any state word', () => {
  /**
   * WHAT THIS BLOCK USED TO CHECK, AND WHY IT CHECKS SOMETHING ELSE NOW.
   *
   * It used to read `SESSION_CHIP` — the map from the six session words onto six of the ten chips
   * this interface computes — and assert that the six landed in six different state families, that
   * the analytical rules drew those families apart, and that the component sheet's copy of the map
   * agreed with it.
   *
   * THE MAP IS DELETED. It was the reason one session word came out tinted blue, grey, red, amber
   * or green here, and as a filled black block on Home: two drawings of one fact, four inches
   * apart on two pages. A session state is a word on a record, so it is drawn by the product's
   * `StoredState` — shape from the word, no colour at all, one drawing everywhere.
   */

  it('draws every session state with the product chip and no chip of its own', () => {
    for (const state of SESSION_STATES) {
      const html = body(h(sp.SessionStateChip, { state }))
      expect(html, `${state} is not drawn by the stored-word chip`).toContain('px-chip-stored')
      expect(html, `${state} has no drawing`).toContain('data-drawing=')
    }
  })

  it('gives the seven states six different drawings, and says which two share one', () => {
    const drawings = SESSION_STATES.map((state) => ui.stateDrawing(state))
    // `idle` and `orphaned` share the filled block on purpose: an agent waiting for your answer and
    // a dead run still holding a port are the two states where the wait is the point and the fix
    // takes seconds. Every other pair is a different drawing.
    expect(ui.stateDrawing('idle')).toBe('waiting-on-you')
    expect(ui.stateDrawing('orphaned')).toBe('waiting-on-you')
    expect(ui.stateDrawing('running')).toBe('under-way')
    expect(ui.stateDrawing('crashed')).toBe('broke')
    expect(ui.stateDrawing('finished')).toBe('ended')
    expect(ui.stateDrawing('unknown')).toBe('nobody-can-say')
    // `paused` (criterion W6) is drawn as anything put down on purpose is, held up, which no other
    // session state shares: a run a shutdown stopped is neither broken nor waiting on an answer.
    expect(ui.stateDrawing('paused')).toBe('held-up')
    expect(new Set(drawings).size, `seven states drawn ${drawings.join(', ')}`).toBe(6)
  })

  it('shows the two words that read as the opposite of what they mean', () => {
    // `idle` reads as "nothing is happening here, leave it". It means an agent stopped and needs an
    // answer. `orphaned` reads as an orphan; it means a dead run is holding a port or a GPU now.
    expect(body(h(sp.SessionStateChip, { state: 'idle' }))).toContain('waiting for you')
    expect(body(h(sp.SessionStateChip, { state: 'orphaned' }))).toContain('left running')
  })

  it('draws the page chips as stored words, with no state colour anywhere on them', () => {
    const html = body(
      h(pg.SessionsView, {
        lines: allLines(),
        orphans: [],
        unclaimed: sweep(),
        problems: [],
        now: NOW,
        read: readAt,
        onRelease: neverReleases,
        onReread: neverRereads,
      }),
    )
    const drawings = new Set([...html.matchAll(/data-drawing="([a-z-]+)"/g)].map((m) => m[1] as string))
    expect(drawings.size, `the page drew ${[...drawings].join(', ')}`).toBeGreaterThanOrEqual(3)
    // Not one chip on this page carries a word borrowed from the ten this interface computes.
    expect(html).not.toContain('SESSION_CHIP')
  })

  it('declares one emphasis for the page, and it is the analytical one', () => {
    const html = body(
      h(pg.SessionsView, {
        lines: allLines(),
        orphans: [],
        unclaimed: sweep(),
        problems: [],
        now: NOW,
        read: readAt,
        onRelease: neverReleases,
        onReread: neverRereads,
      }),
    )
    // It still governs the chips this interface computes for itself, which this page also draws.
    // It has never been allowed to reach a stored word, and now every state chip here is one.
    expect(html.match(/data-px-emphasis="analytical"/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('data-px-emphasis="perceptual"')
  })

  /**
   * The maps were once copied into three files and all three had drifted. This is the test that
   * makes a fourth copy fail rather than ship: it reads the source, because that is where the
   * duplication would be, and no runtime assertion can see a second literal that nothing imports.
   */
  it('declares no map from a session state to a drawing anywhere in the browser app', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.tsx?$/.test(entry.name)) files.push(path)
      }
    }
    walk('src/web')
    const count = (re: RegExp) =>
      files.reduce((n, f) => n + (readFileSync(f, 'utf8').match(re)?.length ?? 0), 0)

    // The name may still appear in a comment saying why it went; what may not come back is a
    // declaration of it.
    expect(count(/const SESSION_CHIP|SESSION_CHIP\s*[:=]/g), 'the borrowed-chip map is back').toBe(0)
    expect(count(/Record<SessionState,\s*PanelState>/g), 'something maps the six states to chips again').toBe(0)
  })
})

// ============================================================================ ages

describe('orphanAge is a duration, not a moment', () => {
  it('gives the elapsed form, with no "ago", so it reads inside a sentence', () => {
    expect(sp.orphanAge(11 * 24 * 3600)).toBe('11d')
    expect(sp.orphanAge(3 * 3600)).toBe('3h')
    expect(sp.orphanAge(10)).toBe('under a minute')
  })

  it('says the age is unknown rather than pretending it is zero', () => {
    expect(sp.orphanAge(null)).toBe('age unknown')
  })
})

// ============================================================================ the release button

describe('a release that cannot say what it kills is not offered', () => {
  it('renders no release button for an orphan with no releaseAction', () => {
    const { orphans } = readOrphans()
    const mute = { ...orphans[0]!, releaseAction: null }
    const html = body(h(sp.OrphanBlock, { orphans: [mute], onRelease: neverReleases, onReread: neverRereads }))
    expect(html).not.toContain('Release…')
    expect(html).toContain('did not say exactly what killing this would act on')
    // The facts are still there, so it can be done by hand.
    expect(html).toContain('pid 3302512, group 3302496')
  })

  it('says a lock file is deliberately never deleted, rather than saying nothing', () => {
    const lock = readOrphans().orphans.find((o) => o.kind === 'lock')!
    const html = body(h(sp.OrphanBlock, { orphans: [lock], onRelease: neverReleases, onReread: neverRereads }))
    expect(html).not.toContain('Release…')
    expect(html).toContain('never deletes lock files')
    expect(html).toContain('lets a second copy start on the same data')
  })

  it('renders the button, and not the confirm phrase, until the reader asks for it', () => {
    const { orphans } = readOrphans()
    const html = body(h(sp.OrphanBlock, { orphans, onRelease: neverReleases, onReread: neverRereads }))
    expect(html).toContain('Release…')
    expect(html).not.toContain('Send SIGTERM to process group')
  })
})

/**
 * A RELEASE PRESS THAT FAILED IS HEADED BY WHAT FAILED (wave 13y round 142). With no label of its own the note was
 * headed "Failed.", and an office that could not be reached made it say the page could not be read, under a page
 * that is drawn.
 */
describe('a failed release press says so under its own label', () => {
  it('heads the note with the press, keeps the way out, and never says the page is blank', () => {
    const message = 'The office did not answer.'
    const fault = {
      kind: 'unreachable',
      message,
      said: null,
      path: '/api/resources/orph-1/release',
      status: 0,
      reason: null,
      detail: null,
      stored: null,
      elsewhere: null,
    } as unknown as Fault
    const text = seen(body(h(sp.ReleaseFailedNote, { message, fault, onReread: neverRereads })))
    expect(text).toContain(t('g6a.sessions.theReleasePressFailed'))
    expect(text).toContain(t('g6a.sessions.readTheMachineAgain'))
    expect(text).not.toContain(t('error.failed'))
    expect(text).not.toContain(t('error.blank'))
  })
})

// Plan 7FEOshq3mBGG: the shared confirmation opens on a press.
// A browser test checked the exact phrase, target, affected resources, distinct stop/kill labels,
// cancel, and one confirmed request, until it was deleted on 12 November 2026.
describe('release starts with a question opener', () => {
  it('keeps the destructive act and its confirmation behind the first press', () => {
    const action = readOrphans().orphans[0]!.releaseAction!
    const html = body(h(sp.ReleaseConfirm, {action, pending: false, onConfirm: () => { throw Error('not pressed') }}))
    expect(html).toContain('Release…')
    expect(html).not.toContain(action.confirmPhrase)
    expect(html).not.toContain('Yes — kill it now')
    expect(html).not.toContain('<dialog')
  })
})

// ============================================================================ what was written down
/**
 * The distinction this whole rebuild turns on, and the reason it needs a second request.
 *
 * GET /api/sessions reports a hand-filed session with NO `state` and a hand-filed session that says
 * `state: "unknown"` as the same word: `unknown`. The seeded workspace holds nine of the first and
 * four of the second on purpose, and the only thing separating them in that reply is an English
 * sentence. So the page reads the RECORDS too and classifies `data.state` with the shared contract.
 * These tests are about that split, because collapsing it turns "nobody has said" into "somebody
 * looked and could not tell", which is a judgement nobody made.
 */

/** A `session` record, as GET /api/records?kind=session sends it. */
function record(id: string, data: Record<string, unknown>): PanelRecord {
  return {
    id,
    kind: 'session',
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: id,
    summary: null,
    data,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-08 09:00:00',
    deletedAt: null,
  }
}

/** Records for the six sessions in the payload above, plus the two gaps it does not contain. */
function sessionRecords(): PanelRecord[] {
  return [
    record('rec-crash', { state: 'crashed', detail: 'exit 137, out of memory while collating the force tables' }),
    record('rec-run', { state: 'running', workspace: 'test_claude' }),
    record('rec-idle', { state: 'idle' }),
    record('rec-unk', { state: 'unknown', detail: 'log ends mid-line, no exit code, no process' }),
    record('rec-done', { state: 'finished', detail: 'exit 0 · 12 records written' }),
    // The two the sessions API cannot tell apart from `rec-unk`.
    record('rec-nostate', {}),
    record('rec-zombie', { state: 'zombie' }),
  ]
}

/** The six sessions, plus one with no state written and one carrying an unclassified word. */
function allLines(): SessionLine[] {
  const extra: SessionView[] = [
    {
      ...readSessions().sessions[4]!,
      id: 'claude-code:nostate',
      recordId: 'rec-nostate',
      title: 'log 9f2c1a04 · greenhouse_bench',
      stateReason: 'this session was filed by hand and carries no `state`, and there is no log path on the record.',
    },
    {
      ...readSessions().sessions[4]!,
      id: 'claude-code:zombie',
      recordId: 'rec-zombie',
      title: 'a run whose word nobody has classified',
      stateReason: 'this session was filed by hand and carries no `state`, and there is no log path on the record.',
    },
  ]
  return sp.joinSessionRecords(
    [...readSessions().sessions, ...extra],
    sp.readSessionRecordFacts(sessionRecords()),
  )
}

describe('what a record says, read as a stored word rather than out of prose', () => {
  it('separates “no state was ever written” from “recorded as unknown”', () => {
    const lines = allLines()
    const byId = new Map(lines.map((line) => [line.id, line]))
    // All three arrive from the API in state `unknown`.
    expect(byId.get('claude-code:unk')?.state).toBe('unknown')
    expect(byId.get('claude-code:nostate')?.state).toBe('unknown')
    // And they land in different groups, because the records say different things.
    expect(sp.sessionGroupKey(byId.get('claude-code:unk')!)).toBe('unknown-judged')
    expect(sp.sessionGroupKey(byId.get('claude-code:nostate')!)).toBe('no-state')
    expect(sp.sessionGroupKey(byId.get('claude-code:zombie')!)).toBe('unclassified')
  })

  it('says nothing at all when the records were not read, rather than guessing which it is', () => {
    const unread = sp.joinSessionRecords(readSessions().sessions, null)
    for (const line of unread) expect(line.written.kind).toBe('unread')
    const anUnknown = unread.find((line) => line.state === 'unknown')!
    expect(sp.sessionGroupKey(anUnknown)).toBe('unknown-unread')
  })

  it('treats a session with no record as nobody having written a state, and says it is not filed', () => {
    const lines = allLines()
    const orphaned = lines.find((line) => line.id === 'claude-code:orph')!
    expect(orphaned.recordId).toBeNull()
    expect(orphaned.written.kind).toBe('no-record')
  })

  it('carries `detail` — how it ended — which the sessions API does not send at all', () => {
    const crashed = allLines().find((line) => line.id === 'claude-code:crash')!
    expect(crashed.detail).toBe('exit 137, out of memory while collating the force tables')
  })
})

// ============================================================================ the groups

describe('sessions are grouped by what they demand, and only one group is folded', () => {
  it('puts every session in exactly one group, and leaves empty groups out', () => {
    const lines = allLines()
    const groups = sp.groupSessions(lines, NOW)
    expect(groups.flatMap((g) => g.lines)).toHaveLength(lines.length)
    expect(new Set(groups.map((g) => g.spec.key)).size).toBe(groups.length)
    expect(groups.map((g) => g.spec.key)).toEqual([
      'crashed',
      'orphaned',
      'idle',
      'running',
      'unknown-judged',
      'no-state',
      'unclassified',
      'finished-written',
    ])
  })

  it('marks exactly one group as work a person wrote down as finished', () => {
    const confirmed = sp.SESSION_GROUPS.filter((spec) => spec.humanConfirmedFinished)
    expect(confirmed.map((spec) => spec.key)).toEqual(['finished-written'])
  })

  it('does not count a `finished` that no record confirms', () => {
    // The state word came from the tool, and nothing was written down. Going quiet is not a person
    // saying the work is done, so it keeps its own group with its own name.
    const lines = sp.joinSessionRecords(readSessions().sessions, sp.readSessionRecordFacts([]))
    const finished = lines.find((line) => line.state === 'finished')!
    expect(sp.sessionGroupKey(finished)).toBe('finished-unwritten')
    expect(sp.SESSION_GROUPS.find((spec) => spec.key === 'finished-unwritten')?.humanConfirmedFinished).toBe(false)
  })

  it('keeps the STORED word `idle` and only shows it differently', () => {
    // The group label is the stored word, because a group is how the page is organised and an
    // agent filing a session writes `idle`. What a reader sees ON THE CHIP is "waiting for you",
    // from the product's one display table — the stored word never changed and no migration is owed.
    const idle = sp.SESSION_GROUPS.find((spec) => spec.key === 'idle')!
    expect(idle.label).toBe('idle')
    expect(ui.shownState('idle')).toBe('waiting for you')
  })

  it('says out loud when an idle run has no recorded reason, instead of a bare word', () => {
    // The other half of approved decision 4. An idle session whose reason was never written and
    // one whose reason this page simply failed to print look identical, and one of them is a run
    // that has been waiting on an answer for four days with nothing on screen saying what it
    // wants. Never inferred from a transcript: the only two things the line can say are the
    // sentence that was recorded, and that there is none.
    const line = { ...allLines()[0]!, state: 'idle' as const, stateReason: null }
    const html = body(h(sp.SessionLineRow, { line, now: NOW }))
    expect(html).toContain('No reason was recorded for')
    expect(html).toContain('nothing here can say what it is waiting on')

    const withReason = body(
      h(sp.SessionLineRow, { line: { ...line, stateReason: 'asked whether £240 is inside the budget' }, now: NOW }),
    )
    expect(withReason).toContain('asked whether £240 is inside the budget')
    expect(withReason).not.toContain('No reason was recorded')
  })

  it('does not ask a running session to explain itself', () => {
    // The note belongs to work that STOPPED short. Printing it on every running row would bury the
    // rows where it matters.
    const running = { ...allLines()[0]!, state: 'running' as const, stateReason: null }
    expect(body(h(sp.SessionLineRow, { line: running, now: NOW }))).not.toContain('No reason was recorded')
  })
})

describe('the alarm level recedes with age instead of shouting at one strength', () => {
  const line = (state: SessionView['state'], lastOutputAt: string | null) =>
    ({ ...allLines()[0]!, state, lastOutputAt }) as SessionLine

  it('draws a crash from last night louder than one from a fortnight ago', () => {
    expect(sp.sessionAlarm(line('crashed', '2026-08-08 02:00:00'), NOW)).toBe('raised')
    expect(sp.sessionAlarm(line('crashed', '2026-07-25 02:00:00'), NOW)).toBe('faded')
  })

  it('gives a running or finished session no alarm level at all', () => {
    expect(sp.sessionAlarm(line('running', '2026-08-08 11:58:00'), NOW)).toBeUndefined()
    expect(sp.sessionAlarm(line('finished', '2026-08-01 11:58:00'), NOW)).toBeUndefined()
  })

  it('draws a row it cannot date at `plain`, never at `faded`', () => {
    // "Mole Office cannot tell how long this has sat" is not evidence that it has sat a long time.
    expect(sp.sessionAlarm(line('idle', null), NOW)).toBe('plain')
  })

  it('gives the CHIP the level too, and not only the row it sits in', () => {
    // The picture that found this: seven crashed sessions, ages 44 hours to twelve days, seven
    // identical full-strength red chips — because the level went to the row and stopped there. One
    // row saying two things about how urgent it is.
    const old = body(h(sp.SessionLineRow, { line: line('crashed', '2026-07-25 02:00:00'), now: NOW }))
    expect(old.match(/data-alarm="faded"/g)?.length).toBe(2)
    const fresh = body(h(sp.SessionLineRow, { line: line('crashed', '2026-08-08 02:00:00'), now: NOW }))
    expect(fresh).toContain('data-alarm="raised"')
    expect(fresh).not.toContain('data-alarm="faded"')
    // The word is unchanged at every level. Quieter is never "gone".
    expect(old).toContain('crashed')
  })

  it('leaves a chip alone where there is no level to give it', () => {
    const running = body(h(sp.SessionLineRow, { line: line('running', '2026-08-08 11:58:00'), now: NOW }))
    expect(running).not.toContain('data-alarm')
  })
})

// ============================================================================ said once

describe('an explanation several rows share is said once, with how many say it', () => {
  it('reports a sentence two rows share, and leaves a sentence only one row says alone', () => {
    const lines = allLines()
    const twins = [lines[0]!, { ...lines[0]!, id: 'twin' }, lines[1]!]
    const notes = sp.groupNotes(twins, (line) => line.stateReason)
    // Said twice, so it is worth saying once at the head with its count; said once, so it is not.
    expect(notes.shared).toEqual([{ sentence: lines[0]!.stateReason, count: 2, varies: false }])
    // Every row still carries its own sentence in its own fold, whatever the head says. That is
    // why there is no longer a rule about where a row's sentence goes: there is only one place.
    expect(body(h(sp.SessionLineRow, { line: lines[1]!, now: NOW }))).toContain(lines[1]!.stateReason!)
  })

  it('reads two sentences that differ only in a number as one, and says so', () => {
    // The server's per-row sentence is a formula with a measurement in it. Thirty-seven of them,
    // no two equal, are one sentence — and quoting one as though it covered the rest without
    // saying the number varies would be a claim about the others that nobody made.
    const a = { ...allLines()[0]!, id: 'a', stateReason: 'its log last grew 3d ago and no process names it.' }
    const b = { ...a, id: 'b', stateReason: 'its log last grew 15d ago and no process names it.' }
    expect(sp.sentenceShape(a.stateReason)).toBe(sp.sentenceShape(b.stateReason))
    const notes = sp.groupNotes([a, b], (line) => line.stateReason)
    expect(notes.shared).toHaveLength(1)
    expect(notes.shared[0]?.count).toBe(2)
    expect(notes.shared[0]?.varies).toBe(true)
    // Each keeps its own words, one press away, because the number IS that row's answer.
    expect(body(h(sp.SessionLineRow, { line: b, now: NOW }))).toContain('its log last grew 15d ago')
  })

  it('lifts more than one repeated sentence, most-said first, when a group has several', () => {
    const lines = allLines()
    const mixed = [
      lines[0]!,
      { ...lines[0]!, id: 'a' },
      { ...lines[0]!, id: 'b' },
      lines[1]!,
      { ...lines[1]!, id: 'c' },
    ]
    const notes = sp.groupNotes(mixed, (line) => line.stateReason)
    expect(notes.shared.map((note) => note.count)).toEqual([3, 2])
    expect(notes.shared.map((note) => note.varies)).toEqual([false, false])
  })
})

// ============================================================================ placing a run
/**
 * WHICH PIPELINE OR MODULE A RUN BELONGS TO IS NOT DECIDED HERE ANY MORE, and that is the change
 * this block records. The rule used to live in SessionPanel.tsx, and it was tested here as a rule:
 * what counts as evidence, what beats what, what happens when there is no evidence. It is in
 * src/server/lib/sessions.ts now and it is tested there, against a database, in tests/sessions.test.ts
 * — because a rule that only a React component knows is a rule no endpoint can serve and no agent
 * writing through the API can read.
 *
 * What is left for this page, and what is tested below, is the half that is still its own: reading
 * the answer defensively, and never turning a gap in its own reading into a finding about somebody's
 * records.
 */

const GRIPPER: ProjectRef = { id: 'mod-gripper', kind: 'module', title: 'Tray clamp' }
const HANDOVER: ProjectRef = { id: 'pipe-handover', kind: 'pipeline', title: 'Transplant v2' }

/** The placement a run gets when nothing files it — the commonest answer on a real machine. */
const nowhere: Placement = {
  kind: 'unassigned',
  reason: { why: 'wrote-nothing' },
  sentence: 'It has a record, nothing is linked to that record, and no write in the change log names this run.',
  howToPlace: 'POST /api/sessions/<id>/link {"toTitle":"<the pipeline, module or block it worked on>"}',
}

/** One run filed under one project, as the server words it. */
const filedUnder = (project: ProjectRef): Placement => ({
  kind: 'in',
  primary: {
    project,
    evidence: { how: 'link', word: 'part of' },
    support: 1,
    sentence: `A link joins this run and the ${project.kind} “${project.title}” — from this run’s end it reads “part of”.`,
  },
  also: [],
})

/** The same lines with every run unplaced, for the tests that are about grouping and not placing. */
const allUnplaced = (lines: readonly SessionLine[]): SessionLine[] =>
  lines.map((line) => ({ ...line, placement: nowhere }))

/** The groups these lines make, keyed off the placement each row carries. */
const groupsOf = (lines: readonly SessionLine[]) => sp.projectSessions(lines, sp.placementsOf(lines), NOW)

describe('the page reads where a run is filed rather than working it out', () => {
  it('takes the project, the evidence and the server’s own sentence off the row', () => {
    const crashed = readSessions().sessions.find((s) => s.id === 'claude-code:crash')!
    expect(crashed.placement.kind).toBe('in')
    if (crashed.placement.kind !== 'in') return
    expect(crashed.placement.primary.project).toEqual(GRIPPER)
    expect(crashed.placement.primary.evidence.how).toBe('link')
    // Quoted, not rebuilt: the wording is the server's and the page has no second copy of it.
    expect(crashed.placement.primary.sentence).toContain('from this run’s end it reads “part of”')
  })

  it('keeps every other project a run reaches, with its own sentence', () => {
    const idle = readSessions().sessions.find((s) => s.id === 'opencode:idle')!
    expect(idle.placement.kind === 'in' && idle.placement.also.map((claim) => claim.project)).toEqual([GRIPPER])
    const html = body(h(sp.SessionLineRow, { line: allLines()[3]!, now: NOW, placement: idle.placement }))
    expect(html).toContain('It also reaches 1 other pipeline or module')
    expect(html).toContain('which is linked to the module “Tray clamp”')
  })

  it('reads the four unplaced reasons and prints the server’s sentence for each', () => {
    const read = readSessions()
    const reasons = read.sessions.map((s) => (s.placement.kind === 'unassigned' ? s.placement.reason.why : 'in'))
    expect(reasons).toEqual(['in', 'not-filed', 'wrote-nothing', 'in', 'reaches-nothing', 'wrote-nothing'])
    const unk = read.sessions.find((s) => s.id === 'claude-code:unk')!
    const html = body(h(sp.SessionLineRow, { line: allLines()[4]!, now: NOW, placement: unk.placement }))
    expect(html).toContain('It has 1 link and touched 2 records')
  })

  /**
   * THE DEFECT THIS ONE PINS. A row whose placement cannot be read must not be drawn as a run that
   * nothing links — that would turn a gap in this page's reading into a finding about somebody's
   * records, which is the exact substitution this whole reader exists to refuse.
   */
  it('says it could not read a placement, rather than reporting the run as unplaced', () => {
    const raw = sessionsPayload()
    delete (raw.sessions[0] as Record<string, unknown>)['placement']
    const read = sp.readSessionsPayload(raw)
    // The row is kept: a session is not dropped for a field that only says where it is filed.
    expect(read.sessions).toHaveLength(6)
    const placement = read.sessions[0]!.placement
    expect(placement.kind).toBe('unassigned')
    expect(placement.kind === 'unassigned' && placement.sentence).toContain('could not read where this run is filed')
    expect(placement.kind === 'unassigned' && placement.reason.why).toBe('nothing-read')
    expect(read.problems.join(' ')).toContain('force-table collation')
    expect(read.problems.join(' ')).toContain('`placement`')
  })

  it('names a claim it could not read instead of quietly shortening the list', () => {
    const raw = sessionsPayload()
    const placement = (raw.sessions[3] as Record<string, unknown>)['placement'] as Record<string, unknown>
    placement['also'] = [{ project: null }]
    const read = sp.readSessionsPayload(raw)
    expect(read.sessions[3]!.placement.kind === 'in' && read.sessions[3]!.placement.also).toEqual([])
    expect(read.problems.join(' ')).toContain('1 of them could not be read')
  })

  it('reads what the placement was worked out from, and says nothing when the server did not', () => {
    expect(readSessions().placementRead.changes).toBe(40)
    expect(sp.readSessionsPayload({ sessions: [] }).placementRead).toEqual(sp.NO_PLACEMENT_READ)
  })
})

// ============================================================================ the three bands

describe('how prominent a state group is, which is not what it means', () => {
  it('gives every state group exactly one band, with none left out', () => {
    for (const key of sp.SESSION_GROUP_KEYS) expect(sp.SESSION_BANDS).toContain(sp.BAND_OF[key])
    expect(Object.keys(sp.BAND_OF).sort()).toEqual([...sp.SESSION_GROUP_KEYS].sort())
  })

  it('puts what died in the first band and what is alive in the second', () => {
    expect(sp.BAND_OF.crashed).toBe('action')
    expect(sp.BAND_OF.orphaned).toBe('action')
    // `idle` classifies as stopped short and still sits with `running`: it is alive, its row carries
    // the reason it is waiting, and it does not need the prominence of a run that died.
    expect(sp.BAND_OF.idle).toBe('alive')
    expect(sp.BAND_OF.running).toBe('alive')
  })

  it('folds “unknown” and “no state” with the finished runs without calling them finished', () => {
    for (const key of ['finished-written', 'finished-unwritten', 'unknown-judged', 'no-state', 'unclassified'] as const) {
      expect(sp.BAND_OF[key]).toBe('ended')
    }
    // The band's own words never say the work is done.
    expect(sp.BAND_WORDS.ended.label).not.toContain('finished')
    // And the claim that used to sit under that heading as an unmeasured paragraph — "going quiet
    // is not somebody confirming anything" — is still made, in the two places that carry it with
    // this page's own numbers. The paragraph went; the claim did not.
    const html = body(h(sp.ProjectBlock, { entry: groupsOf(allUnplaced(allLines()))[0]!, now: NOW, placements: new Map() }))
    expect(html).toContain('of these 4 were written down as finished')
    expect(html).toContain('1 of these 4 were written down as finished')
    // THE RULE BEHIND THE ARITHMETIC IS SAID ONCE, AT THE HEAD, AND NOT HERE. The clause "and are
    // drawn as their own groups below for that reason" was on this paragraph once per project
    // group — seven times on the owner's corpus — and the page head already carries the claim in
    // bold. What is left is the two numbers, which are the part that differs per group.
    expect(html).not.toContain('drawn as their own groups below for that reason')
    // Never the unmeasured restatement above it, which said the same thing with no count in it.
    expect(html).not.toContain('Nothing in here is asking for anything today')
  })

  it('keeps them apart as their own counted groups inside that fold', () => {
    const lines = allLines()
    const groups = groupsOf(allUnplaced(lines))
    const ended = groups[0]!.bands.find((band) => band.band === 'ended')!
    expect(ended.groups.map((group) => group.spec.key)).toEqual([
      'unknown-judged',
      'no-state',
      'unclassified',
      'finished-written',
    ])
    expect(ended.count).toBe(4)
  })
})

// ============================================================================ two levels of grouping

describe('every run is under one pipeline or module, and the counts balance', () => {
  // The fixture's own placements: the crashed run is linked to the gripper module, the idle one
  // wrote to the handover pipeline, and the other six are unplaced — which is the shape of a real
  // machine, where most runs were found in a log directory and never filed.
  const placed = () => {
    const lines = allLines()
    return { lines, groups: groupsOf(lines) }
  }

  it('puts every run in exactly one group, with nothing repeated and nothing lost', () => {
    const { lines, groups } = placed()
    const drawn = groups.flatMap((group) => group.lines)
    expect(drawn).toHaveLength(lines.length)
    expect(new Set(drawn.map((line) => line.id)).size).toBe(lines.length)
  })

  it('names the group that cannot be placed rather than guessing one for it', () => {
    const { groups } = placed()
    const unassigned = groups.find((group) => group.project === null)!
    expect(unassigned.lines).toHaveLength(6)
  })

  it('orders the groups by how much each needs a person, unassigned included', () => {
    const { groups } = placed()
    // The unassigned group holds the orphaned run, so it needs a person the most and leads. That is
    // deliberate: sorting it to the foot for being untidy would put a crashed run at the bottom.
    expect(groups[0]?.project).toBeNull()
    const needs = groups.map((group) => group.counts.action)
    expect([...needs]).toEqual([...needs].sort((a, b) => b - a))
  })

  it('counts each band once, and the bands add up to the group', () => {
    for (const group of placed().groups) {
      const summed = sp.SESSION_BANDS.reduce((sum, band) => sum + group.counts[band], 0)
      expect(summed).toBe(group.lines.length)
    }
  })

  it('says on the group heading how many need you, are alive, and have ended', () => {
    const gripper = placed().groups.find((group) => group.project?.id === 'mod-gripper')!
    expect(sp.projectTally(gripper)).toBe('1 need you')
  })
})

describe('a project group with nothing alive in it is folded', () => {
  const quiet = () => {
    const lines = allLines()
      .filter((line) => line.state === 'finished' || line.state === 'unknown')
      .map((line) => (line.recordId === 'rec-done' ? { ...line, placement: filedUnder(GRIPPER) } : line))
    return groupsOf(lines)
  }

  it('folds it and keeps its runs inside the fold', () => {
    const gripper = quiet().find((group) => group.project?.id === 'mod-gripper')!
    expect(gripper.counts.action + gripper.counts.alive).toBe(0)
    const html = body(h(sp.ProjectBlock, { entry: gripper, now: NOW, placements: new Map() }))
    expect(html).toContain('<details')
    expect(html).toContain('Tray clamp')
  })

  it('names every state group behind the fold, with its own count, before it is opened', () => {
    const groups = groupsOf(allUnplaced(allLines()))
    const html = body(h(sp.ProjectBlock, { entry: groups[0]!, now: NOW, placements: new Map() }))
    expect(html).toContain('1 recorded as unknown')
    expect(html).toContain('1 with no state ever written')
    expect(html).toContain(`1 ${t('g6a.sessions.writtenDownAsFinishedByAPerson')}`)
    // Never the bare word. ScanRow and Explain throw on it; this is the fold this file writes itself.
    expect(html).not.toMatch(/>\s*(\d+\s+)?more\s*(…|\.\.\.)?\s*</i)
    // And the fold says how much of what it holds anybody actually confirmed, counted rather than
    // asserted: one of the four.
    expect(html).toContain('of these 4 were written down as finished')
  })
})

// ============================================================================ a long group folds
/**
 * Ninety-one of the hundred and one runs on this machine are Unassigned, so the group that is
 * honest about not knowing where a run belongs is also the group that sets the length of the page.
 * A state group is therefore allowed to keep its first rows and fold the rest — and it is allowed
 * ONLY because of the three conditions below, so all three are pinned here rather than trusted.
 *
 * What is NOT tested here: how tall the result is. That is a screenshot question and it was
 * measured that way, at 1440 and 390 in light and dark.
 */

describe('a state group longer than the limit keeps its first rows and folds the rest', () => {
  /** `n` orphaned runs, newest first, so the split is the one the page would make. */
  const many = (n: number, over: (i: number) => Partial<SessionLine> = () => ({})): SessionLine[] => {
    const base = allLines().find((line) => line.id === 'claude-code:orph')!
    return Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `orph-${i}`,
      title: `left behind ${i}`,
      lastOutputAt: `2026-08-0${(i % 7) + 1} 09:00:00`,
      ...over(i),
    }))
  }

  it('draws every row when the group is at the limit, and one over it', () => {
    // One row behind a control that costs a line to draw saves nothing and makes a reader press
    // something to see a single session.
    expect(sp.foldPastLimit(many(sp.ROWS_BEFORE_FOLD)).folded).toHaveLength(0)
    expect(sp.foldPastLimit(many(sp.ROWS_BEFORE_FOLD + 1)).folded).toHaveLength(0)
  })

  it('splits at the limit and keeps the order it was given', () => {
    const { shown, folded } = sp.foldPastLimit(many(20))
    expect(shown).toHaveLength(sp.ROWS_BEFORE_FOLD)
    expect(folded).toHaveLength(20 - sp.ROWS_BEFORE_FOLD)
    expect([...shown, ...folded].map((line) => line.id)).toEqual(many(20).map((line) => line.id))
  })

  it('names which tools the folded rows came from, with counts that add up to the fold', () => {
    const lines = [
      ...many(4, () => ({ tool: 'claude-code' })),
      ...many(2, () => ({ tool: 'aider' })),
      ...many(1, () => ({ tool: null })),
    ]
    const said = sp.namedTools(lines)
    expect(said).toBe('4 claude-code, 2 aider, 1 with no tool recorded')
    // The counts in the sentence are the whole list: a fold that named some of what is in it would
    // be the word "more" with extra steps.
    const summed = [...said.matchAll(/(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0)
    expect(summed).toBe(lines.length)
  })

  it('says how long ago the folded rows last spoke, and counts the ones it cannot date', () => {
    const dated = many(3).map((line, i) => ({ ...line, lastOutputAt: `2026-08-0${i + 1} 12:00:00` }))
    expect(sp.quietSpan(dated, NOW)).toBe('they last spoke between 5d and 7d ago')
    // A run Mole Office cannot date is never folded into a range of dates: that would be this page
    // inventing a time for it, and "no clock" is one of the commonest answers here.
    const mixed = [...dated, ...many(2, () => ({ lastOutputAt: null }))]
    expect(sp.quietSpan(mixed, NOW)).toContain('2 of them carry no clock at all')
    expect(sp.quietSpan(many(2, () => ({ lastOutputAt: null })), NOW)).toBe('2 of them carry no clock at all')
  })

  it('puts the exact count, the composition and every row itself behind one fold', () => {
    const group = { spec: sp.SESSION_GROUPS.find((s) => s.key === 'orphaned')!, lines: many(20) }
    const html = body(h(sp.SessionGroupBlock, { group, now: NOW }))
    expect(html).toContain('>20</span> ended without saying so')
    expect(html).toContain(`${20 - sp.ROWS_BEFORE_FOLD} of these 20 are folded`)
    expect(html).toContain(`${20 - sp.ROWS_BEFORE_FOLD} claude-code`)
    // EVERY ROW IS REACHABLE. Nothing is fetched to open the fold: all twenty titles are already
    // in the markup, which is the whole difference between folding and hiding.
    for (const line of many(20)) expect(html).toContain(line.title)
    // And never the bare word.
    expect(html).not.toMatch(/>\s*(\d+\s+)?more\s*(…|\.\.\.)?\s*</i)
  })
})

// ============================================================================ the shape of a group

describe('a group is drawn as a proportion as well as counted', () => {
  const groups = () => {
    const lines = allLines()
    return groupsOf(allUnplaced(lines))[0]!
  }

  it('gives every reading group the observed state word it is keyed on', () => {
    expect(Object.keys(sp.GROUP_STATE).sort()).toEqual([...sp.SESSION_GROUP_KEYS].sort())
    // The four `unknown` splits are splits of one observed word, and the two `finished` ones of
    // another. The strip is coloured by what was OBSERVED; the counts beside it name the splits.
    expect(sp.GROUP_STATE['no-state']).toBe('unknown')
    expect(sp.GROUP_STATE['unknown-judged']).toBe('unknown')
    expect(sp.GROUP_STATE['finished-unwritten']).toBe('finished')
  })

  it('draws one segment per state group and says every count in words for a screen reader', () => {
    const shape = groups().bands.flatMap((band) => band.groups)
    const html = body(h(sp.CompositionStrip, { groups: shape }))
    expect(html.split('sx-strip-seg').length - 1).toBe(shape.length)
    expect(html).toContain(sp.compositionSentence(shape))
    for (const group of shape) expect(html).toContain(`${group.lines.length} ${group.spec.label}`)
  })

  it('draws nothing where there is no proportion to draw', () => {
    // One state group is one full-width bar of one colour, which says nothing the heading has not
    // already said. A bar that says nothing is decoration, and this pass is meant to remove it.
    const one = groups().bands[0]!.groups.slice(0, 1)
    expect(body(h(sp.CompositionStrip, { groups: one }))).toBe('')
  })
})

// ============================================================================ scan first

describe('a row is one line closed and everything it has when opened', () => {
  const line = () => allLines().find((l) => l.id === 'claude-code:crash')!

  it('says how many recorded facts are inside, exactly, before it is opened', () => {
    const html = body(h(sp.SessionLineRow, { line: line(), now: NOW }))
    expect(html).toContain('what was recorded')
    // why crashed · what it was doing · what it was for · how it ended · where it ran · resume · log
    expect(html).toContain('>7 facts<')
  })

  it('counts the placement as one of those facts when there is one', () => {
    const placement: Placement = {
      kind: 'in',
      primary: {
        project: GRIPPER,
        evidence: { how: 'changed' },
        support: 1,
        sentence: 'The change log says this run wrote to the module “Tray clamp”.',
      },
      also: [],
    }
    const html = body(h(sp.SessionLineRow, { line: line(), now: NOW, placement }))
    expect(html).toContain('>8 facts<')
    expect(html).toContain('The change log says this run wrote to the module “Tray clamp”.')
  })

  it('keeps the whole reason sentence, one press away rather than on the row', () => {
    const html = body(h(sp.SessionLineRow, { line: line(), now: NOW }))
    // Still on the page, in full, and inside the fold — the summary is the only thing at rest.
    expect(html).toContain('the log ends on &quot;exit 137, out of memory&quot; and no process names this session.')
    expect(html).toContain('exit 137, out of memory while collating the force tables')
    expect(html.indexOf('px-scan-body')).toBeLessThan(html.indexOf('the log ends on'))
  })

  it('names every other pipeline or module a run reaches, rather than counting them away', () => {
    const placement: Placement = {
      kind: 'in',
      primary: {
        project: GRIPPER,
        evidence: { how: 'link', word: 'part of' },
        support: 1,
        sentence: 'A link joins this run and the module “Tray clamp” — from this run’s end it reads “part of”.',
      },
      also: [
        {
          project: HANDOVER,
          evidence: { how: 'changed' },
          support: 1,
          sentence: 'The change log says this run wrote to the pipeline “Transplant v2”.',
        },
      ],
    }
    const html = body(h(sp.SessionLineRow, { line: line(), now: NOW, placement }))
    expect(html).toContain('It also reaches 1 other pipeline or module')
    expect(html).toContain('the pipeline “Transplant v2”')
  })

  it('tells a reader why a run is unassigned, on the row, in words', () => {
    const placement: Placement = {
      kind: 'unassigned',
      reason: { why: 'not-filed' },
      sentence:
        'This run was found in an agent tool’s log directory and never filed as a record, so there is nothing that could carry a link or a change row.',
      howToPlace: 'POST /api/sessions/<id>/link {"toTitle":"…"}',
    }
    const html = body(h(sp.SessionLineRow, { line: line(), now: NOW, placement }))
    expect(html).toContain('never filed as a record')
  })

  it('draws a dimmed dash where a run has no clock, with "no clock" on it (wave 13y round 146; round 142 said it in words)', () => {
    const html = body(h(sp.SessionLineRow, { line: { ...line(), lastOutputAt: null }, now: NOW }))
    // The closed line's age cell alone: the opened row's own clock fact says it in words.
    const age = html.match(/<span class="px-scan-age">([\s\S]*?)<span class="px-scan-open">/)?.[1]
    expect(age).toBeDefined()
    // An empty time slot is ordinary emptiness, which is a dimmed dash and never a sentence. The words stay on the
    // dash, for hover and a screen reader.
    expect(seen(age!).trim()).toBe(t('absence.mark'))
    expect(age).toContain(`title="${t('g6a.sessions.noClock')}"`)
    expect(age).toContain(`<span class="px-sr">${t('g6a.sessions.noClock')}</span>`)
  })

  it('says its one sentence when the opened row has nothing else in it (wave 13y round 142)', () => {
    const bare: SessionLine = {
      ...line(),
      state: 'running',
      stateReason: null,
      doing: null,
      purpose: null,
      detail: null,
      cwd: null,
      workspace: null,
      recordedAgent: null,
      resumeCommand: null,
      logPath: null,
    }
    const html = body(h(sp.SessionLineRow, { line: bare, now: NOW }))
    const inside = html.match(/<p class="sx-line-bare">([\s\S]*?)<\/p>/)?.[1]
    expect(inside, 'the row is not bare').toBeDefined()
    expect(seen(inside!)).toBe(t('g6a.sessions.bareReason'))
  })

  it('names a run no reader answers to in words, not by the stored tool word (wave 13y round 142)', () => {
    // The server lists such a run under the tool `unrecorded`, and the tag showed that word as if it were a tool.
    const html = body(h(sp.SessionLineRow, { line: { ...line(), tool: NO_ADAPTED_TOOL }, now: NOW }))
    expect(seen(html)).toContain(t('g6a.sessions.noToolRecorded'))
    expect(html).not.toContain(`>${NO_ADAPTED_TOOL}<`)
  })
})

/**
 * WHY A RUN IS FILED WHERE IT IS, SAID ONCE PER PROJECT GROUP RATHER THAN ONCE PER ROW.
 *
 * MEASURED ON THE OWNER'S CORPUS, 15 August 2026, at 1440 in the panelx workspace: one 29-word
 * sentence — "This run was found in an agent tool's log directory and never filed as a record, so
 * there is nothing that could carry a link" — was inside 35 of the 61 rows, and a second 20-word
 * one inside 9 more. Every copy said the same thing about a different run. It was the largest
 * single block of repeated text left on the page after the labels were dealt with.
 *
 * IT IS THE RULE THE PAGE ALREADY USED FOR THE STATE REASON, applied to the other sentence the
 * server sends per row, and it is the SAME function — `groupNotes`, comparing by shape — so the
 * two cannot come apart. What a row keeps is what only that row says.
 */
describe('a placement sentence more than one row shares is said once, above them', () => {
  /** Six unplaced runs, all carrying the sentence a run with no record gets. */
  const notFiled: Placement = {
    kind: 'unassigned',
    reason: { why: 'not-filed' },
    sentence:
      'This run was found in an agent tool’s log directory and never filed as a record, so there is nothing that could carry a link or a change row.',
    howToPlace: 'POST /api/sessions/<id>/link {"toTitle":"…"}',
  }
  const sameReason = (lines: readonly SessionLine[]): SessionLine[] =>
    lines.map((line) => ({ ...line, placement: notFiled }))

  it('says it once with the number of rows it covers, and not inside those rows', () => {
    const lines = sameReason(allLines())
    const html = body(h(sp.ProjectBlock, { entry: groupsOf(lines)[0]!, now: NOW, placements: sp.placementsOf(lines) }))
    // The needle is the distinctive half of the server's sentence. "never filed as a record" alone
    // also appears in the not-filed tag's own tooltip, which is a different statement.
    const copies = html.split('log directory and never filed as a record').length - 1
    expect(copies).toBe(1)
    // And the one copy carries the arithmetic, so nothing is behind a claim with no number in it.
    // Every row says this sentence, so it is said as all of them, not as "8 of these 8".
    expect(html).toContain(t('g6a.sessions.allSayTheSameThing', { n: lines.length }))
    expect(html).not.toContain(`of these ${lines.length}`)
    expect(html).toContain('say the same thing')
  })

  it('leaves a sentence only one row says inside that row', () => {
    // Five share one sentence and the sixth has its own. The shared one moves up; the lone one
    // stays where a reader can check the claim about that run.
    const lines = sameReason(allLines())
    const mine = { ...lines[0]!, placement: nowhere }
    const mixed = [mine, ...lines.slice(1)]
    const html = body(h(sp.ProjectBlock, { entry: groupsOf(mixed)[0]!, now: NOW, placements: sp.placementsOf(mixed) }))
    expect(html.split('log directory and never filed as a record').length - 1).toBe(1)
    expect(html).toContain('no write in the change log names this run')
    // The lone sentence is NOT counted as shared, so nothing claims rows for it.
    expect(html.match(/<div class="sx-place-shared">([\s\S]*?)<\/div>/)?.[1]).not.toContain('1 of these')
  })

  it('counts two sentences that differ only in a number as one, and says the number varies', () => {
    // The server's per-row sentence is a formula with a measurement in it. Comparing them raw is
    // what put twenty-six near-identical lines on one page before this rule existed.
    const lines = allLines().map((line, i) => ({
      ...line,
      placement: {
        ...notFiled,
        sentence: `It has ${i} links and touched ${i} records, and not one of them is a pipeline or a module.`,
      } as Placement,
    }))
    const html = body(h(sp.ProjectBlock, { entry: groupsOf(lines)[0]!, now: NOW, placements: sp.placementsOf(lines) }))
    expect(html).toContain('say this, with a different number in each')
    expect(html.split('and not one of them is a pipeline or a module').length - 1).toBe(1)
  })

  /**
   * THREE OF THESE ABOVE THE ROWS IS A HEADING AND SIX IS A WALL.
   *
   * Photographed at 1440 on 15 August 2026 against the review database: five shared sentences
   * stacked over the Unassigned group, which is the repetition moved rather than removed. The cap
   * is the one this file already uses for the shared state reasons, and the fold says how many
   * sentences it holds and how many rows they cover — never a count with no content behind it.
   */
  it('shows three of them and folds the rest, with the sentences and the rows both counted', () => {
    const lines = allLines().map((line, i) => ({
      ...line,
      // Four distinct shapes across eight runs, so two go behind the fold.
      placement: { ...notFiled, sentence: `Reason number ${'x'.repeat((i % 4) + 1)} for this run.` } as Placement,
    }))
    const html = body(h(sp.ProjectBlock, { entry: groupsOf(lines)[0]!, now: NOW, placements: sp.placementsOf(lines) }))
    const said = html.split('say the same thing').length - 1
    expect(said).toBe(4)
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain(`${4 - sp.GROUP_NOTES_SHOWN} other sentence`)
    expect(html).toContain('about where these runs are filed, covering')
    // Never the bare word.
    expect(html).not.toMatch(/>\s*(\d+\s+)?more\s*(…|\.\.\.)?\s*</i)
  })
})

// ============================================================================ the machine

/** GET /api/resources/orphans with a sweep in which one process holds three ports. */
function sweepPayload() {
  return {
    orphans: [],
    unclaimed: {
      summary: '4 live things are running on this machine that no session claims.',
      searched: ['every listening socket on this machine — 21 sockets'],
      skipped: [],
      unchecked: [],
      resources: [
        {
          type: 'port',
          key: '19876',
          detail: `zotero-bin -app ${THE_TEST_FIXTURE_ROOT}/.local/opt/Zotero_linux-x86_64/app — 127.0.0.1:19876/tcp`,
          holder: { pid: 3816935, pgid: 2813, command: 'zotero-bin -app zotero', startedAt: '2026-07-22 08:00:00' },
          upFor: { seconds: 1468800, human: '17 days' },
          note: 'Port 19876 is held by pid 3816935, process group 2813, up 17 days. Kill it by hand: kill -TERM -2813',
        },
        {
          type: 'port',
          key: '23116',
          detail: `zotero-bin -app ${THE_TEST_FIXTURE_ROOT}/.local/opt/Zotero_linux-x86_64/app — 127.0.0.1:23116/tcp`,
          holder: { pid: 3816935, pgid: 2813, command: 'zotero-bin -app zotero', startedAt: '2026-07-22 08:00:00' },
          upFor: { seconds: 1468800, human: '17 days' },
          note: 'Port 23116 is held by pid 3816935, process group 2813, up 17 days. Kill it by hand: kill -TERM -2813',
        },
        {
          type: 'port',
          key: '23119',
          detail: `zotero-bin -app ${THE_TEST_FIXTURE_ROOT}/.local/opt/Zotero_linux-x86_64/app — 127.0.0.1:23119/tcp`,
          holder: { pid: 3816935, pgid: 2813, command: 'zotero-bin -app zotero', startedAt: '2026-07-22 08:00:00' },
          upFor: { seconds: 1468800, human: '17 days' },
          note: 'Port 23119 is held by pid 3816935, process group 2813, up 17 days. Kill it by hand: kill -TERM -2813',
        },
        {
          type: 'gpu',
          key: '118822',
          detail: 'python sim.py — holding 9042 MiB of GPU memory',
          holder: { pid: 118822, pgid: 118800, command: 'python sim.py', startedAt: '2026-07-29 09:12:00' },
          upFor: { seconds: 950400, human: '11 days' },
          note: 'Pid 118822 is holding 9042 MiB of GPU memory, up 11 days, and no session in the ledger claims it.',
        },
      ],
    },
    searched: ['the process table (/proc)'],
  }
}

const sweep = () => sp.readOrphansPayload(sweepPayload()).unclaimed

describe('the machine is grouped by the process holding it, not by the port', () => {
  it('writes the pid and the process group in the page language (wave 13y round 142)', () => {
    // They were typed into the line in English, so a page in any language read " · pid 3816935, process
    // group 2813". In the test language a word from the lists is marked, and a typed one is not.
    setWordLanguage('xx')
    try {
      const html = body(h(sp.MachineSurface, { unclaimed: sweep() }))
      expect(html).toContain(t('g6a.sessions.itsPid', { pid: 3816935 }))
      expect(html).toContain(t('g6a.sessions.itsProcessGroup', { pgid: 2813 }))
    } finally {
      setWordLanguage('en')
    }
  })

  it('reads the holder’s command and the age in seconds, which is the half a machine can sort on', () => {
    const read = sweep()!
    expect(read.resources[0]?.command).toBe('zotero-bin -app zotero')
    expect(read.resources[0]?.upSeconds).toBe(1468800)
    // And nothing new is complained about: a missing command is drawn, not reported.
    expect(sp.readOrphansPayload(sweepPayload()).problems).toEqual([])
  })

  it('turns four resources into two holders, oldest first', () => {
    const groups = sp.groupByHolder(sweep()!.resources)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.pgid).toBe(2813)
    expect(groups[0]?.resources).toHaveLength(3)
    expect(groups[1]?.pgid).toBe(118800)
    expect(groups.map((g) => g.upFor)).toEqual(['17 days', '11 days'])
  })

  it('drops an exact repeat of the holder command from each thing it holds, and keeps the whole on the title', () => {
    expect(sp.heldDetail('zotero-bin -app zotero — 127.0.0.1:19876/tcp', 'zotero-bin -app zotero')).toBe(
      '127.0.0.1:19876/tcp',
    )
    // Nothing is touched when the detail does not start with the command.
    expect(sp.heldDetail('something else entirely', 'zotero-bin -app zotero')).toBe('something else entirely')
    expect(sp.heldDetail(null, 'zotero-bin')).toBeNull()
  })

  it('says what one holder holds, in words, rather than repeating the type on every row', () => {
    const groups = sp.groupByHolder(sweep()!.resources)
    expect(sp.holdsPhrase(groups[0]!.resources)).toBe('3 ports')
    expect(sp.holdsPhrase(groups[1]!.resources)).toBe('1 GPU allocation')
  })

  it('groups a resource with no holder at all on its own, rather than dropping it', () => {
    const bare = { ...sweep()!.resources[0]!, pid: null, pgid: null, command: null }
    const groups = sp.groupByHolder([bare])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.command).toBeNull()
  })

  it('heads the surface with its count and keeps every row’s own sentence', () => {
    const html = body(h(sp.MachineSurface, { unclaimed: sweep() }))
    // One heading, counted in processes as well as in things.
    expect(html).toContain('4 resources running that no session claims, held by 2 processes')
    // And the server's own sentence for each row is kept, behind a fold that counts them.
    expect(html).toContain('The server&#x27;s own sentence for each of these 3')
    expect(html).toContain('kill -TERM -2813')
  })

  // The sweep's own sentence is the server's note, drawn once for a developer.
  it('draws the sweep’s own sentence once, as the server’s note', () => {
    const html = body(h(sp.MachineSurface, { unclaimed: sweep() }))
    const note = /<p class="px-server-note">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? null
    expect(note).toBe('4 live things are running on this machine that no session claims.')
    expect(html.split('4 live things are running on this machine that no session claims.').length - 1).toBe(1)
  })

  it('says the machine was not swept, rather than drawing a clean bill of health', () => {
    const html = body(h(sp.MachineSurface, { unclaimed: null }))
    expect(html).toContain(t('g6a.sessions.thisReplyDoesNotSayWhatIsRunning'))
  })

  /**
   * THE TWO ANSWERS ARE DRAWN AT DIFFERENT WEIGHTS, AND WHICH ONE IS LOUD IS THE WHOLE POINT.
   *
   * "The unclaimed sweep has no resources list" is an absence a reader must act on: the question
   * this surface exists to answer was not answered, and five orphaned-process incidents on this
   * project began with a machine that looked clean because nobody had looked. It keeps a whole
   * sentence, at the must-act-on tier.
   *
   * "The sweep ran and found none" is an absence a reader does nothing about. It goes quiet — but
   * it must stay TELLABLE from the first, which is the fifth invariant, so it is drawn at the
   * told-apart tier rather than as a blank or as the same mark. This test pins both.
   */
  it('pays a whole sentence for the sweep that did not happen, and a mark for the one that found none', () => {
    const missing = body(h(sp.MachineSurface, { unclaimed: null }))
    const clear = body(h(sp.MachineSurface, { unclaimed: { ...sweep()!, resources: [] } }))

    // MUST ACT ON: the loud absence, with every word of the reason on the screen.
    expect(missing).toContain('data-tier="must-act-on"')
    expect(missing).toContain(
      `${t('g6a.sessions.theRunningOnThisMachineListAnsweredWithout')} ${t('g6a.sessions.unclaimed')} ` +
        t('g6a.sessions.sweepSoNothingHereCanTellYouWhether2'),
    )

    // TOLD APART, AND QUIET: a mark, not a sentence, and it says somebody looked.
    expect(clear).not.toContain('data-tier="must-act-on"')
    expect(clear).toContain('class="px-absent"')
    // SOMEBODY LOOKED, and it says so in words a reader sees (wave 13y round 142; it was a dash). A gap
    // nobody has closed is drawn dashed. A clean sweep coming back dashed would say nobody swept when the
    // ledger did.
    expect(seen(clear)).toContain(t('g6a.sessions.nothingUnclaimed'))
    expect(clear).not.toContain('data-edge="dashed"')
    // The sweep's own sentence survives on the mark rather than being deleted — the SERVER's
    // words when it sent any, which is what this fixture carries.
    expect(clear).toContain(sweep()!.summary!)
    // And Mole Office's own words when it did not, so the answer is never a bare mark.
    const noSummary = body(h(sp.MachineSurface, { unclaimed: { ...sweep()!, resources: [], summary: null } }))
    expect(noSummary).toContain(t('g6a.sessions.theSweepReadThisMachineAndFoundNothing'))
    // AND IT IS NOT A BLANK. The one failure this rule exists to prevent is an empty cell reading
    // as "there are none" when the truth is "nobody looked", so both answers draw something.
    expect(/<p class="sx-unclaimed-clear">\s*<\/p>/.test(clear)).toBe(false)
  })

  it('folds the holders past the sixth, saying exactly how many and what they hold', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...sweep()!.resources[3]!,
      key: String(200000 + i),
      pid: 200000 + i,
      pgid: 200000 + i,
      upSeconds: 1000 - i,
    }))
    const html = body(h(sp.MachineSurface, { unclaimed: { ...sweep()!, resources: many } }))
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain('3 more holding processes, holding 3 GPU allocations')
    // The count is exact and the content is named. Never the bare word "more".
    expect(html).not.toMatch(/>\s*more\s*</)
  })
})

// ============================================================================ the page

describe('the sessions page', () => {
  const view = (over: Partial<Parameters<PG['SessionsView']>[0]> = {}) =>
    body(
      h(pg.SessionsView, {
        lines: allLines(),
        orphans: readOrphans().orphans,
        unclaimed: sweep(),
        problems: [],
        now: NOW,
        read: readAt,
        onRelease: neverReleases,
        onReread: neverRereads,
        ...over,
      }),
    )

  /** The one paragraph that says where the machine stands, without the tags. */
  const machineLine = (html: string) =>
    (html.match(/<p class="sx-machine-line"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')

  it('shows all six state words, with runs on file and with none', () => {
    // The words a reader sees, which for two of the six is not the stored word: `idle` shows as
    // "waiting for you" and `orphaned` as "left running", from the product's one display table.
    for (const html of [view(), view({ lines: [], orphans: [] })]) {
      for (const word of ['running', 'waiting for you', 'finished', 'crashed', 'left running', 'unknown']) {
        expect(html).toContain(`</b> ${word}`)
      }
    }
    expect(view({ lines: [], orphans: [] })).toContain('No agent runs are on file.')
  })

  it('links a row to its record, and leaves an unfiled session unlinked rather than broken', () => {
    const html = view()
    expect(html).toContain('href="#/r/rec-crash"')
    // The orphaned session has no recordId in the payload, so there is no record page for it.
    expect(html).not.toContain('claude-code%3Aorph')
  })

  it('shows what a dead session left running, with its age', () => {
    const html = view()
    expect(html).toContain('pid 3302512, group 3302496')
    expect(html).toContain('10d')
    // The session is named as a session, so a title such as "A window of the office" reads right.
    expect(html).toContain('left by the session “seed rewrite”')
  })

  it('names the session that left something running as a session in Chinese too', async () => {
    const { setWordLanguage } = await import('@shared/i18n.ts')
    setWordLanguage('zh')
    try {
      expect(view()).toContain('由会话“seed rewrite”留下')
    } finally {
      setWordLanguage('en')
    }
  })

  it('prints the server’s warning about its own blindness', () => {
    expect(view({ warnings: ['The processes on this machine could not be listed.'] })).toContain('could not be listed')
  })

  it('prints what it could not read, and keeps a broken record clickable', () => {
    const html = view({
      problems: ['sessions[3] has no id.', { text: 'The session record “x” cannot be read.', href: '/r/rec-x' }],
    })
    expect(html).toContain('sessions[3] has no id.')
    expect(html).toContain('href="#/r/rec-x"')
    expect(html).toContain('Open it')
  })

  it('says in its machine line which of the three answers the sweep gave', () => {
    // Swept and not clear.
    expect(machineLine(view())).toContain('4 resources running that no session claims, held by 2 processes')
    // Not swept: an unanswered question is not drawn as a clean bill of health.
    expect(machineLine(view({ unclaimed: null }))).toContain('does not say what is running unclaimed')
    // Swept and clear, without the alarm.
    const clear = machineLine(view({ unclaimed: { ...sweep()!, resources: [] }, orphans: [] }))
    expect(clear).toContain('nothing is running on it that no session claims')
    expect(clear).not.toContain('no session claims, held by')
  })

  it('counts every group exactly, and counts a group alone in its project in that project’s heading', () => {
    const html = view()
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain('1 crashed')
    // A GROUP ALONE IN ITS PROJECT HAS NO HEADING OF ITS OWN. The idle run is the only run filed under its pipeline,
    // so that pipeline's heading carries its count. A list at the head of the page counted every group until
    // November 2026, when the explanations were taken off the page, as decided.
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).not.toContain(`1 ${t('g6a.sessions.idle')}`)
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain(
      `${t('g6a.sessions.runCount', { n: 1 })} — 1 ${t('g6a.sessions.aliveRightNow')}`,
    )
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain('1 with no state ever written')
    expect(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toContain('1 recorded as unknown')
  })

  it('states the arithmetic of what needs a person and what folding cost', () => {
    const html = view()
    // Plan 7FEOshq3mBGG keeps this arithmetic in one translated sentence.
    expect(html).toContain('8 in 3 groups · 2 need you · 2 still going · 4 ended or unconfirmed')
    // No whole group is folded here, so the including clause is left out rather than spelling out two zeros.
    expect(html).toContain(t('g6a.sessions.foldedEndedNoGroups', { n: 4 }))
    expect(html).not.toContain(t('g6a.sessions.foldedEnded', { n: 4, rows: 0, groups: 0 }))
  })

  it('heads the one group it can honestly draw with the name the reader is owed', () => {
    const html = view()
    expect(html).toContain('Unassigned sessions')
    expect(html).toContain('no pipeline or module')
  })

  it('keeps the resume command whole, and a fold that names and counts what it holds', () => {
    const html = view()
    expect(html).toContain(`cd &#x27;${THE_TEST_FIXTURE_ROOT}/proj_1st_baseline&#x27; &amp;&amp; claude --resume crash`)
    expect(html).toContain('the resume command')
    // EACH ROW'S FOLD NAMES WHAT IT HOLDS, AND COUNTS IT. A list at the head of the page named what a row can hold,
    // how it ended among them, until November 2026, when the explanations were taken off the page, as decided.
    expect(html).toContain(`<span class="px-scan-opens">${t('g6a.sessions.facts')}</span>`)
    expect(html).toMatch(new RegExp(`<span class="px-scan-holds num">\\d+ ${t('g6a.sessions.factCount')}</span>`))
    expect(html, 'and the list at the head of the page is gone').not.toContain(t('g6a.sessions.howItEnded'))
    expect(html).toContain('exit 137, out of memory while collating the force tables')
  })

  it('says on each row that it carries no resume command and no log path', () => {
    // Three crashed rows, none of which can be resumed. The group's count of them at the head of the
    // page was taken off in November 2026, as decided, so each row says it for itself.
    const crashed = allLines()[0]!
    const html = view({
      lines: [crashed, { ...crashed, id: 'c2' }, { ...crashed, id: 'c3' }].map((line) => ({
        ...line,
        resumeCommand: null,
        logPath: null,
      })),
    })
    expect(html.split('class="sx-cmd-missing"').length - 1).toBe(6)
    expect(html).toContain(t('g6a.sessions.noResumeCommand'))
    expect(html).toContain(t('g6a.sessions.noLogPath'))
  })

  it('shows the machine on its own surface, at the foot, grouped by holder', () => {
    const html = view()
    expect(html).toContain('This machine')
    expect(html).toContain('held by 2 processes')
    // The runs come first; the machine is its own panel after them.
    //
    // BOTH PANELS ARE ASSERTED PRESENT BEFORE THEIR ORDER IS. `indexOf` answers -1 for a string
    // that is not on the page, and -1 is less than every real position, so an order test written
    // as one comparison passes when the panel it is about has been deleted. This one measured
    // nothing until the name it looked for changed and the comparison went on passing.
    const runs = html.indexOf('Every run on file')
    const machine = html.indexOf(t('g6a.sessions.runningAndNobodyClaimsIt'))
    expect(runs, 'the panel holding the runs is not on the page').toBeGreaterThan(-1)
    expect(machine, 'the machine panel is not on the page').toBeGreaterThan(-1)
    expect(runs).toBeLessThan(machine)
  })

  it('opens with the page name in an h1, the same as every other page', () => {
    // It opened with a paragraph and no heading, so it read as a page whose title had failed to
    // render and a screen reader had no landmark to jump to.
    //
    // "AGENT RUNS", AND IT SAID "SESSIONS" UNTIL THIS PASS. The rail row that opens this page, this
    // heading and the count line below it are one name now. This line is what fails
    // when the heading moves and nobody meant it to.
    expect(view()).toContain('<h1 class="sx-page-title" data-title-is="its-label">Agent runs</h1>')
  })

  it('keeps the alarm panel for the machine for the two cases that earn it, and not for the third', () => {
    // Approved decision 2. Five processes nobody wrote down is the normal Tuesday on a developer's
    // machine; it is worth reading and it is neither urgent nor overdue, so it does not get the
    // colour that means somebody must act now. The two that do:
    //   - something a session REGISTERED has outlived it: a failure with an owner.
    //   - the sweep did not answer: the silence this whole feature exists to break.
    const swept = view({ orphans: [] })
    expect(swept).toContain('This machine')
    expect(swept).not.toContain('data-rank="0"')

    expect(view()).toContain('data-rank="0"')
    expect(view({ orphans: [], unclaimed: null })).toContain('data-rank="0"')
  })

  it('lists an orphan on the machine surface and again inside the session that left it', () => {
    const html = view()
    const hits = html.split('class="sx-orphan-label wrap-anywhere"').length - 1
    // The process under "seed rewrite" and in the ledger block, and the homeless lock once.
    expect(hits).toBe(3)
  })

  it('calls out an orphan no session on the page claims', () => {
    const html = view()
    expect(html).toContain(t('g6a.sessions.notClaimedCount', { n: 1 }))
  })

  /**
   * The count is the page's; the reason is the row's.
   *
   * The paragraph under the orphan list used to name both reasons a release button can be missing
   * — the server could not describe the kill, or it is a lock file — and then say "each row says
   * which". Each row does say which, in full, in the place the button would have been, so the page
   * was printing a summary of what was already open on the screen underneath it. What a reader
   * cannot get by looking is HOW MANY of the orphans above are in that position, so that is what
   * the paragraph keeps. This pins both halves: the count, and the safety note still whole on the
   * row it belongs to.
   */
  it('counts the orphans it cannot release, and leaves the reason on the row', () => {
    const html = view()
    expect(html).toContain(t('g6a.sessions.noReleaseButtonCount', { n: 1 }))
    // The lock file's own sentence, whole, on the page — not only in the component's own test.
    expect(html).toContain('Mole Office never deletes lock files, and this is one.')
    expect(html).toContain('lets a second copy start on the same data')
    // And the page does not restate the row's reason on its own account.
    expect(html.split('which Mole Office never deletes').length - 1).toBe(0)
  })

  /**
   * "No orphans" is said ONCE, by the panel's corner, and the panel's foot draws nothing (wave 13y round 146).
   *
   * The three sentences it used to print are a fact a reader does nothing about — the ledger was
   * read and nothing registered has outlived its session. Round 142 drew them as a lone "none" at the
   * foot, under a corner that already says "0 orphaned". What may never go is the distinction the
   * fifth invariant is about: this is "somebody looked and there are none", and it must not read the
   * same as "nobody looked". The corner's count says that. The sentence a screen reader read was taken off the page in
   * November 2026, as decided.
   */
  it('says no orphans once, in the corner, and draws nothing at the foot', () => {
    const html = view({ orphans: [] })
    // The corner's count, with the white space React leaves between its parts.
    expect(seen(html).replace(/\s+/g, ' ')).toContain(`0 ${t('g6a.sessions.orphaned')}`)
    // Somebody LOOKED, so the page never says nobody did.
    expect(html).not.toContain('not looked at')
    expect(html).not.toContain('No orphans:')
    expect(html).not.toContain('Nothing is left running')
    // The foot draws no mark: no "none" and no dash under the corner's count.
    expect(html).not.toContain('<p class="sx-empty">')
  })

  it('prints what could not be read in its own panel rather than dropping it', () => {
    const html = view({ problems: ['orphans[0] has no `describe`.'] })
    expect(html).toContain('Not readable')
    expect(html).toContain('orphans[0] has no `describe`.')
  })

  it('says where the unreadable parts came from in the page language (wave 13y round 142)', () => {
    // The panel's eyebrow was typed in English. In the test language a word from the lists is marked.
    setWordLanguage('xx')
    try {
      const html = view({ problems: ['orphans[0] has no `describe`.'] })
      expect(html).toContain(t('g6a.sessions.fromTheSessionsListAndTheMachineSweep'))
    } finally {
      setWordLanguage('en')
    }
  })

  /**
   * THE FACTS INSIDE A ROW SAY THEIR ABSENCE AS A MARK, AND THE SENTENCE SURVIVES ON IT.
   *
   * Measured at 1440 in the panelx workspace on 15 August 2026: "not recorded — anything below
   * that names a directory may not be the one you expect" was in the markup eleven times and "not
   * recorded, so how long has it been quiet cannot be answered for this one" nine times. Neither
   * is a thing a reader acts on. Both had to stay tellable from "there is nothing to record", so
   * both are `Absence` at the told-apart tier with `looked` false: nobody wrote it down.
   *
   * WHAT THIS FAILS ON. A blank cell, a dropped sentence, or the looked-and-found-none drawing
   * being used for a gap somebody could go and close.
   */
  it('says a missing working directory as a told-apart mark, keeping the sentence on it', () => {
    const html = view({ lines: allLines().map((line) => ({ ...line, cwd: null, workspace: null })) })
    // The word a reader sees.
    expect(html).toContain('not recorded')
    // The sentence, whole, on the mark and read out by a screen reader.
    expect(html).toContain(t('g6a.sessions.nobodyRecordedWhereThisRunWorkedSoAny'))
    // NOBODY LOOKED, not looked-and-there-are-none: the dashed edge is the gap somebody can close.
    expect(html).toContain('data-edge="dashed"')
    // And it is not a sentence in the value any more.
    expect(html).not.toContain('>not recorded — anything below')
  })

  /**
   * WHERE IT RAN, WHEN NO DIRECTORY WAS OBSERVED, is a name plus a mark rather than a value with
   * a ten-word parenthetical glued inside it. That parenthetical was in the markup thirteen times.
   */
  it('marks a workspace NAME as a name, instead of writing the caveat into the value', () => {
    const named = allLines().map((line) => ({
      ...line,
      cwd: null,
      workspace: { name: 'panelx', from: 'recorded' as const, path: null },
    }))
    const html = view({ lines: named })
    expect(html).toContain('no directory observed')
    expect(html).toContain('No working directory was observed for this run.')
    // The old shape, which put the explanation inside the value on every such row.
    expect(html).not.toContain('panelx (the project named on the record')
  })

})
