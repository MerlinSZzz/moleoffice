// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN-WORLD GUARD STOPS A REAL RUNTIME'S TOOL CALL. Opt-in: GUARD_REAL_RUNTIMES=1.
 *
 * tests/the-guard-is-mounted-on-every-runtime.test.ts pins what each adapter puts on the command
 * line. This file starts the installed Claude Code, Codex and OpenCode with exactly that command
 * line and shows the runtime honours it: the tool call the guard refuses does not happen, and the
 * one it lets through does.
 *
 * NO MODEL IS CALLED AND NO RUNTIME'S OWN HOME IS TOUCHED. Each runtime is pointed at a stand-in
 * for its model's API, started here, that answers with a fixed script of tool calls and then
 * "done". Each runtime's configuration and state directories are fresh folders under /tmp, removed
 * afterwards. What the scripted calls touch is a folder under /tmp holding three things:
 *
 *   canary/           rm -rf "${GUARD_PROBE_NEVER_SET}canary" — rule 1, an unset variable in a
 *                     delete. If the guard were not honoured, canary/ would be gone.
 *   data/keys.json    deleted or overwritten by the runtime's file tool — rule 3.
 *   junk/             mv junk junk-moved — let through; it must be moved.
 *
 * Claude Code runs with `--permission-mode bypassPermissions`, because that is the mode the flags
 * piece gives a guarded run on the host, and the question is whether the guard still stops a call
 * there. Codex runs with `-s danger-full-access` for the same reason.
 *
 * WHY OPT-IN. It starts three agent programs, which may try their own update checks; nothing here
 * should do that on every run of the suite. Measured on this machine on 22 September 2026 with
 * Claude Code 2.1.278, Codex 0.155.1 and OpenCode 1.18.31.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: drop the guard from the command each
 * adapter builds (`claudeCodeGuard`, `codexGuard`, `openCodeGuard` answering nothing) → every
 * runtime deletes canary/ and the three cases are red.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { RunRequest } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { whereItIs } from '../src/worker/runtimes/os.ts'

const ON = process.env['GUARD_REAL_RUNTIMES'] === '1'
const EMPTY_DELETE = 'rm -rf "${GUARD_PROBE_NEVER_SET}canary"'
const STOPPED = "Mole Office's guard stopped this call"
const KEYS = '{"made":"up"}\n'
const made: string[] = []

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A folder under /tmp for one runtime: its homes, and the work folder the script touches. */
function world(name: string): { root: string; work: string } {
  const root = mkdtempSync(join('/tmp', `guard-runtime-${name}-`))
  made.push(root)
  const work = join(root, 'work')
  for (const dir of ['canary', 'junk', 'data']) mkdirSync(join(work, dir), { recursive: true })
  writeFileSync(join(work, 'data', 'keys.json'), KEYS)
  return { root, work }
}

function request(run: Partial<RunRequest> & { cwd: string }): RunRequest {
  return { session: 'a-session-id', agent: 'probe-agent', prompt: 'probe', api: 'http://127.0.0.1:9', workspace: 'panelx', outputPath: join(run.cwd, '..', 'out'), ...run }
}

/** The environment a runtime is started with here: this one, less anything naming a model account. */
function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || /^(ANTHROPIC_|CLAUDE|OPENAI_|CODEX_|OPENCODE_|MOLE_OFFICE_|GUARD_PROBE)/.test(k)) continue
    env[k] = v
  }
  return { ...env, MOLE_OFFICE_API: 'http://127.0.0.1:9', ...extra }
}

/** Start a stand-in model API; `answer` writes each reply. Every request body is kept. */
async function standIn(answer: (body: Record<string, unknown>, res: ServerResponse, req: IncomingMessage) => void): Promise<{ url: string; bodies: Record<string, unknown>[]; server: Server }> {
  const bodies: Record<string, unknown>[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d: Buffer) => { raw += d.toString('utf8') })
    req.on('end', () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      bodies.push(body)
      answer(body, res, req)
    })
  })
  server.on('upgrade', (_req, socket) => socket.destroy())
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, bodies, server }
}

