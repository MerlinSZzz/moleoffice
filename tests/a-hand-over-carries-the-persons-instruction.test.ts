// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY HAND-OVER OF A MESSAGE PRINTS THE PERSON'S INSTRUCTION FOR ITS FLAG (wave 14d, DB-3, cases b, e and f).
 *
 * The waiter, the dsh SessionStart hook, the delivery checkpoint and the run prompt are four different readers of the
 * same message. The office works the instruction out once, from the sender's row, and every one of them prints what it
 * was handed. None of them knows what "Proposal first" means, so a changed instruction reaches the agent and a flag
 * with none adds no line.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it } from 'vitest'

import { theFlagsOf, whatTheLabelAsks, whatTheMarkAsks, type StoredShippedFlags } from '../src/shared/intent-mark.ts'
import { deliveryEnvelope } from '../src/shared/messages.ts'
import { promptFor } from '../src/worker/prompt.ts'
import { workerCheckpoint } from '../tools/worker-delivery/checkpoint.mjs'
import { messageBlock } from '../tools/dsh-hooks/office.mjs'

const CHANGED: StoredShippedFlags = {
  'proposal-first': { name: 'Plan it first', instruction: 'Come back with one plan and start no work.' },
}
const OWN = { text: 'Read this', colour: 'red' as const, instruction: 'Read the whole table before answering.' }
const BODY = 'Made-up words the agent is handed.'
const messageId = randomUUID()
const runId = randomUUID()
const agent = randomUUID()
const recipient = randomUUID()

function theMessage(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: messageId, workspaceId: 'default', body: BODY, quotes: [], quotePositions: null, sentBy: null,
    whoSentIt: agent, intent: 'proposal-first', label: null, deliveries: [{ to: { kind: 'agent', id: recipient }, mark: 'queued' }],
    ...extra,
  }
}

/** The waiter is a child process, so its fake office answers the doors it asks. */
async function theWaiterReads(message: Record<string, unknown>, options: { messageStatus?: number; messageBody?: unknown; refuseTook?: boolean; refuseRecord?: boolean } = {}): Promise<string> {
  let waits = 0
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const answer = (status: number, value: unknown): void => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (path === '/tui/append-prompt') answer(200, {})
    else if (path === '/tui/submit-prompt' || path.endsWith('/release')) answer(200, {})
    else if (path.endsWith('/hold')) answer(201, { hold: { agent: { kind: 'agent', id: recipient }, handle: agent, session: runId, state: 'fresh' }, beatEvery: 60, lapsesAfter: 120 })
    else if (path.endsWith('/waiting')) {
      waits += 1
      if (waits > 1) return
      answer(200, { waiting: [{ messageId, urgent: false }] })
    } else if (path.endsWith('/took')) answer(options.refuseTook === true ? 403 : 200, options.refuseTook === true ? { error: 'A made-up refusal from the took door.' } : { whoSentIt: agent })
    else if (path === `/api/messages/${messageId}`) {
      const status = options.messageStatus ?? 200
      answer(status, options.messageBody ?? (status === 200 ? { message } : status >= 400 && status < 500 ? { error: 'A made-up refusal from the message door.' } : { error: 'The message door could not answer.' }))
    }
    else if (path === `/api/records/${messageId}`) answer(options.refuseRecord === true ? 403 : 200, options.refuseRecord === true ? { error: 'A made-up refusal from the record door.' } : { record: { data: { body: BODY } } })
    else if (path === `/api/records/${runId}`) answer(200, { record: { id: runId, workspaceId: 'default', data: {} } })
    else answer(404, {})
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const child = spawn(process.execPath, ['tools/hold-the-handle.mjs', '--agent', agent, '--session', runId, '--api', url, '--workspace', 'default'], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MOLE_AGENT_KEY: randomBytes(32).toString('hex'), MOLE_OFFICE_API: url, MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: runId, MOLE_OFFICE_WORKSPACE: 'default' },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
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
  const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({ checkpoint: { run: runId, agent: recipient }, messages: [message], left: 0 }), { status: 200 })
  const result = await workerCheckpoint().append({ content: [], isError: false }, { env, fetchImpl })
  return result.content.map((item: { text: string }) => item.text).join('\n')
}

function theFour(message: Record<string, unknown>): Promise<string[]> {
  return Promise.all([
    theWaiterReads(message),
    Promise.resolve(messageBlock(message, { id: recipient })),
    theCheckpointReads(message),
    Promise.resolve(promptFor({
      agent, workspace: 'default', api: 'http://127.0.0.1:1', messageId, body: BODY, quotes: [], quotePositions: null,
      from: agent, carryingOn: false, howToLead: '', knows: null, brief: '',
      intent: message['intent'] as string | undefined,
      label: message['label'] as { text: string; colour: string } | undefined,
      whatTheMarkAsks: message['whatTheMarkAsks'] as string | undefined,
      whatTheLabelAsks: message['whatTheLabelAsks'] as string | undefined,
    })),
  ])
}

