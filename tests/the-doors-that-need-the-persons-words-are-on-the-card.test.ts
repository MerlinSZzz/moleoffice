// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS THAT NEED THE PERSON'S WORDS ARE ON THE CARD. Wave 13s round 2b.
 *
 * Four doors let a secretary through only when it brought the person's words for the one change: changing an added
 * role card, putting back a version of one, the dead-letter thresholds, and the settings the owner decided. Each
 * refused a secretary with no words in its own code, so the person could not change that from the list of what the
 * grant carries. Now the secretary card says to ask the person first about each (`elevation.askFirst` in
 * src/config/roles.json), and the door asks the one check when no words came. So with no row the secretary is refused
 * in the check's words, and this office's row is obeyed.
 *
 * The two role card doors also refuse an agent's change to a card's words without the person's words and a decision of
 * the owner's (src/server/lib/card-words.ts), whatever the list answers. So they stay on the fixed list of doors that
 * also need the person's words, and at may-press only a change that leaves the card's words as they are goes through
 * on the grant. Giving or removing a restart grant keeps its fixed refusal too: the row changes nothing there.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of them
 * raised, are made-up agents, each holding the key the office answered. The added card, the decision and the person's
 * words are made up, and the words cite the terminal, which a fresh office lets a warrant cite. This office's answers are
 * set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH OF THE FOUR DOORS, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary with no words hears the door's old refusal word for word, even with the row at
 *      may-press, and nothing changes;
 *   2. granted, with no row: the raised secretary with no words is refused in the check's words, naming the door, and
 *      nothing changes;
 *   3. with the person's words for the one change it goes through, and the change row keeps the words;
 *   4. the row at may-press: the grant alone goes through, and the change row and the press row name the secretary and
 *      the grant, never the person. For the role card doors, a change to a card's words is still refused;
 *   5. the row at kept: the refusal says it is this office's answer.
 * Then the dead-letter thresholds changed through the settings door, which asks the thresholds door's answer as well as
 * its own, so the settings door at may-press does not carry what the thresholds door keeps. Then the restart grant door,
 * which ignores the row, and the read door's flag for each of the five.
 *
 * MUTATIONS, after a control run: put back `actor.warrant === undefined ||` in one of the four doors, and its case 2 and
 * case 4 go red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { deadLetterThresholdWarrantFor } from '../src/shared/dead-letter-thresholds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RoleCard } from '../src/shared/roles.ts'
import { THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS, type AnAnswerAboutADoor, type WhatTheGrantCarriesReading } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'words-grant-secretary'
const UNRAISED = 'words-plain-secretary'
const CARD = 'archivist'
const A_DECIDED_SETTING = 'MOLE_OFFICE_BUS_MOST_ENTRIES'
const ON_THE_CARDS_WORDS = "An agent changes a role card's words only on the person's words"

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let sortedRoleCard: (card: unknown) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
let decisionId = ''
let days = 2
let entries = 6

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The last change row, so a case can say what it wrote. */
function marker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

interface AChangeRow {
  record_id: string
  actor_type: string
  actor_id: string
  elevation: string | null
  warrant: string | null
  press_id: string | null
}

function rowsSince(mark: number): AChangeRow[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation, warrant, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as AChangeRow[]
}

function thePresses(): { id: string; agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person ORDER BY rowid').all() as {
    id: string
    agent_id: string
    grant_id: string
    operation: string
    reason: string | null
  }[]
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))

/** The person's words for exactly one change, as a secretary carries them. */
const theWordsFor = (target: string): Record<string, unknown> => ({
  saidBy: THE_PERSON,
  words: 'Made-up words of the person for this one change.',
  where: 'terminal',
  when: '2026-09-26 10:00',
  for: [target],
})

const card = (powers: string[], duties = 'Made-up role: reads the archive.'): RoleCard => ({
  name: CARD,
  duties,
  rung: null,
  powers,
  appointedBy: 'the person',
  appoints: 'nobody',
  mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null },
  reportsTo: 'The person.',
  whatEndsIt: 'When the archive is read.',
  workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' },
})

