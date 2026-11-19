// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * node tools/slot.mjs, AGAINST REAL PROCESSES AND A REAL OFFICE ON ITS OWN PORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * tests/slots.test.ts proves the rules on a fake process table. This file proves the thing an agent
 * or a sandbox actually does, with the machine's own process table (LINUX_PROBE) and the tool run as
 * a separate process, the way `~/.cache/mole-office/suite.lock` and `run-suite.sh` were used before
 * they were lost:
 *
 *   1. two `slot.mjs run full-suite` never overlap: the second waits in line and starts after the
 *      first has ended, and both seats are given back;
 *   2. `acquire --wait` from a script ties the seat to the script's own process group, and
 *      `release` gives it back;
 *   3. a seat whose holder is killed, tool and all, with nobody giving it back, goes to the next
 *      asker: the office reads the process table and finds the group gone;
 *   4. `list` names who holds each seat, and a `run` stopped with SIGTERM passes the signal to its
 *      command's group and gives the seat back;
 *   5. a queued `run` whose tool dies never starts its command: the command waits at a gate for the
 *      word "go", and a gate whose writer has gone reads end-of-file.
 *
 * The office here is the product's own slot and resource routes on a throwaway database, listening
 * on a port of its own on loopback. Nothing here talks to the owner's server.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'slot.mjs')

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string

/** Every process group this file started, so none outlives it whatever a test did. */
const groups = new Set<number>()

beforeAll(async () => {
  t = await freshDb()
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-slot-tool-'))
})

afterEach(() => {
  // AND EVERY GROUP A SLOT ROW NAMES. `run` starts its command as a group of its own, and a test that
  // fails before it has read that group from the office would otherwise leave the command running.
  // This database is this file's own, so every group it names is one this file started.
  const named = t.client.sqlite.prepare("SELECT DISTINCT pgid FROM session_resources WHERE type = 'slot'").all() as {
    pgid: number | null
  }[]
  for (const { pgid } of named) if (pgid !== null && pgid > 1) groups.add(pgid)
  for (const group of groups) {
    // Only a group whose leader is still working in this checkout: a number read earlier may have
    // been given to somebody else's program since, and that is never signalled.
    if (!leaderWorksHere(group)) continue
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone between the look and the signal, which is what was wanted.
    }
  }
  groups.clear()
})

/** Is the process leading this group running with its working directory in this checkout? */
function leaderWorksHere(group: number): boolean {
  try {
    return readlinkSync(`/proc/${String(group)}/cwd`).startsWith(REPO.replace(/\/$/, ''))
  } catch {
    return false
  }
}

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

function session(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
}

/** The flags every call of the tool here carries: this office, this project, this session. */
function common(sessionId: string): string[] {
  return ['--api', api, '--workspace', 'default', '--as', 'claude-code', '--session', sessionId]
}

interface Ran {
  child: ChildProcess
  done: Promise<{ code: number | null; stdout: string; stderr: string }>
}

/** Start a process as the leader of its own group, and remember the group. */
function startDetached(command: string, args: string[]): Ran {
  const child = spawn(command, args, { cwd: REPO, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (child.pid !== undefined) groups.add(child.pid)
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (b: Buffer) => (stdout += b.toString()))
  child.stderr?.on('data', (b: Buffer) => (stderr += b.toString()))
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) =>
    child.on('close', (code) => resolve({ code, stdout, stderr })),
  )
  return { child, done }
}

