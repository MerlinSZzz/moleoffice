// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT PRINTS EACH LOGIN'S WEEK ON DEMAND. Wave 13p round M8UvviWBU-IS, item 1a; message y820WOXeJ44Q, on a decision
 * and a go-ahead message; the design agreed in VI9jCxevjqGU.
 *
 * The office counts each model login's use this week (src/server/lib/logins-week.ts) and puts the count in a
 * secretary's inbox, as `loginsWeek` in GET /api/agent/inbox. A secretary's ordinary tools never showed it: the waiter
 * and read-new.sh print messages only. On 15 October the secretary spent a dozen steps looking through logs for the number and
 * got it wrong. for-agents/logins-week.py asks the inbox door and prints the office's own sentence for each login, and
 * the waiter's first line in its out file names that command.
 *
 * WHAT IS PROVED. The real script runs against a fake office this file serves, and the real waiter.sh runs over a stub
 * of its tool that ends at once.
 *   1. A secretary's answer: one line saying when the office read it, each login's `says` on a line of its own, in the
 *      office's order, and the count of runs that declared no tool. It asked GET /api/agent/inbox?limit=1 as the agent,
 *      in the project given, with the key, and printed no key.
 *   2. No run declared no tool: that line is left out.
 *   3. An answer with no loginsWeek: exit 1, a sentence saying the office puts it only in a secretary's inbox.
 *   4. A loginsWeek in another shape: exit 1, and none of it is printed.
 *   5. The office refuses: exit 1 with the status and the office's words.
 *   6. No handle, no address, or an address given for another copy: exit 2, and the office is asked nothing.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - the script prints the top-level `says` in place of each login's: case 1 goes red.
 *
 * Every answer here is a synthetic fixture; nothing reaches a real office. Every process this file starts is in a
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

const TOOL = fileURLToPath(new URL('../for-agents/logins-week.py', import.meta.url))
const PROJECT = 'synthetic-project'
const HANDLE = 'synthetic-secretary'
const KEY = `synthetic-key-${String(process.pid)}-not-a-real-one`

/** Each login's sentence, as the office words it (synthetic). */
const SAYS_ONE =
  'Synthetic login one has used 61.20 US dollars by Claude Code\'s own price figure since the reset at 2026-10-13 09:00, ' +
  'Europe/London time. That is 51% of its mark of about 120.00 US dollars. Its week ends at 2026-10-20 09:00.'
const SAYS_TWO =
  'Synthetic login two: 3 runs in the last seven days, 1 with no receipt. No receipt gave a cost. No week end and no ' +
  '100% mark are recorded for this login, so its use is read over the last seven days and no share is shown.'

/** A secretary's inbox, with `undeclared` runs that declared no tool. */
function aSecretarysInbox(undeclared: number): unknown {
  return {
    messages: [],
    says: 'Synthetic inbox sentence that is not the logins\' week.',
    loginsWeek: {
      at: '2026-10-16 09:30',
      zone: 'Europe/London',
      logins: [
        { login: 'synthetic-one', window: 'week', share: 0.51, says: SAYS_ONE },
        { login: 'synthetic-two', window: 'last seven days', share: null, says: SAYS_TWO },
      ],
      runsThatDeclaredNoTool: undeclared,
      says: `${SAYS_ONE} ${SAYS_TWO} The joined sentence, which the script does not print.`,
    },
  }
}

interface Asked {
  method: string
  url: string
  headers: IncomingMessage['headers']
}

interface FakeOffice {
  url: string
  asked: Asked[]
  close: () => Promise<void>
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

/** A fake office that answers every request with `status` and `body`, and keeps what it was asked. */
async function aFakeOffice(status: number, body: unknown): Promise<FakeOffice> {
  const asked: Asked[] = []
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    asked.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers })
    const text = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })
    res.end(text)
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