async function theAddedCard(): Promise<{ card: RoleCard; version: string }> {
  const read = await call('GET', '/api/roles/added', PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body.cards as { name: string; card: RoleCard; version: string }[]).find((one) => one.name === CARD)!
}

const theOtherPowers = (now: RoleCard): string[] => ((now.powers ?? []).includes('Records') ? ['Reading everything'] : ['Records'])
const theCardsTarget = (choice: unknown): string => 'office.set-role:' + JSON.stringify({ name: CARD, card: sortedRoleCard(choice) })

/** One press that changes something, its body without words, and what the person's words for it must name. */
interface APress {
  url: string
  body: Record<string, unknown>
  target: string
}

interface ADoor {
  door: string
  /** The door's refusal of a secretary with no words, which a caller with no grant still hears. */
  oldWords: string
  /** The change row a press that goes through writes. */
  setting: string
  next: () => Promise<APress>
  state: () => string
  /** For a role card door: a press that changes the card's words, which the grant alone never carries. */
  aWordsChange?: () => Promise<APress>
}

async function refusedAndNothingChanged(one: ADoor, press: APress, who: string): Promise<string> {
  const before = one.state()
  const pressesBefore = thePresses().length
  const mark = marker()
  const refused = await call('POST', press.url, as(who), { ...press.body, ...FOR_THE_PERSON })
  expect(refused.status, refused.raw).toBe(403)
  expect(one.state(), 'a refused press changed something').toBe(before)
  expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
  expect(thePresses().length, 'a refused press wrote a press row').toBe(pressesBefore)
  return refused.error
}

async function wentThrough(one: ADoor, press: APress, extra: Record<string, unknown>): Promise<{ row: AChangeRow; presses: ReturnType<typeof thePresses> }> {
  const before = one.state()
  const pressesBefore = thePresses().length
  const mark = marker()
  const done = await call('POST', press.url, as(RAISED), { ...press.body, ...extra })
  expect(done.status, `${one.door}: ${done.raw}`).toBe(200)
  expect(one.state(), 'the press changed nothing').not.toBe(before)
  const rows = rowsSince(mark)
  const mine = rows.filter((row) => row.record_id === one.setting)
  expect(mine, JSON.stringify(rows)).toHaveLength(1)
  expect(mine[0]!.actor_type).toBe('agent')
  expect(mine[0]!.actor_id, 'the change row names the secretary').toBe(RAISED)
  expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
  return { row: mine[0]!, presses: thePresses().slice(pressesBefore) }
}

