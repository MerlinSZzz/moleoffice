// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * rgAmP45EklqO: the real sandbox launcher gives a stand-in Claude Code office_request.
 * Every office, login and key here is synthetic; only loopback and temporary folders are used.
 * Case names name individual mutations, tried separately after a green control.
 */
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aClaudeCommandsOfficeTool, aCommandsOfficeTool, aCommandsPermissions, OFFICE_MCP_ENV_VARS, OFFICE_MCP_SERVER, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { officeMcpTool } from '../tools/office-mcp.mjs'
import { pictureJudgementTools } from '../tools/picture-judgements/index.mjs'
import { expectRoundRulesSaved, LEGACY_ROUND_CHAPTERS, writeRoundStartRules } from './round-chapters-fixture.ts'
import { deliveredRoundBrief, savedRoundChapters } from '../src/shared/round-chapters/manifest.ts'
import { THE_MODELS_START_VALUES, THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { FAKE_DOCKER, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { officeHeaders, THE_FACTS_VARIABLE, theFactsAStartIsGiven, writeInstance } from '../tools/sandbox-common.mjs'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF, THE_STARTING_WORDS } from '../tools/harness-features-off.mjs'

const key = 'e7'.repeat(32)
const starterKey = 'a8'.repeat(32)
const agent = 'synthetic-claude-worker'
const full = ['--permission-mode', 'bypassPermissions']
let root = ''
let dir = ''
let worktree = ''
let api = ''
let office: Server
let sequence = 0
const runs = new Map<string, { runtime: string; reads: number; title?: string; data?: Record<string, unknown> }>()
const legacyModel = Object.keys(THE_MODELS_START_VALUES)[0]!
const codexIsFast = THE_RUNTIMES_FAST_MODE.codex
const theFastFlag = codexIsFast ? ['-c', 'service_tier=fast'] : []
const heard: { url: string; headers: Record<string, unknown> }[] = []
const identity = () => ({
  MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: 'synthetic-session',
  MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: api, MOLE_AGENT_KEY: key,
})
/** The stand-in sandbox's facts, as up writes them and as the launcher gives them to the helper. */
const facts = () => ({
  instance: 'synthetic', template: 'synthetic', templateDir: join(root, 'template'),
  containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
  ref: 'main', from: worktree, workspace: 'default',
})
/** The facts as a start by hand is given them, which is how the launcher gives them to the helper. */
const theFactsGiven = () => ({ [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()) })
interface Configuration {
  mcpServers: { mole_office: { type: string; command: string; args: string[]; env: Record<string, string> } }
}
interface Capture {
  argv: string[]
  stdin: string
  allEnv: Record<string, string>
  cwd: string
  env: Record<string, string>
  path: string | null
  configuration: Configuration | null
  mode: number | null
  files: string[]
  folderMode: number | null
  mcpFiles: string[]
  mcpFolders: string[]
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-claude-office-'))
  dir = join(root, 'synthetic')
  worktree = join(dir, 'worktrees', agent)
  mkdirSync(worktree, { recursive: true })
  writeRoundStartRules(dir, worktree)
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'home'))
  // THE HELPER'S TEMPORARY DIRECTORY, this test's own, where the configuration's folder is made and must be gone again.
  mkdirSync(join(dir, 'tmp'))
  mkdirSync(join(dir, 'repo'))
  for (const name of ['tools', 'src']) symlinkSync(join(process.cwd(), name), join(dir, 'repo', name))
  execFileSync('git', ['init', '-q', '-b', 'main', worktree])
  execFileSync('git', ['-C', worktree, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'synthetic'])
  mkdirSync(join(root, 'template'))
  writeFileSync(join(root, 'template', 'devcontainer.json'), '{}')
  writeFileSync(join(root, 'template', 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
  mkdirSync(join(dir, 'briefs'), { recursive: true })
  // Both copies of the facts, as up writes them. The launcher reads the host's, and gives the helper the facts it
  // starts with from that copy; a start by hand here is given the same facts (the environment below).
  writeInstance(dir, facts())
  writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  // A stand-in records the configuration while it is alive, before the launcher removes it.
  // No real Claude Code or authentication is involved.
  const fake = `#!${process.execPath}
const fs = require('fs')
const path = require('path')
const argv = process.argv.slice(2)
const flag = argv.find(word => word.startsWith('--mcp-config='))
const configPath = flag ? flag.slice('--mcp-config='.length) : null
fs.writeFileSync(process.env.CLAUDE_CAPTURE, JSON.stringify({
  argv, cwd: process.cwd(), stdin: fs.readFileSync(0, 'utf8'), allEnv: process.env,
  env: Object.fromEntries(${JSON.stringify(OFFICE_MCP_ENV_VARS)}.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]])),
  path: configPath,
  configuration: configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null,
  mode: configPath ? fs.statSync(configPath).mode & 0o777 : null,
  files: configPath ? fs.readdirSync(path.dirname(configPath)).filter(name => name.endsWith('.json')) : [],
  folderMode: configPath ? fs.statSync(path.dirname(configPath)).mode & 0o777 : null,
  mcpFiles: fs.readdirSync(process.env.CLAUDE_LOGS, { recursive: true }).filter(name => name.endsWith('office-mcp.json')),
  mcpFolders: fs.readdirSync(process.env.CLAUDE_TMP).filter(name => name.startsWith('office-mcp-')),
}))
process.stdout.write(JSON.stringify(argv))
if (process.env.CLAUDE_END === 'signal') process.kill(process.pid, 'SIGTERM')
else process.exit(Number(process.env.CLAUDE_END || 0))
`
  for (const program of ['claude', 'codex']) {
    writeFileSync(join(dir, 'bin', program), fake)
    chmodSync(join(dir, 'bin', program), 0o755)
  }
  office = createServer(async (req, res) => {
    heard.push({ url: req.url ?? '', headers: req.headers })
    res.setHeader('content-type', 'application/json')
    const run = runs.get(req.url?.split('/').pop() ?? '')
    const asked = new URL(req.url ?? '/', 'http://synthetic.invalid')
    if (req.method === 'GET' && asked.pathname === '/api/messages' && asked.searchParams.get('checkpoint') === '1') {
      // THE BOUND CHECKPOINT the office tool reads before every answer. This office holds no mail for the run, so
      // the page is empty; it names the run and agent it is bound to, as the real office's checkpoint reply does.
      res.end(JSON.stringify({ messages: [], left: 0, checkpoint: {
        run: String(req.headers['x-mole-office-session'] ?? ''),
        agent: String(req.headers['x-mole-office-actor-id'] ?? ''),
        oversize: [],
      } }))
    } else if (req.url === '/api/participants') {
      res.end(JSON.stringify({ agents: [{ id: agent, handle: agent, name: agent, record: 'synthetic-agent-record' }] }))
    } else if (req.method === 'GET' && req.url?.startsWith('/api/office/run-models/for/')) {
      const query = new URL(req.url,'http://synthetic.invalid').searchParams
      const model = query.get('model') ?? 'synthetic-model', runtime = query.get('runtime') ?? 'claude-code'
      res.end(JSON.stringify({ model, effort: null, effortFrom: 'none', ...(!query.has('model') || model === legacyModel ? {} : {
        selection:{runtime,model,native:{model,provider:null,variant:null,effort:null},casting:null},
      }) }))
    } else if (req.url === `/api/participants/agent/${agent}`) {
      res.end(JSON.stringify({ participant: { id: agent, handle: agent } }))
    } else if (req.url === '/api/kinds/session') {
      res.end(JSON.stringify({ kind: { fields: [{ key: 'adaptedTool' }] } }))
    } else if (req.method === 'POST' && req.url === '/api/records') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { title, data } = JSON.parse(body)
      const id = `verb-${++sequence}`
      runs.set(id, { runtime: 'claude-code', reads: 0, title, data })
      res.statusCode = 201
      res.end(JSON.stringify({ record: { id }, runKey: { key } }))
    } else if (req.method === 'POST' && req.url === `/api/agents/${agent}/hand-run`) {
      res.end('{"cut":null}')
    } else if (req.method === 'GET' && req.url === '/api/resources') {
      res.end('{"resources":[]}')
    } else if (req.url === '/api/toolset/uses') {
      res.statusCode = 201
      res.end('{}')
    } else if (req.method === 'GET' && req.url?.startsWith('/api/checks/')) {
      res.end(JSON.stringify(LEGACY_ROUND_CHAPTERS))
    } else if (req.method === 'PATCH' && run) {
      let body = ''
      for await (const chunk of req) body += chunk
      run.data = { ...(run.data ?? {}), ...JSON.parse(body).dataPatch }
      res.end(JSON.stringify({ record: { kind: 'session', data: run.data } }))
    } else if (req.method === 'GET' && run) {
      const priorReads = run.reads
      // Reading the chapter snapshot as the starter does not advance the simulated native run.
      if (req.headers['x-mole-office-session'] === req.url?.split('/').pop()) run.reads++
      // THE TITLE IT WAS FILED WITH, which a round given no --title takes (problem EOixDf4A9Dia).
      res.end(JSON.stringify({ record: { kind: 'session', title: run.title, data: {
        ...run.data, state: run.data?.state ?? (priorReads < (run.data ? 2 : 1) ? 'running' : 'finished'), servingAgent: agent, runtime: run.runtime,
        workingDirectory: worktree, cutFrom: 'main', model: run.data?.model ?? 'opus', served: { model: 'synthetic' },
        sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
      } } }))
    } else if (req.method === 'POST' && req.url === '/api/resources') {
      let body = ''
      for await (const chunk of req) body += chunk
      const pgid = JSON.parse(body).pidInContainer as number
      res.statusCode = 201
      res.end(JSON.stringify({ resource: { id: 'synthetic-process', key: String(pgid), pgid } }))
    } else if (req.url === '/api/health') res.end('{"synthetic":true}')
    else {
      res.statusCode = 404
      res.end('{"error":"No synthetic route"}')
    }
  })
  await new Promise<void>(resolve => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>(resolve => office.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

async function launched(command: string[], options: { flags?: string[]; own?: boolean; runtime?: string; end?: string; existing?: boolean; waits?: boolean } = {}) {
  const label = `synthetic-${++sequence}`
  const capturePath = join(dir, `${label}.json`)
  const before = existsSync(join(dir, 'logs')) ? readdirSync(join(dir, 'logs')) : []
  let flags: string[]
  if (options.own) {
    const handshake = join(dir, `${label}-handshake`)
    mkdirSync(handshake)
    writeFileSync(join(handshake, 'row.json'), '{"id":"synthetic-process"}')
    flags = ['--handshake', handshake, ...(options.waits === false ? [] : ['--wait', '--timeout', '5'])]
  } else {
    // A declared run model must match the command's model. Empty commands still receive this fixture's model.
    const modelAt = command.indexOf('--model')
    const model = modelAt >= 0 ? command[modelAt + 1]! : ['sh','bash'].includes(basename(command[0] ?? '')) ? legacyModel : options.existing ? 'opus' : 'synthetic-model'
    runs.set(label, { runtime: options.runtime ?? 'claude-code', reads: 0, data:{model} })
    flags = options.existing ? ['--run', label] : [
      '--agent', agent, '--runtime', options.runtime ?? 'claude-code', '--model', model,
      '--worktree', worktree, '--cut-from', 'main', '--filed', label,
    ]
  }
  const child = spawn(process.execPath, [
    'tools/sandbox-start.mjs', '--in-background', '--instance', dir, '--cwd', worktree,
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-session', '--workspace', 'default', '--api', api,
    ...flags, ...(options.flags ?? []), '--', ...command,
  ], { env: withAPrivateTmpToSweep({
    ...withoutInheritedEffort(), ...identity(), ...theFactsGiven(), MOLE_AGENT_KEY: starterKey,
    SANDBOX_RUN_KEY: options.own || options.existing ? undefined : key,
    HOME: join(dir, 'home'), CLAUDE_CONFIG_DIR: join(dir, 'home'),
    CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-login-for-the-stand-in-only',
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid',
    PATH: join(dir, 'bin') + ':' + process.env['PATH'],
    CLAUDE_CAPTURE: capturePath, CLAUDE_LOGS: join(dir, 'logs'), CLAUDE_END: options.end ?? '0',
    TMPDIR: join(dir, 'tmp'), CLAUDE_TMP: join(dir, 'tmp'),
  }, join(dir, 'a-private-tmp')) })
  let out = ''
  let err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  expect(code, err).toBe(0)
  expect(out + err).not.toContain(key)
  expect(out + err).not.toContain(starterKey)
  const folder = readdirSync(join(dir, 'logs')).find(name => !before.includes(name))!
  const record = JSON.parse(readFileSync(join(dir, 'logs', folder, 'start.json'), 'utf8')) as { command: string[]; out: string | null; stdin?: string }
  expect(JSON.stringify(record)).not.toContain(key)
  await expect.poll(() => existsSync(capturePath)).toBe(true)
  const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as Capture
  return { capture, record, err, label, log: existsSync(join(dir, 'logs', folder, 'helper.log')) ? readFileSync(join(dir, 'logs', folder, 'helper.log'), 'utf8') : '' }
}

// Run the host launcher through the shared Docker stand-in and the real sandbox helper.
async function launchedVerb(verb: 'worker' | 'round', brief: string) {
  const capturePath = join(dir, `verb-capture-${++sequence}.json`)
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ containers: {
    'synthetic-container': { Id: 'synthetic-container', State: { Running: true }, Mounts: [], Config: { Env: [
      `HOME=${join(dir, 'home')}`, `CLAUDE_CAPTURE=${capturePath}`, `CLAUDE_LOGS=${join(dir, 'logs')}`,
      `TMPDIR=${join(dir, 'tmp')}`, `CLAUDE_TMP=${join(dir, 'tmp')}`,
      'CLAUDE_CODE_OAUTH_TOKEN=synthetic-login-for-the-stand-in-only',
    ] } },
  }, calls: [], bugs: {} }))
  const child = spawn(process.execPath, ['tools/sandbox.mjs', verb, 'synthetic',
    '--sandboxes', root, '--api', api, '--workspace', 'default',
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-session',
    '--agent', agent, '--brief', brief, ...(verb === 'worker' ? ['--model', 'opus'] : []), '--json',
  ], { env: { ...withoutInheritedEffort(), HOME: join(dir, 'home'), MOLE_AGENT_KEY: starterKey,
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', FAKE_DOCKER_DIR: dir,
    PATH: join(dir, 'bin') + ':' + process.env['PATH'],
  } })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  expect(code, err).toBe(0)
  const record = JSON.parse(out.trim())
  // The helper returns at start; wait for its command and cleanup before another verb or fixture teardown.
  // ITS LAST LINE, NOT ITS FIRST. finish.log's first line comes before the receipt, the starter's message and the
  // orphaned write; a case that counts what the office heard once heard those four from here (check LBdp2oKYuPTB).
  // Every run here ends with no commits and no report, and that line is written after its last request.
  const finished = join(dir, 'logs', record.run, 'finish.log')
  await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report')).toBe(true)
  const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as Capture
  expect(out + err + JSON.stringify(record)).not.toContain(key)
  expect(out + err).not.toContain(starterKey)
  return { record, capture, err }
}

