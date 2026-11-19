// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A CLAUDE CODE RUN'S HOOKS READ WITH THE RUN'S OWN KEY, AFTER THE KEY WINDOW CLOSED. Problem RJradfGfKxlq.
 *
 * The launcher takes MOLE_AGENT_KEY out of a Claude Code run's environment unless the run starts runs, and gives the key
 * to office_request in the run's own office tool configuration (problem rgAmP45EklqO). The hooks run in Claude Code's
 * environment, so they held no key, and since the key window closed on 28 September 2026 the office refuses every read
 * under an agent's name that carries none. So no run was told what waited for it, and a supervisor's stop was let go
 * unread: wave 13t's round 14 at 05:51:48 on 4 October, with its background work still running. The launcher now names
 * the configuration in MOLE_OFFICE_TOOL_CONFIGURATION, and the hooks read the run's key from it, only when the file
 * names their own agent and run (message 1s5mFLOPSg-4).
 *
 * WHAT IS REAL. A test world holding a made-up person's key, whose window their key closes, as the owner closed the office's. The
 * two hook scripts run as their own processes against it on a free port, with no MOLE_AGENT_KEY and no key file where
 * they look, as in a sandbox. The configuration is what the launcher's own aClaudeCommandsOfficeTool answers, written as
 * tools/sandbox-start.mjs writes it, and the environment changes it answers are the ones applied. No model runs and no
 * live office is reached; every key here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - theHeaders not reading the run's key from the configuration: the held case is red.
 *   - aClaudeCommandsOfficeTool not naming the configuration in MOLE_OFFICE_TOOL_CONFIGURATION: the held case is red.
 *   - theRunsKeyInItsOfficeToolConfiguration not asking whose run the file names: the not-its-own case is red.
 *   - a failed message read letting the stop go by itself, as before: the without-the-variable case is red, because the
 *     sentence no longer names the run's own record too.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aClaudeCommandsOfficeTool, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { theDeliveryPreface } from '../tools/dsh-hooks/office.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const STEP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-step.mjs', import.meta.url))
const STOP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-stop.mjs', import.meta.url))

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = 'b3'.repeat(32)
const A_MADE_UP_OFFICE_KEY = 'c4'.repeat(32)