/** The Anthropic Messages API, streaming: one scripted tool call per turn, then "done". */
function anthropic(script: { name: string; input: Record<string, unknown> }[]) {
  return (body: Record<string, unknown>, res: ServerResponse, req: IncomingMessage) => {
    if (!(req.url ?? '').startsWith('/v1/messages') || (req.url ?? '').includes('count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ input_tokens: 1 }))
      return
    }
    const messages = Array.isArray(body['messages']) ? (body['messages'] as { content?: unknown }[]) : []
    const results = messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type?: string }[]) : [])).filter((c) => c.type === 'tool_result').length
    const step = Array.isArray(body['tools']) ? script[results] : undefined
    const block = step === undefined ? { type: 'text', text: 'done' } : { type: 'tool_use', id: `toolu_${results}`, name: step.name, input: step.input }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    send('message_start', { type: 'message_start', message: { id: `msg_${results}`, type: 'message', role: 'assistant', model: body['model'], content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } })
    send('content_block_start', { type: 'content_block_start', index: 0, content_block: block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} } })
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: block.type === 'text' ? { type: 'text_delta', text: 'done' } : { type: 'input_json_delta', partial_json: JSON.stringify(step?.input) } })
    send('content_block_stop', { type: 'content_block_stop', index: 0 })
    send('message_delta', { type: 'message_delta', delta: { stop_reason: step === undefined ? 'end_turn' : 'tool_use' }, usage: { output_tokens: 1 } })
    send('message_stop', { type: 'message_stop' })
    res.end()
  }
}

/** The OpenAI Responses API, streaming, as Codex reads it. */
function responses(script: ({ name: string; arguments: Record<string, unknown> } | { custom: string; input: string })[]) {
  return (body: Record<string, unknown>, res: ServerResponse) => {
    const input = Array.isArray(body['input']) ? (body['input'] as { type?: string }[]) : []
    const outputs = input.filter((i) => i.type === 'function_call_output' || i.type === 'custom_tool_call_output').length
    const step = script[outputs]
    const item =
      step === undefined
        ? { type: 'message', id: 'msg_done', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'done', annotations: [] }] }
        : 'custom' in step
          ? { type: 'custom_tool_call', id: `ctc_${outputs}`, call_id: `call_${outputs}`, name: step.custom, input: step.input, status: 'completed' }
          : { type: 'function_call', id: `fc_${outputs}`, call_id: `call_${outputs}`, name: step.name, arguments: JSON.stringify(step.arguments), status: 'completed' }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (data: Record<string, unknown> & { type: string }) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)
    send({ type: 'response.created', response: { id: `resp_${outputs}` } })
    send({ type: 'response.output_item.added', output_index: 0, item })
    send({ type: 'response.output_item.done', output_index: 0, item })
    send({ type: 'response.completed', response: { id: `resp_${outputs}`, usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2 } } })
    res.end()
  }
}

/** Start a runtime as the leader of its own group, wait for it, and end the group whatever happens. */
async function runToTheEnd(command: string, args: string[], cwd: string, env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (d: Buffer) => { out += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => { err += d.toString('utf8') })
  const timer = setTimeout(() => { try { process.kill(-(child.pid ?? 0), 'SIGTERM') } catch { /* already gone */ } }, 80_000)
  const code = await new Promise<number | null>((done) => child.on('close', (c) => done(c)))
  clearTimeout(timer)
  try { process.kill(-(child.pid ?? 0), 'SIGTERM') } catch { /* the group has ended, which is what was wanted */ }
  return { code, out, err }
}

/** Every text the runtime sent back to the model as a tool's result, joined. */
function whatTheModelWasTold(bodies: Record<string, unknown>[]): string {
  return JSON.stringify(bodies)
}

describe.skipIf(ON)('the guard in each real runtime (switched off)', () => {
  it('runs only with GUARD_REAL_RUNTIMES=1, because it starts three agent programs', () => {
    expect(ON).toBe(false)
  })
})

