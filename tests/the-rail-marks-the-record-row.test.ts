// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RAIL MARKS THE ROW A RECORD BELONGS TO, criterion E2 on the design report SLKHRVIOUI5-.
 *
 * A decision says: not one for every kind, only the very common ones not yet done, meaning
 * the report — the rail is the first piece. On a record page the
 * rail marked Everything for every record of every kind; this is the rule the design names as its
 * first piece and the symptom the owner sees first.
 *
 * WHAT IS BEING PROVED. On a record page the rail marks the row the record belongs to, worked out
 * from the record's own kind, and Everything marks the page only while the record's kind has not
 * been read. The row is named here by the same key the rail itself reads, and one fixture kind per
 * family is enough because the sweep below then walks every kind.
 *
 * WHY IT LOOKS LIKE THIS. The runner is `node`, with no DOM: the smallest stand-in for a window is
 * installed before the sidebar is imported, exactly as tests/shell-nav.test.ts and
 * tests/app-routes.test.ts do it, for the reason those files give.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { RECORD_KINDS, type RecordKind } from '../src/shared/types.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
let Sidebar: SidebarModule

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
  Sidebar = await import('../src/web/components/Sidebar.tsx')
})

/**
 * WHICH ROW THE RAIL SHOWS A RECORD OF THE KIND IN, one fixture per family.
 *
 * The rows are named by the destination's key — the key `NavRow` receives, and the same names the
 * rail reads. A family whose kinds all read through its row is one line; the kinds with a row of
 * their own beside the family — a session and a bundle are also in the notes family, a placeholder
 * is also in findings — are separate lines, and the more specific row is the one to which their
 * records should lead.
 */
const FIXTURES: readonly { kind: RecordKind; row: string }[] = [
  { kind: 'problem', row: 'work' },
  { kind: 'task', row: 'work' },
  { kind: 'module', row: 'modules' },
  { kind: 'block', row: 'pipeline' },
  { kind: 'pipeline', row: 'pipeline' },
  { kind: 'goal', row: 'horizons' },
  { kind: 'decision', row: 'decisions' },
  { kind: 'proposal', row: 'decisions' },
  { kind: 'claim', row: 'findings' },
  { kind: 'direction', row: 'findings' },
  { kind: 'placeholder', row: 'placeholders' },
  { kind: 'ran_instead', row: 'placeholders' },
  { kind: 'idea', row: 'ideas' },
  { kind: 'wanna_try', row: 'ideas' },
  { kind: 'report', row: 'notes' },
  { kind: 'note', row: 'notes' },
  { kind: 'incident', row: 'notes' },
  { kind: 'session', row: 'sessions' },
  { kind: 'context_bundle', row: 'bundles' },
  { kind: 'message', row: 'messages' },
  // A ROLE CARD IS A KIND OF ITS OWN SINCE 1 OCTOBER 2026, by item 3 of a decision, and its record page marks the Role
  // cards row, not Reports and notes.
  { kind: 'role_card', row: 'roles' },
  // A QUICK NOTE IS A KIND OF ITS OWN, and My notes is the row that lists every one, so its record page marks the My
  // notes row and never Reports and notes.
  { kind: 'quick_note', row: 'myNotes' },
]

function rowsMarking(kind: RecordKind | null): string[] {
  return Sidebar.DESTINATIONS.filter(
    (destination) => Sidebar.markFor(destination, 'record', undefined, { kind }) === 'section',
  ).map((destination) => destination.key)
}

