// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOGIN PRESS'S NATIVE ADAPTER, run for real under a pty against a stand-in for `claude setup-token`.
 *
 * Each case copies tests/private-sandbox-login-setup-token-stand-in.py into a folder of its own under the temporary
 * folder, and the adapter makes its scratch homes in that folder too. The stand-in prints the words the CLI printed in a
 * real run, signs nobody in and opens no network connection. Where a case adds a login, the pool is an invented one, run
 * through the pool adapter, from tests/private-sandbox-login-pool-tool-stand.ts. Nothing here opens the real pool or
 * reads the owner's ~/.claude or ~/.config.
 *
 * After each case the code and the token of every attempt are looked for in every file the case made, in every state
 * the service gave, and in everything this test process wrote to stdout and stderr. They must be in none of them.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPrivateLogin } from '../src/holder/private-sandbox-login.mjs'
import type { PrivateLoginBinding, PrivateLoginService, VerifiedNativeAdapter } from '../src/holder/private-sandbox-login.mjs'
import { PRIVATE_LOGIN_MS } from '../src/config/private-sandbox-login.mjs'
import { SIGN_IN_CALLBACKS, SIGN_IN_ORIGINS, theSetupTokenAdapter, theSetupTokenParser, theSignInEnvironment } from '../src/holder/private-sandbox-login-setup-token.mjs'
import type { PrivateLoginState } from '../src/shared/private-sandbox-login.ts'
import { anInventedPool, expectNoValueIn, sha, whatTheAdapterGave } from './private-sandbox-login-pool-tool-stand.ts'

const STAND_IN = fileURLToPath(new URL('./private-sandbox-login-setup-token-stand-in.py', import.meta.url))
const THE_SERVICE = fileURLToPath(new URL('../src/holder/private-sandbox-login.mjs', import.meta.url))
const THE_ADAPTER = fileURLToPath(new URL('../src/holder/private-sandbox-login-setup-token.mjs', import.meta.url))
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

interface ProgramReport { argv: string[]; environ: Record<string, string>; core: number[]; pid: number; pgid: number; sid: number; tty: boolean; cwd: string; reads: { length: number; enter: boolean }[]; submitted: boolean; pastedWithEnter: boolean }

const folders: string[] = []
const values: string[] = []
const groups: number[] = []
const services: PrivateLoginService[] = []
let written = ''
let states = ''

beforeEach(() => {
  written = ''
  states = ''
  const keep = (chunk: string | Uint8Array) => { written += Buffer.from(chunk).toString('utf8'); return true }
  vi.spyOn(process.stdout, 'write').mockImplementation(keep as typeof process.stdout.write)
  vi.spyOn(process.stderr, 'write').mockImplementation(keep as typeof process.stderr.write)
})

afterEach(() => {
  for (const service of services.splice(0)) service.close()
  vi.restoreAllMocks()
  try {
    expectNoValueIn(folders, values, written + states)
  } finally {
    for (const group of groups.splice(0)) try { process.kill(-group, 'SIGKILL') } catch {}
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
    values.splice(0)
  }
})

const groupIsGone = (pgid: number) => {
  try { process.kill(-pgid, 0); return false } catch (err) { return (err as NodeJS.ErrnoException).code === 'ESRCH' }
}
async function untilTrue(what: () => boolean, ms: number) {
  const by = Date.now() + ms
  while (Date.now() < by && !what()) await sleep(50)
  return what()
}

/**
 * The stand-in program in a folder of its own, with the mode it is to run in, and the native adapter for it. The adapter
 * is wrapped only to see what a case needs: the group it started, every byte the program printed, and whether the
 * program's report was there when it printed its first byte.
 */