describe.skipIf(!ON)('the guard in each real runtime', () => {
  it.skipIf(whereItIs('claude', process.env['PATH']) === null)('Claude Code, under bypassPermissions, does not run the call the guard stops', async () => {
    const { root, work } = world('claude')
    const api = await standIn(anthropic([
      { name: 'Bash', input: { command: EMPTY_DELETE, description: 'a delete of an unset variable' } },
      { name: 'Write', input: { file_path: join(work, 'data', 'keys.json'), content: '{}' } },
      { name: 'Bash', input: { command: 'mv junk junk-moved', description: 'a move the guard lets through' } },
    ]))
    try {
      // THE ADAPTER'S OWN PERMISSION FLAG, which it gives because the guard is on the command.
      const command = new ClaudeCodeAdapter({ MOLE_OFFICE_AGENT_MODEL: 'claude-haiku-4-5' }).commandFor(request({ cwd: work }))
      expect(command.args.slice(0, 2)).toEqual(['--permission-mode', 'bypassPermissions'])
      const args = [...command.args, '--no-session-persistence']
      const ran = await runToTheEnd(command.command, args, work, cleanEnv({
        HOME: join(root, 'home'),
        CLAUDE_CONFIG_DIR: join(root, 'config'),
        ANTHROPIC_API_KEY: 'sk-a-stand-in-not-a-key',
        ANTHROPIC_BASE_URL: api.url,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        DISABLE_AUTOUPDATER: '1',
      }))
      expect(ran.code, ran.err).toBe(0)
      expect(existsSync(join(work, 'canary')), 'the guard was not honoured: canary/ is gone').toBe(true)
      expect(readFileSync(join(work, 'data', 'keys.json'), 'utf8'), 'the Write the guard refused went through').toBe(KEYS)
      expect(existsSync(join(work, 'junk-moved')), 'the call the guard lets through did not run').toBe(true)
      expect(whatTheModelWasTold(api.bodies)).toContain(STOPPED)
    } finally {
      api.server.close()
    }
  }, 90_000)

  it.skipIf(whereItIs('codex', process.env['PATH']) === null)('Codex, with full access, does not run the shell call or the patch the guard stops', async () => {
    const { root, work } = world('codex')
    mkdirSync(join(root, 'codex-home'), { recursive: true })
    const api = await standIn(responses([
      { name: 'exec_command', arguments: { cmd: EMPTY_DELETE, workdir: work } },
      { custom: 'apply_patch', input: '*** Begin Patch\n*** Delete File: data/keys.json\n*** End Patch\n' },
      { name: 'exec_command', arguments: { cmd: 'mv junk junk-moved' } },
    ]))
    try {
      // THE ADAPTER'S OWN FULL ACCESS, before `exec`, which it gives because the guard is on the command.
      const command = new CodexAdapter().commandFor(request({ cwd: work }))
      expect(command.args.slice(0, 5)).toEqual(['-s', 'danger-full-access', '-a', 'never', 'exec'])
      const prompt = command.args.at(-1) ?? 'probe'
      const provider = `model_providers.standin={name="standin",base_url="${api.url}/v1",wire_api="responses",env_key="OPENAI_API_KEY",supports_websockets=false}`
      const args = [
        ...command.args.slice(0, -1),
        '--ephemeral',
        '-c', 'model_provider="standin"', '-c', provider, '-c', 'model="gpt-5.5"',
        prompt,
      ]
      const ran = await runToTheEnd(command.command, args, work, cleanEnv({
        HOME: join(root, 'home'),
        CODEX_HOME: join(root, 'codex-home'),
        OPENAI_API_KEY: 'sk-a-stand-in-not-a-key',
      }))
      expect(ran.code, ran.err).toBe(0)
      expect(existsSync(join(work, 'canary')), 'the guard was not honoured: canary/ is gone').toBe(true)
      expect(existsSync(join(work, 'data', 'keys.json')), 'the patch the guard refused deleted the keys file').toBe(true)
      expect(existsSync(join(work, 'junk-moved')), 'the call the guard lets through did not run').toBe(true)
      expect(whatTheModelWasTold(api.bodies)).toContain(STOPPED)
    } finally {
      api.server.close()
    }
  }, 90_000)

  it.skipIf(whereItIs('opencode', process.env['PATH']) === null)('OpenCode does not run the call the guard plugin stops', async () => {
    const { root, work } = world('opencode')
    const api = await standIn(anthropic([
      { name: 'bash', input: { command: EMPTY_DELETE } },
      { name: 'write', input: { filePath: join(work, 'data', 'keys.json'), content: '{}' } },
      { name: 'bash', input: { command: 'mv junk junk-moved' } },
    ]))
    try {
      const configFile = join(root, 'provider.json')
      writeFileSync(configFile, JSON.stringify({ provider: { anthropic: { options: { baseURL: `${api.url}/v1`, apiKey: 'sk-a-stand-in-not-a-key' } } } }))
      const command = new OpenCodeAdapter({ MOLE_OFFICE_CHORE_MODEL: 'anthropic/claude-haiku-4-5' }).commandFor(request({ cwd: work }))
      const xdg = (name: string) => join(root, 'xdg', name)
      const ran = await runToTheEnd(command.command, command.args, work, cleanEnv({
        ...command.env,
        HOME: join(root, 'home'),
        XDG_CONFIG_HOME: xdg('config'),
        XDG_DATA_HOME: xdg('data'),
        XDG_CACHE_HOME: xdg('cache'),
        XDG_STATE_HOME: xdg('state'),
        OPENCODE_CONFIG: configFile,
        OPENCODE_DISABLE_AUTOUPDATE: '1',
        OPENCODE_DISABLE_MODELS_FETCH: '1',
      }))
      expect(ran.code, ran.err.slice(-2000)).toBe(0)
      expect(existsSync(join(work, 'canary')), 'the guard was not honoured: canary/ is gone').toBe(true)
      expect(readFileSync(join(work, 'data', 'keys.json'), 'utf8'), 'the write the guard refused went through').toBe(KEYS)
      expect(existsSync(join(work, 'junk-moved')), 'the call the guard lets through did not run').toBe(true)
      expect(whatTheModelWasTold(api.bodies)).toContain(STOPPED)
    } finally {
      api.server.close()
    }
  }, 90_000)
})
