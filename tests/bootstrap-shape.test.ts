// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOOTSTRAP ANNOUNCES EXACTLY WHAT IT CARRIES, AND NAMES EVERYTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY A DERIVED WALK AND NOT A LIST OF NAMES
 * ---------------------------------------------------------------------------------------
 *
 * `chosen_by` announced twelve sections and the body carried four. `now`, `owner_waiting`, `forks`,
 * `open_loops` and `next` were in no key of the body and in no entry of `missing`, and three of them
 * said `assumed` — the word for a section that IS in the reply. That is the substitution `missing`
 * exists to prevent, on the read `.claude/skills/mole-office/SKILL.md` tells every fresh agent to make
 * first. An agent told `owner_waiting: assumed` and handed nothing cannot tell *nobody is waiting*
 * from *nobody looked*.
 *
 * SO NOTHING HERE IS A LIST OF SECTION NAMES TO COMPARE AGAINST. Every assertion below walks the
 * real reply and the real declaration. A test that named the twelve would have gone green against
 * the defect, because the defect was that the twelve were named and four were sent.
 *
 * The wave-13 verifier's mutation 24 is the second test in the first block: delete a delivered
 * section from the body and leave its `chosen_by` entry standing. Four test files stayed green when
 * that was done.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT ASSERT
 * ---------------------------------------------------------------------------------------
 *
 * Which members the three assembler slots would carry if their reader existed. That rule is
 * `agent-coordination.md` §6.1's — the cap, the ordering and the never-drop-a-blocking-member rule —
 * and writing it here would put it in two places, one of which would be wrong about a blocking
 * placeholder. What is held here is that with no reader built the slot is ABSENT and named, which is
 * this thread's half.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * EACH CASE GETS ITS OWN PROJECT, so the sections the bootstrap reads hold only the records that
 * case filed: `owner_waiting` counts this project's forks and `open_problems` this project's.
 */
let WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `bootstrap-case-${String(caseNumber)}`
  PERSON['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Bootstrap case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

interface Reply {
  missing: { slot: string; why: string; ask?: string }[]
  chosen_by: Record<string, string>
  owner_waiting: { waiting: number; holdingWorkUp: number; references: { recordId: string | null }[]; note: string }
  [key: string]: unknown
}

async function read(): Promise<{ reply: Reply; bytes: number }> {
  const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: PERSON })
  expect(res.statusCode).toBe(200)
  return { reply: res.json() as Reply, bytes: Buffer.byteLength(res.body, 'utf8') }
}

const declaration = async () => await import('../src/server/api/bootstrap.ts')

// ============================================================ announced, carried, or named as absent

