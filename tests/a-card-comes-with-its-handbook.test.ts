// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD COMES WITH ITS HANDBOOK: SENT ONCE, AT ONCE, IN THE AGENT'S LANGUAGE.
 *
 * When an agent is registered with a card, or given one later, the office sends it that card's working
 * handbook at once and unasked, as one message. The handbook is the card's
 * How it works and, for the secretary, its practical part. The texts live in
 * `design/permissions/roles.json` in both languages, as question 24 of a decision
 * says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, THROUGH THE REAL DOORS
 * ---------------------------------------------------------------------------------------
 *
 * Most cases give the server a TEST COPY of roles.json, the real file with MADE-UP handbook texts
 * written onto three cards and none on the inspector's. Those cases hold no real handbook.
 *
 * The last case reads the REAL roles.json, as the server reads it when it starts. It is the one case
 * that proves the real texts reach an agent, in its own language, through a real listener: the
 * waiter an agent runs (`tools/hold-the-handle.mjs`), holding the agent's handle against this
 * server on a scratch port. Item 1 of a decision wrote those texts in the third person so one text
 * reads right to the agent that receives it.
 *
 *   · a registration with a card and a language writes ONE message, the card message, and it carries
 *     that card's handbook in that language and not in the other;
 *   · a later card grant carries the new card's handbook, both parts of it where the card has two;
 *   · nothing is sent twice: a card given again after another, a restart, and a second registration
 *     under the same handle send no handbook again, and the card message names the message that
 *     carried it;
 *   · an agent whose language nobody gave gets every language, with the sentence saying why;
 *   · a card with no handbook says so and marks nothing;
 *   · the started door refuses a language the office has no texts in, and writes nothing;
 *   · GET /api/roles serves both languages of each part, from the file;
 *   · the declaration refuses a part written in one language only;
 *   · with the REAL roles.json, every agent card that carries a handbook sends it to a listening
 *     agent registered in English in English, and to one registered in Chinese in Chinese, and
 *     the other language is not in what the listener prints.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   `theHandbookWasSentIn` answers null every time → the "nothing twice" case red.
 *   `theLanguageOfTheAgent` answers 'en' every time → the registration case red (the Chinese agent
 *     gets the English text).
 *   `writeTheCardMessageToOne` sends the handbook only when `change` is null → the later-grant case red.
 *   the completeness check in `oneCardsProblems` removed → the declaration case red.
 *   the worker card's `howItWorks` taken out of the real roles.json → the real-texts case red (the
 *     list of cards with a handbook no longer names the worker).
 *   `theLanguageOfTheAgent` answers 'en' every time → the real-texts case red (the Chinese listener
 *     prints the English text).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { HANDBOOK_LANGUAGES, problemsWithTheRoleDeclaration, theHandbookOf, type RolesDeclaration } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance
let reader: typeof import('../src/server/lib/roles.ts')
let guardActKeys: (string | null)[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** MADE-UP handbook texts. Each names its card, its part and its language, so a mix-up is visible. */
const MADE_UP = {
  worker: { howItWorks: { en: 'MADE-UP worker how-it-works, English.', zh: '虚构的工人工作方式，中文。' } },
  supervisor: { howItWorks: { en: 'MADE-UP supervisor how-it-works, English.', zh: '虚构的主管工作方式，中文。' } },
  secretary: {
    howItWorks: { en: 'MADE-UP secretary how-it-works, English.', zh: '虚构的秘书工作方式，中文。' },
    inPractice: { en: 'MADE-UP secretary practice, English.', zh: '虚构的秘书实务，中文。' },
  },
} as const

/** The real declaration with the made-up texts on it, in a file of this test's own. */
function theTestDeclaration(): RolesDeclaration {
  const decl = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  for (const card of decl.cards) {
    const texts = (MADE_UP as Record<string, Record<string, { en: string; zh: string }>>)[card.name]
    // THE INSPECTOR IS LEFT WITH NONE, which is the card-with-no-handbook case.
    delete card.howItWorks
    delete card.inPractice
    if (texts !== undefined) Object.assign(card, texts)
  }
  return decl
}

/** Put the test declaration in front of the running server, the way a restart after an edit would. */
function readTheTestCards(): void {
  const file = join(mkdtempSync(join(tmpdir(), 'mole-office-handbook-')), 'roles.json')
  writeFileSync(file, JSON.stringify(theTestDeclaration(), null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys, file })
}

async function inject(
  method: 'GET' | 'POST',
  url: string,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers: AS_THE_PERSON }
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

/** Register through the starter door, as the person. */
async function started(body: Record<string, unknown>): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  return inject('POST', '/api/agents/started', body)
}

