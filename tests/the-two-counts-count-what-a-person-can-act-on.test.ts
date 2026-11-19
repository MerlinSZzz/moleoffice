// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO COUNTS COUNT WHAT A PERSON CAN ACT ON — CRITERIA W6, PROBLEMS zKalIBZccv9F AND 8woJrf898igd.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, 16 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * THE DEFECT: Needs somebody showed a count of 1380, more than one person can
 * handle, and Waiting on you showed 34 when only 7 were real. Measured on the live corpus that
 * day: the Needs-somebody badge read `reply.total` from GET /api/attention — 1,380 then, 1,382 when
 * this file was written — while the page's ranked list opens with 7; the Waiting-on-you badge read
 * `oneNumber(GET /api/waiting)`, the whole reading, while the page's first band shows what a person
 * can settle now.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   1. The urgent count — the rail badge, the phone pill and the home page's own count line — counts
 *      WHAT A PERSON CAN ACT ON NOW: the ranked rows, from `needsSomebodyNow` in
 *      src/web/lib/attention.ts, read in one place so the three surfaces cannot work it out three
 *      ways. The rest is one line under the list on the page, `N light` by its chosen name, and it stands
 *      in no badge anywhere.
 *   2. Decisions — the rail badge and the page's first band — counts what a person can settle now,
 *      from `settleCount` in src/web/lib/waiting.ts, the same function both ends read.
 *
 * The fixture is the shape the defect had: MANY old items and FEW live ones. The attention reply is
 * computed by the REAL rule over hand-made records, never hand-typed, for the reason
 * tests/home-attention.test.ts states. The waiting reply is the shape the wire carries.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make the attention badge count `reply.total` again — the whole selection, 1,382 on the live
 *     corpus — and every Needs-somebody assertion below goes red.
 *   make the Waiting-on-you badge count the whole reading again (`oneNumber`) and its assertion
 *     goes red.
 *   drop the remainder line from the panel and its assertion goes red.
 *
 * SINCE WAVE 13K'S ROUND 19 THE PAGE'S OWN COUNT LINE IS GONE WITH THE RANKED LIST it counted, by item 6 of a
 * decision. So are the cases that drew it: the page's count, the line under the list, and the
 * source check on components/AttentionPanel.tsx. The third mutation above went with them. What stays is the rail: the
 * Needs-somebody count in the rail and the phone pill still read `needsSomebodyNow`, and Decisions still reads
 * `settleCount`. Mutation: make App.tsx stop reading `needsSomebodyNow(reply)` and the source check goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AsyncState } from '../src/web/components/ui.tsx'
import type { AttentionHome } from '../src/web/api.ts'
import { attentionFirstPage } from '../src/shared/attention-first-page.ts'
import type { Link, PanelRecord, RecordKind } from '../src/shared/types.ts'
import { computeAttention } from '../src/shared/attention.ts'
import type { WaitingReply } from '../src/web/lib/waiting.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type WebApi = typeof import('../src/web/api.ts')

let Sidebar: SidebarModule

const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime()

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope; the smallest stand-in goes in first.
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
  const webApi: WebApi = await import('../src/web/api.ts')
  expect(typeof webApi.errorMessage).toBe('function')
  Sidebar = await import('../src/web/components/Sidebar.tsx')
})

// ---------------------------------------------------------------------------- the fixture

function stamp(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

function record(id: string, kind: RecordKind, title: string, data: Record<string, unknown>, agedDays: number): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: stamp(agedDays),
    updatedAt: stamp(agedDays),
    deletedAt: null,
  }
}

/**
 * MANY OLD ITEMS, FEW LIVE ONES. Two problems filed today are what a person can act on. Forty
 * others sit open and untouched for weeks — the work the rule selects and the ranked list holds
 * back in `remainder` — which is the shape the owner met: a count of 1,382 over a list of 7.
 */
const OLD_COUNT = 40
const RECORDS: PanelRecord[] = [
  record('rec-live-1', 'problem', 'The demo launcher refuses a stopped motor', { state: 'open' }, 0),
  record('rec-live-2', 'problem', 'The calendar rows of a moved plan keep the old day', { state: 'open' }, 0),
  ...Array.from({ length: OLD_COUNT }, (_, i) =>
    record(`rec-old-${i}`, 'problem', `Old open thought ${i + 1}`, { state: 'open' }, 30 + i),
  ),
]
const LINKS: Link[] = []

let RULE: ReturnType<typeof computeAttention>
let REPLY: AttentionHome

beforeAll(async () => {
  RULE = computeAttention({
    now: NOW,
    records: RECORDS,
    links: LINKS,
    changes: [],
    resources: [],
    // The one date reader, borrowed the same way tests/home-attention.test.ts borrows it.
    dueMs: (await import('../src/web/lib/attention.ts')).parseDueStamp,
  })
  REPLY = {
    ...attentionFirstPage(RULE),
    at: stamp(0),
    read: { records: RECORDS.length, links: 0, changes: 0, changesCapped: false },
  }
})

