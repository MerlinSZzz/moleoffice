// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUOTE FROM A FILE NAMES THE FILE AND THE PAGE, IN WHAT AN AGENT RECEIVES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Words selected in a file the office draws are kept as a quote place, `{at: "quote", words}`,
 * because no stored string holds them. The quote place may now also hold `file`, the name the file
 * was shown under when the words were selected, and `page`, the page of a PDF they were on, counted
 * from 1. This file holds:
 *
 *   1. The hand-over to an agent writes the quote's first line with the file and the page, or with
 *      the file alone when no page was recorded. A quote place with neither keeps the line it had.
 *   2. The message door stores a quote place with a file and a page, and the read of that message
 *      gives the place back as it was stored.
 *   3. The door of a conversation with an agent takes the same keys in a comment's context.
 *   4. Both doors refuse a page that is not a whole number of 1 or more, a page without a file, an
 *      empty file name and a name longer than the office's bound for a file's name. Each is refused
 *      for what it holds, not as a key the door does not know, and the message door writes nothing.
 *   5. A name exactly as long as that bound is taken.
 *   6. GET /api/kinds declares both keys on the quote place, each with a description and an example.
 *
 * On the code before the quote place held a file and a page, both doors refuse the two keys as keys
 * they do not know, the hand-over's first line names only the block, and GET /api/kinds declares
 * neither key, so every case here fails.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { quotesOf, theMessageAnAgentReads } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nameTarget, type Context } from '../src/shared/targets.ts'
import { MAX_REPORT_FILE_NAME } from '../src/shared/report-file-name-limit.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** A handle of its own for each case: a handle is unique across every agent a project has ever had. */
let caseNumber = 0

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Made-up names and words, which no other fixture has any reason to hold. */
const PDF_NAME = 'made-up-two-pages.pdf'
const DOCX_NAME = 'made-up-notes.docx'
const PDF_WORDS = 'Kittiwake-ledger-6202'
const DOCX_WORDS = 'the shelf was moved'
/** Words that mean "this door does not know the key", in Mole Office's own refusal and in zod's. */
const AN_UNKNOWN_KEY = /unknown key|unrecognized key/i

async function inject(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers }
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

async function register(handle: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['agent'] as { id: string }).id
}

/** A record to quote, filed by the person. */
async function aRecord(title: string): Promise<string> {
  const reply = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'problem', title, data: {} })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['record'] as { id: string }).id
}

const theRecord = (recordId: string): Context['target'] => ({ kind: 'record', recordId, workspaceId: WS })

/** An agent's message to the person, quoting the places given. */
function send(sender: string, quotes: readonly Record<string, unknown>[]) {
  return inject('POST', '/api/records', asAgent(sender), {
    kind: 'message',
    title: 'about a file',
    data: { body: 'These are the words I mean.', to: [{ kind: 'person', id: THE_PERSON }], quotes },
  })
}

/** The person's comment in a new conversation with an agent, about the context given. */
async function comment(context: Record<string, unknown>) {
  const thread = await inject('POST', '/api/agent/threads', AS_THE_PERSON, { title: 'About a file', mode: 'direct' })
  expect(thread.status, thread.text).toBe(201)
  const id = (thread.json['thread'] as { id: string }).id
  return inject('POST', `/api/agent/threads/${id}/messages`, AS_THE_PERSON, {
    intent: 'ask',
    body: 'Which ledger is this?',
    context,
  })
}

