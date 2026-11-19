// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT CHANGES A ROLE CARD'S WORDS ONLY ON THE OWNER'S WORDS, AND ONLY WHERE A DECISION OF THE OWNER'S RESTS ON THEM.
 *
 * The owner may change the words of a role card freely (tests/a-cards-words-are-the-offices-record.test.ts). An
 * agent's create, change, delete, restore or move of a `role_card_words` record carries a warrant (rule 4.5): the person's
 * words, copied whole from a message the person wrote, citing it as `message:<id>`, for the record. The office then
 * looks for a live decision, in any project, whose `decided_by` is "the owner", whose `authority` is "the owner said
 * so" and whose `authority_reference` is that message. Without all of it the act is refused with 403, the refusal says
 * which part failed, and nothing is written. With it, the act is written and the warrant is kept in both ledgers. The
 * powers of a card stay in src/config/roles.json whatever its words say.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, over the record door
 * ---------------------------------------------------------------------------------------
 *
 *   1. Each of the five acts, including a move to another project, by an agent with no warrant is refused, says so,
 *      and writes nothing.
 *   2. The person does each of the five with no warrant.
 *   3. An agent does each of the five on a warrant whose message a decision of the owner's rests on, and every change
 *      and revision row of those acts carries the warrant. The same holds when the message is a comment the person
 *      wrote in a conversation.
 *   4. The words are not the person's: words that are not in the message, and a message an agent wrote. Each refusal
 *      says the words are not the person's, and writes nothing.
 *   5. No decision of the owner's rests on the message: none at all, one the agent made on its own authority, a
 *      deleted one, and one a later decision replaced. Each refusal says so, and writes nothing.
 *   6. The edges: a write of short forms needs no warrant; a raised secretary with no warrant is refused; in a test
 *      world, the agent that started it needs none.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. records.ts, `assertMayWrite`: leave `create` out of the verbs the card's words guard asks → 1's create red.
 *   2. records.ts, `patchRecord`: do not ask the card's words guard → 1's change red.
 *   3. records.ts, `assertMayWrite`: leave `delete` out → 1's delete red.
 *   4. records.ts, `assertMayWrite`: leave `restore` out → 1's restore red.
 *   5. warrants.ts, `whichDecisionOfTheOwnersTheseWordsStandOn`: do not look for the words in the message → 4's
 *      words case red.
 *   6. the same function: do not ask who wrote the message → 4's agent's message case red.
 *   7. the same function: take any decision that cites the message → 5's agent's decision case red.
 *   8. card-words.ts, the guard: ask the person too → 2 red.
 *   9. warrants.ts, `whichDecisionOfTheOwnersTheseWordsStandOn`: do not leave out a replaced decision (drop
 *      `|| replaced.has(one.id)` from the check that leaves a decision out) → 5's replaced case red.
 *  10. card-words.ts, the guard: do not mark the warrant used → 3's ledger rows red.
 *  11. records.ts, `patchRecord`: ask the guard of a write of short forms too → 6's short forms case red.
 *  12. card-words.ts, the guard: let a test world's starter through only when it carries a warrant → 6's world case red.
 *  13. the same function: read a comment in a conversation as no message → 3's conversation case red.
 *  14. records.ts, `assertMayWrite`: leave `move` out of the verbs the card's words guard asks → 1's move red, and 3's
 *      move red for rows without the warrant (24 October 2026).
 *  15. card-words.ts, the guard: let a move through without asking → 1's move red, and 3's move red for rows without
 *      the warrant (24 October 2026).
 *  16. card-words.ts, the guard: do not mark the warrant used for a move → 3's move red, its rows without the warrant
 *      (24 October 2026).
 *
 * Everybody and every word here is made up, and the database is the test's own.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let words: typeof import('../src/server/lib/card-words.ts')

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

/** The agent that changes the cards' words here: a supervisor, registered by the person. */
const THE_AGENT = 'words-sup'

/** A MADE-UP commit, forty characters, the shape the start reads from git. */
const A_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'

/** The person's words, which a message of theirs holds whole among other lines. */
const THE_WORDS = 'MADE-UP: the supervisor card should say it reads every report before it answers.'

/** A MADE-UP second project's id, made once, that a move can take a card's words to. */
const THE_OTHER_PROJECT = 'made-up-card-words-elsewhere'

