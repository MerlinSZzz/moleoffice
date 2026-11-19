// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 48, ITEM 1: A RUN THAT OPENCODE HOLDS ON GO'S USAGE LIMIT IS MARKED WHILE IT WAITS.
 *
 * Before: OpenCode 1.18.31 retries a Go limit quietly. It waits the provider's retry-after between tries, which can be
 * five hours, and `opencode run --format json` prints nothing until the tries are spent. Until then the run looked like
 * any running run, so the router went on choosing Go. Now the launcher gives every OpenCode run a plugin. OpenCode hands
 * the plugin each retry, and the plugin prints one line for a retry on Go's limit. The launcher reads that line and
 * writes the session field `waitingOnALimit` on the run, with the reset OpenCode will wait for, or five hours from the
 * retry when the retry names none. The mark goes when OpenCode prints anything that goes on, or when the command ends.
 *
 * The event shapes are OpenCode 1.18.31's own, measured on 14 October 2026 against a local stand-in for the provider.
 * Here a stand-in for `opencode` loads the plugins the launcher names in OPENCODE_CONFIG_CONTENT, hands them the
 * events the test wrote, and prints the test's lines. Synthetic programs and office replies only; no model is called,
 * and nothing listens on the live office port.
 *
 * ROUND 55: a retry whose next try is more than an hour away asks the office, on the write that marks it, to tell the
 * run's starter (`tellTheStarter: 'a-long-wait'`), once a wait. A retry of seconds asks nothing, and a refused notice
 * costs no mark. The mark names the key the wait is on by its name, never its value.
 * ROUND 55, THE REFUSAL ANSWERED: the mark gives OpenCode's next try as `nextTryAt`, beside the reset. A retry that
 * names no reset has a reset assumed five hours away and a next try seconds away, so only the next try tells the lists
 * a long wait from a retry of seconds (tests/a-run-waiting-days-on-a-limit-is-listed-as-waiting.test.ts).
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

let root = ''
let instance = ''
let env: NodeJS.ProcessEnv
const groups = new Set<number>()
const repo = process.cwd()
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
const MODEL = 'opencode-go/deepseek-v4.1-flash'
const HOUR = 60 * 60 * 1000
const AN_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

