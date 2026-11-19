// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD'S WORDS ARE A RECORD IN THE OFFICE, AND ITS POWERS ARE NOT.
 *
 * Every text part of a role card (its duties, whom it reports to, what ends it, a person card's
 * standing, its flow, what its work area's refusal says, and its handbook in both languages) is a
 * `role_card_words` record the person can change on the record's page. The powers, and what decides
 * them, stay the declaration in src/config/roles.json. The office files the records itself at its
 * start, from the declaration, once per card (src/server/lib/card-words.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE FILING. On a fresh office one record is filed per card, agent cards and person cards,
 *      each saying it was copied from roles.json, at which commit, and when, and the line the start
 *      prints names them. A second filing files nothing and changes nothing. A card whose record was
 *      deleted gets no new one. Where the commit could not be read, the record names none and the line
 *      says why.
 *   2. THE REAL START. The server's own start, run twice on one test database, files the records on
 *      the first start and nothing on the second, and each start prints its one line.
 *   3. THE OFFICE'S WORDS OVER A NEUTRAL DECLARATION. An office files its records under one
 *      declaration, and is then started on another whose words are all different. Every reader shows
 *      the office's words: GET /api/roles, the card message, the profile's card, what comes back after
 *      a compaction, the work-area refusal and the mirror's copies. A change on the record shows at
 *      once, and a field cleared on it shows the declaration's words and is named as such.
 *   4. NO POWER THROUGH THE WORDS. A words record that carries a power, a rung or any other part that
 *      decides one is refused and nothing is written. A second record for one card, a record for a
 *      card nobody declared, and a restore that would give a card two records are refused. A worker
 *      whose words claim every power and another flow still has the first door its declared flow
 *      gives, still gives no card above its own rung, and GET /api/roles still gives it the declared
 *      rung and powers.
 *
 * EVERY TEXT HERE IS MADE UP, and says so with MADE-UP in it. The declarations are the real file
 * with every word replaced, so the shape and the powers are the real ones and no real text is in an
 * assertion. Case 2 starts a real server on the real file, and asserts only names, counts and the
 * commit.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   `theCardInTheOfficesWords` returns the declared card → case 3 red.
 *   `cardsThatEverHadWords` counts only live records → the deleted-record case in 1 red.
 *   the start's call to `fileTheCardWordsOnce` in src/server/index.ts removed → case 2 red.
 *   `theCardInTheseWords` copies every key the record holds → case 4's overlay case red.
 *   the `checkTheCardWords` call on the create path removed → case 4's second-record case red.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, apiServerArguments, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  THE_WORDS_OF_A_CARD,
  cardAsRead,
  theCardInTheseWords,
  theWordsOf,
  whoTheCardReportsTo,
  type RoleCard,
  type RolesDeclaration,
  type WhatTheRolesSay,
} from '../src/shared/roles.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let t: TestDb
let app: FastifyInstance
let reader: typeof import('../src/server/lib/roles.ts')
let words: typeof import('../src/server/lib/card-words.ts')
let guardActKeys: (string | null)[] = []

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

/** A MADE-UP commit, forty characters, the shape the start reads from git. */
const A_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'

/** The parts of a card that decide a power. A words record that carries one is refused. */
const THE_PARTS_THAT_DECIDE = {
  powers: ['Records'],
  rung: 3,
  appoints: 'at or below its own rung',
  appointedBy: 'the person',
  mustRead: { chapters: [], andWhatItsStarterNames: null },
  workArea: { grain: 'folders', most: 'no limit', rootFiles: 'by name', says: 'MADE-UP' },
  refusedEverythingElse: false,
} as const

/**
 * THE REAL DECLARATION WITH EVERY WORD REPLACED BY A MADE-UP ONE that names its set, its card and its
 * part. Two things in the words are kept, because the office reads them as more than words: the flow
 * codes, which give a card its first door, and the phrase in `reportsTo` that says whom it reports to.
 */
function aDeclarationIn(set: 'FIRST' | 'NEUTRAL', change: (decl: RolesDeclaration) => void = () => {}): RolesDeclaration {
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

/** Put a declaration in front of the running server, the way a restart after an edit would. */
function readTheCards(decl: RolesDeclaration): void {
  const file = join(mkdtempSync(join(tmpdir(), 'mole-office-card-words-')), 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys, file })
}

/** Every declared card, in the declaration's order. */
const everyCardIn = (decl: RolesDeclaration): RoleCard[] => [...decl.cards, ...decl.personCards]

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

async function theRoles(): Promise<WhatTheRolesSay> {
  const reply = await inject('GET', '/api/roles')
  expect(reply.status, reply.text).toBe(200)
  return reply.json as unknown as WhatTheRolesSay
}

/** The words record of one card, through the record door. */
async function theWordsRecordOf(role: string): Promise<{ id: string; workspaceId: string; title: string; data: Record<string, unknown> }> {
  const id = words.theWordsRecords().get(role)?.id
  expect(id, `the office holds no words record of the ${role} card`).toBeDefined()
  const reply = await inject('GET', `/api/records/${id!}`)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['record'] as { id: string; workspaceId: string; title: string; data: Record<string, unknown> }
}

/** Every row the office holds, and how many change and revision rows, so "changes nothing" is measured. */
function everythingHeld(): unknown {
  const sqlite = t.client.sqlite
  return {
    records: sqlite.prepare('SELECT id, kind, data, updated_at, deleted_at FROM records ORDER BY id').all(),
    changes: sqlite.prepare('SELECT count(*) AS n FROM changes').get(),
    revisions: sqlite.prepare('SELECT count(*) AS n FROM revisions').get(),
  }
}

/** Register through the starter door, as the person or as an agent. */
async function started(
  body: Record<string, unknown>,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  return inject('POST', '/api/agents/started', { runtime: 'claude-code', language: 'en', ...body }, headers)
}

/** Every card message waiting for an agent, through the waiter's own door, as one text. */
async function whatTheAgentWasSent(handle: string): Promise<string> {
  const waiting = await inject('GET', `/api/handles/${handle}/waiting`)
  expect(waiting.status, waiting.text).toBe(200)
  const out: string[] = []
  for (const one of (waiting.json as { waiting: { messageId: string }[] }).waiting) {
    const reply = await inject('GET', `/api/records/${one.messageId}`)
    expect(reply.status, reply.text).toBe(200)
    out.push(String((reply.json['record'] as { data: Record<string, unknown> }).data['saidInFull'] ?? ''))
  }
  return out.join('\n\n')
}

/**
 * ONE OFFICE FOR THE FILE. The card words are one record per card for the whole office rather than
 * per project, so a case must start with none of them: the reset below removes every words record a
 * case leaves, and the next case files the set it needs itself. That is the state the first case
 * measures, and the state every other case assumes.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  reader = await import('../src/server/lib/roles.ts')
  words = await import('../src/server/lib/card-words.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  reader.forgetTheRoleCards()
})

/**
 * TAKE EVERY CARD WORDS RECORD AWAY, deleted ones included, with the rows that name them. A hard
 * delete rather than the record door's soft one: `cardsThatEverHadWords` counts a deleted record as
 * having had its words, and a case that files the set again needs a card that never had one.
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

beforeEach(() => {
  readTheCards(aDeclarationIn('FIRST'))
})

afterEach(() => {
  forgetEveryCardsWords()
})

// ============================================================ 1. the filing

describe('the office files each card’s words once', () => {
  it('files one record per card on a fresh office, copied from the declaration, and its line names them', async () => {
    const cards = everyCardIn(reader.theRoleCards())
    const names = cards.map((card) => card.name)
    expect(names.length, 'the declaration holds agent cards and person cards').toBeGreaterThan(reader.theRoleCards().cards.length)

    const did = words.fileTheCardWordsOnce({ full: A_COMMIT })
    expect(did.filed).toEqual(names)
    expect(did.line).toBe(
      `Filed the words of ${String(names.length)} role cards (${names.join(', ')}) as records in the "default" project, ` +
        `copied from src/config/roles.json at commit ${A_COMMIT}.`,
    )
    for (const card of cards) {
      const record = await theWordsRecordOf(card.name)
      expect(record.workspaceId).toBe('default')
      expect(record.title).toBe(`The words of the ${card.name} card`)
      const { copiedAt, ...rest } = record.data
      expect(rest).toEqual({ roleName: card.name, ...theWordsOf(card), copiedFrom: 'src/config/roles.json', copiedFromCommit: A_COMMIT })
      expect(String(copiedAt), 'the record says when it was copied').toMatch(/^\d{4}-\d{2}-\d{2}/u)
      expect(JSON.stringify(record.data), 'a filed record holds the made-up words of the declaration').toContain(`MADE-UP FIRST ${card.name}`)
    }
  })

  it('files nothing and changes nothing the second time', async () => {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const before = everythingHeld()
    const again = words.fileTheCardWordsOnce({ full: A_COMMIT })
    expect(again).toEqual({ filed: [], line: 'No role card words were filed: every card already has, or once had, a words record.' })
    expect(everythingHeld()).toEqual(before)
  })

  it('files nothing for a card whose record was deleted, and that card shows the declaration’s words', async () => {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const gone = (await theWordsRecordOf('worker')).id
    const deleted = await inject('DELETE', `/api/records/${gone}`)
    expect(deleted.status, deleted.text).toBe(200)
    const before = everythingHeld()

    const again = words.fileTheCardWordsOnce({ full: A_COMMIT })
    expect(again.filed, 'a card that once had a record gets no second one').toEqual([])
    expect(everythingHeld()).toEqual(before)

    const said = await theRoles()
    const worker = said.words.find((one) => one.role === 'worker')
    expect(worker).toEqual({ role: 'worker', record: null, fromTheDeclaration: Object.keys(theWordsOf(reader.theRoleCards().cards.find((c) => c.name === 'worker')!)) })
  })

  it('names no commit where the commit could not be read, and the line says why', async () => {
    const did = words.fileTheCardWordsOnce({ full: null, why: 'MADE-UP: this checkout has no git' })
    expect(did.line).toMatch(/at a commit that could not be read \(MADE-UP: this checkout has no git\)\.$/u)
    const record = await theWordsRecordOf('supervisor')
    expect(record.data['copiedFromCommit'], 'no commit is written where none was read').toBeUndefined()
    expect(record.data['copiedFrom']).toBe('src/config/roles.json')
  })
})

// ============================================================ 2. the real start

/** A port nothing is listening on, from the operating system. */
async function aFreePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const address = probe.address()
  await new Promise<void>((done) => probe.close(() => done()))
  if (address === null || typeof address === 'string') throw new Error('The operating system gave no port.')
  return address.port
}

