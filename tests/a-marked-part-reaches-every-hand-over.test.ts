// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY HAND-OVER OF A MESSAGE CARRIES ITS MARKED PARTS (wave 14d, DB-1, case m).
 *
 * The waiter, the dsh SessionStart hook, the delivery checkpoint and the run prompt are four different readers of the
 * same message. The office works the parts out once, on the message's wire, with the flag's name and the person's
 * instruction as handed over. Every reader prints what it was handed, and two parts with different flags are compared
 * with each other: the shipped one and the person's own.
 *
 * The message, the agent, the run and both flags are made up for this test.
 *
 * MUTATIONS, each after a green control run, then restored (logs in out/wave-14d-db-r1):
 *   - `theMarkedPartsOnTheWire` answering undefined: this case goes red;
 *   - `deliveryEnvelope` never printing a part: this case goes red;
 *   - the waiter not passing the parts: this case goes red on the waiter.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it } from 'vitest'

import { DELIVERY_ENVELOPE, deliveryEnvelope } from '../src/shared/messages.ts'
import {
  theFlagsOf,
  theNameOfTheMark,
  whatTheMarkAsks,
  type AMarkedPartOnTheWire,
} from '../src/shared/intent-mark.ts'
import { whatIsNotCovered, type WrittenPiece } from '../src/shared/intent.ts'
import { promptFor } from '../src/worker/prompt.ts'
import { workerCheckpoint } from '../tools/worker-delivery/checkpoint.mjs'
import { messageBlock } from '../tools/dsh-hooks/office.mjs'

const BODY =
  'Made-up words for one hand-over. The first part asks for a plan. The second part asks to read the table.'
const FIRST = 'The first part asks for a plan.'
const SECOND = 'The second part asks to read the table.'
const OWN = { text: 'Read carefully', colour: 'green' as const, instruction: 'Read every word before you answer.' }
const OWN_FLAGS = theFlagsOf(null, [OWN])
const DEFAULT_FLAGS = theFlagsOf(null, null)
const messageId = randomUUID()
const runId = randomUUID()
const agent = randomUUID()
const recipient = randomUUID()

function partAt(quote: string, flag: { intent?: 'proposal-first'; label?: { text: string; colour: 'green' } }): AMarkedPartOnTheWire {
  const from = BODY.indexOf(quote)
  const shipped = flag.intent === undefined ? null : DEFAULT_FLAGS.shipped.find((one) => one.id === flag.intent) ?? null
  return {
    from,
    to: from + quote.length,
    quote,
    ...flag,
    name: flag.intent === undefined ? OWN.text : theNameOfTheMark(flag.intent, DEFAULT_FLAGS),
    whatItAsks:
      flag.intent === undefined ? OWN.instruction : shipped?.instruction ?? whatTheMarkAsks(flag.intent, DEFAULT_FLAGS) ?? '',
  }
}

const FIRST_PART = partAt(FIRST, { intent: 'proposal-first' })
const SECOND_PART = partAt(SECOND, { label: { text: OWN.text, colour: OWN.colour } })

function theMessage(): Record<string, unknown> {
  return {
    id: messageId,
    workspaceId: 'default',
    body: BODY,
    quotes: [],
    quotePositions: null,
    sentBy: null,
    whoSentIt: agent,
    intent: undefined,
    label: null,
    markedParts: [FIRST_PART, SECOND_PART],
    noMarkName: OWN_FLAGS.noMark.name,
    deliveries: [{ to: { kind: 'agent', id: recipient }, mark: 'queued' }],
  }
}

function theRest(): string[] {
  const pieces: WrittenPiece[] = [FIRST_PART, SECOND_PART].map((part, index) => ({
    id: String(index),
    from: part.from,
    to: part.to,
    quote: part.quote,
    reading: '',
    intents: [],
    artefacts: [],
  }))
  return whatIsNotCovered(BODY, pieces).map((run) => BODY.slice(run.from, run.to))
}

