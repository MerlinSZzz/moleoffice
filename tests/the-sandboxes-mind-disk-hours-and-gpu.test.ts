// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** All figures are synthetic; only temporary folders and loopback are used. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import * as sandboxCommon from '../tools/sandbox-common.mjs'
import { SANDBOX_DISK_FLOOR, SANDBOX_RUN_PEAK, SANDBOX_FOLDER_WARNING, SANDBOX_RUN_REMINDER } from '../tools/sandbox-common.mjs'
import { sandboxDiskWatchers, sandboxFolderMeasurementMilliseconds, settingNamed } from '../src/config/settings.mjs'
import { FAKE_DF, FAKE_DU } from './sandbox-stand-ins.ts'

let scratch: string, sandboxes: string, server: Server, api: string
let messages: { body: any; headers: Record<string, unknown> }[]
let failSend: boolean
let folderLimitMs: number | undefined
/** MOLE_OFFICE_SANDBOX_DISK_WATCHERS for the launcher: two made-up agents, or empty for nobody. Never left out, because the
 * launcher reads the main checkout's .env under its environment, and an office may name watchers there. */
let watchers: string
const GB = 1_000_000_000
function state(patch: Record<string, unknown> = {}): any {
  const file = join(scratch, 'state.json')
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { calls: [], sizes: {} }
  Object.assign(value, patch)
  writeFileSync(file, JSON.stringify(value))
  return value
}
function folder(name: string, bytes: number | string): string {
  const at = join(sandboxes, name)
  mkdirSync(at, { recursive: true })
  writeFileSync(join(at, 'instance.json'), '{}')
  const now = state(); now.sizes[at] = bytes; state(now)
  return at
}
function sizes(...args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve('tools/sandbox.mjs'), 'sizes', '--sandboxes', sandboxes,
      '--api', api, '--workspace', 'default', '--as', 'size-watcher', '--session', 'synthetic-session', ...args],
    { env: { ...withoutInheritedEffort(), MOLE_AGENT_KEY: 'synthetic-caller-key', MOLE_OFFICE_AGENT: 'size-watcher', MOLE_OFFICE_TEST_FOLDER_LIMIT_MS: folderLimitMs?.toString(), MOLE_OFFICE_SANDBOX_DISK_WATCHERS: watchers, FAKE_DOCKER_DIR: scratch, PATH: `${join(scratch, 'bin')}:${process.env['PATH']}` } })
    let out = '', err = ''
    child.stdout.on('data', (chunk) => { out += chunk }); child.stderr.on('data', (chunk) => { err += chunk })
    child.on('exit', (code) => done({ code, out, err }))
  })
}
beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'sandbox-disk-watch-')); sandboxes = join(scratch, 'sandboxes')
  mkdirSync(sandboxes); mkdirSync(join(scratch, 'bin'))
  writeFileSync(join(scratch, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(scratch, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  state(); messages = []; failSend = false; folderLimitMs = undefined; watchers = 'wren,lark'
  server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    if (req.method !== 'POST' || req.url !== '/api/records') { res.writeHead(404).end(); return }
    if (failSend) { res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'synthetic message refusal' })); return }
    messages.push({ body: JSON.parse(body), headers: req.headers })
    res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ record: { id: 'synthetic-message' } }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { await new Promise<void>((done) => server.close(() => done())); rmSync(scratch, { recursive: true, force: true }) })

