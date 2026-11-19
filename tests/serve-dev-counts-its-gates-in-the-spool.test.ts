// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SERVE-DEV COUNTS ITS THREE GATES IN THE GATE-COUNT SPOOL, ONCE WHERE EACH STOPS A SERVER (wave 13r round AC, item 10f).
 *
 * OS-04 a-start-refusal-stops-the-retries is met when a server run ends in the start guard's refusal and serve-dev
 * starts no blind retry. OS-03 has two limits, and each is met when serve-dev stops a server that ran past it:
 * a-new-server-has-to-answer-within and migrations-have-to-finish-within. Each line's position is the whole seconds the
 * limit gave, so the Gates page can say which value stopped it.
 *
 * Every child here is a stand-in in a temporary checkout, started by the real serveDev in this process with a port and a
 * database of its own. No real office is started or signalled. The spool is the one under this test file's own home
 * (tests/a-test-writes-into-no-home-but-its-own.ts); the first case asks that before anything is counted.
 *
 * MUTATIONS, each planted alone after a control run:
 *   - take the call out of the guard-refusal branch, or give it 'block': the refusal case;
 *   - call it once more for a refusal (for example also where the run's exit is counted as a failure): the refusal case;
 *   - take either call out of stopAServerThatDoesNotAnswer, or swap the two: the migrations and answer cases;
 *   - write the limit in milliseconds, or the other limit's seconds: the migrations and answer cases.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_GATE_COUNT_SPOOL_FOLDER } from '../src/config/gate-count-spool.mjs'
import { THE_GUARD_REFUSALS_BEGIN } from '../src/config/guard-refusal.mjs'
import { theRefusalFileIn } from '../src/config/supervisor-trouble.mjs'
import { aStampOf, emptyATestsOwnSpool, theLinesIn, theSpoolUnder, type ASpoolLine } from './the-gate-count-spool-under-a-home.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(check: () => boolean, what: string, within = 30_000): Promise<void> {
  const end = Date.now() + within
  while (Date.now() < end) {
    if (check()) return
    await sleep(25)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s.`)
}

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') throw new Error('No port for the stand-in.')
      probe.close(() => done(address.port))
    })
  })
}

/**
 * The stand-in server, by how it ends. `refuses` writes the start guard's refusal and exits 1. `migrates` says its
 * migrations have begun and never finishes them. `is-silent` stays alive and never answers. The two that stay alive
 * leave when serve-dev, which started them, is gone.
 */
type Mode = 'refuses' | 'migrates' | 'is-silent'

async function aCheckoutWithAStandIn(mode: Mode) {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-serve-dev-counts-'))
  mkdirSync(join(root, 'src/server'), {recursive: true})
  mkdirSync(join(root, 'src/worker'), {recursive: true})
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const database = join(root, 'stand-in.db')
  writeFileSync(join(root, 'src/server/index.ts'), `
    // A stand-in for a test of the gate-count spool, never an office server.
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    import { THE_MIGRATIONS_BEGIN } from ${JSON.stringify(join(REPO, 'src/config/migration-markers.mjs'))}
    const mode = ${JSON.stringify(mode)}
    if (mode === 'refuses') {
      process.stderr.write('Error: ' + ${JSON.stringify(`${THE_GUARD_REFUSALS_BEGIN}USE ${database}. It is not a Mole Office database.`)} + '\\n')
      process.exit(1)
    }
    const owner = process.argv.find((arg) => arg.startsWith('--stop-with-pid='))
    if (!owner) throw new Error('The stand-in was started without an owner.')
    const starter = aWatchOnTheStarter(Number(owner.slice('--stop-with-pid='.length)))
    setInterval(() => { if (starter().state === 'gone') process.exit(0) }, 250)
    if (mode === 'migrates') process.stdout.write(THE_MIGRATIONS_BEGIN + '\\n')
  `)
  writeFileSync(join(root, 'src/worker/index.ts'), '// test stand-in worker entry\n')
  return {root, database, port: await aFreePort()}
}

/** serve-dev over the stand-in, with the two limits given in seconds, and every line it says. */
async function serveDevOver(f: Awaited<ReturnType<typeof aCheckoutWithAStandIn>>, limits: {answer: string; migrations: string}) {
  vi.stubEnv('MOLE_OFFICE_PORT', String(f.port))
  vi.stubEnv('MOLE_OFFICE_DB', f.database)
  vi.stubEnv('MOLE_OFFICE_WORKSPACE', 'default')
  vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
  vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', limits.answer)
  vi.stubEnv('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN', limits.migrations)
  vi.resetModules()
  // No stand-in here needs the forty-second drain a real server is given when serve-dev stops.
  vi.doMock('../src/config/settings.mjs', async (original) => ({
    ...(await original<typeof import('../src/config/settings.mjs')>()), SHUTDOWN_LIMIT_MS: 0,
  }))
  const {serveDev} = await import('../tools/serve-dev.mjs')
  vi.doUnmock('../src/config/settings.mjs')
  const lines: string[] = []
  const owner = await serveDev({root: f.root, writeItDown: false, say: (line: string) => lines.push(line)})
  return {owner, lines}
}

/** The lines of one gate, without their times, which the case checks apart. */
function theLinesOf(gate: string): ASpoolLine[] {
  return theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER).filter((line) => line.gate === gate)
}

const roots: string[] = []
beforeEach(() => {
  emptyATestsOwnSpool(THE_GATE_COUNT_SPOOL_FOLDER)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.doUnmock('../src/config/settings.mjs')
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
})

it('counts into the spool under this test file\'s own home', () => {
  expect(THE_GATE_COUNT_SPOOL_FOLDER).toBe(theSpoolUnder(homedir()))
  expect(homedir()).toBe(process.env.HOME)
})

// Mutation: take the call out, give it 'block', or call it a second time for one refusal.
it('counts a start the guard refused once, at remind, and nothing else', async () => {
  const f = await aCheckoutWithAStandIn('refuses')
  roots.push(f.root)
  const before = aStampOf(new Date())
  const s = await serveDevOver(f, {answer: '60', migrations: '900'})
  try {
    await until(() => existsSync(theRefusalFileIn(f.root)), 'The refusal file')
    // Long enough for a second start, if one were made, to end in the same refusal.
    await sleep(2_000)
    const after = aStampOf(new Date())
    const lines = theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)
    expect(lines.map(({gate, position, sandbox}) => ({gate, position, sandbox}))).toEqual([
      {gate: 'a-start-refusal-stops-the-retries', position: 'remind', sandbox: null},
    ])
    expect(lines[0]!.at >= before && lines[0]!.at <= after, lines[0]!.at).toBe(true)
  } finally {
    await s.owner.stop()
  }
}, 60_000)

// Mutation: take the migrations call out, swap it with the answer call, or write milliseconds.
it('counts a server stopped for its migrations once, with the seconds it was given', async () => {
  const f = await aCheckoutWithAStandIn('migrates')
  roots.push(f.root)
  const s = await serveDevOver(f, {answer: '60', migrations: '1'})
  try {
    await until(() => s.lines.some((line) => line.includes('has run its migrations for 1s and has not finished them')), 'The migrations stop')
    await until(() => s.lines.some((line) => /the server in group \d+ has exited/.test(line)), 'The stopped server\'s exit', 30_000)
    // Long enough for a second stop, if serve-dev started the server again.
    await sleep(2_000)
    expect(theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER).map(({gate, position, sandbox}) => ({gate, position, sandbox}))).toEqual([
      {gate: 'migrations-have-to-finish-within', position: '1', sandbox: null},
    ])
  } finally {
    await s.owner.stop()
  }
}, 60_000)

// Mutation: take the answer call out, swap it with the migrations call, or write milliseconds.
it('counts each of the three servers stopped for not answering, with the seconds each was given', async () => {
  const f = await aCheckoutWithAStandIn('is-silent')
  roots.push(f.root)
  const s = await serveDevOver(f, {answer: '1', migrations: '900'})
  try {
    await until(() => s.lines.some((line) => line.includes('That is 3 servers in a row stopped for not answering')), 'The third stop', 50_000)
    await sleep(2_000)
    // The stops serve-dev said, each in the sentence it says as it stops a server. A later line can quote the last one.
    const stops = s.lines.filter((line) => /^\[dev\] The server in process group \d+ did not answer within 1s of its start/.test(line))
    expect(stops).toHaveLength(3)
    expect(theLinesOf('a-new-server-has-to-answer-within').map(({position, sandbox}) => ({position, sandbox}))).toEqual([
      {position: '1', sandbox: null}, {position: '1', sandbox: null}, {position: '1', sandbox: null},
    ])
    expect(theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)).toHaveLength(3)
  } finally {
    await s.owner.stop()
  }
}, 90_000)