/** Give a card, as the person. */
async function give(handle: string, role: string): Promise<void> {
  const reply = await inject('POST', `/api/roles/card/${handle}`, { role })
  expect(reply.status, reply.text).toBe(201)
}

interface CardMessage {
  id: string
  body: string
  saidInFull: string
  mark: { card?: string; languages?: string[] } | null
}

/** Every message waiting for the agent, through the waiter's own door, oldest first. */
async function messagesFor(handle: string): Promise<CardMessage[]> {
  const waiting = await inject('GET', `/api/handles/${handle}/waiting`)
  expect(waiting.status, waiting.text).toBe(200)
  const out: CardMessage[] = []
  for (const one of (waiting.json as { waiting: { messageId: string }[] }).waiting) {
    const reply = await inject('GET', `/api/records/${one.messageId}`)
    expect(reply.status, reply.text).toBe(200)
    const data = (reply.json['record'] as { data: Record<string, unknown> }).data
    const extra = (data['extra'] ?? {}) as Record<string, unknown>
    out.push({
      id: one.messageId,
      body: String(data['body']),
      saidInFull: String(data['saidInFull'] ?? ''),
      mark: (extra['handbookSent'] as CardMessage['mark']) ?? null,
    })
  }
  return out
}

/** The heading a handbook goes under, in one language, from the word lists. */
const heading = (language: 'en' | 'zh', card: string): string =>
  createI18n(language).t('cardHandbook.heading', { card })

/** How many times a text appears across every message an agent holds. */
function timesSent(messages: readonly CardMessage[], text: string): number {
  return messages.reduce((n, one) => n + one.saidInFull.split(text).length - 1, 0)
}