describe('a record on the screen marks the rail row its kind belongs to', () => {
  it('marks exactly one row for the fixture kinds, one per family', () => {
    for (const { kind, row } of FIXTURES) {
      expect(rowsMarking(kind), `records of kind "${kind}"`).toEqual([row])
    }
  })

  it('marks Everything only while the record’s kind is not known, and never once a kind is known', () => {
    // THE FALLBACK IS THE HAIRPIN THIS WAS BUILT FOR. While the record page is loading — kind nil —
    // the rail says what it has always said on a record page: you are in the records archive. Once
    // the kind has been read, no kind here has Everything as its row, so Everything marks nothing
    // and the record's own row says where you are. Asserted through the records row's destination,
    // because that row is the one whose mark moved.
    const records = Sidebar.DESTINATIONS.find((destination) => destination.key === 'records')
    if (records === undefined) throw new Error('the rail has no Everything row')
    expect(Sidebar.markFor(records, 'record', undefined, { kind: null })).toBe('section')
    expect(Sidebar.markFor(records, 'record', undefined, { kind: 'report' })).toBe(null)
    expect(Sidebar.markFor(records, 'record', undefined, { kind: 'placeholder' })).toBe(null)
    // The two-argument form is the shape before a record could carry its kind; it is what a reader
    // of tests/app-routes.test.ts is pinned to, and it does not move here either.
    expect(Sidebar.navMark('records', 'record')).toBe('section')
  })

  it('marks one row for every kind — no kind goes silent and no kind marks two rows', () => {
    for (const kind of RECORD_KINDS) {
      const marked = rowsMarking(kind)
      expect(marked.length, `"${kind}"`).toBe(1)
      expect(marked[0], `"${kind}"`).not.toBe('records')
    }
  })

  it('still marks the pages the rail opens, which is what changed nothing', () => {
    // The record reading is an answer to a record page only; a row marks its own page as it did.
    expect(Sidebar.navMark('records', 'records')).toBe('page')
    expect(Sidebar.navMark('home', 'record')).toBe(null)
    expect(Sidebar.navMark('records', 'unknown')).toBe(null)
  })

  /**
   * A MESSAGE'S OWN PAGE IS A RECORD PAGE FOR THIS RULE, criterion E2, on a decision.
   *
   * `#/message/<id>` is a route of its own — not the record route — so the rail has to know that a
   * message page is one of the pages that reads ONE thing. The kind comes from the address rather
   * than from a record that was read, and the Messages row marks as the part being read, not as the
   * page on screen: the row's own list is not the page the reader is looking at.
   */
  it('marks the Messages row on a message page, whose route is its own', () => {
    const messages = Sidebar.DESTINATIONS.find((destination) => destination.key === 'messages')
    const records = Sidebar.DESTINATIONS.find((destination) => destination.key === 'records')
    if (messages === undefined || records === undefined) throw new Error('the rail lost its Messages or Everything row')
    expect(Sidebar.markFor(messages, 'message', undefined, { kind: 'message' })).toBe('section')
    expect(Sidebar.markFor(records, 'message', undefined, { kind: 'message' })).toBe(null)
    // With no kind told the fallback is what a record page said before a kind could be read.
    expect(Sidebar.markFor(records, 'message', undefined, { kind: null })).toBe('section')
    expect(Sidebar.markFor(messages, 'message', undefined, { kind: null })).toBe(null)
  })

  /**
   * ONE PROBLEM'S OWN PAGE IS A RECORD PAGE FOR THIS RULE TOO, criterion E2, on a decision.
   * `#/problem/<id>` is a route of its own — not the record route — so the rail has to know a problem page is one of
   * the pages that reads ONE thing. The kind comes from the address
   * rather than from a record that has been read, and the Work to do row marks as the part being
   * read, not as the page on screen: the row's own list is not the page the reader is looking at.
   */
  it('marks the Work to do row on a problem page, whose route is its own', () => {
    const work = Sidebar.DESTINATIONS.find((destination) => destination.key === 'work')
    const records = Sidebar.DESTINATIONS.find((destination) => destination.key === 'records')
    if (work === undefined || records === undefined) throw new Error('the rail lost its Work or Everything row')
    expect(Sidebar.markFor(work, 'problem', undefined, { kind: 'problem' })).toBe('section')
    expect(Sidebar.markFor(records, 'problem', undefined, { kind: 'problem' })).toBe(null)
    // With no kind told the fallback is what a record page said before a kind could be read.
    expect(Sidebar.markFor(records, 'problem', undefined, { kind: null })).toBe('section')
    expect(Sidebar.markFor(work, 'problem', undefined, { kind: null })).toBe(null)
  })

  /**
   * A RUN'S OWN PAGE IS THE SAME QUESTION AGAIN, criterion E2, on a decision.
   *
   * `#/session/<id>` is a route of its own, and the row that declares the `session` kind is Agent
   * runs, so that row marks as the part being read. Everything marks nothing, because the kind was
   * told from the address and does not belong to it.
   */
  it('marks the Agent runs row on a run page, whose route is its own', () => {
    const runs = Sidebar.DESTINATIONS.find((destination) => destination.key === 'sessions')
    const records = Sidebar.DESTINATIONS.find((destination) => destination.key === 'records')
    if (runs === undefined || records === undefined) throw new Error('the rail lost its Agent runs or Everything row')
    expect(Sidebar.markFor(runs, 'session', undefined, { kind: 'session' })).toBe('section')
    expect(Sidebar.markFor(records, 'session', undefined, { kind: 'session' })).toBe(null)
    // With no kind told the fallback is what a record page said before a kind could be read.
    expect(Sidebar.markFor(records, 'session', undefined, { kind: null })).toBe('section')
    expect(Sidebar.markFor(runs, 'session', undefined, { kind: null })).toBe(null)
  })
})