function theFiveCases(one: ADoor): void {
  describe(one.door, () => {
    it('1: with no grant and no words, even with the row at may-press, refuses in its old words and changes nothing', async () => {
      answer(one.door, 'may-press')
      expect(await refusedAndNothingChanged(one, await one.next(), UNRAISED)).toBe(one.oldWords)
    })

    it('2: granted, with no row and no words, refuses in the check’s words naming the door', async () => {
      const said = await refusedAndNothingChanged(one, await one.next(), RAISED)
      expect(said).toBe(
        `The secretary card says to ask the person before pressing ${one.door} for them, and Mole Office holds no answer of theirs about this press. Nothing was done. Ask the person.`,
      )
    })

    it('3: with the person’s words for the one change, goes through, and the change row keeps the words', async () => {
      const press = await one.next()
      const { row, presses } = await wentThrough(one, press, { warrant: theWordsFor(press.target) })
      expect(row.warrant, 'the change row does not keep the words').not.toBeNull()
      expect((JSON.parse(row.warrant!) as { for: string[] }).for).toEqual([press.target])
      expect(row.elevation, 'the words, not the grant, allowed this press').toBeNull()
      expect(presses).toEqual([])
    })

    it('4: with the row at may-press, the grant alone goes through, and what is written names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      if (one.aWordsChange !== undefined) {
        expect(await refusedAndNothingChanged(one, await one.aWordsChange(), RAISED)).toContain(ON_THE_CARDS_WORDS)
      }
      const { row, presses } = await wentThrough(one, await one.next(), FOR_THE_PERSON)
      expect(row.elevation, 'the change row does not name the grant').not.toBeNull()
      expect(row.warrant).toBeNull()
      expect(presses, 'one press row for this press').toHaveLength(1)
      expect(presses[0]).toMatchObject({ operation: one.door, reason: A_TESTS_REASON_FOR_THE_PERSON, agent_id: RAISED })
      expect((JSON.parse(row.elevation!) as { id: string }).id, 'the press row and the change row name the same grant').toBe(presses[0]!.grant_id)
      expect(row.press_id).toBe(presses[0]!.id)
    })

    it('5: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(one, await one.next(), RAISED)
      expect(said).toContain(`keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })
  })
}

const roleState = (): string =>
  readAll("SELECT * FROM runtime_settings WHERE name = 'office.role:' || ?", CARD) +
  readAll("SELECT id, data, deleted_at FROM records WHERE kind = 'role_card_words' ORDER BY id") +
  readAll('SELECT * FROM changes WHERE record_id = ? ORDER BY rowid', `setting:role:${CARD}`)

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  sortedRoleCard = (await import('../src/server/lib/added-roles.ts')).sortedRoleCard as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [RAISED, UNRAISED]) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'secretary' })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  for (const powers of [['Reading everything'], ['Records']]) {
    const now = (await call('GET', '/api/roles/added', PERSON)).body.cards.find((one: { name: string }) => one.name === CARD)
    const applied = await call('POST', '/api/roles/added', PERSON, { version: now?.version ?? null, card: card(powers), because: 'A made-up card the person adds.' })
    expect(applied.status, applied.raw).toBe(200)
  }
  const decided = await call('POST', '/api/records', PERSON, { kind: 'decision', title: 'A made-up decision a restart grant rests on', data: { replaces: [] } })
  expect(decided.status, decided.raw).toBe(201)
  decisionId = String(decided.body.record.id)
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the doors that need the person's words are on the card", () => {
  theFiveCases({
    door: 'role.set-added',
    oldWords: 'Only the person, the owner’s authority, or a secretary carrying the person’s exact words for this exact card may change roles. Nothing was changed.',
    setting: `setting:role:${CARD}`,
    state: roleState,
    next: async () => {
      const now = await theAddedCard()
      const choice = card(theOtherPowers(now.card), now.card.duties)
      return { url: '/api/roles/added', body: { version: now.version, card: choice, because: 'A made-up change to the powers.' }, target: theCardsTarget(choice) }
    },
    aWordsChange: async () => {
      const now = await theAddedCard()
      const choice = card(now.card.powers ?? [], 'Made-up role: reads the archive twice.')
      return { url: '/api/roles/added', body: { version: now.version, card: choice, because: 'A made-up change to the words.' }, target: theCardsTarget(choice) }
    },
  })

  theFiveCases({
    door: 'role.restore-added',
    oldWords: 'Only the person, the owner’s authority, or a secretary carrying the person’s exact words for this exact card may change roles. Nothing was changed.',
    setting: `setting:role:${CARD}`,
    state: roleState,
    next: async () => {
      const now = await theAddedCard()
      const history = await call('GET', `/api/roles/added/history?name=${CARD}`, PERSON)
      expect(history.status, history.raw).toBe(200)
      const other = (history.body.versions as { id: string; after: { card: RoleCard | null } | null }[]).find(
        (one) => one.after?.card != null && JSON.stringify(one.after.card.powers) !== JSON.stringify(now.card.powers),
      )!
      return {
        url: '/api/roles/added/restore',
        body: { name: CARD, version: now.version, from: other.id, because: 'A made-up version put back.' },
        target: theCardsTarget(other.after!.card),
      }
    },
    aWordsChange: async () => {
      const now = await theAddedCard()
      return { url: '/api/roles/added/restore', body: { name: CARD, version: now.version, from: 'shipped', because: 'A made-up removal.' }, target: theCardsTarget(null) }
    },
  })

  theFiveCases({
    door: 'office.set-dead-letter-thresholds',
    oldWords: "A secretary needs the person's words for these exact values. A key or a raise alone is not enough. Nothing was changed.",
    setting: 'setting:dead-letter-thresholds',
    state: () =>
      readAll('SELECT dead_letter_after_days, dead_letter_after_count FROM installation') +
      readAll("SELECT * FROM changes WHERE record_id = 'setting:dead-letter-thresholds' ORDER BY rowid"),
    next: async () => {
      days += 1
      const choice = { days, count: 30 + days, decision: null }
      return {
        url: '/api/office/dead-letter-thresholds',
        body: { days: choice.days, count: choice.count, because: 'Made-up thresholds.' },
        target: deadLetterThresholdWarrantFor(choice, choice),
      }
    },
  })

  theFiveCases({
    door: 'office.set-settings',
    oldWords: 'These exact values need the owner’s words. A raise alone is not enough. Nothing was changed.',
    setting: `setting:runtime:${A_DECIDED_SETTING}`,
    state: () =>
      readAll('SELECT * FROM runtime_settings WHERE name = ?', A_DECIDED_SETTING) +
      readAll('SELECT * FROM changes WHERE record_id = ? ORDER BY rowid', `setting:runtime:${A_DECIDED_SETTING}`),
    next: async () => {
      entries += 1
      const value = String(entries)
      return {
        url: '/api/office/settings',
        body: { changes: [{ name: A_DECIDED_SETTING, value }], because: 'A made-up setting the owner decided.' },
        target: `office.set-settings:${JSON.stringify([{ name: A_DECIDED_SETTING, value, effective: value, decision: null }])}`,
      }
    },
  })

  describe('the dead-letter thresholds through the settings door', () => {
    const THRESHOLDS = 'office.set-dead-letter-thresholds'
    const state = (): string =>
      readAll('SELECT dead_letter_after_days, dead_letter_after_count FROM installation') +
      readAll("SELECT * FROM changes WHERE record_id = 'setting:dead-letter-thresholds' ORDER BY rowid")
    const press = (): Record<string, unknown> => {
      days += 1
      return { changes: [{ name: 'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', value: String(days) }], because: 'Made-up thresholds through the settings door.', ...FOR_THE_PERSON }
    }

    it("asks the thresholds door's answer too, so the settings door at may-press does not carry them", async () => {
      answer('office.set-settings', 'may-press')
      const before = state()
      const pressesBefore = thePresses().length
      const mark = marker()
      const refused = await call('POST', '/api/office/settings', as(RAISED), press())
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toBe(
        `The secretary card says to ask the person before pressing ${THRESHOLDS} for them, and Mole Office holds no answer of theirs about this press. Nothing was done. Ask the person.`,
      )
      expect(state(), 'a refused press changed the thresholds').toBe(before)
      expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
      expect(thePresses().length, 'a refused press wrote a press row').toBe(pressesBefore)
    })

    it('goes through when both doors are at may-press, and names the secretary and the grant', async () => {
      answer('office.set-settings', 'may-press')
      answer(THRESHOLDS, 'may-press')
      const before = state()
      const mark = marker()
      const done = await call('POST', '/api/office/settings', as(RAISED), press())
      expect(done.status, done.raw).toBe(200)
      expect(state(), 'the press changed nothing').not.toBe(before)
      const rows = rowsSince(mark).filter((row) => row.record_id === 'setting:dead-letter-thresholds')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.actor_id, 'the change row names the secretary').toBe(RAISED)
      expect(rows[0]!.elevation, 'the change row does not name the grant').not.toBeNull()
    })
  })

  describe('office.set-restart-grant', () => {
    const OLD_WORDS = 'A secretary needs the owner’s words for this exact agent and decision. A raise alone is not enough.'
    const grant = (): APress => {
      const agent = ids.get(UNRAISED)!
      return {
        url: '/api/office/restart-grant',
        body: { agent, decision: decisionId, because: 'A made-up grant to restart or pause.' },
        target: `office.set-restart-grant:${JSON.stringify({ agent, decision: decisionId })}`,
      }
    }
    /** Made when a case runs, because the agent the grant names is registered in `beforeAll`. */
    const theDoor = (): ADoor => ({
      door: 'office.set-restart-grant',
      oldWords: OLD_WORDS,
      setting: `setting:restart-grant:${ids.get(UNRAISED)!}`,
      state: () => readAll('SELECT * FROM office_restart_grants') + readAll("SELECT * FROM changes WHERE record_id GLOB 'setting:restart-grant:*' ORDER BY rowid"),
      next: async () => grant(),
    })

    it('refuses a secretary with no words in its own words, with no row and at may-press, raised or not', async () => {
      expect(await refusedAndNothingChanged(theDoor(), grant(), RAISED)).toBe(OLD_WORDS)
      answer('office.set-restart-grant', 'may-press')
      expect(await refusedAndNothingChanged(theDoor(), grant(), RAISED)).toBe(OLD_WORDS)
      expect(await refusedAndNothingChanged(theDoor(), grant(), UNRAISED)).toBe(OLD_WORDS)
    })

    it('goes through with the person’s words for the one grant, and the change row keeps them', async () => {
      const press = grant()
      const { row } = await wentThrough(theDoor(), press, { warrant: theWordsFor(press.target) })
      expect((JSON.parse(row.warrant!) as { for: string[] }).for).toEqual([press.target])
      expect(row.elevation).toBeNull()
    })
  })

  describe('the read door', () => {
    const ROLE_DOORS = ['role.set-added', 'role.restore-added']
    const ON_THE_CARD = ['office.set-dead-letter-thresholds', 'office.set-settings']

    async function theDoors(): Promise<Record<string, { card: string; answer: string; alsoNeedsThePersonsWords: boolean }>> {
      const read = await call('GET', '/api/office/what-the-grant-carries', PERSON)
      expect(read.status, read.raw).toBe(200)
      return Object.fromEntries((read.body as WhatTheGrantCarriesReading).doors.map((one) => [one.door, one]))
    }

    it("says the card asks the person first about the four doors, and the fixed list holds naming the owner, the role card doors and the restart grant", async () => {
      const doors = await theDoors()
      for (const door of [...ROLE_DOORS, ...ON_THE_CARD]) expect(doors[door]?.card, door).toBe('ask-first')
      expect(doors['office.set-restart-grant']?.card).toBe('may-press')
      expect([...THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS].sort()).toEqual(['office.name-owner', 'office.set-restart-grant', ...ROLE_DOORS].sort())
    })

    it('says the role card doors and the restart grant also need the words at kept, at the card’s default and at may-press', async () => {
      for (const said of ['kept', 'default', 'may-press'] as const) {
        for (const door of [...ROLE_DOORS, 'office.set-restart-grant']) {
          if (said === 'default') setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
          else answer(door, said)
        }
        const doors = await theDoors()
        for (const door of [...ROLE_DOORS, 'office.set-restart-grant']) expect(doors[door]?.alsoNeedsThePersonsWords, `${door} at ${said}`).toBe(true)
      }
    })

    it('says the thresholds and the settings also need the words only while the answer in force is ask-first', async () => {
      const at = async (said: AnAnswerAboutADoor | 'default'): Promise<boolean[]> => {
        for (const door of ON_THE_CARD) {
          if (said === 'default') setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
          else answer(door, said)
        }
        const doors = await theDoors()
        return ON_THE_CARD.map((door) => doors[door]!.alsoNeedsThePersonsWords)
      }
      expect(await at('default')).toEqual([true, true])
      expect(await at('ask-first')).toEqual([true, true])
      expect(await at('may-press')).toEqual([false, false])
      expect(await at('kept')).toEqual([false, false])
    })
  })
})
