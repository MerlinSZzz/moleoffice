// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I1: one read tells an arriving agent everything it needs, and says what it left out.
 *
 * The criterion asks for five things in one reply — the modules with the first sentence of their curated summaries, the
 * open work ranked as the attention rule ranks it, the last ten decisions with their warrants, the
 * rules for writing, and the owner's own words that still govern — sized to fit a context window,
 * naming its own omissions.
 *
 * Each test below fails if that part of the reply is removed, and the last two fail if the reply
 * stops measuring itself honestly. The writing rules are checked against the declarations that
 * enforce them rather than against a copy written here, so a rule changed in one place cannot leave
 * the brief telling an agent the old one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb, governsTheWholeProject } from './helpers.ts'
import { HUMAN_ONLY_KINDS } from '../src/shared/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '../src/shared/disclosure.ts'

/**
 * EVERY SERVER MODULE HERE IS IMPORTED AFTER `freshDb()` HAS SAID WHICH DATABASE.
 *
 * `src/server/lib/http.ts`, `src/server/lib/records.ts` and the brief route all reach the database
 * client the moment they load, and the client refuses to open an unnamed database under a test
 * runner. Importing any of them at the top of this file would open the operator's own corpus.
 */
let ACTOR_HEADERS: Record<'type' | 'id' | 'session', string>
let WORKSPACE_HEADER: string
let GOVERNANCE_GUARDS: readonly { act: string }[]
let VERBS_THE_OWNERS_WORDS_COVER: readonly string[]
let BRIEF_TOKEN_BUDGET: number
let CHARS_PER_TOKEN: number

