// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ADDRESS IN A SANDBOX SHELL IS FOR THAT SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC; the coordinator,
 * message UbLJSVj0zZd_).
 *
 * Every sandbox shell sets MOLE_OFFICE_API to the live office, for the run's own tools. On 4 October 2026 a hand run of
 * an installed office's bundled register-myself.mjs, in such a shell and without --api, took that address and
 * registered a made-up agent on the live office. Now the helper that starts a sandbox's command sets
 * MOLE_OFFICE_API_ROOT beside the address, the sandbox's folder, and only code running from a git checkout inside that
 * folder takes the address from the environment (theEnvironmentsAddressIsForAnotherCopy in src/config/settings.mjs).
 *
 * WHAT IS PROVED
 *   1. With no root set nothing changes: the environment's address is taken, as before.
 *   2. A copy outside the root refuses, and its sentence names the root, the copy and the --api to pass.
 *   3. A git checkout inside the root takes the address: a clone (.git a folder), a worktree (.git a file), the root
 *      itself. A folder whose name only begins with the root's is outside it.
 *   4. An unpacked or installed copy inside the root (no .git) refuses, and says it is no git checkout.
 *   5. The root and the copy are compared as real paths, so a root named through a link still holds its checkouts.
 *   6. whereIsTheApi throws the sentence; --api always wins, in it and in the message script.
 *   7. The message script (python3, for-agents/send-message.py) refuses with the same sentence, word for word, sends
 *      nothing, and from a checkout inside the root sends to the environment's address.
 *   8. The other readers of the environment's address refuse too: office-request's theRunsIdentity, the use line, and
 *      settle-owed-runs.
 *   9. The commands that read the address through settings() or the resolver, moved onto the one reader, refuse with
 *      the sentence and send nothing: register-myself.mjs (the command of 4 October), brief, give-every-citizen-a-card,
 *      register-a-run, register-a-started-agent and the-eleven-columns, each with exit 2; and isolated-mole-office,
 *      which keeps its own resolver and asks the question first, with its own exit 1. register-myself.mjs sends with
 *      --api.
 * The helper's half, that a command started in a sandbox has MOLE_OFFICE_API_ROOT naming the sandbox's folder, is in
 * tests/sandbox-launcher.test.ts. That no test inherits the root is in tests/a-test-sees-no-agents-environment.test.ts.
 *
 * HOW. Folders made here stand in for a sandbox's folder and the copies in it. The address is a server this file starts
 * on 127.0.0.1, which keeps what it is sent and answers 201; nothing here reaches an office. Every child this file
 * starts is the leader of a process group of its own, and is stopped by that group's id if it runs past twenty seconds.
 *
 * MUTATIONS, each proved red in the run that adds this file: the function always answers null (2, 4, 6, 7, 8); the
 * root compared without its closing "/" (3); any copy inside the root taken, checkout or not (4); paths compared
 * without reading links (5); whereIsTheApi asks nothing (6); whereIsTheApi asks before --api (6); the message script
 * asks nothing (7); the message script asks even with --api (7); theRunsIdentity, the use line and settle-owed-runs
 * each ask nothing (8); each command of 9 reads its address as it did before; the helper for commands throws instead
 * of saying the sentence and exiting 2 (9).
 */

import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { REPO_ROOT, theEnvironmentsAddressIsForAnotherCopy } from '../src/config/settings.mjs'
import { theRunsIdentity } from '../tools/office-request.mjs'
import { settleOwedRuns } from '../tools/settle-owed-runs.mjs'
import { theOfficeInThisEnvironment, writeAUseLine } from '../tools/use-line.mjs'

const REPO = realpathSync(REPO_ROOT)
const SEND_MESSAGE = fileURLToPath(new URL('../for-agents/send-message.py', import.meta.url))
const WHERE_IS_THE_API = fileURLToPath(new URL('../for-agents/where-is-the-api.mjs', import.meta.url))

/** How long a child may run before its group is stopped and the case fails. */
const A_CHILD_MAY_RUN_MS = 20_000

let server: Server | null = null
let api = ''
let kept: string[] = []
let folder = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let said = ''
    req.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
    req.on('end', () => {
      kept.push(said)
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ record: { id: 'kept' } }))
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', () => done()))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  if (server !== null) await new Promise<void>((done) => server?.close(() => done()))
  server = null
})

