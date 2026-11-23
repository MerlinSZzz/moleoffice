// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS COPIES A ROLE CARD'S SHIPPED WORDS ONTO THE OFFICE'S WORDS, AND SHOWS THE DIFFERENCE FIRST.
 *
 * The office's words records (kind role_card_words) were copied from src/config/roles.json once, at the office's
 * first start, and nothing copies a later change of the shipped file. The Role
 * cards page shows, for each card, every word field where the shipped file and the office's record differ, side by
 * side, and a press writes the shipped words into the record through the record door, as the person or under
 * the person's grant. A field somebody changed in the office after its copy is shown as such, so the press never
 * writes over a change nobody saw (src/server/lib/card-words.ts, src/server/api/roles.ts,
 * src/web/components/TheShippedWords.tsx).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE DIFFERENCE. The office files its words under one declaration and then reads a newer one in which two
 *      fields of two cards changed. GET /api/roles/shipped-words names those two fields and no other, with both texts,
 *      each as copied, and every card's record, version and copy. The commit the newer start read is named.
 *   2. A CHANGE AFTER THE COPY. A field the person changed on the record shows as changed, by the person, and when.
 *      A field an agent changed on the owner's words shows as changed on the owner's words. A record whose history
 *      is gone shows each differing field as unknown, never as copied.
 *   3. THE PRESS. The person's press writes the shipped words of the differing fields and the copy's file, commit and
 *      time, and nothing else, on that card alone, in one revision of its own. A field the declaration does not have
 *      is taken off the record. After it the card differs in nothing, and under a still newer declaration the pressed
 *      field shows as copied.
 *   4. NEVER UNSEEN. A press that names a version the record no longer has is refused, also with the record door's
 *      stale-copy gate off. A press with no version, on a card whose words do not differ, on a card nobody declared,
 *      and on a card with no live record is refused. None of them writes anything.
 *   5. WHO PRESSES. A worker is refused. The press takes no warrant: one sent with it is refused, even a warrant on
 *      the person's words with a decision of the owner's resting on them, sent by the secretary with a reason. The
 *      secretary under the person's grant presses with a reason, and the revision names the grant; without a reason it
 *      is refused. The same secretary's change of the same text through the record door is still refused, and the guard
 *      asked itself refuses another door marked as under the grant and another act: the grant carries this press and no
 *      other act on a card's words.
 *   6. THE PAGE. The component the Role cards page draws for a card shows each differing field with both texts and
 *      where the office's text came from, warns where the press would write over a change, offers the press only
 *      where something differs, and says so where nothing does.
 *
 * EVERY TEXT HERE IS MADE UP, and says so with MADE-UP in it. The declarations are the real file with every word
 * replaced, so the shape is the real one and no real text is in an assertion.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13s round 113. Before the code, at this file's criterion commit, 16 cases were red at their own assertions, and
 * the group of page cases could not load the component, so its four cases did not run. One case was green: the record
 * door's refusal of the secretary's change, which the office made before the press existed. With the code, after a control run with all 21 cases green, each mutation run alone and put back before
 * the next:
 *   M1.  the guard lets no press under the grant through (src/server/lib/card-words.ts): the secretary's press and the
 *        guard asked itself red;
 *   M2.  the guard lets any door marked as under the grant change a card's words: the guard asked itself red;
 *   M3.  the guard lets the press's operation through for any act, a delete as well: the guard asked itself red;
 *   M4.  the press does not compare the version it is given with the record's: both stale cases red;
 *   M5.  a revision the press wrote reads as a change after the copy: the pressed field under a newer declaration red;
 *   M6.  a person's revision reads as an agent's and an agent's as a person's: both cases of a change after the copy red;
 *   M7.  the press's door does not ask who presses (src/server/api/roles.ts): the secretary's press with a reason and
 *        without one red. The worker is still refused, by the record door's own guard on a card's words;
 *   M8.  a field the declaration does not have keeps the office's text: the case that takes it off red;
 *   M9.  the component never draws the warning (src/web/components/TheShippedWords.tsx): both page cases that warn red;
 *   M10. the component marks every field as copied: the same two page cases red.
 * Every case was green again after the last was put back.
 *
 * Wave 13s round 114, for the case that sends a warrant with the press. It pins code that round 113 wrote, so it was
 * green when it was added. After a control run with all 22 cases green, one mutation:
 *   M11. the press reads its body loosely, so a field it does not declare is dropped (src/server/api/roles.ts): that
 *        case red, because the secretary's press with a warrant and a reason went on under the grant and copied the
 *        duties. A warrant sent with the press is dropped there, and never reaches the press as a warrant.
 * All 22 cases were green after it was put back.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { FOR_THE_PERSON, apiApp, freshDb, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoTheCardReportsTo, type RoleCard, type RolesDeclaration } from '../src/shared/roles.ts'
