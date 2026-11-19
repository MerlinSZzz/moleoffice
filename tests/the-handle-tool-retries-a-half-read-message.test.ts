// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HAND-OVER IS NOT BUILT FROM A HALF-READ MESSAGE.
 *
 * Problem `TZD7KatHAtEV`, measured on 23 September 2026: Mole Office pauses for a few
 * seconds now and then (22 September, about 19:46, 20:54 and 22:45). In `takeOneAndDescribe` the
 * message record read and the seen mark were each asked once, so a pause left the hand-over block
 * without its sender and its words: "nobody the registries know", "Mole Office would not hand back
 * what it says", "MOLE OFFICE DID NOT MARK IT READ: nothing answered". Nine delivered messages were
 * printed that way.
 *
 * WHAT IS PROVED HERE. The real tool (`tools/hold-the-handle.mjs`) is started as a child against a
 * fake office this file serves, so the office's pauses can be made to happen at the exact request
 * under test. Four cases:
 *
 *   1. The first record read answers 500 and the second answers: the block carries the sender and
 *      the words. The office paused and the retry covered it.
 *   2. The record read never answers: the block says the office did not answer in three tries, with
 *      the record id and its project, so the session can read the message itself.
 *   3. The waiter never posts seen; its hand-over tells the session how to mark read itself.
 *   4. `--kept-by-the-kit` makes the hand-over say the kit's waiter keeps the handle held, and
 *      without the flag the restart instruction is exactly as it was.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN. See the report and the commit message: each case has one
 * mutation that breaks the line it guards, and is red only then.
 */

import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const TOOL = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const AGENT = 'retry-hand'
// The real hold door returns HoldOnTheWire.agent (api/handles.ts); handles are addresses.
const HELD_AGENT = { kind: 'agent', id: randomBytes(9).toString('base64url') } as const
const SESSION = 'session-record-for-retry'
const MESSAGE = 'message-record-for-retry'

/** The three waits the tool makes between its tries, mirroring the code under test. */
const THREE_TRIES = 3

interface PlannedRead {
  status: number
  /** The record body when the status is 200. */
  record?: unknown
}

interface FakeOffice {
  url: string
  /** How many times the message record was read, across every try. */
  recordReads: () => number
  /** How many times the seen mark was asked. */
  markRequests: () => number
  close: () => Promise<void>
}

interface FakeOptions {
  /** One entry per record read, in order. Past the end, the read answers 404. */
  recordAnswers?: PlannedRead[]
  /** When true every record read destroys its socket, which is "nothing answered". */
  resetEveryRecordRead?: boolean
  /** The status the seen mark answers. Default 200. */
  markStatus?: number
  /** The office's beat and lapse on the hold answer. Default 60 and 120. */
  timing?: { beatEvery: number; lapsesAfter: number }
}

const children: ChildProcess[] = []

/** One JSON answer, with the content type the tool reads. */
function answer(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })
  res.end(text)
}

/**
 * A fake office for one case: it holds the handle, waits with exactly one message, and lets this
 * file choose what the record read and the seen mark answer.
 */
