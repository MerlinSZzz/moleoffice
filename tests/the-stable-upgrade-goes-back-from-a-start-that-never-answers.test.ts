// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY BACK MUST RESTORE THE OLD VERSION WHEN THE NEW START NEVER ANSWERS. On 23 November 2026 a stable upgrade's
 * new ordinary start listened and never answered its health. The way back then read that health again before it
 * stopped anything. That read failed the same way, so the way back restored nothing. The office was left on the new
 * commit, with the migrated database and no server.
 *
 * These cases say what the way back must do instead. It reads no health before it restores. It finds the start's
 * processes from /proc, under the start's gate. It records and checks their groups, then stops them by group. A start
 * whose gate has ended has nothing more to record, unless the gate's group still holds processes of the start's own,
 * which it stops by the group's id. A database holder it did not start, a process under the start that it cannot
 * identify, and a process that joined the gate's group after the gate ended still stop it before its first restore step.
 * The clock's tick rate, which the way back needs to judge an ended gate's group, is read in the upgrade's checks, so a
 * rate that cannot be read stops the upgrade before it changes anything. A resume reads it before anything else, so a
 * rate that cannot be read stops the resume with the lock, the journal and the recovery folder as the crash left them.
 *
 * The repositories, the database and the office are made up (./stable-upgrade-fixture.ts). The made-up office's
 * ordinary start on the target commit answers nothing (THE_START_THAT_NEVER_ANSWERS). Each read of its health is cut
 * after one second. The health here is read ten times, 200 ms apart, so a wait that gets no answer ends in about twelve
 * seconds. Each start that does answer has about two seconds to do so.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { theTicksSinceBoot } from '../tools/stable/stable-upgrade-processes.mjs'
import { processIdentity, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { configFor, crashTheUpgradeAt, type Boundary } from './a-closed-stable-upgrade.ts'
import { baselineIsBack, children, databaseModule, git, groups, nothingChanged, remember, snapshot, stableUpgradeFixture, stableUpgradeFixtureOwnedByAStandIn, standIns, THE_STAND_INS_LATE_CHILD, THE_START_THAT_NEVER_ANSWERS, THE_STRANGER_UNDER_THE_START, THE_SUPERVISOR_THAT_GIVES_UP, track, write } from './stable-upgrade-fixture.ts'
import { aLineThatEndsWithItsOwner, aStandInOwner, liveMembersOf, theseGroupsEndAfterASigkillOf } from './the-owner-watching-gate.ts'

type Fixture = Awaited<ReturnType<typeof stableUpgradeFixture>>
type AnEntry = { step: string, phase: string, says: string, pgid?: number, parent?: number }

/** Ten reads, 200 ms apart: a held wait ends in about twelve seconds, and a start that answers has about two. */
const THE_HEALTH = { attempts: 10, intervalMs: 200 }
/** The steps that restore something. None may run while a process the upgrade did not start holds the database. */
const THE_RESTORE_STEPS = ['recover-tag', 'recover-checkout', 'recover-artifacts', 'recover-snapshot', 'recover-database', 'recover-start']

/** A made-up office whose ordinary start on the target commit listens and never answers. */
async function aTargetThatNeverAnswers(): Promise<Fixture> {
  return theTargetNeverAnswers(await stableUpgradeFixture())
}

/** The made-up office `f`, set so that its ordinary start on the target commit listens and never answers. */
function theTargetNeverAnswers<F extends Fixture>(f: F): F {
  Object.assign(f.config.health, THE_HEALTH)
  write(join(f.stable, THE_START_THAT_NEVER_ANSWERS), f.target)
  return f
}

/** The text of `path` once `done` accepts it, read every 20 ms for up to thirty seconds. */
async function theText(path: string, done: (text: string) => boolean): Promise<string> {
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (done(text)) return text
    await delay(20)
  }
  throw new Error(`${path} was not written within thirty seconds.`)
}

/** The processes the start that never answers wrote down, each server and worker kept for the cleanup. */
async function theStartsProcesses(f: Fixture): Promise<{ server: number, supervisor: number, worker: number | null }> {
  const text = await theText(f.database + THE_START_THAT_NEVER_ANSWERS, (t) => { try { JSON.parse(t); return true } catch { return false } })
  const pids = JSON.parse(text)
  groups.add(pids.server)
  if (pids.worker !== null) groups.add(pids.worker)
  return pids
}

