// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The change log, and the date filter over it.
 *
 * Mole Office has no daily pages. "What happened on Tuesday" is a query against `changes` with a
 * date range, so if that filter is off by an hour or a day, a whole class of the product is
 * wrong and nothing else would notice. That is why this has a file to itself.
 *
 * Timestamps are written by records.ts as 'YYYY-MM-DD HH:MM:SS' in LOCAL time. In that format
 * alphabetical order is the same as chronological order, which is what lets the range filter
 * be a plain string comparison in SQL.
 *
 * Local, not UTC, on purpose: a day has to mean the operator's day. These tests therefore
 * state times as local wall-clock, which is the only way a boundary test can mean anything.
 * Written in UTC, "the last second of Tuesday" lands on Wednesday during British Summer Time.
 */
import { join } from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANGE_OPS, LINK_TYPES, type Change } from '../src/shared/types.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, at, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
/** Each case works in its own project, so a day's log and a newest-two list hold only its own rows. */
let HERE = 'default'
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `changes-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: HERE, title: `Changes case ${String(caseNumber)}` })
})
afterEach(() => {
  // Put the clock back before the next test, whatever this one did to it.
  vi.useRealTimers()
})

/**
 * Pretend it is this moment. Only Date is faked — records.ts stamps every change with
 * `new Date()`, and nothing here waits on a timer, so faking anything else would only add
 * ways for the test to hang.
 */
function pretendItIs(local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`pretendItIs needs local wall-clock 'YYYY-MM-DD HH:MM:SS', got '${local}'`)
  const [, y, mo, d, h, mi, sec] = m
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)))
}

/** One UTC day as a range, the way a daily view would ask for it. */
const day = (d: string) => ({ workspaceId: HERE, since: `${d} 00:00:00`, until: `${d} 23:59:59` })

/**
 * A SESSION IN ANOTHER PROJECT IS NOT A NAME NOTHING ANSWERS TO.
 *
 * Moving a record between projects carries its history and deliberately leaves the session that
 * wrote it where it was — attribution is provenance, not ownership. So a change row can name a real
 * run this project does not hold. The server says so with matchedBy `elsewhere` and the project's
 * name, and keeps recordId and title null on purpose: this project may say WHERE the session is and
 * may not read into it.
 *
 * The page drew that as "no session record answers to this name", which is the one thing certainly
 * untrue about it. The server union and the web mirror had drifted, with nothing making them agree.
 */
describe('a change row whose session is filed in another project', () => {
  // src/web/lib/workspace.ts and src/web/api.ts both read window at module scope, so the component
  // cannot be imported without one. Same stand-in as the other web tests in this repository.
  beforeAll(() => {
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
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  })

  it('is named as elsewhere rather than as unresolved, and offers no link', async () => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    const row = { sessionId: 'sess-elsewhere' } as unknown as Parameters<typeof cl.sessionOf>[0]
    const block = [
      {
        stored: 'sess-elsewhere',
        recordId: null,
        title: null,
        matchedBy: 'elsewhere' as const,
        rows: 1,
        unresolved: false,
        elsewhereIn: 'robotics',
      },
    ]
    const name = cl.sessionOf(row, block)
    expect(name.at, 'a session filed elsewhere was drawn as unresolved').toBe('elsewhere')
    if (name.at !== 'elsewhere') throw new Error('unreachable')
    expect(name.project).toBe('robotics')
  })

  it('still calls a name nothing answers to unresolved, so the two stay apart', async () => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    const row = { sessionId: 'sess-gone' } as unknown as Parameters<typeof cl.sessionOf>[0]
    const block = [
      {
        stored: 'sess-gone',
        recordId: null,
        title: null,
        matchedBy: 'unresolved' as const,
        rows: 1,
        unresolved: true,
        elsewhereIn: null,
      },
    ]
    expect(cl.sessionOf(row, block).at).toBe('unresolved')
  })
})

describe('the date filter that replaces daily pages', () => {
  it('returns only the changes made on the day asked for', () => {
    pretendItIs('2026-07-29 08:15:00')
    const gripper = t.api.createRecord({ workspaceId: HERE, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })

    pretendItIs('2026-07-30 09:00:00')
    const wizard = t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'Run the rig_60mm wizard', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 17:45:00')
    t.api.updateRecord(gripper.id, { summary: 'v3 shell broke at effort 15' }, AGENT)

    pretendItIs('2026-07-31 10:00:00')
    t.api.updateRecord(wizard.id, { summary: 'blocked on the reprint' }, t.api.HUMAN)

    const tuesday = t.api.listChanges(day('2026-07-30'))
    expect(tuesday).toHaveLength(2)
    expect(tuesday.every((c) => c.at.startsWith('2026-07-30'))).toBe(true)
    expect(tuesday.map((c) => c.op).sort()).toEqual(['create', 'update'])

    // The days either side are untouched by that query.
    expect(t.api.listChanges(day('2026-07-29'))).toHaveLength(1)
    expect(t.api.listChanges(day('2026-07-31'))).toHaveLength(1)
    expect(t.api.listChanges(day('2026-08-01'))).toHaveLength(0)
  })

  it('includes a change at the very first and very last second of the day', () => {
    pretendItIs('2026-07-30 00:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'first thing', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 23:59:59')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'last thing', actor: t.api.HUMAN })

    expect(t.api.listChanges(day('2026-07-30'))).toHaveLength(2)
  })

  it('takes an open-ended since, for "everything since Monday"', () => {
    pretendItIs('2026-07-29 08:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'last week', actor: t.api.HUMAN })
    pretendItIs('2026-08-03 08:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'this week', actor: t.api.HUMAN })

    const since = t.api.listChanges({ workspaceId: HERE, since: '2026-08-01 00:00:00' })
    expect(one(since, 'change').newValue).toBe('this week')
  })

  it('returns newest first, so a day reads as a reverse-chronological log', () => {
    pretendItIs('2026-07-30 09:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'morning', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 14:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'afternoon', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 21:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'evening', actor: t.api.HUMAN })

    const rows = t.api.listChanges(day('2026-07-30'))
    expect(rows.map((c) => c.newValue)).toEqual(['evening', 'afternoon', 'morning'])
  })
})

describe('the rest of listChanges', () => {
  it('filters to one record', () => {
    const a = t.api.createRecord({ workspaceId: HERE, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const b = t.api.createRecord({ workspaceId: HERE, kind: 'module', title: 'Close-up camera', actor: t.api.HUMAN })
    t.api.updateRecord(a.id, { summary: 'reprint pending' }, AGENT)

    expect(t.api.listChanges({ workspaceId: HERE, recordId: a.id })).toHaveLength(2)
    expect(one(t.api.listChanges({ workspaceId: HERE, recordId: b.id }), 'change').op).toBe('create')
  })

  it('honours the limit, keeping the newest', () => {
    pretendItIs('2026-07-30 09:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'oldest', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 10:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'middle', actor: t.api.HUMAN })
    pretendItIs('2026-07-30 11:00:00')
    t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'newest', actor: t.api.HUMAN })

    const rows = t.api.listChanges({ workspaceId: HERE, limit: 2 })
    expect(rows).toHaveLength(2)
    expect(at(rows, 0, 'change').newValue).toBe('newest')
    expect(at(rows, 1, 'change').newValue).toBe('middle')
  })

  it('logs linking and unlinking against the record the link starts at', () => {
    const task = t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'Run the rig_60mm wizard', actor: t.api.HUMAN })
    const claim = t.api.createRecord({ workspaceId: HERE, kind: 'claim', title: 'Effort 12 grip force is enough', actor: AGENT })

    const { id } = t.api.createLink({ fromId: task.id, toId: claim.id, type: 'consumes', actor: t.api.HUMAN })
    const link = one(
      t.api.listChanges({ workspaceId: HERE, recordId: task.id }).filter((c) => c.op === 'link'),
      'link change row',
    )
    // The link row names the type in `field` and the other end in `newValue`, which is enough
    // to describe the event in a feed without joining back to the links table.
    expect(link.field).toBe('consumes')
    expect(link.newValue).toBe(claim.id)

    t.api.deleteLink(id, t.api.HUMAN, HERE)
    const unlink = one(
      t.api.listChanges({ workspaceId: HERE, recordId: task.id }).filter((c) => c.op === 'unlink'),
      'unlink change row',
    )
    expect(unlink.oldValue).toBe(claim.id)
  })

  it('keeps the agent session on every row an agent wrote', () => {
    const rec = t.api.createRecord({ workspaceId: HERE, kind: 'note', title: 'session output', actor: AGENT })
    t.api.updateRecord(rec.id, { summary: 'written by the same run' }, AGENT)

    const rows = t.api.listChanges({ workspaceId: HERE, recordId: rec.id })
    expect(rows).toHaveLength(2)
    expect(rows.every((c) => c.sessionId === 'sess-test')).toBe(true)
  })
})

// ============================================================================ one change row

/**
 * THE ROW ITSELF: components/ChangeLog.tsx, and the promise that it is the only one.
 *
 * ModuleView.tsx used to draw its own change list, RecordPage.tsx used to draw a third, and
 * ModuleView's note claimed "tests/changes.test.ts fails if a change row is rendered anywhere but
 * there" — describing a guard nobody had written. These are that guard, plus the checks the
 * removed ModuleView tests were making, moved to the component that draws the rows now.
 *
 * The last check is the one that would have caught what screenshots caught instead: ChangeLog
 * rendered eight class names — `changes`, `change-head`, `op`, `actor`, `actor-type`, `counter`,
 * `chg-field`, `chg-value` — that NOTHING in the app styled, so a record's history came out as a
 * wall of run-together words while every text assertion passed.
 */
describe('the app has one change row, and it is styled', () => {
  const change = (over: Partial<Change>): Change => ({
    id: 'c1',
    recordId: 'r1',
    origin: 'authored',
    op: 'update',
    actorType: 'agent',
    actorId: 'claude',
    sessionId: 'sess-1',
    field: 'summary',
    oldValue: 'before',
    newValue: 'after',
    at: '2026-08-07 10:00:00',
    ...over,
  })

  /** Markup with the hoisted <style> blocks taken out, so CSS cannot stand in as evidence. */
  const body = (el: ReactElement): string =>
    renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  let cl: typeof import('../src/web/components/ChangeLog.tsx')

  beforeAll(async () => {
    // ChangeLog reaches ui.tsx and router.tsx; router.tsx touches window on import.
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    cl = await import('../src/web/components/ChangeLog.tsx')
  })

  it('shows who, what and both sides of the change', () => {
    // WHO, BY THE NAME THE REGISTRY GIVES (criterion change, wave 13k round 34): the row names a writer as a
    // person knows them, from the registry the record page hands it; the stored handle is developer mode's.
    const registry = { people: [], agents: [{ id: 'changes-agent-row', handle: 'claude', name: 'Tamsin Reed' }] }
    const html = body(h(cl.ChangeLog, { changes: [change({})], sessions: [], participants: registry as never }))
    expect(html).toContain('Tamsin Reed')
    expect(html).toContain('summary')
    expect(html).toContain('before')
    expect(html).toContain('after')
  })

  /**
   * THE STORED ACTOR TYPE DOES NOT REACH THE READER.
   *
   * `actor_type` holds "human", "agent" and "system", and this row printed whichever one was
   * stored straight onto a tag. `actorTypeWord` in src/web/lib/words.ts is the one reader for those
   * three values — "person", "agent" and the product's own name — and the change row reads the
   * same function, so one write cannot be described two ways on two screens.
   *
   * BOTH HALVES ARE ASSERTED. That the reader's word is there, and that the stored word is not:
   * printing both would satisfy a check for either one on its own.
   */
  it('says who wrote it in the reader’s word and not in the column’s', () => {
    const person = body(
      h(cl.ChangeLog, { changes: [change({ actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id })], sessions: [] }),
    )
    expect(person).toContain('person')
    expect(person).not.toContain('human')

    const panelx = body(
      h(cl.ChangeLog, { changes: [change({ actorType: 'system', actorId: 'panelx' })], sessions: [] }),
    )
    // A system write stored before 1 October 2026 says "panelx", the product's earlier name; the word
    // on the tag is the product's name, so this cannot be satisfied by the id printed beside it.
    expect(panelx).toContain('Mole Office')
    expect(panelx).not.toContain('system')
  })

  it('folds a long value instead of dropping it, and keeps the whole thing on the title', () => {
    const long = 'x'.repeat(400)
    const html = body(h(cl.ChangeLog, { changes: [change({ newValue: long })], sessions: [] }))
    expect(html).toContain('…')
    expect(html).toContain(long) // still there in full, on the tooltip
  })

  it('names a change with no field rather than leaving the line empty', () => {
    const html = body(
      h(cl.ChangeLog, { changes: [change({ field: null, oldValue: null })], sessions: [] }),
    )
    expect(html).toContain('the record itself')
  })

  it('draws every op with a verb, so none of them renders as a bare word', () => {
    for (const op of CHANGE_OPS) {
      expect(cl.changeVerb(change({ op })), `no verb for ${op}`).not.toBe(op)
    }
  })

  it('says what a link is, in the word a person reads and not the stored one', () => {
    // The home page drew `linked (derived_from)` and `linked (relates_to)` in bold, at first paint
    // in normal mode at 1440 and at 390, one press inside the first fold of the first panel. The
    // readings were already declared in LINK_TYPES; this line built the words with a template.
    expect(cl.changeVerb(change({ op: 'link', field: 'derived_from' }))).toBe('linked (derived from)')
    expect(cl.changeVerb(change({ op: 'link', field: 'relates_to' }))).toBe('linked (relates to)')
    expect(cl.changeVerb(change({ op: 'unlink', field: 'part_of' }))).toBe('unlinked (part of)')
  })

  it('draws no underscore for any link type there is, on either op', () => {
    for (const type of Object.keys(LINK_TYPES)) {
      for (const op of ['link', 'unlink'] as const) {
        expect(cl.changeVerb(change({ op, field: type })), `${op} ${type}`).not.toContain('_')
      }
    }
  })

  it('reads a camel-case field key as words, and leaves a path with machinery in it alone', () => {
    expect(cl.changeVerb(change({ op: 'update', field: 'lastOutputAt' }))).toBe('changed last output at')
    expect(cl.changeVerb(change({ op: 'update', field: 'effort_hours' }))).toBe('changed effort hours')
    expect(cl.changeVerb(change({ op: 'update', field: 'parts[#p1].items[#i2].state' }))).toBe(
      'changed parts[#p1].items[#i2].state',
    )
    // A RENAME ROW CARRIES AN ARROW, and there are 92 of them in the owner's change log. Splitting
    // one on its full stops gives three pieces that are not field keys and read as nonsense.
    expect(cl.changeVerb(change({ op: 'update', field: 'data.agent -> data.runtime' }))).toBe(
      'changed data.agent -> data.runtime',
    )
  })

  /**
   * A PATH IS READ WHOLE OR NOT AT ALL.
   *
   * Recent changes drew `changed data.short forms.gist` for a write to a record's stored gist: one
   * path, with one of its three segments turned into English by a function written for a single
   * key. Half a translation reads as a typo rather than as either thing.
   */
  it('reads a path of plain keys as words, innermost first, dropping no segment', () => {
    expect(cl.changeVerb(change({ op: 'update', field: 'data.shortForms.gist' }))).toBe(
      'changed gist in short forms in data',
    )
    expect(cl.changeVerb(change({ op: 'update', field: 'data.state' }))).toBe('changed state in data')
    expect(cl.changeVerb(change({ op: 'update', field: 'data.context.target.kind' }))).toBe(
      'changed kind in target in context in data',
    )
    // `title` and `data.title` are two different fields of one record. A reading that left the
    // container off would print one name for both.
    expect(cl.changeVerb(change({ op: 'update', field: 'title' }))).toBe('changed title')
    expect(cl.changeVerb(change({ op: 'update', field: 'data.title' }))).toBe('changed title in data')
    // Developer detail is unchanged: the stored path, exactly.
    expect(cl.changeVerb(change({ op: 'update', field: 'data.shortForms.gist' }), 'inspect')).toBe(
      'changed data.shortForms.gist',
    )
  })

  it('shows the stored word in Developer mode, which is what the switch is for', () => {
    expect(cl.changeVerb(change({ op: 'link', field: 'derived_from' }), 'inspect')).toBe('linked (derived_from)')
    expect(cl.changeVerb(change({ op: 'update', field: 'lastOutputAt' }), 'inspect')).toBe('changed lastOutputAt')
  })

  it('styles every class name it renders, so nothing goes out with no rules at all', () => {
    const html = renderToStaticMarkup(
      h(cl.ChangeLog, {
        changes: [change({}), change({ id: 'c2', op: 'create', field: null, oldValue: null })],
        sessions: [
          { stored: 'sess-1', recordId: 'r9', title: 'a run', matchedBy: 'recordId', rows: 1, unresolved: false, elsewhereIn: null },
        ],
      }),
    )
    const rendered = new Set<string>()
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const name of (m[1] as string).split(/\s+/)) if (name) rendered.add(name)
    }
    // Everything ChangeLog invents starts `chg-`. Anything else is a class it BORROWED from a
    // component or from styles.css, which is the point: a borrowed class is already styled.
    const own = [...rendered].filter((c) => c.startsWith('chg-'))
    expect(own.length, 'ChangeLog rendered no class of its own; this test would prove nothing').toBeGreaterThan(3)
    const styles = cl.CHANGELOG_CSS
    const unstyled = own.filter((c) => !styles.includes(`.${c}`))
    expect(unstyled, `rendered with no CSS anywhere: ${unstyled.join(', ')}`).toEqual([])
  })
})
