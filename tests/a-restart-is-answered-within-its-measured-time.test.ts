// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTART AFTER A CODE CHANGE IS ANSWERED WITHIN ITS MEASURED TIME (wave 13x, round 8). After each landing,
 * tools/serve-dev.mjs restarts the API, and until the new server listens the port answers nothing or the stand-in's
 * 503. On 9 October 2026 the office's two restarts at 10:10:38 and 10:24:34 left that gap at about 11.5 s each, and
 * callers that gave up within it failed. This runs the real office in a copy of this tree under the real serve-dev,
 * changes one file the server is built from, and measures one restart: from the change to the first 200 answered to
 * a read sent once serve-dev said it was restarting, so the old server cannot have answered it. It also prints the
 * server's own line saying what each step of its start took (`start: listening`, src/server/lib/start-steps.ts).
 *
 * THE LIMIT IS 10 S, set from the measurement. In the w13x sandbox on 9 October 2026, at load 12 to 17 on 20 cores,
 * four single restarts took 2.39, 2.35, 2.46 and 2.46 s from the change to that first 200, and the new server said
 * it listened 1.38 to 1.48 s after its process began. 10 s is four times the longest, and still under the 11.5 s the
 * office's restarts took on 9 October. A start that goes over it is slower than anything measured, and the line says
 * where the time went. One restart only, never under load.
 *
 * MUTATION PROOF, 9 October 2026 (logs named in the report of the run that added this file): a 10 s wait put before
 * the new server's `app.listen` in src/server/index.ts made this red, saying the number.
 *
 * THE CHANGE WAITS UNTIL THE SUPERVISOR HAS FINISHED STARTING (28 October 2026). Once its first server answers,
 * serve-dev files a session record, registers its own process under it and then updates that record. A restart
 * before the update lands makes that write fail, and serve-dev then ends itself and its server. In a whole-suite run
 * on 20 workers the change came in that gap: the update met the new server's migrations and was answered 503, and
 * nothing answered for 60 s. So the test reads the copy's own ledger for the supervisor's process row and waits until
 * that row's session record has been written a second time. It does not read serve-dev's sentences for this.
 * Proved on 28 October 2026 with the registration slowed by 3 s and the migrations by 2 s: the test before this wait
 * was red with nothing answering for 60 s, and with it the test was green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandThatStopsWithItsOwner } from './helpers.ts'
import { THE_START_LINE } from '../src/server/lib/start-steps.ts'
import { workspaceFrom } from '../src/config/settings.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The longest a restart may take from the change to the new server's first 200. Set from the measurement above. */
const A_RESTART_IS_ANSWERED_WITHIN_MS = 10_000
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function freePort(): Promise<number> {
  return await new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => done(port))
    })
  })
}

/** One read of `url`, closing its connection: its status, or null when nothing answered. */
async function readOnce(url: string, within: number): Promise<number | null> {
  try {
    const reply = await fetch(url, { headers: { connection: 'close' }, signal: AbortSignal.timeout(within) })
    await reply.text()
    return reply.status
  } catch {
    return null
  }
}

/**
 * What the copy's ledger says of supervisor process `pid`: `finished` once its process row is there and that row's
 * session record has been written after it was filed, otherwise what was missing.
 */
async function theSupervisorsStart(port: number, workspace: string, pid: number): Promise<{ finished: boolean; seen: string }> {
  const headers = { connection: 'close', 'x-mole-office-workspace': workspace }
  try {
    const listed = await fetch(`http://127.0.0.1:${String(port)}/api/resources`, { headers, signal: AbortSignal.timeout(5_000) })
    if (listed.status !== 200) return { finished: false, seen: `the ledger answered ${String(listed.status)}: ${await listed.text()}` }
    const rows = ((await listed.json()) as { resources: { type: string; key: string; sessionRecordId: string }[] }).resources
    const row = rows.find((one) => one.type === 'process' && one.key === String(pid))
    if (row === undefined) return { finished: false, seen: `no process row for ${String(pid)} among ${String(rows.length)} row(s)` }
    const read = await fetch(`http://127.0.0.1:${String(port)}/api/records/${encodeURIComponent(row.sessionRecordId)}`, { headers, signal: AbortSignal.timeout(5_000) })
    if (read.status !== 200) return { finished: false, seen: `its session record answered ${String(read.status)}: ${await read.text()}` }
    const { revisionSeq } = (await read.json()) as { revisionSeq: number }
    return { finished: revisionSeq > 1, seen: `its session record is at revision ${String(revisionSeq)}` }
  } catch (err) {
    return { finished: false, seen: `the ledger did not answer (${String(err)})` }
  }
}

