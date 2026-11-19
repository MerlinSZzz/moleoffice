// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTRATION TOOL PRINTS THE OFFICE'S REASON WHEN THE OFFICE REFUSES IT.
 *
 * A refusal carries its words in `error`. for-agents/register-myself.mjs printed the status line and the reply's
 * `says`, which a refusal does not carry, so a new terminal AI whose registration was refused was told
 * "400 Bad Request" and nothing about why.
 *
 * This runs the real tool, as a child process, against a listening office on a throwaway database, with the office
 * variables taken out of its environment. The registration names the root of the machine as its start folder. The
 * tool sends it, because it is an absolute path, and the office refuses it with a 400 before anything is written.
 * The same body is first sent to the door straight, and the tool must print that refusal's words exactly, exit 1,
 * write no key file and register nobody.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION, RESTORE
 * ---------------------------------------------------------------------------------------
 *
 *   · MUTATION: the line of for-agents/register-myself.mjs that prints `error` taken out. The case goes red on the
 *     refusal's words.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(CHECKOUT, 'for-agents', 'register-myself.mjs')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`
const HANDLE = 'a-refused-newcomer'
const NAME = 'A refused newcomer'
/** The start folder the office refuses and the tool sends: absolute, and the root of the machine. */
const THE_ROOT = '/'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url = ''
let scratch = ''

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((server.app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-register-refused-'))
})

afterAll(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** This process's environment without the office it may be pointed at, and with a home of its own. */
function withoutTheLiveOffice(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch }
  delete env['MOLE_OFFICE_API']
  delete env['MOLE_OFFICE_WORKSPACE']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_OFFICE_AGENT']
  return env
}

/** Run the real tool, asynchronously, so the office in this process can answer it. */
async function runTheTool(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    execFile(process.execPath, [TOOL, ...args], { encoding: 'utf8', env: withoutTheLiveOffice(), timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
      resolve({ code, stdout, stderr })
    })
  })
}

function agentsNamed(handle: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(handle) as { n: number }).n
}

it('prints the words of the refusal, exits 1, and registers nobody', async () => {
  // THE CONTROL: the door itself refuses this body before anything is written, and says why in `error`.
  const straight = await fetch(`${url}/api/agents/register-myself`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': HANDLE,
    },
    body: JSON.stringify({ handle: HANDLE, name: NAME, workingDirectory: DIR, startFolder: THE_ROOT }),
  })
  const refusal = (await straight.json()) as { error?: unknown }
  expect(straight.status, JSON.stringify(refusal)).toBe(400)
  expect(typeof refusal.error).toBe('string')
  const words = String(refusal.error)
  expect(words).not.toBe('')
  expect(agentsNamed(HANDLE)).toBe(0)

  const keyFile = join(scratch, 'mole-office-key')
  const run = await runTheTool([
    '--handle', HANDLE,
    '--name', NAME,
    '--dir', DIR,
    '--key-file', keyFile,
    '--start-folder', THE_ROOT,
    '--workspace', 'default',
    '--api', url,
  ])
  const printed = `${run.stdout}${run.stderr}`
  expect(run.code, printed).toBe(1)
  expect(run.stdout, printed).toContain('register-myself: 400')
  expect(run.stdout, 'the tool did not print the words the office refused it with').toContain(words)
  expect(existsSync(keyFile)).toBe(false)
  expect(agentsNamed(HANDLE)).toBe(0)
}, 90_000)
