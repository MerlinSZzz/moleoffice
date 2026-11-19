// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REAL OPENCODE AGAINST A STAND-IN MODEL, shared by the tests that read what OpenCode actually sends: a check's
 * (tests/a-checks-opencode-sends-the-raised-output-cap.test.ts) and a worker's
 * (tests/a-workers-opencode-sends-the-raised-output-cap.test.ts). Moved here unchanged from the first of them, so the two
 * read OpenCode the same way. tests/an-opencode-agents-shell-does-not-see-its-key.test.ts has the stand-in call OpenCode's
 * bash tool once, and runs OpenCode without --pure, as a worker's command runs it.
 *
 * NO REAL MODEL AND NO REAL KEY. The stand-in listens on 127.0.0.1 and records each request; the caller gives OpenCode
 * only the stand-in's address, a made-up key and an environment built from nothing, and names a closed port as
 * HTTPS_PROXY, since OpenCode 1.18.31 sends its https requests through it and asks registry.npmjs.org when it starts.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

/**
 * THE REAL OPENCODE, from npm's global folder, where the template's npm install -g puts it. Not from PATH: a test run
 * puts stand-ins first there, an opencode among them.
 */
export function theRealOpenCode(): { bin: string; version: string } {
  const root = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' })
  const at = join(root.stdout.trim(), 'opencode-ai')
  if (root.status !== 0 || !existsSync(join(at, 'package.json'))) {
    throw new Error(`This test needs the real OpenCode, installed with npm install -g opencode-ai as sandboxes/mole-office-dev/Dockerfile installs it. npm's global folder has none (${at}).`)
  }
  const installed = JSON.parse(readFileSync(join(at, 'package.json'), 'utf8')) as { version: string; bin: { opencode: string } }
  return { bin: join(at, installed.bin.opencode), version: installed.version }
}

/** What the stand-in recorded of one request: the model, the effort, the cap on output tokens, and how many tools. */
export type Asked = { model: unknown; effort: unknown; maxTokens: unknown; tools: number }

/**
 * A stand-in model endpoint that records each request and answers "ok" as one streamed step. The caller closes it.
 * With runsOneCommand, the first request that offers tools is answered instead with one call of OpenCode's bash tool on
 * that command. keys holds the sha256 of the key each request carried in its Authorization header, or null for none, so a
 * test can tell which key OpenCode sent without keeping the key.
 */
export async function aStandInModel({ runsOneCommand }: { runsOneCommand?: string } = {}): Promise<{ base: string; asked: Asked[]; keys: (string | null)[]; server: Server }> {
  const asked: Asked[] = []
  const keys: (string | null)[] = []
  let commandSent = runsOneCommand === undefined
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const request = JSON.parse(body) as { model?: unknown; reasoning_effort?: unknown; max_tokens?: unknown; tools?: unknown[] }
      asked.push({ model: request.model, effort: request.reasoning_effort, maxTokens: request.max_tokens, tools: request.tools?.length ?? 0 })
      const bearer = /^Bearer (.+)$/u.exec(req.headers.authorization ?? '')
      keys.push(bearer === null ? null : createHash('sha256').update(bearer[1]!).digest('hex'))
      const chunk = (delta: object, finish: string | null, usage?: object) => `data: ${JSON.stringify({ id: 'stand-in',
        object: 'chat.completion.chunk', created: 0, model: request.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      if (!commandSent && (request.tools?.length ?? 0) > 0) {
        commandSent = true
        const call = { index: 0, id: 'call_1', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: runsOneCommand, description: 'Runs the command the test gave' }) } }
        res.end(chunk({ role: 'assistant', tool_calls: [call] }, null) + chunk({}, 'tool_calls', usage) + 'data: [DONE]\n\n')
        return
      }
      res.end(chunk({ role: 'assistant', content: 'ok' }, null) + chunk({}, 'stop', usage) + 'data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, asked, keys, server }
}

/** A port on 127.0.0.1 that nothing listens on: bound, read and closed again. */
export async function aClosedPort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

/**
 * Run OpenCode as a check runs it, with --pure; a worker's command has no --pure, and `pure: false` runs it so. The prompt
 * goes on its standard input, and its group is stopped after limitMs. Without --pure, give OpenCode a config folder made
 * by aReadyConfigFolder.
 */
export async function runOpenCode(bin: string, env: Record<string, string>, work: string, model: string, effort: string, limitMs: number, { pure = true, prompt = 'Answer with the word ok.' }: { pure?: boolean; prompt?: string } = {}): Promise<{ code: number | string; err: string }> {
  const child = spawn(bin, ['run', '--format', 'json', '--dir', work, '-m', model, ...(pure ? ['--pure'] : []), '--variant', effort, '--'],
    { env, cwd: work, detached: true, stdio: ['pipe', 'ignore', 'pipe'] })
  let err = ''
  child.stderr.on('data', (chunk) => { err += chunk })
  child.stdin.end(prompt)
  const timer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ } }, limitMs)
  const code = await new Promise<number | string>((resolve) => child.on('close', (exit, signal) => resolve(exit ?? signal ?? 'unknown')))
  clearTimeout(timer)
  return { code, err }
}

/**
 * OPENCODE'S CONFIG FOLDER, READY FOR A RUN WITHOUT --pure. Without --pure, OpenCode 1.18.31 first installs its plugin
 * package into the folder, from the network. It skips that when the folder has node_modules and its package-lock.json lists
 * every dependency of its package.json, as a worker's home already does. With no network it waits instead (measured on 7
 * November 2026: about 70 seconds). The folder is `<XDG_CONFIG_HOME>/opencode`.
 */
export function aReadyConfigFolder(folder: string, version: string): void {
  mkdirSync(join(folder, 'node_modules'), { recursive: true })
  const dependencies = { '@opencode-ai/plugin': version }
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ dependencies }))
  writeFileSync(join(folder, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies } } }))
}