/** Waits until the group `pgid` has no live process, for up to ten seconds. */
async function theGroupEnds(pgid: number) {
  const until = Date.now() + 10_000
  while (liveMembersOf(pgid).length > 0 && Date.now() < until) await delay(20)
  expect(liveMembersOf(pgid), `the processes left in group ${pgid}`).toEqual([])
}

/** Waits until the live processes of the group `pgid` are exactly `pids`, for up to ten seconds. */
async function theGroupHoldsOnly(pgid: number, pids: number[]) {
  const until = Date.now() + 10_000
  const now = () => liveMembersOf(pgid).sort((a, b) => a - b)
  const wanted = [...pids].sort((a, b) => a - b)
  while (JSON.stringify(now()) !== JSON.stringify(wanted) && Date.now() < until) await delay(20)
  expect(now(), `the processes in group ${pgid}`).toEqual(wanted)
}

/**
 * Leaves the start's stand-in alone in the gate's group, and returns its pid. The made-up serve-dev starts its stand-in
 * once its server has been stopped, and is then ended by SIGKILL, so the gate ends with it. This returns only once the
 * gate has been reaped. The gate is a child of this process, so Node reaps it here and runs its exit event at once,
 * before any other JavaScript: the upgrade has seen the gate end by then. The old version's serve-dev after the way back
 * ends with its server, as before.
 */
async function aStandInAloneInTheGatesGroup(f: Fixture, gate: number): Promise<number> {
  const { server, supervisor } = await theStartsProcesses(f)
  write(join(f.stable, THE_SUPERVISOR_THAT_GIVES_UP), 'The made-up serve-dev keeps a stand-in that answers 503 once its server ends.')
  process.kill(-server, 'SIGTERM')
  const standIn = Number(await theText(f.database + THE_SUPERVISOR_THAT_GIVES_UP, (t) => /^\d+$/.test(t)))
  await theGroupEnds(server)
  process.kill(supervisor, 'SIGKILL')
  await theGroupHoldsOnly(gate, [standIn])
  const until = Date.now() + 10_000
  while (existsSync(`/proc/${gate}`) && Date.now() < until) await delay(20)
  expect(existsSync(`/proc/${gate}`), `the gate ${gate} reaped`).toBe(false)
  rmSync(join(f.stable, THE_SUPERVISOR_THAT_GIVES_UP))
  return standIn
}

/** The name of the program of process `pid`, as the kernel keeps it in /proc/<pid>/comm. */
const theCommOf = (pid: number) => readFileSync(`/proc/${pid}/comm`, 'utf8').trim()

/**
 * The way back up to the start of the old version, which journals its own groups and topology: the journal lines after
 * the way back began, and the health reads it made.
 */
function theWayBack(entries: AnEntry[], requests: Fixture['requests'], readsAt: { recovery: number, restart: number | null }) {
  const from = entries.findIndex((e) => e.step === 'recovery' && e.phase === 'attempt')
  expect(from, 'the journal line that begins the way back').toBeGreaterThan(-1)
  const restart = entries.findIndex((e) => e.step === 'recover-start' && e.phase === 'attempt')
  const reads = requests.slice(readsAt.recovery, readsAt.restart ?? requests.length).filter((r) => ['/api/health', '/api/runtime'].includes(r.path))
  return { after: entries.slice(from + 1, restart === -1 ? entries.length : restart), reads }
}

/** Records each journal line, where the requests stood when the way back began and when it started the old version. */
function aJournalWatch(f: Fixture, also: (entry: AnEntry) => void = () => {}) {
  const entries: AnEntry[] = []
  const readsAt: { recovery: number, restart: number | null } = { recovery: -1, restart: null }
  const onJournal = (entry: AnEntry) => {
    entries.push(entry)
    if (entry.step === 'recovery' && entry.phase === 'attempt') readsAt.recovery = f.requests.length
    if (entry.step === 'recover-start' && entry.phase === 'attempt') readsAt.restart = f.requests.length
    also(entry)
  }
  return { entries, readsAt, onJournal }
}

const theHashOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

