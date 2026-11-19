// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic launcher starts prove that both checks read the same list, including a newly added source. */
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { CONTAINER_TMP_LOADER } from './sandbox-stand-ins.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { writeInstance } from '../tools/sandbox-common.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

let root = ''
let instance = ''
let env: NodeJS.ProcessEnv
const groups = new Set<number>()
const repo = process.cwd()
const networkFetch = globalThis.fetch
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

// Every request is answered from synthetic files. An unexpected address or door throws.
const fixture = String.raw`
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.EFFORT_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const networkFetch = globalThis.fetch
// A run file is published whole, so a reader in another process never sees half of it: a new temporary name in the
// same folder, made new ('wx') so a link left there is never written through, then renamed onto the path.
const writeWhole = (file, text) => {
  const temporary = file + '.' + Math.random().toString(16).slice(2) + '.writing'
  writeFileSync(temporary, text, { flag: 'wx' })
  renameSync(temporary, file)
}
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('test refused network: ' + url.origin)
  const path = url.pathname, method = init.method ?? 'GET'
  if (path.startsWith('/api/office/run-models/for/')) {
    const officeFile = join(root, 'effort-office')
    if (existsSync(officeFile)) return networkFetch(readFileSync(officeFile, 'utf8') + path + url.search, init)
    return new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })
  }
  const body = init.body ? JSON.parse(init.body) : {}
  appendFileSync(join(root, 'requests'), JSON.stringify({ path, method, body }) + '\n')
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (method === 'POST' && path.startsWith('/api/agents/') && path.endsWith('/hand-run')) return answer({ cut: null })
  if (path === '/api/participants') return answer({ agents: ['synthetic-claude', 'synthetic-codex', 'synthetic-exec'].map(handle => ({ id: handle, handle, record: handle, name: handle, retired: false })) })
  if (path === '/api/kinds/session') return answer({ kind: { fields: [{ key: 'adaptedTool' }, { key: 'effort' }] } })
  if (path.startsWith('/api/participants/agent/')) return answer({ participant: { retired: false } })
  if (path === '/api/resources' && method === 'GET') return answer({ resources: [], rows: [] })
  if (path === '/api/resources' && method === 'POST') return answer({ resource: { id: 'synthetic-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  if (path === '/api/toolset/uses') return answer({ written: true }, 201)
  if (path === '/api/records' && method === 'GET') return answer({ records: [] })
  if (path === '/api/records/ScratchProof') return answer({ error: 'No synthetic run has this id.' }, 404)
  if (path === '/api/records' && method === 'POST') {
    const id = 'synthetic-run-' + process.pid
    const record = { ...body, id }
    writeWhole(join(root, id + '.json'), JSON.stringify(record))
    return answer({ record }, 201)
  }
  const id = path.slice('/api/records/'.length)
  const file = join(root, id + '.json')
  if (path.startsWith('/api/records/') && existsSync(file)) {
    const record = JSON.parse(readFileSync(file, 'utf8'))
    if (method === 'PATCH') { record.data = { ...record.data, ...body.dataPatch }; writeWhole(file, JSON.stringify(record)) }
    return answer({ record })
  }
  throw new Error('No synthetic reply for ' + method + ' ' + path)
}
`

const docker = String.raw`#!/usr/bin/env node
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path'), cp = process.getBuiltinModule('node:child_process')
const args = process.argv.slice(2), root = process.env.EFFORT_FIXTURE
if (args[0] === 'inspect') {
  const instance = JSON.parse(fs.readFileSync(path.join(root, 'sandboxes/synthetic/instance.json')))
  console.log(JSON.stringify([{ State: { Running: true }, Config: { Env: [] }, Mounts: [], HostConfig: {}, ...instance.container }]))
} else if (args[0] === 'exec') {
  const env = { ...process.env }
  delete env.MOLE_AGENT_KEY // Docker does not inherit the host starter's key.
  let i = 1, cwd = root
  while (args[i].startsWith('-')) {
    const flag = args[i++], value = args[i++]
    if (flag === '-e') { const at = value.indexOf('='); env[value.slice(0, at)] = value.slice(at + 1) }
    else if (flag === '--env-file') {
      const lines = fs.readFileSync(value, 'utf8').trim().split('\n')
      fs.appendFileSync(path.join(root, 'env-files'), JSON.stringify(lines) + '\n')
      for (const line of lines) { const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1) }
    }
    else if (flag === '-w') cwd = value
    else throw new Error('Unknown synthetic docker flag ' + flag)
  }
  i++
  const containerTmp = path.join(root, 'tmp'); fs.mkdirSync(containerTmp, { recursive: true })
  if (!env.TMPDIR) env.TMPDIR = containerTmp
  const loader = path.join(root, 'container-tmp.mjs'); fs.writeFileSync(loader, ${JSON.stringify(CONTAINER_TMP_LOADER)})
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + process.getBuiltinModule('node:url').pathToFileURL(loader).href].filter(Boolean).join(' ')
  const child = cp.spawn(args[i], args.slice(i + 1), { cwd, env, stdio: 'inherit' })
  child.on('close', code => process.exit(code ?? 1))
} else throw new Error('Unknown synthetic docker command ' + args[0])
`