async function startAFakeOffice(options: FakeOptions): Promise<FakeOffice> {
  let recordReads = 0
  let markRequests = 0

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://the-fake-office')
    const path = url.pathname
    const method = req.method ?? 'GET'

    if (method === 'POST' && path === `/api/handles/${AGENT}/hold`) {
      answer(res, 201, {
        hold: { agent: HELD_AGENT, handle: AGENT, session: SESSION, state: 'fresh' },
        beatEvery: options.timing?.beatEvery ?? 60,
        lapsesAfter: options.timing?.lapsesAfter ?? 120,
      })
      return
    }
    if (method === 'POST' && path === `/api/handles/${AGENT}/beat`) {
      answer(res, 200, { hold: { state: 'fresh' } })
      return
    }
    if (method === 'GET' && path === `/api/handles/${AGENT}/waiting`) {
      answer(res, 200, { waiting: [{ messageId: MESSAGE, urgent: false }] })
      return
    }
    if (method === 'POST' && path === `/api/handles/${AGENT}/took`) {
      answer(res, 200, { inProject: 'default' })
      return
    }
    if (method === 'POST' && path === `/api/messages/${MESSAGE}/mark`) {
      markRequests += 1
      answer(res, options.markStatus ?? 200, options.markStatus === 200 ? { mark: 'seen' } : { error: 'no' })
      return
    }
    if (method === 'GET' && path === `/api/records/${SESSION}`) {
      answer(res, 200, { record: { id: SESSION, workspaceId: 'default', data: {} } })
      return
    }
    if (method === 'GET' && path === `/api/records/${MESSAGE}`) {
      recordReads += 1
      if (options.resetEveryRecordRead === true) {
        res.destroy()
        return
      }
      const planned = options.recordAnswers?.[recordReads - 1]
      if (planned === undefined) {
        answer(res, 404, { error: 'no such record' })
        return
      }
      answer(res, planned.status, planned.status === 200 ? { record: planned.record } : { error: 'the office was away' })
      return
    }
    if (method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end()
      return
    }
    answer(res, 404, { error: `the fake office does not answer ${method} ${path}` })
  })

  await new Promise<void>((go) => server.listen(0, '127.0.0.1', go))
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return {
    url,
    recordReads: () => recordReads,
    markRequests: () => markRequests,
    close: () =>
      new Promise<void>((go) => {
        server.closeAllConnections()
        server.close(() => go())
      }),
  }
}

/** Start the real tool against the fake office and collect everything it prints. */
function startTheTool(
  office: FakeOffice,
  extraArgs: string[] = [],
): { said: () => string; ended: Promise<number> } {
  // THE CHILD GETS ITS OWN ENVIRONMENT, WITH THE FAKE OFFICE NAMED. The launcher's environment
  // names the owner's live office, and a test must never reach it: 23 September 2026,
  // acceptance finding 44. The handle and the session are made up in this file alone.
  const child = spawn(
    process.execPath,
    [TOOL, '--agent', AGENT, '--session', SESSION, '--api', office.url, '--workspace', 'default', ...extraArgs],
    {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        MOLE_OFFICE_API: office.url,
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_SESSION: SESSION,
        MOLE_OFFICE_AGENT: AGENT,
        MOLE_AGENT_KEY: 'a-test-key-for-the-fake-office',
        MOLE_OFFICE_HANDLE_BEAT_SECONDS: '60',
      },
    },
  )
  children.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: () => printed, ended }
}

afterAll(() => {
  for (const child of children) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
})

