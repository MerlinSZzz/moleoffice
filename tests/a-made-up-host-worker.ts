// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const fake = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'debug' && args[1] === 'config') {
  fs.writeFileSync(process.env.FIXTURE_DEBUG, 'asked')
  process.stdout.write(process.env.FIXTURE_NO_TOOL ? '{}' : process.env.OPENCODE_CONFIG_CONTENT)
  process.exit(0)
}
const headers = { 'x-mole-office-workspace': process.env.MOLE_OFFICE_WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': process.env.MOLE_OFFICE_AGENT, 'x-mole-office-session': process.env.MOLE_OFFICE_SESSION, 'x-mole-office-key': process.env.MOLE_AGENT_KEY }
fetch(process.env.MOLE_OFFICE_API + '/api/resources?sessionRecordId=' + encodeURIComponent(process.env.MOLE_OFFICE_SESSION), { headers }).then(async (first) => {
  const firstRows = await first.json()
  if (process.env.FIXTURE_TOUCH) fs.writeFileSync(path.join(process.cwd(), 'made-by-program.txt'), 'made up')
  const configArg = args.find((x) => x.startsWith('--mcp-config='))
  const configPath = configArg ? configArg.slice('--mcp-config='.length) : null
  const config = configPath ? fs.readFileSync(configPath, 'utf8') : ''
  const env = { ...process.env }
  const answer = await fetch(process.env.MOLE_OFFICE_API + '/api/records/' + process.env.MOLE_OFFICE_SESSION, { headers })
  const body = await answer.json()
  const result = { args, env, pid: process.pid, cwd: process.cwd(), status: answer.status, id: body.record?.id, config, configPath,
    firstStatus: first.status, firstRows: firstRows.resources,
    configMode: configPath ? fs.statSync(configPath).mode & 0o777 : null,
    folderMode: configPath ? fs.statSync(path.dirname(configPath)).mode & 0o777 : null }
  process.stdout.write(JSON.stringify({ ordinary: process.env.FIXTURE_ORDINARY, number: 1, token: process.env.FIXTURE_PRIVATE_TOKEN, key: process.env.MOLE_AGENT_KEY }) + '\\n')
  fs.writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify(result), { mode: 0o600 })
  const timer = setInterval(() => { if (fs.existsSync(process.env.FIXTURE_RELEASE)) { clearInterval(timer); process.exit(7) } }, 25)
}).catch(() => process.exit(8))
`

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture' } })
  if (r.status !== 0) throw new Error(`fixture git failed: ${r.stderr}`)
  return r.stdout.trim()
}

async function until(what: string, predicate: () => boolean): Promise<void> {
  const end = Date.now() + 30_000
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((done) => setTimeout(done, 50))
  }
}

function tree(folder: string): { path: string; size: number; mtime: number }[] {
  const visit = (path: string): { path: string; size: number; mtime: number }[] => {
    const info = statSync(path)
    return [{ path: path.slice(folder.length), size: info.size, mtime: info.mtimeMs },
      ...(info.isDirectory() ? readdirSync(path).flatMap((entry) => visit(join(path, entry))) : [])]
  }
  return visit(folder).sort((a, b) => a.path.localeCompare(b.path))
}

export async function aMadeUpHostWorker(runtime: 'codex' | 'claude-code' | 'opencode', options: { folder?: boolean; noTool?: boolean; refuseProcess?: boolean; missingProgram?: boolean } = {}) {
  const oldMode = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  const db = await freshDb()
  const root = dirname(db.file), repo = join(root, 'repo'), home = join(root, 'home'), bin = join(root, 'bin'), temp = join(root, 'temp')
  for (const path of [repo, home, bin, temp]) mkdirSync(path)
  const personKey = randomBytes(32).toString('hex'), officeKey = randomBytes(32).toString('hex')
  writeFileSync(join(root, 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  git(repo, 'init')
  writeFileSync(join(repo, 'tracked.txt'), 'made up\n')
  git(repo, 'add', 'tracked.txt')
  git(repo, 'commit', '-m', 'Fixture')
  const head = git(repo, 'rev-parse', 'HEAD')
  const program = runtime === 'claude-code' ? 'claude' : runtime
  writeFileSync(join(bin, program), options.missingProgram ? '#!/a-made-up-interpreter-that-is-not-there\n' : fake, { mode: 0o755 })
  const app = (await apiApp()).app
  let refusedGroup: number | null = null
  app.addHook('preHandler', async (req, reply) => {
    const body = req.body as { type?: string; key?: string; sessionRecordId?: string } | undefined
    // The runtime belongs to the filed worker run; the message worker's launcher belongs to its wrapper.
    if (req.method === 'POST' && req.url === '/api/resources' && body?.type === 'process' && body.sessionRecordId === entry()?.started?.run && body.sessionRecordId !== undefined) {
      if (options.refuseProcess) {
        refusedGroup = Number(body.key)
        return reply.code(403).send({ error: 'The made-up process registration was refused.' })
      }
      await new Promise((done) => setTimeout(done, 1_500))
    }
  })
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey }
  const agent = (who: string, key: string, session?: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': who, 'x-mole-office-key': key, ...(session ? { 'x-mole-office-session': session } : {}) })
  const post = async (url: string, headers: Record<string, string>, payload: object) => {
    const r = await app.inject({ method: 'POST', url, headers, payload })
    return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
  }
  const secretary = await post('/api/agents/started', person, { handle: 'fixture-starter', name: 'Fixture starter', runtime: 'claude-code', role: 'secretary' })
  expect(secretary.status).toBe(201)
  const starter = agent('fixture-starter', String(secretary.body['whatToGiveIt'].key))
  const terminal = await post('/api/records', starter, { kind: 'session', title: 'Fixture terminal', data: { state: 'running', runtime: 'claude-code', workingDirectory: root } })
  expect(terminal.status).toBe(201)
  const supervisor = await post('/api/agents/started', starter, { handle: 'fixture-supervisor', name: 'Fixture supervisor', runtime: 'claude-code', role: 'supervisor' })
  expect(supervisor.status).toBe(201)
  const supervisorAgentKey = String(supervisor.body['whatToGiveIt'].key)
  const worker = await post('/api/agents/started', agent('fixture-supervisor', supervisorAgentKey), { handle: 'fixture-worker', name: 'Fixture worker', runtime, noKey: true })
  expect(worker.status).toBe(201)
  const supervisorRun = await post('/api/records', agent('fixture-starter', String(secretary.body['whatToGiveIt'].key), String(terminal.body['record'].id)), { kind: 'session', title: 'Fixture supervisor run', data: { state: 'running', runtime: 'claude-code', servingAgent: 'fixture-supervisor', servingAgentId: supervisor.body['agent'].id, workingDirectory: repo } })
  expect(supervisorRun.status).toBe(201)
  const supervisorId = String(supervisorRun.body['record'].id), supervisorKey = String(supervisorRun.body['runKey'].key), workerId = String(worker.body['agent'].id)
  const model = runtime === 'opencode' ? 'opencode-go/deepseek-v4.1-flash' : Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])}/${name}`))
  expect(model).toBeDefined()
  const module = await post('/api/records', person, { kind: 'module', title: 'A made-up module for the casting decision', data: { context: 'made up' } })
  expect(module.status).toBe(201)
  const decision = await post('/api/records', person, { kind: 'decision', title: 'Fixture casting', data: { replaces: [], governs: [{ record: module.body['record'].id }] } })
  expect(decision.status).toBe(201)
  const cast = await post('/api/casting/worker', person, { program: { value: runtime, decision: decision.body['record'].id }, model: { value: model, decision: decision.body['record'].id }, effort: { value: 'high', decision: decision.body['record'].id } })
  expect(cast.status).toBe(201)
  db.client.sqlite.prepare("INSERT INTO repositories (id, workspace_id, name, root, created_at, updated_at, created_by) VALUES ('fixture-repository', 'default', 'fixture-repository', ?, '2026-01-01', '2026-01-01', 'fixture')").run(repo)
  const brief = join(repo, 'brief.md')
  writeFileSync(brief, '# A made-up brief\n')
  const place = options.folder ? { kind: 'folder', folder: repo } : { kind: 'worktree', repository: 'fixture-repository', folder: join(root, 'worktree') }
  const asked = await post('/api/agents/fixture-worker/worker-run', agent('fixture-supervisor', supervisorKey, supervisorId), { brief, place, ...(options.folder ? {} : { cutFrom: head }) })
  expect(asked.status, JSON.stringify(asked.body)).toBe(202)
  const capture = join(root, 'capture.json'), release = join(root, 'release'), debug = join(root, 'debug')
  const noAgent = join(root, 'no-agent.mjs')
  writeFileSync(noAgent, 'process.exit(9)\n')
  const settings: WorkerSettings = { api, workspace: 'default', session: null, stopWithPid: null, checkout: CHECKOUT, runs: 2, hops: 3, outputRoot: join(root, 'runs'), env: { HOME: home, XDG_CONFIG_HOME: join(root, 'xdg-config'), XDG_DATA_HOME: join(root, 'xdg-data'), XDG_CACHE_HOME: join(root, 'xdg-cache'), XDG_STATE_HOME: join(root, 'xdg-state'), CODEX_HOME: join(root, 'codex-home'), CLAUDE_CONFIG_DIR: join(root, 'claude-home'), TMPDIR: temp, PATH: `${bin}:${process.env.PATH ?? ''}`, MOLE_OFFICE_DB: db.file, MOLE_OFFICE_FAKE_RUNTIME: noAgent, MOLE_SUPERVISOR_KEY: supervisorKey, FIXTURE_CAPTURE: capture, FIXTURE_RELEASE: release, FIXTURE_DEBUG: debug, FIXTURE_PRIVATE_TOKEN: 'fixture-environment-value-not-for-logs', FIXTURE_ORDINARY: '1', ...(options.noTool ? { FIXTURE_NO_TOOL: '1' } : {}), ...(options.folder ? { FIXTURE_TOUCH: '1' } : {}) } }
  delete settings.env['MOLE_OFFICE_FAKE_ROUND_LAUNCHER']
  const rounds: WatchingARound[] = []
  const homeBefore = tree(home)
  const runData = () => JSON.parse((db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(supervisorId) as { data: string }).data) as Record<string, any>
  const entry = () => runData()['workerRuns'][workerId] as Record<string, any>
  const runRecord = () => JSON.parse((db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(entry().started.run) as { data: string }).data) as Record<string, any>
  async function start() { await onePass(settings, [], [], rounds) }
  async function waitForProgram() { await until('the made-up program', () => existsSync(capture)); return JSON.parse(readFileSync(capture, 'utf8')) as Record<string, any> }
  async function waitForExit() { await until('the launcher to end', () => rounds.length > 0 && !rounds[0]!.adapter.alive(rounds[0]!.handle)); await onePass(settings, [], [], rounds) }
  async function end() { writeFileSync(release, 'go'); await waitForExit() }
  async function close() {
    if (rounds.some((round) => round.adapter.alive(round.handle))) writeFileSync(release, 'go')
    await until('fixture launchers to exit', () => rounds.every((round) => !round.adapter.alive(round.handle)))
    await app.close()
    db.close()
    if (oldMode === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
    else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = oldMode
  }
  return { db, root, repo, home, homeBefore, tree, head, place, api, settings, rounds, workerId, supervisorId, supervisorKey, supervisorAgentKey, officeKey, capture, release, debug, temp, post, agent, entry, runRecord, start, waitForProgram, waitForExit, end, close, refusedGroup: () => refusedGroup }
}