function tool(args: string[]): Ran {
  return startDetached(process.execPath, [TOOL, ...args])
}

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > ms) throw new Error(`waited ${ms} ms for ${what}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

interface SeatRead {
  id: string
  sessionRecordId: string
  holder: { pgid: number }
}

interface PoolRead {
  name: string
  held: SeatRead[]
  waiting: SeatRead[]
}

async function suitePool(): Promise<PoolRead> {
  const read = (await (await fetch(`${api}/api/slots`)).json()) as { pools: PoolRead[] }
  const pool = read.pools.find((p) => p.name === 'full-suite')
  if (pool === undefined) throw new Error('GET /api/slots answered with no full-suite pool')
  return pool
}

/**
 * The seat this session's run holds, once it holds one. By session, because a seat left by the test
 * before stays listed until the next acquire or release hands it on, and GET never does.
 */
async function seatHeldBy(sessionId: string): Promise<SeatRead> {
  let found: SeatRead | undefined
  await until(`a seat for session ${sessionId}`, async () => {
    found = (await suitePool()).held.find((s) => s.sessionRecordId === sessionId)
    return found !== undefined
  })
  return found as SeatRead
}

function liveSlotRows(): number {
  return (
    t.client.sqlite
      .prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot' AND released_at IS NULL")
      .get() as { n: number }
  ).n
}

function lines(path: string): string[] {
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter((l) => l !== '') : []
}

describe('node tools/slot.mjs against real processes', () => {
  it('never lets two full suites overlap: the second waits, then runs after the first has ended', async () => {
    const log = join(scratch, 'two-runs.log')
    const body = `echo start-$0 >> ${log}; sleep 2; echo end-$0 >> ${log}`
    const first = tool(['run', 'full-suite', ...common(session('first')), '--every', '0.2', '--', 'sh', '-c', body, 'A'])
    await until('the first run to start', () => lines(log).includes('start-A'))
    const second = tool(['run', 'full-suite', ...common(session('second')), '--every', '0.2', '--', 'sh', '-c', body, 'B'])

    const [a, b] = await Promise.all([first.done, second.done])
    expect(a.code, a.stderr).toBe(0)
    expect(b.code, b.stderr).toBe(0)
    expect(lines(log)).toEqual(['start-A', 'end-A', 'start-B', 'end-B'])
    expect(b.stderr).toContain('Queued')
    expect(liveSlotRows()).toBe(0)
  })

  it('ties an acquire from a script to the script’s own group, and release gives it back', async () => {
    const out = join(scratch, 'acquired.txt')
    const s = session('a script')
    const flags = common(s).join(' ')
    const script =
      `SLOT=$("${process.execPath}" "${TOOL}" acquire full-suite --wait --every 0.2 ${flags}) || exit 7; ` +
      `echo "$SLOT" > ${out}; ` +
      `"${process.execPath}" "${TOOL}" release "$SLOT" ${flags}`
    const ran = startDetached('sh', ['-c', script])
    const done = await ran.done
    expect(done.code, done.stderr).toBe(0)

    const id = readFileSync(out, 'utf8').trim()
    const row = t.client.sqlite
      .prepare('SELECT key, pgid, released_at, release_note FROM session_resources WHERE id = ?')
      .get(id) as { key: string; pgid: number; released_at: string | null; release_note: string }
    expect(row.key).toBe('full-suite#1')
    expect(row.pgid).toBe(ran.child.pid)
    expect(row.released_at).not.toBeNull()
    expect(row.release_note).toContain('given back by the session that asked for it')
  })

  it('hands a seat on when its holder is killed, tool and all, with nobody giving it back', async () => {
    const killed = session('killed')
    const holder = tool(['run', 'full-suite', ...common(killed), '--every', '0.2', '--', 'sleep', '60'])
    const seat = await seatHeldBy(killed)
    groups.add(seat.holder.pgid)

    // The tool first, so it cannot give the seat back itself; then the group holding the seat.
    process.kill(-(holder.child.pid as number), 'SIGKILL')
    process.kill(-seat.holder.pgid, 'SIGKILL')
    await until('the killed group to leave the process table', () => !existsSync(`/proc/${String(seat.holder.pgid)}`))

    const next = startDetached('sh', ['-c', `"${process.execPath}" "${TOOL}" acquire full-suite ${common(session('next')).join(' ')}`])
    const answered = await next.done
    expect(answered.code, answered.stderr).toBe(0)
    expect(answered.stderr).toContain('Granted')
    const closed = t.client.sqlite
      .prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?')
      .get(seat.id) as { released_at: string | null; release_note: string }
    expect(closed.released_at).not.toBeNull()
    expect(closed.release_note).toContain('the process group holding it has ended')
  })

  it('lists who holds the seat, and a run stopped with SIGTERM stops its command and gives the seat back', async () => {
    const listedSession = session('listed')
    const holder = tool(['run', 'full-suite', ...common(listedSession), '--every', '0.2', '--', 'sleep', '60'])
    const seat = await seatHeldBy(listedSession)

    const listed = await tool(['list', '--api', api, '--workspace', 'default']).done
    expect(listed.code, listed.stderr).toBe(0)
    expect(listed.stdout).toContain('full-suite: 1 of 1 seat taken, 0 waiting.')
    const line = listed.stdout.split('\n').find((one) => one.includes(seat.id)) ?? ''
    expect(line, listed.stdout).toMatch(
      new RegExp(`^  seat 1  ${seat.id}  group ${String(seat.holder.pgid)} \\(running\\)  listed — sleep 60 — process group `),
    )

    process.kill(holder.child.pid as number, 'SIGTERM')
    const ended = await holder.done
    // sleep was ended by the signal the tool passed on to its group: 128 + 15.
    expect(ended.code, ended.stderr).toBe(143)
    await until('the command group to leave the process table', () => !existsSync(`/proc/${String(seat.holder.pgid)}`))
    const row = t.client.sqlite
      .prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?')
      .get(seat.id) as { released_at: string | null; release_note: string }
    expect(row.released_at).not.toBeNull()
    expect(row.release_note).toContain('given back by the session that asked for it')
  })

  it('never starts a queued command whose tool dies while it waits', async () => {
    const holding = session('holding')
    const holder = tool(['run', 'full-suite', ...common(holding), '--every', '0.2', '--', 'sleep', '60'])
    await seatHeldBy(holding)
    const marker = join(scratch, 'should-never-exist')
    const waiting = session('waiting')
    const waiter = tool(['run', 'full-suite', ...common(waiting), '--every', '0.2', '--', 'touch', marker])
    await until('the second run to be in line', async () =>
      (await suitePool()).waiting.some((s) => s.sessionRecordId === waiting),
    )

    process.kill(-(waiter.child.pid as number), 'SIGKILL')
    await waiter.done
    // The gate is a process group of its own; the office's line names it, so wait for it there.
    const inLine = (await suitePool()).waiting.find((s) => s.sessionRecordId === waiting)
    expect(inLine, 'the dead tool took its place in line with it').toBeDefined()
    const gate = (inLine as SeatRead).holder.pgid
    groups.add(gate)
    await until('the gate to read end-of-file and exit', () => !existsSync(`/proc/${String(gate)}`))
    expect(existsSync(marker)).toBe(false)

    process.kill(-(holder.child.pid as number), 'SIGTERM')
    await holder.done
  })
})