function messageCount(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

/** A file's name of exactly this many characters, ending as a PDF's name does. */
const aNameOf = (length: number): string => `${'n'.repeat(length - '.pdf'.length)}.pdf`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(() => {
  caseNumber += 1
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a quote from a file names the file and the page', () => {
  it('writes the file and the page in the first line of the quote an agent is handed', () => {
    const block = { kind: 'reportBlock', recordId: 'MadeUpRec001', blockId: 'pdf' } as const
    const source = nameTarget(block)
    const quotes: Context[] = [
      { target: block, place: { at: 'quote', words: PDF_WORDS, file: PDF_NAME, page: 2 } },
      { target: block, place: { at: 'quote', words: DOCX_WORDS, file: DOCX_NAME } },
      { target: block, place: { at: 'quote', words: 'a plain quote' } },
    ]
    const said = theMessageAnAgentReads('After the quotes.', quotes, null).split('\n')
    expect(said).toEqual([
      `QUOTE FROM the file ${PDF_NAME}, page 2, in ${source}:`,
      `> ${PDF_WORDS}`,
      'END QUOTE',
      `QUOTE FROM the file ${DOCX_NAME}, in ${source}:`,
      `> ${DOCX_WORDS}`,
      'END QUOTE',
      `QUOTE FROM ${source}:`,
      '> a plain quote',
      'END QUOTE',
      'After the quotes.',
    ])
  })

  it('stores a quote place with a file and a page, and the read of the message gives it back as stored', async () => {
    const sender = await register(`qf-sender-${String(caseNumber)}`)
    const [a, b] = [await aRecord('the ledger was read'), await aRecord('the notes were read')]
    const fromThePdf = { at: 'quote', words: PDF_WORDS, file: PDF_NAME, page: 2 }
    const fromTheDocx = { at: 'quote', words: DOCX_WORDS, file: DOCX_NAME }
    const reply = await send(sender, [
      { target: theRecord(a), place: fromThePdf },
      { target: theRecord(b), place: fromTheDocx },
    ])
    expect(reply.status, reply.text).toBe(201)
    const record = reply.json['record'] as { id: string; kind: string; data: Record<string, unknown> }
    expect(quotesOf(record).map((quote) => quote.place)).toEqual([fromThePdf, fromTheDocx])

    const read = await inject('GET', `/api/messages/${record.id}`, AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    const wire = read.json['message'] as { quotes: { place?: unknown }[] }
    expect(wire.quotes.map((quote) => quote.place)).toEqual([fromThePdf, fromTheDocx])
  })

  it("takes the same keys in a comment's context on the door of a conversation with an agent", async () => {
    const a = await aRecord('the ledger was talked about')
    const place = { at: 'quote', words: PDF_WORDS, file: PDF_NAME, page: 2 }
    const reply = await comment({ target: theRecord(a), place })
    expect(reply.status, reply.text).toBe(201)
    expect((reply.json['message'] as { context: { place?: unknown } | null }).context?.place).toEqual(place)
  })

  it.each([
    { what: 'a page of 0', place: { at: 'quote', words: PDF_WORDS, file: PDF_NAME, page: 0 } },
    { what: 'a page that is not whole', place: { at: 'quote', words: PDF_WORDS, file: PDF_NAME, page: 1.5 } },
    { what: 'a page without a file', place: { at: 'quote', words: PDF_WORDS, page: 2 } },
    { what: 'an empty file name', place: { at: 'quote', words: PDF_WORDS, file: '' } },
    { what: "a name longer than the bound for a file's name", place: { at: 'quote', words: PDF_WORDS, file: aNameOf(MAX_REPORT_FILE_NAME + 1) } },
  ])('refuses $what on both doors, for what it holds, and the message door writes nothing', async ({ place }) => {
    const sender = await register(`qf-sender-${String(caseNumber)}`)
    const a = await aRecord('the ledger was misread')
    const before = messageCount()
    const sent = await send(sender, [{ target: theRecord(a), place }])
    expect(sent.status, sent.text).toBe(400)
    expect(sent.text, 'the message door refused the key itself, not what it holds').not.toMatch(AN_UNKNOWN_KEY)
    expect(messageCount()).toBe(before)

    const commented = await comment({ target: theRecord(a), place })
    expect(commented.status, commented.text).toBe(400)
    expect(commented.text, 'the conversation door refused the key itself, not what it holds').not.toMatch(AN_UNKNOWN_KEY)
  })

  it("takes a file's name exactly as long as the office's bound for one", async () => {
    const sender = await register(`qf-sender-${String(caseNumber)}`)
    const a = await aRecord('the long name was read')
    const place = { at: 'quote', words: PDF_WORDS, file: aNameOf(MAX_REPORT_FILE_NAME), page: 1 }
    const sent = await send(sender, [{ target: theRecord(a), place }])
    expect(sent.status, sent.text).toBe(201)
    expect(quotesOf(sent.json['record'] as { kind: string; data: Record<string, unknown> })[0]?.place).toEqual(place)

    const commented = await comment({ target: theRecord(a), place })
    expect(commented.status, commented.text).toBe(201)
  })

  it('declares the file and the page on the quote place in GET /api/kinds, each with a description and an example', async () => {
    const reply = await inject('GET', '/api/kinds', AS_THE_PERSON)
    expect(reply.status, reply.text).toBe(200)
    type Field = { key: string; type: string; required: boolean; description: string; example?: unknown }
    const shapes = reply.json['shapes'] as { name: string; fields: Field[] }[]
    const quote = shapes.find((shape) => shape.name === 'QuotePlace')
    expect(quote, 'GET /api/kinds declares no quote place').toBeDefined()
    const field = (key: string): Field | undefined => quote?.fields.find((one) => one.key === key)

    expect(field('file')).toMatchObject({ type: 'string', required: false })
    expect(field('file')?.description.length ?? 0).toBeGreaterThan(0)
    expect(typeof field('file')?.example).toBe('string')

    expect(field('page')).toMatchObject({ type: 'number', required: false })
    expect(field('page')?.description.length ?? 0).toBeGreaterThan(0)
    expect(typeof field('page')?.example).toBe('number')
  })
})
