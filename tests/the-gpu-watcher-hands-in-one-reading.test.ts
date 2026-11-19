// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Synthetic card, containers, process files and office only. PATH contains only
 * stand-ins with absolute Node shebangs; none of these cases can run host tools.
 * Round 1 mutation proofs: control and every restored run had 15 passes. Labelling every
 * process as host failed 2 cases; splitting stat on spaces failed 2; replacing
 * read errors with zeros failed all 6 error cases; dropping a vanished process's
 * reading failed 1; printing every tick failed 2; returning 0 when the office
 * was down failed 1; accepting an unmarked root failed 1; sending who as a string
 * failed 5; accepting a cgroup path containing .. failed 1; sending in print
 * mode failed 1. The handback names the logs and the failing assertions.
 * Round 2: control and all three restorations had 18 passes. Removing failure
 * suppression failed all 3 new cases. Comparing only the kind failed both the
 * card-sentence and HTTP-status cases, proved separately for each case.
 */
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { theCgroupPath, theCgroupMemoryPath } from '../tools/sandbox-common.mjs'
import { theProcRoot, gpuCommandMilliseconds } from '../tools/gpu-watch.mjs'

let scratch: string
let server: Server
let api: string
let received: unknown[]
let headers: Record<string, unknown>[]
let status: number
let database: TestDb
let A_GPU_READING: typeof import('../src/server/lib/bookings.ts').A_GPU_READING
const containerA = 'a'.repeat(64)
const containerB = 'b'.repeat(64)
const watcher = resolve('tools/gpu-watch.mjs')
let commandLimitMs: number | undefined
let settings: { gpu: string; apps: string; fail?: boolean; hang?: boolean }

function program(name: string, source: string): void {
  const path = join(scratch, 'bin', name)
  writeFileSync(path, `#!${process.execPath}\n${source}`)
  chmodSync(path, 0o700)
}
function tell(): void { writeFileSync(join(scratch, 'card.json'), JSON.stringify(settings)) }
function processFiles(pid: number, pgid: number, path: string, name = 'synthetic job'): void {
  const folder = join(scratch, 'root', 'proc', String(pid))
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'stat'), `${pid} (${name}) S 1 ${pgid} 0 0\n`)
  writeFileSync(join(folder, 'cgroup'), `0::${path}\n`)
}
async function listen(port = 0): Promise<void> {
  await new Promise<void>(done => server.listen(port, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string' || thePortsATestKeepsOff().includes(address.port)) throw new Error('The stand-in office needs a free test port.')
  api = `http://127.0.0.1:${address.port}`
}
async function close(): Promise<void> { if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())) }
async function run(args: string[] = []): Promise<{ code: number | null; out: string; err: string }> {
  tell()
  const child = spawn(process.execPath, [watcher, ...args], { env: {
    ...process.env, PATH: join(scratch, 'bin'), XDG_CACHE_HOME: join(scratch, 'cache'),
    MOLE_OFFICE_TEST_GPU_COMMAND_LIMIT_MS: commandLimitMs?.toString(),
    MOLE_GPU_WATCH_TEST_ROOT: join(scratch, 'root'), [THE_TEST_MARK]: 'synthetic',
    MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'synthetic', MOLE_OFFICE_AGENT: 'watcher-test',
    MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_AGENT_KEY: 'synthetic-key',
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''; let err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  return new Promise((done, reject) => { child.on('error', reject); child.on('close', code => done({ code, out, err })) })
}
function latest() { return A_GPU_READING.parse(received.at(-1)) }

beforeAll(async () => {
  database = await freshDb()
  ;({ A_GPU_READING } = await import('../src/server/lib/bookings.ts'))
}, 300_000)
afterAll(() => database?.close())

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'gpu-watcher-test-'))
  mkdirSync(join(scratch, 'bin')); mkdirSync(join(scratch, 'root'))
  commandLimitMs = undefined
  settings = { gpu: '16303, 900\n', apps: '2201, 200\n2202, 300\n2203, 400\n' }
  program('nvidia-smi', `const fs = require('node:fs'); const s = JSON.parse(fs.readFileSync(${JSON.stringify(join(scratch, 'card.json'))}, 'utf8'));
const args = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(join(scratch, 'commands.jsonl'))}, JSON.stringify(['nvidia-smi', ...args])+'\\n');
if(s.fail) process.exit(9); if(s.hang) setInterval(()=>{},1000); else process.stdout.write(args[0] === '--query-gpu=memory.total,memory.used' ? s.gpu : s.apps);`)
  program('docker', `const fs = require('node:fs'); const args = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(join(scratch, 'commands.jsonl'))}, JSON.stringify(['docker', ...args])+'\\n');
if(args[0] !== 'inspect' || args.length !== 2) process.exit(8);
process.stdout.write(JSON.stringify([{Name:args[1] === '${containerA}' ? '/synthetic-sandbox' : '/other-container', Config:{Labels:args[1] === '${containerA}' ? {'mole-office.sandbox':'synthetic-sandbox'} : {}}}]));`)
  processFiles(2201, 2100, `/sandbox.slice/docker-${containerA}.scope`)
  processFiles(2202, 2200, '/user.slice/run-synthetic.scope')
  processFiles(2203, 2300, `/sandbox.slice/docker-${containerB}.scope`)
  received = []; headers = []; status = 200
  server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    expect(req.method).toBe('POST'); expect(req.url).toBe('/api/resources/gpu/reading')
    received.push(JSON.parse(body)); headers.push(req.headers)
    res.writeHead(status, { 'content-type': 'application/json' }); res.end('{}')
  })
  await listen()
})
afterEach(async () => { await close(); rmSync(scratch, { recursive: true, force: true }) })