beforeAll(() => {
  vi.stubGlobal('fetch', (address: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => String(address).startsWith('http://synthetic.invalid')
    ? Promise.resolve(new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })) : networkFetch(address, init))
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/effort-sources-'))
  mkdirSync(join(root, 'tmp', 'ScratchProof-synthetic-unknown-run'), { recursive: true })
  instance = join(root, 'sandboxes', 'synthetic')
  for (const dir of ['repo', 'home/.codex', 'out', 'briefs']) mkdirSync(join(instance, dir), { recursive: true })
  const checkout = join(instance, 'repo')
  git(checkout, 'init', '-q', '-b', 'main')
  git(checkout, 'config', 'user.name', 'Synthetic test')
  git(checkout, 'config', 'user.email', 'synthetic@example.invalid')
  git(checkout, 'config', 'commit.gpgsign', 'false')
  for (const dir of ['tools', 'src', 'for-agents']) symlinkSync(join(repo, dir), join(checkout, dir))
  git(checkout, 'add', '.')
  git(checkout, 'commit', '-qm', 'Synthetic checkout')
  git(checkout, 'remote', 'add', 'origin', checkout)
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'synthetic', secrets: { hostFile: join(root, 'secrets'), names: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] }] } }))
  writeFileSync(join(root, 'secrets'), 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\n', { mode: 0o600 })
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(instance, { instance: 'synthetic', template: 'synthetic', templateDir: template, workspace: 'default', from: checkout, ref: 'main', containerRow: 'synthetic-container', container: { name: 'synthetic-container' } })
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 })
  writeFileSync(join(root, 'bin/claude'), `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path')
const file = path.join(process.env.EFFORT_FIXTURE, 'seen-' + process.env.MOLE_OFFICE_SESSION + '.json')
fs.writeFileSync(file + '.part', JSON.stringify({ effort: process.env.CLAUDE_CODE_EFFORT_LEVEL }))
fs.renameSync(file + '.part', file)
`, { mode: 0o755 })
  env = { ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: join(root, 'bin') + ':' + process.env['PATH'], EFFORT_FIXTURE: root, NODE_OPTIONS: '--import=' + join(root, 'fetch.mjs'), MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: 'synthetic-starter-run', MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: 'default' }
  delete env['MOLE_AGENT_KEY']
  delete env['CLAUDE_CODE_EFFORT_LEVEL']
  env['CLAUDE_CODE_OAUTH_TOKEN'] = 'synthetic-token'
})

// THE FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED THE FIXTURE HAS ENDED (wave 13s round 113, problem R5kTJe89yPw7).
// OLD: it went as soon as the cases ended. The launcher's background helper still writes finish.log in the run's log
// folder after the commandEnded the starts wait for, and in the queue's whole-suite run such a line, written while rmSync
// emptied that folder, made its rmdir fail with ENOTEMPTY after both cases had passed. MUTATIONS: a helper that writes
// finish.log for 2 s after its run is finished turns the old clean-up red with those words, 5 runs of 5, and leaves this
// one green; a helper that stays 15 s after its run is finished turns this one red, naming it. Round 116 moved the wait to
// tests/the-processes-a-fixture-started.ts, which the go-limit test uses too (problem gI0Ria0qJL-y).
afterAll(async () => {
  vi.unstubAllGlobals()
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await removeTheFolderOnceItsProcessesHaveEnded(root)
})