function anInventedProgram(mode = '') {
  const folder = mkdtempSync(join(tmpdir(), 'invented-setup-token-'))
  folders.push(folder)
  const program = join(folder, 'claude')
  copyFileSync(STAND_IN, program)
  chmodSync(program, 0o755)
  writeFileSync(join(folder, 'mode'), mode)
  const scratchIn = join(folder, 'scratches')
  mkdirSync(scratchIn, { mode: 0o700 })
  const base = theSetupTokenAdapter({ claude: program, scratchIn })
  const reportFile = join(folder, 'report.json')
  const seen = { pgid: 0, printed: [] as Buffer[], reportedAtFirstByte: false }
  const adapter: VerifiedNativeAdapter = {
    ...base,
    async start(input) {
      const output: typeof input.output = (channel, bytes) => {
        if (seen.printed.length === 0) seen.reportedAtFirstByte = existsSync(reportFile)
        seen.printed.push(Buffer.from(bytes))
        input.output(channel, bytes)
      }
      const started = await base.start({ ...input, output })
      seen.pgid = started.pgid
      groups.push(started.pgid)
      return started
    },
  }
  return {
    folder, program, scratchIn, adapter, seen,
    report: () => JSON.parse(readFileSync(reportFile, 'utf8')) as ProgramReport,
    reported: () => existsSync(reportFile),
    scratches: () => readdirSync(scratchIn),
  }
}

interface APool { available(): boolean; add(value: Buffer): Promise<{ letter: string; sha12: string }> }
/** A pool that must not be asked: the case ends before a token could be printed. */
const neverAsked: APool = { available: () => true, add: async () => { throw new Error('this case saves nothing') } }

