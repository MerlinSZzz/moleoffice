// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CRASHED UPGRADE REFUSES EVERY START (tools/stable/upgrade-stable.criteria.md, item 15 (b)): the restart case on a
 * made-up office, the real starts of this checkout against a made-up database that carries a mark, the boot unit's start
 * on a mark that cannot be read, and the resume's own refusals. Every database, office and checkout here is made up.
 * systemd is not run: the boot unit's start is its ExecStart, run with its Environment.
 */
import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { processIdentity, resumeStableUpgrade, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theResumeCommand, theUpgradeMarkPath, whyAnUpgradeKeepsTheOfficeClosed, writeTheUpgradeMark } from '../src/config/the-upgrade-mark.mjs'
import { candidateTag, children, folders, groups, out, port, remember, root, stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { aStartOfTheMadeUpOffice, closed, crashTheUpgradeAt, rows, unavailable } from './a-closed-stable-upgrade.ts'
import { commandUnderTheOwnerWatchingGate } from './the-owner-watching-gate.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const lockOf = (stable: string) => join(stable, '.git/stable-upgrade.lock')

it('refuses a restart after the migration and before the check with the sentence; the resume runs the verifier and the office opens', async () => {
  const f = await stableUpgradeFixture()
  const holder = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-holder`, { method: 'POST' })).json()
  groups.add(holder.pid)
  const birth = processIdentity(holder.pid).startTime
  const crash = await crashTheUpgradeAt(f, closed(f), { run: 'publishing', step: 'closed-verification', phase: 'committed-awaiting-verification', nth: 1 })
  expect(crash.reached, crash.said).toBe(true)
  expect(crash.signal).toBe('SIGKILL')
  const lock = lockOf(f.stable)
  expect(existsSync(lock)).toBe(true)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(true)
  await unavailable(f)

  const restart = await aStartOfTheMadeUpOffice(f)
  expect(restart.code, restart.stderr).toBe(1)
  expect(restart.stderr).toBe(`${whyAnUpgradeKeepsTheOfficeClosed(f.database, f.stable, 'ordinary')}\n`)
  expect(restart.stderr).toContain(`the stable upgrade from ${f.baseline} to ${f.target} (tag ${candidateTag})`)
  expect(restart.stderr).toContain(`; node ${join(f.stable, 'tools/stable/upgrade-stable.mjs')} --resume ${lock} resumes it`)
  await unavailable(f)
  expect(existsSync(join(f.folder, 'verified-phases'))).toBe(false)
  expect(processIdentity(holder.pid).startTime).toBe(birth)

  const resumed = remember(await resumeStableUpgrade(lock, f.options))
  expect(resumed.state, JSON.stringify(resumed)).toBe('published')
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\n')
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(existsSync(lock)).toBe(false)
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
  expect(processIdentity(holder.pid).startTime).toBe(birth)
  expect(existsSync(f.database + '.holder-signalled')).toBe(false)
}, 180_000)

/** A MADE-UP DATABASE AND HOME. The database's path is a folder, so a start that missed a mark could not open it either. */
function aMadeUpDatabase() {
  const folder = mkdtempSync(join(out, 'a-marked-office-')); folders.push(folder)
  const database = join(folder, 'made-up.db'), home = join(folder, 'home')
  mkdirSync(database); mkdirSync(home)
  return { folder, database, home }
}
/** A MADE-UP DATABASE THAT CARRIES A MARK. Returns the sentence a start must print and what it needs to name. */
function aMarkedDatabase() {
  const { folder, database, home } = aMadeUpDatabase(), stable = join(folder, 'made-up-stable')
  const lock = lockOf(stable)
  const mark = { from: '1'.repeat(40), to: '2'.repeat(40), tag: 'stable-2026-10-29-made-up', closedAt: '2026-10-29 09:00:00', lock, resume: theResumeCommand(stable, lock) }
  writeTheUpgradeMark(database, mark)
  return { folder, database, home, mark, sentence: `${whyAnUpgradeKeepsTheOfficeClosed(database, root, undefined)}\n` }
}
function expectTheSentence(said: string, marked: ReturnType<typeof aMarkedDatabase>) {
  expect(said).toBe(marked.sentence)
  expect(said).toContain(`from ${marked.mark.from} to ${marked.mark.to} (tag ${marked.mark.tag}) closed it at ${marked.mark.closedAt}`)
  expect(said).toContain(`; ${marked.mark.resume} resumes it`)
}
/** Runs a start to its end, at most 60 seconds, and resolves with its exit status and standard error. */
async function ended(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, detached: true, env, stdio: ['ignore', 'ignore', 'pipe'] })
  groups.add(child.pid!); children.push(child)
  let stderr = ''; child.stderr!.on('data', (b) => { stderr += b })
  const limit = setTimeout(() => { try { process.kill(-child.pid!, 'SIGTERM') } catch { /* already gone */ } }, 60_000)
  const code = await new Promise<number | null>((ok) => child.once('exit', (exit) => ok(exit)))
  clearTimeout(limit)
  return { code, stderr }
}

it("refuses this checkout's tools/serve-dev.mjs on a marked database, with the sentence and exit status 1", async () => {
  const marked = aMarkedDatabase()
  const gated = commandUnderTheOwnerWatchingGate(['tools/serve-dev.mjs', '--built', '--prepared'])
  const start = await ended(gated.command, gated.args, root, { PATH: process.env.PATH, HOME: marked.home, LANG: 'C', MOLE_OFFICE_DB: marked.database, MOLE_OFFICE_PORT: String(await port()), MOLE_OFFICE_MESSAGE_WORKER: 'off' })
  expect(start.code, start.stderr).toBe(1)
  expectTheSentence(start.stderr, marked)
}, 90_000)

it("refuses this checkout's src/server/index.ts on a marked database, with the sentence and exit status 1", async () => {
  const marked = aMarkedDatabase()
  const start = await ended(process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`], root, { PATH: process.env.PATH, HOME: marked.home, LANG: 'C', NODE_ENV: 'production', MOLE_OFFICE_DB: marked.database, MOLE_OFFICE_PORT: String(await port()), MOLE_OFFICE_MESSAGE_WORKER: 'off' })
  expect(start.code, start.stderr).toBe(1)
  expectTheSentence(start.stderr, marked)
}, 90_000)