describe('a restart after a code change', () => {
  let dir = ''
  let port = 0
  let supervisor: ChildProcess | null = null
  const said: { at: number; line: string }[] = []
  const saidSoFar = (): string => said.slice(-30).map((one) => one.line).join('\n')

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-a-measured-restart-'))
    for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
      cpSync(join(REPO, part), join(dir, part), { recursive: true })
    }
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
    port = await freePort()
    const env: Record<string, string | undefined> = { ...process.env }
    for (const name of Object.keys(env)) {
      if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name === 'MOLE_AGENT_KEY') delete env[name]
    }
    Object.assign(env, {
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'office.db'),
      MOLE_OFFICE_MESSAGE_WORKER: 'merges-only',
      MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
      LOG_LEVEL: 'warn',
    })
    const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
    supervisor = spawn(watched.command, watched.args, { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    const keep = (chunk: Buffer): void => {
      for (const line of chunk.toString().split('\n')) if (line.trim() !== '') said.push({ at: Date.now(), line })
    }
    supervisor.stdout?.on('data', keep)
    supervisor.stderr?.on('data', keep)
    const deadline = Date.now() + 120_000
    while ((await readOnce(`http://127.0.0.1:${String(port)}/api/health`, 5_000)) !== 200) {
      if (Date.now() > deadline) throw new Error(`the office in the copy never answered 200:\n${saidSoFar()}`)
      await sleep(200)
    }
    const pid = supervisor.pid
    if (pid === undefined) throw new Error(`serve-dev was not started:\n${saidSoFar()}`)
    for (;;) {
      const start = await theSupervisorsStart(port, workspaceFrom(env), pid)
      if (start.finished) break
      if (Date.now() > deadline) throw new Error(`serve-dev never finished writing itself into the copy's ledger; ${start.seen}:\n${saidSoFar()}`)
      await sleep(200)
    }
  }, 180_000)

  afterAll(async () => {
    if (supervisor?.pid !== undefined) {
      try {
        process.kill(-supervisor.pid, 'SIGTERM')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
      await new Promise<void>((done) => {
        if (supervisor?.exitCode !== null) done()
        else supervisor.once('exit', () => done())
        setTimeout(done, 20_000).unref()
      })
    }
    if (dir !== '') rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it(`is answered by the new server within ${String(A_RESTART_IS_ANSWERED_WITHIN_MS / 1000)} s of the change`, async () => {
    const url = `http://127.0.0.1:${String(port)}/api/health`
    const linesBefore = said.length
    const changedAt = Date.now()
    appendFileSync(join(dir, 'src/shared/product.ts'), '\n// a measured restart\n')
    const restarting = (): { at: number } | undefined => said.slice(linesBefore).find((one) => one.line.includes('[dev] restarting the server'))
    let answeredAt: number | null = null
    const giveUpAt = changedAt + 60_000
    while (answeredAt === null && Date.now() < giveUpAt) {
      const sentAt = Date.now()
      const status = await readOnce(url, Math.max(1, giveUpAt - sentAt))
      const began = restarting()
      if (status === 200 && began !== undefined && sentAt > began.at) answeredAt = Date.now()
      else await sleep(100)
    }
    const startLine = said.slice(linesBefore).find((one) => one.line.startsWith(THE_START_LINE))?.line ?? 'the new server said no start line'
    const took = answeredAt === null ? null : answeredAt - changedAt
    process.stdout.write(`[measured] a restart: the first 200 from the new server came ${took === null ? 'never (60 s)' : `${String(took)} ms`} after the change; ${startLine}\n`)
    expect(took, `no read sent after serve-dev said it was restarting was answered 200 within 60 s:\n${saidSoFar()}`).not.toBeNull()
    expect(took, `the restart took ${String(took)} ms, over the ${String(A_RESTART_IS_ANSWERED_WITHIN_MS)} ms limit. ${startLine}`).toBeLessThan(A_RESTART_IS_ANSWERED_WITHIN_MS)
  }, 120_000)
})