import type { ACardsShippedWords, TheShippedWords } from '../src/shared/the-shipped-words.ts'

let t: TestDb
let app: FastifyInstance
let reader: typeof import('../src/server/lib/roles.ts')
let words: typeof import('../src/server/lib/card-words.ts')
let guardActKeys: (string | null)[] = []
let grant = ''
let theSecretaryCard = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const A_WORKER = 'shipped-words-worker'
/** An agent that changes a card's words on the owner's words, as the record door allows. */
const A_SUPERVISOR = 'shipped-words-sup'

/** MADE-UP commits, forty characters, the shape the start reads from git: the first start's and a newer one's. */
const A_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'
const A_NEWER_COMMIT = '0123456789abcdef0123456789abcdef01234567'

/** The two fields the newer declaration changes. */
const NEWER_SUPERVISOR_DUTIES = 'MADE-UP NEWER supervisor duties.'
const NEWER_WORKER_HANDBOOK = 'MADE-UP NEWER worker howItWorks en.'

/** The person's words, which a message of theirs holds whole, for the agent's change in case 2. */
const THE_OWNERS_WORDS = 'MADE-UP: the inspector card should say what ends it more plainly.'

/**
 * THE REAL DECLARATION WITH EVERY WORD REPLACED BY A MADE-UP ONE that names its set, its card and its part. The flow
 * codes and the phrase in `reportsTo` that says whom a card reports to are kept, because the office reads them as more
 * than words.
 */
function aDeclarationIn(set: 'FIRST', change: (decl: RolesDeclaration) => void = () => {}): RolesDeclaration {
  const decl = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  for (const card of [...decl.cards, ...decl.personCards] as RoleCard[]) {
    const said = (part: string): string => `MADE-UP ${set} ${card.name} ${part}.`
    const above = whoTheCardReportsTo(card)
    card.duties = said('duties')
    card.reportsTo = `${said('reportsTo')} It reports to ${above === 'nobody the office can name' ? 'no one named' : above}.`
    card.whatEndsIt = said('whatEndsIt')
    if (card.flow !== undefined) card.flow = `${[...new Set(card.flow.match(/F\d+/gu) ?? [])].join(' ')} ${said('flow')}`
    const asAPerson = card as RoleCard & { standing?: unknown }
    if (typeof asAPerson.standing === 'string') asAPerson.standing = said('standing')
    if (card.workArea !== undefined) card.workArea = { ...card.workArea, says: said('workAreaSays') }
    for (const part of ['howItWorks', 'inPractice'] as const) {
      if (card[part] !== undefined) card[part] = { en: said(`${part} en`), zh: said(`${part} zh`) }
    }
  }
  change(decl)
  return decl
}

const cardIn = (decl: RolesDeclaration, name: string): RoleCard => {
  const card = ([...decl.cards, ...decl.personCards] as RoleCard[]).find((one) => one.name === name)
  if (card === undefined) throw new Error(`the declaration has no ${name} card`)
  return card
}

/** The newer declaration: the first one with the supervisor's duties and the worker's English handbook changed. */
function aNewerDeclaration(change: (decl: RolesDeclaration) => void = () => {}): RolesDeclaration {
  return aDeclarationIn('FIRST', (decl) => {
    cardIn(decl, 'supervisor').duties = NEWER_SUPERVISOR_DUTIES
    const worker = cardIn(decl, 'worker')
    if (worker.howItWorks === undefined) throw new Error('the worker card has no handbook to change')
    worker.howItWorks = { ...worker.howItWorks, en: NEWER_WORKER_HANDBOOK }
    change(decl)
  })
}