/** A word of a unit line as systemd reads it: quotes removed, a backslash escape undone, `%%` and `$$` single again. */
const unquoted = (word: string) => word.slice(1, -1).replace(/\\(.)/g, '$1').replace(/%%/g, '%').replace(/\$\$/g, '$')

/**
 * THE START THE BOOT UNIT MAKES from a copied checkout: the unit text theStartAtLoginUnit writes there, its ExecStart run
 * with its Environment and a made-up home. The checkout's path is a real path: a paired checkout's unit names its real path.
 */
async function theBootUnitStart(made: ReturnType<typeof aMadeUpDatabase>, checkout: string) {
  const office = { PATH: process.env.PATH, HOME: made.home, MOLE_OFFICE_DB: made.database, MOLE_OFFICE_PORT: String(await port()) }
  const unit = execFileSync(process.execPath, ['--input-type=module', '-e', `import{theStartAtLoginUnit,theOfficeThisServerIs}from${JSON.stringify(join(checkout, 'src/config/start-at-login.mjs'))};process.stdout.write(theStartAtLoginUnit(theOfficeThisServerIs(process.env)))`], { cwd: made.folder, env: office, encoding: 'utf8' })
  const lines = unit.split('\n')
  const words = (lines.find((line) => line.startsWith('ExecStart='))!.slice('ExecStart='.length).match(/"(?:[^"\\]|\\.)*"/g) ?? []).map(unquoted)
  expect(words).toEqual([process.execPath, join(checkout, 'src/config/the-service-command.mjs'), 'watch'])
  const environment = Object.fromEntries(lines.filter((line) => line.startsWith('Environment=')).map((line) => {
    const setting = unquoted(line.slice('Environment='.length))
    return [setting.slice(0, setting.indexOf('=')), setting.slice(setting.indexOf('=') + 1)]
  }))
  expect(environment).toEqual({ MOLE_OFFICE_DB: made.database, MOLE_OFFICE_PORT: office.MOLE_OFFICE_PORT, PATH: office.PATH })
  // A user unit runs with the home its systemd manager gives it, and with the unit's Environment. Here that home is made up.
  const gated = commandUnderTheOwnerWatchingGate(words.slice(1))
  return ended(gated.command, gated.args, made.folder, { ...environment, HOME: made.home })
}
const theBootUnitFiles = ['src/config/start-at-login.mjs', 'src/config/the-service-command.mjs']

it('refuses the start the boot unit makes on a marked database: its ExecStart, run with its Environment, exits 1 with the sentence', async () => {
  const marked = aMarkedDatabase()
  const checkout = join(realpathSync(marked.folder), 'copied-checkout')
  copyBootstrapSettings(checkout, theBootUnitFiles)
  const start = await theBootUnitStart(marked, checkout)
  expect(start.code, start.stderr).toBe(1)
  expectTheSentence(start.stderr, marked)
}, 90_000)