export function gitInFixture(folder: string, ...args: string[]): string { return git(folder, ...args) }

/** The same checks are applied to each runtime, against its own office and temporary repository. */
export async function aHostStartGivesOnlyItsOwnKey(runtime: 'codex' | 'claude-code' | 'opencode'): Promise<void> {
  const f = await aMadeUpHostWorker(runtime)
  try {
    await f.start()
    const capture = await f.waitForProgram()
    expect(capture.cwd).toBe(f.place.folder)
    expect(git(f.place.folder, 'rev-parse', 'HEAD')).toBe(f.head)
    expect(git(f.place.folder, 'branch', '--show-current')).toBe('fixture-worker')
    const run = f.entry().started.run as string
    const stored = f.runRecord()
    expect(stored.parentAttachment).toBe(f.supervisorId)
    expect(stored.workerPlace).toEqual({ kind: 'worktree', folder: f.place.folder, repository: { name: 'fixture-repository', root: f.repo } })
    expect(stored.sandbox).toBeUndefined()
    expect(capture.status).toBe(200)
    expect(capture.id).toBe(run)
    const key = capture.env.MOLE_AGENT_KEY as string
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    const contents = JSON.stringify(capture)
    expect(contents).not.toContain(f.officeKey)
    expect(contents).not.toContain(f.supervisorKey)
    expect(contents).not.toContain(f.supervisorAgentKey)
    expect(JSON.stringify(capture.args)).not.toContain(key)
    expect(capture.env.SANDBOX_DIR).toBeUndefined()
    expect(capture.env.MOLE_AGENT_KEY_FILE).toBeUndefined()
    expect(capture.env.MOLE_OFFICE_TOOL_CONFIGURATION).toBeUndefined()
    expect(capture.env.MOLE_SUPERVISOR_KEY).toBeUndefined()
    for (const name of ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR']) expect(capture.env[name]).toBe(f.settings.env[name])
    expect(capture.firstStatus).toBe(200)
    expect((capture.firstRows as { type: string; key: string; pgid: number | null }[]).filter((row) => row.type === 'process').map(({ key, pgid }) => ({ key, pgid }))).toEqual([{ key: String(capture.pid), pgid: capture.pid }])
    const processRow = f.db.client.sqlite.prepare("SELECT key, pgid FROM session_resources WHERE session_record_id = ? AND type = 'process'").get(run) as { key: string; pgid: number } | undefined
    expect(processRow).toEqual({ key: String(capture.pid), pgid: capture.pid })
    if (runtime === 'codex') {
      expect(capture.args.join(' ')).toContain('mcp_servers.mole_office.env_vars=')
      expect(capture.args.join(' ')).toContain('features.shell_snapshot=false')
    } else if (runtime === 'claude-code') {
      expect(capture.config).toContain('mole_office')
      expect(capture.configMode).toBe(0o600)
      expect(capture.folderMode).toBe(0o700)
    } else {
      expect(existsSync(f.debug)).toBe(true)
      expect(capture.env.OPENCODE_CONFIG_CONTENT).toContain('mole_office')
      expect(capture.args).toContain('run')
      expect(capture.args).toContain('# A made-up brief\n')
    }
    const runtimeOutput = join(dirname(f.rounds[0]!.handle.outputPath), 'runtime.txt')
    await f.end()
    if (runtime === 'claude-code') expect(existsSync(dirname(capture.configPath as string))).toBe(false)
    expect(f.tree(f.home)).toEqual(f.homeBefore)
    const files = (folder: string): string[] => !existsSync(folder) ? [] : readdirSync(folder, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(folder, e.name)) : [readFileSync(join(folder, e.name), 'utf8')])
    const logs = files(join(f.root, 'runs')).join('\n')
    for (const secret of [key, f.officeKey, f.supervisorKey, f.supervisorAgentKey]) expect(logs).not.toContain(secret)
    expect(logs).not.toContain('fixture-environment-value-not-for-logs')
    const output = readFileSync(runtimeOutput, 'utf8')
    expect(output).toBe('{"ordinary":"1","number":1,"token":"[redacted]","key":"[redacted]"}\n')
    expect(JSON.parse(output)).toEqual({ ordinary: '1', number: 1, token: '[redacted]', key: '[redacted]' })
    expect(output).not.toContain('fixture-environment-value-not-for-logs')
    expect(output).not.toContain(key)
    if (runtime === 'claude-code') expect(logs).not.toContain(capture.config)
    if (runtime === 'opencode') expect(logs).not.toContain(capture.env.OPENCODE_CONFIG_CONTENT)
    expect(f.runRecord().state).toBe('crashed')
  } finally { await f.close() }
}