it('mutation DISK_HOURS_WHO: the frozen figures are the owner’s, and the warning goes to whom MOLE_OFFICE_SANDBOX_DISK_WATCHERS names', () => {
  expect(SANDBOX_DISK_FLOOR).toEqual({ bytes: 80 * GB, gb: 80 })
  // A START NEEDS THE FLOOR PLUS ITS OWN PEAK (decision tZ-rQXJD-Trh): a test run's measured peak, about 5 GB.
  expect(SANDBOX_RUN_PEAK).toEqual({ bytes: 5 * GB, gb: 5 })
  expect(SANDBOX_FOLDER_WARNING).toEqual({ bytes: 60 * GB, gb: 60 })
  expect(SANDBOX_RUN_REMINDER).toEqual({ ms: 28_800_000, hours: 8 })
  // NO NAME STANDS IN FOR THE SETTING: it has no default, and the launcher keeps no list of its own.
  expect(settingNamed('MOLE_OFFICE_SANDBOX_DISK_WATCHERS')).toMatchObject({ kind: 'list', fallback: null })
  expect('SANDBOX_DISK_WATCHERS' in sandboxCommon).toBe(false)
  expect(sandboxDiskWatchers({})).toEqual([])
  expect(sandboxDiskWatchers({ MOLE_OFFICE_SANDBOX_DISK_WATCHERS: '' })).toEqual([])
  expect(sandboxDiskWatchers({ MOLE_OFFICE_SANDBOX_DISK_WATCHERS: ' wren, lark ,' })).toEqual(['wren', 'lark'])
  for (const value of [SANDBOX_DISK_FLOOR, SANDBOX_RUN_PEAK, SANDBOX_FOLDER_WARNING, SANDBOX_RUN_REMINDER]) expect(Object.isFrozen(value)).toBe(true)
})
it('mutation SIZE_ORDER: sizes is read-only and lists instance folders largest first, measuring with du -s -B1 -x', async () => {
  const small = folder('small', 20 * GB), large = folder('large', 61 * GB)
  mkdirSync(join(sandboxes, '.run')); mkdirSync(join(sandboxes, 'not-an-instance'))
  const ran = await sizes('--json'); expect(ran.code, ran.err).toBe(0)
  // A MISSING SIZE SAYS WHY: the tool's own reason for each folder and the stand-in du's recorded calls go with the comparison.
  // A whole-suite run on 22 October 2026 got null for the second folder within a quarter of a second, and nothing it printed
  // told a crash ("du exited null"), a failed spawn (its code) and the stand-in's own refusal apart.
  const measured = JSON.parse(ran.out).sizes
  expect(measured.map((size: any) => [size.folder, size.bytes]), JSON.stringify({ why: measured.map((size: any) => size.why), calls: state().calls }))
    .toEqual([[large, 61 * GB], [small, 20 * GB]])
  expect(state().calls.map((call: any) => call.argv)).toEqual([['-s', '-B1', '-x', large], ['-s', '-B1', '-x', small]])
  expect(messages).toEqual([]); expect(existsSync(join(sandboxes, '.sizes.json'))).toBe(false)
})
it('mutation CROSSING: one message to each agent the setting names per crossing, with size and the five largest subfolders', async () => {
  const at = folder('large', 60 * GB)
  for (let i = 1; i <= 6; i++) {
    mkdirSync(join(at, `part-${i}`)); const now = state(); now.sizes[join(at, `part-${i}`)] = i * GB; state(now)
  }
  expect((await sizes('--tell')).code).toBe(0); expect(messages).toHaveLength(0)
  folder('large', 61 * GB)
  expect((await sizes('--tell')).code).toBe(0); expect(messages).toHaveLength(1)
  const sent = messages[0]!
  expect(sent.body.kind).toBe('message'); expect(sent.body.data.to).toEqual([{ kind: 'agent', id: 'wren' }, { kind: 'agent', id: 'lark' }])
  expect(sent.headers['x-mole-office-actor-id']).toBe('size-watcher'); expect(sent.headers['x-mole-office-key']).toBe('synthetic-caller-key')
  expect(sent.body.data.body).toContain(`${at} holds 61 GB`); expect(sent.body.data.body).toContain('warning; nothing was deleted')
  expect(sent.body.data.body).not.toContain('part-1:'); expect(sent.body.data.body).toContain('part-6: 6 GB')
  expect(sent.body.data.body.indexOf('part-6:')).toBeLessThan(sent.body.data.body.indexOf('part-5:'))
  expect((await sizes('--tell')).code).toBe(0); expect(messages).toHaveLength(1)
  folder('large', 59 * GB); expect((await sizes('--tell')).code).toBe(0)
  folder('large', 62 * GB); expect((await sizes('--tell')).code).toBe(0); expect(messages).toHaveLength(2)
})
it('mutation SEND_RETRY: a refused message leaves warning state unchanged and the next invocation tries again', async () => {
  folder('large', 50 * GB); await sizes('--tell')
  const file = join(sandboxes, '.sizes.json'), before = readFileSync(file, 'utf8')
  folder('large', 61 * GB); failSend = true
  const failed = await sizes('--tell'); expect(failed.code).not.toBe(0); expect(failed.err).toContain('synthetic message refusal')
  expect(readFileSync(file, 'utf8')).toBe(before)
  failSend = false; expect((await sizes('--tell')).code).toBe(0); expect(messages).toHaveLength(1)
})
// NOBODY NAMED: the sizes are still listed, nobody is told and the tool says so, and the folder's warning state is left as
// it was, so the first run with a watcher named tells (decision ZP-7AFoCvp1L). A crossing told to nobody fails the run, so
// the host's timer shows it; a run with no crossing does not fail.
it('mutation NOBODY_NAMED: with the setting empty, a crossing is told to nobody and fails the run, saying so, and a later run with a watcher tells', async () => {
  watchers = ''
  const at = folder('large', 59 * GB)
  const under = await sizes('--tell'); expect(under.code, under.err).toBe(0); expect(under.err).not.toContain('Nobody was told')
  folder('large', 61 * GB)
  const untold = await sizes('--tell'); expect(untold.code, untold.err).toBe(1)
  expect(untold.out).toContain(`${at}: 61 GB`); expect(messages).toEqual([])
  expect(untold.err).toContain(`Nobody was told that ${at} holds 61 GB`)
  expect(untold.err).toContain('sandbox: Nobody was told of the folder above the 60 GB warning, because MOLE_OFFICE_SANDBOX_DISK_WATCHERS names no agent, so this run fails.')
  expect(JSON.parse(readFileSync(join(sandboxes, '.sizes.json'), 'utf8'))).toEqual({ large: false })
  watchers = 'wren'
  const told = await sizes('--tell'); expect(told.code, told.err).toBe(0)
  expect(messages.map((one) => one.body.data.to)).toEqual([[{ kind: 'agent', id: 'wren' }]])
  expect(told.err).not.toContain('Nobody was told')
  // Already told: with the setting empty again there is no crossing, so nothing fails.
  watchers = ''
  const again = await sizes('--tell'); expect(again.code, again.err).toBe(0); expect(again.err).not.toContain('Nobody was told')
})
it('mutation HELP_NAMES_THE_SETTING: the help for sizes names the setting, not an agent', async () => {
  const help = await new Promise<string>((done) => {
    const child = spawn(process.execPath, [resolve('tools/sandbox.mjs'), '--help'], { env: withoutInheritedEffort() })
    let err = ''
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('close', () => done(err))
  })
  expect(help.split('\n').filter((line) => line.includes('Lists instance folder sizes'))).toEqual([
    '    Lists instance folder sizes; --tell warns the agents MOLE_OFFICE_SANDBOX_DISK_WATCHERS names once per crossing of 60 GB, and fails, saying so, when a crossing finds it naming none.',
  ])
})
it('mutation DU_CONTINUES: an unmeasurable folder is named with its reason and does not prevent the others being measured', async () => {
  folder('broken', 'synthetic permission denied'); folder('small', GB)
  const ran = await sizes(); expect(ran.code).toBe(0)
  expect(ran.out).toContain('small: 1 GB'); expect(ran.out).toContain('broken: could not be measured (synthetic permission denied)')
  expect(state().calls).toHaveLength(2)
})

// REMINDER_CANNOT_BE_DELAYED IS GONE WITH THE LAUNCHER'S TIMER (problem Grbb87VX3pND, 18 October 2026): the 8-hour
// reminder runs on the office's own clock, which no helper's environment reaches, and
// tests/the-office-writes-the-launchers-notices.test.ts proves it.

it('mutation DU_TIMEOUT: a folder exceeding its own 30-second limit is named and the next folder is still measured', async () => {
  expect(sandboxFolderMeasurementMilliseconds({})).toBe(30_000)
  folderLimitMs = 1000
  const slow = folder('a-slow', GB), good = folder('z-good', 2 * GB)
  const now = state(); now.sizes[slow] = { bytes: GB, delayMs: 1100 }; state(now)
  const ran = await sizes('--json'); expect(ran.code).toBe(0)
  const results = JSON.parse(ran.out).sizes
  expect(results[0]).toMatchObject({ folder: good, bytes: 2 * GB })
  expect(results[1]).toMatchObject({ folder: slow, bytes: null })
  expect(results[1].why).toContain('ETIMEDOUT')
}, 40_000)
