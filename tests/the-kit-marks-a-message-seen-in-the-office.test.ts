// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT MARKS A MESSAGE SEEN IN THE OFFICE, IN THE PROJECT THE MESSAGE IS FILED IN. Wave 13p round M8UvviWBU-IS,
 * item 1b; message y820WOXeJ44Q, on a decision and a go-ahead message; the design agreed in
 * VI9jCxevjqGU.
 *
 * `POST /api/messages/<id>/mark {"mark":"seen"}` had no kit helper, and it was found by searching an old transcript.
 * for-agents/mark-seen-in-the-office.py takes message ids. For each it reads the message first, prints who sent it and
 * the project it is filed in, and then marks it seen with that project in the header. A person's message is filed in
 * message-centre though the waiter says where it was written, so the project is read from the message and never taken
 * from the caller. for-agents/mark-read.sh does something else: it moves the waiter file's read point and never calls
 * the office. The two headers say which does what, and the waiter's first line names the new command.
 *
 * WHAT IS PROVED. The real script runs against a fake office this file serves, and the real waiter.sh runs over a stub
 * of its tool that ends at once.
 *   1. Two messages in two projects, one id beginning with "-": each is read before it is marked, the mark is
 *      {"mark":"seen"} with the message's own project in the header, the agent's name and key go with both requests,
 *      the read names no project, and each message gets a line naming its sender and project and a line with the
 *      office's sentence. No key is printed.
 *   2. A message nobody recorded a sender for, already seen: it says so, prints the office's sentence, and ends 0.
 *   3. An id the office will not read: it says so, does not mark it, goes on to the next id, and ends 1.
 *   4. A mark the office refuses: it prints the status and the office's words, and ends 1.
 *   5. An answer that names no project the message is filed in: it is not marked, and the run ends 1.
 *   6. No id, no handle, no address, an address given for another copy, or a word that is no record id: it ends 2
 *      and asks nothing.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - the script marks with no project in the header: case 1 goes red.
 *
 * Every message here is a synthetic fixture; nothing reaches a real office. Every process this file starts is in a
 * process group of its own (office regulations, chapter 2) and is stopped by that group if it outlives ten seconds.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, describe, expect, it } from 'vitest'

const TOOL = fileURLToPath(new URL('../for-agents/mark-seen-in-the-office.py', import.meta.url))
const HANDLE = 'synthetic-secretary'
const KEY = `synthetic-key-${String(process.pid)}-not-a-real-one`

/** A synthetic message as GET /api/messages/<id> answers it, with only the fields the script reads and a few more. */
function aMessage(id: string, workspaceId: unknown, sentBy: { kind: string; id: string } | null, writtenIn: { project?: string } | null): unknown {
  return { message: { id, workspaceId, sentBy, from: null, to: [{ kind: 'agent', id: HANDLE }], body: 'Synthetic words.', title: 'Synthetic', writtenIn, deliveries: [] } }
}

interface Asked {
  method: string
  path: string
  headers: IncomingMessage['headers']
  body: string
}

interface FakeOffice {
  url: string
  asked: Asked[]
  close: () => Promise<void>
}

interface Answer {
  status: number
  body: unknown
}

const offices: FakeOffice[] = []
const scratch: string[] = []

afterEach(async () => {
  for (const office of offices.splice(0)) await office.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

afterAll(async () => {
  for (const office of offices.splice(0)) await office.close()
})

/**
 * A fake office. GET /api/messages/<id> answers from `reads`, or 404 as for an id that names nothing; POST
 * /api/messages/<id>/mark answers from `marks`, or 200 with a sentence naming the project the request named.
 */
async function aFakeOffice(reads: Record<string, Answer>, marks: Record<string, Answer> = {}): Promise<FakeOffice> {
  const asked: Asked[] = []
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => {
      const path = req.url ?? ''
      asked.push({ method: req.method ?? '', path, headers: req.headers, body })
      const read = /^\/api\/messages\/([^/?]+)$/u.exec(path)
      const mark = /^\/api\/messages\/([^/?]+)\/mark$/u.exec(path)
      let answer: Answer = { status: 404, body: { error: `Nothing answers ${req.method ?? ''} ${path} in this fake office.` } }
      if (req.method === 'GET' && read !== null) {
        const id = decodeURIComponent(read[1]!)
        answer = reads[id] ?? { status: 404, body: { error: `A message ${id} is not one this reader may read, or there is none.` } }
      } else if (req.method === 'POST' && mark !== null) {
        const id = decodeURIComponent(mark[1]!)
        answer = marks[id] ?? {
          status: 200,
          body: { changed: true, mark: 'seen', because: `Marked seen for ${String(req.headers['x-mole-office-actor-id'])} at 2026-10-16 09:40:00.`, workspaceId: req.headers['x-mole-office-workspace'] },
        }
      }
      const text = JSON.stringify(answer.body)
      res.writeHead(answer.status, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })
      res.end(text)
    })
  })
  await new Promise<void>((go) => server.listen(0, '127.0.0.1', () => go()))
  const office: FakeOffice = {
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    asked,
    close: () => new Promise<void>((go) => server.close(() => go())),
  }
  offices.push(office)
  return office
}

