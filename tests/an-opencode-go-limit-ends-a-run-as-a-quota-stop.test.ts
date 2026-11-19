// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 47, ITEM 1: A RUN THAT ENDS ON OPENCODE GO'S USAGE LIMIT ENDS AS A QUOTA STOP THE ROUTER READS.
 *
 * Before: an OpenCode run that ended on Go's limit was a plain crash ("Its command … exited 1"), so nothing told the
 * router that Go was limited. Now, when the last error `opencode run --format json` printed carries GoUsageLimitError
 * in its response body, the launcher writes the crash as a provider stop of kind quota, with the reset the provider's
 * retry-after names, or five hours from the stop when it names none. Round 48: the stop cause also says where its reset
 * came from, named by the error or assumed, and the run's sentence carries the same words. The words and shapes are
 * OpenCode 1.18.31's own, read from its code on 14 October 2026; no Go limit has been captured on this machine, so the
 * printed events here are stand-ins in that shape. Synthetic programs and office replies only; nothing listens on the
 * live office port.
 * Each test was proved by a control run, its named mutation red, and the restore.
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { CONTAINER_TMP_LOADER } from './sandbox-stand-ins.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { writeInstance } from '../tools/sandbox-common.mjs'
import { parseCastingReset } from '../src/shared/casting-roll.ts'

let root = ''
let instance = ''
let env: NodeJS.ProcessEnv
const groups = new Set<number>()
const repo = process.cwd()
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
const MODEL = 'opencode-go/deepseek-v4.1-flash'
const STOPPED = Date.parse('2026-10-14T08:12:03.250Z')
const AN_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

// Every request is answered from synthetic files. An unexpected address or door throws instead of reaching a server.
const fixture = String.raw`
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.GO_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('test refused network: ' + url.origin)
  const path = url.pathname, method = init.method ?? 'GET'
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (path.startsWith('/api/office/run-models/for/')) return new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })
  const body = init.body ? JSON.parse(init.body) : {}
  appendFileSync(join(root, 'requests'), JSON.stringify({ path, method, body }) + '\n')
  if (path === '/api/participants') return answer({ agents: [] })
  if (path === '/api/kinds/session') return answer({ kind: { fields: [{ key: 'adaptedTool' }, { key: 'effort' }] } })
  if (path === '/api/resources' && method === 'GET') return answer({ resources: [], rows: [] })
  if (path === '/api/resources' && method === 'POST') return answer({ resource: { id: 'synthetic-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  if (path === '/api/toolset/uses') return answer({ written: true }, 201)
  if (path === '/api/records' && method === 'GET') return answer({ records: [] })
  if (path === '/api/records/ScratchProof') return answer({ error: 'No synthetic run has this id.' }, 404)
  const id = path.slice('/api/records/'.length)
  const file = join(root, id + '.json')
  if (path.startsWith('/api/records/') && existsSync(file)) {
    const record = JSON.parse(readFileSync(file, 'utf8'))
    if (method === 'PATCH') { record.data = { ...record.data, ...body.dataPatch }; writeFileSync(file, JSON.stringify(record)) }
    return answer({ record })
  }
  throw new Error('No synthetic reply for ' + method + ' ' + path)
}
`

