// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOGIN PRESS'S POOL ADAPTER, run for real against a stand-in for the host's pool tool.
 *
 * Each case makes an invented home under the temporary folder, with a stand-in pool in it and a copy of
 * tests/private-sandbox-login-pool-tool-stand-in.py as the tool. The adapter runs that copy through setpriv and prlimit
 * as it would run the host's tool, and the stand-in writes down what it was given. Nothing here opens the real pool or
 * reads the owner's ~/.claude or ~/.config.
 *
 * After each case the value of every login the case used is looked for in every file of the invented home except the
 * pool's own token files, in what the stand-in was given as arguments and environment, and in everything this test
 * process wrote to stdout and stderr. It must be in none of them.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privatePool } from '../src/server/lib/sandbox-login-addition/pool.mjs'
import { startTimeOf } from '../src/config/session-process.mjs'
import { POOL_TOOL_BY, signalTheRecordedGroup } from '../src/holder/private-sandbox-login-pool-tool.mjs'
import { POOL_TOOL_STAND_IN, anInventedPool as aPool, expectNoValueIn, sha, whatTheAdapterGave, type PoolToolReport as Report } from './private-sandbox-login-pool-tool-stand.ts'

const THE_ADAPTER = fileURLToPath(new URL('../src/holder/private-sandbox-login-pool-tool.mjs', import.meta.url))
const THE_POOL_MODULE = fileURLToPath(new URL('../src/server/lib/sandbox-login-addition/pool.mjs', import.meta.url))
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const homes: string[] = []
const values: string[] = []
const groups: number[] = []
let written = ''

beforeEach(() => {
  written = ''
  const keep = (chunk: string | Uint8Array) => { written += Buffer.from(chunk).toString('utf8'); return true }
  vi.spyOn(process.stdout, 'write').mockImplementation(keep as typeof process.stdout.write)
  vi.spyOn(process.stderr, 'write').mockImplementation(keep as typeof process.stderr.write)
})

afterEach(() => {
  vi.restoreAllMocks()
  try {
    expectNoValueIn(homes, values, written)
  } finally {
    for (const group of groups.splice(0)) try { process.kill(-group, 'SIGKILL') } catch {}
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
    values.splice(0)
  }
})

/** A value no pool holds yet, remembered for the scan. */
function aValue(name: string) {
  const value = `invented-login-value-${name}-${sha(name + String(Date.now()), 16)}`
  values.push(value)
  return value
}

const anInventedPool = () => aPool(homes)

const groupIsGone = (pgid: number) => {
  try { process.kill(-pgid, 0); return false } catch (err) { return (err as NodeJS.ErrnoException).code === 'ESRCH' }
}
async function untilGone(pgid: number, ms: number) {
  const by = Date.now() + ms
  while (Date.now() < by && !groupIsGone(pgid)) await sleep(50)
  return groupIsGone(pgid)
}

it('adds a login with the value on a socket only, in a session of its own from /, with PATH and HOME, no stderr and no core', async () => {
  const f = anInventedPool()
  f.fault('stderr')
  const value = aValue('first')
  expect(f.pool.available()).toBe(true)
  expect(await f.pool.add(Buffer.from(value))).toEqual({ letter: 'C', sha12: sha(value, 12) })
  const [report, ...more] = f.reports()
  expect(more).toEqual([])
  if (!report) throw new Error('the stand-in tool wrote no report')
  // privateStdin: the arguments are the protocol's and the value came on stdin, with its newline.
  expect(report.argv).toEqual(['add-stdin', POOL_TOOL_BY, '--operation', expect.stringMatching(/^[a-f0-9]{32}$/), '--json'])
  expect(report.stdin).toBe('socket')
  expect(report.valueBytes).toBe(value.length + 1)
  // isolation: the tool is the leader of its own session and group, started from /, with these two names only.
  expect(whatTheAdapterGave(report.environ)).toEqual({ PATH: '/usr/bin:/bin', HOME: f.home })
  expect([report.pgid, report.sid]).toEqual([report.pid, report.pid])
  expect(report.cwd).toBe('/')
  // noDiagnostics: the stand-in wrote a line to stderr, and stderr was /dev/null.
  expect(report.stderrIsNull).toBe(true)
  // dumpPrevention: the stand-in does not lower its own limit.
  expect(report.core).toEqual([0, 0])
  expect(f.index().logins['C']).toEqual({ sha12: sha(value, 12), added: '2026-01-01 12:00', by: POOL_TOOL_BY, operation: report.argv[3] })
})