/**
 * ONE OFFICE FOR THE FILE. Each case registers agents under handles of its own, and the waiting
 * list it reads is that agent's own. beforeEach puts the test declaration in front of the server
 * again, because the case about the real handbooks reads the real file and leaves it there.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  reader = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  reader.forgetTheRoleCards()
})

beforeEach(() => {
  readTheTestCards()
})

describe('a registration with a card sends that card’s handbook once, in the agent’s language', () => {
  it('sends the supervisor’s in Chinese to a Chinese reader and in English to an English one', async () => {
    for (const [handle, language, other] of [
      ['sup-zh', 'zh', 'en'],
      ['sup-en', 'en', 'zh'],
    ] as const) {
      const done = await started({ handle, name: handle, role: 'supervisor', language })
      expect(done.status, done.text).toBe(201)
      const messages = await messagesFor(handle)
      // ONE MESSAGE: the card and its handbook arrive together.
      expect(messages.length, `${handle}: a registration wrote ${String(messages.length)} messages`).toBe(1)
      const message = messages[0]!
      expect(message.body).toBe(SYSTEM_LINES.youHoldACard('supervisor', '').line)
      expect(message.saidInFull, `${handle}: the handbook is not in its language`).toContain(
        `${heading(language, 'supervisor')}\n\n${MADE_UP.supervisor.howItWorks[language]}`,
      )
      expect(message.saidInFull, `${handle}: the other language was sent too`).not.toContain(
        MADE_UP.supervisor.howItWorks[other],
      )
      expect(message.mark).toEqual({ card: 'supervisor', languages: [language] })
    }
  })
})

describe('a later card grant sends the new card’s handbook', () => {
  it('carries the secretary’s two parts, in the agent’s language, in the change message', async () => {
    expect((await started({ handle: 'w-en', name: 'w-en', language: 'en' })).status).toBe(201)
    const [registered] = await messagesFor('w-en')
    expect(registered!.saidInFull, 'the worker registration carried no handbook').toContain(MADE_UP.worker.howItWorks.en)

    await give('w-en', 'secretary')
    const messages = await messagesFor('w-en')
    expect(messages.length, 'the grant wrote no message').toBe(2)
    const found = messages.find((one) => one.saidInFull.startsWith('Your card changed from the worker card to the secretary card'))
    expect(found, 'the grant wrote no change message').toBeDefined()
    const changed = found!
    expect(changed.saidInFull, 'the new card’s handbook is not in the grant').toContain(
      `${heading('en', 'secretary')}\n\n${MADE_UP.secretary.howItWorks.en}\n\n${MADE_UP.secretary.inPractice.en}`,
    )
    expect(changed.saidInFull, 'the old card’s handbook was sent again').not.toContain(MADE_UP.worker.howItWorks.en)
    expect(changed.saidInFull).not.toContain(MADE_UP.secretary.howItWorks.zh)
    expect(changed.mark).toEqual({ card: 'secretary', languages: ['en'] })
  })
})

describe('nothing is sent twice', () => {
  it('does not send a handbook again for a card given again, after a restart, or on a second registration', async () => {
    expect((await started({ handle: 'w-twice', name: 'w-twice', language: 'zh' })).status).toBe(201)
    await give('w-twice', 'supervisor')
    // THE WORKER CARD AGAIN, after another card: the card message comes, the handbook does not.
    await give('w-twice', 'worker')
    let messages = await messagesFor('w-twice')
    expect(messages.length).toBe(3)
    // FOUND BY WHAT EACH SAYS: the waiting list is not in the order the messages were written.
    const workerFirst = messages.find((one) => one.mark?.card === 'worker')
    const workerAgain = messages.find((one) => one.saidInFull.startsWith('Your card changed from the supervisor card to the worker card'))
    expect(workerFirst, 'the registration carried no worker handbook').toBeDefined()
    expect(workerAgain, 'giving the worker card again wrote no card message').toBeDefined()
    expect(workerAgain!.saidInFull, 'the worker handbook was sent twice').not.toContain(MADE_UP.worker.howItWorks.zh)
    expect(workerAgain!.saidInFull, 'the card message does not name where the handbook went').toContain(
      `The worker card's handbook was sent to you before, in message ${workerFirst!.id}, and is not sent again.`,
    )
    expect(workerAgain!.mark, 'a message with no handbook in it was marked as carrying one').toBeNull()

    // A RESTART: a new server on the same database, reading the cards again.
    await app.close()
    app = (await apiApp()).app
    await app.ready()
    readTheTestCards()
    await give('w-twice', 'supervisor')
    messages = await messagesFor('w-twice')
    expect(messages.length, 'the grant after the restart wrote no card message').toBe(4)
    expect(timesSent(messages, MADE_UP.supervisor.howItWorks.zh), 'the supervisor handbook after a restart').toBe(1)

    // A SECOND REGISTRATION UNDER THE SAME HANDLE writes no second handbook, whatever it answers.
    await started({ handle: 'w-twice', name: 'w-twice', role: 'supervisor', language: 'zh' })
    messages = await messagesFor('w-twice')
    expect(timesSent(messages, MADE_UP.worker.howItWorks.zh), 'the worker handbook').toBe(1)
    expect(timesSent(messages, MADE_UP.supervisor.howItWorks.zh), 'the supervisor handbook').toBe(1)
  })
})

describe('what is said where the office cannot send one language', () => {
  it('sends every language, and says why, to an agent whose language nobody gave', async () => {
    expect((await started({ handle: 'w-unsaid', name: 'w-unsaid' })).status).toBe(201)
    const [message] = await messagesFor('w-unsaid')
    expect(message!.saidInFull).toContain(
      "Nobody told the office which language you read, so the worker card's handbook follows in each language it is " +
        'written in: en, zh.',
    )
    expect(message!.saidInFull).toContain(`${heading('en', 'worker')}\n\n${MADE_UP.worker.howItWorks.en}`)
    expect(message!.saidInFull).toContain(`${heading('zh', 'worker')}\n\n${MADE_UP.worker.howItWorks.zh}`)
    expect(message!.mark).toEqual({ card: 'worker', languages: ['en', 'zh'] })
  })

  it('sends the English handbook, and says why, to a reader whose language has no handbook', async () => {
    expect((await started({ handle: 'w-el', name: 'w-el', language: 'el' })).status).toBe(201)
    const [message] = await messagesFor('w-el')
    expect(message!.saidInFull).toContain(
      `The worker card's handbook is written in ${HANDBOOK_LANGUAGES.join(' and ')}, so the English one follows; the office has no handbook in the language you read.`,
    )
    expect(message!.saidInFull).toContain(`${heading('en', 'worker')}\n\n${MADE_UP.worker.howItWorks.en}`)
    expect(message!.saidInFull).not.toContain(heading('zh', 'worker'))
    expect(message!.mark).toEqual({ card: 'worker', languages: ['en'] })
  })

  it('says a card has no handbook, and marks nothing', async () => {
    expect((await started({ handle: 'i-one', name: 'i-one', role: 'inspector', language: 'en' })).status).toBe(201)
    const [message] = await messagesFor('i-one')
    expect(message!.saidInFull).toContain(
      `The inspector card has no handbook in ${reader.ROLE_CARDS_FILE} yet, so none is sent.`,
    )
    expect(message!.mark).toBeNull()
  })

  it('refuses a language the office has no texts in, and writes nothing', async () => {
    const refused = await started({ handle: 'w-fr', name: 'w-fr', language: 'fr' })
    expect(refused.status, refused.text).toBe(400)
    expect(refused.text).toContain('language is one of en, zh')
    const waiting = await inject('GET', '/api/handles/w-fr/waiting')
    expect(waiting.status, 'a refused registration wrote an agent').not.toBe(200)
  })
})

describe('the texts are served from roles.json, in both languages', () => {
  it('answers each part of each handbook in both languages at GET /api/roles', async () => {
    const reply = await inject('GET', '/api/roles')
    expect(reply.status, reply.text).toBe(200)
    const cards = reply.json['cards'] as { name: string; howItWorks?: unknown; inPractice?: unknown }[]
    expect(cards.find((one) => one.name === 'secretary')?.howItWorks).toEqual(MADE_UP.secretary.howItWorks)
    expect(cards.find((one) => one.name === 'secretary')?.inPractice).toEqual(MADE_UP.secretary.inPractice)
    expect(cards.find((one) => one.name === 'worker')?.howItWorks).toEqual(MADE_UP.worker.howItWorks)
    expect(cards.find((one) => one.name === 'inspector')?.howItWorks).toBeUndefined()
  })

  it('refuses a declaration whose part is written in one language only', () => {
    const decl = theTestDeclaration()
    const worker = decl.cards.find((one) => one.name === 'worker')!
    // THE CONTROL: the test declaration itself is usable.
    expect(problemsWithTheRoleDeclaration(decl)).toEqual([])
    ;(worker as unknown as Record<string, unknown>)['howItWorks'] = { en: MADE_UP.worker.howItWorks.en }
    expect(problemsWithTheRoleDeclaration(decl).join(' ')).toContain('The worker card has a howItWorks that is not one text')
  })
})

/**
 * THE REAL TEXTS, THROUGH A REAL LISTENER.
 *
 * The server forgets the test copy and reads the real roles.json. Each agent is registered through
 * the starter door with a card and a language. Then the waiter the agent would run is started as its
 * own process against this server on a scratch port. It holds the handle, finds the card message
 * waiting, prints it and exits. What it printed is what the agent would read.
 */