// A real stdio server started from precisely the generated command/args/env, with no inherited PATH or key.
async function throughConfiguration(configuration: Configuration) {
  const server = configuration.mcpServers.mole_office
  const child: ChildProcessWithoutNullStreams = spawn(server.command, server.args, { env: server.env })
  const lines = createInterface({ input: child.stdout })
  let stderr = ''
  let id = 0
  const pending = new Map<number, { resolve: (answer: any) => void; reject: (error: Error) => void }>()
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  lines.on('line', line => {
    const answer = JSON.parse(line)
    pending.get(answer.id)?.resolve(answer)
    pending.delete(answer.id)
  })
  child.on('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error(`MCP exited: ${stderr}`))
  })
  return {
    request(method: string, params?: unknown): Promise<any> {
      return new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject })
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      })
    },
    async close() {
      const closed = new Promise<void>(resolve => child.on('close', () => resolve()))
      child.stdin.end()
      await closed
      lines.close()
      expect(stderr).toBe('')
    },
  }
}

describe('Claude Code gets the sandbox office tool', () => {
  it('worker-shell mutation: wrapping worker in sh loses MCP and the direct command; stdin mutation loses the exact brief', async () => {
    const brief = join(root, "worker brief ' $;.md")
    const text = "# Synthetic worker\n'quotes' $HOME; `echo never`\n\nExact text without a trailing newline"
    writeFileSync(brief, text)
    const { record, capture } = await launchedVerb('worker', brief)
    expect(record.command).toEqual(['claude', `--mcp-config=${capture.path}`, ...CLAUDE_CODE_FEATURES_OFF, ...full, '-p', '--model', 'opus', '--output-format', 'json'])
    expect(capture.argv).toEqual(record.command.slice(1))
    // The brief whole, after the starting words (tests/a-sandbox-run-has-the-harness-subagents-off.test.ts).
    expect(capture.stdin).toBe(`${THE_STARTING_WORDS}\n\n---\n\n${text}`)
    expect(readFileSync(record.stdin, 'utf8')).toBe(capture.stdin)
    expect(capture.env).not.toHaveProperty('MOLE_AGENT_KEY')
    expect(capture.configuration!.mcpServers.mole_office.env.MOLE_AGENT_KEY).toBe(key)
    // RJradfGfKxlq: the command's hooks find the configuration through one variable, the path and never the key.
    expect(capture.allEnv[OFFICE_TOOL_CONFIGURATION]).toBe(capture.path)
    expect(readFileSync(join(dir, 'logs', record.run, 'helper.log'), 'utf8')).toContain(`The command's standard input comes from ${record.stdin}.`)
  })

  it('round-continue mutation: removing --continue loses the direct resumed form; stdin mutation loses the round brief', async () => {
    // Independent of the worker case: a worker of its own first, whose run the round continues. A round continues only
    // a run the launcher filed and started itself, so a start written by hand under logs/ would not do.
    const brief = join(root, 'round brief.md')
    const text = '# Synthetic next round\nCarry on exactly.\n'
    writeFileSync(brief, text)
    await launchedVerb('worker', brief)
    const { record, capture } = await launchedVerb('round', brief)
    expect(record.command).toEqual(['claude', `--mcp-config=${capture.path}`, ...CLAUDE_CODE_FEATURES_OFF, ...full, '-p', '--continue', '--model', 'opus', '--output-format', 'json'])
    expect(capture.argv).toEqual(record.command.slice(1))
    expect(capture.stdin).toBe(readFileSync(record.stdin, 'utf8'))
    expect(capture.stdin).toContain(text)
    // WHAT THE START GIVES NOW, rebuilt from the saved selection on the run: the brief whole, CODE.md at outline, and
    // the other two rule files whole.
    const saved = savedRoundChapters(runs.get(record.run)?.data)
    expect(saved, 'the run holds the round chapters it saved').not.toBeNull()
    expect(capture.stdin).toBe(`${THE_STARTING_WORDS}\n\n---\n\n${deliveredRoundBrief(saved!)}`)
    expectRoundRulesSaved(runs.get(record.run)?.data)
    expect(capture.env).not.toHaveProperty('MOLE_AGENT_KEY')
    expect(capture.configuration!.mcpServers.mole_office.env.MOLE_AGENT_KEY).toBe(key)
  })

  it.each(['relative', 'missing', 'directory', 'unreadable'])('stdin-%s mutation: accepting an invalid input path starts a command instead of refusing', async kind => {
    const file = kind === 'relative' ? 'relative-stdin.md' : kind === 'directory' ? dir : join(dir, `${kind}-stdin.md`)
    if (kind === 'relative') writeFileSync(join(worktree, file), 'Synthetic relative input')
    if (kind === 'unreadable') writeFileSync(file, 'Synthetic unreadable input', { mode: 0o000 })
    const marker = join(dir, `refused-${kind}`)
    const before = existsSync(join(dir, 'logs')) ? readdirSync(join(dir, 'logs')) : []
    const requests = heard.length
    const child = spawn(process.execPath, [join(process.cwd(), 'tools/sandbox-start.mjs'), '--verbose', '--instance', dir, '--stdin', file,
      '--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`,
    ], { cwd: worktree, env: { ...withoutInheritedEffort(), ...identity(), ...theFactsGiven(), HOME: join(dir, 'home') } })
    let out = '', err = ''
    child.stdout.on('data', chunk => { out += String(chunk) })
    child.stderr.on('data', chunk => { err += String(chunk) })
    const code = await new Promise<number | null>(resolve => child.on('close', resolve))
    expect(code).not.toBe(0)
    expect(err).toContain(`--stdin must be an absolute path to a regular file this sandbox can read, and "${file}" is not one. Nothing was started.`)
    expect(out).toBe('')
    expect(existsSync(marker)).toBe(false)
    const added = readdirSync(join(dir, 'logs')).filter(name => !before.includes(name))
    expect(added).toHaveLength(1)
    expect(readdirSync(join(dir, 'logs', added[0]!))).toEqual(['launch.txt'])
    expect(readFileSync(join(dir, 'logs', added[0]!, 'launch.txt'), 'utf8')).toContain('Nothing was started.')
    expect(heard).toHaveLength(requests)
  })

  it.each([false, true])('stdin-wait mutation plain=%s: removing file redirection or its log sentence goes red', async plain => {
    const file = join(dir, 'own stdin.md')
    const text = 'Synthetic own input\n\nwith exact whitespace\t'
    writeFileSync(file, text)
    const { capture, record, log } = await launched(['codex', 'synthetic'], {
      own: true, flags: ['--stdin', file, ...(plain ? ['--plain-env'] : [])],
    })
    expect(capture.stdin).toBe(text)
    expect(record.stdin).toBe(file)
    expect(log).toContain(`The command's standard input comes from ${file}.`)
  })

  it('stdin-environment mutation: exporting the file path leaks a variable into the command', async () => {
    const file = join(dir, 'unexported stdin.md')
    writeFileSync(file, 'Synthetic input')
    const { capture } = await launched(['claude', '-p'], { flags: ['--stdin', file] })
    expect(capture.stdin).toBe('Synthetic input')
    expect(Object.values(capture.allEnv)).not.toContain(file)
  })

  it.each([false, true])('stdin-default mutation plain=%s: leaving extra gate input breaks empty stdin without --stdin', async plain => {
    const { capture, record } = await launched(['codex', 'synthetic'], { own: true, waits: false, flags: plain ? ['--plain-env'] : [] })
    expect(capture.stdin).toBe('')
    expect(record).not.toHaveProperty('stdin')
  })

  it('stdin-existing-run mutation: dropping the existing run input or start.stdin goes red', async () => {
    const file = join(dir, 'existing-run stdin.md')
    writeFileSync(file, 'Synthetic existing run input\n')
    const { capture, record } = await launched(['claude', '-p'], { existing: true, flags: ['--stdin', file] })
    expect(capture.stdin).toBe('Synthetic existing run input\n')
    expect(record.stdin).toBe(file)
  })

  it('content mutation: changing the MCP server type goes red', async () => {
    const { capture, label } = await launched(['claude', '-p', 'synthetic brief'])
    expect(capture.configuration).toEqual({ mcpServers: { mole_office: {
      type: 'stdio', command: process.execPath, args: [OFFICE_MCP_SERVER],
      env: { ...identity(), MOLE_OFFICE_SESSION: label },
    } } })
    expect(isAbsolute(capture.configuration!.mcpServers.mole_office.command)).toBe(true)
    expect(capture.files).toEqual(['office-mcp.json'])
    // THE KEY IS IN NO LOG: the configuration that holds it is never under logs/.
    expect(capture.mcpFiles).toEqual([])
    expect(capture.configuration!.mcpServers.mole_office.env.MOLE_AGENT_KEY).not.toBe(starterKey)
  })

  it('mode mutation: writing the configuration with 644 instead of 600 goes red', async () => {
    expect((await launched(['claude', '-p', 'synthetic brief'])).capture.mode).toBe(0o600)
  })

  it('folder mutation: placing the configuration in cwd or under the launcher logs goes red', async () => {
    // THE KEY IS IN NO LOG AND IN NO WORKTREE (tests/a-sandbox-run-holds-its-own-key.test.ts, case 1): the configuration
    // lies in a folder made for it alone (mode 700) in the helper's temporary directory, here this test's own.
    const { capture } = await launched(['claude', '-p', 'synthetic brief'])
    expect(capture.cwd).toBe(worktree)
    expect(basename(capture.path!)).toBe('office-mcp.json')
    expect(dirname(dirname(capture.path!))).toBe(join(dir, 'tmp'))
    expect(basename(dirname(capture.path!)).startsWith('office-mcp-')).toBe(true)
    expect(capture.folderMode).toBe(0o700)
    expect(capture.mcpFolders).toEqual([basename(dirname(capture.path!))])
    expect(relative(worktree, capture.path!).startsWith('../')).toBe(true)
    expect(relative(join(dir, 'logs'), capture.path!).startsWith('../')).toBe(true)
  })

  it.each([
    ['print', ['claude', '-p', '--model', 'x', 'a prompt']],
    ['model-first', ['claude', '--model', 'x', '-p', 'a prompt']],
    ['prompt', ['claude', 'a prompt']],
    ['absolute', ['/synthetic/bin/claude', '-p', 'a prompt']],
    ['permissions-already-given', ['claude', '--permission-mode', 'bypassPermissions', '-p', 'a prompt']],
  ] as const)('placement mutation %s: splitting the equals flag goes red', async (name, command) => {
    const path = join(dir, 'synthetic-config.json')
    const permitted = aCommandsPermissions(command, { ...identity(), SANDBOX_DIR: dir })
    const answer = aClaudeCommandsOfficeTool(permitted.command, identity(), path)
    const original = [...command].includes('--permission-mode') ? command.slice(1) : [...full, ...command.slice(1)]
    expect(answer.command).toEqual([command[0], `--mcp-config=${path}`, ...original])
    expect(answer.command).not.toContain('--mcp-config')
    if (name !== 'absolute') {
      const { capture, record } = await launched([...command])
      // The launcher passes the run's declared model when the caller has not put it on the command.
      const model = [...command].includes('--model') ? [] : ['--model', 'synthetic-model']
      expect(record.command).toEqual([command[0], `--mcp-config=${capture.path}`, ...CLAUDE_CODE_FEATURES_OFF, ...original, ...model])
      expect(capture.argv).toEqual(record.command.slice(1))
    }
  })

  it('launcher mutation: omitting Claude MCP wiring goes red', async () => {
    const { capture, record, err } = await launched(['claude', '--model', 'x', '-p', 'a prompt'], { flags: ['--verbose'] })
    expect(record.command).toEqual(['claude', `--mcp-config=${capture.path}`, ...CLAUDE_CODE_FEATURES_OFF, ...full, '--model', 'x', '-p', 'a prompt'])
    expect(capture.argv).toEqual(record.command.slice(1))
    expect(err).toContain(`Claude Code gets office_request through ${OFFICE_MCP_SERVER}; its configuration ${capture.path} (mode 600) gives the server ${OFFICE_MCP_ENV_VARS.join(', ')}.`)
    expect(err).toContain("Claude Code's commands get no MOLE_AGENT_KEY; office_request still has it (RATbb8xNemOW).")
    expect(err).toContain(`Its hooks find that configuration through ${OFFICE_TOOL_CONFIGURATION}, the path only, and read the run's key from it (RJradfGfKxlq).`)
  })

  it('worker-key mutation: leaving MOLE_AGENT_KEY in Claude environment goes red', async () => {
    const { capture } = await launched(['claude', '-p', 'a prompt'])
    expect(capture.env).not.toHaveProperty('MOLE_AGENT_KEY')
    expect(capture.configuration!.mcpServers.mole_office.env.MOLE_AGENT_KEY).toBe(key)
  })

  it('starts-runs mutation: ignoring the exception goes red', async () => {
    const { capture, err } = await launched(['claude', '-p', 'a prompt'], { flags: ['--starts-runs', '--verbose'] })
    expect(capture.env.MOLE_AGENT_KEY).toBe(key)
    expect(capture.configuration!.mcpServers.mole_office.env.MOLE_AGENT_KEY).toBe(key)
    expect(err).toContain("--starts-runs: Claude Code's commands keep MOLE_AGENT_KEY, because this run starts runs.")
    expect(err).not.toContain("Claude Code's commands get no MOLE_AGENT_KEY")
    expect(err).not.toContain('--starts-runs changes nothing')
  })

  it('plain-env mutation: removing the plainEnv guard goes red', async () => {
    const command = ['claude', '-p', 'a prompt']
    expect(aClaudeCommandsOfficeTool(command, identity(), 'unused', { plainEnv: true })).toEqual({ command, env: {}, configuration: null, says: [] })
    const { capture, err } = await launched(command, { own: true, flags: ['--plain-env'] })
    // Its switch that turns Claude Code's subagents and workflows off goes in all the same (tools/harness-features-off.mjs).
    expect(capture.argv).toEqual([...CLAUDE_CODE_FEATURES_OFF, ...command.slice(1)])
    expect(capture.path).toBeNull()
    expect(capture.configuration).toBeNull()
    expect(capture.mcpFiles).toEqual([])
    expect(capture.mcpFolders).toEqual([])
    expect(err).not.toContain('Claude Code gets office_request')
  })

  it('identity mutation: accepting any missing or blank office variable goes red', async () => {
    const command = ['claude', '-p', 'a prompt']
    for (const name of OFFICE_MCP_ENV_VARS.slice(0, 4)) {
      for (const value of [undefined, ' ']) {
        const env = { ...identity(), [name]: value }
        const before = { ...env }
        expect(aClaudeCommandsOfficeTool(command, env, 'unused')).toEqual({ command, env: {}, configuration: null, says: [] })
        expect(env).toEqual(before)
      }
    }
    const { capture, err } = await launched(command, { own: true, flags: ['--no-office-variables'] })
    expect(capture.argv).toEqual([...CLAUDE_CODE_FEATURES_OFF, ...full, ...command.slice(1)])
    expect(capture.path).toBeNull()
    expect(capture.configuration).toBeNull()
    expect(capture.mcpFiles).toEqual([])
    expect(capture.mcpFolders).toEqual([])
    expect(err).not.toContain('Claude Code gets office_request')
  })

  it('program mutation: configuring Codex as Claude goes red and Codex keeps its overrides', async () => {
    const command = ['codex', 'exec', 'a prompt']
    expect(aClaudeCommandsOfficeTool(command, identity(), 'unused')).toEqual({ command, env: {}, configuration: null, says: [] })
    const { capture, record, err } = await launched(command, { runtime: 'codex', flags: ['--verbose'] })
    const permitted = aCommandsPermissions(command, { ...identity(), SANDBOX_DIR: dir })
    // This named synthetic Codex model has no effort, and gets fast mode as the data file gives it for the runtime.
    const off = [permitted.command[0]!, ...CODEX_FEATURES_OFF, ...permitted.command.slice(1)]
    expect(record.command).toEqual([...aCommandsOfficeTool(off, identity()).command, '-m', 'synthetic-model', ...theFastFlag])
    expect(capture.path).toBeNull()
    expect(capture.configuration).toBeNull()
    expect(capture.mcpFiles).toEqual([])
    expect(capture.mcpFolders).toEqual([])
    expect(capture.env.MOLE_AGENT_KEY).toBe(key)
    expect(err).toContain('Codex gets office_request')
    expect(err).not.toContain('Claude Code gets office_request')
  })

  it.each([false, true])('shell-sentence mutation existing=%s: hiding the unsupported shell sentence goes red', async existing => {
    // --agent and --run both name Claude Code, even though argv[0] names a shell.
    const command = ['sh', '-c', 'exec claude -p "a prompt"']
    const { capture, record, err } = await launched(command, { existing })
    expect(record.command).toEqual(command)
    expect(capture.argv).toEqual(['-p', 'a prompt'])
    expect(capture.path).toBeNull()
    expect(capture.configuration).toBeNull()
    expect(capture.mcpFiles).toEqual([])
    expect(capture.mcpFolders).toEqual([])
    expect(capture.env.MOLE_OFFICE_AGENT).toBe(agent)
    expect(err).toContain(`This claude-code run starts sh, so the launcher cannot give it office_request without rewriting a shell's words; start the worker with --cwd <worktree> -- claude -p --model <model> "<the brief's text>" instead, since --agent already sets MOLE_OFFICE_AGENT.`)
  })

  it.each(['0', '3', 'signal'])('cleanup mutation end=%s: leaving the configuration after command exit goes red', async end => {
    const { capture } = await launched(['claude', '-p', 'a prompt'], { end })
    expect(capture.configuration).not.toBeNull()
    expect(existsSync(capture.path!)).toBe(false)
    expect(existsSync(dirname(capture.path!)), 'the folder made for the configuration is left').toBe(false)
  })

  it('server mutation: tools/list omitting office_request goes red', async () => {
    const { capture, label } = await launched(['claude', '-p', 'a prompt'])
    const mcp = await throughConfiguration(capture.configuration!)
    try {
      expect((await mcp.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'synthetic', version: '1' } })).result.capabilities).toEqual({ tools: {} })
      expect((await mcp.request('tools/list')).result.tools).toEqual([officeMcpTool, ...pictureJudgementTools])
      heard.length = 0
      const reply = await mcp.request('tools/call', { name: 'office_request', arguments: { method: 'GET', path: '/api/health' } })
      expect(reply.result.isError).toBe(false)
      expect(reply.result.content[0]).toEqual({ type: 'text', text: '200\n{"synthetic":true}' })
      expect(heard.filter((one) => one.url === '/api/health')).toHaveLength(1)
      const mailbox = heard.filter((one) => one.url !== '/api/health')
      expect(mailbox).toHaveLength(1)
      expect(new URL(mailbox[0]!.url, api).searchParams.get('checkpoint')).toBe('1')
      for (const one of heard) expect(one.headers).toMatchObject(officeHeaders({ agent, session: label, workspace: 'default', key }))
    } finally {
      await mcp.close()
    }
  })
})
