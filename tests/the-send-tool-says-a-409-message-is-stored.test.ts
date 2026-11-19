// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE ANSWERED 409 IS STORED, AND THE SEND TOOL SAYS SO AND EXITS 0.
 *
 * A send to a registered agent that nothing holds (no session holds its handle and no run is going for it) is stored,
 * routed and answered 409, from an agent as from the person. The answer carries the stored message, `routed`, and the
 * routed lines as `error`. The agents' send tool, for-agents/send-message.py (tools/kit/send-message.py is a link to it),
 * printed every HTTP error as a refusal and exited 1. An agent that reads exit 1 sends again without --send-id, and each
 * new send stored another copy. Now the tool tells a 409 that stored the message from a refusal by what the answer
 * holds, says that the message is stored, and exits 0.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. An agent sends through the script to a made-up agent nothing holds. The script exits 0. Its first line is
 *      `409 <id>`, with the id of the one message the office stored, read back from the office. The second is the
 *      answer's `error` word for word: the routed line the office stored on that message. The third is the script's
 *      own sentence, STORED_ON_A_409_SAYS, read from the script's file. The fourth is the send id line, in the words
 *      the script prints after a 201, which a send to the person gives in the same case. The office holds exactly one
 *      message with that send id.
 *   2. A run again with --send-id and that send id prints one line, `200 <the first id> <the office's sentence>`, and
 *      exits 0. The sentence is the office's own, read from its answer to the same send made once more. The office
 *      still holds one message with that send id.
 *   3. A send to an agent the person retired, by its handle, is refused with 409, and nothing is stored. The script
 *      prints the status and the office's answer, as before, and exits 1. This refusal is the one chosen because it
 *      has the same status as the stored case, so the script must tell the two apart by what the answer holds. The
 *      answer is read from the same send made through the door, which is refused the same way. It is one short
 *      sentence, so the script prints it whole.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Three made-up agents, registered by the person: one sends, nothing ever holds the second, the third is retired. */
const SENDER = 'tray-counter'
const NOTHING_HOLDS = 'kiln-sleeper'
const RETIRED = 'kiln-sweeper'
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const asAnAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

let t: TestDb
let app: FastifyInstance
let door = ''
let folder = ''

const SEND_MESSAGE = fileURLToPath(new URL('../for-agents/send-message.py', import.meta.url))
/** How long the script may run before its group is stopped and the case fails. */
const THE_SCRIPT_MAY_RUN_MS = 20_000

/** Run the script as an agent, in a process group of its own, with only the environment given, and wait for it. */
async function theScript(handle: string, to: string, words: string, more: string[] = []): Promise<{ code: number | null; printed: string }> {
  const body = join(folder, `${String(Date.now())}-${String(Math.random()).slice(2)}.txt`)
  writeFileSync(body, words)
  const env = { PATH: process.env['PATH'] ?? '', HOME: folder, MOLE_AGENT_KEY: keys.get(handle) ?? '' }
  const child = spawn('python3', [SEND_MESSAGE, 'default', to, words.slice(0, 40), body, '--as', handle, '--api', door, ...more], {
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let printed = ''
  child.stdout.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, THE_SCRIPT_MAY_RUN_MS)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`send-message.py was still running after ${String(THE_SCRIPT_MAY_RUN_MS)} ms, so its group was stopped`)
  return { code, printed }
}

/** The same send the script makes for an agent handle, made through the door as the same agent, with its answer. */
async function theSameSendThroughTheDoor(handle: string, to: string, words: string, sendId: string): Promise<{ status: number; body: string }> {
  const answer = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAnAgent(handle),
    payload: { kind: 'message', title: words.slice(0, 40), data: { body: words, source: handle, sendId, to: [{ kind: 'agent', id: to }] } },
  })
  return { status: answer.statusCode, body: answer.body }
}

/** Every live message whose words are these, with its send id, read back from the office's own table. */
function theMessagesWithTheWords(words: string): { id: string; sendId: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT id, json_extract(data, '$.sendId') AS sendId FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.body') = ?")
    .all(words) as { id: string; sendId: string | null }[]
}

/** How many live messages carry this send id. */
function messagesWith(sendId: string): number {
  const row = t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sendId') = ?")
    .get(sendId) as { n: number }
  return row.n
}

/**
 * THE SCRIPT'S OWN SENTENCE AFTER A 409 THAT STORED THE MESSAGE, read from its file, because for-agents is plain Python
 * and the test cannot import it. It is declared as one string in parts, each part in double quotes on a line of its own.
 */