describe('the handle tool retries a half-read message', () => {
  it('T1: a record read that fails and then answers still carries the sender and the words', async () => {
    const office = await startAFakeOffice({
      recordAnswers: [
        { status: 500 },
        {
          status: 200,
          record: {
            id: MESSAGE,
            workspaceId: 'default',
            data: { body: 'The words that came through on the second read.', sentBy: { kind: 'agent', id: 'mole-office' } },
          },
        },
      ],
    })
    try {
      const tool = startTheTool(office)
      expect(await tool.ended, tool.said()).toBe(0)
      const said = tool.said()
      expect(said).toContain('WHO SENT IT: agent mole-office')
      expect(said).toContain('The words that came through on the second read.')
      expect(office.recordReads(), said).toBe(2)
    } finally {
      await office.close()
    }
  }, 60_000)

  it('T2: a record read that never answers says three tries, the record id and the project', async () => {
    const office = await startAFakeOffice({ resetEveryRecordRead: true })
    try {
      const tool = startTheTool(office)
      expect(await tool.ended, tool.said()).toBe(0)
      const said = tool.said()
      expect(said).toContain('Mole Office did not answer in three tries')
      expect(said).toContain(MESSAGE)
      expect(said).toContain('default')
      expect(office.recordReads(), said).toBe(THREE_TRIES)
    } finally {
      await office.close()
    }
  }, 60_000)

  it('T3: only the session marks read; the waiter posts no seen mark', async () => {
    const office = await startAFakeOffice({
      recordAnswers: [
        {
          status: 200,
          record: {
            id: MESSAGE,
            workspaceId: 'default',
            data: { body: 'The words.', sentBy: { kind: 'agent', id: 'mole-office' } },
          },
        },
      ],
      markStatus: 400,
    })
    try {
      const tool = startTheTool(office)
      expect(await tool.ended, tool.said()).toBe(0)
      expect(office.markRequests(), tool.said()).toBe(0)
      expect(tool.said()).not.toContain('MOLE OFFICE DID NOT MARK IT READ')
      expect(tool.said()).toContain(`POST /api/messages/${MESSAGE}/mark {"mark":"seen"}`)
    } finally {
      await office.close()
    }
  }, 60_000)

  it('T7: --kept-by-the-kit says the handle stays held, and without it the restart instruction stands', async () => {
    const office = await startAFakeOffice({})
    try {
      // THE KIT'S WAITER RUNS THE TOOL AGAIN BY ITSELF, so the hand-over says not to start another.
      const kept = startTheTool(office, ['--kept-by-the-kit'])
      expect(await kept.ended, kept.said()).toBe(0)
      const withTheFlag = kept.said()
      expect(withTheFlag).toContain(
        "The kit's waiter runs this tool again by itself, so the handle stays held; do not start another waiter, " +
          'because a second one fights this one for the handle.',
      )
      expect(withTheFlag, 'the restart instruction was printed with the flag').not.toContain('Start the waiter again')
      expect(withTheFlag, 'the old closing sentence was printed with the flag').not.toContain(
        'Until then this session still holds the handle',
      )

      // A SESSION THAT STARTED THE TOOL ITSELF STILL NEEDS THE OLD INSTRUCTION, so without the flag
      // the output is exactly what it always was.
      const own = startTheTool(office)
      expect(await own.ended, own.said()).toBe(0)
      const withoutTheFlag = own.said()
      expect(withoutTheFlag).toContain('Start the waiter again so the next message comes here too:')
      expect(withoutTheFlag).toContain('Until then this session still holds the handle')
      expect(withoutTheFlag, 'the kit sentence was printed without the flag').not.toContain(
        "The kit's waiter runs this tool again by itself",
      )
    } finally {
      await office.close()
    }
  }, 60_000)

  it("T11: --kept-by-the-kit prints the office's own beat and lapse, and without it prints nothing", async () => {
    // THE NUMBERS COME FROM THE HOLD ANSWER, NOT A LITERAL. Two fake offices with different numbers
    // prove the line follows the answer: one answers 20 and 90, one answers 20 and 45.
    const ninety = await startAFakeOffice({ timing: { beatEvery: 20, lapsesAfter: 90 } })
    try {
      const kept = startTheTool(ninety, ['--kept-by-the-kit'])
      expect(await kept.ended, kept.said()).toBe(0)
      expect(kept.said()).toContain('office hold timing: beatEvery=20 lapsesAfter=90')
    } finally {
      await ninety.close()
    }

    const fortyFive = await startAFakeOffice({ timing: { beatEvery: 20, lapsesAfter: 45 } })
    try {
      const kept = startTheTool(fortyFive, ['--kept-by-the-kit'])
      expect(await kept.ended, kept.said()).toBe(0)
      expect(kept.said(), 'the lapse was not read from the office answer').toContain(
        'office hold timing: beatEvery=20 lapsesAfter=45',
      )
    } finally {
      await fortyFive.close()
    }

    // WITHOUT THE FLAG NOTHING CHANGES, so the line is absent.
    const plain = await startAFakeOffice({ timing: { beatEvery: 20, lapsesAfter: 90 } })
    try {
      const own = startTheTool(plain)
      expect(await own.ended, own.said()).toBe(0)
      expect(own.said(), 'the timing line was printed without the flag').not.toContain('office hold timing:')
    } finally {
      await plain.close()
    }
  }, 60_000)
})