describe('the real handbooks from roles.json reach a listening agent in its language', () => {
  const waiters: ChildProcess[] = []

  afterEach(() => {
    for (const child of waiters.splice(0)) {
      if (child.pid === undefined) continue
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // Already gone, which is what this wanted.
      }
    }
  })

  /** Start the agent's waiter against the listening server, and say what it printed when it stops. */
  function startTheWaiter(api: string, handle: string, session: string, keyFile: string): { said: () => string; ended: Promise<number> } {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
        '--agent',
        handle,
        '--session',
        session,
        '--api',
        api,
        '--workspace',
        'default',
      ],
      { env: { ...process.env, MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: keyFile, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
    )
    waiters.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
    return { said: () => printed, ended }
  }

  it('sends each agent card’s real handbook in English to an English agent and in Chinese to a Chinese one', async () => {
    // THE REAL FILE, read the way the server reads it when it starts.
    reader.forgetTheRoleCards()
    const real = reader.readTheRoleCards({ guardActKeys })
    const withAHandbook = real.cards.filter((card) => theHandbookOf(card, 'en') !== null)
    // THE CARDS THIS CASE MUST COVER. A card that lost its handbook drops out of the list above, so
    // the list is checked by name and a lost handbook is a red case, not a shorter loop.
    expect(withAHandbook.map((card) => card.name).sort(), 'an agent card has no handbook in roles.json').toEqual(
      ['inspector', 'secretary', 'supervisor', 'worker'],
    )

    await app.listen({ host: '127.0.0.1', port: 0 })
    const api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

    for (const card of withAHandbook) {
      for (const [language, other] of [
        ['en', 'zh'],
        ['zh', 'en'],
      ] as const) {
        const handle = `real-${card.name}-${language}`
        const done = await started({ handle, name: handle, role: card.name, language })
        expect(done.status, done.text).toBe(201)
        const key = (done.json['whatToGiveIt'] as { key: string }).key
        const keyFile = join(dirname(t.file), `${handle}.key`)
        writeFileSync(keyFile, key, { mode: 0o600 })
        const filed = await inject('POST', '/api/records', {
          kind: 'session',
          title: `A terminal answering as ${handle}`,
          data: { state: 'running', runtime: 'claude-code', doing: `answering as ${handle}` },
        })
        expect(filed.status, filed.text).toBe(201)
        const session = (filed.json['record'] as { id: string }).id

        const waiter = startTheWaiter(api, handle, session, keyFile)
        const code = await waiter.ended
        const printed = waiter.said()
        expect(code, printed).toBe(0)
        const mine = theHandbookOf(card, language)!
        const theirs = theHandbookOf(card, other)!
        expect(printed, `${handle}: the listener was not handed the ${card.name} handbook in ${language}`).toContain(
          `${heading(language, card.name)}\n\n${mine}`,
        )
        expect(printed, `${handle}: the listener was handed the ${other} handbook too`).not.toContain(theirs)
      }
    }
  }, 120_000)
})