function theScriptsStoredSentence(): string {
  const declared = /^STORED_ON_A_409_SAYS = \(((?:\s*"[^"\\\n]*")+)\s*\)$/mu.exec(readFileSync(SEND_MESSAGE, 'utf8'))
  expect(declared, 'send-message.py declares STORED_ON_A_409_SAYS as one string in parts').not.toBeNull()
  const sentence = [...declared![1]!.matchAll(/"([^"\\\n]*)"/gu)].map((part) => part[1]).join('')
  expect(sentence, 'the sentence is not empty').not.toBe('')
  return sentence
}

/** One send through the script to the agent nothing holds, with the one message it stored. */
async function aSendToTheAgentNothingHolds(words: string): Promise<{ code: number | null; lines: string[]; printed: string; stored: { id: string; sendId: string } }> {
  const run = await theScript(SENDER, NOTHING_HOLDS, words)
  const found = theMessagesWithTheWords(words)
  expect(found, `the office stored the message once:\n${run.printed}`).toHaveLength(1)
  const [one] = found
  expect(one!.sendId, 'the stored message carries the send id the script made').toEqual(expect.any(String))
  return { code: run.code, lines: run.printed.trim().split('\n'), printed: run.printed, stored: { id: one!.id, sendId: one!.sendId! } }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  folder = mkdtempSync(join(tmpdir(), 'mole-office-send-409-'))
  for (const handle of [SENDER, NOTHING_HOLDS, RETIRED]) {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { runtime: 'claude-code', handle, name: `A made-up ${handle}`, role: 'worker' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const said = registered.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(handle, said.agent.id)
    keys.set(handle, String(said.whatToGiveIt.key))
  }
  const retired = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${ids.get(RETIRED) ?? ''}/retire`,
    headers: AS_THE_PERSON,
    payload: { because: 'A made-up agent, closed for this test.' },
  })
  expect(retired.statusCode, retired.body).toBe(200)
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

describe('the send tool says a message answered 409 is stored', () => {
  it('1: a send to an agent nothing holds prints 409 and the stored id, the office\'s sentence, the tool\'s, and the send id, and exits 0', async () => {
    // THE SEND ID LINE AFTER A 201, from a send to the person, which the office answers 201.
    const toThePerson = await theScript(SENDER, `person:${THE_PERSON}`, 'The tray counter counted 40 pots.')
    expect(toThePerson.code, toThePerson.printed).toBe(0)
    const [afterA201] = theMessagesWithTheWords('The tray counter counted 40 pots.')
    const linesAfterA201 = toThePerson.printed.trim().split('\n')
    expect(linesAfterA201[0], toThePerson.printed).toBe(`201 ${afterA201!.id}`)
    const sendIdLineAfterA201 = linesAfterA201[1] ?? ''
    expect(sendIdLineAfterA201, 'the line names the send id the office kept').toContain(afterA201!.sendId!)

    const sent = await aSendToTheAgentNothingHolds('The kiln is cold; light it at six.')
    expect(sent.code, sent.printed).toBe(0)
    const { routedOf } = await import('../src/shared/messages.ts')
    const routed = routedOf(t.api.getRecord(sent.stored.id)!.data)
    expect(routed, 'the office routed the message to one addressee').toHaveLength(1)
    expect(sent.lines, sent.printed).toEqual([
      `409 ${sent.stored.id}`,
      routed[0]!.line,
      theScriptsStoredSentence(),
      sendIdLineAfterA201.replaceAll(afterA201!.sendId!, sent.stored.sendId),
    ])
    expect(messagesWith(sent.stored.sendId)).toBe(1)
  }, 60_000)

  it('2: a run again with that send id prints one line, 200, the first id and the office\'s sentence, and exits 0', async () => {
    const words = 'The kiln is still cold; light it at seven.'
    const first = await aSendToTheAgentNothingHolds(words)
    expect(first.code, first.printed).toBe(0)
    expect(first.lines[0], first.printed).toBe(`409 ${first.stored.id}`)
    const again = await theScript(SENDER, NOTHING_HOLDS, words, ['--send-id', first.stored.sendId])
    expect(again.code, again.printed).toBe(0)
    // THE OFFICE'S SENTENCE, from its answer to the same send made once more, which writes nothing either.
    const theOffice = await theSameSendThroughTheDoor(SENDER, NOTHING_HOLDS, words, first.stored.sendId)
    expect(theOffice.status, theOffice.body.slice(0, 300)).toBe(200)
    const because = (JSON.parse(theOffice.body) as { alreadySent: { because: string } }).alreadySent.because
    expect(again.printed.trim().split('\n'), again.printed).toEqual([`200 ${first.stored.id} ${because}`])
    expect(messagesWith(first.stored.sendId)).toBe(1)
  }, 60_000)

  it('3: a send to a retired agent is refused with 409 and nothing stored, and the script prints the answer and exits 1', async () => {
    const words = 'Sweep the kiln before it is lit.'
    const sendId = 'a-made-up-press-0409'
    const run = await theScript(SENDER, RETIRED, words, ['--send-id', sendId])
    const theOffice = await theSameSendThroughTheDoor(SENDER, RETIRED, words, sendId)
    expect(theOffice.status, theOffice.body.slice(0, 300)).toBe(409)
    expect(run.code, run.printed).toBe(1)
    expect(run.printed, 'the status and the office\'s whole answer, on one line').toBe(`${String(theOffice.status)} ${theOffice.body}\n`)
    expect(theMessagesWithTheWords(words)).toHaveLength(0)
    expect(messagesWith(sendId)).toBe(0)
  }, 60_000)
})
