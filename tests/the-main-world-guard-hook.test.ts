// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN-WORLD GUARD AS A HOOK: THE PROCESS EVERY RUNTIME STARTS, END TO END.
 *
 * tools/guard/main-world-guard.mjs reads a Claude Code PreToolUse payload on standard input and
 * answers with its exit code: 0 lets the call through, 2 stops it with the reason on stderr. This
 * file starts it as a process, the way Claude Code, Codex, the dsh bridge and the OpenCode plugin
 * do, against a stand-in office started here that answers the two doors the guard reads (the
 * agent's participant row and the role cards). Nothing is ever run from a payload: the guard only
 * reads it.
 *
 * WHAT IS PROVED, one case each:
 *   - a command that deletes nothing is let through without asking the office at all;
 *   - rules 1 to 3 stop a call with the reason and the railing sentence, and no office is needed;
 *   - rule 4 reads the work area from the office: a worker is stopped outside it and let through
 *     inside it, and a secretary's card (grain `nothing`) is let through;
 *   - when the office does not answer, or the run did not say who it is, a delete outside the
 *     temporary directory is stopped and everything else goes on;
 *   - when the guard itself cannot load, a call that looks like a delete is stopped and anything else
 *     is let through, and stderr says which (the copy of the hook run for this has no policy beside it);
 *   - the shapes dsh, OpenCode and Codex send (`bash` with `workdir`, `write` with `filePath`,
 *     `apply_patch`) are read as what they are;
 *   - `--mounted dsh` answers from tools/dsh-hooks/hooks.json.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   make `failed` in the hook let every call through                          → the crash case is red.
 *   drop the card check from `whoIsAsking`, so nobody is exempt               → the secretary case is red.
 *   ignore `workdir` in `effectsOf` (tools/guard/what-a-call-does.mjs)          → the dsh shape case is red.
 *   make `whoIsAsking` answer "exempt" when the office does not answer        → the office-down and unknown-agent cases are red.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RAILING } from '../tools/guard/policy.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const GUARD = join(REPO, 'tools', 'guard', 'main-world-guard.mjs')

let scratch = ''
let checkout = ''
let office: Server
let officeAt = ''
let asked = 0
/** A port nothing listens on: the stand-in is closed and started again on another port. */
let nobodyAt = ''

const CARDS = [
  { name: 'worker', workArea: { grain: 'folders', most: 'no limit', says: 'a worker names folders' } },
  { name: 'supervisor', workArea: { grain: 'a directory', most: 1, says: 'one directory' } },
  { name: 'secretary', workArea: { grain: 'nothing', most: 0, says: 'a secretary names nothing' } },
]

/** @returns the address a server is listening on */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

beforeAll(async () => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  scratch = mkdtempSync(join(REPO, '.cache', 'guard-hook-'))
  checkout = join(scratch, 'checkout')
  for (const dir of ['.git', 'src/server', 'dist']) mkdirSync(join(checkout, dir), { recursive: true })
  writeFileSync(join(checkout, 'README.md'), 'made up for this test\n')
  const closed = createServer()
  nobodyAt = await listen(closed)
  await new Promise<void>((done) => closed.close(() => done()))
  office = createServer((req, res) => {
    asked += 1
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const who = /^\/api\/participants\/agent\/([^/?]+)$/.exec(req.url ?? '')
    if (req.url === '/api/roles') return send(200, { cards: CARDS })
    if (who?.[1] === 'w-worker') return send(200, { participant: { handle: 'w-worker', role: 'worker', workArea: ['src/server'] } })
    if (who?.[1] === 's-secretary') return send(200, { participant: { handle: 's-secretary', role: 'secretary', workArea: null } })
    return send(404, { error: `No agent in this installation answers to "${who?.[1] ?? '?'}".` })
  })
  officeAt = await listen(office)
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * Start the hook with one payload, as a runtime does. Asynchronously, because the stand-in office
 * answers from this same process and a blocking wait would leave it unable to.
 */
async function hook(
  payload: unknown,
  opts: { agent?: string | null; api?: string; script?: string } = {},
): Promise<{ status: number | null; stderr: string }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), MOLE_OFFICE_API: opts.api ?? officeAt, MOLE_OFFICE_WORKSPACE: 'panelx' }
  delete env['MOLE_OFFICE_AGENT']
  // A PLAIN MACHINE, IN TWO PARTS.
  //
  // `SANDBOX_DIR` says an office sandbox started this process, and the guard stands down there
  // (the container is the wall). Removing it is what makes the hook answer as it does on the host.
  delete env['SANDBOX_DIR']
  // `~` is the shell's `$HOME`, and the policy knows the home from the password database. A plain
  // machine has them the same; this sandbox's `$HOME` is the sandbox folder while the passwd home
  // is something else, so the two are set equal here. Nothing is run from these payloads.
  env['HOME'] = userInfo().homedir
  const argv = [opts.script ?? GUARD, ...(opts.agent === null ? [] : ['--agent', opts.agent ?? 'w-worker'])]
  const child = spawn(process.execPath, argv, { env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
  child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, stderr }
}