describe('the kit prints each login\'s week on demand (item 1a)', () => {
  it('case 1: prints when the office read it, each login\'s own sentence on a line of its own, and the runs no login counts', async () => {
    const office = await aFakeOffice(200, aSecretarysInbox(2))
    const run = await theScript([PROJECT, '--as', HANDLE, '--api', office.url], {})
    expect(run.err).toBe('')
    expect(run.code).toBe(0)
    expect(linesOf(run.out)).toEqual([
      'Each login\'s week, as the office read it at 2026-10-16 09:30, Europe/London time (loginsWeek in GET /api/agent/inbox):',
      SAYS_ONE,
      SAYS_TWO,
      'Runs in the last seven days that declared no tool, which no login counts: 2',
    ])
    expect(office.asked).toHaveLength(1)
    expect(office.asked[0]!.method).toBe('GET')
    expect(office.asked[0]!.url).toBe('/api/agent/inbox?limit=1')
    expect(office.asked[0]!.headers['x-mole-office-workspace']).toBe(PROJECT)
    expect(office.asked[0]!.headers['x-mole-office-actor-type']).toBe('agent')
    expect(office.asked[0]!.headers['x-mole-office-actor-id']).toBe(HANDLE)
    expect(office.asked[0]!.headers['x-mole-office-key']).toBe(KEY)
    expect(run.out + run.err).not.toContain(KEY)
  })

  it('case 2: leaves out the line on runs that declared no tool when there were none', async () => {
    const office = await aFakeOffice(200, aSecretarysInbox(0))
    const run = await theScript([PROJECT, '--api', office.url], { MOLE_OFFICE_AGENT: HANDLE })
    expect(run.code).toBe(0)
    expect(linesOf(run.out)).toHaveLength(3)
    expect(run.out).not.toContain('declared no tool')
    expect(office.asked[0]!.headers['x-mole-office-actor-id']).toBe(HANDLE)
  })

  it('case 3: an answer with no loginsWeek ends 1, saying the office puts it only in a secretary\'s inbox', async () => {
    const office = await aFakeOffice(200, { messages: [], says: 'Synthetic inbox sentence.' })
    const run = await theScript([PROJECT, '--as', 'synthetic-worker', '--api', office.url], {})
    expect(run.code).toBe(1)
    expect(run.out).toBe('')
    expect(run.err).toContain('carries no loginsWeek')
    expect(run.err).toContain('only in a secretary\'s inbox')
  })

  it('case 4: a loginsWeek in another shape ends 1, and none of it is printed', async () => {
    const office = await aFakeOffice(200, { messages: [], says: 'x', loginsWeek: { at: '2026-10-16 09:30', zone: 'Europe/London', logins: 'not a list', runsThatDeclaredNoTool: 0, says: 'y' } })
    const run = await theScript([PROJECT, '--as', HANDLE, '--api', office.url], {})
    expect(run.code).toBe(1)
    expect(run.out).toBe('')
    expect(run.err).toContain('not in the shape this reads')
  })

  it('case 5: the office refuses: ends 1 with the status and the office\'s own words', async () => {
    const office = await aFakeOffice(404, { error: 'No agent in this project has the handle "synthetic-secretary", and none ever has.' })
    const run = await theScript([PROJECT, '--as', HANDLE, '--api', office.url], {})
    expect(run.code).toBe(1)
    expect(run.out).toContain('404')
    expect(run.out).toContain('No agent in this project has the handle')
    expect(run.out + run.err).not.toContain(KEY)
  })

  it('case 6: with no handle, no address, or an address given for another copy, ends 2 and asks nothing', async () => {
    const office = await aFakeOffice(200, aSecretarysInbox(0))
    const noHandle = await theScript([PROJECT, '--api', office.url], {})
    expect(noHandle.code).toBe(2)
    expect(noHandle.err).toContain('MOLE_OFFICE_AGENT')
    const noAddress = await theScript([PROJECT, '--as', HANDLE], {})
    expect(noAddress.code).toBe(2)
    expect(noAddress.err).toContain('MOLE_OFFICE_API')
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-logins-week-another-root-'))
    scratch.push(elsewhere)
    const anotherCopy = await theScript([PROJECT, '--as', HANDLE], { MOLE_OFFICE_API: office.url, MOLE_OFFICE_API_ROOT: elsewhere })
    expect(anotherCopy.code).toBe(2)
    expect(anotherCopy.err).toContain('does not take that address')
    expect(office.asked).toEqual([])
  })
})