const SUPERVISOR = 'cc-keyed-supervisor'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const WORKSPACE = { 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let api = ''
/** The supervisor's own key, answered by its registration: the key its run's office tool holds. */
let key = ''
/** The supervisor's run, still running. */
let session = ''
const made: string[] = []

function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-hooks-runs-key-${what}-`))
  made.push(dir)
  return dir
}

const asTheSupervisor = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': SUPERVISOR,
  'x-mole-office-key': key,
})

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

/**
 * THE RUN'S OFFICE TOOL, AS THE LAUNCHER GIVES IT: the configuration aClaudeCommandsOfficeTool answers for a run of
 * `named.agent` filed as `named.session`, written in a folder of its own with mode 600, and the environment changes it
 * answers. The file may name another agent or run than the hook's, which is the case a hook must not take the key from.
 */
function theOfficeToolFor(named: { agent: string; session: string }): { path: string; changes: Record<string, string | null> } {
  const path = join(aScratchDirectory('office-mcp'), 'office-mcp.json')
  const answered = aClaudeCommandsOfficeTool(['claude', '-p'], {
    MOLE_OFFICE_AGENT: named.agent,
    MOLE_OFFICE_SESSION: named.session,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_API: api,
    MOLE_AGENT_KEY: key,
  }, path)
  expect(answered.configuration, 'the launcher wrote no office tool configuration').not.toBeNull()
  writeFileSync(path, `${JSON.stringify(answered.configuration)}\n`, { mode: 0o600, flag: 'wx' })
  return { path, changes: answered.env }
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Run one hook as Claude Code would in a sandbox: the payload on stdin, the run's identity in the environment, the office
 * tool's environment changes applied, no MOLE_AGENT_KEY, and a database path with no key file beside it. `without` takes
 * names out last.
 */
function runHook(script: string, cwd: string, tool: { changes: Record<string, string | null> }, payload: unknown, without: string[] = []): Promise<Ran> {
  const env: Record<string, string> = { ...withoutInheritedEffort() } as Record<string, string>
  for (const name of ['FORCE_COLOR', 'NO_COLOR', 'MOLE_AGENT_KEY', OFFICE_TOOL_CONFIGURATION]) delete env[name]
  env['MOLE_OFFICE_AGENT'] = SUPERVISOR
  env['MOLE_OFFICE_SESSION'] = session
  env['MOLE_OFFICE_WORKSPACE'] = 'default'
  env['MOLE_OFFICE_API'] = api
  // A SANDBOX MOUNTS NO KEY FILE, so the office's own key is not found where the hook looks for it.
  env['MOLE_OFFICE_DB'] = join(aScratchDirectory('no-key-file'), 'panelx.db')
  for (const [name, value] of Object.entries(tool.changes)) {
    if (value === null) delete env[name]
    else env[name] = value
  }
  for (const name of without) delete env[name]
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {})
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

function parsed(ran: Ran): Record<string, unknown> | null {
  const text = ran.stdout.trim()
  return text === '' ? null : (JSON.parse(text) as Record<string, unknown>)
}

/**
 * The sentence a stop is let go with when every read that needs a key was refused: what waits for the
 * supervisor, the workers that could not be read, and its own run. THE WORKERS READ IS A THIRD REFUSED
 * READ since the Stop hook asks the office's running-workers door, which names the handle and so needs a
 * key, where the roster it read before named no agent and was answered without one.
 */
const refusedAndLetGo = (): string =>
  `claude-code Stop: Mole Office answered 403 at ${api} about what is waiting for "${SUPERVISOR}"; ` +
  `Mole Office answered 403 at ${api} about the agents "${SUPERVISOR}" started; ` +
  `Mole Office answered 403 at ${api} about run ${session}, so the stop was allowed.\n`

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // THE SUPERVISOR, REGISTERED THROUGH A PROVED PATH, because the close refuses while a live agent holds no proved key
  // the person's key, which answers the agent's own.
  const registered = await inject('POST', '/api/agents/started', { 'content-type': 'application/json', ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }, {
    handle: SUPERVISOR,
    name: SUPERVISOR,
    role: 'supervisor',
  })
  expect(registered.status, JSON.stringify(registered.json)).toBe(201)
  key = String((registered.json['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(key, 'the registration answered no key').not.toBe('')
  const filed = await inject('POST', '/api/records', asTheSupervisor(), { kind: 'session', title: `a run of ${SUPERVISOR}`, data: { state: 'running' } })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  session = (filed.json['record'] as { id: string }).id

  // THE PERSON CLOSES THE WINDOW WITH THEIR KEY, through a listener, as the owner closed the office's on 28 September 2026.
  const closed = await fetch(`${api}/api/office/key-window/close`, { method: 'POST', headers: { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY } })
  expect(closed.status, await closed.text()).toBe(200)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("a Claude Code run's hooks, after the key window closed", () => {
  it("hold a supervisor's stop for the message waiting and give its words, read with the run's key from its office tool", async () => {
    // NOTHING ELSE WAITS: the office sends a new agent its card, which would otherwise be counted.
    const waiting = await inject('GET', '/api/messages?only=waiting-for-me', asTheSupervisor())
    expect(waiting.status, JSON.stringify(waiting.json)).toBe(200)
    for (const one of (waiting.json['messages'] ?? []) as { id: string }[]) {
      const marked = await inject('POST', `/api/messages/${one.id}/mark`, asTheSupervisor(), { mark: 'seen' })
      expect(marked.status, JSON.stringify(marked.json)).toBe(200)
    }
    const written = await inject('POST', '/api/records', { 'content-type': 'application/json', ...WORKSPACE, ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }, {
      kind: 'message',
      title: 'a message for the keyed supervisor',
      data: { body: 'read this before you stop', to: [{ kind: 'agent', id: SUPERVISOR }] },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(written.status, JSON.stringify(written.json)).toBe(409)
    const message = (written.json['record'] as { id: string }).id

    const tool = theOfficeToolFor({ agent: SUPERVISOR, session })
    // THE LAUNCHER'S SIDE: the key leaves Claude Code's environment, and the variable names the file, the path only.
    expect(tool.changes).toEqual({ MOLE_AGENT_KEY: null, [OFFICE_TOOL_CONFIGURATION]: tool.path })

    const stopped = await runHook(STOP, aScratchDirectory('held'), tool, { hook_event_name: 'Stop' })
    expect(stopped.status, stopped.stderr).toBe(0)
    expect(stopped.stderr, 'the stop hook could not read with the run\'s key').toBe('')
    expect(parsed(stopped)?.['decision']).toBe('block')
    expect(String(parsed(stopped)?.['reason'])).toContain(`There is 1 unseen message addressed to you in Mole Office: ${message}.`)
    expect(String(parsed(stopped)?.['reason']), 'the stop reason did not give the message’s words').toContain('read this before you stop')

    const stepped = await runHook(STEP, aScratchDirectory('counted'), tool, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(stepped.status, stepped.stderr).toBe(0)
    expect(stepped.stderr).toBe('')
    const output = (parsed(stepped)?.['hookSpecificOutput'] ?? {}) as Record<string, unknown>
    const context = String(output['additionalContext'])
    expect(context.startsWith(theDeliveryPreface({ handle: SUPERVISOR }, 1)), 'the step did not begin with the preface').toBe(true)
    expect(context, 'the step did not give the message’s words').toContain('read this before you stop')

    // THE KEY IS NEVER PRINTED (1s5mFLOPSg-4).
    for (const ran of [stopped, stepped]) expect(ran.stdout + ran.stderr).not.toContain(key)
  })

  it('without the variable, refuse every read it needs and let the stop go, as wave 13t’s was, saying each', async () => {
    const tool = theOfficeToolFor({ agent: SUPERVISOR, session })
    const stopped = await runHook(STOP, aScratchDirectory('unread'), tool, { hook_event_name: 'Stop' }, [OFFICE_TOOL_CONFIGURATION])
    expect(stopped.status, stopped.stderr).toBe(0)
    expect(stopped.stdout).toBe('')
    expect(stopped.stderr).toBe(refusedAndLetGo())
    const stepped = await runHook(STEP, aScratchDirectory('uncounted'), tool, { hook_event_name: 'PostToolUse' }, [OFFICE_TOOL_CONFIGURATION])
    expect(stepped.status, stepped.stderr).toBe(0)
    expect(stepped.stdout).toBe('')
    expect(stepped.stderr).toMatch(/Mole Office answered 403 at .* so no message was attached\./)
  })

  it.each([
    ['another run', (): { agent: string; session: string } => ({ agent: SUPERVISOR, session: 'aRunThatIsNotThisOne' })],
    ['another agent', (): { agent: string; session: string } => ({ agent: 'cc-keyed-someone-else', session })],
  ])('do not take the key from a configuration that names %s', async (_which, named) => {
    const tool = theOfficeToolFor(named())
    const stopped = await runHook(STOP, aScratchDirectory('not-its-own'), tool, { hook_event_name: 'Stop' })
    expect(stopped.status, stopped.stderr).toBe(0)
    expect(stopped.stdout, 'a hook took the key from a configuration that is not its run’s').toBe('')
    expect(stopped.stderr).toBe(refusedAndLetGo())
    expect(stopped.stderr).not.toContain(key)
  })
})