const bash = (command: string, cwd = checkout) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

describe('the hook answers with its exit code', () => {
  it('lets a command that deletes nothing through, without asking the office', async () => {
    const before = asked
    const got = await hook(bash('ls -la && git status'))
    expect(got.status, got.stderr).toBe(0)
    expect(asked, 'the office was asked about a command that deletes nothing').toBe(before)
  })

  it('stops rules 1 to 3 with the reason and the railing sentence, with no office needed', async () => {
    const got = await hook(bash('rm -rf ~/'), { api: nobodyAt })
    expect(got.status).toBe(2)
    expect(got.stderr).toContain('would delete the home directory')
    expect(got.stderr).toContain(RAILING)
    const empty = await hook(bash('SH=$(cat missing-file); rm -rf "$SH"'), { api: nobodyAt })
    expect(empty.status).toBe(2)
    expect(empty.stderr).toContain('may be empty')
  })

  it('reads the work area from the office: a worker is stopped outside it and let through inside it', async () => {
    const outside = await hook(bash('rm -rf dist'))
    expect(outside.status, outside.stderr).toBe(2)
    expect(outside.stderr).toContain('outside your work area (src/server')
    const inside = await hook(bash('rm -rf src/server/old'))
    expect(inside.status, inside.stderr).toBe(0)
  })

  it('lets a secretary, whose card names nothing, delete outside a work area', async () => {
    const got = await hook(bash('rm -rf dist'), { agent: 's-secretary' })
    expect(got.status, got.stderr).toBe(0)
  })
})

describe('when something is missing, a delete stops and the rest goes on', () => {
  it('stops a delete outside the temporary directory when the office does not answer, and nothing else', async () => {
    const del = await hook(bash('rm -rf dist'), { api: nobodyAt })
    expect(del.status, del.stderr).toBe(2)
    expect(del.stderr).toContain('the office did not answer')
    expect((await hook(bash('ls -la'), { api: nobodyAt })).status).toBe(0)
    expect((await hook(bash('rm -rf /tmp/a-scratch-of-mine'), { api: nobodyAt })).status).toBe(0)
  })

  it('stops a delete when the run did not say which agent it is', async () => {
    const got = await hook(bash('rm -rf dist'), { agent: null })
    expect(got.status).toBe(2)
    expect(got.stderr).toContain('did not say which agent it is')
  })

  it('stops an agent the office does not know', async () => {
    const got = await hook(bash('rm -rf dist'), { agent: 'nobody-registered' })
    expect(got.status).toBe(2)
    expect(got.stderr).toContain('No agent in this installation answers')
  })

  it('fails closed for a delete and open for everything else when the guard itself cannot load', async () => {
    // A COPY OF THE HOOK WITH NOTHING BESIDE IT cannot import its policy or the settings: that is the
    // guard crashing, for real, with no switch in the code to make it.
    const alone = join(scratch, 'alone')
    mkdirSync(alone, { recursive: true })
    const copy = join(alone, 'main-world-guard.mjs')
    copyFileSync(GUARD, copy)
    const del = await hook(bash('rm -rf build'), { script: copy })
    expect(del.status, del.stderr).toBe(2)
    expect(del.stderr).toContain('The guard itself failed')
    const home = await hook(bash('HOME=/tmp/x npm test'), { script: copy })
    expect(home.status, home.stderr).toBe(2)
    const other = await hook(bash('npm test 2>&1 | tail -5'), { script: copy })
    expect(other.status, other.stderr).toBe(0)
    expect(other.stderr).toContain('let this call through, because it does not look like a delete')
    const unreadable = await hook('this is not a payload: rm -rf x')
    expect(unreadable.status).toBe(2)
  })
})

describe('every runtime’s shape is read as what it is', () => {
  it('dsh and OpenCode: `bash` with a working directory of its own', async () => {
    const got = await hook({ hook_event_name: 'PreToolUse', tool_name: 'bash', tool_input: { command: 'rm -rf dist', workdir: checkout }, cwd: '/' })
    expect(got.status, got.stderr).toBe(2)
    expect(got.stderr).toContain(join(checkout, 'dist'))
  })

  it('OpenCode: `write` with `filePath` over an existing file outside the area', async () => {
    const got = await hook({ hook_event_name: 'PreToolUse', tool_name: 'write', tool_input: { filePath: join(checkout, 'README.md'), content: 'x' }, cwd: checkout })
    expect(got.status, got.stderr).toBe(2)
  })

  it('Codex: `apply_patch` deleting a file outside the area', async () => {
    const patch = '*** Begin Patch\n*** Delete File: README.md\n*** End Patch\n'
    const got = await hook({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: patch }, cwd: checkout })
    expect(got.status, got.stderr).toBe(2)
  })

  it('answers `--mounted dsh` from the hooks file', async () => {
    const ran = spawnSync(process.execPath, [GUARD, '--mounted', 'dsh'], { encoding: 'utf8' })
    expect(ran.status, ran.stdout + ran.stderr).toBe(0)
    expect(ran.stdout).toContain('names tools/guard/main-world-guard.mjs as a PreToolUse hook')
  })
})