it('hands in three processes with their sandbox, host unit, unknown container and process groups', async () => {
  expect((await run()).code).toBe(0)
  const reading = latest(); expect('processes' in reading).toBe(true)
  if (!('processes' in reading)) throw new Error('No processes were handed in.')
  expect(reading).toMatchObject({ totalMiB: 16303, usedMiB: 900, processes: [
    { pid: 2201, pgid: 2100, mib: 200, who: { kind: 'sandbox', name: 'synthetic-sandbox' } },
    { pid: 2202, pgid: 2200, mib: 300, who: { kind: 'host', unit: 'run-synthetic.scope' } },
    { pid: 2203, pgid: 2300, mib: 400, who: { kind: 'unknown', why: 'a container that is not a sandbox: other-container' } },
  ] })
  expect(reading.readAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  expect(headers[0]).toMatchObject({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'watcher-test', 'x-mole-office-key': 'synthetic-key' })
  const calls = readFileSync(join(scratch, 'commands.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toEqual([
    ['nvidia-smi', '--query-gpu=memory.total,memory.used', '--format=csv,noheader,nounits'],
    ['nvidia-smi', '--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'],
    ['docker', 'inspect', containerA], ['docker', 'inspect', containerB],
  ])
  // A reused host pid is identified again from its current files.
  processFiles(2201, 2400, '/user.slice/session-9.scope')
  await run(); const reused = latest()
  expect('processes' in reused && reused.processes[0]).toMatchObject({ pgid: 2400, who: { kind: 'host', unit: 'session-9.scope' } })
})

it('reads the process group past spaces and a closing parenthesis in the command name', async () => {
  processFiles(2202, 8123, '/user.slice/run-synthetic.scope', 'a job ) with (spaces)')
  await run(); const reading = latest()
  expect('processes' in reading && reading.processes[1]?.pgid).toBe(8123)
})

it.each(['missing', 'failed', 'two cards', 'bad number', 'bad process number', 'timeout'])('hands in an error without totals when the card is %s', async which => {
  if (which === 'missing') rmSync(join(scratch, 'bin', 'nvidia-smi'))
  if (which === 'failed') settings.fail = true
  if (which === 'two cards') settings.gpu += '16303, 500\n'
  if (which === 'bad number') settings.gpu = '16303, N/A\n'
  if (which === 'bad process number') settings.apps = '2201, N/A\n'
  if (which === 'timeout') {
    expect(gpuCommandMilliseconds({})).toBe(10_000)
    commandLimitMs = 500
    settings.hang = true
  }
  const result = await run(); expect(result.code).toBe(0)
  const reading = latest(); expect(reading).toHaveProperty('error'); expect(reading).not.toHaveProperty('totalMiB')
  expect(result.out.trim().split('\n')).toHaveLength(1)
}, 20_000)

it('keeps the other processes when a listed process vanished', async () => {
  rmSync(join(scratch, 'root', 'proc', '2201'), { recursive: true })
  await run(); const reading = latest()
  expect('processes' in reading && reading.processes).toHaveLength(3)
  expect('processes' in reading && reading.processes[0]).toMatchObject({ pid: 2201, pgid: null, who: { kind: 'unknown', why: 'The files for process 2201 were not there when read.' } })
})

it('stays quiet for the same set and prints one line for a changed set', async () => {
  expect((await run()).out.trim().split('\n')).toHaveLength(1)
  expect((await run()).out).toBe('')
  settings.gpu = '16303, 1000\n'; settings.apps = '2201, 250\n2202, 350\n2203, 400\n'
  expect((await run()).out).toBe('')
  settings.apps = '2202, 300\n'
  expect((await run()).out.trim().split('\n')).toHaveLength(1)
  expect(statSync(join(scratch, 'cache', 'mole-office', 'gpu-watch.json')).mode & 0o777).toBe(0o600)
})

it('exits 75 when the office is down and reports when the office comes back', async () => {
  await run()
  const port = Number(new URL(api).port); await close()
  const down = await run(); expect(down.code).toBe(75)
  expect(down.out).toBe('The office could not be reached; the next tick will try again.\n')
  await listen(port)
  const back = await run(); expect(back.code).toBe(0)
  expect(back.out).toBe('The office is taking GPU readings again.\n')
  expect((await run()).out).toBe('')
})

it('reports an office refusal with exit 1 and prints the reading without sending in print mode', async () => {
  status = 403
  const refused = await run(); expect(refused.code).toBe(1)
  expect(refused.out).toBe('The office refused the GPU reading (HTTP 403).\n')
  const saved = readFileSync(join(scratch, 'cache', 'mole-office', 'gpu-watch.json'), 'utf8')
  const printed = await run(['--once', '--print']); expect(printed.code).toBe(0)
  A_GPU_READING.parse(JSON.parse(printed.out)); expect(received).toHaveLength(1)
  expect(readFileSync(join(scratch, 'cache', 'mole-office', 'gpu-watch.json'), 'utf8')).toBe(saved)
})

it('ignores the synthetic root without the test mark without reading any process files', () => {
  expect(theProcRoot({ MOLE_GPU_WATCH_TEST_ROOT: '/synthetic' })).toBe('/')
  expect(theProcRoot({ MOLE_GPU_WATCH_TEST_ROOT: '/synthetic', [THE_TEST_MARK]: 'synthetic' })).toBe('/synthetic')
})

it('uses one validated cgroup path for identity and the memory file', () => {
  for (const unusable of ['', '0::', '0::relative', '0::/a/../b', '1::/a']) {
    expect(theCgroupPath(unusable)).toBeNull(); expect(theCgroupMemoryPath(unusable)).toBeNull()
  }
  expect(theCgroupPath('1::/other\n0::/sandbox.slice/job.scope\n')).toBe('/sandbox.slice/job.scope')
  expect(theCgroupMemoryPath('0::/sandbox.slice/job.scope')).toBe('/sys/fs/cgroup/sandbox.slice/job.scope/memory.current')
  expect(theCgroupMemoryPath('0::/')).toBe('/sys/fs/cgroup/memory.current')
})

it('hands in a reading that passes the office schema', async () => {
  await run(); expect(() => A_GPU_READING.parse(received[0])).not.toThrow()
})

it('prints an office outage once across three failed ticks and recovery once', async () => {
  await run()
  const port = Number(new URL(api).port); await close()
  const ticks = [await run(), await run(), await run()]
  expect(ticks.map(tick => tick.code)).toEqual([75, 75, 75])
  expect(ticks.map(tick => tick.out)).toEqual(['The office could not be reached; the next tick will try again.\n', '', ''])
  expect(ticks.map(tick => tick.err)).toEqual(['', '', ''])
  const path = join(scratch, 'cache', 'mole-office', 'gpu-watch.json')
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  expect(saved['state']).toBe('down'); expect(saved).not.toHaveProperty('failure')
  expect(statSync(path).mode & 0o777).toBe(0o600)
  await listen(port)
  const back = await run(); expect(back.code).toBe(0)
  expect(back.out).toBe('The office is taking GPU readings again.\n')
  expect((await run()).out).toBe('')
})

it('prints a card failure again only when its sentence changes and recovers once', async () => {
  settings.fail = true
  const first = await run(); const same = await run()
  expect([first.code, same.code]).toEqual([0, 0])
  expect(first.out).toBe('The GPU could not be read: nvidia-smi failed with exit 9.\n')
  expect(same.out).toBe('')
  settings.fail = false; settings.gpu += '16303, 500\n'
  const changed = await run(); expect(changed.code).toBe(0)
  expect(changed.out).toBe('The GPU could not be read: nvidia-smi listed more than one GPU.\n')
  expect((await run()).out).toBe('')
  expect(received).toHaveLength(4)
  for (const reading of received) expect(A_GPU_READING.parse(reading)).toHaveProperty('error')
  const path = join(scratch, 'cache', 'mole-office', 'gpu-watch.json')
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ set: null, state: 'card-error', failure: 'nvidia-smi listed more than one GPU.' })
  settings.gpu = '16303, 900\n'
  const back = await run(); expect(back.code).toBe(0)
  expect(back.out).toBe('The GPU can be read again.\n')
  expect((await run()).out).toBe('')
  expect(JSON.parse(readFileSync(path, 'utf8'))).not.toHaveProperty('failure')
})

it('prints refusals when the status or failure kind changes', async () => {
  status = 403
  const first = await run(); const same = await run()
  status = 500; const changed = await run()
  expect([first.code, same.code, changed.code]).toEqual([1, 1, 1])
  expect([first.out, same.out, changed.out]).toEqual(['The office refused the GPU reading (HTTP 403).\n', '', 'The office refused the GPU reading (HTTP 500).\n'])
  const path = join(scratch, 'cache', 'mole-office', 'gpu-watch.json')
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  expect(saved['state']).toBe('refused'); expect(saved['failure']).toBe(500)
  expect(Object.keys(saved).sort()).toEqual(['failure', 'set', 'state'])
  expect((await run()).out).toBe('')
  status = 200; settings.fail = true
  const card = await run(); expect(card.code).toBe(0)
  expect(card.out).toBe('The office is taking GPU readings again. The GPU could not be read: nvidia-smi failed with exit 9.\n')
  expect((await run()).out).toBe('')
  status = 403
  expect((await run()).out).toBe('The office refused the GPU reading (HTTP 403).\n')
  status = 200; settings.fail = false
  expect((await run()).out).toBe('The office is taking GPU readings again.\n')
  expect((await run()).out).toBe('')
})
