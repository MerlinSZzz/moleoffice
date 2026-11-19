// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TOOLS/REGISTER-MYSELF.MJS WRITES THE KEY TO A 0600 FILE AND NEVER PRINTS IT. Problem x8ktQfHS5yGr,
 * piece 1 of the keys wave (report 7eQG4ZyWuWCv).
 *
 * Until this wave the tool printed the reply's headers, the key among them, into the terminal and so
 * into every transcript and log that caught it. This runs the real tool, as a process, against a real
 * server this file starts on a free port with a database and a HOME of its own:
 *
 *   · a keyless registration waits, and its one-time secret goes to a 0600 file beside the key file;
 *     the person presses; the next run sends the secret back, writes the key to the file named by
 *     --key-file, created 0600, removes the spent secret file, and neither stdout nor stderr carries
 *     the key or the secret (finding 83);
 *   · --new-key --json writes the ask's one-time secret to a 0600 file beside the key file, sends it
 *     back after the grant, writes the new key, removes the spent secret file, and prints neither;
 *   · a key file that already exists is refused before any request.
 *
 * The person's key is read from the key file this test's own server made in this test's own folder,
 * to press as the person. It is never printed.
 *
 * MUTATION: keep the key in the printed headers (drop `delete headers[KEY_HEADER]`) → red. And read the
 * secret file only for --new-key (`chosen.newKey && existsSync(...)`) → the first case is red.
 * (The latter was proved on 26 September 2026 by a worker's run.)
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiServerArguments } from './helpers.ts'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'register-myself.mjs')

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      if (at === null || typeof at === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const chosen = at.port
      probe.close(() => ok(chosen))
    })
  })
}

/** This process's environment without the names that point at the owner's live office or carry a key. */
function withoutTheLiveOffice(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY']) {
    delete env[name]
  }
  return env
}

let child: ChildProcess | undefined
let api = ''
let dir = ''