// Every request is answered from synthetic files. A PATCH merges as the office does: objects key by key, and a null
// takes the key out. An unexpected address or door throws instead of reaching a server.
const fixture = String.raw`
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.GO_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const merge = (into, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    const there = into[key]
    if (value === null) delete into[key]
    else if (typeof value === 'object' && !Array.isArray(value) && typeof there === 'object' && there !== null && !Array.isArray(there)) merge(there, value)
    else into[key] = value
  }
}
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
    // A test that writes this file has the office refuse the write that asks it to tell the starter, as the office does.
    if (method === 'PATCH' && body.tellTheStarter !== undefined && existsSync(join(root, 'refuse-the-notice-' + id))) {
      return answer({ error: 'Synthetic: the office refuses this notice. Nothing was written.' }, 409)
    }
    // And this one has it answer as an office older than round 55, which takes no key and no next try on the mark, and
    // no 'a-long-wait'.
    const mark = body.dataPatch?.waitingOnALimit
    if (method === 'PATCH' && existsSync(join(root, 'an-older-office-' + id)) && (body.tellTheStarter !== undefined || mark?.key !== undefined || mark?.nextTryAt !== undefined)) {
      return answer({ error: 'Synthetic: an office older than round 55 takes none of them. Nothing was written.' }, 400)
    }
    if (method === 'PATCH') {
      merge(record.data, body.dataPatch)
      writeFileSync(file + '.new', JSON.stringify(record))
      renameSync(file + '.new', file)
    }
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

// The stand-in for opencode loads every plugin OPENCODE_CONFIG_CONTENT names, as OpenCode does, and then follows the
// steps the test wrote for its run: hand an event to the plugins, print a line, wait for a file, or exit. It waits a
// minute at most, so a failed test leaves nothing behind.
const opencode = `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path')
const root = process.env.GO_FIXTURE
;(async () => {
  const steps = JSON.parse(fs.readFileSync(path.join(root, 'steps-' + process.env.MOLE_OFFICE_SESSION + '.json'), 'utf8'))
  const named = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}').plugin ?? []
  const hooks = []
  for (const url of named) for (const plugin of Object.values(await import(url))) hooks.push(await plugin({}))
  for (const step of steps) {
    if (step.event !== undefined) for (const hook of hooks) await hook.event?.({ event: step.event })
    if (step.print !== undefined) process.stdout.write(JSON.stringify(step.print) + '\\n')
    if (step.waitFor !== undefined) {
      const end = Date.now() + 60000
      while (!fs.existsSync(path.join(root, step.waitFor))) {
        if (Date.now() > end) process.exit(3)
        await new Promise(done => setTimeout(done, 20))
      }
    }
    if (step.exit !== undefined) process.exit(step.exit)
  }
})()
`

beforeAll(() => {
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/go-wait-fixture-'))
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
  delete env['OPENCODE_CONFIG_CONTENT']
  delete env['OPENCODE_API_KEY']
})

// THE FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED THE FIXTURE HAS ENDED (wave 13s round 117).
// OLD: the afterAll sent SIGTERM to the groups and removed the folder at once with rmSync. Each case waits for "marked
// crashed" in finish.log, and the launcher's background helper still writes lines there after it, so the removal raced
// them and failed with ENOTEMPTY after the cases had passed. MUTATIONS: a helper that writes finish.log for 2 s after
// its run is finished turns the old clean-up red with those words and leaves this one green; a helper that stays 15 s
// after its run is finished turns this one red, naming it.
afterAll(async () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await removeTheFolderOnceItsProcessesHaveEnded(root)
})

async function until(check: () => boolean, what: string) {
  const end = Date.now() + 20_000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('Waited twenty seconds for ' + what)
}

type Step = { event: unknown } | { print: unknown } | { waitFor: string } | { exit: number }

/** Start an OpenCode run filed before its start, whose stand-in follows `steps`, with `more` in its environment. */
async function anOpenCodeRunThatFollows(id: string, steps: Step[], more: NodeJS.ProcessEnv = {}) {
  writeFileSync(join(root, id + '.json'), JSON.stringify({ id, kind: 'session', data: { state: 'running', runtime: 'opencode', model: MODEL, workingDirectory: join(instance, 'repo'), cutFrom: 'main' } }))
  writeFileSync(join(root, `steps-${id}.json`), JSON.stringify(steps))
  const child = spawn(process.execPath, ['tools/sandbox.mjs', 'exec', 'synthetic', '--run', id, '--json', '--sandboxes', join(root, 'sandboxes'), '--api', 'http://synthetic.invalid', '--workspace', 'default', '--', 'opencode', 'run', '-m', MODEL, 'Synthetic brief'], { env: { ...env, ...more } })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  expect(code, err).toBe(0)
  const start = JSON.parse(out.trim())
  if (typeof start.hostPgid === 'number') groups.add(start.hostPgid)
}

/** The run's record as the synthetic office holds it now. */
function theRun(id: string): { data: Record<string, any> } | null {
  try { return JSON.parse(readFileSync(join(root, id + '.json'), 'utf8')) } catch { return null }
}

/** Tell the stand-in to go past a `waitFor` step. */
const goOn = (file: string) => writeFileSync(join(root, file), '')

async function itIsMarkedCrashed(id: string): Promise<{ data: Record<string, any> }> {
  const finish = join(instance, 'logs', id, 'finish.log')
  await until(() => existsSync(finish) && readFileSync(finish, 'utf8').includes('marked crashed'), `run ${id} to be marked crashed`)
  return theRun(id)!
}

/**
 * The retry OpenCode 1.18.31 hands its plugins on Go's limit, in its own shape. `resetIn` is the words it read from the
 * retry-after, or "". `limit` opens the words; a weekly limit's words here are made up in the 5-hour limit's shape.
 */
const aGoRetry = (attempt: number, next: number, resetIn: string, limit = '5-hour usage limit reached') => {
  const words = `${limit}. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`
  return {
    id: `evt_synthetic_${String(attempt)}`, type: 'session.status',
    properties: { sessionID: 'ses_synthetic', status: { type: 'retry', attempt, message: `${words} - https://opencode.ai/workspace/synthetic/go`, next,
      action: { reason: 'account_rate_limit', provider: 'opencode-go', title: 'Go limit reached', message: words, label: 'open settings', link: 'https://opencode.ai/workspace/synthetic/go' } } },
  }
}
const aStep = { type: 'step_start', timestamp: Date.now(), sessionID: 'ses_synthetic', part: { id: 'prt_1', type: 'step-start' } }
const someText = { type: 'text', timestamp: Date.now(), sessionID: 'ses_synthetic', part: { id: 'prt_2', type: 'text', text: 'Synthetic answer.' } }
/** The error `opencode run --format json` prints once its retries on Go's limit are spent. */
const aGoLimitError = (headers: Record<string, string> | undefined) => ({
  type: 'error', timestamp: Date.now(), sessionID: 'ses_synthetic',
  error: { name: 'APIError', data: {
    message: 'Synthetic Go usage limit reached.', statusCode: 429, isRetryable: true,
    ...(headers === undefined ? {} : { responseHeaders: headers }),
    responseBody: JSON.stringify({ type: 'error', error: { type: 'GoUsageLimitError', message: 'Synthetic Go usage limit reached.' }, metadata: { workspace: 'synthetic', limitName: '5-hour' } }),
  } },
})