// The fault of 23 November 2026. The start listened and never answered. The way back read its health again, got no
// answer, and restored nothing. This case also catches a way back that stops only the start's own group and never
// records the server's and the worker's groups: both must be recorded under the gate, stopped and ended.
it('a start that listens and never answers is found under its gate, stopped by its groups, and the old version is back', async () => {
  const f = await aTargetThatNeverAnswers()
  const watch = aJournalWatch(f)
  let gate = 0
  const seen: { pids: Awaited<ReturnType<typeof theStartsProcesses>> | null } = { pids: null }
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'stable-check-stop' && event.phase === 'after') write(join(f.stable, '.detach-child'), 'Start a made-up detached worker.')
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') {
      seen.pids = await theStartsProcesses(f)
      // The old version's start after the way back has no worker.
      rmSync(join(f.stable, '.detach-child'))
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  await baselineIsBack(f)
  expect(gate).toBeGreaterThan(1)
  expect(seen.pids).not.toBeNull()
  const { server, worker } = seen.pids!
  expect(worker).not.toBeNull()
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made before it started the old version').toEqual([])
  expect(after.filter((e) => e.phase === 'group-recorded' && ['ordinary-server', 'ordinary-worker'].includes(e.step)).map((e) => [e.step, e.pgid, e.parent]))
    .toEqual([['ordinary-server', server, gate], ['ordinary-worker', worker, gate]])
  expect(after.some((e) => e.step === 'ordinary-topology' && e.phase === 'observed')).toBe(true)
  for (const pgid of [server, worker!]) expect(after.some((e) => e.step === `recover-stop-${pgid}` && e.phase === 'done'), `the stop of group ${pgid}`).toBe(true)
  for (const pgid of [gate, server, worker!]) expect(liveMembersOf(pgid), `the processes left in group ${pgid}`).toEqual([])
}, 240_000)

// The state the office was in on 23 November after serve-dev had stopped its server three times in a row. serve-dev
// still runs, and so does its stand-in, which answers 503 from serve-dev's own group. The server is gone. A way back
// that waits for the start's health, or that needs a server to record, restores nothing here.
it('a start whose server is gone, with serve-dev answering 503 from its own group, is stopped by that group, and the old version is back', async () => {
  const f = await aTargetThatNeverAnswers()
  const watch = aJournalWatch(f)
  let gate = 0
  let server = 0
  let standIn = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') {
      server = (await theStartsProcesses(f)).server
      write(join(f.stable, THE_SUPERVISOR_THAT_GIVES_UP), 'The made-up serve-dev keeps a stand-in that answers 503 once its server ends.')
      process.kill(-server, 'SIGTERM')
      standIn = Number(await theText(f.database + THE_SUPERVISOR_THAT_GIVES_UP, (t) => /^\d+$/.test(t)))
      await theGroupEnds(server)
      // The old version's serve-dev after the way back ends with its server, as before.
      rmSync(join(f.stable, THE_SUPERVISOR_THAT_GIVES_UP))
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  await baselineIsBack(f)
  expect(gate).toBeGreaterThan(1)
  expect(standIn).toBeGreaterThan(1)
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made before it started the old version').toEqual([])
  const said = after.find((e) => e.step === 'ordinary-topology' && e.phase === 'gate-group-only')
  expect(said?.says, 'the journal line that says every process under the gate is in its group').toContain(String(gate))
  expect(after.filter((e) => e.phase === 'group-recorded' && ['ordinary-server', 'ordinary-worker'].includes(e.step))).toEqual([])
  for (const pgid of [gate, server]) expect(liveMembersOf(pgid), `the processes left in group ${pgid}`).toEqual([])
}, 240_000)