/**
 * START THE REAL SERVER ON THIS TEST'S DATABASE, wait for the line its start prints about the card
 * words, and stop it by the process group this test started. Answers with that line.
 */
async function aRealStart(home: string): Promise<string> {
  const port = await aFreePort()
  const child: ChildProcess = spawn(process.execPath, apiServerArguments(['--import', 'tsx']), {
    cwd: REPO,
    detached: true,
    env: {
      ...process.env,
      HOME: home,
      MOLE_OFFICE_DB: t.file,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const group = child.pid
  if (group === undefined) throw new Error('The server did not start.')
  let out = ''
  let err = ''
  const ended = once(child, 'close')
  const stop = (): void => {
    try {
      process.kill(-group, 'SIGTERM')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  const timer = setTimeout(stop, 45_000)
  child.stdout?.on('data', (part: Buffer) => {
    out += String(part)
    if (/role card words were filed|Filed the words of/u.test(out)) stop()
  })
  child.stderr?.on('data', (part: Buffer) => {
    err += String(part)
  })
  await ended
  clearTimeout(timer)
  const line = out.split('\n').find((one) => /role card words were filed|Filed the words of/u.test(one))
  expect(line, `the start printed no line about the card words. Its output:\n${out}\n${err}`).toBeDefined()
  return line!.trim()
}

describe('the server’s own start files the words', () => {
  it('files one record per card on the first start, and nothing on the second', async () => {
    // THE REAL FILE: the server a start runs reads src/config/roles.json, not this test's declaration.
    const real = JSON.parse(readFileSync(join(REPO, 'src/config/roles.json'), 'utf8')) as RolesDeclaration
    const names = everyCardIn(real).map((card) => card.name)
    const head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const home = mkdtempSync(join(tmpdir(), 'mole-office-card-words-home-'))

    const first = await aRealStart(home)
    expect(first).toBe(
      `Filed the words of ${String(names.length)} role cards (${names.join(', ')}) as records in the "default" project, ` +
        `copied from src/config/roles.json at commit ${head}.`,
    )
    const filed = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.roleName') AS role, json_extract(data, '$.copiedFromCommit') AS commitId FROM records WHERE kind = 'role_card_words' AND deleted_at IS NULL ORDER BY role")
      .all() as { role: string; commitId: string }[]
    expect(filed).toEqual([...names].sort().map((role) => ({ role, commitId: head })))
    const before = everythingHeld()

    const second = await aRealStart(home)
    expect(second).toBe('No role card words were filed: every card already has, or once had, a words record.')
    const after = everythingHeld() as { records: { kind: string }[] }
    expect(
      after.records.filter((one) => one.kind === 'role_card_words'),
      'the second start changed no words record',
    ).toEqual((before as { records: { kind: string }[] }).records.filter((one) => one.kind === 'role_card_words'))
  }, 120_000)
})

// ============================================================ 3. the office's words over a neutral declaration

describe('the office’s words are shown when the declaration’s words are neutral', () => {
  /** File under the FIRST words, then start again on the NEUTRAL ones, as the office's next start would. */
  function fileThenGoNeutral(): RolesDeclaration {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const first = reader.theRoleCards()
    readTheCards(aDeclarationIn('NEUTRAL'))
    expect(words.fileTheCardWordsOnce({ full: A_COMMIT }).filed, 'the neutral start files nothing').toEqual([])
    return first
  }

  it('serves every card in the office’s words, and says each one came from its record', async () => {
    const first = fileThenGoNeutral()
    const said = await theRoles()
    for (const declared of everyCardIn(first)) {
      const shown = [...said.cards, ...said.personCards].find((card) => card.name === declared.name)!
      expect(theWordsOf(shown), `the ${declared.name} card is not in the office's words`).toEqual(theWordsOf(declared))
      expect(said.words.find((one) => one.role === declared.name)).toEqual({
        role: declared.name,
        record: words.theWordsRecords().get(declared.name)!.id,
        fromTheDeclaration: [],
      })
    }
    expect(JSON.stringify([said.cards, said.personCards]), 'a neutral word reached the served cards').not.toContain('MADE-UP NEUTRAL')
  })

  it('writes the card message, the profile’s card and the compaction duties in the office’s words', async () => {
    fileThenGoNeutral()
    expect((await started({ handle: 'words-sup', name: 'Words supervisor', role: 'supervisor', workArea: ['src'] })).status).toBe(201)
    const worker = await started({ handle: 'words-worker', name: 'Words worker' }, asAgent('words-sup'))
    expect(worker.status, worker.text).toBe(201)

    const message = await whatTheAgentWasSent('words-worker')
    expect(message).toContain('Your duties: MADE-UP FIRST worker duties.')
    expect(message).toContain('You report to: MADE-UP FIRST worker reportsTo.')
    expect(message).toContain('What ends it: MADE-UP FIRST worker whatEndsIt.')
    expect(message).toContain('MADE-UP FIRST worker howItWorks en.')
    expect(message, 'a neutral word reached the card message').not.toContain('MADE-UP NEUTRAL')

    const profile = await inject('GET', '/api/participants/agent/words-worker/profile')
    expect(profile.status, profile.text).toBe(200)
    const card = (profile.json['theCardTheyHold'] as { card: { duties: string; flow: string | null } }).card
    expect(card.duties).toBe('MADE-UP FIRST worker duties.')
    expect(card.flow).toBe('F13 MADE-UP FIRST worker flow.')

    const { whatComesBackAfterACompaction } = await import('../src/server/lib/after-a-compaction.ts')
    const id = String((worker.json['agent'] as { id: string }).id)
    const back = whatComesBackAfterACompaction({ actor: { type: 'agent', id }, workspaceId: 'default', runAsked: null })
    expect(back.role.duties).toBe('MADE-UP FIRST worker duties.')
  })

  it('refuses a work area with the office’s sentence, by the declared rule', async () => {
    fileThenGoNeutral()
    const refused = await started({ handle: 'words-sec', name: 'Words secretary', role: 'secretary', workArea: ['src'] })
    expect(refused.status, refused.text).toBe(400)
    expect(String(refused.json['error'])).toBe('MADE-UP FIRST secretary workAreaSays.')
  })

  it('copies the cards in the office’s words when the mirror runs', async () => {
    fileThenGoNeutral()
    const mirrored = await inject('POST', '/api/roles/mirror')
    expect(mirrored.status, mirrored.text).toBe(200)
    const copies = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.roleName') AS role, json_extract(data, '$.card.duties') AS duties FROM records WHERE kind = 'role_card' AND deleted_at IS NULL ORDER BY role")
      .all() as { role: string; duties: string }[]
    expect(copies.length).toBeGreaterThan(0)
    for (const copy of copies) expect(copy.duties).toBe(`MADE-UP FIRST ${copy.role} duties.`)
  })

  it('shows a change on the record at once, and the declaration’s words for a field cleared on it', async () => {
    fileThenGoNeutral()
    const id = (await theWordsRecordOf('worker')).id
    const changed = await inject('PATCH', `/api/records/${id}`, { dataPatch: { duties: 'MADE-UP SECOND worker duties.' } })
    expect(changed.status, changed.text).toBe(200)
    expect((await theRoles()).cards.find((card) => card.name === 'worker')!.duties).toBe('MADE-UP SECOND worker duties.')

    const cleared = await inject('PATCH', `/api/records/${id}`, { dataPatch: { duties: null } })
    expect(cleared.status, cleared.text).toBe(200)
    const said = await theRoles()
    expect(said.cards.find((card) => card.name === 'worker')!.duties).toBe('MADE-UP NEUTRAL worker duties.')
    expect(said.words.find((one) => one.role === 'worker')).toEqual({ role: 'worker', record: id, fromTheDeclaration: ['duties'] })
  })
})

// ============================================================ 4. no power through the words

describe('a write to a card’s words cannot give it a power', () => {
  it('refuses every part that decides a power, on a create and on a change, and writes nothing', async () => {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const id = (await theWordsRecordOf('worker')).id
    const before = everythingHeld()
    for (const [part, value] of Object.entries(THE_PARTS_THAT_DECIDE)) {
      const patched = await inject('PATCH', `/api/records/${id}`, { dataPatch: { [part]: value } })
      expect(patched.status, `a change carrying ${part} was not refused: ${patched.text}`).toBe(400)
      const made = await inject('POST', '/api/records', {
        kind: 'role_card_words',
        title: 'MADE-UP words',
        data: { roleName: 'inspector', [part]: value },
      })
      expect(made.status, `a create carrying ${part} was not refused: ${made.text}`).toBe(400)
    }
    expect(everythingHeld(), 'a refused write wrote something').toEqual(before)
  })

  it('keeps one live record per declared card', async () => {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const worker = (await theWordsRecordOf('worker')).id
    const supervisor = (await theWordsRecordOf('supervisor')).id

    const second = await inject('POST', '/api/records', { kind: 'role_card_words', title: 'MADE-UP', data: { roleName: 'worker', duties: 'MADE-UP.' } })
    expect(second.status, second.text).toBe(409)
    expect(second.text).toContain(worker)

    const nobody = await inject('POST', '/api/records', { kind: 'role_card_words', title: 'MADE-UP', data: { roleName: 'made-up-card', duties: 'MADE-UP.' } })
    expect(nobody.status, nobody.text).toBe(400)

    const moved = await inject('PATCH', `/api/records/${supervisor}`, { dataPatch: { roleName: 'worker' } })
    expect(moved.status, moved.text).toBe(409)

    // A DELETED RECORD COMES BACK ONLY WHILE ITS CARD HAS NO LIVE ONE.
    expect((await inject('DELETE', `/api/records/${worker}`)).status).toBe(200)
    const another = await inject('POST', '/api/records', { kind: 'role_card_words', title: 'MADE-UP', data: { roleName: 'worker', duties: 'MADE-UP THIRD worker duties.' } })
    expect(another.status, another.text).toBe(201)
    const restored = await inject('POST', `/api/records/${worker}/restore`)
    expect(restored.status, restored.text).toBe(409)
    expect(words.theWordsRecords().get('worker')!.id).toBe(String((another.json['record'] as { id: string }).id))
  })

  it('moves only words onto a card, whatever else the record holds', () => {
    const decl = reader.theRoleCards()
    for (const declared of everyCardIn(decl)) {
      const held: Record<string, unknown> = { ...THE_PARTS_THAT_DECIDE, name: 'MADE-UP' }
      for (const field of THE_WORDS_OF_A_CARD) held[field] = `MADE-UP OVER ${field}.`
      const shown = theCardInTheseWords(declared, held)
      const withoutWords = (card: RoleCard): Record<string, unknown> => {
        const { duties, reportsTo, whatEndsIt, flow, howItWorks, inPractice, workArea, ...rest } = card as RoleCard & Record<string, unknown>
        void duties, reportsTo, whatEndsIt, flow, howItWorks, inPractice
        const { standing, ...others } = rest
        void standing
        return { ...others, workArea: workArea === undefined ? undefined : { ...workArea, says: null } }
      }
      expect(withoutWords(shown), `a part of the ${declared.name} card that is not a word moved`).toEqual(withoutWords(declared))
      expect(cardAsRead(decl, shown).powers, `the ${declared.name} card's powers moved`).toEqual(cardAsRead(decl, declared).powers)
    }
  })

  it('leaves a worker whose words claim every power with its declared door, rung and powers', async () => {
    words.fileTheCardWordsOnce({ full: A_COMMIT })
    const before = (await theRoles()).cards.find((card) => card.name === 'worker')!
    const id = (await theWordsRecordOf('worker')).id
    const claimed = await inject('PATCH', `/api/records/${id}`, {
      dataPatch: {
        flow: 'F11 F12 MADE-UP flow that claims the other doors.',
        duties: 'MADE-UP duties: this card appoints every card and holds every power.',
      },
    })
    expect(claimed.status, claimed.text).toBe(200)

    const after = (await theRoles()).cards.find((card) => card.name === 'worker')!
    expect(after.duties).toBe('MADE-UP duties: this card appoints every card and holds every power.')
    expect({ rung: after.rung, powers: after.powers, appoints: after.appoints, workArea: { ...after.workArea, says: null } }).toEqual({
      rung: before.rung,
      powers: before.powers,
      appoints: before.appoints,
      workArea: { ...before.workArea, says: null },
    })

    expect((await started({ handle: 'claim-sup', name: 'Claim supervisor', role: 'supervisor', workArea: ['src'] })).status).toBe(201)
    expect((await started({ handle: 'claim-worker', name: 'Claim worker' }, asAgent('claim-sup'))).status).toBe(201)
    const message = await whatTheAgentWasSent('claim-worker')
    // THE FIRST DOOR IS THE DECLARED FLOW'S, F13, and not the F11 or F12 the words name.
    expect(message).toContain('Where your first task is: GET /api/delegation is where the tasks waiting to be taken are listed.')
    expect(message).not.toContain('GET /api/needs-you and your inbox')

    const appointed = await started({ handle: 'claim-other', name: 'A supervisor', role: 'supervisor', workArea: ['src'] }, asAgent('claim-worker'))
    expect(appointed.status, appointed.text).toBe(403)
    expect(appointed.text).toContain('A worker may not make a supervisor')
    expect(appointed.text).toContain('at or below its own rung')
  })
})