/** The waiter is a child process, so its fake office answers the doors it asks. */
async function theWaiterReads(message: Record<string, unknown>): Promise<string> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const answer = (status: number, value: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (path === '/tui/append-prompt') answer(200, {})
    else if (path === '/tui/submit-prompt' || path.endsWith('/release')) answer(200, {})
    else if (path.endsWith('/hold')) {
      answer(201, {
        hold: { agent: { kind: 'agent', id: recipient }, handle: agent, session: runId, state: 'fresh' },
        beatEvery: 60,
        lapsesAfter: 120,
      })
    } else if (path.endsWith('/waiting')) answer(200, { waiting: [{ messageId, urgent: false }] })
    else if (path.endsWith('/took')) answer(200, { whoSentIt: agent })
    else if (path === `/api/messages/${messageId}`) answer(200, { message })
    else if (path === `/api/records/${messageId}`) answer(200, { record: { data: { body: BODY } } })
    else if (path === `/api/records/${runId}`) answer(200, { record: { id: runId, workspaceId: 'default', data: {} } })
    else answer(404, {})
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const child = spawn(process.execPath, ['tools/hold-the-handle.mjs', '--agent', agent, '--session', runId, '--api', url, '--workspace', 'default'], {
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      MOLE_AGENT_KEY: randomBytes(32).toString('hex'),
      MOLE_OFFICE_API: url,
      MOLE_OFFICE_AGENT: agent,
      MOLE_OFFICE_SESSION: runId,
      MOLE_OFFICE_WORKSPACE: 'default',
    },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  const ended = new Promise<number | null>((done) => child.on('close', done))
  try {
    expect(await ended, stderr).toBe(0)
    return stdout
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
}

async function theCheckpointReads(message: Record<string, unknown>): Promise<string> {
  const env = { MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: runId, MOLE_OFFICE_WORKSPACE: 'default' }
  const fetchImpl = async (): Promise<Response> =>
    new Response(JSON.stringify({ checkpoint: { run: runId, agent: recipient }, messages: [message], left: 0 }), { status: 200 })
  const result = await workerCheckpoint().append({ content: [], isError: false }, { env, fetchImpl })
  return result.content.map((item: { text: string }) => item.text).join('\n')
}

function theFour(message: Record<string, unknown>): Promise<string[]> {
  return Promise.all([
    theWaiterReads(message),
    Promise.resolve(messageBlock(message, { id: recipient })),
    theCheckpointReads(message),
    Promise.resolve(
      promptFor({
        agent,
        workspace: 'default',
        api: 'http://127.0.0.1:1',
        messageId,
        body: BODY,
        quotes: [],
        quotePositions: null,
        from: agent,
        carryingOn: false,
        howToLead: '',
        knows: null,
        brief: '',
        intent: message['intent'] as string | undefined,
        label: message['label'] as { text: string; colour: string } | undefined,
        whatTheMarkAsks: message['whatTheMarkAsks'] as string | undefined,
        whatTheLabelAsks: message['whatTheLabelAsks'] as string | undefined,
        markedParts: message['markedParts'] as AMarkedPartOnTheWire[],
        noMarkName: message['noMarkName'] as string,
      }),
    ),
  ])
}

it('(m) two parts with different flags reach all four hand-overs, with the rest of the words named', async () => {
  const message = theMessage()
  const four = await theFour(message)
  expect(theRest().length).toBeGreaterThan(0)
  const lines = [
    DELIVERY_ENVELOPE.aMarkedPart(FIRST_PART),
    DELIVERY_ENVELOPE.aMarkedPart(SECOND_PART),
    DELIVERY_ENVELOPE.theWordsWithNoFlag(theRest(), OWN_FLAGS.noMark.name),
  ]
  for (const one of four) {
    for (const line of lines) expect(one, one).toContain(line)
    expect(one.indexOf(lines[0]!), one).toBeLessThan(one.indexOf(lines[1]!))
  }
  expect(new Set(four.map((one) => one.includes(lines[0]!) && one.includes(lines[1]!) && one.includes(lines[2]!)))).toEqual(
    new Set([true]),
  )
}, 60_000)