// Mutation: the launcher writes no mark. Red: the run never carries waitingOnALimit.
// Mutation: the command's end leaves the mark. Red: the crashed run still carries it beside its stop cause.
it('marks a running OpenCode run as waiting on Go, until the moment OpenCode will try again, and takes the mark off at the end', async () => {
  const next = Date.now() + 2 * HOUR
  await anOpenCodeRunThatFollows('go-wait-named', [
    { print: aStep }, { event: aGoRetry(1, next, '2 hours') }, { waitFor: 'end-go-wait-named' },
    { print: aGoLimitError({ 'retry-after': '7200' }) }, { exit: 1 },
  ])
  const requests = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { path: string })
  expect(requests.some(request => request.path === '/api/records/ScratchProof')).toBe(true)
  expect(existsSync(join(root, 'tmp', 'ScratchProof-synthetic-unknown-run'))).toBe(true)
  await until(() => theRun('go-wait-named')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  const running = theRun('go-wait-named')!
  expect(running.data['state']).toBe('running')
  expect(running.data['commandEnded']).toBeUndefined()
  const mark = running.data['waitingOnALimit']
  // The mark is the session's own field, and the old copy in `extra` is not written beside it.
  expect(running.data['extra']?.waitingOnALimit).toBeUndefined()
  expect(mark).toMatchObject({ provider: 'opencode-go', attempt: 1, said: expect.stringContaining('It will reset in 2 hours.') })
  expect(mark.resetsAt).toMatch(AN_INSTANT)
  expect(Date.parse(mark.resetsAt)).toBe(next)
  // The next try is OpenCode's own `next`, which the lists read to tell a long wait from a retry of seconds.
  expect(mark.nextTryAt).toMatch(AN_INSTANT)
  expect(Date.parse(mark.nextTryAt)).toBe(next)
  expect(mark.resetFrom).toBe('named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"')
  expect(mark.seenAt).toMatch(AN_INSTANT)
  expect(Math.abs(Date.parse(mark.seenAt) - Date.now())).toBeLessThan(60_000)
  goOn('end-go-wait-named')
  const ended = await itIsMarkedCrashed('go-wait-named')
  expect(ended.data['stopCause']).toMatchObject({ kind: 'quota', resetFrom: 'named by the error: "retry-after: 7200"' })
  expect(ended.data['waitingOnALimit']).toBeUndefined()
}, 60_000)

