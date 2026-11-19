// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, card and count in this test is made up. Each server starts from a copy of this checkout in a
 * temporary folder, with its own database, its own home folder and its own free ports, and with every Mole Office
 * setting of the shell that runs the test taken away. Nothing here reaches the live office.
 *
 * A START REFUSED FOR ITS ROLE CARDS IS COUNTED BEFORE THE SERVER STOPS (wave 13r round AA). The gate
 * the-role-cards-file-is-usable is counted once when the cards cannot be used, and the refusal still stops the start,
 * with the same exit code as before the count. When the count itself fails, the start says so on its own line beside
 * the refusal, and still stops with the refusal and that exit code. A start whose cards are usable counts nothing.
 *
 * WHAT GOES RED. Control run first. Take the count out, let a failed count replace the refusal or change the exit
 * code, say nothing when the count fails, or count a start whose cards are usable, and a case here turns red.
 */
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'

const REPO = process.cwd()
const GATE = 'the-role-cards-file-is-usable'
const THE_REFUSAL = 'is not JSON, so Mole Office did not start'
const NOT_COUNTED = `The refusal below was not counted on the gate ${GATE}: `
// A refused start ends as an uncaught refusal does in Node, with exit code 1. The count must leave that as it was.
const A_REFUSED_START_EXITS_WITH = 1
const START_LIMIT_MS = 150_000

let copy = ''
let database = ''
let cards = ''
const groups = new Set<number>()

async function aFreePort(): Promise<number> {
  return new Promise((found, failed) => {
    const probe = createServer()
    probe.once('error', failed)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address !== null ? found(address.port) : failed(new Error('no port'))))
    })
  })
}

/** The shell's environment with every Mole Office setting and agent key taken away, and this test's own put in. */
async function anEnvironmentOfItsOwn(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('MOLE_OFFICE_') && name !== 'MOLE_AGENT_KEY' && !name.startsWith('VITEST')) env[name] = value
  return {
    ...env,
    HOME: join(copy, 'home'),
    MOLE_OFFICE_DB: database,
    MOLE_OFFICE_PORT: String(await aFreePort()),
    MOLE_OFFICE_REMOTE_PORT: String(await aFreePort()),
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: '127.0.0.2',
    MOLE_OFFICE_PIXEL_OFFICE: 'off',
    LOG_LEVEL: 'warn',
    NODE_ENV: 'development',
  }
}

interface AStart { code: number | null; signal: string | null; stdout: string; stderr: string }

/** Start the copy's server in a process group of its own, and wait until it ends or answers its health door. */
async function aStart(until: 'it-ends' | 'it-answers'): Promise<AStart & {stop: () => Promise<AStart>}> {
  const env = await anEnvironmentOfItsOwn()
  // The server starts no message worker, so it starts no run and writes no rules file. That is said here, after the
  // spread, where tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts reads it.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`], { cwd: copy, env: { ...env, MOLE_OFFICE_MESSAGE_WORKER: 'off' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (child.pid === undefined) throw new Error('The copy\'s server did not start a process.')
  const group = child.pid
  groups.add(group)
  let stdout = '', stderr = ''
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const ended = new Promise<AStart>((done) => child.once('exit', (code, signal) => { groups.delete(group); done({ code, signal, stdout, stderr }) }))
  const stop = async (): Promise<AStart> => {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    return ended
  }
  const by = Date.now() + START_LIMIT_MS
  if (until === 'it-ends') {
    const timer = new Promise<'late'>((late) => setTimeout(() => late('late'), START_LIMIT_MS))
    const how = await Promise.race([ended, timer])
    if (how === 'late') { await stop(); throw new Error(`The copy's server neither started nor stopped within ${String(START_LIMIT_MS / 1000)}s. It said:\n${stdout}\n${stderr}`) }
    return { ...how, stop }
  }
  let ending: AStart | null = null
  void ended.then((how) => { ending = how })
  while (Date.now() < by && ending === null) {
    try {
      const health = await fetch(`http://127.0.0.1:${env.MOLE_OFFICE_PORT!}/api/health`)
      if (health.ok) return { code: null, signal: null, stdout, stderr, stop }
    } catch { /* not listening yet */ }
    await new Promise((wait) => setTimeout(wait, 250))
  }
  if (ending === null) await stop()
  throw new Error(`The copy's server did not answer its health door. It said:\n${stdout}\n${stderr}`)
}