/** Put a declaration in front of the running server, the way a restart after an edit would. */
function readTheCards(decl: RolesDeclaration): void {
  const file = join(mkdtempSync(join(tmpdir(), 'mole-office-shipped-words-')), 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys, file })
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: InjectOptions['payload'],
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  // A REQUEST WITH NO BODY SAYS NO CONTENT TYPE, because a JSON content type with an empty body is refused.
  const { 'content-type': contentType, ...withoutABody } = headers
  const options: InjectOptions = { method, url, headers: payload === undefined ? withoutABody : { ...withoutABody, 'content-type': contentType ?? 'application/json' } }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** What the office says about every card's shipped words, or one card's. */
async function theShippedWords(role?: string): Promise<TheShippedWords> {
  const reply = await inject('GET', `/api/roles/shipped-words${role === undefined ? '' : `?role=${encodeURIComponent(role)}`}`)
  expect(reply.status, reply.text).toBe(200)
  return reply.json as unknown as TheShippedWords
}

function theCard(said: TheShippedWords, role: string): ACardsShippedWords {
  const card = said.cards.find((one) => one.role === role)
  expect(card, `the reply names no ${role} card`).toBeDefined()
  return card!
}

/** The live words record of one card. */
function theRecordOf(role: string): string {
  const id = words.theWordsRecords().get(role)?.id
  expect(id, `the office holds no live words record of the ${role} card`).toBeDefined()
  return id!
}

/** One record through the record door, with the version the door names. */
async function throughTheDoor(id: string): Promise<{ data: Record<string, unknown>; version: string }> {
  const reply = await inject('GET', `/api/records/${id}`)
  expect(reply.status, reply.text).toBe(200)
  return { data: (reply.json['record'] as { data: Record<string, unknown> }).data, version: String(reply.json['version']) }
}

interface ARevision {
  seq: number
  op: string
  note: string | null
  actor_type: string
  actor_id: string
  at: string
  elevation: string | null
}

/** One record's revisions, oldest first. */
function theRevisionsOf(id: string): ARevision[] {
  return t.client.sqlite.prepare('SELECT seq, op, note, actor_type, actor_id, at, elevation FROM revisions WHERE record_id = ? ORDER BY seq').all(id) as ARevision[]
}

/** Every row the office holds, and how many change and revision rows, so "writes nothing" is measured. */
function everythingHeld(): unknown {
  const sqlite = t.client.sqlite
  return {
    records: sqlite.prepare('SELECT id, kind, data, updated_at, deleted_at FROM records ORDER BY id').all(),
    changes: sqlite.prepare('SELECT count(*) AS n FROM changes').get(),
    revisions: sqlite.prepare('SELECT count(*) AS n FROM revisions').get(),
  }
}

/** The press, through its door. */
function press(body: Record<string, unknown>, headers: Record<string, string> = AS_THE_PERSON): ReturnType<typeof inject> {
  return inject('POST', '/api/roles/shipped-words/copy', body, headers)
}

/** File a record and answer its id. */
async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>, answers: 201 | 409 = 201): Promise<string> {
  const made = await inject('POST', '/api/records', { kind, title, data }, headers)
  expect(made.status, made.text).toBe(answers)
  return String((made.json['record'] as { id: string }).id)
}

/**
 * TAKE EVERY CARD WORDS RECORD AWAY, deleted ones included, with the rows that name them, so the next case files the
 * set again. A hard delete, because the filing gives no new record to a card that once had one.
 */