beforeAll(async () => {
  dir = aTestDatabaseFolder('register-key-file')
  const port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...withoutTheLiveOffice(),
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

function run(args: string[]): { status: number | null; out: string; err: string } {
  const done = spawnSync(process.execPath, [TOOL, ...args, '--workspace', 'default', '--api', api], {
    cwd: REPO,
    encoding: 'utf8',
    env: withoutTheLiveOffice(),
    timeout: 60_000,
  })
  return { status: done.status, out: done.stdout, err: done.stderr }
}

/** The person's key, from the key file this test's own server made beside its database. */
function thePersonsKey(): string {
  return String((JSON.parse(readFileSync(join(dir, 'keys.json'), 'utf8')) as { person: string }).person)
}

/** Press grant on the waiting ask as the person. */
async function pressGrant(requestId: string): Promise<void> {
  const res = await fetch(`${api}/api/roles/requests/${requestId}/grant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      'x-mole-office-key': thePersonsKey(),
    },
    body: '{}',
  })
  expect([200, 201], await res.clone().text()).toContain(res.status)
}

/** The request id the tool printed, from its `the ask:` line or its JSON. */
function theAskIn(out: string): string {
  const line = /the ask: (\S+)/.exec(out)
  if (line !== null) return line[1]!
  return String((JSON.parse(out) as { request: string }).request)
}

/** Whether a key proves the agent: a note written with the key alone is written as that agent. */
async function theKeyProves(key: string, handle: string): Promise<boolean> {
  const res = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key },
    body: JSON.stringify({ kind: 'note', title: `with the key of ${handle}`, data: { body: 'a note' } }),
  })
  if (res.status !== 201) return false
  const id = ((await res.json()) as { record: { id: string } }).record.id
  const revisions = await fetch(`${api}/api/records/${id}/revisions`, { headers: { 'x-mole-office-workspace': 'default' } })
  const said = JSON.stringify(await revisions.json())
  const agent = await fetch(`${api}/api/participants/agent/${handle}`, { headers: { 'x-mole-office-workspace': 'default' } })
  const agentId = ((await agent.json()) as { participant: { id: string } }).participant.id
  return said.includes(agentId)
}

describe('the key goes to a 0600 file and is never printed', () => {
  it('writes the key answered after the press, and prints no key', async () => {
    const keyFile = join(dir, 'tool-agent.key')
    const first = run(['--handle', 'tool-agent', '--name', 'Tool agent', '--dir', dir, '--key-file', keyFile])
    expect(first.status, `${first.out}${first.err}`).toBe(0)
    expect(existsSync(keyFile), 'a waiting registration wrote a key file').toBe(false)
    // THE WAITING REGISTRATION'S ONE-TIME SECRET goes to its own 0600 file beside the key file, the way
    // a new-key ask's does, and is printed nowhere (finding 83). After the press only the ask
    // sending it back is answered the key, so the next run sends it.
    const secretFile = `${keyFile}.ask-secret`
    const secret = readFileSync(secretFile, 'utf8').trim()
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    expect(statSync(secretFile).mode & 0o777).toBe(0o600)
    expect(`${first.out}${first.err}`.includes(secret), 'the secret was printed').toBe(false)
    await pressGrant(theAskIn(first.out))

    const second = run(['--handle', 'tool-agent', '--name', 'Tool agent', '--dir', dir, '--key-file', keyFile])
    expect(second.status, `${second.out}${second.err}`).toBe(0)
    const key = readFileSync(keyFile, 'utf8').trim()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(statSync(keyFile).mode & 0o777).toBe(0o600)
    expect(second.out.includes(key), 'the key was printed on stdout').toBe(false)
    expect(second.err.includes(key), 'the key was printed on stderr').toBe(false)
    expect(second.out).toContain(`written to ${keyFile}`)
    expect(existsSync(secretFile), 'the spent secret file was left behind').toBe(false)
    expect(await theKeyProves(key, 'tool-agent')).toBe(true)
  }, 120_000)

  it('--new-key --json writes the new key and the printed JSON carries none', async () => {
    const keyFile = join(dir, 'tool-agent-new.key')
    const asked = run(['--handle', 'tool-agent', '--name', 'Tool agent', '--dir', dir, '--key-file', keyFile, '--new-key', '--json'])
    expect(asked.status, `${asked.out}${asked.err}`).toBe(0)
    // THE ONE-TIME SECRET goes to its own 0600 file beside the key file, and is printed nowhere.
    const secretFile = `${keyFile}.ask-secret`
    const secret = readFileSync(secretFile, 'utf8').trim()
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    expect(statSync(secretFile).mode & 0o777).toBe(0o600)
    expect(`${asked.out}${asked.err}`.includes(secret), 'the secret was printed').toBe(false)
    await pressGrant(theAskIn(asked.out))
    const answered = run(['--handle', 'tool-agent', '--name', 'Tool agent', '--dir', dir, '--key-file', keyFile, '--new-key', '--json'])
    expect(answered.status, `${answered.out}${answered.err}`).toBe(0)
    const key = readFileSync(keyFile, 'utf8').trim()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(statSync(keyFile).mode & 0o777).toBe(0o600)
    expect(`${answered.out}${answered.err}`.includes(key), 'the key was printed').toBe(false)
    expect((JSON.parse(answered.out) as { keyWrittenTo: string }).keyWrittenTo).toBe(keyFile)
    expect(existsSync(`${keyFile}.ask-secret`), 'the spent secret file was left behind').toBe(false)
    expect(await theKeyProves(key, 'tool-agent')).toBe(true)
  }, 120_000)

  it('refuses a key file that already exists, before any request', () => {
    const refused = run(['--handle', 'tool-agent', '--name', 'Tool agent', '--dir', dir, '--key-file', join(dir, 'tool-agent.key')])
    expect(refused.status).toBe(2)
    expect(refused.err).toContain('already exists')
  })
})