const docker = String.raw`#!/usr/bin/env node
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path'), cp = process.getBuiltinModule('node:child_process')
const args = process.argv.slice(2), root = process.env.GO_FIXTURE
if (args[0] === 'inspect') {
  const instance = JSON.parse(fs.readFileSync(path.join(root, 'sandboxes/synthetic/instance.json')))
  console.log(JSON.stringify([{ State: { Running: true }, Config: { Env: [] }, Mounts: [], HostConfig: {}, ...instance.container }]))
} else if (args[0] === 'exec') {
  const env = { ...process.env }
  delete env.MOLE_AGENT_KEY
  let i = 1, cwd = root
  while (args[i].startsWith('-')) {
    const flag = args[i++], value = args[i++]
    if (flag === '-e') { const at = value.indexOf('='); env[value.slice(0, at)] = value.slice(at + 1) }
    else if (flag === '--env-file') {
      for (const line of fs.readFileSync(value, 'utf8').trim().split('\n')) { const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1) }
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

// The stand-in for opencode prints what the test wrote for its run, then exits 1, as OpenCode does after an error event.
const opencode = `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path')
process.stdout.write(fs.readFileSync(path.join(process.env.GO_FIXTURE, 'prints-' + process.env.MOLE_OFFICE_SESSION + '.jsonl'), 'utf8'))
process.exit(1)
`

beforeAll(() => {
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/go-limit-fixture-'))
  mkdirSync(join(root, 'tmp', 'ScratchProof-synthetic-unknown-run'), { recursive: true })
  instance = join(root, 'sandboxes', 'synthetic')
  for (const dir of ['repo', 'home', 'out', 'briefs']) mkdirSync(join(instance, dir), { recursive: true })
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
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(instance, { instance: 'synthetic', template: 'synthetic', templateDir: template, workspace: 'default', from: checkout, ref: 'main', containerRow: 'synthetic-container', container: { name: 'synthetic-container' } })
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 })
  writeFileSync(join(root, 'bin/opencode'), opencode, { mode: 0o755 })
  env = { ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: join(root, 'bin') + ':' + process.env['PATH'], GO_FIXTURE: root, NODE_OPTIONS: '--import=' + join(root, 'fetch.mjs'), MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: 'synthetic-starter-run', MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: 'default' }
  delete env['MOLE_AGENT_KEY']
})

// THE FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED THE FIXTURE HAS ENDED (wave 13s round 116, problem gI0Ria0qJL-y).
// OLD: it went as soon as the cases ended. Each case waits for "marked crashed" in finish.log, and the launcher's
// background helper writes more lines there after it, so in the queue's whole-suite run of 13y's entry the rmdir of
// go-other-error's log folder failed with ENOTEMPTY after the three cases had passed. MUTATIONS: a helper that writes
// finish.log for 2 s after its run is finished turns the old clean-up red with those words, 5 runs of 5, and leaves this
// one green; a helper that stays 15 s after its run is finished turns this one red, naming it.
afterAll(async () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await removeTheFolderOnceItsProcessesHaveEnded(root)
})

async function until(check: () => boolean, what: string) {
  const end = Date.now() + 10_000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('Waited ten seconds for ' + what)
}

/** An OpenCode run filed before its start, which prints `events` and exits 1. Answers the run's record once it has crashed. */
async function anOpenCodeRunThatPrints(id: string, events: unknown[]) {
  writeFileSync(join(root, id + '.json'), JSON.stringify({ id, kind: 'session', data: { state: 'running', runtime: 'opencode', model: MODEL, workingDirectory: join(instance, 'repo'), cutFrom: 'main' } }))
  writeFileSync(join(root, `prints-${id}.jsonl`), events.map(event => JSON.stringify(event)).join('\n') + '\n')
  const child = spawn(process.execPath, ['tools/sandbox.mjs', 'exec', 'synthetic', '--run', id, '--json', '--sandboxes', join(root, 'sandboxes'), '--api', 'http://synthetic.invalid', '--workspace', 'default', '--', 'opencode', 'run', '-m', MODEL, 'Synthetic brief'], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  expect(code, err).toBe(0)
  const start = JSON.parse(out.trim())
  if (typeof start.hostPgid === 'number') groups.add(start.hostPgid)
  const finish = join(instance, 'logs', id, 'finish.log')
  await until(() => existsSync(finish) && readFileSync(finish, 'utf8').includes('marked crashed'), `run ${id} to be marked crashed`)
  return { record: JSON.parse(readFileSync(join(root, id + '.json'), 'utf8')) as { data: Record<string, any> }, finish: readFileSync(finish, 'utf8') }
}

/** The error event `opencode run --format json` prints once its retries on Go's limit are spent, in OpenCode's own shape. */
const aGoLimitError = (headers: Record<string, string> | undefined) => ({
  type: 'error', timestamp: STOPPED, sessionID: 'ses_synthetic',
  error: { name: 'APIError', data: {
    message: 'Synthetic Go usage limit reached.', statusCode: 429, isRetryable: true,
    ...(headers === undefined ? {} : { responseHeaders: headers }),
    responseBody: JSON.stringify({ type: 'error', error: { type: 'GoUsageLimitError', message: 'Synthetic Go usage limit reached.' }, metadata: { workspace: 'synthetic', limitName: '5-hour' } }),
  } },
})
const aStep = { type: 'step_start', timestamp: STOPPED - 1000, sessionID: 'ses_synthetic', part: { id: 'prt_1', type: 'step-start' } }

// Mutation: the launcher writes its plain crash and no stop cause for OpenCode. Red: closedHow and stopCause are absent.
it('marks an OpenCode run that ended on Go’s usage limit crashed, with a quota stop until the reset the provider sent', async () => {
  const { record, finish } = await anOpenCodeRunThatPrints('go-limit-retry-after', [aStep, aGoLimitError({ 'retry-after': '7200' })])
  const requests = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { path: string })
  expect(requests.some(request => request.path === '/api/records/ScratchProof')).toBe(true)
  expect(existsSync(join(root, 'tmp', 'ScratchProof-synthetic-unknown-run'))).toBe(true)
  expect(record.data).toMatchObject({ state: 'crashed', closedHow: 'provider-event', commandEnded: { code: 1 } })
  expect(record.data['detail']).toContain('exited 1')
  expect(typeof record.data['closedAt']).toBe('string')
  const cause = record.data['stopCause']
  expect(cause).toMatchObject({ kind: 'quota', said: 'Synthetic Go usage limit reached.' })
  // The stop cause is the session's own field, and the old copy in `extra` is not written beside it.
  expect(record.data['extra']?.stopCause).toBeUndefined()
  expect(cause.at).toMatch(AN_INSTANT)
  expect(cause.resetsAt).toMatch(AN_INSTANT)
  expect(Date.parse(cause.at)).toBe(STOPPED)
  expect(Date.parse(cause.resetsAt)).toBe(STOPPED + 7200 * 1000)
  // The router reads the stored reset as the same moment.
  expect(parseCastingReset(cause.resetsAt, STOPPED, 'UTC')?.until).toBe(STOPPED + 7200 * 1000)
  expect(record.data['closedBecause']).toContain('Synthetic Go usage limit reached.')
  // Round 48: where the reset came from is on the stop cause, and the sentence carries the same words.
  expect(cause.resetFrom).toBe('named by the error: "retry-after: 7200"')
  expect(record.data['closedBecause']).toContain('named by the error: "retry-after: 7200"')
  expect(finish).toContain('OpenCode Go')
}, 30_000)

// Mutation: with no retry-after, the reader names no reset. Red: resetsAt is not five hours after the stop.
it('takes five hours from the stop when the provider sent no reset, and says so', async () => {
  const { record } = await anOpenCodeRunThatPrints('go-limit-no-reset', [aStep, aGoLimitError(undefined)])
  const cause = record.data['stopCause']
  expect(cause).toMatchObject({ kind: 'quota' })
  expect(Date.parse(cause.resetsAt)).toBe(STOPPED + 5 * 60 * 60 * 1000)
  // Round 48: the stop cause says the reset was assumed, and why, in the words the sentence carries.
  expect(cause.resetFrom).toBe("assumed: five hours, Go's allowance window (the error sent no retry-after)")
  expect(record.data['closedBecause']).toContain("assumed: five hours, Go's allowance window (the error sent no retry-after)")
}, 30_000)

// Mutation: any error event is read as Go's limit. Red: the run carries a stop cause.
it('leaves an OpenCode run that ended on another error a plain crash with no stop cause', async () => {
  const other = { ...aGoLimitError(undefined), error: { name: 'APIError', data: { message: 'Synthetic server error.', statusCode: 500, isRetryable: true, responseBody: '{"error":"Synthetic server error."}' } } }
  const { record } = await anOpenCodeRunThatPrints('go-other-error', [aStep, other])
  expect(record.data).toMatchObject({ state: 'crashed', commandEnded: { code: 1 } })
  expect(record.data['closedHow']).toBeUndefined()
  expect(record.data['extra']).toBeUndefined()
}, 30_000)