function forgetEveryCardsWords(): void {
  const held = t.client.sqlite.prepare('SELECT id FROM records WHERE kind = ?').all('role_card_words') as { id: string }[]
  for (const { id } of held) {
    t.client.sqlite.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(id, id)
    t.client.sqlite.prepare('DELETE FROM changes WHERE record_id = ?').run(id)
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)
    t.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(id)
  }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE APP'S OWN MODULE INSTANCES. `freshDb` resets the module registry, so a static import at the top of the file
  // is not the one the routes read after it.
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  reader = await import('../src/server/lib/roles.ts')
  words = await import('../src/server/lib/card-words.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  theSecretaryCard = (JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
  // A SECRETARY IS LIMITED BY NO WORK AREA, so it is registered with none.
  for (const one of [
    { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard },
    { handle: A_WORKER, name: 'MADE-UP worker', role: 'worker', workArea: ['src'] },
    { handle: A_SUPERVISOR, name: 'MADE-UP supervisor', role: 'supervisor', workArea: ['src'] },
  ]) {
    const started = await inject('POST', '/api/agents/started', { runtime: 'claude-code', language: 'en', ...one })
    expect(started.status, started.text).toBe(201)
  }
  // THE PERSON'S OWN PRESS, made as the person with their key.
  const raised = await inject('POST', `/api/roles/elevation/${SECRETARY}`, { reason: 'A test raises it.', endsWhen: 'when you say' }, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
  expect(raised.status, raised.text).toBe(201)
  grant = String((raised.json['elevation'] as { id: string }).id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  reader.forgetTheRoleCards()
  ;(await import('../src/server/lib/role-cards-at-start.ts')).readTheRoleCardsAtStart()
})

/**
 * EACH CASE STARTS FROM ONE STATE: the words filed under the first declaration at one commit, and the office started
 * again on the newer declaration at a newer commit, which files nothing.
 */
beforeEach(() => {
  forgetEveryCardsWords()
  readTheCards(aDeclarationIn('FIRST'))
  words.fileTheCardWordsOnce({ full: A_COMMIT })
  readTheCards(aNewerDeclaration())
  expect(words.fileTheCardWordsOnce({ full: A_NEWER_COMMIT }).filed, 'the newer start files nothing').toEqual([])
})

// ============================================================ 1. the difference

describe('the difference', () => {
  it('names the two fields that differ, with both texts, each as copied, and no other', async () => {
    const said = await theShippedWords()
    const first = aDeclarationIn('FIRST')
    expect(said.file).toBe('src/config/roles.json')
    expect(said.commit, 'the commit the newer start read').toEqual({ full: A_NEWER_COMMIT })
    expect(said.cards.map((one) => one.role)).toEqual([...reader.theRoleCards().cards, ...reader.theRoleCards().personCards].map((one) => one.name))

    const supervisor = theRecordOf('supervisor')
    const worker = theRecordOf('worker')
    expect(theCard(said, 'supervisor').differ).toEqual([
      { field: 'duties', shipped: NEWER_SUPERVISOR_DUTIES, office: cardIn(first, 'supervisor').duties, came: { as: 'copied', at: theRevisionsOf(supervisor)[0]!.at } },
    ])
    expect(theCard(said, 'worker').differ).toEqual([
      { field: 'howItWorks', shipped: NEWER_WORKER_HANDBOOK, office: cardIn(first, 'worker').howItWorks!.en, came: { as: 'copied', at: theRevisionsOf(worker)[0]!.at } },
    ])
    for (const card of said.cards.filter((one) => one.role !== 'supervisor' && one.role !== 'worker')) {
      expect(card.differ, `the ${card.role} card differs in nothing`).toEqual([])
    }
  })

  it('names each card’s record, the version the record door names, and the copy the record says it is', async () => {
    const said = await theShippedWords()
    for (const card of said.cards) {
      const id = theRecordOf(card.role)
      const held = await throughTheDoor(id)
      expect(card.record).toEqual({ id, version: held.version })
      expect(card.copied).toEqual({ from: 'src/config/roles.json', commit: A_COMMIT, at: held.data['copiedAt'] })
    }
  })

  it('answers one card where one is asked for', async () => {
    const said = await theShippedWords('supervisor')
    expect(said.cards.map((one) => one.role)).toEqual(['supervisor'])
  })
})

// ============================================================ 2. a change after the copy

describe('a change after the copy', () => {
  it('shows a field the person changed as changed, by the person, and when', async () => {
    const id = theRecordOf('supervisor')
    const changed = await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP the person wrote this whatEndsIt.' } })
    expect(changed.status, changed.text).toBe(200)

    const differ = theCard(await theShippedWords(), 'supervisor').differ
    expect(differ.map((one) => one.field)).toEqual(['duties', 'whatEndsIt'])
    expect(differ[1]).toEqual({
      field: 'whatEndsIt',
      shipped: cardIn(aNewerDeclaration(), 'supervisor').whatEndsIt,
      office: 'MADE-UP the person wrote this whatEndsIt.',
      came: { as: 'changed', by: { kind: 'person', id: THE_PERSON }, at: theRevisionsOf(id).at(-1)!.at, onTheOwnersWords: false },
    })
    expect(differ[0]!.came.as, 'a field nobody changed is still as copied').toBe('copied')
  })

  it('shows a field an agent changed on the owner’s words as changed on the owner’s words', async () => {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const message = await file(AS_THE_PERSON, 'message', 'MADE-UP about the cards', {
      body: `MADE-UP first line.\n\n${THE_OWNERS_WORDS}\n\nMADE-UP last line.`,
      to: [{ kind: 'agent', id: A_SUPERVISOR }],
    }, 409)
    await file(AS_THE_PERSON, 'decision', 'MADE-UP: the cards say more', {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: message,
      option_taken: 'MADE-UP.',
      because: 'MADE-UP.',
    })
    const id = theRecordOf('inspector')
    const warrant = { saidBy: THE_PERSON, words: THE_OWNERS_WORDS, where: `message:${message}`, when: '2026-10-25 21:40', for: [id] }
    const changed = await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP the agent wrote this whatEndsIt.' }, warrant }, asAgent(A_SUPERVISOR))
    expect(changed.status, changed.text).toBe(200)

    const differ = theCard(await theShippedWords(), 'inspector').differ
    expect(differ).toEqual([
      {
        field: 'whatEndsIt',
        shipped: cardIn(aNewerDeclaration(), 'inspector').whatEndsIt,
        office: 'MADE-UP the agent wrote this whatEndsIt.',
        came: { as: 'changed', by: { kind: 'agent', id: A_SUPERVISOR }, at: theRevisionsOf(id).at(-1)!.at, onTheOwnersWords: true },
      },
    ])
  })

  it('shows every differing field of a record whose history is gone as unknown, never as copied', async () => {
    const id = theRecordOf('supervisor')
    const changed = await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP the person wrote this whatEndsIt.' } })
    expect(changed.status, changed.text).toBe(200)
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)

    const differ = theCard(await theShippedWords(), 'supervisor').differ
    expect(differ.map((one) => [one.field, one.came])).toEqual([
      ['duties', { as: 'unknown' }],
      ['whatEndsIt', { as: 'unknown' }],
    ])
  })
})

