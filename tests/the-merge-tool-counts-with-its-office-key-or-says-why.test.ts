// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The key, requests and replies below are made up stand-ins. No office, suite or cleanup program is reached. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({key: 'made-up-office-key' as string | null, folder: '', logs: [] as string[]}))
vi.mock('../src/config/office-key.mjs', () => ({theOfficeKey: () => f.key === null ? {key: null, says: 'Made-up missing key.'} : {key: f.key, says: null}}))
vi.mock('../tools/merge-tool/cleanup.mjs', () => ({startCleanup: () => {throw new Error('The count test must not start cleanup.')}, keepForCleanup: () => {}}))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  API: 'http://made-up-office.invalid', WORKSPACE: 'default', get WORKDIR() {return f.folder}, get LOG() {return join(f.folder, 'made-up.log')},
  get STATE_FILE() {return join(f.folder, 'state.json')}, get STEPS_FILE() {return join(f.folder, 'steps.jsonl')}, THIS_CHECKOUT: process.cwd(),
  MIGRATIONS_FOLDER: 'drizzle/', RERUN_LIMITS: {timeoutMs: 5000, idleTimeoutMs: 5000}, GIT_IDENTITY: {}, ABSENT: 'absent',
  chosen: {as: 'mole-office/the-message-worker', session: 'made-up-merge-session', entry: 'made-up-merge-entry', officeFor: 1},
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  MergerFailure: class extends Error {}, fail: (why: string) => {throw new Error(why)}, log: (line: string) => {f.logs.push(line)},
  readState: () => ({}), readStateAt: () => ({}), writeState: () => ({}), writeStateAt: () => ({}), stamp: () => '2026-10-22 12:00:00',
}))
const modulePath = '../tools/merge-tool/office-keeper.mjs'
async function counter(): Promise<{countAGateMet: (id: string, position: string) => Promise<{counted: boolean; because?: string}>}> {return import(modulePath)}
beforeEach(() => {
  vi.resetModules(); f.folder = mkdtempSync(join(tmpdir(), 'gate-count-send-')); vi.stubEnv('HOME', f.folder)
  f.key = 'made-up-office-key'; f.logs = []
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {status: 200})))
})
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(f.folder, {recursive: true, force: true})})
it('sends one POST with the office key and the position it was handed', async () => {
  const {countAGateMet} = await counter()
  expect(await countAGateMet('whole-suite-fix-round', '0')).toEqual({counted: true})
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(url).toBe('http://made-up-office.invalid/api/office/gates/whole-suite-fix-round/met')
  expect(options?.method).toBe('POST')
  expect(options?.headers).toMatchObject({'x-mole-office-key': f.key})
  expect(JSON.parse(options?.body as string)).toEqual({position: '0'})
})
it('sends nothing without an office key and logs one line saying the gate was not counted', async () => {
  f.key = null
  const {countAGateMet} = await counter()
  expect(await countAGateMet('whole-suite-fix-round', '1')).toMatchObject({counted: false, because: expect.stringContaining('no office key')})
  expect(fetch).not.toHaveBeenCalled()
  expect(f.logs).toHaveLength(1)
  expect(f.logs[0]).toContain('not counted')
})
it('returns a refused send with its words and lets the caller go on', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error: 'Made-up refusal. Nothing was counted.'}), {status: 403}))
  const {countAGateMet} = await counter()
  expect(await countAGateMet('whole-suite-fix-round', '1')).toMatchObject({counted: false, because: expect.stringContaining('Made-up refusal. Nothing was counted.')})
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(f.logs.join(' ')).toContain('Made-up refusal. Nothing was counted.')
})
it('returns a failed send without retrying or throwing, and says what failed', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('Made-up connection failure'))
  const {countAGateMet} = await counter()
  expect(await countAGateMet('whole-suite-fix-round', '0')).toMatchObject({counted: false, because: expect.stringContaining('Made-up connection failure')})
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(f.logs.join(' ')).toContain('Made-up connection failure')
})