/** A MARK THAT CANNOT BE READ: a crash or another version left text that is not this version's mark. */
const writeAnUnreadableMark = (database: string) => writeFileSync(theUpgradeMarkPath(database), '{"version":1,"from":"')

it("refuses the boot unit's start from a development checkout paired with a stable checkout when the mark cannot be read, naming the stable checkout's lock", async () => {
  const made = aMadeUpDatabase()
  writeAnUnreadableMark(made.database)
  const madeUpStable = join(made.folder, 'made-up-stable'); mkdirSync(join(madeUpStable, '.git'), { recursive: true })
  const checkout = join(realpathSync(made.folder), 'copied-checkout')
  copyBootstrapSettings(checkout, theBootUnitFiles)
  // The pairing as the development checkout's settings write it: the stable checkout, and the canonical database the mark is beside.
  writeFileSync(join(checkout, '.env'), `MOLE_OFFICE_STABLE_CHECKOUT=${madeUpStable}\nMOLE_OFFICE_DB=${made.database}\n`)
  const start = await theBootUnitStart(made, checkout)
  expect(start.code, start.stderr).toBe(1)
  const stable = realpathSync(madeUpStable), lock = lockOf(stable)
  expect(start.stderr).toContain(`its upgrade mark ${theUpgradeMarkPath(made.database)} cannot be read (`)
  expect(start.stderr).not.toContain(lockOf(checkout))
  expect(start.stderr).toContain(`the upgrade lock ${lock}, and ${theResumeCommand(stable, lock)} resumes that upgrade`)
  expect(start.stderr).toBe(`${whyAnUpgradeKeepsTheOfficeClosed(made.database, stable, undefined)}\n`)
}, 90_000)

it("refuses the boot unit's start from a checkout paired with no stable checkout when the mark cannot be read, and names no lock", async () => {
  const made = aMadeUpDatabase()
  writeAnUnreadableMark(made.database)
  const checkout = join(realpathSync(made.folder), 'copied-checkout')
  copyBootstrapSettings(checkout, theBootUnitFiles)
  const start = await theBootUnitStart(made, checkout)
  expect(start.code, start.stderr).toBe(1)
  expect(start.stderr).toContain(`its upgrade mark ${theUpgradeMarkPath(made.database)} cannot be read (`)
  expect(start.stderr).not.toMatch(/\/stable-upgrade\.lock/)
  expect(start.stderr).toBe(`${whyAnUpgradeKeepsTheOfficeClosed(made.database, null, undefined)}\n`)
}, 90_000)

it('refuses a resume while the program that wrote the journal runs', async () => {
  const f = await stableUpgradeFixture()
  const lock = lockOf(f.stable)
  let refused: Promise<string> | null = null
  const result = remember(await upgradeStable(closed(f), { ...f.options, onJournal(entry: any) {
    if (entry.step === 'closed-verification' && entry.phase === 'committed-awaiting-verification') {
      refused = resumeStableUpgrade(lock, f.options).then(() => 'a resume ran', (error: Error) => error.message)
    }
  } }))
  expect(await refused).toBe(`The program that wrote this journal, process ${String(process.pid)}, is still running, so the resume did not start.`)
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(rows(result.paths.journal).some((entry) => entry.step === 'resume')).toBe(false)
}, 120_000)

it('drops a last line the crash left half written and says so; a second resume beside the first is refused', async () => {
  const f = await stableUpgradeFixture()
  const crash = await crashTheUpgradeAt(f, closed(f), { run: 'publishing', step: 'migrate', phase: 'done', nth: 1 })
  expect(crash.reached, crash.said).toBe(true)
  const lock = lockOf(f.stable)
  const half = '{"sequence":9999,"step":"half-wri'
  appendFileSync(lock, half)
  let second: Promise<string> | null = null
  const resumed = remember(await resumeStableUpgrade(lock, { ...f.options, onJournal(entry: any) {
    if (second === null && entry.step === 'resume' && entry.phase === 'attempt') second = resumeStableUpgrade(lock, f.options).then(() => 'a second resume ran', (error: Error) => error.message)
  } }))
  expect(await second).toBe(`Another resume of this upgrade is running as process ${String(process.pid)}, so this one did not start.`)
  expect(resumed.state, JSON.stringify(resumed)).toBe('published')
  const resume = rows(resumed.paths.journal).filter((entry) => entry.step === 'resume' && entry.phase === 'attempt')
  expect(resume).toHaveLength(1)
  expect(resume[0].droppedTornBytes).toBe(half.length)
  expect(resume[0].says).toContain(`${String(half.length)} bytes of a last line half written`)
  expect(readFileSync(resumed.paths.journal, 'utf8')).not.toContain(half)
  expect(existsSync(lock)).toBe(false)
}, 180_000)