/** The title of the words record an agent files for the worker card. A warrant on a create names it. */
const A_NEW_TITLE = 'MADE-UP words of the worker card'

/** The card that may act for the person, read from the declaration and never typed. */
async function theSecretaryCard(): Promise<string> {
  const { theRoleCardsFile } = await import('../src/server/lib/roles.ts')
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
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

/** File a record and answer its id. */
async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await inject('POST', '/api/records', { kind, title, data }, headers)
  expect(made.status, made.text).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String((made.json['record'] as { id: string }).id)
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

/** The live words record of one card. */
function theRecordOf(role: string): string {
  const id = words.theWordsRecords().get(role)?.id
  expect(id, `the office holds no live words record of the ${role} card`).toBeDefined()
  return id!
}

/** A message the person wrote to the agent, holding their words whole between two other lines. */
function thePersonsMessage(): Promise<string> {
  return file(AS_THE_PERSON, 'message', 'MADE-UP about the cards', {
    body: `MADE-UP first line.\n\n${THE_WORDS}\n\nMADE-UP last line.`,
    to: [{ kind: 'agent', id: THE_AGENT }],
  })
}

/** A decision of the owner's that rests on one message, filed by the person. `over` changes its fields. */
function theOwnersDecisionOn(message: string, over: Record<string, unknown> = {}): Promise<string> {
  return file(AS_THE_PERSON, 'decision', 'MADE-UP: the cards say more', {
    replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    authority_reference: message,
    option_taken: 'MADE-UP.',
    because: 'MADE-UP.',
    ...over,
  })
}

/** The person's words in that message, as a warrant for one record, or for the title a create names. */
function aWarrant(message: string, forWhat: string, said: string = THE_WORDS): Record<string, unknown> {
  return { saidBy: THE_PERSON, words: said, where: `message:${message}`, when: '2026-10-14 19:50', for: [forWhat] }
}

const withThe = (warrant?: Record<string, unknown>): Record<string, unknown> => (warrant === undefined ? {} : { warrant })

/** THE FIVE ACTS, each through its own door, with the warrant in the body when one is carried. */
const THE_ACTS = {
  create: (_id: string, headers: Record<string, string>, warrant?: Record<string, unknown>) =>
    inject('POST', '/api/records', { kind: 'role_card_words', title: A_NEW_TITLE, data: { roleName: 'worker', duties: 'MADE-UP worker duties.' }, ...withThe(warrant) }, headers),
  change: (id: string, headers: Record<string, string>, warrant?: Record<string, unknown>) =>
    inject('PATCH', `/api/records/${id}`, { dataPatch: { duties: 'MADE-UP supervisor duties.' }, ...withThe(warrant) }, headers),
  delete: (id: string, headers: Record<string, string>, warrant?: Record<string, unknown>) =>
    inject('DELETE', `/api/records/${id}`, warrant === undefined ? undefined : { warrant }, headers),
  restore: (id: string, headers: Record<string, string>, warrant?: Record<string, unknown>) =>
    inject('POST', `/api/records/${id}/restore`, warrant === undefined ? undefined : { warrant }, headers),
  move: (id: string, headers: Record<string, string>, warrant?: Record<string, unknown>) =>
    inject('POST', `/api/records/${id}/workspace`, { to: THE_OTHER_PROJECT, ...withThe(warrant) }, headers),
} as const
type AnAct = keyof typeof THE_ACTS

/**
 * WHAT EACH ACT IS ASKED OF, set up by the person first. A create and a restore need the worker card to have no live
 * record, so the person deletes it; a change, a delete and a move are asked of the supervisor card's record. Answers
 * the id the act names and what a warrant on it names in `for`.
 */
async function readyFor(act: AnAct): Promise<{ id: string; forWhat: string }> {
  if (act === 'change' || act === 'delete' || act === 'move') {
    const id = theRecordOf('supervisor')
    return { id, forWhat: id }
  }
  const worker = theRecordOf('worker')
  const gone = await inject('DELETE', `/api/records/${worker}`)
  expect(gone.status, gone.text).toBe(200)
  return act === 'create' ? { id: '', forWhat: A_NEW_TITLE } : { id: worker, forWhat: worker }
}

/** The status each act answers when it is written. */
const WRITTEN: Record<AnAct, number> = { create: 201, change: 200, delete: 200, restore: 200, move: 200 }

/** Every change row and revision row an agent wrote on a record, with the warrant each carries. */
function theAgentsRows(record: string): { changes: (string | null)[]; revisions: { op: string; warrant: string | null }[] } {
  const sqlite = t.client.sqlite
  return {
    changes: (sqlite.prepare("SELECT warrant FROM changes WHERE record_id = ? AND actor_type = 'agent'").all(record) as { warrant: string | null }[]).map((one) => one.warrant),
    revisions: sqlite.prepare("SELECT op, warrant FROM revisions WHERE record_id = ? AND actor_type = 'agent' ORDER BY seq").all(record) as { op: string; warrant: string | null }[],
  }
}

/**
 * THE WORDS OF THE TWO CARDS THIS FILE ACTS ON, as the office first held them. Each case gets these
 * two records again, because the acts below delete and change them and one live words record per
 * card is the rule. The office itself, its database and the registered agent are made once.
 */
let theCardsAtTheStart: Record<string, { title: string; data: Record<string, unknown> }> = {}

/** Build the office once, file the cards' words, and register the agent. */
async function makeTheOffice(): Promise<void> {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  // THE APP'S OWN MODULE INSTANCE. `freshDb` resets the module registry, so a static import of this
  // module at the top of the file is not the one the routes read after it.
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  words = await import('../src/server/lib/card-words.ts')
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const project = await inject('POST', '/api/workspaces', { id: THE_OTHER_PROJECT, title: 'A made-up second project' })
  expect(project.status, project.text).toBe(201)
  words.fileTheCardWordsOnce({ full: A_COMMIT })
  const started = await inject('POST', '/api/agents/started', { runtime: 'claude-code', language: 'en', handle: THE_AGENT, name: 'MADE-UP supervisor', role: 'supervisor', workArea: ['src'] })
  expect(started.status, started.text).toBe(201)
  for (const role of ['worker', 'supervisor']) {
    const held = words.theWordsRecords().get(role)
    if (held === undefined) throw new Error(`the office filed no words record of the ${role} card`)
    const row = t.api.getRecord(held.id)
    if (row === null) throw new Error(`the ${role} card's words record went missing`)
    theCardsAtTheStart[role] = { title: row.title, data: structuredClone(row.data) }
  }
}

/**
 * Give the shared office the two cards' words back, and set what this case says about a test world.
 *
 * A create or a restore needs a card with no live record and the person deletes it; a change and a
 * delete write over or remove the live one. So a case that starts with what the office filed is a
 * case whose predecessor's deletions and changes are not still in place. A move leaves a live record
 * in the project it went to, so each is deleted from the project the row itself names.
 */
async function anOffice(world?: { startedBy: string }): Promise<void> {
  if (world === undefined) delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  else process.env.MOLE_OFFICE_WORLD_STARTED_BY = world.startedBy
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  if (theCardsAtTheStart['worker'] === undefined) {
    await makeTheOffice()
    return
  }
  for (const role of ['worker', 'supervisor']) {
    const live = words.theWordsRecords().get(role)
    if (live === undefined) continue
    const row = t.api.getRecord(live.id)
    if (row === null) throw new Error(`the ${role} card's words record went missing`)
    const gone = await inject('DELETE', `/api/records/${live.id}`, undefined, { ...AS_THE_PERSON, 'x-mole-office-workspace': row.workspaceId })
    expect(gone.status, gone.text).toBe(200)
  }
  for (const role of ['worker', 'supervisor']) {
    const start = theCardsAtTheStart[role]
    if (start === undefined) throw new Error(`no starting words for the ${role} card`)
    const made = await inject('POST', '/api/records', { kind: 'role_card_words', title: start.title, data: start.data })
    expect(made.status, made.text).toBe(201)
  }
}

afterAll(async () => {
  await app.close()
  t.close()
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
})

// ============================================================ 1. no warrant

describe('an agent that carries no warrant', () => {
  beforeEach(async () => {
    await anOffice()
  })

  for (const act of Object.keys(THE_ACTS) as AnAct[]) {
    it(`is refused the ${act}, is told it needs the owner's words, and nothing is written`, async () => {
      const { id } = await readyFor(act)
      const before = everythingHeld()
      const refused = await THE_ACTS[act](id, asAgent(THE_AGENT))
      expect(refused.status, refused.text).toBe(403)
      expect(refused.text).toContain('carries no warrant')
      expect(refused.text).toContain('Nothing was written.')
      expect(everythingHeld(), `the refused ${act} wrote something`).toEqual(before)
    })
  }
})

// ============================================================ 2. the person

describe('the person', () => {
  beforeEach(async () => {
    await anOffice()
  })

  for (const act of Object.keys(THE_ACTS) as AnAct[]) {
    it(`does the ${act} with no warrant`, async () => {
      const { id } = await readyFor(act)
      const done = await THE_ACTS[act](id, AS_THE_PERSON)
      expect(done.status, done.text).toBe(WRITTEN[act])
    })
  }
})

// ============================================================ 3. on the owner's words and their decision

describe('an agent on the owner’s words, where a decision of theirs rests on them', () => {
  beforeEach(async () => {
    await anOffice()
  })

  for (const act of Object.keys(THE_ACTS) as AnAct[]) {
    it(`does the ${act}, and every row it wrote carries the warrant`, async () => {
      const message = await thePersonsMessage()
      await theOwnersDecisionOn(message)
      const { id, forWhat } = await readyFor(act)
      const done = await THE_ACTS[act](id, asAgent(THE_AGENT), aWarrant(message, forWhat))
      expect(done.status, done.text).toBe(WRITTEN[act])

      const record = act === 'create' ? String((done.json['record'] as { id: string }).id) : id
      const rows = theAgentsRows(record)
      expect(rows.revisions.length, 'the act wrote no revision').toBe(1)
      expect(rows.changes.length, 'the act wrote no change row').toBeGreaterThan(0)
      for (const stored of [...rows.changes, ...rows.revisions.map((one) => one.warrant)]) {
        expect(stored, `a row of the ${act} carries no warrant`).not.toBeNull()
        expect((JSON.parse(stored!) as { words: string }).words).toBe(THE_WORDS)
      }
    })
  }

  it('takes a comment the person wrote in a conversation as their message', async () => {
    const thread = await inject('POST', '/api/agent/threads', { title: 'MADE-UP about the cards', mode: 'direct' })
    expect(thread.status, thread.text).toBe(201)
    const threadId = String((thread.json['thread'] as { id: string }).id)
    const said = await inject('POST', `/api/agent/threads/${threadId}/messages`, { intent: 'change', body: `MADE-UP first line. ${THE_WORDS}` })
    expect(said.status, said.text).toBeLessThan(300)
    const comment = String((said.json['message'] as { id: string }).id)
    await theOwnersDecisionOn(comment)

    const supervisor = theRecordOf('supervisor')
    const done = await THE_ACTS.change(supervisor, asAgent(THE_AGENT), aWarrant(comment, supervisor))
    expect(done.status, done.text).toBe(200)
  })
})

// ============================================================ 4. words that are not the person's

describe('words that are not the person’s', () => {
  beforeEach(async () => {
    await anOffice()
  })

  it('refuses words the message does not hold, says the words are not the person’s, and writes nothing', async () => {
    const message = await thePersonsMessage()
    await theOwnersDecisionOn(message)
    const supervisor = theRecordOf('supervisor')
    const before = everythingHeld()
    const refused = await THE_ACTS.change(supervisor, asAgent(THE_AGENT), aWarrant(message, supervisor, 'MADE-UP: words the person never wrote.'))
    expect(refused.status, refused.text).toBe(403)
    expect(refused.text).toContain("are not the person's words")
    expect(refused.text).toContain('Nothing was written.')
    expect(everythingHeld()).toEqual(before)
  })

  it('refuses a message an agent wrote, says the words are not the person’s, and writes nothing', async () => {
    const theAgents = await file(asAgent(THE_AGENT), 'message', 'MADE-UP from the agent', {
      body: `MADE-UP first line.\n\n${THE_WORDS}`,
      to: [{ kind: 'person', id: THE_PERSON }],
    })
    await theOwnersDecisionOn(theAgents)
    const supervisor = theRecordOf('supervisor')
    const before = everythingHeld()
    const refused = await THE_ACTS.change(supervisor, asAgent(THE_AGENT), aWarrant(theAgents, supervisor))
    expect(refused.status, refused.text).toBe(403)
    expect(refused.text).toContain("are not the person's words")
    expect(refused.text).toContain('Nothing was written.')
    expect(everythingHeld()).toEqual(before)
  })
})

// ============================================================ 5. no decision of the owner's

describe('no decision of the owner’s on the message', () => {
  beforeEach(async () => {
    await anOffice()
  })

  const refusedWithNoDecision = async (message: string): Promise<void> => {
    const supervisor = theRecordOf('supervisor')
    const before = everythingHeld()
    const refused = await THE_ACTS.change(supervisor, asAgent(THE_AGENT), aWarrant(message, supervisor))
    expect(refused.status, refused.text).toBe(403)
    expect(refused.text).toContain("No live decision of the owner's rests on")
    expect(refused.text).toContain('Nothing was written.')
    expect(everythingHeld()).toEqual(before)
  }

  it('refuses the person’s words when no decision cites them', async () => {
    await refusedWithNoDecision(await thePersonsMessage())
  })

  it('refuses them when the decision that cites them is the agent’s own', async () => {
    const message = await thePersonsMessage()
    await file(asAgent(THE_AGENT), 'decision', 'MADE-UP: the agent decides', {
      replaces: [],
      decided_by: THE_AGENT,
      authority: 'reversible engineering judgement',
      authority_reference: message,
      option_taken: 'MADE-UP.',
      because: 'MADE-UP.',
    })
    await refusedWithNoDecision(message)
  })

  it('refuses them when the decision that cited them is deleted', async () => {
    const message = await thePersonsMessage()
    const decision = await theOwnersDecisionOn(message)
    const gone = await inject('DELETE', `/api/records/${decision}`)
    expect(gone.status, gone.text).toBe(200)
    await refusedWithNoDecision(message)
  })

  it('refuses them when a later decision that does not rest on them replaced the decision that cited them', async () => {
    const message = await thePersonsMessage()
    const decision = await theOwnersDecisionOn(message)
    const elsewhere = await thePersonsMessage()
    await theOwnersDecisionOn(elsewhere, { replaces: [decision] })
    await refusedWithNoDecision(message)
  })
})

// ============================================================ 6. the edges

describe('the edges', () => {
  it('lets an agent write a card’s short forms with no warrant', async () => {
    await anOffice()
    const supervisor = theRecordOf('supervisor')
    const read = await inject('GET', `/api/records/${supervisor}/revisions`)
    expect(read.status, read.text).toBe(200)
    const newest = [...(read.json['revisions'] as { seq: number; contentHash: string }[])].sort((a, b) => b.seq - a.seq)[0]!
    const written = await inject(
      'POST',
      `/api/records/${supervisor}/short-forms`,
      { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'MADE-UP supervisor words' } },
      asAgent(THE_AGENT),
    )
    expect(written.status, written.text).toBeLessThan(300)
  })

  it('refuses a raised secretary that carries no warrant', async () => {
    await anOffice()
    const card = await theSecretaryCard()
    const started = await inject('POST', '/api/agents/started', { runtime: 'claude-code', language: 'en', handle: 'words-sec', name: 'MADE-UP secretary', role: card })
    expect(started.status, started.text).toBe(201)
    const raised = await inject('POST', '/api/roles/elevation/words-sec', { reason: 'MADE-UP: a test raises it', endsWhen: 'when you say' }, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
    expect(raised.status, raised.text).toBe(201)
    const supervisor = theRecordOf('supervisor')
    const before = everythingHeld()
    const refused = await THE_ACTS.change(supervisor, asAgent('words-sec'))
    expect(refused.status, refused.text).toBe(403)
    expect(refused.text).toContain('carries no warrant')
    expect(everythingHeld()).toEqual(before)
  })

  it('lets the agent that started a test world change a card’s words with no warrant', async () => {
    await anOffice({ startedBy: THE_AGENT })
    const supervisor = theRecordOf('supervisor')
    const done = await THE_ACTS.change(supervisor, asAgent(THE_AGENT))
    expect(done.status, done.text).toBe(200)
  })
})