it("gives the tool's refusal of a login the pool already holds as it is, and adds nothing", async () => {
  const f = anInventedPool()
  values.push('invented-existing-A')
  await expect(f.pool.add(Buffer.from('invented-existing-A'))).rejects.toMatchObject({ reason: 'PoolDuplicate' })
  expect(Object.keys(f.index().logins)).toEqual(['A', 'B'])
  expect(f.reports()).toHaveLength(1)
})

it('recovery: a tool killed after its rename is reconciled to the letter it gave, by the same operation', async () => {
  const f = anInventedPool()
  f.fault('killed-after-the-rename')
  const value = aValue('after')
  expect(await f.pool.add(Buffer.from(value))).toEqual({ letter: 'C', sha12: sha(value, 12) })
  const [add, reconcile] = f.reports().sort((a, b) => a.argv[0]!.localeCompare(b.argv[0]!))
  expect(add?.argv[0]).toBe('add-stdin')
  // The reconcile is given the operation and the fingerprint, and never the value.
  expect(reconcile?.argv).toEqual(['reconcile', add?.argv[3], sha(value, 12), '--json'])
  expect(reconcile?.valueBytes).toBeUndefined()
  expect(f.index().logins['C']?.operation).toBe(add?.argv[3])
})

it('recovery: a tool killed before its rename is reconciled to absent, which is not known, and the pool is unchanged', async () => {
  const f = anInventedPool()
  f.fault('killed-before-the-rename')
  const value = aValue('before')
  await expect(f.pool.add(Buffer.from(value))).rejects.toMatchObject({ reason: 'PoolUnknown' })
  expect(f.reports().map((report) => report.argv[0]).sort()).toEqual(['add-stdin', 'reconcile'])
  expect(Object.keys(f.index().logins)).toEqual(['A', 'B'])
  expect(existsSync(join(f.root, 'C.token'))).toBe(false)
})

it("recovery: a reconcile answer for another operation is not taken, though the fingerprint matches", async () => {
  const f = anInventedPool()
  f.fault('killed-after-the-rename reconcile-another-operation')
  const value = aValue('another-reconcile')
  await expect(f.pool.add(Buffer.from(value))).rejects.toMatchObject({ reason: 'PoolUnknown' })
  expect(f.index().logins['C']?.sha12).toBe(sha(value, 12))
})

it("takes only the tool's one answer line for this operation, and asks reconcile when the answer is anything else", async () => {
  for (const fault of ['another-operation', 'noise', 'two-lines']) {
    const f = anInventedPool()
    f.fault(fault)
    const value = aValue(fault)
    expect(await f.pool.add(Buffer.from(value)), fault).toEqual({ letter: 'C', sha12: sha(value, 12) })
    expect(f.reports().map((report) => report.argv[0]).sort(), fault).toEqual(['add-stdin', 'reconcile'])
  }
})

it("flock: two additions at once through the adapter are given two letters, by the tool's own lock", async () => {
  const f = anInventedPool()
  const first = aValue('one')
  const second = aValue('two')
  const added = await Promise.all([f.pool.add(Buffer.from(first)), privatePool({ tool: f.adapter }).add(Buffer.from(second))])
  expect(added.map((one) => one.letter).sort()).toEqual(['C', 'D'])
  expect(Object.keys(f.index().logins).sort()).toEqual(['A', 'B', 'C', 'D'])
})

it("ownerWatch: the tool's group is ended at the deadline, and on an abort", async () => {
  for (const how of ['deadline', 'abort']) {
    const f = anInventedPool()
    f.fault('hang')
    const value = aValue(how)
    const controller = new AbortController()
    const adding = f.pool.add(Buffer.from(value), how === 'deadline' ? { deadline: Date.now() + 1500 } : { signal: controller.signal })
    let report: Report | undefined
    for (const by = Date.now() + 10_000; Date.now() < by && !(report = f.reports()[0]);) await sleep(50)
    if (!report) throw new Error(`the stand-in tool wrote no report before the ${how}`)
    groups.push(report.pgid)
    if (how === 'abort') controller.abort()
    await expect(adding, how).rejects.toMatchObject({ reason: 'PoolUnknown' })
    expect(await untilGone(report.pgid, 5000), `the tool's group after the ${how}`).toBe(true)
  }
})