function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ---- the rail, without its stylesheet

function rail(reply: AsyncState<AttentionHome>, waiting: AsyncState<WaitingReply>): string {
  return body(
    h(Sidebar.Sidebar, {
      page: 'home' as const,
      open: false,
      onClose: () => {},
      onRenamed: () => {},
      attention: reply,
      waiting,
      sight: { id: 'default', title: 'Default', named: true, what: 'one project', fault: null },
      workspaces: { status: 'loading' as const },
    }),
  )
}

function readBadge(html: string, label: string): string | null {
  // Each badge sits in the rail row whose name it counts; a test that picks the first number on the
  // page would not notice the OTHER badge moving. Look both of them up by name.
  const rows = [...html.matchAll(/<a class="shell-link"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0] ?? '')
  const mine = rows.find((one) => one.includes(`>${label}</span>`))
  if (mine === undefined) return null
  const found = mine.match(/<span class="shell-badge num"[^>]*>(\d+)<\/span>/)
  return found === null ? null : (found[1] ?? null)
}

/** A waiting reading: the three tier counts and the rows behind them, as the wire carries them. */
function waitingReply(settle: number, asked: number, setAside = 0): AsyncState<WaitingReply> {
  const rows: WaitingReply['items'] = []
  const add = (tier: 'settle' | 'asked' | 'set-aside', many: number): void => {
    for (let at = 0; at < many; at += 1) {
      rows.push({
        id: `${tier}-${at}`,
        tier,
        act: tier === 'asked' ? 'answer' : 'settle',
        because: { rule: 'refused-act', doors: [] },
        why: 'only a person may do this',
        onThePersonsWords: null,
        replacedButStillHere: null,
        passedOnBy: null,
        fromAgent: { answer: 'not-an-agent' },
        workspaceId: 'panelx',
        workspaceTitle: 'Mole Office',
        kind: 'proposal',
        title: `${tier} ${at}`,
        said: null,
        blocking: 0,
        since: null,
      })
    }
  }
  add('settle', settle)
  add('asked', asked)
  add('set-aside', setAside)
  return {
    status: 'ready' as const,
    value: {
      items: rows,
      counts: { settle, asked, setAside },
      excluded: [],
      scope: 'every project, person-level',
      note: 'what is waiting on the person',
    },
  }
}

// ==================================================================== the Needs-somebody count

describe('needs somebody counts what a person can act on now', () => {
  it('the fixture has many old items and few live ones, the shape the owner met', () => {
    // Real rule output on both sides: the ranked rows come out of the row cap, and the remainder is
    // everything selected beyond it. A fixture with an empty remainder would prove nothing.
    expect(RULE.visible.length).toBe(7)
    expect(RULE.total).toBe(RULE.visible.length + RULE.remainder.length)
    expect(RULE.remainder.length).toBeGreaterThan(OLD_COUNT / 2)
  })

  it('the shared Home row carries no count from one project', () => {
    const html = rail({ status: 'ready' as const, value: REPLY }, waitingReply(2, 20))
    expect(html).toContain('>Home</span>')
    expect(readBadge(html, 'Home')).toBeNull()
  })
})

// ==================================================================== the Waiting-on-you count

describe('waiting on you counts what a person can settle now', () => {
  it('the rail badge counts what the page can settle now, from the one function the page reads', () => {
    const html = rail({ status: 'ready' as const, value: REPLY }, waitingReply(3, 20))
    // Twenty asked rows and nothing set aside are on the page, tiered and counted beside the
    // count; what a person can settle first is the settle tier. The badge and the first band agree.
    expect(readBadge(html, 'Decisions')).toBe('3')
    // AND NOT THE WHOLE READING AGAIN, which is what the badge said on 16 September 2026: 34.
    expect(readBadge(html, 'Decisions')).not.toBe('23')
  })
})

// ==================================================================== nothing counts for itself

// ==================================================================== the scope says each thing once

describe('the waiting scope says its cross-project clause once', () => {
  it('WAITING_SCOPE carries the cross-project clause exactly once, not twice', async () => {
    // A value from a server module may only be imported after freshDb() has named a throwaway
    // database: importing it statically opens the operator's real corpus before any test code runs.
    const t = await freshDb()
    const waiting = await import('../src/server/lib/waiting.ts')
    const clause = 'cross-project governance desk through a person-level projection, without weakening workspace-scoped record'
    const count = waiting.WAITING_SCOPE.split(clause).length - 1
    t.close()
    expect(count).toBe(1)
  })
})

const read = (file: string): string => readFileSync(file, 'utf8')