// Mutation: a line OpenCode prints after the retry does not take the mark off. Red: the mark is still there while the
// command runs on, and goes only at its end.
it('takes the mark off when OpenCode goes on after the reset, while the command still runs', async () => {
  await anOpenCodeRunThatFollows('go-wait-goes-on', [
    { print: aStep }, { event: aGoRetry(1, Date.now() + 2 * HOUR, '2 hours') }, { waitFor: 'go-on-go-wait-goes-on' },
    { print: someText }, { waitFor: 'end-go-wait-goes-on' }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-goes-on')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  goOn('go-on-go-wait-goes-on')
  await until(() => { const run = theRun('go-wait-goes-on'); return run !== null && run.data['waitingOnALimit'] === undefined }, 'the mark to go')
  expect(theRun('go-wait-goes-on')!.data['commandEnded']).toBeUndefined()
  goOn('end-go-wait-goes-on')
  const ended = await itIsMarkedCrashed('go-wait-goes-on')
  expect(ended.data['stopCause']).toBeUndefined()
}, 60_000)

// Mutation: a retry that names no reset is said to have its reset from the error. Red: resetFrom claims a source the
// retry never gave.
// Mutation: the mark's next try is its reset. Red: a retry of seconds gives a next try five hours away.
it('says the reset was assumed when the retry names none, and takes five hours from the retry', async () => {
  const next = Date.now() + 2000
  await anOpenCodeRunThatFollows('go-wait-assumed', [
    { print: aStep }, { event: aGoRetry(1, next, '') }, { waitFor: 'end-go-wait-assumed' },
    { print: aGoLimitError(undefined) }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-assumed')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  const mark = theRun('go-wait-assumed')!.data['waitingOnALimit']
  expect(mark.resetFrom).toBe("assumed: five hours, Go's allowance window (OpenCode's retry named no reset)")
  expect(Date.parse(mark.resetsAt) - Date.parse(mark.seenAt)).toBe(5 * HOUR)
  // The reset is assumed and the next try is still OpenCode's own, seconds away: the lists draw this run as running.
  expect(Date.parse(mark.nextTryAt)).toBe(next)
  goOn('end-go-wait-assumed')
  const ended = await itIsMarkedCrashed('go-wait-assumed')
  expect(ended.data['waitingOnALimit']).toBeUndefined()
}, 60_000)

/** Every write the launcher sent for a run that carried a mark of waiting, in the order sent, refused ones too. */
const theMarkWritesOf = (id: string): Record<string, any>[] =>
  readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { path: string; method: string; body: Record<string, any> })
    .filter(request => request.method === 'PATCH' && request.path === `/api/records/${id}` && typeof request.body.dataPatch?.waitingOnALimit === 'object' && request.body.dataPatch.waitingOnALimit !== null)
    .map(request => request.body)

// ROUND 55: A WAIT WHOSE NEXT TRY IS MORE THAN AN HOUR AWAY ASKS THE OFFICE TO TELL THE STARTER, ONCE.
// Mutation: the launcher never asks. Red: no write carries 'a-long-wait'.
// Mutation: every retry of the wait asks. Red: the second retry's write carries it too.
// Mutation: the mark names no key. Red: the mark has no `key`.
it('asks the office once to tell of a wait whose next try is days away, and names the key the wait is on', async () => {
  const next = Date.now() + 3 * 24 * HOUR
  await anOpenCodeRunThatFollows('go-wait-long', [
    { print: aStep }, { event: aGoRetry(1, next, '3 days', 'Weekly usage limit reached') }, { waitFor: 'again-go-wait-long' },
    { event: aGoRetry(2, next, '3 days', 'Weekly usage limit reached') }, { waitFor: 'end-go-wait-long' }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-long')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  expect(theRun('go-wait-long')!.data['waitingOnALimit']).toMatchObject({ attempt: 1, key: 'opencode-login' })
  goOn('again-go-wait-long')
  await until(() => theRun('go-wait-long')?.data['waitingOnALimit']?.attempt === 2, 'the second retry to be marked')
  expect(theMarkWritesOf('go-wait-long').map(write => write.tellTheStarter)).toEqual(['a-long-wait', undefined])
  goOn('end-go-wait-long')
  await itIsMarkedCrashed('go-wait-long')
}, 60_000)

// Mutation: the launcher reads how long the run waits from the reset it marks, not from OpenCode's next try. Red: the
// retry of seconds, whose reset is assumed five hours away, asks the office to tell of it.
it('asks nothing for a retry of seconds or a next try within the hour', async () => {
  await anOpenCodeRunThatFollows('go-wait-short', [
    { print: aStep }, { event: aGoRetry(1, Date.now() + 5000, '') }, { waitFor: 'again-go-wait-short' },
    { event: aGoRetry(2, Date.now() + 40 * 60 * 1000, '40 minutes') }, { waitFor: 'end-go-wait-short' }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-short')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  goOn('again-go-wait-short')
  await until(() => theRun('go-wait-short')?.data['waitingOnALimit']?.attempt === 2, 'the second retry to be marked')
  expect(theMarkWritesOf('go-wait-short').map(write => write.tellTheStarter)).toEqual([undefined, undefined])
  goOn('end-go-wait-short')
  await itIsMarkedCrashed('go-wait-short')
}, 60_000)

// Mutation: a refused notice is not written again without it. Red: the run never carries the mark.
it('writes the mark again without the notice when the office refuses the notice, and logs why', async () => {
  writeFileSync(join(root, 'refuse-the-notice-go-wait-refused'), '')
  await anOpenCodeRunThatFollows('go-wait-refused', [
    { print: aStep }, { event: aGoRetry(1, Date.now() + 2 * HOUR, '2 hours') }, { waitFor: 'end-go-wait-refused' }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-refused')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  expect(theMarkWritesOf('go-wait-refused').map(write => write.tellTheStarter)).toEqual(['a-long-wait', undefined])
  const helper = join(instance, 'logs', 'go-wait-refused', 'helper.log')
  await until(() => existsSync(helper) && readFileSync(helper, 'utf8').includes("The office refused to tell the run's starter of the wait"), 'the refusal to be logged')
  expect(readFileSync(helper, 'utf8')).toContain('Synthetic: the office refuses this notice.')
  goOn('end-go-wait-refused')
  await itIsMarkedCrashed('go-wait-refused')
}, 60_000)

// Mutation: a 400 is not answered by writing the mark as an older office takes it. Red: the run never carries the mark.
// Mutation: the mark is written again with its next try. Red: the run never carries the mark.
it('writes the mark without its key, its next try or its notice when an office older than round 55 refuses them, and logs why', async () => {
  writeFileSync(join(root, 'an-older-office-go-wait-older'), '')
  await anOpenCodeRunThatFollows('go-wait-older', [
    { print: aStep }, { event: aGoRetry(1, Date.now() + 2 * HOUR, '2 hours') }, { waitFor: 'end-go-wait-older' }, { exit: 1 },
  ])
  await until(() => theRun('go-wait-older')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  expect(theRun('go-wait-older')!.data['waitingOnALimit']).toMatchObject({ attempt: 1, said: expect.stringContaining('It will reset in 2 hours.') })
  expect(theRun('go-wait-older')!.data['waitingOnALimit'].key).toBeUndefined()
  expect(theRun('go-wait-older')!.data['waitingOnALimit'].nextTryAt).toBeUndefined()
  expect(theMarkWritesOf('go-wait-older').map(write => [write.tellTheStarter, write.dataPatch.waitingOnALimit.key, typeof write.dataPatch.waitingOnALimit.nextTryAt]))
    .toEqual([['a-long-wait', 'opencode-login', 'string'], [undefined, undefined, 'undefined']])
  const helper = join(instance, 'logs', 'go-wait-older', 'helper.log')
  await until(() => existsSync(helper) && readFileSync(helper, 'utf8').includes('as an office older than round 55 takes it'), 'the older office to be logged')
  goOn('end-go-wait-older')
  await itIsMarkedCrashed('go-wait-older')
}, 60_000)

// The stand-in for docker hands the launcher the environment it was started with, so the key reaches it here as a
// sandbox's secrets file would hand it inside the container.
// Mutation: the key is said to be OpenCode's own login whatever the variable holds. Red: the mark names opencode-login.
it("names OPENCODE_API_KEY by its name when the run's environment holds it, and never sends its value", async () => {
  const value = `not-a-real-opencode-key-${String(process.pid)}-${String(Date.now())}`
  await anOpenCodeRunThatFollows('go-wait-keyed', [
    { print: aStep }, { event: aGoRetry(1, Date.now() + 2 * HOUR, '2 hours') }, { waitFor: 'end-go-wait-keyed' }, { exit: 1 },
  ], { OPENCODE_API_KEY: value })
  await until(() => theRun('go-wait-keyed')?.data['waitingOnALimit'] !== undefined, 'the run to be marked as waiting')
  expect(theRun('go-wait-keyed')!.data['waitingOnALimit'].key).toBe('OPENCODE_API_KEY')
  expect(readFileSync(join(root, 'requests'), 'utf8')).not.toContain(value)
  goOn('end-go-wait-keyed')
  await itIsMarkedCrashed('go-wait-keyed')
}, 60_000)