it('ownerWatch: the tool ends when the holder that ran it is killed, though it is in a session of its own', async () => {
  const f = anInventedPool()
  f.fault('hang')
  const value = aValue('holder-killed')
  // A HOLDER OF ITS OWN: a Node process that runs the adapter as the holder would, given the value on its own stdin.
  const script = [
    `import { thePoolToolAdapter } from ${JSON.stringify(THE_ADAPTER)}`,
    `import { privatePool } from ${JSON.stringify(THE_POOL_MODULE)}`,
    `const [python, tool, toolSha256, home] = process.argv.slice(1)`,
    `let value = ''`,
    `for await (const chunk of process.stdin) value += chunk`,
    `await privatePool({ tool: thePoolToolAdapter({ python, tool, toolSha256, home }) }).add(Buffer.from(value))`,
  ].join('\n')
  const holder = spawn(process.execPath, ['--input-type=module', '-e', script, '/usr/bin/python3', f.tool, f.toolSha256, f.home], {
    detached: true, cwd: '/', env: { PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'ignore', 'ignore'],
  })
  if (holder.pid === undefined) throw new Error('the holder of its own could not be started')
  groups.push(holder.pid)
  holder.stdin.end(value)
  let report: Report | undefined
  for (const by = Date.now() + 10_000; Date.now() < by && !(report = f.reports()[0]);) await sleep(50)
  if (!report) throw new Error('the stand-in tool wrote no report')
  groups.push(report.pgid)
  expect(report.sid).not.toBe(holder.pid)
  expect(groupIsGone(report.pgid)).toBe(false)
  process.kill(-holder.pid, 'SIGKILL')
  expect(await untilGone(report.pgid, 5000), "the tool's group after its holder was killed").toBe(true)
})

it('processIdentity: a group is signalled only while its leader has the start time recorded for it', async () => {
  const sleeper = spawn('/usr/bin/sleep', ['30'], { detached: true, stdio: 'ignore' })
  if (sleeper.pid === undefined) throw new Error('sleep could not be started')
  const pid = sleeper.pid
  groups.push(pid)
  const ended = new Promise((done) => sleeper.once('exit', done))
  let identity: string | undefined
  for (const by = Date.now() + 5000; Date.now() < by && !(identity = startTimeOf(pid)?.toISOString());) await sleep(20)
  if (!identity) throw new Error('the start time of sleep could not be read')
  const another = new Date(Date.parse(identity) - 1000).toISOString()
  expect(signalTheRecordedGroup(pid, another, 'SIGTERM')).toBe(false)
  expect(signalTheRecordedGroup(1, identity, 'SIGTERM')).toBe(false)
  expect(signalTheRecordedGroup(process.pid, identity, 'SIGTERM')).toBe(false)
  await sleep(200)
  expect(groupIsGone(pid)).toBe(false)
  expect(signalTheRecordedGroup(pid, identity, 'SIGTERM')).toBe(true)
  await ended
  expect(await untilGone(pid, 2000)).toBe(true)
})

it('installed: a tool file that has changed, or that its group may write, is not run, and the pool is unavailable', async () => {
  const f = anInventedPool()
  const value = aValue('changed')
  expect(f.adapter.verified.installed).toBe(true)
  appendFileSync(f.tool, '\n')
  expect(f.adapter.verified.installed).toBe(false)
  expect(f.pool.available()).toBe(false)
  await expect(f.pool.add(Buffer.from(value))).rejects.toMatchObject({ reason: 'Unavailable' })
  writeFileSync(f.tool, readFileSync(POOL_TOOL_STAND_IN))
  expect(f.pool.available()).toBe(true)
  chmodSync(f.tool, 0o620)
  expect(f.pool.available()).toBe(false)
  await expect(f.pool.add(Buffer.from(value))).rejects.toMatchObject({ reason: 'Unavailable' })
  // A change between the check and the run is caught by the adapter itself, which refuses as unsafe.
  chmodSync(f.tool, 0o600)
  const command = { executable: f.adapter.executable, args: [...f.adapter.prefixArgs, 'add-stdin', POOL_TOOL_BY], operationId: 'a'.repeat(32), deadline: Date.now() + 5000, signal: new AbortController().signal }
  appendFileSync(f.tool, '\n')
  expect(await f.adapter.execute({ ...command, input: Buffer.from(value + '\n') })).toEqual({ outcome: 'refused', reason: 'PoolUnsafe' })
  await expect(f.adapter.reconcile({ operationId: command.operationId, sha12: sha(value, 12), deadline: command.deadline, signal: command.signal })).rejects.toThrow()
  expect(f.reports()).toEqual([])
})