/** The gate's count in the copy's database, read and closed again. */
function counted(): {wouldStop: number; stopped: number} {
  const db = new Database(database, { readonly: true })
  try {
    const row = db.prepare('SELECT coalesce(sum(would_stop), 0) AS wouldStop, coalesce(sum(stopped), 0) AS stopped FROM gate_counts WHERE gate = ?').get(GATE) as {wouldStop: number; stopped: number}
    return { wouldStop: row.wouldStop, stopped: row.stopped }
  } finally { db.close() }
}

beforeAll(() => {
  copy = mkdtempSync(join(tmpdir(), 'mole-office-role-cards-'))
  // src/config holds roles.json, which the copy's server reads before it serves.
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) cpSync(join(REPO, part), join(copy, part), { recursive: true })
  symlinkSync(join(REPO, 'node_modules'), join(copy, 'node_modules'))
  mkdirSync(join(copy, 'home'))
  database = join(copy, 'made-up-office.db')
  cards = join(copy, 'src', 'config', 'roles.json')
})

afterAll(() => {
  for (const group of groups) { try { process.kill(-group, 'SIGKILL') } catch { /* already ended */ } }
  if (copy !== '') rmSync(copy, { recursive: true, force: true })
})

// Mutation: take the gateMet call out of the cards' refusal at the start, or let it throw its own error instead.
it('counts a start refused for its role cards once, and still stops it with the refusal and the same exit code', async () => {
  const good = readFileSync(cards, 'utf8')
  writeFileSync(cards, '{ "made-up": "these cards are not JSON')
  try {
    const refused = await aStart('it-ends')
    expect(refused.code, `${refused.stdout}\n${refused.stderr}`).toBe(A_REFUSED_START_EXITS_WITH)
    expect(refused.stderr).toContain(THE_REFUSAL)
    expect(refused.stderr).not.toContain(NOT_COUNTED)
    expect(counted()).toEqual({ wouldStop: 1, stopped: 1 })
  } finally { writeFileSync(cards, good) }
}, START_LIMIT_MS + 30_000)

// Mutation: let the count's failure replace the refusal, change the exit code, or say nothing of the failure.
it('says beside the refusal when its count fails, and still stops with the refusal and the same exit code', async () => {
  // The made-up database, which the first case's start made, refuses this gate's count and only that. A start's first
  // zero rows still go in.
  const db = new Database(database)
  db.exec(`CREATE TRIGGER made_up_no_role_cards_count_in BEFORE INSERT ON gate_counts WHEN NEW.gate = '${GATE}' AND NEW.would_stop > 0 BEGIN SELECT RAISE(ABORT, 'Made-up: this database refuses the count.'); END;
    CREATE TRIGGER made_up_no_role_cards_count_up BEFORE UPDATE ON gate_counts WHEN NEW.gate = '${GATE}' AND NEW.would_stop > OLD.would_stop BEGIN SELECT RAISE(ABORT, 'Made-up: this database refuses the count.'); END;`)
  db.close()
  const before = counted()
  const good = readFileSync(cards, 'utf8')
  writeFileSync(cards, '{ "made-up": "these cards are not JSON')
  try {
    const refused = await aStart('it-ends')
    expect(refused.code, `${refused.stdout}\n${refused.stderr}`).toBe(A_REFUSED_START_EXITS_WITH)
    expect(refused.stderr).toContain(`${NOT_COUNTED}Made-up: this database refuses the count.`)
    expect(refused.stderr).toContain(THE_REFUSAL)
    expect(refused.stderr.indexOf(NOT_COUNTED), 'the line about the count comes before the refusal it is about').toBeLessThan(refused.stderr.indexOf(THE_REFUSAL))
    expect(counted()).toEqual(before)
  } finally { writeFileSync(cards, good) }
}, START_LIMIT_MS + 30_000)

// Mutation: count every start, and not only one whose cards are refused.
it('counts nothing for a start whose role cards are usable', async () => {
  const before = counted()
  const started = await aStart('it-answers')
  const stopped = await started.stop()
  expect(stopped.stderr).not.toContain(THE_REFUSAL)
  expect(counted()).toEqual(before)
}, START_LIMIT_MS + 30_000)