/** Run one command in a process group of its own, with only the environment given, and wait for it. */
async function inItsOwnGroup(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(command, args, { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
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
  }, 10_000)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`${command} ${args.join(' ')} was still running after ten seconds, so its group was stopped`)
  return { code, out, err }
}

/** The script, with the key and only the variables given beside PATH and HOME. */
async function theScript(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  return inItsOwnGroup('python3', [TOOL, ...args], { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MOLE_AGENT_KEY: KEY, ...env })
}

/** The lines printed, without the empty one after the last newline. */
function linesOf(text: string): string[] {
  return text.split('\n').filter((line, at, all) => !(line === '' && at === all.length - 1))
}

describe('the kit marks a message seen in the office (item 1b)', () => {
  it('case 1: reads each message first, then marks it seen in the project it is filed in, as the agent', async () => {
    const office = await aFakeOffice({
      synthMsgPers1: { status: 200, body: aMessage('synthMsgPers1', 'message-centre', { kind: 'person', id: 'synthetic-person' }, { project: 'robotics' }) },
      '-synthMsgAgnt': { status: 200, body: aMessage('-synthMsgAgnt', 'synthetic-project', { kind: 'agent', id: 'synthetic-worker' }, null) },
    })
    const run = await theScript(['--as', HANDLE, '--api', office.url, 'synthMsgPers1', '-synthMsgAgnt'], {})
    expect(run.err).toBe('')
    expect(run.code).toBe(0)
    expect(linesOf(run.out)).toEqual([
      'synthMsgPers1: sent by person synthetic-person, filed in project message-centre, written in project robotics.',
      'synthMsgPers1: Marked seen for synthetic-secretary at 2026-10-16 09:40:00.',
      '-synthMsgAgnt: sent by agent synthetic-worker, filed in project synthetic-project.',
      '-synthMsgAgnt: Marked seen for synthetic-secretary at 2026-10-16 09:40:00.',
    ])
    expect(office.asked.map((one) => `${one.method} ${one.path}`)).toEqual([
      'GET /api/messages/synthMsgPers1',
      'POST /api/messages/synthMsgPers1/mark',
      'GET /api/messages/-synthMsgAgnt',
      'POST /api/messages/-synthMsgAgnt/mark',
    ])
    for (const one of office.asked) {
      expect(one.headers['x-mole-office-actor-type']).toBe('agent')
      expect(one.headers['x-mole-office-actor-id']).toBe(HANDLE)
      expect(one.headers['x-mole-office-key']).toBe(KEY)
    }
    expect(office.asked[0]!.headers['x-mole-office-workspace'], 'the read names no project').toBeUndefined()
    expect(office.asked[2]!.headers['x-mole-office-workspace'], 'the read names no project').toBeUndefined()
    expect(office.asked[1]!.headers['x-mole-office-workspace']).toBe('message-centre')
    expect(office.asked[3]!.headers['x-mole-office-workspace']).toBe('synthetic-project')
    expect(JSON.parse(office.asked[1]!.body)).toEqual({ mark: 'seen' })
    expect(JSON.parse(office.asked[3]!.body)).toEqual({ mark: 'seen' })
    expect(run.out + run.err).not.toContain(KEY)
  })

  it('case 2: a message nobody recorded a sender for, already seen: says so, prints the office\'s sentence, ends 0', async () => {
    const already = 'This message is already marked seen for synthetic-secretary, and a delivery mark never moves backwards. Nothing was written.'
    const office = await aFakeOffice(
      { synthMsgNone: { status: 200, body: aMessage('synthMsgNone', 'message-centre', null, null) } },
      { synthMsgNone: { status: 200, body: { changed: false, mark: 'seen', because: already, workspaceId: 'message-centre' } } },
    )
    const run = await theScript(['synthMsgNone', '--api', office.url], { MOLE_OFFICE_AGENT: HANDLE })
    expect(run.code).toBe(0)
    expect(linesOf(run.out)).toEqual(['synthMsgNone: nobody recorded who sent it, filed in project message-centre.', `synthMsgNone: ${already}`])
  })

  it('case 3: an id the office will not read is not marked, the next id still is, and the run ends 1', async () => {
    const office = await aFakeOffice({ synthMsgGood: { status: 200, body: aMessage('synthMsgGood', 'message-centre', { kind: 'person', id: 'synthetic-person' }, null) } })
    const run = await theScript(['--as', HANDLE, '--api', office.url, 'synthMsgLost', 'synthMsgGood'], {})
    expect(run.code).toBe(1)
    expect(office.asked.map((one) => `${one.method} ${one.path}`)).toEqual(['GET /api/messages/synthMsgLost', 'GET /api/messages/synthMsgGood', 'POST /api/messages/synthMsgGood/mark'])
    expect(run.out).toContain('synthMsgLost: the office did not let this read it, so it was not marked: 404')
    expect(run.out).toContain('is not one this reader may read')
    expect(run.out).toContain('synthMsgGood: Marked seen for synthetic-secretary')
  })

  it('case 4: a mark the office refuses: prints the status and the office\'s words, and ends 1', async () => {
    const refusal = 'Message synthMsgNotMine was not addressed to synthetic-secretary, so there is no delivery of it to mark. Nothing was written.'
    const office = await aFakeOffice(
      { synthMsgNotMine: { status: 200, body: aMessage('synthMsgNotMine', 'message-centre', { kind: 'agent', id: 'synthetic-worker' }, null) } },
      { synthMsgNotMine: { status: 404, body: { error: refusal } } },
    )
    const run = await theScript(['--as', HANDLE, '--api', office.url, 'synthMsgNotMine'], {})
    expect(run.code).toBe(1)
    expect(run.out).toContain('synthMsgNotMine: the office refused the mark: 404')
    expect(run.out).toContain(refusal)
    expect(run.out + run.err).not.toContain(KEY)
  })

  it('case 5: an answer that names no project the message is filed in is not marked, and the run ends 1', async () => {
    const office = await aFakeOffice({ synthMsgOdd: { status: 200, body: aMessage('synthMsgOdd', null, { kind: 'person', id: 'synthetic-person' }, null) } })
    const run = await theScript(['--as', HANDLE, '--api', office.url, 'synthMsgOdd'], {})
    expect(run.code).toBe(1)
    expect(office.asked.map((one) => one.method)).toEqual(['GET'])
    expect(run.out).toContain('synthMsgOdd: the office\'s answer names no project the message is filed in, so it was not marked.')
  })

  it('case 6: with no id, no handle, no address, an address for another copy, or a word that is no id, ends 2 and asks nothing', async () => {
    const office = await aFakeOffice({})
    const noId = await theScript(['--as', HANDLE, '--api', office.url], {})
    expect(noId.code).toBe(2)
    expect(noId.err).toContain('no message id')
    const noHandle = await theScript(['--api', office.url, 'synthMsgPers1'], {})
    expect(noHandle.code).toBe(2)
    expect(noHandle.err).toContain('MOLE_OFFICE_AGENT')
    const noAddress = await theScript(['--as', HANDLE, 'synthMsgPers1'], {})
    expect(noAddress.code).toBe(2)
    expect(noAddress.err).toContain('MOLE_OFFICE_API')
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-mark-seen-another-root-'))
    scratch.push(elsewhere)
    const anotherCopy = await theScript(['--as', HANDLE, 'synthMsgPers1'], { MOLE_OFFICE_API: office.url, MOLE_OFFICE_API_ROOT: elsewhere })
    expect(anotherCopy.code).toBe(2)
    expect(anotherCopy.err).toContain('does not take that address')
    const notAnId = await theScript(['--as', HANDLE, '--api', office.url, 'synthMsgPers1', '--api=x'], {})
    expect(notAnId.code).toBe(2)
    expect(notAnId.err).toContain('"--api=x" is not a record id')
    expect(office.asked).toEqual([])
  })
})