// ============================================================ 3. the press

describe('the person’s press', () => {
  it('writes the shipped words of the differing fields and the copy, and nothing else, in one revision', async () => {
    const id = theRecordOf('supervisor')
    const before = await throughTheDoor(id)
    const othersBefore = [...words.theWordsRecords().entries()].filter(([role]) => role !== 'supervisor').map(([, one]) => t.client.sqlite.prepare('SELECT data, updated_at FROM records WHERE id = ?').get(one.id))
    const revisionsBefore = theRevisionsOf(id).length

    const card = theCard(await theShippedWords(), 'supervisor')
    const pressed = await press({ role: 'supervisor', ifVersion: card.record!.version })
    expect(pressed.status, pressed.text).toBe(200)

    const after = await throughTheDoor(id)
    const { copiedAt, ...rest } = after.data
    const { copiedAt: copiedAtBefore, ...restBefore } = before.data
    expect(rest).toEqual({ ...restBefore, duties: NEWER_SUPERVISOR_DUTIES, copiedFrom: 'src/config/roles.json', copiedFromCommit: A_NEWER_COMMIT })
    expect(String(copiedAt), 'the press says when it copied').toMatch(/^\d{4}-\d{2}-\d{2}/u)
    expect(String(copiedAt) >= String(copiedAtBefore), 'the press copied after the first copy').toBe(true)

    const revisions = theRevisionsOf(id)
    expect(revisions.length, 'the press wrote one revision').toBe(revisionsBefore + 1)
    expect(revisions.at(-1)).toMatchObject({ op: 'update', note: words.THE_NOTE_THE_PRESS_LEAVES, actor_type: 'human', actor_id: THE_PERSON })

    const othersAfter = [...words.theWordsRecords().entries()].filter(([role]) => role !== 'supervisor').map(([, one]) => t.client.sqlite.prepare('SELECT data, updated_at FROM records WHERE id = ?').get(one.id))
    expect(othersAfter, 'no other card was written').toEqual(othersBefore)

    const said = await theShippedWords()
    expect(theCard(said, 'supervisor').differ, 'after the press the card differs in nothing').toEqual([])
    expect(theCard(said, 'supervisor').copied).toEqual({ from: 'src/config/roles.json', commit: A_NEWER_COMMIT, at: copiedAt })
    expect(theCard(said, 'worker').differ.map((one) => one.field), 'the other card still differs').toEqual(['howItWorks'])
  })

  it('shows the pressed field as copied under a still newer declaration', async () => {
    const id = theRecordOf('supervisor')
    const card = theCard(await theShippedWords(), 'supervisor')
    expect((await press({ role: 'supervisor', ifVersion: card.record!.version })).status).toBe(200)

    readTheCards(aNewerDeclaration((decl) => void (cardIn(decl, 'supervisor').duties = 'MADE-UP THIRD supervisor duties.')))
    expect(theCard(await theShippedWords(), 'supervisor').differ).toEqual([
      { field: 'duties', shipped: 'MADE-UP THIRD supervisor duties.', office: NEWER_SUPERVISOR_DUTIES, came: { as: 'copied', at: theRevisionsOf(id).at(-1)!.at } },
    ])
  })

  it('takes a field the declaration does not have off the record', async () => {
    const card = [...reader.theRoleCards().personCards].find((one) => one.flow === undefined)
    expect(card, 'a declared card with no flow').toBeDefined()
    const id = theRecordOf(card!.name)
    const changed = await inject('PATCH', `/api/records/${id}`, { dataPatch: { flow: 'F1 MADE-UP a flow the card does not have.' } })
    expect(changed.status, changed.text).toBe(200)

    const before = theCard(await theShippedWords(), card!.name)
    expect(before.differ.map((one) => [one.field, one.shipped, one.office])).toEqual([['flow', null, 'F1 MADE-UP a flow the card does not have.']])
    const pressed = await press({ role: card!.name, ifVersion: before.record!.version })
    expect(pressed.status, pressed.text).toBe(200)
    expect(Object.hasOwn((await throughTheDoor(id)).data, 'flow'), 'the flow is off the record').toBe(false)
  })
})