// A process the upgrade did not start, such as an operator's sqlite3 shell or a second office, holds the database. A
// way back that reads no health must still not replace a database that a live process holds. It must stop before its
// first restore step, leave the database file as it was, leave the holder running, and name the holder.
it('a database holder the upgrade did not start stops the way back before it restores anything, and is named', async () => {
  const f = await aTargetThatNeverAnswers()
  const hashed: { before: string | null } = { before: null }
  const watch = aJournalWatch(f, (entry) => { if (entry.step === 'recovery' && entry.phase === 'attempt') hashed.before = theHashOf(f.database) })
  const holderOwner = aStandInOwner(standIns)
  let holder = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step !== 'ordinary-start-health' || event.phase !== 'before') return
    await theStartsProcesses(f)
    const ready = join(f.folder, 'holder-ready')
    const child = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner(holderOwner)}const Database=require(${JSON.stringify(databaseModule)});const db=new Database(${JSON.stringify(f.database)});require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);process.on('SIGTERM',()=>{db.close();process.exit(0)});`], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
    groups.add(child.pid!); children.push(child); holder = child.pid!
    await theText(ready, (t) => t === 'ready')
  } }))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(holder).toBeGreaterThan(1)
  expect(result.restoreFailure).toContain('holder outside')
  expect(result.restoreFailure).toContain(`process ${holder} (`)
  expect(result.restoreFailure).toContain('restored nothing')
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made').toEqual([])
  expect(after.filter((e) => THE_RESTORE_STEPS.includes(e.step)).map((e) => `${e.step} ${e.phase}`)).toEqual([])
  expect(hashed.before).not.toBeNull()
  expect(theHashOf(f.database), 'the database file after the way back stopped').toBe(hashed.before)
  expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
  expect(snapshot(f).records).toContainEqual({ id: 'migration', value: 'candidate' })
  await theseGroupsEndAfterASigkillOf(holderOwner, [holder])
}, 240_000)

// The second way 23 November's code restores nothing. serve-dev ended with its server before the way back began, so
// the start's gate had ended too. The way back then failed at once with "An ordinary start ended before its detached
// process identities could be verified." A gate that has ended, with nothing left in its group, leaves nothing to
// record or stop, and the old version must come back.
//
// The two cases after this one are the same start with a process left in the gate's group after the gate ended: the
// start's own stand-in, which the way back must stop by the group's id, and a process that joined the group later, which
// must stop the way back.
it('a start whose gate has ended with its server and serve-dev records nothing more, and the old version is back', async () => {
  const f = await aTargetThatNeverAnswers()
  const watch = aJournalWatch(f)
  let gate = 0
  let server = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') {
      server = (await theStartsProcesses(f)).server
      process.kill(-server, 'SIGTERM')
      await theGroupEnds(server)
      await theGroupEnds(gate)
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  await baselineIsBack(f)
  expect(gate).toBeGreaterThan(1)
  expect(server).toBeGreaterThan(1)
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made before it started the old version').toEqual([])
  const said = after.find((e) => e.step === 'ordinary-topology' && e.phase === 'gate-ended')
  expect(said?.says, 'the journal line that says the gate has ended').toContain(String(gate))
  expect(after.filter((e) => e.phase === 'group-recorded' && ['ordinary-server', 'ordinary-worker'].includes(e.step))).toEqual([])
  for (const pgid of [gate, server]) expect(liveMembersOf(pgid), `the processes left in group ${pgid}`).toEqual([])
}, 240_000)

// serve-dev itself was ended by SIGKILL after it had started its stand-in, as by the kernel's out-of-memory killer or by
// an operator's kill -9. The gate ended with serve-dev, and the stand-in still answers 503 from the gate's group. 23
// November's code failed at once here with "An ordinary start ended before its detached process identities could be
// verified." A way back that refuses every ended group with a live member fails the same way, and restores nothing. The
// stand-in is the start's own: it runs as this user, it started under the gate, and it is serve-dev's stand-in. The way
// back must name it, stop the group by its id, see the group end, and bring the old version back.
it('a start whose serve-dev was killed while its stand-in lives in the gate\'s group is stopped by that group, and the old version is back', async () => {
  const f = theTargetNeverAnswers(await stableUpgradeFixtureOwnedByAStandIn())
  const watch = aJournalWatch(f)
  let gate = 0
  let standIn = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') standIn = await aStandInAloneInTheGatesGroup(f, gate)
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  await baselineIsBack(f)
  expect(gate).toBeGreaterThan(1)
  expect(standIn).toBeGreaterThan(1)
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made before it started the old version').toEqual([])
  const said = after.find((e) => e.step === 'ordinary-topology' && e.phase === 'gate-ended-with-members')
  expect(said?.says, 'the journal line that names what is left in the ended gate\'s group').toContain(`process group ${gate}`)
  expect(said?.says, 'the journal line that names what is left in the ended gate\'s group').toContain(`process ${standIn} (`)
  expect(after.some((e) => e.step === `recover-stop-${gate}` && e.phase === 'done'), `the stop of group ${gate}`).toBe(true)
  expect(after.filter((e) => e.phase === 'group-recorded' && ['ordinary-server', 'ordinary-worker'].includes(e.step))).toEqual([])
  expect(liveMembersOf(gate), `the processes left in group ${gate}`).toEqual([])
}, 240_000)

// The reuse guard. As in the case before, but after the gate has ended the stand-in starts one more process in the
// gate's group. It runs the stand-in's own file, with the stand-in's own arguments, in the same checkout, so of what the
// way back reads only its start time tells it from the stand-in. A process that joined the group after the start ended
// is not the start's: the way back cannot tell what started it or what it holds. A way back that judged the members by
// their program alone would stop it, and restore beside whatever it had started. The way back must stop before its first
// restore step, leave the database file as it was, name the start's group and the process by its pid and its program's
// name, say that it restored nothing, and leave the group running.
it('a process that joined the gate\'s group after the gate ended stops the way back before it restores anything, and is named', async () => {
  const f = theTargetNeverAnswers(await stableUpgradeFixtureOwnedByAStandIn())
  const hashed: { before: string | null } = { before: null }
  const watch = aJournalWatch(f, (entry) => { if (entry.step === 'recovery' && entry.phase === 'attempt') hashed.before = theHashOf(f.database) })
  let gate = 0
  let standIn = 0
  let late = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') {
      standIn = await aStandInAloneInTheGatesGroup(f, gate)
      // The upgrade read the gate's end when it saw the gate end, before this reading. The child is started only once
      // the clock has passed this reading's tick, so its start time is after the gate's end.
      const read = theTicksSinceBoot()
      const until = Date.now() + 10_000
      while (theTicksSinceBoot() <= read && Date.now() < until) await delay(1)
      expect(theTicksSinceBoot(), 'the clock after the reading of the gate\'s end').toBeGreaterThan(read)
      write(join(f.stable, THE_STAND_INS_LATE_CHILD), 'The made-up stand-in starts one child.')
      late = Number(await theText(f.database + THE_STAND_INS_LATE_CHILD, (t) => /^\d+$/.test(t)))
      rmSync(join(f.stable, THE_STAND_INS_LATE_CHILD))
      // The child is alive and in the gate's group before this step ends, and so before the way back begins.
      await theGroupHoldsOnly(gate, [standIn, late])
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(gate).toBeGreaterThan(1)
  expect(late).toBeGreaterThan(1)
  expect(result.restoreFailure).toContain(`process group ${gate}`)
  expect(result.restoreFailure).toContain(`process ${late} (${theCommOf(late)})`)
  expect(result.cleanupFailures.join(' '), 'the cleanup after the way back stopped').not.toContain('its id was reused')
  expect(result.restoreFailure, 'a process is named by its pid and its program\'s name, never by its arguments').not.toContain('--supervisor-pid')
  expect(result.restoreFailure).toContain('restored nothing')
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made').toEqual([])
  expect(after.filter((e) => THE_RESTORE_STEPS.includes(e.step)).map((e) => `${e.step} ${e.phase}`)).toEqual([])
  expect(hashed.before).not.toBeNull()
  expect(theHashOf(f.database), 'the database file after the way back stopped').toBe(hashed.before)
  expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
  expect(snapshot(f).records).toContainEqual({ id: 'migration', value: 'candidate' })
  expect(liveMembersOf(gate).sort((a, b) => a - b), `the processes left in group ${gate}`).toEqual([standIn, late].sort((a, b) => a - b))
  await theseGroupsEndAfterASigkillOf(f.owner, [gate])
}, 240_000)

// The way back keeps the gate's end as a count of clock ticks since boot, the unit in which /proc gives each process's
// start time. A conversion that is off by a factor, that reads the wrong clock, or that rounds the wrong way makes the
// start's own stand-in look late, so the way back restores nothing, or makes a later process look the start's own, so
// the way back stops a group it does not know and restores beside it. The start time of a process started between two
// readings must fall between them.
it('the start time /proc gives a process falls between two readings of the clock taken just before and just after it is started', async () => {
  const before = theTicksSinceBoot()
  const child = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner()}setInterval(()=>{},1000)`], { stdio: 'ignore', env: { PATH: process.env.PATH } })
  children.push(child)
  const after = theTicksSinceBoot()
  expect(child.pid).toBeGreaterThan(1)
  const started = Number(processIdentity(child.pid!).startTime)
  child.kill('SIGKILL')
  expect(started, 'the start time of a process started after the first reading').toBeGreaterThanOrEqual(before)
  expect(started, 'the start time of a process started before the second reading').toBeLessThanOrEqual(after)
})

