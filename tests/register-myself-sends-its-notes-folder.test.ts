// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TOOLS/REGISTER-MYSELF.MJS SENDS --notes, AND THE AGENT RECORD HOLDS IT. Problem llG6MnA7sSz0.
 *
 * The tool read `--notes` and put it in no request, so a session told to keep its notes in a folder
 * was told nothing and the folder was on no record. This runs the real tool, as a process, against a
 * real server this file starts on a free port with a database of its own. The tool sends no key, so
 * the registration of a new handle waits for the person's press (decision Nc9QRT9R_IvF), and the
 * waiting row keeps the folder for the person's press to write on the agent record.
 *
 * A relative `--notes` is refused by the door, in `checkAgentNotes`'s words, and nothing is registered.
 *
 * MUTATION: drop `notes` from the body the tool builds, and the first case is red.
 *
 * The tool writes a key it is answered to `mole-office-key` in the notes folder; this file is about the
 * folder being sent, and tests/register-myself-writes-its-key-to-a-file.test.ts is about the key.
 */
import { apiServerArguments } from './helpers.ts'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'register-myself.mjs')

/** A port nothing is listening on, taken by opening a socket and giving it straight back. */
function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      if (at === null || typeof at === 'string') {
        probe.close(() => {
          fail(new Error('the probe socket reported no port'))
        })
        return
      }
      const chosen = at.port
      probe.close(() => {
        ok(chosen)
      })
    })
  })
}

/** This process's environment without the four names that point at the owner's live office. */
function withoutTheLiveOffice(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env['MOLE_OFFICE_API']
  delete env['MOLE_OFFICE_WORKSPACE']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_OFFICE_AGENT']
  return env
}

let child: ChildProcess | undefined
let api = ''
let dir = ''

beforeAll(async () => {
  dir = aTestDatabaseFolder('register-notes')
  const port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...withoutTheLiveOffice(),
      // A HOME OF ITS OWN, so nothing this server does can write under the one it was started from.
      HOME: dir,
      LOG_LEVEL: 'warn',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'panelx.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_NO_WATCH: '1',
    },
  })
  for (let tries = 0; tries < 180; tries += 1) {
    try {
      if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) return
    } catch {
      // not answering yet
    }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  throw new Error(`the server this test started never answered ${api}/api/health`)
}, 120_000)

afterAll(() => {
  // BY THE GROUP ID WRITTEN DOWN WHEN IT WAS STARTED, never by a pattern (problem LD9Yor6qIVVC).
  if (child?.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

function registerMyself(args: string[]): { status: number | null; said: string; json: Record<string, unknown> } {
  const run = spawnSync(process.execPath, [TOOL, ...args, '--workspace', 'default', '--api', api, '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    env: withoutTheLiveOffice(),
    timeout: 60_000,
  })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(run.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: run.status, said: `${run.stdout}${run.stderr}`, json }
}

async function dataOf(recordId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}/api/records/${recordId}`, { headers: { 'x-mole-office-workspace': 'default' } })
  expect(res.status).toBe(200)
  return ((await res.json()) as { record: { data: Record<string, unknown> } }).record.data
}

describe('register-myself --notes', () => {
  it('sends the folder, and the waiting registration holds it', async () => {
    const notes = join(dir, 'notes of notes-one')
    const run = registerMyself(['--handle', 'notes-one', '--name', 'Notes one', '--dir', dir, '--notes', notes])
    expect(run.status, run.said).toBe(0)
    expect(run.json['waiting'], run.said).toBe(true)
    const data = await dataOf(String(run.json['request']))
    expect((data['extra'] as { selfRegistration: { notes: string } }).selfRegistration.notes).toBe(notes)
  })

  it('refuses a relative folder in the words of checkAgentNotes, and registers nothing', async () => {
    const run = registerMyself(['--handle', 'notes-two', '--name', 'Notes two', '--dir', dir, '--notes', 'my-notes'])
    expect(run.status).toBe(1)
    expect(String(run.json['error']), run.said).toContain('"notes" is "my-notes", which is not an absolute path.')
    const res = await fetch(`${api}/api/participants/agent/notes-two`, { headers: { 'x-mole-office-workspace': 'default' } })
    expect(res.status).toBe(404)
  })
})