beforeEach(() => {
  kept = []
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-address-root-')))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** A folder at `path` that is a git checkout: `.git` a folder (a clone) or a file (a worktree). */
function aCheckout(path: string, kind: 'clone' | 'worktree' = 'clone'): string {
  mkdirSync(path, { recursive: true })
  if (kind === 'clone') mkdirSync(join(path, '.git'))
  else writeFileSync(join(path, '.git'), 'gitdir: /nowhere/.git/worktrees/x\n')
  return path
}

/** Run a child in a process group of its own, with only the environment given, and wait for it. */
async function run(command: string, args: string[], env: Record<string, string>, cwd: string = REPO): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(command, args, { cwd, detached: true, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
  let stopped = false
  const timer = setTimeout(() => {
    stopped = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, A_CHILD_MAY_RUN_MS)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stopped) throw new Error(`${command} ${args.join(' ')} was still running after ${String(A_CHILD_MAY_RUN_MS)} ms, so its group was stopped`)
  return { code, out, err }
}

/** whereIsTheApi in a child of its own, from this checkout, with `override` as --api when given. */
async function whereIsTheApiIn(env: Record<string, string>, override?: string): Promise<{ code: number | null; out: string; err: string }> {
  const call = override === undefined ? 'whereIsTheApi()' : `whereIsTheApi(${JSON.stringify(override)})`
  const script = `import(${JSON.stringify(WHERE_IS_THE_API)}).then((m) => console.log(m.${call}))` +
    '.catch((e) => { console.error(e.message); process.exitCode = 3 })'
  return run(process.execPath, ['--input-type=module', '-e', script], env)
}

/** The message script, as a copy at `copy` (its for-agents folder made there) or this checkout's own. */
async function sendMessage(env: Record<string, string>, args: string[] = [], copy: string | null = null): Promise<{ code: number | null; out: string; err: string }> {
  let script = SEND_MESSAGE
  if (copy !== null) {
    mkdirSync(join(copy, 'for-agents'), { recursive: true })
    script = join(copy, 'for-agents', 'send-message.py')
    cpSync(SEND_MESSAGE, script)
  }
  const body = join(folder, 'body.txt')
  writeFileSync(body, 'Synthetic words.\n')
  return run('python3', [script, 'panelx', 'someone', 'A title', body, '--as', 'an-agent', ...args], env)
}

/**
 * THE COMMANDS THAT READ THE ADDRESS THROUGH settings() OR THE RESOLVER, now through the one reader, each with what its
 * command line needs to reach the line that reads it, and the exit it refuses with.
 */
const THE_COMMANDS: { tool: string; args: (folder: string) => string[]; exit: number }[] = [
  { tool: 'for-agents/register-myself.mjs', args: (f) => ['--handle', 'an-agent', '--name', 'An agent', '--dir', f, '--key-file', join(f, 'a-key')], exit: 2 },
  { tool: 'tools/brief.mjs', args: () => [], exit: 2 },
  { tool: 'tools/give-every-citizen-a-card.mjs', args: () => [], exit: 2 },
  {
    tool: 'tools/register-a-run.mjs',
    args: (f) => ['--handle', 'an-agent', '--worktree', f, '--cut-from', 'main', '--runtime', 'claude-code', '--as', 'an-agent', '--session', 'a-session', '--workspace', 'panelx'],
    exit: 2,
  },
  { tool: 'tools/register-a-started-agent.mjs', args: (f) => ['--handle', 'an-agent', '--name', 'An agent', '--role', 'worker', '--key-file', join(f, 'a-key')], exit: 2 },
  { tool: 'tools/the-eleven-columns.ts', args: () => [], exit: 2 },
  { tool: 'tools/isolated-mole-office.mjs', args: () => ['list'], exit: 1 },
]

/** One of THE_COMMANDS, from this checkout, by the node running this file (a .ts one through tsx). */
async function aCommand(tool: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  return run(process.execPath, [...(tool.endsWith('.ts') ? ['--import', 'tsx'] : []), join(REPO, tool), ...args], env)
}

describe('the office address in a sandbox shell is for that sandbox\'s own checkouts', () => {
  it('changes nothing where no root is set', async () => {
    const outside = aCheckout(join(folder, 'elsewhere'))
    expect(theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: api }, outside)).toBeNull()
    expect(theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: '  ' }, outside)).toBeNull()
    // A root with no address to give asks nothing either: the tool falls back to its usual default.
    expect(theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API_ROOT: join(folder, 'sandbox') }, outside)).toBeNull()
    const taken = await whereIsTheApiIn({ MOLE_OFFICE_API: `${api}/` })
    expect(taken.code, taken.err).toBe(0)
    expect(taken.out.trim()).toBe(api)
  })

  it('refuses a copy outside the root, naming the root, the copy and the --api to pass', async () => {
    const root = join(folder, 'sandbox')
    mkdirSync(root)
    const outside = aCheckout(join(folder, 'an-installed-office'))
    const said = theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: `${api}/`, MOLE_OFFICE_API_ROOT: root }, outside)
    expect(said).toBe(
      `MOLE_OFFICE_API in this shell was given for the git checkouts in ${root}, and this copy of the office's tools is ` +
        `${outside}, outside it, so it does not take that address. Say which office you mean with --api: --api ${api} ` +
        'for the office this shell names, or the address of an office of your own. Nothing was sent.',
    )
  })

  it('lets a git checkout inside the root take the address: a clone, a worktree, the root itself', () => {
    const root = join(folder, 'sandbox')
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }
    expect(theEnvironmentsAddressIsForAnotherCopy(env, aCheckout(join(root, 'repo')))).toBeNull()
    expect(theEnvironmentsAddressIsForAnotherCopy(env, aCheckout(join(root, 'worktrees', 'a-branch'), 'worktree'))).toBeNull()
    expect(theEnvironmentsAddressIsForAnotherCopy({ ...env, MOLE_OFFICE_API_ROOT: `${root}/` }, aCheckout(join(root, 'clones', 'two')))).toBeNull()
    expect(theEnvironmentsAddressIsForAnotherCopy(env, aCheckout(root))).toBeNull()
    // A folder whose name only begins with the root's is not inside it.
    const beside = aCheckout(join(folder, 'sandbox-2', 'repo'))
    expect(theEnvironmentsAddressIsForAnotherCopy(env, beside)).toContain(`${beside}, outside it`)
  })

  it('refuses an unpacked or installed copy inside the root, which is no git checkout', () => {
    const root = join(folder, 'sandbox')
    const unpacked = join(root, 'home', 'an-office-bundle')
    mkdirSync(unpacked, { recursive: true })
    const said = theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }, unpacked)
    expect(said).toContain(`${unpacked}, which is inside it but is no git checkout (an unpacked or installed copy)`)
    expect(said).toContain(`--api ${api} `)
  })

  it('compares real paths, so a root named through a link still holds its checkouts', () => {
    const root = join(folder, 'sandbox')
    const checkout = aCheckout(join(root, 'repo'))
    const link = join(folder, 'a-link-to-the-sandbox')
    symlinkSync(root, link)
    expect(theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: link }, checkout)).toBeNull()
    expect(theEnvironmentsAddressIsForAnotherCopy({ MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }, join(link, 'repo'))).toBeNull()
  })

  it('makes whereIsTheApi throw the sentence for a copy outside the root, and lets --api win', async () => {
    const root = join(folder, 'sandbox')
    mkdirSync(root)
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }
    const refused = await whereIsTheApiIn(env)
    expect(refused.code, refused.out).toBe(3)
    expect(refused.err.trim()).toBe(theEnvironmentsAddressIsForAnotherCopy(env, REPO))
    const named = await whereIsTheApiIn(env, 'http://127.0.0.1:9/')
    expect(named.code, named.err).toBe(0)
    expect(named.out.trim()).toBe('http://127.0.0.1:9')
    // This checkout inside the root takes the environment's address.
    const inside = await whereIsTheApiIn({ MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: dirname(REPO) })
    expect(inside.code, inside.err).toBe(0)
    expect(inside.out.trim()).toBe(api)
  })

  it('makes the message script refuse with the same sentence and send nothing; --api wins; a checkout inside sends', async () => {
    const root = join(folder, 'sandbox')
    mkdirSync(root)
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }
    const refused = await sendMessage(env)
    expect(refused.code, refused.out).toBe(2)
    expect(refused.err.trim()).toBe(theEnvironmentsAddressIsForAnotherCopy(env, REPO))
    expect(kept).toEqual([])

    const unpacked = join(root, 'an-office-bundle')
    const fromTheBundle = await sendMessage(env, [], unpacked)
    expect(fromTheBundle.code, fromTheBundle.out).toBe(2)
    expect(fromTheBundle.err.trim()).toBe(theEnvironmentsAddressIsForAnotherCopy(env, unpacked))
    expect(kept).toEqual([])

    const named = await sendMessage({ MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_API_ROOT: root }, ['--api', api])
    expect(named.code, `${named.out}\n${named.err}`).toBe(0)
    expect(kept).toHaveLength(1)

    const checkout = aCheckout(join(root, 'repo'))
    const fromTheCheckout = await sendMessage(env, [], checkout)
    expect(fromTheCheckout.code, `${fromTheCheckout.out}\n${fromTheCheckout.err}`).toBe(0)
    expect(kept).toHaveLength(2)
    expect(JSON.parse(kept[1] ?? '{}')).toMatchObject({ kind: 'message', title: 'A title' })
  })

  it("makes the office request tool's identity refuse an address given for another copy", () => {
    const root = join(folder, 'sandbox')
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root, MOLE_OFFICE_AGENT: 'an-agent' }
    expect(() => theRunsIdentity(env)).toThrow(theEnvironmentsAddressIsForAnotherCopy(env, REPO) ?? 'no sentence')
    expect(theRunsIdentity({ ...env, MOLE_OFFICE_API_ROOT: dirname(REPO) }).api).toBe(api)
  })

  it('makes the use line name no office, in the sentence, for an address given for another copy', async () => {
    const root = join(folder, 'sandbox')
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }
    const sentence = theEnvironmentsAddressIsForAnotherCopy(env, REPO) ?? 'no sentence'
    Object.assign(process.env, env, { MOLE_OFFICE_WORKSPACE: 'panelx', MOLE_OFFICE_AGENT: 'an-agent', MOLE_OFFICE_SESSION: 'a-run' })
    try {
      const office = theOfficeInThisEnvironment()
      expect(office.api).toBeUndefined()
      expect(office.refused).toBe(sentence)
      expect(await writeAUseLine({ tool: 'a-tool', said: 'used', office })).toEqual({
        written: false,
        why: 'no office',
        words: `The use was not written on any run: ${sentence}`,
      })
      expect(kept).toEqual([])
    } finally {
      for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION']) {
        delete process.env[name]
      }
    }
  })

  it('makes settle-owed-runs refuse an address given for another copy before it asks anything', async () => {
    const root = join(folder, 'sandbox')
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root }
    const sentence = theEnvironmentsAddressIsForAnotherCopy(env, REPO) ?? 'no sentence'
    Object.assign(process.env, env)
    try {
      await expect(settleOwedRuns(['--agent', 'an-agent'])).rejects.toThrow(sentence)
      expect(kept).toEqual([])
    } finally {
      delete process.env['MOLE_OFFICE_API']
      delete process.env['MOLE_OFFICE_API_ROOT']
    }
  })

  it.each(THE_COMMANDS)('makes $tool refuse an address given for another copy, with the sentence, and send nothing', async ({ tool, args, exit }) => {
    const root = join(folder, 'sandbox')
    mkdirSync(root)
    const env = { MOLE_OFFICE_API: api, MOLE_OFFICE_API_ROOT: root, MOLE_OFFICE_WORKSPACE: 'panelx', MOLE_OFFICE_AGENT: 'an-agent' }
    const refused = await aCommand(tool, args(folder), env)
    expect(refused.code, `${refused.out}\n${refused.err}`.slice(-1500)).toBe(exit)
    expect(refused.err).toContain(theEnvironmentsAddressIsForAnotherCopy(env, REPO) ?? 'no sentence')
    expect(kept).toEqual([])
  })

  it('lets --api win for register-myself.mjs, the command that registered a made-up agent on 4 October', async () => {
    const root = join(folder, 'sandbox')
    mkdirSync(root)
    const env = { MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_API_ROOT: root, MOLE_OFFICE_WORKSPACE: 'panelx', MOLE_OFFICE_AGENT: 'an-agent' }
    const sent = await aCommand('for-agents/register-myself.mjs', ['--api', api, '--handle', 'an-agent', '--name', 'An agent', '--dir', folder, '--key-file', join(folder, 'a-key')], env)
    expect(sent.err, `${sent.out}\n${sent.err}`.slice(-1500)).not.toContain('does not take that address')
    expect(kept.length, `${sent.out}\n${sent.err}`.slice(-1500)).toBeGreaterThan(0)
  })
})
