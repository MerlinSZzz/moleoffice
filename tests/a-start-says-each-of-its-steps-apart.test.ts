// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START SAYS WHAT EACH OF ITS STEPS TOOK, EACH STEP APART.
 *
 * The first start on the owner's Windows 11 took 75.7 s, and 53.9 s of it went to one step of the start line: the
 * settings, the service lock and opening the database, which take 111 ms on Linux. That step held three things and
 * more, so the line could not say which of them was slow. Nobody had measured it.
 *
 * So the server says the settings, the group it was started in, the service lock, opening the database, the service
 * claim and the check that no test started it as separate steps, before the migrations check. This starts the real
 * server on a new database in a folder of its own and reads its start line. Every step that
 * src/server/lib/start-steps.ts declares must be there with its time, in the declared order, and nothing between
 * them.
 *
 * The server works in the folder aCheckoutForATestRun() makes, and that folder is its worker's checkout too, so no
 * run it could start writes a rules file in this worktree (tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts).
 * Its message worker is off as well, so it starts none.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiServerArguments } from './helpers.ts'
import { THE_START_LINE, THE_START_STEPS } from '../src/server/lib/start-steps.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(ROOT, 'node_modules/.bin/tsx')
// By its whole path, and tsx is named this worktree's tsconfig, because the server is started in a folder outside
// this worktree.
const SERVER = join(ROOT, 'src/server/index.ts')
const TSCONFIG = join(ROOT, 'tsconfig.json')

let scratch = ''

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-start-says-its-steps-'))
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** A port nothing listens on now. */
function aFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = address !== null && typeof address !== 'string' ? address.port : 0
      probe.close(() => { resolve(port) })
    })
  })
}

/**
 * Start the server in `checkout`, in a group of its own, and hand back its start line, or what it said when it ended
 * or did not say the line within `ms`. The group is stopped either way.
 */
function theStartLine(env: NodeJS.ProcessEnv, checkout: string, ms: number): Promise<{ line: string | null; said: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, apiServerArguments([], SERVER), { cwd: checkout, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let said = ''
    let line: string | null = null
    const stop = (): void => {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    const limit = setTimeout(stop, ms)
    child.stdout.on('data', (chunk: Buffer) => {
      said += chunk.toString('utf8')
      line ??= said.split('\n').find((one) => one.startsWith(`${THE_START_LINE} `)) ?? null
      if (line !== null) stop()
    })
    child.stderr.on('data', (chunk: Buffer) => { said += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', () => {
      clearTimeout(limit)
      resolve({ line, said })
    })
  })
}

const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('the start line of a server', () => {
  it('says each declared step with its time, in the declared order', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const name of Object.keys(env)) {
      if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name === 'MOLE_AGENT_KEY') delete env[name]
    }
    const checkout = aCheckoutForATestRun()
    Object.assign(env, {
      MOLE_OFFICE_DB: join(scratch, 'office.db'),
      MOLE_OFFICE_PORT: String(await aFreePort()),
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_WORKER_CHECKOUT: checkout,
      MOLE_OFFICE_TERMINAL_HOLDER: 'off',
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
      TSX_TSCONFIG_PATH: TSCONFIG,
      LOG_LEVEL: 'warn',
    })
    const { line, said } = await theStartLine(env, checkout, 120_000)
    expect(line, said).not.toBeNull()
    const steps = Object.values(THE_START_STEPS)
    // The four steps the Windows start was split for are four, not one.
    const apart = [THE_START_STEPS.theSettings, THE_START_STEPS.theServiceLock, THE_START_STEPS.openingTheDatabase, THE_START_STEPS.theMigrationsCheck]
    expect(new Set(apart).size).toBe(apart.length)
    expect(line).toMatch(new RegExp(`: ${steps.map((step) => `${escaped(step)} \\d+ ms`).join(', ')}\\.$`))
  }, 150_000)
})