let t: TestDb
let app: FastifyInstance
let AS_THE_OWNER: Record<string, string>
let firstOwnerMessageId: string

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  // A refused write that this file did not notice would make every test below measure a project
  // that never got its records. It happened once, on a message with no recipient.
  expect(reply.statusCode, `POST ${path} answered ${String(reply.statusCode)}: ${reply.body}`).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, body))
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** The brief, and the exact text the server put on the wire, because one test compares them. */
async function readBrief(query = ''): Promise<{ brief: Record<string, unknown>; wire: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/brief${query}`, headers: AS_THE_OWNER })
  expect(reply.statusCode, `the brief answered ${String(reply.statusCode)}: ${reply.body}`).toBe(200)
  return { brief: JSON.parse(reply.body) as Record<string, unknown>, wire: reply.body }
}

function idOf(created: Record<string, unknown>): string {
  const record = created.record as { id?: string } | undefined
  expect(record?.id, `nothing was created: ${JSON.stringify(created).slice(0, 300)}`).toBeTruthy()
  return String(record?.id)
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the brief reads its chapters from the office's
  // chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  const http = await import('../src/server/lib/http.ts')
  const recordsLib = await import('../src/server/lib/records.ts')
  const brief = await import('../src/server/api/brief.ts')
  ACTOR_HEADERS = http.ACTOR_HEADERS
  WORKSPACE_HEADER = http.WORKSPACE_HEADER
  GOVERNANCE_GUARDS = recordsLib.GOVERNANCE_GUARDS
  VERBS_THE_OWNERS_WORDS_COVER = recordsLib.VERBS_THE_OWNERS_WORDS_COVER
  BRIEF_TOKEN_BUDGET = brief.BRIEF_TOKEN_BUDGET
  CHARS_PER_TOKEN = brief.CHARS_PER_TOKEN
  AS_THE_OWNER = {
    'content-type': 'application/json',
    [WORKSPACE_HEADER]: 'default',
    [ACTOR_HEADERS.type]: 'human',
    [ACTOR_HEADERS.id]: THE_PERSON,
  }
  const built = await apiApp()
  app = built.app
  await app.ready()

  await post('/api/records', {
    kind: 'module',
    title: 'The thing an arriving agent should be told about',
    data: {
      context: 'What this module is for.',
      parts: [{ id: 'p1', name: 'A part', items: [{ id: 'i1', text: 'A step', state: 'todo' }] }],
      summary: 'A person wrote this paragraph so that an agent would not have to read the code.',
    },
  })
  // Two open loops the attention rule treats differently, so the order can be asserted at all.
  // A problem whose state is `open` counts as work that stopped short, which is one of the three
  // things the rule selects. An idea has no state field, so the rule does not select it.
  await post('/api/records', {
    kind: 'problem',
    title: 'Something is broken and nobody has fixed it',
    data: { state: 'open' },
  })
  const anIdea = idOf(
    await post('/api/records', {
      kind: 'idea',
      title: 'Something somebody thought of and nobody is owed',
      data: {},
    }),
  )
  // The idea is made the most recently changed of the two, so that the reading the brief starts
  // from puts the loop the attention rule does NOT rank first. Without this the two share one
  // wall-clock second, the order they arrive in is whatever the store gives, and the test below
  // would pass on a brief that never sorted anything.
  t.client.sqlite.prepare('update records set updated_at = ? where id = ?').run('2099-01-01 00:00:00', anIdea)
  // A message has to reach a registered agent that is neither its own sender nor Mole Office
  // itself, so this file registers one rather than picking whatever the registry happens to hold.
  await post('/api/records', {
    kind: 'agent',
    title: 'An agent that exists so a message can be addressed to something',
    data: { handle: 'a-reader', state: 'active' },
  })
  const firstOwnerMessage = await post('/api/records', {
    kind: 'message',
    title: 'What the person said',
    data: {
      body: 'Do the small one first, then tell me what it cost.',
      sentBy: { kind: 'person', id: THE_PERSON },
      to: [{ kind: 'agent', id: 'a-reader' }],
    },
  })
  firstOwnerMessageId = idOf(firstOwnerMessage)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('one read briefs an arriving agent', () => {
  it('carries the modules with the first sentence somebody curated, not just their titles', async () => {
    const { brief } = await readBrief()
    const modules = brief.modules as { title: string; line: string | null; lineFrom: string | null }[]
    expect(modules.length, 'the brief carried no modules at all').toBeGreaterThan(0)
    const one = modules.find((module) => module.title === 'The thing an arriving agent should be told about')
    expect(one, 'the module written for this test is not in the brief').toBeTruthy()
    expect(one?.line).toBe('A person wrote this paragraph so that an agent would not have to read the code.')
    expect(one?.lineFrom).toBe('summary')
  })

  it('says nobody wrote a summary rather than returning an empty one', async () => {
    const created = await post('/api/records', {
      kind: 'module',
      title: 'A module nobody has described',
      data: { context: 'Bare.', parts: [] },
    })
    const id = idOf(created)
    const { brief } = await readBrief()
    const modules = brief.modules as { id: string; line: string | null; lineFrom: string | null }[]
    const bare = modules.find((module) => module.id === id)
    expect(bare, 'the module with no summary was left out of the brief').toBeTruthy()
    expect(bare?.line, 'an unwritten summary came back as something other than null').toBeNull()
    expect(bare?.lineFrom).toBeNull()
  })

  it('carries the open work, and every row says which reading put it where it is', async () => {
    const { brief } = await readBrief()
    const work = brief.openWork as { loops: { id: string; rank: number | null; ranking: string }[]; order: string }
    expect(work.loops.length, 'the brief carried no open work').toBeGreaterThan(0)
    for (const loop of work.loops) {
      expect(loop.ranking.length, `the loop ${loop.id} does not say why it is where it is`).toBeGreaterThan(20)
    }
    // The attention rule's rows come first, in its order. Everything it did not rank follows.
    const ranks = work.loops.map((loop) => loop.rank)
    const ranked = ranks.filter((rank): rank is number => rank !== null)
    // Without one of each, the two assertions below are true of any order at all.
    expect(ranked.length, 'the attention rule ranked nothing, so this test measured nothing').toBeGreaterThan(0)
    expect(
      ranks.length - ranked.length,
      'the attention rule ranked everything, so this test measured nothing',
    ).toBeGreaterThan(0)
    expect(ranks.slice(0, ranked.length).every((rank) => rank !== null), 'a ranked loop was put after an unranked one').toBe(
      true,
    )
    expect([...ranked].sort((a, b) => a - b), 'the ranked loops are not in the attention rule order').toEqual(ranked)
  })

  it('carries the last ten decisions, newest first, and no more than ten', async () => {
    for (let n = 0; n < 12; n += 1) {
      await post('/api/records', {
        kind: 'decision',
        title: `A decision the owner made, number ${String(n)}`,
        data: { ...governsTheWholeProject(), replaces: [], option_taken: `option ${String(n)}`, decided_by: THE_PERSON },
      })
    }
    const { brief } = await readBrief()
    const decisions = brief.decisions as { title: string; createdAt: string }[]
    expect(decisions.length, 'the brief carried a different number of decisions from the ten asked for').toBe(10)
    const stamps = decisions.map((one) => one.createdAt)
    expect([...stamps].sort().reverse(), 'the decisions are not newest first').toEqual(stamps)
    // Twelve were written and ten came back, so two were cut. Which two is not asserted: these
    // stamps are wall-clock to the second and all twelve share one, so the cut is by the id
    // tie-break and naming a particular pair here would be asserting the tie-break, not the ten.
    const titles = new Set(decisions.map((one) => one.title))
    expect(titles.size, 'the brief carried the same decision twice').toBe(10)
  })

  it('takes the writing rules from the declarations that enforce them', async () => {
    type Writing = {
      headers: { whichProject: string; whoIsWriting: Record<string, string>; note?: string }
      governedActs: number
      whoMayDoWhat?: { act: string }[]
      kindsOnlyAPersonMayWrite: string[]
      warrant: { verbsItCovers: string[]; whatItIs?: string }
      secondLevel?: { held: string[]; ask: string }
    }
    // THE FACTS UNASKED, AND THE LIST OF ACTS ONE LEVEL DOWN, in round 46.
    const writing = (await readBrief()).brief.writing as Writing
    expect(writing.headers.whichProject).toBe(WORKSPACE_HEADER)
    expect(writing.headers.whoIsWriting).toEqual({ ...ACTOR_HEADERS })
    expect(writing.kindsOnlyAPersonMayWrite).toEqual([...HUMAN_ONLY_KINDS])
    expect(writing.warrant.verbsItCovers).toEqual([...VERBS_THE_OWNERS_WORDS_COVER])
    expect(writing.governedActs).toBe(GOVERNANCE_GUARDS.length)
    expect([writing.whoMayDoWhat, writing.headers.note, writing.warrant.whatItIs]).toEqual([undefined, undefined, undefined])
    expect(writing.secondLevel?.ask).toBe('GET /api/brief?secondLevel=show')
    expect(writing.secondLevel?.held.map((one) => one.split(':')[0])).toEqual(['headers.note', 'whoMayDoWhat', 'warrant.whatItIs'])

    const asked = (await readBrief('?secondLevel=show')).brief.writing as Writing
    expect(asked.secondLevel).toBeUndefined()
    expect(typeof asked.headers.note).toBe('string')
    expect(typeof asked.warrant.whatItIs).toBe('string')
    expect(
      asked.whoMayDoWhat?.map((one) => one.act),
      'the brief publishes a different set of governed acts from the registry that enforces them',
    ).toEqual(GOVERNANCE_GUARDS.map((guard) => guard.act))
    const misspelt = await app.inject({ method: 'GET', url: '/api/brief?secondLevel=yes', headers: AS_THE_OWNER })
    expect(misspelt.statusCode).toBe(400)
  })

  it('carries the owner’s own words, and counts the messages nobody recorded a sender for', async () => {
    const { brief } = await readBrief()
    const their = brief.hisWords as {
      words: { where: string; words: string }[]
      messagesWithNoRecordedSender: number
    }
    const mine = their.words.find((one) => one.words.startsWith('Do the small one first'))
    expect(mine, "the owner's own message is not in the brief").toBeTruthy()
    expect(mine?.where).toBe('a message the person wrote')
    expect(typeof their.messagesWithNoRecordedSender).toBe('number')
  })

  it('tells the run where the rule for the terminal and the office is', async () => {
    const { brief } = await readBrief()
    // THE NUMBER IS WORKED OUT FROM THIS OFFICE'S CHAPTER 9, as the brief works it out: the rule whose id is r-8. It is
    // not a fixed number, because an office that copied the default set and the office this repository is developed
    // in number it differently (wave 13w round 5: 5 and 7).
    const read = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_OWNER })
    expect(read.statusCode, read.body).toBe(200)
    const nine = (read.json() as { chapters: { n: number; outline: { id: string; name: string }[] }[] }).chapters.find((one) => one.n === 9)
    const at = nine?.outline.findIndex((rule) => rule.id === 'r-8') ?? -1
    expect(at, 'this office holds no chapter 9 rule r-8').toBeGreaterThan(-1)
    expect(
      brief.head as string,
      'the brief no longer points at chapter 9 rule r-8 by its number here, so a run is never told where the rule about ' +
        'the terminal and the office is',
    ).toContain(`chapter 9 rule ${String(at + 1)}, ${nine!.outline[at]!.name}.`)
  })

  it('measures itself against the reply the caller actually receives', async () => {
    const { brief, wire } = await readBrief()
    const size = brief.size as {
      characters: number
      bytes: number
      tokensEstimated: number
      fits: boolean
      openingCharacters: number
    }
    const head = brief.head as string
    // The opening is counted separately, because it quotes the brief's own size and a count that
    // included it would be a number quoting itself. The envelope then adds one key of its own.
    // What must never happen is the brief claiming a size the reply does not have.
    expect(size.characters, 'the brief claims to be longer than the reply it is in').toBeLessThanOrEqual(wire.length)
    expect(size.openingCharacters, 'the opening is not counted').toBe(head.length)
    expect(
      wire.length - size.characters - size.openingCharacters,
      'the brief has stopped measuring itself',
    ).toBeLessThan(200)
    expect(size.tokensEstimated).toBe(Math.round(size.characters / CHARS_PER_TOKEN))
    expect(size.fits).toBe(size.tokensEstimated <= BRIEF_TOKEN_BUDGET)
    const subtraction = brief.subtraction as LeftOutCounts
    const groups = brief.leftOutGroups as LeftOutGroup[]
    checkSubtraction('test brief empty', subtraction, groups)
    expect(subtraction).toMatchObject({ leftOut: 0, shortened: 0 })
    expect(groups).toEqual([{ cause: 'budget', bucket: 'word_list_budget', count: 0, ids: [] }])
  })

  it('names what it dropped, and where to get it, when it does not fit', async () => {
    // Ten decisions with a very long option each, so the reply cannot fit the budget whole. The
    // last ten decisions are not on the ladder, so no rung can save it. A module no longer can do
    // this: the brief carries its name, its state and one line (round 47 of wave 13q). 60,000
    // characters of options, because 50,000 stopped overflowing once the opening was shortened.
    const paragraph = 'The option a person took, written out at length. '.repeat(120)
    // A NEW SECOND FIRST. Stamps are to the second and the twelve short decisions above may share
    // one with these, and then the id tie-break picks which ten are carried: by chance, short ones.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    for (let n = 0; n < 10; n += 1) {
      await post('/api/records', {
        kind: 'decision',
        title: `A decision with far too much written about it ${String(n)}`,
        data: { option_taken: paragraph, ...governsTheWholeProject(), replaces: [] },
      })
    }
    const addedOwnerMessageIds: string[] = []
    for (let n = 0; n < 4; n += 1) {
      const message = await post('/api/records', {
        kind: 'message',
        title: `More of what the owner said ${String(n)}`,
        data: {
          body: `Owner words ${String(n)}.`,
          sentBy: { kind: 'person', id: THE_PERSON },
          to: [{ kind: 'agent', id: 'a-reader' }],
        },
      })
      addedOwnerMessageIds.push(idOf(message))
    }
    const { brief } = await readBrief()
    const size = brief.size as { tokensEstimated: number; fits: boolean }
    const leftOut = brief.leftOut as { rung: string; what: string; ask: string; howMany: number }[]
    expect(size.tokensEstimated, 'the reply did not grow, so nothing about dropping was measured').toBeGreaterThan(1000)
    expect(leftOut.length, 'the brief was over budget and named nothing it had dropped').toBeGreaterThan(0)
    for (const gone of leftOut) {
      expect(gone.ask.length, `the rung ${gone.rung} does not say where to get what it dropped`).toBeGreaterThan(5)
    }
    const subtraction = brief.subtraction as LeftOutCounts
    const groups = brief.leftOutGroups as LeftOutGroup[]
    checkSubtraction('test brief word list', subtraction, groups)
    expect(subtraction.leftOut).toBeGreaterThan(0)
    expect(groups).toEqual([expect.objectContaining({ cause: 'budget', bucket: 'word_list_budget' })])
    expect(groups[0]?.count).toBe(subtraction.leftOut)
    expect(groups[0]?.ids).toHaveLength(subtraction.leftOut)
    expect(leftOut.find((one) => one.rung === 'the-persons-words')?.howMany).toBe(subtraction.leftOut)
    expect(leftOut.find((one) => one.rung === 'the-persons-words')?.ask, 'the rung names a read that answers without the words').toContain('full=1')
    // THE RUNG'S ASK, FOLLOWED AS WRITTEN, ANSWERS THE PERSON'S OWN MESSAGES WITH THEIR WORDS (round 2 of line 14c, at
    // the join). The pool answers one page now, so the ask names the person as sender and asks for the whole entry. A
    // message an agent sent the person is filed first, so a read that dropped the sender would answer it too.
    // MUTATION: make a full read that names a sender answer without each message's body, and the words are missing;
    // take the sender out of the rung's ask and the agent's message is in the answer. Taking `&full=1` out of the ask
    // is caught sooner, by the check above that the ask names it.
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'message',
      title: 'What an agent told the person',
      data: { body: 'Agent words, not the person’s.', to: [{ kind: 'person', id: THE_PERSON }] },
      actor: { type: 'agent', id: 'a-reader' },
    })
    const everyone = await app.inject({ method: 'GET', url: '/api/messages?full=1&limit=1000', headers: AS_THE_OWNER })
    const everyonesMessages = (everyone.json() as { messages: { sentBy: { kind: string } | null }[] }).messages
    expect(everyonesMessages.some((one) => one.sentBy?.kind === 'agent'), 'this office holds no message from anybody but the person').toBe(true)
    const rungAsk = leftOut.find((one) => one.rung === 'the-persons-words')?.ask ?? ''
    expect(rungAsk.startsWith('GET /api/'), `the rung's ask is not a read this file can follow: ${rungAsk}`).toBe(true)
    const followed = await app.inject({ method: 'GET', url: rungAsk.slice('GET '.length), headers: AS_THE_OWNER })
    expect(followed.statusCode, `the rung's ask answered ${String(followed.statusCode)}: ${followed.body.slice(0, 300)}`).toBe(200)
    const answered = (followed.json() as { messages: { id: string; sentBy: { kind: string; id: string } | null; body?: unknown }[] }).messages
    const wordsWritten = new Map([
      [firstOwnerMessageId, 'Do the small one first, then tell me what it cost.'],
      ...addedOwnerMessageIds.map((id, n): [string, string] => [id, `Owner words ${String(n)}.`]),
    ])
    expect(answered.map((one) => one.id).sort(), 'the rung’s ask did not answer exactly the person’s messages').toEqual([...wordsWritten.keys()].sort())
    for (const one of answered) {
      expect(one.sentBy, `message ${one.id} in the rung's answer was not sent by the person`).toEqual({ kind: 'person', id: THE_PERSON })
      expect(one.body, `message ${one.id} came without the words the person wrote`).toBe(wordsWritten.get(one.id))
    }
    const carriedWordIds = (brief.hisWords as { words: { id: string }[] }).words.map((one) => one.id)
    const allOwnerMessageIds = new Set([firstOwnerMessageId, ...addedOwnerMessageIds])
    expect(subtraction.candidates).toBe(allOwnerMessageIds.size)
    expect(groups[0]?.ids?.every((id) => allOwnerMessageIds.has(id))).toBe(true)
    expect(carriedWordIds.length + (groups[0]?.ids?.length ?? 0)).toBe(allOwnerMessageIds.size)
    expect(groups[0]?.ids?.every((id) => !carriedWordIds.includes(id))).toBe(true)
  })
})