it('(b) an own flag with an instruction hands that instruction over on all four', async () => {
  const flags = theFlagsOf(null, [OWN])
  const label = { text: OWN.text, colour: OWN.colour }
  const instruction = whatTheLabelAsks(label, flags)
  expect(instruction).toBe(OWN.instruction)
  const message = theMessage({ intent: undefined, whatTheMarkAsks: undefined, label, whatTheLabelAsks: instruction })
  const four = await theFour(message)
  for (const one of four) expect(one, one).toContain(OWN.instruction)
}, 60_000)

it('a waiter that cannot read the message door prints the line telling the session to read it itself', async () => {
  const said = await theWaiterReads(theMessage({ whatTheMarkAsks: whatTheMarkAsks('proposal-first', theFlagsOf(CHANGED, null))! }), { messageStatus: 500 })
  expect(said).toContain(`Mole Office did not answer in three tries. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`)
}, 60_000)

it('a waiter told 200 with no message prints the line telling the session to read it itself', async () => {
  const said = await theWaiterReads(theMessage({ whatTheMarkAsks: whatTheMarkAsks('proposal-first', theFlagsOf(CHANGED, null))! }), { messageBody: {} })
  expect(said).toContain(`Mole Office answered 200 but did not say what this message's mark and label ask. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`)
}, 60_000)

it('a waiter says the message door refused, with its sentence, when it answers 4xx', async () => {
  const said = await theWaiterReads(theMessage({ whatTheMarkAsks: whatTheMarkAsks('proposal-first', theFlagsOf(CHANGED, null))! }), { messageStatus: 400 })
  expect(said).toContain(`Mole Office refused to say what this message's mark and label ask: A made-up refusal from the message door. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`)
}, 60_000)

it('a record refusal keeps its own sentence beside the message door\'s line', async () => {
  const said = await theWaiterReads(theMessage({ whatTheMarkAsks: whatTheMarkAsks('proposal-first', theFlagsOf(CHANGED, null))! }), { refuseRecord: true, messageStatus: 500 })
  expect(said).toContain('Mole Office would not hand back what it says. Read it with the record id above.')
  expect(said).toContain(`Mole Office did not answer in three tries. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`)
}, 60_000)

it('a waiter says the took door refused and that the message door was never asked', async () => {
  const said = await theWaiterReads(theMessage({ whatTheMarkAsks: whatTheMarkAsks('proposal-first', theFlagsOf(CHANGED, null))! }), { refuseTook: true })
  expect(said).toContain(`This hand-over did not ask the message door what its mark and label ask, because the took door refused: A made-up refusal from the took door. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`)
  expect(said, 'the message door was asked after the took door refused').not.toContain('Mole Office did not answer in three tries')
}, 60_000)

it('(b) a changed Proposal first instruction reaches the agent on all four hand-overs', async () => {
  const flags = theFlagsOf(CHANGED, null)
  const instruction = whatTheMarkAsks('proposal-first', flags)!
  const message = theMessage({ whatTheMarkAsks: instruction })
  const four = await theFour(message)
  for (const one of four) expect(one, one).toContain(instruction)
}, 60_000)

it('(e) an own flag with no instruction is handed over by its word only, on all four', async () => {
  const quiet = { text: 'Quiet', colour: 'grey' as const }
  const flags = theFlagsOf(null, [quiet])
  expect(whatTheLabelAsks(quiet, flags)).toBeNull()
  const message = theMessage({ intent: undefined, whatTheMarkAsks: undefined, label: quiet, whatTheLabelAsks: null })
  const four = await theFour(message)
  for (const one of four) {
    expect(one, one).toContain(quiet.text)
    expect(one, one).not.toContain(OWN.instruction)
    expect(one, one).not.toContain(whatTheMarkAsks('proposal-first')!)
  }
}, 60_000)

it('(f) a message with no flag gains no instruction on any of the four', async () => {
  const message = theMessage({ intent: undefined, whatTheMarkAsks: undefined })
  const four = await theFour(message)
  for (const one of four) {
    expect(one, one).toBe(one.split('\n').filter((line) => !line.startsWith('WHAT THE PERSON WANTS')).join('\n'))
    expect(one, one).not.toContain(whatTheMarkAsks('just-ask')!)
    expect(one, one).not.toContain(whatTheMarkAsks('proposal-first')!)
  }
  // AND THE ENVELOPE IS THE ONE A MESSAGE WITH NO FLAG ALWAYS HAD.
  expect(deliveryEnvelope({ from: agent, message: messageId })).toEqual(deliveryEnvelope({ from: agent, message: messageId, intent: 'none' }))
}, 60_000)