// ============================================================ 4. never unseen

describe('a press that would write unseen, or has nothing to write', () => {
  it('is refused where the record changed after the version it names, and writes nothing', async () => {
    const id = theRecordOf('supervisor')
    const read = theCard(await theShippedWords(), 'supervisor')
    expect((await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP changed after the read.' } })).status).toBe(200)
    const before = everythingHeld()
    const refused = await press({ role: 'supervisor', ifVersion: read.record!.version })
    expect(refused.status, refused.text).toBe(409)
    expect(refused.text).toContain('Nothing was written.')
    expect(everythingHeld()).toEqual(before)
  })

  it('is refused the same way with the record door’s stale-copy gate off', async () => {
    const { GATES } = (await import('../src/config/gates.mjs')) as { GATES: readonly { id: string; setting: string }[] }
    const setting = GATES.find((one) => one.id === 'writes-from-a-stale-copy')?.setting
    expect(setting, 'the gate list names the stale-copy gate').toBeDefined()
    const set = (value: string | null) => inject('POST', '/api/office/settings', { changes: [{ name: setting!, value }], because: 'MADE-UP: a test turns the gate off.' })
    expect((await set('off')).status).toBe(200)
    try {
      const id = theRecordOf('supervisor')
      const read = theCard(await theShippedWords(), 'supervisor')
      expect((await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP changed after the read.' } })).status).toBe(200)
      const before = everythingHeld()
      const refused = await press({ role: 'supervisor', ifVersion: read.record!.version })
      expect(refused.status, refused.text).toBe(409)
      expect(everythingHeld()).toEqual(before)
    } finally {
      expect((await set(null)).status).toBe(200)
    }
  })

  it('is refused with no version, on a card that does not differ, on a card nobody declared, and on a card with no live record', async () => {
    const said = await theShippedWords()
    const before = everythingHeld()
    const noVersion = await press({ role: 'supervisor' })
    expect(noVersion.status, noVersion.text).toBe(400)
    const same = await press({ role: 'inspector', ifVersion: theCard(said, 'inspector').record!.version })
    expect(same.status, same.text).toBe(409)
    const nobody = await press({ role: 'MADE-UP-no-such-card', ifVersion: theCard(said, 'supervisor').record!.version })
    expect(nobody.status, nobody.text).toBe(404)
    expect(everythingHeld()).toEqual(before)

    const worker = theRecordOf('worker')
    expect((await inject('DELETE', `/api/records/${worker}`)).status).toBe(200)
    const gone = await theShippedWords()
    expect(theCard(gone, 'worker')).toMatchObject({ record: null, differ: [] })
    const afterTheDelete = everythingHeld()
    const noRecord = await press({ role: 'worker', ifVersion: theCard(said, 'worker').record!.version })
    expect(noRecord.status, noRecord.text).toBe(409)
    expect(everythingHeld()).toEqual(afterTheDelete)
  })
})

// ============================================================ 5. who presses

describe('who presses', () => {
  it('refuses a worker, and writes nothing', async () => {
    const card = theCard(await theShippedWords(), 'supervisor')
    const before = everythingHeld()
    const refused = await press({ role: 'supervisor', ifVersion: card.record!.version, ...FOR_THE_PERSON }, asAgent(A_WORKER))
    expect(refused.status, refused.text).toBe(403)
    expect(everythingHeld()).toEqual(before)
  })

  // A WARRANT IS THE PERSON'S WORDS FOR ONE ACT, AND THE GRANT IS NOT A WARRANT. The press is the person's, or the
  // secretary's under the person's grant, so a warrant sent with it is refused whoever sends it, and nothing is written.
  it('refuses a warrant sent with the press, the secretary’s with a reason included, and writes nothing', async () => {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const message = await file(AS_THE_PERSON, 'message', 'MADE-UP about the supervisor card', {
      body: `MADE-UP first line.\n\n${THE_OWNERS_WORDS}\n\nMADE-UP last line.`,
      to: [{ kind: 'agent', id: SECRETARY }],
    }, 409)
    await file(AS_THE_PERSON, 'decision', 'MADE-UP: the supervisor card is copied again', {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: message,
      option_taken: 'MADE-UP.',
      because: 'MADE-UP.',
    })
    const card = theCard(await theShippedWords(), 'supervisor')
    const warrant = { saidBy: THE_PERSON, words: THE_OWNERS_WORDS, where: `message:${message}`, when: '2026-10-25 21:40', for: [theRecordOf('supervisor')] }
    const before = everythingHeld()
    const withAReason = await press({ role: 'supervisor', ifVersion: card.record!.version, warrant, ...FOR_THE_PERSON }, asAgent(SECRETARY))
    expect(withAReason.status, withAReason.text).toBe(400)
    const byAWorker = await press({ role: 'supervisor', ifVersion: card.record!.version, warrant }, asAgent(A_WORKER))
    expect(byAWorker.status, byAWorker.text).toBe(400)
    expect(everythingHeld()).toEqual(before)
  })

  it('lets the secretary press under the person’s grant with a reason, and the revision names the grant', async () => {
    const id = theRecordOf('supervisor')
    const card = theCard(await theShippedWords(), 'supervisor')
    const pressed = await press({ role: 'supervisor', ifVersion: card.record!.version, ...FOR_THE_PERSON }, asAgent(SECRETARY))
    expect(pressed.status, pressed.text).toBe(200)
    expect((await throughTheDoor(id)).data['duties']).toBe(NEWER_SUPERVISOR_DUTIES)
    const written = theRevisionsOf(id).at(-1)!
    expect(written).toMatchObject({ actor_type: 'agent', actor_id: SECRETARY, note: words.THE_NOTE_THE_PRESS_LEAVES })
    expect((JSON.parse(written.elevation ?? 'null') as { id: string } | null)?.id, 'the revision names the grant').toBe(grant)
  })

  it('refuses the secretary’s press with no reason, and writes nothing', async () => {
    const card = theCard(await theShippedWords(), 'supervisor')
    const before = everythingHeld()
    const refused = await press({ role: 'supervisor', ifVersion: card.record!.version }, asAgent(SECRETARY))
    expect(refused.status, refused.text).toBe(400)
    expect(everythingHeld()).toEqual(before)
  })

  it('still refuses the secretary’s change of the same words through the record door', async () => {
    const id = theRecordOf('supervisor')
    const before = everythingHeld()
    const refused = await inject('PATCH', `/api/records/${id}`, { dataPatch: { duties: NEWER_SUPERVISOR_DUTIES }, ...FOR_THE_PERSON }, asAgent(SECRETARY))
    expect(refused.status, refused.text).toBe(403)
    expect(everythingHeld()).toEqual(before)
  })

  // NO DOOR BUT THE PRESS MARKS THE GRANT BEFORE A CHANGE OF A CARD'S WORDS TODAY, so the guard is asked here itself, with
  // an actor its door marked as under the grant: another door's change, and this press's operation on another act.
  it('lets the grant carry the press’s own change and no other act on a card’s words', () => {
    const id = theRecordOf('supervisor')
    const underTheGrant = (operation: string): Parameters<typeof words.refuseACardWordsActOffTheOwnersDecision>[0] => ({
      type: 'agent',
      id: SECRETARY,
      press: { operation, aRead: false, reason: 'MADE-UP reason.', underTheGrant: grant },
    })
    const before = everythingHeld()
    expect(() => words.refuseACardWordsActOffTheOwnersDecision(underTheGrant('record.change'), 'change', id)).toThrow(/carries no warrant/u)
    expect(() => words.refuseACardWordsActOffTheOwnersDecision(underTheGrant(words.THE_PRESS_OF_THE_SHIPPED_WORDS), 'delete', id)).toThrow(/carries no warrant/u)
    expect(() => words.refuseACardWordsActOffTheOwnersDecision(underTheGrant(words.THE_PRESS_OF_THE_SHIPPED_WORDS), 'change', id)).not.toThrow()
    expect(everythingHeld()).toEqual(before)
  })
})

// ============================================================ 6. the page

describe('the component the Role cards page draws for a card', () => {
  let page: typeof import('../src/web/components/TheShippedWords.tsx')
  let say: (key: string) => string

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
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    page = await import('../src/web/components/TheShippedWords.tsx')
    const { t: words } = await import('../src/shared/i18n.ts')
    say = (key: string) => words(key as Parameters<typeof words>[0])
  })

  const drawn = (card: ACardsShippedWords): string => renderToStaticMarkup(h(page.TheShippedWordsOfACard, { card, pressing: false, answer: null, onPress: () => {} }))

  /** The markup of one field's row, from its opening tag to the next row or the end. */
  const theRowOf = (html: string, field: string): string => {
    const start = html.indexOf(`data-field="${field}"`)
    expect(start, `the page draws no row for ${field}`).toBeGreaterThan(-1)
    const next = html.indexOf('data-field="', start + 1)
    return html.slice(start, next === -1 ? undefined : next)
  }

  it('draws each differing field with both texts and where the office’s text came from, and warns before a change is written over', async () => {
    const id = theRecordOf('supervisor')
    expect((await inject('PATCH', `/api/records/${id}`, { dataPatch: { whatEndsIt: 'MADE-UP the person wrote this whatEndsIt.' } })).status).toBe(200)
    const html = drawn(theCard(await theShippedWords(), 'supervisor'))

    expect(html).toContain('data-shipped-words="supervisor"')
    const duties = theRowOf(html, 'duties')
    expect(duties).toContain('data-came="copied"')
    expect(duties).toContain(NEWER_SUPERVISOR_DUTIES)
    expect(duties).toContain(cardIn(aDeclarationIn('FIRST'), 'supervisor').duties)
    expect(duties).toContain('data-side="office"')
    expect(duties).toContain('data-side="shipped"')
    const whatEndsIt = theRowOf(html, 'whatEndsIt')
    expect(whatEndsIt).toContain('data-came="changed"')
    expect(whatEndsIt).toContain('MADE-UP the person wrote this whatEndsIt.')
    expect(html, 'the press would write over a change, and the page says so').toContain('data-writes-over-a-change')
    expect(html, 'the page offers the press').toContain('data-press-shipped-words')
  })

  it('offers the press with no warning where every differing field is as copied', async () => {
    const html = drawn(theCard(await theShippedWords(), 'worker'))
    expect(theRowOf(html, 'howItWorks')).toContain('data-came="copied"')
    expect(html).toContain('data-press-shipped-words')
    expect(html).not.toContain('data-writes-over-a-change')
  })

  it('marks a field whose history is gone as unknown, and warns', async () => {
    const id = theRecordOf('supervisor')
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)
    const html = drawn(theCard(await theShippedWords(), 'supervisor'))
    expect(theRowOf(html, 'duties')).toContain('data-came="unknown"')
    expect(html).toContain('data-writes-over-a-change')
  })

  it('says the words are the shipped words, and offers no press, where nothing differs', async () => {
    const html = drawn(theCard(await theShippedWords(), 'inspector'))
    expect(html).toContain('data-shipped-words-same')
    expect(html).toContain(say('shippedWords.same'))
    expect(html).not.toContain('data-press-shipped-words')
    expect(html).not.toContain('data-field=')
  })
})