async function launch(args: string[]) {
  const at = args.indexOf('--')
  const before = at === -1 ? args : args.slice(0, at)
  const after = at === -1 ? [] : args.slice(at)
  const child = spawn(process.execPath, ['tools/sandbox.mjs', ...before, '--sandboxes', join(root, 'sandboxes'), '--api', 'http://synthetic.invalid', '--workspace', 'default', ...after], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  return { code, out, err }
}

async function until(check: () => boolean, what = 'the synthetic program to finish') {
  const end = Date.now() + 10_000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('Waited ten seconds for ' + what)
}

async function started(args: string[]) {
  const ran = await launch(args)
  expect(ran.code, ran.err).toBe(0)
  const start = JSON.parse(ran.out.trim())
  groups.add(start.hostPgid)
  const file = join(root, 'seen-' + start.run + '.json')
  await until(() => existsSync(file) && existsSync(join(instance, 'logs', start.run, 'finish.log')))
  // The finish log can precede the helper's last office write. Wait before removing its fixture.
  await until(() => JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data.commandEnded !== undefined)
  return { ran, start, seen: JSON.parse(readFileSync(file, 'utf8')) as { effort?: string } }
}

const worker = (runtime: string, model: string) => ['worker', 'synthetic', '--agent', 'synthetic-' + (runtime === 'claude-code' ? 'claude' : runtime), '--runtime', runtime, '--model', model, '--brief', join(root, 'brief'), '--json']

/** Only child processes see the extra source. The checkout and the test process keep the real list. */
function addASourceForChildren() {
  writeFileSync(join(root, 'register-source.mjs'), `
import { register } from 'node:module'
register('./load-source.mjs', { parentURL: import.meta.url, data: { entry: process.argv[1] ?? '<eval>' } })
`)
  writeFileSync(join(root, 'load-source.mjs'), String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
let entry
export function initialize(data) { entry = data.entry }
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  if (!url.endsWith('/src/config/model-efforts.mjs')) return loaded
  const original = String(loaded.source)
  const source = original.replace(
    /(export const THE_EFFORT_SOURCES\s*=\s*Object.freeze\([\s\S]*?\[)/,
    "$1'a made-up source', ",
  )
  if (source === original) throw new Error('The test hook could not add an effort source')
  if (entry.endsWith('/tools/sandbox.mjs') || entry.endsWith('/tools/sandbox-start.mjs')) {
    appendFileSync(join(process.env.EFFORT_FIXTURE, 'hook-loads'), JSON.stringify(entry) + '\n')
  }
  return { ...loaded, source }
}
`)
  env['NODE_OPTIONS'] += ' --import=' + pathToFileURL(join(root, 'register-source.mjs')).href
}

describe('Effort sources live in one list', () => {
  // Each mutation restores one launcher's private array. Either must refuse the added source.
  it('accepts an added source on the host and in the keyless helper, with hook controls', async () => {
    const starterKey = 'b'.repeat(64)
    let source = 'Casting roll'
    const office = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.statusCode = request.headers['x-mole-office-key'] === starterKey ? 200 : 403
      response.end(JSON.stringify(response.statusCode === 200
        ? { model: 'claude-opus-5-5', effort: 'low', effortFrom: source }
        : { error: 'Synthetic office: the key window is closed.' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic effort source brief.\n')
    env['MOLE_AGENT_KEY'] = starterKey
    const nodeOptions = env['NODE_OPTIONS']
    try {
      const ordinary = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(ordinary.seen.effort).toBe('low')
      expect(ordinary.start).toMatchObject({ effort: 'low', effortFrom: source, officeUnavailable: false })
      expect(ordinary.start.startWords).toContain('effort from Casting roll')
      const requests = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { path: string })
      expect(requests.some(request => request.path === '/api/records/ScratchProof')).toBe(true)
      expect(existsSync(join(root, 'tmp', 'ScratchProof-synthetic-unknown-run'))).toBe(true)

      source = 'a made-up source'
      const refused = await launch(worker('claude-code', 'claude-opus-5-5'))
      expect(refused.code).not.toBe(0)
      expect(refused.err).toContain('The office answered without a readable effort and its source. Details:')

      addASourceForChildren()
      source = 'Casting roll'
      const unchanged = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(unchanged.seen.effort).toBe(ordinary.seen.effort)
      expect(unchanged.start).toMatchObject({ effort: 'low', effortFrom: source, officeUnavailable: false })
      expect(unchanged.start.startWords).toContain('effort from Casting roll')
      const loadedBy = readFileSync(join(root, 'hook-loads'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as string)
      expect(loadedBy.some(file => file.endsWith('/tools/sandbox.mjs'))).toBe(true)
      expect(loadedBy.some(file => file.endsWith('/tools/sandbox-start.mjs'))).toBe(true)

      source = 'a made-up source'
      const added = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(added.seen.effort).toBe('low')
      expect(added.start).toMatchObject({ effort: 'low', effortFrom: source, officeUnavailable: false })
      expect(added.start.startWords).toContain('effort from a made-up source')
    } finally {
      env['NODE_OPTIONS'] = nodeOptions
      delete env['MOLE_AGENT_KEY']
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)
})