function aService(adapter: VerifiedNativeAdapter, pool: APool = neverAsked) {
  let clock = Date.now()
  const service = createPrivateLogin({ adapter, pool, now: () => clock, schedule: () => () => {} })
  services.push(service)
  const ref: PrivateLoginBinding = { version: 1, binding: randomBytes(32).toString('hex'), generation: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex') }
  const kept = (state: PrivateLoginState) => { states += JSON.stringify(state) + '\n'; return state }
  return {
    service, ref,
    advance: (ms: number) => { clock += ms; service.expire() },
    start: async () => { const state = kept(await service.start(ref)); ref.attempt = state.attempt; return state },
    status: () => kept(service.status(ref)),
    until: async (ready: (state: PrivateLoginState) => boolean, ms = 15_000) => {
      const by = Date.now() + ms
      let state = kept(service.status(ref))
      while (Date.now() < by && !ready(state)) { await sleep(50); state = kept(service.status(ref)) }
      return state
    },
    code: async (code: string) => kept(await service.code({ ...ref, code })),
  }
}

const atThePrompt = (state: PrivateLoginState) => state.state !== 'waiting' || (state.canOpen && state.code)
const ended = (state: PrivateLoginState) => state.state !== 'waiting' && state.state !== 'saving'

/** A code no attempt has used, remembered for the scan, and the token the stand-in makes of it. */
function aCode(name: string) {
  const code = `invented-code-${name}-${randomBytes(6).toString('hex')}`
  const token = `invented-token-${sha(code, 40)}`
  values.push(code, token)
  return { code, token }
}

it('adds a login end to end: the code and Enter as two writes, in a scratch home of its own, with no core, into the pool', async () => {
  const p = anInventedPool(folders)
  const program = anInventedProgram()
  const s = aService(program.adapter, p.pool)
  expect(s.service.capability()).toEqual({ version: 1, available: true, code: true })
  await s.start()
  let state = await s.until(atThePrompt)
  expect(state).toMatchObject({ state: 'waiting', canOpen: true, code: true })
  // The stand-in reports before its first byte, so the report read below is there once the prompt is seen.
  expect(program.seen.reportedAtFirstByte, 'the report, when the program printed its first byte').toBe(true)
  // storageIsolation: the program's files are in one scratch home, and every folder it was given is inside it.
  const [scratch, ...more] = program.scratches()
  expect(more).toEqual([])
  if (scratch === undefined) throw new Error('no scratch home was made')
  const home = join(program.scratchIn, scratch)
  expect(readdirSync(home, { recursive: true }).map(String).sort()).toEqual(['.claude', '.claude.json', join('.claude', '.claude.json'), 'run'])
  const report = program.report()
  expect(whatTheAdapterGave(report.environ)).toEqual({ ...theSignInEnvironment(home), PWD: home })
  expect(report.cwd).toBe(home)
  expect(report.argv).toEqual(['setup-token'])
  expect(report.tty).toBe(true)
  // The program is the leader of its own session and group, the group the adapter recorded.
  expect([report.pid, report.pgid, report.sid]).toEqual([program.seen.pgid, program.seen.pgid, program.seen.pgid])
  // dumpPrevention: the stand-in does not lower its own limit.
  expect(report.core).toEqual([0, 0])
  const url = new URL(s.service.signIn(s.ref).url)
  expect(SIGN_IN_ORIGINS).toContain(url.origin)
  expect(url.pathname).toBe('/cai/oauth/authorize')
  expect(url.searchParams.get('redirect_uri')).toBe(SIGN_IN_CALLBACKS[0])
  const { code, token } = aCode('end-to-end')
  await s.code(code)
  state = await s.until(ended)
  await s.service.settled()
  expect(s.status()).toMatchObject({ state: 'added', letter: 'C', sha12: sha(token, 12) })
  expect(readFileSync(join(p.root, 'C.token'), 'utf8')).toBe(token + '\n')
  // code: the code came in one read and Enter in the next, so the program took it as typed and not as a paste.
  expect(program.report()).toMatchObject({ reads: [{ length: code.length, enter: false }, { length: 1, enter: true }], submitted: true, pastedWithEnter: false })
  expect(await untilTrue(() => groupIsGone(program.seen.pgid), 5000), "the program's group").toBe(true)
  expect(await untilTrue(() => program.scratches().length === 0, 5000), 'the scratch home').toBe(true)
  // The pool tool was given the value on stdin, as its own cases show, and here in no argument either.
  for (const run of p.reports()) expect(run.argv.join(' ')).not.toContain(token)
})

it("protocol: the parser reads the program's own words the same at every cut, and reports each thing once", async () => {
  const program = anInventedProgram()
  const added = { available: () => true, add: async (value: Buffer) => ({ letter: 'C', sha12: sha(value, 12) }) }
  const s = aService(program.adapter, added)
  await s.start()
  await s.until(atThePrompt)
  const url = s.service.signIn(s.ref).url
  const { code, token } = aCode('cuts')
  await s.code(code)
  expect(await s.until(ended)).toMatchObject({ state: 'added' })
  const printed = Buffer.concat(program.seen.printed)
  const expected = [{ type: 'sign-in', url }, { type: 'code' }, { type: 'token', value: token }]
  for (const size of [1, 2, 3, 5, 7, 11, 13, 64, 509, printed.length]) {
    const parser = theSetupTokenParser()
    const events: unknown[] = []
    for (let at = 0; at < printed.length; at += size) events.push(...parser.feed('stdout', printed.subarray(at, at + size)))
    expect(events, `cut every ${String(size)} bytes`).toEqual(expected)
  }
  printed.fill(0)
})

it('callback: a sign-in URL from another origin, or one that sends the code anywhere else, ends the attempt as unsupported', async () => {
  for (const mode of ['another-origin', 'another-callback']) {
    const program = anInventedProgram(mode)
    const s = aService(program.adapter)
    await s.start()
    const state = await s.until(ended)
    expect(state, mode).toMatchObject({ state: 'refused', reason: 'Unsupported', canOpen: false })
    expect(() => s.service.signIn(s.ref), mode).toThrow()
    expect(await untilTrue(() => groupIsGone(program.seen.pgid), 5000), `the program's group, ${mode}`).toBe(true)
    expect(await untilTrue(() => program.scratches().length === 0, 5000), `the scratch home, ${mode}`).toBe(true)
  }
})

it('an OAuth error is read as the program declining, and the attempt ends as cancelled', async () => {
  const program = anInventedProgram('oauth-error')
  const s = aService(program.adapter)
  await s.start()
  await s.until(atThePrompt)
  const { code } = aCode('declined')
  await s.code(code)
  expect(await s.until(ended)).toMatchObject({ state: 'cancelled', reason: 'Cancelled' })
  expect(program.report().submitted).toBe(false)
  expect(await untilTrue(() => groupIsGone(program.seen.pgid), 5000), "the program's group").toBe(true)
  expect(await untilTrue(() => program.scratches().length === 0, 5000), 'the scratch home').toBe(true)
})

it("ownerWatch: the program's group is gone after a cancel, after a SIGTERM it ignores, and after the ten minutes", async () => {
  for (const how of ['cancel', 'ignore-term', 'expire']) {
    const program = anInventedProgram(how === 'ignore-term' ? 'ignore-term' : '')
    const s = aService(program.adapter)
    await s.start()
    await s.until(atThePrompt)
    // Reported before its first byte, so the cancel below cannot meet a program still to report from a removed folder.
    expect(program.seen.reportedAtFirstByte, `the report, when the program printed its first byte, before ${how}`).toBe(true)
    if (how === 'expire') {
      s.advance(PRIVATE_LOGIN_MS)
      expect(s.status(), how).toMatchObject({ state: 'refused', reason: 'Expired' })
    } else expect(s.service.cancel(s.ref), how).toMatchObject({ state: 'cancelled', reason: 'Cancelled' })
    if (how === 'ignore-term') {
      await sleep(1000)
      expect(groupIsGone(program.seen.pgid), 'a program that ignores SIGTERM, one second after it').toBe(false)
    }
    expect(await untilTrue(() => groupIsGone(program.seen.pgid), 5000), `the program's group, after ${how}`).toBe(true)
    expect(await untilTrue(() => program.scratches().length === 0, 5000), `the scratch home, after ${how}`).toBe(true)
  }
})

it('ownerWatch: the program ends when the holder that ran it is killed', async () => {
  const program = anInventedProgram()
  // A HOLDER OF ITS OWN: a Node process that runs the service and the adapter as the holder would, and says the group.
  const script = [
    `import { createPrivateLogin } from ${JSON.stringify(THE_SERVICE)}`,
    `import { theSetupTokenAdapter } from ${JSON.stringify(THE_ADAPTER)}`,
    `import { randomBytes } from 'node:crypto'`,
    `const [claude, scratchIn] = process.argv.slice(1)`,
    `const base = theSetupTokenAdapter({ claude, scratchIn })`,
    `const adapter = { ...base, start(input) { const started = base.start(input); process.stdout.write(JSON.stringify({ pgid: started.pgid }) + '\\n'); return started } }`,
    `const pool = { available: () => true, add: async () => { throw new Error('this holder saves nothing') } }`,
    `const service = createPrivateLogin({ adapter, pool })`,
    `await service.start({ version: 1, binding: randomBytes(32).toString('hex'), generation: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex') })`,
    `setInterval(() => {}, 1000)`,
  ].join('\n')
  const holder = spawn(process.execPath, ['--input-type=module', '-e', script, program.program, program.scratchIn], {
    detached: true, cwd: '/', env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (holder.pid === undefined) throw new Error('the holder of its own could not be started')
  groups.push(holder.pid)
  let said = ''
  holder.stdout.on('data', (chunk: Buffer) => { said += chunk.toString() })
  holder.stderr.on('data', (chunk: Buffer) => { said += chunk.toString() })
  await untilTrue(() => program.reported() && said.includes('\n'), 15_000)
  const pgid = Number((JSON.parse(said.split('\n')[0] ?? '{}') as { pgid?: number }).pgid)
  if (!Number.isSafeInteger(pgid) || pgid <= 1) throw new Error(`the holder of its own said no group: ${said}`)
  groups.push(pgid)
  expect(program.report().pgid).toBe(pgid)
  expect(groupIsGone(pgid)).toBe(false)
  process.kill(-holder.pid, 'SIGKILL')
  expect(await untilTrue(() => groupIsGone(pgid), 5000), "the program's group after its holder was killed").toBe(true)
})