describe('every section is announced, and every announced section is delivered or named', () => {
  it('announces one entry for each declared section, and no more', async () => {
    const { BOOTSTRAP_SECTIONS } = await declaration()
    const { reply } = await read()
    expect(Object.keys(reply.chosen_by).sort()).toEqual(BOOTSTRAP_SECTIONS.map((s) => s.section).sort())
  })

  it('carries a key of the body for every announced section, or an entry of `missing` and never neither', async () => {
    const { reply } = await read()
    const named = new Set(reply.missing.map((m) => m.slot))
    const neither = Object.keys(reply.chosen_by).filter((section) => !(section in reply) && !named.has(section))
    // THE VERIFIER'S MUTATION 24. Deleting a delivered section from the body while its `chosen_by`
    // entry stands puts that section in this list, and this line goes red. Before this file existed
    // it was done and four test files stayed green.
    expect(neither, 'these sections are announced, absent from the body, and named in `missing` by nothing').toEqual([])
  })

  it('never names a section in `missing` and also sends it, because that is two answers', async () => {
    const { reply } = await read()
    const both = reply.missing.map((m) => m.slot).filter((slot) => slot in reply)
    expect(both, 'these sections are named as absent and are in the body as well').toEqual([])
  })

  it('announces every key of the body that is a section, so nothing arrives unannounced', async () => {
    const { BOOTSTRAP_META_KEYS } = await declaration()
    const { reply } = await read()
    const unannounced = Object.keys(reply).filter((key) => !BOOTSTRAP_META_KEYS.includes(key) && !(key in reply.chosen_by))
    // A SECTION WITH NO `chosen_by` ENTRY IS A SECTION WITH NO STATED AUTHORITY, which is what this
    // whole field exists to stop. It is as much a fault as one announced and not sent.
    expect(unannounced, 'these are in the reply and nothing says on what authority').toEqual([])
  })

  it('never leaves `assumed` standing alone on a section it does not send', async () => {
    const { reply } = await read()
    const by = new Map(reply.missing.map((m) => [m.slot, m]))
    const assumedAndAbsent = Object.entries(reply.chosen_by)
      .filter(([section, word]) => word === 'assumed' && by.has(section))
      .map(([section]) => section)

    // `assumed` IS A CLAIM ABOUT AUTHORITY — nobody has measured this and it is promotable when
    // somebody does. On its own, beside nothing, it reads as a claim that the section is here, and
    // three sections said it while absent with nothing else said about them.
    //
    // It is not wrong to say `assumed` about an absent section; it is wrong to say ONLY that. So
    // every one of them has to be named in `missing`, and the reason has to be the one that says a
    // reader exists and this reply did not call it, with the request beside it. A reader meeting
    // `assumed` now also meets `{ why: "reader-not-called-here", ask: "GET /api/forks" }`.
    for (const section of assumedAndAbsent) {
      expect(by.get(section)?.why, section).toBe('reader-not-called-here')
      expect(by.get(section)?.ask, section).toMatch(/^GET \//)
    }
  })
})

// =============================================================================== how a slot is absent

describe('an absent slot says why, as an object and never as a bare name', () => {
  it('names each absent slot with a reason from the closed list', async () => {
    const { reply } = await read()
    expect(reply.missing.length).toBeGreaterThan(0)
    for (const slot of reply.missing) {
      expect(typeof slot.slot, 'a bare name gives "Mole Office looked" and "Mole Office did not look" one shape').toBe('string')
      expect(['reader-not-built', 'reader-not-called-here', 'nothing-computes-it']).toContain(slot.why)
    }
  })

  it('tells a slot nothing computes from one a live route answers', async () => {
    const { reply } = await read()
    const by = new Map(reply.missing.map((m) => [m.slot, m]))
    // THE ONES A CALLER CAN GO AND GET, each with the request that answers it. An agent told
    // `reader-not-built` about `forks` would conclude Mole Office cannot answer what is waiting on a
    // person, which is false.
    expect(by.get('forks')?.why).toBe('reader-not-called-here')
    expect(by.get('forks')?.ask).toBe('GET /api/forks')
    expect(by.get('open_loops')?.ask).toBe('GET /api/open-loops')
  })

  it('never returns an unbuilt reader as an empty list, which would say there are none', async () => {
    // WHICH SLOTS THOSE ARE IS READ FROM THE DECLARATION, NOT TYPED HERE. It used to be the two
    // words `now` and `next`, and `now` gained a reader on 6 September 2026 — the assembler's
    // campaign part, criterion B4 of design/bundle/ACCEPTANCE.md — so the list went out of date and
    // this case failed about a section that was working. A list of names is the exact defect this
    // file's own header says it does not carry.
    const { BOOTSTRAP_SECTIONS } = await declaration()
    const { reply } = await read()
    const notBuilt = BOOTSTRAP_SECTIONS.filter((s) => !s.delivered).map((s) => s.section)
    expect(notBuilt.length, 'this case proves nothing if every slot is delivered').toBeGreaterThan(0)
    for (const slot of notBuilt) {
      expect(reply[slot], `${slot} was sent instead of being named absent`).toBeUndefined()
    }
  })
})

// ============================================================== the two words for two kinds of nothing

describe('`chosen_by` tells permanent emptiness from temporary', () => {
  it('keeps the word for a section that will never be promotable', async () => {
    const { reply } = await read()
    expect(reply.chosen_by['now']).toBe('no single operation answers this')
    expect(reply.chosen_by['recent']).toBe('no single operation answers this')
  })

  /**
   * THE THREE SECTIONS THAT WERE WAITING ARE NO LONGER WAITING, AND THEY ARE THE REASON THE OTHER
   * WORD EXISTS. `work_domains`, `placeholders` and `checkpoint` said `no operation answers this
   * yet` and were absent, because the shared continuation assembler did not exist. It exists now,
   * so the honest answer is the section itself.
   *
   * WHAT THIS DOES NOT RELAX. The rule the old assertion protected was that a slot must never be
   * filled from a rule the bootstrap invented for itself. That rule is asserted here instead, and
   * harder: each of the three has to NAME the reader that answered it, and a name that is not a
   * function in `src/server/lib` fails. A hand-written section would have no reader to name.
   */
  it('delivers the three the assembler owns, each naming the reader that answered it', async () => {
    for (const slot of ['work_domains', 'placeholders', 'checkpoint']) {
      const { reply } = await read()
      const section = reply[slot] as { reader?: unknown; note?: unknown } | undefined
      expect(section, `${slot} is still absent`).toBeDefined()
      expect(String(section?.reader), `${slot} does not say what answered it`).toMatch(/\(src\/server\/lib\/.+\.ts\)$/)
      expect(String(section?.note).length, `${slot} says nothing about what it found`).toBeGreaterThan(20)
    }
  })

  it('leaves the waiting word declared, and uses it on nothing, because nothing is waiting', async () => {
    const { reply } = await read()
    // NOT AN ASSERTION THAT THE WORD IS GONE. A section CAN still be waiting on a reader somebody
    // has not written; none is today, and saying so in the reply is different from deleting the
    // vocabulary that would say it.
    const waiting = Object.entries(reply.chosen_by).filter(([, word]) => word === 'no operation answers this yet')
    expect(waiting.map(([section]) => section)).toEqual([])
  })

  it('says nothing is measured today, in the reply and not only in a design document', async () => {
    const { reply } = await read()
    expect(Object.values(reply.chosen_by).filter((word) => word.startsWith('measured'))).toEqual([])
    expect(reply['note']).toContain('No section of this reply says "measured"')
  })
})

// ============================================================================ what is waiting on a person

describe('what is waiting on a person is answered, not announced and withheld', () => {
  it('answers zero as a number and as a sentence, which is good news and not no news', async () => {
    const { reply } = await read()
    expect(reply.owner_waiting.waiting).toBe(0)
    expect(reply.owner_waiting.holdingWorkUp).toBe(0)
    expect(reply.owner_waiting.references.map((one: { recordId: string | null }) => one.recordId)).toEqual([])
    // NOT AN EMPTY SECTION. "No fork is open in this project" is the answer; an absent section would
    // say nobody looked, and those are the two facts this whole reply is built to keep apart. It
    // says it counts forks only, because a record whose move is the person's waits on the owner without
    // being a fork (problem fnH7QaRvvkd9), so "Nothing is waiting on you" would be false.
    expect(reply.owner_waiting.note).toContain('No fork is open in this project.')
    expect(reply.owner_waiting.note).toContain('counts forks only')
    expect(reply.owner_waiting.note).toContain('Everything waiting on the person is at GET /api/waiting.')
    expect(reply.owner_waiting.note).not.toContain('Nothing is waiting on you')
  })

  it('counts an unsettled fork, names it by id, and says how many are holding work up', async () => {
    const fork = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'proposal',
      title: 'Which way round should this go?',
      data: { question: 'Which way round should this go?', options: ['one', 'the other'] },
      actor: t.api.HUMAN,
    })
    const { reply } = await read()
    expect(reply.owner_waiting.waiting).toBe(1)
    expect(reply.owner_waiting.references.map((one: { recordId: string | null }) => one.recordId)).toEqual([fork.id])
    expect(reply.owner_waiting.note).toContain('1 thing only a person can do')
    // NOTHING IS HOLDING WORK UP HERE, and the sentence says which of the two it is rather than
    // leaving a reader to assume the worse one.
    expect(reply.owner_waiting.holdingWorkUp).toBe(0)
    expect(reply.owner_waiting.note).toContain('None of them is holding any work up')
  })

  it('names every fork and caps nothing, so no fork is dropped without saying so', async () => {
    for (let i = 0; i < 12; i += 1) {
      t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'proposal',
        title: `Fork ${String(i)}`,
        data: { question: `Question ${String(i)}`, options: ['a', 'b'] },
        actor: t.api.HUMAN,
      })
    }
    const { reply } = await read()
    expect(reply.owner_waiting.waiting).toBe(12)
    expect(reply.owner_waiting.references.map((one: { recordId: string | null }) => one.recordId).length).toBe(12)
  })
})

// ================================================================================= the size of the reply

describe('the reply fits in what a cold agent can afford to read', () => {
  it('stays under 32 KB against a corpus of fifty not-fixed problems', async () => {
    // THE FIXTURE IS THE RUNNING COPY'S FIFTY, stated rather than sampled, because the ceiling is
    // about a real corpus and a three-record fixture would pass whatever the reply carried.
    for (let i = 0; i < 50; i += 1) {
      t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'problem',
        title: `A problem nobody has fixed, number ${String(i)}, with a title about as long as the ones in the real corpus`,
        data: { state: i % 5 === 0 ? 'accepted' : 'open' },
        actor: t.api.HUMAN,
      })
    }
    const { reply, bytes } = await read()
    expect((reply['open_problems'] as unknown[]).length).toBe(50)
    expect(bytes, 'the bootstrap reply has grown past the ceiling a cold agent reads it under').toBeLessThan(32 * 1024)
  })
})