// A process under a live start that is neither its server, its worker nor its terminal holder: a child that a start
// left behind, or a process another program started under it. The way back cannot tell what it is or what it holds.
// It must not stop the start around it and restore beside it. It must stop before its first restore step, leave the
// database file as it was, name the start's group and the process, say that it restored nothing, and leave the
// process running.
it('an unknown process under a live start stops the way back before it restores anything, and is named', async () => {
  const f = theTargetNeverAnswers(await stableUpgradeFixtureOwnedByAStandIn())
  const hashed: { before: string | null } = { before: null }
  const watch = aJournalWatch(f, (entry) => { if (entry.step === 'recovery' && entry.phase === 'attempt') hashed.before = theHashOf(f.database) })
  let gate = 0
  let stranger = 0
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: async (event: any) => {
    track(event)
    if (event.step === 'stable-check-stop' && event.phase === 'after') write(join(f.stable, THE_STRANGER_UNDER_THE_START), 'Start a made-up process under the start.')
    if (event.step === 'ordinary-start' && event.phase === 'gated') gate = event.pgid
    if (event.step === 'ordinary-start-health' && event.phase === 'before') {
      await theStartsProcesses(f)
      stranger = Number(await theText(f.database + THE_STRANGER_UNDER_THE_START, (t) => /^\d+$/.test(t)))
      groups.add(stranger)
      rmSync(join(f.stable, THE_STRANGER_UNDER_THE_START))
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(gate).toBeGreaterThan(1)
  expect(stranger).toBeGreaterThan(1)
  expect(result.restoreFailure).toContain(`process group ${gate}`)
  expect(result.restoreFailure).toContain(`process ${stranger} (${theCommOf(stranger)})`)
  expect(result.restoreFailure, 'a process is named by its pid and its program\'s name, never by its arguments').not.toContain('setInterval')
  expect(result.restoreFailure).toContain('restored nothing')
  const { after, reads } = theWayBack(watch.entries, f.requests, watch.readsAt)
  expect(reads, 'the health reads the way back made').toEqual([])
  expect(after.filter((e) => THE_RESTORE_STEPS.includes(e.step)).map((e) => `${e.step} ${e.phase}`)).toEqual([])
  expect(hashed.before).not.toBeNull()
  expect(theHashOf(f.database), 'the database file after the way back stopped').toBe(hashed.before)
  expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
  expect(snapshot(f).records).toContainEqual({ id: 'migration', value: 'candidate' })
  await theseGroupsEndAfterASigkillOf(f.owner, [stranger])
}, 240_000)

/** What the made-up getconf below writes on its standard error before it fails. */
const THE_MADE_UP_GETCONF_SAYS = 'This getconf is made up, and it always fails.'
/** The sentence the upgrade refuses with when that made-up getconf is the one it runs. */
const THE_RATE_REFUSAL = `The clock's ticks a second could not be read with getconf CLK_TCK (${THE_MADE_UP_GETCONF_SAYS}), so no process's start time can be set beside the gate's end.`

/**
 * The sentence `attempt` was refused with, or null if it went through. A result that went through is remembered, so the
 * fixture ends what it started.
 */
const theRefusalOf = (attempt: Promise<any>) => attempt.then((result) => { remember(result); return null }, (error: Error) => error.message)

/**
 * RUN `body` WITH A MADE-UP getconf FIRST ON PATH: it writes THE_MADE_UP_GETCONF_SAYS on its standard error and fails.
 * The upgrade's commands take PATH from this process (bootstrapGitEnvironment), so this getconf is the one they run.
 * PATH is put back afterwards.
 */
async function withAGetconfThatFails(f: Fixture, body: () => Promise<void>) {
  const bin = join(f.folder, 'a-getconf-that-fails')
  write(join(bin, 'getconf'), `#!/bin/sh\necho '${THE_MADE_UP_GETCONF_SAYS}' >&2\nexit 1\n`)
  chmodSync(join(bin, 'getconf'), 0o755)
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
  try { await body() } finally { process.env.PATH = path }
}

// The way back needs the clock's tick rate to judge the members of an ended gate's group. If the rate were first read
// there and could not be read, the way back would restore nothing in the middle of an outage. So the upgrade reads it in
// its checks, before it changes anything, and a rate that cannot be read stops it there. The rate is read once for each
// process and kept, so this case loads the upgrade afresh: no case that ran before it has read the rate for it.
it('a tick rate that cannot be read stops the upgrade in its checks, in a dry run and a real one, with nothing changed', async () => {
  const f = await stableUpgradeFixture()
  vi.resetModules()
  const { upgradeStable: anUpgradeLoadedAfresh } = await import('../tools/stable/stable-upgrade-transaction.mjs')
  const before = snapshot(f)
  await withAGetconfThatFails(f, async () => {
    expect(await theRefusalOf(anUpgradeLoadedAfresh(f.config, { ...f.options, dry: true })), 'the dry run refused in its checks').toBe(THE_RATE_REFUSAL)
    await nothingChanged(f, before)
    expect(await theRefusalOf(anUpgradeLoadedAfresh(f.config, f.options)), 'the upgrade refused in its checks').toBe(THE_RATE_REFUSAL)
    await nothingChanged(f, before)
  })
}, 240_000)

/**
 * Each entry under `folder`, by its path inside it. A file is given with its size, its last change and a hash of its
 * bytes; anything else is given by its kind.
 */
const whatIsIn = (folder: string) => (readdirSync(folder, { recursive: true }) as string[]).sort().map((name) => {
  const path = join(folder, name), stat = lstatSync(path)
  return stat.isFile() ? `${name}: a file of ${String(stat.size)} bytes, changed at ${String(stat.mtimeMs)}, ${theHashOf(path)}` : `${name}: ${stat.isDirectory() ? 'a folder' : 'not a file or a folder'}`
})

// A resume does not run the upgrade's checks, so it reads the rate itself, at its start. It reads it before it opens the
// lock, because reading the crashed journal through the lock cuts off a torn last line, and a refusal after that cut
// would leave the journal shorter than the crash left it. So this case adds a made-up torn line before the resume. The
// crash is at `migrate done` on a run that publishes: the resume from there would start the new version, and the way
// back from that start needs the rate. As in the case above, the resume is loaded afresh.
it('a tick rate that cannot be read stops a resume at its start, with the lock, the journal and the recovery folder as the crash left them', async () => {
  const f = await stableUpgradeFixture()
  const at: Boundary = { run: 'publishing', step: 'migrate', phase: 'done', nth: 1 }
  const crash = await crashTheUpgradeAt(f, configFor(f, at.run), at)
  expect(crash.reached, crash.said).toBe(true)
  expect(crash.signal, crash.said).toBe('SIGKILL')
  const lock = join(f.stable, '.git/stable-upgrade.lock'), mark = theUpgradeMarkPath(f.database)
  // MADE UP: the start of a journal line with no end, as a crash in the middle of a write would leave it.
  appendFileSync(lock, '{"step":"a made-up torn line')
  const before = { lock: readFileSync(lock, 'utf8'), recovery: whatIsIn(f.recovery), mark: readFileSync(mark, 'utf8') }
  vi.resetModules()
  const { resumeStableUpgrade: aResumeLoadedAfresh } = await import('../tools/stable/stable-upgrade-transaction.mjs')
  await withAGetconfThatFails(f, async () => {
    expect(await theRefusalOf(aResumeLoadedAfresh(lock, f.options)), 'the resume refused at its start').toBe(THE_RATE_REFUSAL)
  })
  expect(readFileSync(lock, 'utf8'), 'the lock and the journal, with the torn line').toBe(before.lock)
  expect(whatIsIn(f.recovery), 'the recovery folder').toEqual(before.recovery)
  expect(readFileSync(mark, 'utf8'), 'the upgrade mark').toBe(before.mark)
  expect(existsSync(`${lock}.resume`), "a resume's claim").toBe(false)
}, 240_000)
