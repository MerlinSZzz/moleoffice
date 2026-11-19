// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { LANDED_KEEP_PREFIX } from '../src/shared/merge/landed-history.mjs'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * tools/the-merger.mjs, AGAINST A REAL OFFICE ON ITS OWN PORT AND THROWAWAY GIT REPOSITORIES.
 *
 * Sandbox v1, test T7 of SPEC.md section 6. The tool is run as a separate process, the way the
 * message worker runs it, and every door it knocks on is the product's own — the merge queue's
 * doors, the slot doors, the record and file doors, health and runtime — served by the real app on
 * a loopback port of its own, on a throwaway database. Nothing here reaches the owner's server.
 *
 * NO STAND-IN. Every step the tool reports is decided by the real state machine (piece P7) behind the
 * real step door, and the inspector's release is posted through the real check doors by an agent
 * holding the inspector card, as P7's own test does. A small proxy in this process forwards every
 * request to the real app unchanged; it only writes down each step the office accepted, and lets a
 * test do something to the main checkout at a chosen step (somebody else landing first). Until the
 * integration of sandbox v1 this file answered the step door itself, because P7 was not built; the
 * stand-in accepted facts the real door refuses, which is how the two contracts drifted apart.
 *
 * WHAT IS PROVED by the real tool, with old state stamps checked directly by their reader:
 *
 *   1. A clean change: pinned, the lane taken, integrated with the audit-style file regenerated on
 *      top (reported as decided by regeneration, so it is not sent to the inspector), tested under
 *      the full-suite seat (waiting for a seat somebody else holds), backed up BEFORE main moved,
 *      landed by fast-forward, merged. The pinned ref is left for a secretary (R5).
 *   2. A textual conflict is reported with its files and never resolved; main does not move.
 *   3. A file the rebase changed is reported at its new content, and the office sends the entry to
 *      reinspection of exactly that file; the tool stops.
 *   4. A red file that is green alone passes, with the load recorded; a file red alone bounces.
 *   5. A generated file edited by hand fails the guard; a protected path is handed to the inspector.
 *   6. A mutation marker fails the guard. Owner content added to what ships fails its guard and bounces the entry, and
 *      the entry without it lands with the gate's reminders on data.integrated (round 31). A new private-network address
 *      in any path fails the address gate, whose words never repeat it, and the entry with a documentation address lands.
 *      A commit at the placeholder address fails the commit-address gate at block; at remind the entry lands with each
 *      such commit on data.integrated, and at off it lands with none named there (wave 13q). The office counts each of
 *      the three on the gate's row, as stopped at block and reminded at remind.
 *   7. Main moving under the entry is reported, and the tool integrates again on the new main.
 *   8. A landing interrupted after its state was persisted resumes, and one interrupted after main
 *      moved reports landed without backing up again.
 *   9. The files adapter: adds and modifies land and are read back through the office; a file
 *      whose hash moved is a conflict and is not overwritten; keep-both lands beside the original;
 *      a staged file whose bytes are not the submission bounces at the pin; a delete waits for the
 *      secretary and the tool stops before taking the lane. Each run stages its files in its own
 *      committed tree, so its seal holds the bytes the entry lands; a staged folder the seal never
 *      saw bounces at the pin as unjudged, and so does a file the files checker hands on (a type it
 *      cannot read), because no check can read a files entry again yet (sandbox v1 fix of the queue,
 *      INTEGRATION.md section 7, issues 4 and 5).
 *  10. An entry on a files seal: a run sealed from a folder with no git lands
 *      an executable file with its sealed mode, read back, and a modify of the file its release read;
 *      a held file changed after the entry was integrated stops the landing before anything is written.
 *  11. An entry's sandbox has no network (acceptance finding 77): up is asked for --network none; an up
 *      that answers another network is refused and nothing runs in it; a sandbox already running is
 *      brought down and started again with no network before anything runs in it.
 *  12. A taken backup is followed by a prune after main and migration, with its result persisted
 *      before the command. A skip takes no prune, failures still land, and resumes never prune twice.
 *
 * Every fixture is synthetic and says so: the repositories are made under `.logs/` in this
 * checkout and removed after, the records are filed as fixtures.
 *
 * TWO MORE FILES RUN THE SAME TOOL IN THE SAME WAY. tests/the-merger-suite.test.ts holds the cases about the suite the
 * tool runs, and tests/the-merger-bus.test.ts the cases about the bus. Wave 13p's round D moved them there, because
 * this file alone took up to 568 seconds, close to the 590 an agent's command may run. The set-up all three share is
 * in tests/the-merger-fixture.ts.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeDataBypassingTheGate } from './helpers.ts'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { parseStoredStamp } from '../src/shared/time.ts'
import { A_PLAIN_LOG } from '../tools/merge-tool/plain-logs.mjs'
import {
  REPO, SUITE_WORKERS, TOOL, office, t, app, api, proxyApi, base, groups, startedAGroup, signalTheGroup,
  repositoryOf, as, asWorker, asInspector, asPerson, sha256, git, scratch, aFilesRoot, write, MARKED_AUDIT_SCRIPT,
  MARKED_AUDIT, PASSING_TEST, mainCheckout, workerClone, sealedRun, submitGit, stateOf, released, pressedToLand,
  detailOf, readingOf, marksOf, hooks, beforeRecording, workdirOf, sandboxesOf, sandboxFolderOf, cloneOf, sandboxCallsOf,
  startTheTool, runTheTool, untilTheLogSays, stepsOf, factsOf, theProxySaysTheOfficeRunsFrom,
  aRealOfficeForTheMerger,
} from './the-merger-fixture.ts'

aRealOfficeForTheMerger('tests/the-merger.test.ts')

// THE PRIVATE COPY'S ADDRESS, made up here. It is set as MOLE_OFFICE_PRIVATE_ORIGIN in this test process only, and
// never in a .env file, and the tool each case starts inherits it. Without it the push reads the machine's value, from
// its environment or its .env, and the clean landing ends differently on a machine that sets none. The fixture's main
// checkout has no remote, so with this address the push stops where it reads origin's address.
const THE_COPY = 'git@github.com:quill/a-private-copy.git'
let theOldOrigin: string | undefined
beforeAll(() => {
  theOldOrigin = process.env['MOLE_OFFICE_PRIVATE_ORIGIN']
  process.env['MOLE_OFFICE_PRIVATE_ORIGIN'] = THE_COPY
})
afterAll(() => {
  if (theOldOrigin === undefined) delete process.env['MOLE_OFFICE_PRIVATE_ORIGIN']
  else process.env['MOLE_OFFICE_PRIVATE_ORIGIN'] = theOldOrigin
})

// ============================================================================ 1. clean

describe('a clean change', () => {
  // Mutation: no down before the landing.
  it('is pinned, integrated with the generated file regenerated on top, tested under the full-suite seat, backed up, fast-forwarded and merged', async () => {
    const main = mainCheckout('clean')
    const M = git(main, 'rev-parse', 'HEAD')
    const { entry, worker } = await submitGit(main, 'clean', (dir) => write(dir, { 'tests/two.test.ts': PASSING_TEST, 'src/a.txt': 'a1\na2\na3\na4\n' }))
    const commit = git(worker, 'rev-parse', 'HEAD')

    // RUN 1: submitted -> pinned, and the tool stops because the entry waits on the inspector.
    const first = await runTheTool(entry)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stepsOf(first)).toEqual(['pinned'])
    expect(factsOf(first, 'pinned')).toEqual({
      files: { 'src/a.txt': sha256('a1\na2\na3\na4\n'), 'tests/two.test.ts': sha256(PASSING_TEST) },
      main: { at: M, files: { 'src/a.txt': sha256('a1\na2\na3\n'), 'tests/two.test.ts': 'absent' } },
    })
    expect(detailOf(entry, 'pinned')).toMatchObject({ ref: `refs/mole-office/queue/${entry}`, commit, base: M })
    expect(git(main, 'rev-parse', `refs/mole-office/queue/${entry}`)).toBe(commit)
    expect(stateOf(entry)).toBe('pinned')
    expect(first.out).toContain('waits on')
    const tool = t.api.getRecord(entry)!.data['tool'] as { endedAt?: string; log: string }
    expect(tool.endedAt).toEqual(expect.any(String))
    expect(tool.log).toBe(join(workdirOf(entry), 'the-merger.log'))

    await released(entry)

    // Mutation: no down before the landing. Record the sandbox at the landing request, before main can move.
    let wasDownBeforeLanding = false
    hooks.set(entry, (step) => {
      if (step === 'landing') {
        const sandbox = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')).sandbox
        wasDownBeforeLanding = JSON.parse(readFileSync(join(sandbox.folder, 'instance.json'), 'utf8')).running === false
      }
    })

    // SOMEBODY ELSE HOLDS THE FULL-SUITE SEAT: the tool waits in line, and runs once the seat is free.
    const sleeper = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
    startedAGroup(sleeper.pid)
    const holder = t.api.createRecord({ kind: 'session', title: 'Synthetic seat holder', workspaceId: 'default', actor: { type: 'agent', id: 'mq-worker' }, origin: 'fixture', data: { state: 'running' } }).id
    const seat = await fetch(`${api}/api/slots/acquire`, {
      method: 'POST',
      headers: { ...asWorker, 'content-type': 'application/json', 'x-mole-office-session': holder },
      body: JSON.stringify({ pool: 'full-suite', pid: sleeper.pid, sessionRecordId: holder, detail: 'a synthetic suite' }),
    })
    const granted = (await seat.json()) as { slot: { state: string } }
    expect(seat.status, JSON.stringify(granted)).toBe(200)
    expect(granted.slot.state).toBe('granted')

    const { done } = startTheTool(entry)
    const logFile = join(workdirOf(entry), 'the-merger.log')
    const waitedFrom = Date.now()
    let sawWaiting = false
    while (Date.now() - waitedFrom < 60_000) {
      if (existsSync(logFile) && readFileSync(logFile, 'utf8').includes('waiting for the full-suite seat')) {
        sawWaiting = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    // THE HOLDER GOES WHATEVER THE ANSWER: a seat left held here would stall every later scenario.
    signalTheGroup(sleeper.pid!, 'SIGKILL')
    groups.delete(sleeper.pid!)
    const second = await done
    hooks.delete(entry)
    expect(wasDownBeforeLanding, 'the sandbox is down before the landing can move main').toBe(true)
    expect(sawWaiting, `the tool never said it was waiting for the seat:\n${second.out}${second.err}`).toBe(true)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const integrated = factsOf(second, 'integrated')!
    const integratedDetail = detailOf(entry, 'integrated')
    expect(integrated['mainAt']).toBe(M)
    expect(integrated['result']).not.toBe(M)
    // THE CLONE IS INSIDE THE ENTRY'S SANDBOX (acceptance finding 17), and every command of the tree
    // went through the launcher, to its end, with the plain environment and a plain log, in that folder.
    expect(integrated['clone']).toBe(cloneOf(entry))
    expect(integrated['clone'].startsWith(join(sandboxesOf(), 'merge-'))).toBe(true)
    const calls = sandboxCallsOf(entry)
    const execs = calls.filter((one) => one['verb'] === 'exec')
    expect(execs.map((one) => one['command'].slice(3 + A_PLAIN_LOG.length).join(' '))).toEqual([
      'node tools/audit.mjs',
      'npm run build', // The regenerated integrated tree, before reporting integrated.
      'npm run build', // The existing testing build.
      expect.stringMatching(new RegExp(`^npm test -- --maxWorkers=${SUITE_WORKERS} `)),
    ])
    for (const one of execs) {
      expect(one).toMatchObject({ wait: true, plainEnv: true, timeout: expect.stringMatching(/^[0-9]+$/), cwd: cloneOf(entry) })
      expect(one['command'].slice(0, 3 + A_PLAIN_LOG.length)).toEqual(['nice', '-n', '19', ...A_PLAIN_LOG])
    }
    expect(calls.find((one) => one['verb'] === 'up')).toMatchObject({ template: 'mole-office-dev', from: main, noDsh: true })
    expect(calls.at(-1)).toMatchObject({ verb: 'clear', force: true })
    // EVERY PATH THAT DIFFERS FROM MAIN IN WHAT WOULD LAND, at its sha256: the change and the regenerated table.
    expect(Object.keys(integrated['files']).sort()).toEqual(['design/AUDIT.md', 'src/a.txt', 'tests/two.test.ts'])
    expect(integrated['files']['src/a.txt']).toBe(sha256('a1\na2\na3\na4\n'))
    // THE REGENERATED FILE IS DECIDED BY REGENERATION (R4), so the office sends nothing to the inspector.
    expect(integrated['checker']['decided']).toContainEqual({ path: 'design/AUDIT.md', check: 'regenerates', ok: true, detail: expect.stringContaining('node tools/audit.mjs') })
    expect(integrated['checker']['needsJudgment']).toEqual([])
    expect(integratedDetail['touched'].sort()).toEqual(['src/a.txt', 'tests/two.test.ts'])
    expect(integratedDetail['changedSinceJudged']).toEqual([])
    expect(integratedDetail['judgedFrom']).toBe('entry.machine.judged')
    expect(integratedDetail['regenerated']).toMatchObject({ paths: ['design/AUDIT.md'], commit: integrated['result'] })
    const tested = factsOf(second, 'tested')!
    expect(tested).toMatchObject({ green: true, tip: integrated['result'], ran: 2, passed: 2, log: expect.stringContaining('suite.log') })
    // HOW FAST THE OFFICE ANSWERED ITS HEALTH WHILE THE SUITE RAN, asked by the tool and kept on the entry (the coordinator, message
    // dza6Mv2og63z; acceptance finding 64).
    // MUTATION PROOF, 24 September 2026, each alone: the tool not asking (tools/the-merger.mjs), and this goes red; the
    // office not keeping what it was told (src/server/lib/merge-state-machine.ts), and it goes red.
    const health = readingOf(entry)['machine']['tested']?.['officeHealth'] as Record<string, number> | undefined
    expect(health, "the office's health on the entry's tested field").toMatchObject({ unanswered: 0, over10s: 0, everySeconds: 15 })
    expect(health?.['answered']).toBeGreaterThan(0)
    expect(health?.['samples']).toBe(health?.['answered'])
    // AND THE MACHINE BESIDE IT, read at the same moments and kept with it (the coordinator, messages u3DdfI9rTQG8 and
    // bbD9i0YMwvMN), at a decision's request. The tool runs where this test runs, so it has
    // the same CPUs and memory; the load and the available memory move, so they are held to what can be true of any
    // machine.
    // MUTATION PROOF, 24 September 2026, each alone: the tool not reading the machine (tools/the-merger.mjs), and this
    // goes red; the office's schema not knowing the new fields (src/server/lib/merge-state-machine.ts), so the tested
    // step is refused, and this goes red.
    expect(health?.['cpus'], 'the CPUs the machine has').toBe(cpus().length)
    expect(health?.['memoryMiB'], 'the memory the machine has').toBe(Math.round(totalmem() / (1024 * 1024)))
    expect(health?.['load1Median']).toBeGreaterThanOrEqual(0)
    expect(health?.['load1Max']).toBeGreaterThanOrEqual(health?.['load1Median'] ?? Number.POSITIVE_INFINITY)
    expect(health?.['availableMemoryMiBLowest']).toBeGreaterThan(0)
    expect(health?.['availableMemoryMiBMedian']).toBeGreaterThanOrEqual(health?.['availableMemoryMiBLowest'] ?? Number.POSITIVE_INFINITY)
    expect(health?.['availableMemoryMiBMedian']).toBeLessThanOrEqual(health?.['memoryMiB'] ?? 0)
    expect(detailOf(entry, 'tested')).toMatchObject({ files: { passed: 2, failed: 0 }, slot: { id: expect.any(String), seat: 1 }, red: [] })
    expect(factsOf(second, 'landing')).toEqual({ mainAt: M })
    expect(detailOf(entry, 'landing')).toMatchObject({ mainBefore: M, final: integrated['result'], migrationsCameAlong: false })
    expect(factsOf(second, 'landed')).toEqual({ mainAfter: integrated['result'], pushFailure: expect.stringContaining('origin'), says: expect.stringContaining('backed up first') })
    expect(detailOf(entry, 'landed')).toMatchObject({ mainBefore: M, mainAfter: integrated['result'], migrated: null, health: { ok: true, officeRunsFromTheLane: false } })
    // THE OFFICE WROTE THE RECEIPT, on the entry and on the run that submitted it.
    expect(readingOf(entry)['machine']['integrated']).toMatchObject({ mainBefore: M, mainAfter: integrated['result'], rebasedTip: integrated['result'], tests: { ran: 2, passed: 2 } })

    // One tested feature commit contains both the change and the regenerated audit table.
    expect(git(main, 'rev-parse', 'HEAD')).toBe(integrated['result'])
    expect(git(main, 'rev-parse', 'HEAD^')).toBe(M)
    expect(git(main, 'rev-list', '--count', `${M}..HEAD`)).toBe('1')
    expect(git(main, 'log', '-1', '--format=%s')).toBe(t.api.getRecord(String(t.api.getRecord(entry)!.data['run']))!.title)
    expect(git(main, 'log', '-1', '--format=%B')).toContain(`Branch-tip: ${readingOf(entry)['changeset']['commit']}`)
    expect(git(main, 'rev-parse', `${LANDED_KEEP_PREFIX}${entry}`)).toBe(readingOf(entry)['changeset']['commit'])
    const theTool = `Mole Office merge queue <${THE_MERGE_TOOLS_TEST_ADDRESS}>`
    expect(git(main, 'log', '-1', '--format=%an <%ae>|%cn <%ce>')).toBe(`${theTool}|${theTool}`)

    expect(readFileSync(join(main, 'design', 'AUDIT.md'), 'utf8')).toContain('- tests/two.test.ts')
    expect(git(main, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    // THE BACKUP WAS TAKEN BEFORE MAIN MOVED: its mark names M, and there is exactly one.
    expect(marksOf(main, 'backup').map((one) => one.head)).toEqual([M])
    expect(marksOf(main, 'migrate')).toEqual([])
    expect(stateOf(entry)).toBe('merged')
    // THE SEAT WAS GIVEN BACK, and the pinned ref is left for a secretary (R5).
    const slots = (await (await fetch(`${api}/api/slots`)).json()) as { pools: { name: string; held: unknown[] }[] }
    expect(slots.pools.find((one) => one.name === 'full-suite')!.held).toEqual([])
    expect(git(main, 'rev-parse', `refs/mole-office/queue/${entry}`)).toBe(commit)
  }, 180_000)
})

// ============================================================================ 2 and 3. conflicts and changed files

describe('putting the change on top of main', () => {
  it('reports a textual conflict with its files, resolves nothing, and main does not move', async () => {
    const main = mainCheckout('conflict')
    const { entry } = await submitGit(main, 'conflict', (dir) => write(dir, { 'src/a.txt': 'a1 by the worker\na2\na3\n' }))
    // MAIN MOVES AFTER THE PIN: a conflict already there at the pin sends the entry back before it waits (round 15).
    expect((await runTheTool(entry)).code).toBe(0)
    write(main, { 'src/a.txt': 'a1 by main\na2\na3\n' })
    git(main, 'commit', '-q', '-am', 'Main moves first')
    const M = git(main, 'rev-parse', 'HEAD')
    await released(entry)
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'conflict'])
    expect(factsOf(run, 'conflict')).toMatchObject({ mainAt: M, files: ['src/a.txt'], log: join(workdirOf(entry), 'conflict.log') })
    expect(readingOf(entry)['machine']['bounced']).toMatchObject({ reason: 'conflict', files: ['src/a.txt'], mainAt: M })
    expect(stateOf(entry)).toBe('bounced')
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    expect(existsSync(join(cloneOf(entry), '.git', 'rebase-merge'))).toBe(false)
  }, 120_000)

  // WAVE 13v ROUND 15, ITEM 1: THE JOIN IS TRIED BEFORE THE WAIT. The pin replays the entry's commits onto main the way
  // the rebase will, and an entry that cannot join goes back at once, before an inspector or a suite spends time on it.
  it('sends an entry back at the pin when its commits cannot join main, naming paths and lines, and says it was never tested', async () => {
    const main = mainCheckout('cannot-join')
    const { entry } = await submitGit(main, 'cannot-join', (dir) => write(dir, { 'src/a.txt': 'a1 by the worker\na2\na3\n' }))
    write(main, { 'src/a.txt': 'a1 by main\na2\na3\n' })
    git(main, 'commit', '-q', '-am', 'Main moves first')
    const M = git(main, 'rev-parse', 'HEAD')
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(factsOf(run, 'pinned')!['cannotJoin']).toMatchObject({ mainAt: M, files: ['src/a.txt'], lines: [{ path: 'src/a.txt', ranges: '1-5' }] })
    expect(stateOf(entry)).toBe('bounced')
    const bounced = readingOf(entry)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'conflict', files: ['src/a.txt'], mainAt: M })
    expect(bounced['says']).toContain('src/a.txt at lines 1-5')
    expect(bounced['says']).toContain('The entry was never tested')
    expect(readingOf(entry)['machine']['tested'] ?? null).toBeNull()
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
  }, 120_000)

  it('names a file the rebase changed as changed, and stops for reinspection', async () => {
    const main = mainCheckout('changed')
    const { entry } = await submitGit(main, 'changed', (dir) => write(dir, { 'src/long.txt': readFileSync(join(dir, 'src/long.txt'), 'utf8').replace('line 20', 'line 20 by the worker') }))
    write(main, { 'src/long.txt': readFileSync(join(main, 'src/long.txt'), 'utf8').replace('line 1\n', 'line 1 by main\n') })
    git(main, 'commit', '-q', '-am', 'Main changes the top of the file')
    const M = git(main, 'rev-parse', 'HEAD')
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'integrated'])
    const facts = factsOf(run, 'integrated')!
    expect(detailOf(entry, 'integrated')).toMatchObject({ changedSinceJudged: ['src/long.txt'], judgedFrom: 'entry.machine.judged' })
    expect(stateOf(entry)).toBe('reinspecting')
    // THE OFFICE WORKED OUT THE SCOPE FROM THE CONTENT REPORTED, and asked for a check of that file only.
    expect(readingOf(entry)['machine']['reinspection']).toMatchObject({ only: ['src/long.txt'], needsJudgment: [] })
    expect(run.out).toContain('reinspecting')
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    // The rebased result really carries both edits.
    const shown = git(cloneOf(entry), 'show', `${String(facts['result'])}:src/long.txt`)
    expect(shown).toContain('line 1 by main')
    expect(shown).toContain('line 20 by the worker')
  }, 120_000)
})

// ============================================================================ 4. red tests

describe('a red test', () => {
  it('passes when the file is green alone right after, with the load recorded, and bounces when it is red alone too', async () => {
    const main = mainCheckout('red')
    const FLAKY = `import { existsSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
// SYNTHETIC: red the first time it runs in this tree, green from then on.
const mark = new URL('../flaky-ran.mark', import.meta.url)
it('is red once', () => {
  const ran = existsSync(mark)
  writeFileSync(mark, 'ran')
  expect(ran).toBe(true)
})
`
    const flaky = await submitGit(main, 'flaky', (dir) => write(dir, { 'tests/flaky.test.ts': FLAKY }))
    expect((await runTheTool(flaky.entry)).code).toBe(0)
    await released(flaky.entry)
    const passes = await runTheTool(flaky.entry)
    expect(passes.code, passes.err + passes.out).toBe(0)
    expect(stepsOf(passes)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const tested = factsOf(passes, 'tested')!
    expect(tested['green']).toBe(true)
    expect(tested['says']).toContain('tests/flaky.test.ts green alone (load ')
    const testedDetail = detailOf(flaky.entry, 'tested')
    expect(testedDetail['files']).toMatchObject({ failed: 1 })
    // ITS LOCK IS THIS CHECKOUT'S INSTALL, whatever that is; what a lock keeps is proved in its own test file.
    expect(testedDetail['red']).toEqual([
      { file: 'tests/flaky.test.ts', alone: 'green', load1: expect.any(Number), load5: expect.any(Number), load15: expect.any(Number), log: expect.any(String), report: expect.any(String), lock: expect.any(Object) },
    ])
    expect(stateOf(flaky.entry)).toBe('merged')

    const BROKEN = `import { expect, it } from 'vitest'
it('is red', () => { expect(1).toBe(2) })
`
    const broken = await submitGit(main, 'broken', (dir) => write(dir, { 'tests/broken.test.ts': BROKEN }))
    expect((await runTheTool(broken.entry)).code).toBe(0)
    await released(broken.entry)
    const M = git(main, 'rev-parse', 'HEAD')
    const bounces = await runTheTool(broken.entry)
    expect(bounces.code, bounces.err + bounces.out).toBe(0)
    expect(stepsOf(bounces)).toEqual(['integrating', 'integrated', 'tested'])
    const red = factsOf(bounces, 'tested')!
    expect(red['green']).toBe(false)
    expect(red['redTests']).toEqual(['tests/broken.test.ts'])
    expect(readingOf(broken.entry)['machine']['bounced']).toMatchObject({ reason: 'red', redTests: ['tests/broken.test.ts'] })
    // The flaky file merged above is red once more in this fresh clone and green alone; the broken one is red alone too.
    expect(detailOf(broken.entry, 'tested')['red']).toEqual([
      expect.objectContaining({ file: 'tests/broken.test.ts', alone: 'red', load1: expect.any(Number) }),
      expect.objectContaining({ file: 'tests/flaky.test.ts', alone: 'green' }),
    ])
    expect(red['says']).toContain('tests/broken.test.ts')
    expect(stateOf(broken.entry)).toBe('bounced')
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
  }, 240_000)
})

// ============================================================================ 4a. a second opinion on Modal

// These tests cite a decision.
describe('a file red only here, asked about on Modal before the entry bounces', () => {
  // THE STAND-IN RUNNER, never the tool maintainer's real one: a process the suite started refuses to call the real runner anyway.
  const STAND_IN_MODAL = join(REPO, 'tests', 'stand-in-modal-runner.mjs')
  it('lands an entry whose file is green on Modal, kept as a load timeout, and bounces one whose file is red there too', async () => {
    const main = mainCheckout('modal')
    const home = join(base, 'modal-home')
    mkdirSync(home, { recursive: true })
    const calls = join(base, 'modal-calls.jsonl')
    const token = join(home, 'synthetic-modal.toml')
    const python = join(home, 'synthetic-python')
    writeFileSync(token, 'Synthetic token; never a credential.', { mode: 0o600 })
    writeFileSync(python, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
    const RED_HERE = `import { expect, it } from 'vitest'
// SYNTHETIC: red on this machine every time it runs.
it('is red here', () => { expect(1).toBe(2) })
`
    const env = {
      HOME: home,
      MOLE_OFFICE_MODAL_TOKEN_FILE: token,
      MOLE_OFFICE_MODAL_PYTHON: python,
      STAND_IN_MODAL_CALLS: calls,
      STAND_IN_MODAL_SAYS: JSON.stringify({ results: { '*': { 'tests/red-on-modal.test.ts': 'failed', '*': 'passed' } } }),
    }
    const flags = ['--modal-runner', STAND_IN_MODAL]

    // RED ON MODAL TOO: the entry bounces as before, and says Modal agreed.
    const bounced = await submitGit(main, 'red-on-modal', (dir) => write(dir, { 'tests/red-on-modal.test.ts': RED_HERE }))
    expect((await runTheTool(bounced.entry, env, flags)).code).toBe(0)
    await released(bounced.entry)
    const bounces = await runTheTool(bounced.entry, env, flags)
    expect(bounces.code, bounces.err + bounces.out).toBe(0)
    expect(stepsOf(bounces)).toEqual(['integrating', 'integrated', 'tested'])
    const red = factsOf(bounces, 'tested')!
    expect(red['redTests']).toEqual(['tests/red-on-modal.test.ts'])
    expect(red['says']).toContain('The second opinion on Modal did not clear: tests/red-on-modal.test.ts (red on Modal with this entry too')
    expect(stateOf(bounced.entry)).toBe('bounced')

    // GREEN ON MODAL: a file the entry brought, red alone here, is a load timeout, and the entry lands.
    const M = git(main, 'rev-parse', 'HEAD')
    const lands = await submitGit(main, 'red-only-here', (dir) => write(dir, { 'tests/red-only-here.test.ts': RED_HERE }))
    expect((await runTheTool(lands.entry, env, flags)).code).toBe(0)
    await released(lands.entry)
    const passes = await runTheTool(lands.entry, env, flags)
    expect(passes.code, passes.err + passes.out).toBe(0)
    expect(stepsOf(passes)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const tested = factsOf(passes, 'tested')!
    expect(tested['green']).toBe(true)
    expect(tested['says']).toContain('1 file(s) red alone here were green on a Modal VM, and are kept as load timeouts, not held against this entry: tests/red-only-here.test.ts')
    const loadTimeouts = [{ file: 'tests/red-only-here.test.ts', mainAt: M, here: {}, modal: { entry: { commit: expect.stringMatching(/^[0-9a-f]{40}$/u), log: expect.stringContaining('modal-entry-'), report: expect.stringContaining('modal-entry-') } } }]
    expect(tested['loadTimeouts']).toEqual(loadTimeouts)
    // KEPT ON THE ENTRY BY THE OFFICE, with both results.
    expect(readingOf(lands.entry)['machine']['tested']['loadTimeouts']).toEqual(loadTimeouts)
    expect(stateOf(lands.entry)).toBe('merged')
    // ONE CALL FOR EACH ENTRY, on its own tree; the brought file was not run on main.
    const made = readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { files: string[] })
    expect(made.map((one) => one.files)).toEqual([['tests/red-on-modal.test.ts'], ['tests/red-only-here.test.ts']])
  }, 300_000)
})

// ============================================================================ 4b. red on main too

/** Chatham's wall clock at a moment, in the stored form. */
function chathamsClock(at: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Pacific/Chatham', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(at)
}

/**
 * How far a stamp the tool wrote on Chatham's wall clock is from a moment, in ms. The stamp is read on Chatham's clock,
 * not compared with it: a stamp in the hour that comes twice names two moments, and the nearer one counts. Chatham is
 * 12:45 or 13:45 ahead of UTC, so each moment a stamp names is one of those two before the stamp read as UTC, and a
 * moment counts only if Chatham's clock writes it back as the stamp. The shared reader is not used: it looks for the
 * zone's offset only half a day either side, and more than twelve hours ahead of UTC that can miss the change.
 */
function awayFromChathamsClock(stamp: string, now: number): number {
  const asIfUtc = Date.parse(`${stamp.replace(' ', 'T')}Z`)
  const readings = [12.75, 13.75].map((hours) => asIfUtc - hours * 3_600_000).filter((ms) => chathamsClock(ms) === stamp)
  return Math.min(...readings.map((one) => Math.abs(one - now)))
}

describe('a test red on main as well (acceptance finding 18)', () => {
  // THE BUILD SHERIFF THIS TEST NAMES, read by the office in this process (MOLE_OFFICE_BUILD_SHERIFF).
  beforeAll(() => {
    process.env['MOLE_OFFICE_BUILD_SHERIFF'] = 'mq-inspector'
  })
  afterAll(() => {
    delete process.env['MOLE_OFFICE_BUILD_SHERIFF']
  })
  it('is not held against the entry, while a new failure in the same file is', async () => {
    const main = mainCheckout('red-on-main')
    const OLD_RED = `import { expect, it } from 'vitest'
// SYNTHETIC: red on main before any entry came.
it('was red before this entry', () => { expect(1).toBe(2) })
`
    write(main, { 'tests/old-red.test.ts': OLD_RED })
    execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: main })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries a red test')

    // AN ENTRY THAT DOES NOT TOUCH IT: the file is red, red alone, and red on main alone, test for test.
    const quiet = await submitGit(main, 'quiet', (dir) => write(dir, { 'src/a.txt': 'a1\na2\n' }))
    expect((await runTheTool(quiet.entry)).code).toBe(0)
    await released(quiet.entry)
    const M = git(main, 'rev-parse', 'HEAD')
    // IN A ZONE FAR FROM UTC, so a UTC value in the local form cannot pass for local time (the check below).
    const passes = await runTheTool(quiet.entry, { TZ: 'Pacific/Chatham' })
    expect(passes.code, passes.err + passes.out).toBe(0)
    expect(stepsOf(passes)).toEqual(['integrating', 'integrated', 'red-on-main', 'tested', 'landing', 'landed'])
    // A FILE RED ON MAIN ALONE GOES TO THE BUILD SHERIFF (item 4 of a decision, wave 13p round 19): the office files
    // one open problem for it, and the entry still lands. MUTATION PROOF in the commit message: the
    // red-on-main step not reported, and this goes red here.
    const sheriffs = () => t.api.listRecords({ workspaceId: 'default', kind: 'problem' }).filter((one) => one.title === "Red on main, and no merge entry's: tests/old-red.test.ts")
    expect(sheriffs()).toHaveLength(1)
    expect(sheriffs()[0]!.data).toMatchObject({ state: 'open', whose_move: 'agent', seen_in: ['tests/old-red.test.ts'], extra: { buildSheriff: 'mq-inspector', mainAt: M, mergeEntry: quiet.entry } })
    // THE FILE CARRIES THE FAILURE LINES OF ITS RUN ON MAIN, read from that run's real vitest log, and the problem keeps them
    // (the coordinator bkz8lMSIr2Dz; 13u round 180). MUTATION: send the file without them, or read another run's log, and this goes red.
    const sentOnMain = factsOf(passes, 'red-on-main') as { files: { log: string }[] } | null
    const mainLog = String(sentOnMain?.files[0]?.log)
    const failed = ' FAIL  tests/old-red.test.ts > was red before this entry'
    // Outside an agent vitest writes its colour codes into the log as well, so the log is read without them.
    const failedAt = stripVTControlCharacters(readFileSync(mainLog, 'utf8')).split(/\r?\n/).indexOf(failed)
    expect(failedAt, mainLog).toBeGreaterThanOrEqual(0)
    const failureLines = { log: mainLog, found: 'blocks', blocks: [{ line: failedAt + 1, lines: expect.arrayContaining([failed, expect.stringContaining('AssertionError: expected 1 to be 2')]), cut: expect.any(Boolean) }], leftOut: 0 }
    expect(sentOnMain).toEqual({ mainAt: M, files: [{ file: 'tests/old-red.test.ts', log: expect.stringContaining('main-rerun-1.log'), failureLines }] })
    expect(sheriffs()[0]!.data['extra']).toMatchObject({ log: mainLog, failureLines })
    expect(readingOf(quiet.entry)['machine']['redOnMain']).toEqual([expect.objectContaining({ file: 'tests/old-red.test.ts', problem: sheriffs()[0]!.id })])
    const tested = factsOf(passes, 'tested')!
    expect(tested['green']).toBe(true)
    expect(tested['says']).toContain(`fails on main ${M.slice(0, 12)} alone too`)
    expect(tested['says']).toContain('tests/old-red.test.ts')
    expect(detailOf(quiet.entry, 'tested')['redOnMainToo']).toEqual([{ file: 'tests/old-red.test.ts', mainAt: M, log: expect.stringContaining('main-rerun-1.log'), failing: ['was red before this entry'], measuredBy: quiet.entry }])
    // MAIN'S KEPT RESULT FOR THE FILE IS STAMPED IN LOCAL WALL-CLOCK TIME, as the tool's other files are (acceptance
    // findings 61 and 63; the inspector's first note on finding 61's release, which found this line unproved).
    // MUTATION PROOF, 24 September 2026, alone in tools/the-merger.mjs: keepTheResultOnMain stamped with toISOString()
    // again, and this goes red.
    const keptOnMain = JSON.parse(readFileSync(join(dirname(workdirOf(quiet.entry)), 'main-alone', M, `${sha256('tests/old-red.test.ts').slice(0, 32)}.json`), 'utf8')) as { at: string }
    expect(parseStoredStamp(keptOnMain.at), `main's kept result is stamped ${keptOnMain.at}`).not.toBeNull()
    // AND IT IS THE TOOL'S OWN LOCAL TIME, not UTC written in the local form, the defect what-a-read-writes.mjs had (the
    // inspector's note on finding 63's release): the tool ran in Pacific/Chatham, twelve and three-quarter hours from
    // UTC, so a UTC value would be half a day from Chatham's clock.
    // MUTATION PROOF, 24 September 2026, alone in tools/the-merger.mjs: stamp() writing UTC in the local form, and this
    // goes red here while the shape above still passes.
    const now = Date.now()
    expect(awayFromChathamsClock(keptOnMain.at, now), `kept at ${keptOnMain.at}, Chatham's clock now ${chathamsClock(now)}`).toBeLessThan(15 * 60_000)
    // MAIN WAS BUILT AND RUN IN THE SAME SANDBOX, in a clone of its own at M. The stand-in says which commit each command
    // ran on, because the clone is gone by now: the entry merged, and the clear takes work/main (5 October 2026).
    const mainClone = join(sandboxFolderOf(quiet.entry), 'work', 'main')
    const onMain = sandboxCallsOf(quiet.entry).filter((one) => one['verb'] === 'exec' && one['cwd'] === mainClone)
    expect(onMain.map((one) => one['command'].slice(3, 6 + A_PLAIN_LOG.length).join(' '))).toEqual(
      ['npm run build', 'npm test --'].map((command) => [...A_PLAIN_LOG, command].join(' ')),
    )
    expect(onMain.map((one) => one['head'])).toEqual([M, M])
    expect(existsSync(mainClone), 'the clear took work/main once the entry merged').toBe(false)
    expect(stateOf(quiet.entry)).toBe('merged')

    // AN ENTRY THAT ADDS A FAILURE TO THE SAME FILE: main fails one test there, the entry two.
    const louder = await submitGit(main, 'louder', (dir) =>
      write(dir, { 'tests/old-red.test.ts': `${OLD_RED}it('is red with this entry', () => { expect('new').toBe('old') })\n` }),
    )
    expect((await runTheTool(louder.entry)).code).toBe(0)
    await released(louder.entry)
    const bounces = await runTheTool(louder.entry)
    expect(bounces.code, bounces.err + bounces.out).toBe(0)
    expect(stepsOf(bounces)).toEqual(['integrating', 'integrated', 'tested'])
    const red = factsOf(bounces, 'tested')!
    expect(red['green']).toBe(false)
    expect(red['redTests']).toEqual(['tests/old-red.test.ts'])
    expect(red['says']).toContain('1 test(s) fail only with this entry: is red with this entry')
    expect(detailOf(louder.entry, 'tested')['redOnMainToo']).toEqual([])
    expect(stateOf(louder.entry)).toBe('bounced')

    // A THIRD ENTRY ON THE SAME MAIN (the coordinator's item 5 of 23 September 2026): main did not move when the louder one
    // bounced, and its run of the red file alone on main was kept for that main commit. So it is read back, and main
    // is neither cloned, built nor run again for this entry.
    // MUTATION PROOF, 23 September 2026: the kept result never read back, and this goes red where main's result names
    // this entry, not the louder one, as the one that measured it: main was cloned, built and run again.
    const M2 = git(main, 'rev-parse', 'HEAD')
    const again = await submitGit(main, 'again', (dir) => write(dir, { 'tests/also-passing.test.ts': PASSING_TEST }))
    expect((await runTheTool(again.entry)).code).toBe(0)
    await released(again.entry)
    const lands = await runTheTool(again.entry)
    expect(lands.code, lands.err + lands.out).toBe(0)
    expect(stepsOf(lands)).toEqual(['integrating', 'integrated', 'red-on-main', 'tested', 'landing', 'landed'])
    // THE SAME FILE, STILL RED ON MAIN, IS NOT FILED TWICE: the open problem holds it.
    expect(sheriffs()).toHaveLength(1)
    expect(readingOf(again.entry)['machine']['redOnMain']).toEqual([expect.objectContaining({ file: 'tests/old-red.test.ts', problem: sheriffs()[0]!.id })])
    expect(factsOf(lands, 'tested')!['says']).toContain("read back from an earlier entry's run on that main")
    expect(detailOf(again.entry, 'tested')['redOnMainToo']).toEqual([{ file: 'tests/old-red.test.ts', mainAt: M2, log: expect.stringContaining('main-rerun-1.log'), failing: ['was red before this entry'], measuredBy: louder.entry }])
    const againsMain = join(sandboxFolderOf(again.entry), 'work', 'main')
    expect(sandboxCallsOf(again.entry).filter((one) => one['verb'] === 'exec' && one['cwd'] === againsMain), 'main was run again').toEqual([])
    expect(stateOf(again.entry)).toBe('merged')
  }, 420_000)
})

describe("main's kept result is read on Chatham's clock on the nights the clocks change", () => {
  // A stamp the tool wrote ten minutes before Chatham's clocks changed, read ten minutes after. They go forward from
  // 02:45 to 03:45 at 14:00 UTC on 26 September 2026, and back from 03:45 to 02:45 at 14:00 UTC on 3 April 2027. On
  // those nights the two wall clocks are seventy and fifty minutes apart though ten minutes passed, so comparing the
  // two wall clocks goes red when the case above runs across the change.
  it('is ten minutes from the clock ten minutes later, on both nights', () => {
    expect(awayFromChathamsClock('2026-09-27 02:40:00', Date.parse('2026-09-26T14:05:00Z'))).toBe(10 * 60_000)
    expect(awayFromChathamsClock('2027-04-04 03:40:00', Date.parse('2027-04-03T14:05:00Z'))).toBe(10 * 60_000)
    // AND A STAMP WRITTEN IN THE SECOND 02:55, at 14:10 UTC, which is the later of the two moments it names.
    expect(awayFromChathamsClock('2027-04-04 02:55:00', Date.parse('2027-04-03T14:20:00Z'))).toBe(10 * 60_000)
  })
})

// ============================================================================ 4c. no sandbox, no test

describe('a git entry with no sandbox to run in (acceptance finding 17)', () => {
  it('is not integrated on the host: the tool stops and says why, and nothing of the tree runs', async () => {
    const main = mainCheckout('no-docker')
    const M = git(main, 'rev-parse', 'HEAD')
    const { entry } = await submitGit(main, 'no-docker', (dir) => write(dir, { 'tests/two.test.ts': PASSING_TEST }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const callsFile = join(sandboxesOf(), 'calls.jsonl')
    const linesOf = () => (existsSync(callsFile) ? readFileSync(callsFile, 'utf8').split('\n').filter((one) => one !== '') : [])
    const before = linesOf().length
    const run = await runTheTool(entry, { STAND_IN_SANDBOX_REFUSE_UP: '1' })
    expect(run.code, run.err + run.out).toBe(1)
    expect(run.err).toContain("a git entry's code is never run on the host")
    expect(run.err).toContain('docker is not installed')
    expect(stepsOf(run)).toEqual(['integrating'])
    // Refused startup still asks for cleanup. No exec runs the entry's code, in a sandbox or anywhere.
    const calls = linesOf()
      .slice(before)
      .map((one) => JSON.parse(one) as Record<string, any>)
    expect(calls.map((one) => one['verb'])).toEqual(['status', 'up', 'down'])
    expect(calls[1]).toMatchObject({ from: main, template: 'mole-office-dev', noDsh: true })
    expect(existsSync(join(workdirOf(entry), 'clone'))).toBe(false)
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    const let_go = await app.inject({ method: 'POST', url: `/api/merge-queue/${entry}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the no-sandbox test is done with it.' } })
    expect(let_go.statusCode, let_go.body).toBe(200)
  }, 120_000)
})

// ============================================================================ 4c'. no network

describe("an entry's sandbox with no network (acceptance finding 77)", () => {
  /** The name the tool gives the entry's sandbox, worked out as tools/merge-tool/office-keeper.mjs does. */
  const sandboxNameOf = (entry: string) =>
    `merge-${entry.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 20)}-${createHash('sha256').update(entry).digest('hex').slice(0, 6)}`
  const callsFile = () => join(sandboxesOf(), 'calls.jsonl')
  /** The launcher calls for one sandbox written after the first `from` lines of calls.jsonl. */
  const callsSince = (from: number, name: string) =>
    (existsSync(callsFile()) ? readFileSync(callsFile(), 'utf8').split('\n').filter((one) => one !== '') : [])
      .slice(from)
      .map((one) => JSON.parse(one) as Record<string, any>)
      .filter((one) => one['name'] === name)
  const linesNow = () => (existsSync(callsFile()) ? readFileSync(callsFile(), 'utf8').split('\n').filter((one) => one !== '').length : 0)
  async function judged(name: string): Promise<{ main: string; entry: string }> {
    const main = mainCheckout(name)
    const { entry } = await submitGit(main, name, (dir) => write(dir, { 'tests/two.test.ts': PASSING_TEST }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    return { main, entry }
  }

  it('asks up for the network none every time it starts the sandbox', async () => {
    const { entry } = await judged('offline')
    const before = linesNow()
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    const calls = callsSince(before, sandboxNameOf(entry))
    const ups = calls.filter((one) => one['verb'] === 'up')
    expect(ups.length, JSON.stringify(calls)).toBeGreaterThan(0)
    for (const one of ups) expect(one['network']).toBe('none')
    expect(calls.some((one) => one['verb'] === 'exec')).toBe(true)
  }, 180_000)

  it('refuses a sandbox that up says came up with another network, says which, and runs nothing in it', async () => {
    const { main, entry } = await judged('host-network')
    const M = git(main, 'rev-parse', 'HEAD')
    const before = linesNow()
    const run = await runTheTool(entry, { STAND_IN_SANDBOX_NETWORK: 'host' })
    expect(run.code, run.err + run.out).toBe(1)
    expect(run.err).toContain(`The entry's sandbox ${sandboxNameOf(entry)} came up with the network "host" rather than none, so this run ran none of the tree's code in it.`)
    expect(stepsOf(run)).toEqual(['integrating'])
    // UP WAS ASKED FOR NONE; NOTHING RAN IN WHAT CAME UP, and the ending brought it down.
    const calls = callsSince(before, sandboxNameOf(entry))
    expect(calls.map((one) => one['verb'])).toEqual(['status', 'up', 'down'])
    expect(calls[1]).toMatchObject({ network: 'none' })
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    const let_go = await app.inject({ method: 'POST', url: `/api/merge-queue/${entry}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the host-network test is done with it.' } })
    expect(let_go.statusCode, let_go.body).toBe(200)
  }, 180_000)

  it('brings a sandbox already running down and starts it again with no network before it runs anything in it', async () => {
    const { main, entry } = await judged('already-running')
    const name = sandboxNameOf(entry)
    // SYNTHETIC: the stand-in's own record of a sandbox that is running, as an earlier start would leave it.
    mkdirSync(join(sandboxesOf(), name), { recursive: true })
    writeFileSync(join(sandboxesOf(), name, 'instance.json'), JSON.stringify({ template: 'mole-office-dev', from: main, running: true }))
    const before = linesNow()
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    const calls = callsSince(before, name)
    expect(calls.slice(0, 3).map((one) => one['verb']), JSON.stringify(calls)).toEqual(['status', 'down', 'up'])
    expect(calls[1]).toMatchObject({ force: true })
    expect(calls[2]).toMatchObject({ network: 'none' })
    const firstExec = calls.findIndex((one) => one['verb'] === 'exec')
    expect(firstExec).toBeGreaterThan(2)
    expect(readFileSync(run.log, 'utf8')).toContain(`sandbox ${name} was already running, and the launcher's status does not say which network it has`)
  }, 180_000)
})

// ============================================================================ 4d. the office runs from the lane

describe('a landing where the office runs from the lane (acceptance finding 19)', () => {
  it('waits until the office says it serves the landed commit, read from head.full, and lands', async () => {
    const main = mainCheckout('office-lane')
    const { entry } = await submitGit(main, 'office-lane', (dir) => write(dir, { 'src/c.txt': 'c\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    theProxySaysTheOfficeRunsFrom(main)
    try {
      const run = await runTheTool(entry)
      expect(run.code, run.err + run.out).toBe(0)
      expect(stepsOf(run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
      const final = factsOf(run, 'integrated')!['result']
      expect(detailOf(entry, 'landed')['health']).toMatchObject({ ok: true, officeRunsFromTheLane: true, serving: final })
      expect(stateOf(entry)).toBe('merged')
    } finally {
      theProxySaysTheOfficeRunsFrom(null)
    }
  }, 180_000)
})

// ============================================================================ 5 and 6. guards

describe('the guards', () => {
  it('fails a generated file edited by hand, and hands a protected path to the inspector', async () => {
    const main = mainCheckout('guard')
    const byHand = await submitGit(main, 'by-hand', (dir) => write(dir, { 'design/AUDIT.md': '# Edited by hand\n' }))
    expect((await runTheTool(byHand.entry)).code).toBe(0)
    await released(byHand.entry)
    const failed = await runTheTool(byHand.entry)
    expect(failed.code, failed.err + failed.out).toBe(0)
    expect(stepsOf(failed)).toEqual(['integrating', 'guard-failed'])
    expect(factsOf(failed, 'guard-failed')).toMatchObject({ guard: 'git-changeset', files: ['design/AUDIT.md'], detail: expect.stringContaining('regenerates'), log: expect.stringContaining('git-changeset.json') })
    expect(stateOf(byHand.entry)).toBe('bounced')

    const protectedPath = await submitGit(main, 'protected', (dir) => write(dir, { 'design/notes.md': 'A note a program cannot judge.\n' }))
    expect((await runTheTool(protectedPath.entry)).code).toBe(0)
    await released(protectedPath.entry)
    const handed = await runTheTool(protectedPath.entry)
    expect(handed.code, handed.err + handed.out).toBe(0)
    expect(stepsOf(handed)).toEqual(['integrating', 'integrated'])
    expect(factsOf(handed, 'integrated')!['checker']['needsJudgment']).toEqual([{ path: 'design/notes.md', why: expect.stringContaining('protected area') }])
    // THE OFFICE SENDS THE HANDED-ON PATH TO THE INSPECTOR, although its content is what the release read.
    expect(stateOf(protectedPath.entry)).toBe('reinspecting')
    expect(readingOf(protectedPath.entry)['machine']['reinspection']).toMatchObject({ only: ['design/notes.md'], needsJudgment: [{ path: 'design/notes.md', why: expect.stringContaining('protected area') }] })
    // AND THE LANE IS LET GO for the rest of this file, as the person would: the entry waits on a check nobody runs here.
    const let_go = await app.inject({ method: 'POST', url: `/api/merge-queue/${protectedPath.entry}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the guard test is done with it.' } })
    expect(let_go.statusCode, let_go.body).toBe(200)
  }, 180_000)

  it('fails a tree that carries an applied mutation marker', async () => {
    const main = mainCheckout('mutation')
    const { entry } = await submitGit(main, 'mutation', (dir) => write(dir, { 'src/x.mjs': '// MUTATION 1 FOR THE TEST: the check removed\nexport const x = 1\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'guard-failed'])
    expect(factsOf(run, 'guard-failed')).toMatchObject({ guard: 'mutation-markers', files: ['src/x.mjs'] })
    expect(stateOf(entry)).toBe('bounced')
  }, 120_000)

  // THE OWNER-CONTENT GATE THROUGH THE OFFICE'S STEP DOOR (wave 13v round 31; the gate is a
  // decision). An entry
  // that adds an address to a file that ships is refused before its suite and bounces with the gate's words. The same
  // change without the address, with a record id the gate only names, lands, and its reminders are on the entry's
  // receipt and on the run's, data.integrated. The address is made up, and written apart so this file holds none.
  it('refuses owner content before the suite and bounces the entry with the refusal, and lands the fixed entry with its reminders on data.integrated', async () => {
    const main = mainCheckout('owner-content')
    const address = ['tern', 'corvidmail.net'].join('@')
    const refused = await submitGit(main, 'owner-content', (dir) => write(dir, { 'src/x.mjs': `// Asked of ${address}.\nexport const x = 1\n` }))
    expect((await runTheTool(refused.entry)).code).toBe(0)
    await released(refused.entry)
    const run = await runTheTool(refused.entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'guard-failed'])
    const log = expect.stringMatching(/\/checks\/owner-content\.json$/)
    expect(factsOf(run, 'guard-failed')).toMatchObject({ guard: 'owner-content', files: ['src/x.mjs'], detail: expect.stringContaining(`src/x.mjs line 1, P3`), log })
    expect(stateOf(refused.entry)).toBe('bounced')
    const bounced = readingOf(refused.entry)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'guard', files: ['src/x.mjs'], log })
    expect(bounced['says']).toContain('The guard "owner-content" refused it.')
    expect(bounced['says']).toContain(`"${address}"`)

    const fixed = await submitGit(main, 'owner-content-fixed', (dir) => write(dir, { 'src/x.mjs': '// Asked in record Ab3dEf6hIj9k.\nexport const x = 1\n' }))
    expect((await runTheTool(fixed.entry)).code).toBe(0)
    await released(fixed.entry)
    const landed = await runTheTool(fixed.entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(stepsOf(landed)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const reminders = { reminded: 1, byPattern: { P10: 1 }, says: expect.stringContaining('src/x.mjs line 1 "Ab3dEf6hIj9k"'), log }
    expect(factsOf(landed, 'integrated')!['ownerContent']).toEqual(reminders)
    expect(readingOf(fixed.entry)['machine']['integrated']['ownerContent']).toEqual(reminders)
    expect(t.api.getRecord(String(t.api.getRecord(fixed.entry)!.data['run']))!.data['integrated']).toMatchObject({ ownerContent: reminders })
    expect(stateOf(fixed.entry)).toBe('merged')
  }, 120_000)

  // THE ADDRESS GATE THROUGH THE OFFICE'S STEP DOOR (the tool maintainer, 18 October 2026, under a
  // decision). An entry that
  // adds a private-network address to a document, a path that does not ship, is refused before its suite and bounces
  // with the gate's words, which name the file, the line and the range and never the address. The same document with an
  // address in a documentation range lands. The refused address is made up, and written apart so this file holds none.
  it('refuses a new private-network address in any path before the suite, never repeating it, and lands the entry that uses a documentation address', async () => {
    const main = mainCheckout('addresses')
    const address = [10, 44, 55, 66].join('.')
    const refused = await submitGit(main, 'addresses', (dir) => write(dir, { 'docs/x.md': `Reached at ${address}.\n` }))
    expect((await runTheTool(refused.entry)).code).toBe(0)
    await released(refused.entry)
    const run = await runTheTool(refused.entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'guard-failed'])
    const log = expect.stringMatching(/\/checks\/addresses\.json$/)
    expect(factsOf(run, 'guard-failed')).toMatchObject({ guard: 'addresses', files: ['docs/x.md'], detail: expect.stringContaining('docs/x.md line 1 column 12, a private-network address (10/8)'), log })
    expect(stateOf(refused.entry)).toBe('bounced')
    const bounced = readingOf(refused.entry)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'guard', files: ['docs/x.md'], log })
    expect(bounced['says']).toContain('The guard "addresses" refused it.')
    expect(JSON.stringify(t.api.getRecord(refused.entry)!.data)).not.toContain(address)
    expect(run.out + run.err).not.toContain(address)

    const fixed = await submitGit(main, 'addresses-fixed', (dir) => write(dir, { 'docs/x.md': 'Reached at 192.0.2.10.\n' }))
    expect((await runTheTool(fixed.entry)).code).toBe(0)
    await released(fixed.entry)
    const landed = await runTheTool(fixed.entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(stepsOf(landed)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(stateOf(fixed.entry)).toBe('merged')
  }, 120_000)

  // THE COMMIT-ADDRESS GATE'S THREE POSITIONS THROUGH THE OFFICE'S STEP DOOR (wave 13q). Each entry has one commit whose
  // author is at the placeholder domain, the domain of MOLE_OFFICE_COMMIT_EMAIL's declared default, and one by the
  // worker. At block, the default, it bounces with the gate's words. At remind it lands, the tool's log says so, and the
  // commit is on the integrated step, on the entry's reading and on both receipts. At off it lands, only the tool's log
  // names the commit, and the gate says it stopped nothing. The address is built from the declared default, so this file
  // holds none. The office counts each of the three entries on the gate's row as one the gate would stop, and as stopped
  // at block and reminded at remind. The count is read from the office's own table after each run. The entries this
  // file landed before this case had no commit at the placeholder, and none of them was counted.
  it('bounces an entry with a commit at the placeholder at block, lands it at remind with the commit on data.integrated, and lands it at off with none named', async () => {
    const declared = String(settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback)
    const domain = declared.slice(declared.lastIndexOf('@') + 1).toLowerCase()
    const atThePlaceholder = `round@${domain}`
    const main = mainCheckout('placeholder-commits')
    const withAPlaceholderCommit = (name: string) => (dir: string): void => {
      write(dir, { [`src/${name}-a.mjs`]: 'export const a = 1\n' })
      git(dir, 'add', '-A')
      execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `A commit at the placeholder at ${name}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...withoutInheritedEffort(), ...aTestIdentity('Synthetic worker', 'worker'), GIT_AUTHOR_NAME: 'Synthetic round', GIT_AUTHOR_EMAIL: atThePlaceholder },
      })
      write(dir, { [`src/${name}-b.mjs`]: 'export const b = 1\n' })
    }
    const throughTheQueue = async (name: string, position: string | null) => {
      const env: Record<string, string> = position === null ? {} : { MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES: position }
      const { entry } = await submitGit(main, `placeholder-${name}`, withAPlaceholderCommit(name))
      expect((await runTheTool(entry, env)).code).toBe(0)
      await released(entry)
      const run = await runTheTool(entry, env)
      expect(run.code, run.err + run.out).toBe(0)
      return { entry, run, said: readFileSync(run.log, 'utf8') }
    }
    const log = expect.stringMatching(/\/checks\/commit-addresses\.json$/)
    const { gateCountsReading } = await import('../src/server/lib/gate-counts.ts')
    const counted = () => gateCountsReading().get('placeholder-addresses')?.sinceCountingBegan
    expect(counted()).toBeUndefined()

    const blocked = await throughTheQueue('block', null)
    expect(stepsOf(blocked.run)).toEqual(['integrating', 'guard-failed'])
    expect(factsOf(blocked.run, 'guard-failed')).toMatchObject({ guard: 'commit-addresses', files: [], detail: expect.stringContaining(`its author is ${atThePlaceholder}, its committer is at another domain`), log })
    expect(stateOf(blocked.entry)).toBe('bounced')
    expect(readingOf(blocked.entry)['machine']['bounced']['says']).toContain('The guard "commit-addresses" refused it.')
    expect(counted()).toEqual({ wouldStop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 0 })

    const reminded = await throughTheQueue('remind', 'remind')
    expect(stepsOf(reminded.run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(stateOf(reminded.entry)).toBe('merged')
    const retainedReplay = git(main, 'log', '-1', '--format=%B').match(/^Replayed-tip: ([0-9a-f]{40,64})$/m)?.[1]
    expect(retainedReplay).toMatch(/^[0-9a-f]{40,64}$/)
    const landedCommit = git(main, 'log', '--format=%H', '-F', '--grep=A commit at the placeholder at remind', retainedReplay!)
    expect(landedCommit).toMatch(/^[0-9a-f]{40}$/)
    const carried = { position: 'remind', domain, commits: [{ commit: landedCommit, author: atThePlaceholder, committer: null }], log }
    expect(factsOf(reminded.run, 'integrated')!['placeholderCommits']).toEqual(carried)
    expect(readingOf(reminded.entry)['machine']['integrated']['placeholderCommits']).toEqual(carried)
    expect(t.api.getRecord(reminded.entry)!.data['integrated']).toMatchObject({ placeholderCommits: carried })
    expect(t.api.getRecord(String(t.api.getRecord(reminded.entry)!.data['run']))!.data['integrated']).toMatchObject({ placeholderCommits: carried })
    expect(reminded.said).toContain(`MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is at remind, so the entry goes on with 1 commit at the placeholder domain ${domain}`)
    expect(reminded.said).toContain(`${landedCommit}: its author is ${atThePlaceholder}`)
    expect(counted()).toEqual({ wouldStop: 2, stopped: 1, reminded: 1, ignored: 0, heeded: 0 })

    const off = await throughTheQueue('off', 'off')
    expect(stepsOf(off.run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(stateOf(off.entry)).toBe('merged')
    expect(factsOf(off.run, 'integrated')).not.toHaveProperty('placeholderCommits')
    expect(t.api.getRecord(off.entry)!.data['integrated']).not.toHaveProperty('placeholderCommits')
    expect(off.said).toContain('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is off, so the commit-address gate stopped nothing.')
    expect(off.said).toContain(`its author is ${atThePlaceholder}`)
    expect(counted()).toEqual({ wouldStop: 3, stopped: 1, reminded: 1, ignored: 0, heeded: 0 })
  }, 300_000)
})

// ============================================================================ 7. main moves

describe('main moving under the entry', () => {
  it('is reported as main-moved, and the tool integrates again on the new main', async () => {
    const main = mainCheckout('moved')
    const { entry } = await submitGit(main, 'moved', (dir) => write(dir, { 'src/b.txt': 'b\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    let interloper: string | null = null
    hooks.set(entry, (step) => {
      // SYNTHETIC: somebody else lands on main while this entry is being tested, once.
      if (step === 'tested' && interloper === null) {
        write(main, { 'src/c.txt': 'c\n' })
        git(main, 'add', '-A')
        git(main, 'commit', '-q', '-m', 'Somebody else lands first')
        interloper = git(main, 'rev-parse', 'HEAD')
      }
    })
    const run = await runTheTool(entry)
    hooks.delete(entry)
    expect(run.code, run.err + run.out).toBe(0)
    // THE LANDING STEP IS ON THE SERVER FIRST (R6), naming the main world the entry was integrated on; the
    // compare-and-swap then finds main moved, and the office sends the entry back to take its lane again.
    expect(stepsOf(run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'main-moved', 'integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(run.steps.filter((one) => one.step === 'landing')[0]!.facts).toEqual({ mainAt: M })
    expect(factsOf(run, 'main-moved')).toEqual({ mainAt: interloper })
    const again = run.steps.filter((one) => one.step === 'integrated')[1]!.facts
    expect(again['mainAt']).toBe(interloper)
    expect(readingOf(entry)['machine']['attempts']).toBe(1)
    expect(git(main, 'rev-parse', 'HEAD')).toBe(factsOf(run, 'landed')!['mainAfter'])
    expect(git(main, 'rev-parse', 'HEAD^')).toBe(interloper)
    expect(existsSync(join(main, 'src', 'b.txt'))).toBe(true)
    expect(existsSync(join(main, 'src', 'c.txt'))).toBe(true)
    expect(stateOf(entry)).toBe('merged')
  }, 240_000)


})

describe('a pin-only run pins a submitted entry and nothing else (problem GS4-3r9FQQCv, wave 13p round 27)', () => {
  // THE MESSAGE WORKER'S PIN SLOT starts `--pin-only` while its merge slot is busy, on the tool maintainer's conditions (message
  // yf17WKvB1SCR): the entry's hold first; a submitted entry only, and never a step past pinned; no lane, no sandbox, and
  // no sweep of what ended entries left up. MUTATION PROOFS are in the commit message.
  const launcherCalls = (): number => {
    const file = join(sandboxesOf(), 'calls.jsonl')
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((one) => one !== '').length : 0
  }

  it('pins a submitted entry and stops, and calls no sandbox, takes no lane and sweeps nothing', async () => {
    const main = mainCheckout('pin-only')
    const { entry } = await submitGit(main, 'pin-only-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' }))
    // A WORKDIR BESIDE IT WITH A SANDBOX, which the sweep of a carrying run would read and count.
    const neighbour = join(dirname(workdirOf(entry)), 'pin-only-neighbour')
    mkdirSync(neighbour, { recursive: true })
    writeFileSync(join(neighbour, 'state.json'), JSON.stringify({ sandbox: { name: 'synthetic-pin-only-neighbour', folder: join(neighbour, 'gone') } }))
    try {
      const before = launcherCalls()
      const run = await runTheTool(entry, {}, ['--pin-only'])
      expect(run.code, run.err + run.out).toBe(0)
      expect(stepsOf(run)).toEqual(['pinned'])
      expect(stateOf(entry)).toBe('pinned')
      expect(launcherCalls(), 'the pin-only run called the sandbox launcher').toBe(before)
      const said = readFileSync(run.log, 'utf8')
      expect(said).toContain('this run only pins it')
      expect(said).not.toContain('clearWhenFinal mark')
      expect(said).not.toContain('sandbox sweep')
      expect(readingOf(entry)['tool']['reason']).toContain(`this run only pins, and merge entry ${entry} is now pinned`)
    } finally {
      rmSync(neighbour, { recursive: true, force: true })
    }
  }, 300_000)


})

describe("the pin reports main's content, so a path main already has needs no press (wave 13u round 96)", () => {
  // MUTATION PROOFS are in the commit message: the pin reading main's content as contentAt does, and the pin sending
  // none of it.
  it('leaves out a path that lands after a press where main already has the same content, and asks a press for the path the entry changes', async () => {
    const main = mainCheckout('press-over-main')
    const { entry } = await submitGit(main, 'press-over-main', (dir) => write(dir, { 'design/rules/kept.md': 'kept\n', 'design/rules/changed.md': 'changed\n' }))
    // MAIN MOVES PAST THE ENTRY'S BASE WITH THE SAME CONTENT AT ONE OF ITS PATHS, as when an earlier entry carried that change.
    write(main, { 'design/rules/kept.md': 'kept\n' })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Synthetic: main has one rules file of the entry already')
    const M = git(main, 'rev-parse', 'HEAD')
    const run = await runTheTool(entry, {}, ['--pin-only'])
    expect(run.code, run.err + run.out).toBe(0)
    expect(factsOf(run, 'pinned')!['main']).toEqual({ at: M, files: { 'design/rules/changed.md': 'absent', 'design/rules/kept.md': sha256('kept\n') } })
    expect(readingOf(entry)['machine']['pressToLand']).toMatchObject({ paths: ['design/rules/changed.md'], leftOut: { mainAt: M, paths: ['design/rules/kept.md'] } })
    expect(readingOf(entry)['pressToLand']).toEqual({ paths: ['design/rules/changed.md'], pressed: null })
  }, 120_000)

  it("stops the pin when a folder of main's tree cannot be read, and never reads a file in it as one main does not have", async () => {
    const main = mainCheckout('main-folder-unread')
    const { entry, worker } = await submitGit(main, 'main-folder-unread', (dir) => write(dir, { 'design/rules/kept.md': 'kept\n', 'design/rules/changed.md': 'changed\n' }))
    write(main, { 'design/rules/kept.md': 'kept\n' })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Synthetic: main has one rules file of the entry already')
    const M = git(main, 'rev-parse', 'HEAD')
    // The entry's commit is in main before the damage, so the pin does not fetch it: a fetch would stop on the damage first.
    git(main, 'fetch', '-q', '--no-tags', '--no-write-fetch-head', worker, git(worker, 'rev-parse', 'HEAD'))
    // SYNTHETIC DAMAGE: the loose object of main's folder design/rules is taken away. Main's commit and its top folder are
    // still there, so main's tree names a folder nobody can read, and the file main has there cannot be found.
    const folder = git(main, 'rev-parse', 'HEAD:design/rules')
    rmSync(join(main, '.git', 'objects', folder.slice(0, 2), folder.slice(2)))
    const run = await runTheTool(entry, {}, ['--pin-only'])
    expect(run.code, run.err + run.out).toBe(1)
    expect(run.err).toContain(`git ls-tree -r -z --full-tree --name-only ${M} in ${main} failed: error: Could not read ${folder}`)
    expect(stepsOf(run)).toEqual([])
    expect(stateOf(entry)).toBe('submitted')
  }, 120_000)

  it("stops the pin when a file main's tree names cannot be read, and never reads it as a file main does not have", async () => {
    const main = mainCheckout('main-blob-unread', { 'design/rules/old.md': 'old\n' })
    const { entry } = await submitGit(main, 'main-blob-unread', (dir) => write(dir, { 'design/rules/old.md': 'new\n' }))
    // SYNTHETIC DAMAGE: the loose object of main's copy of the file is taken away; the tree that names it is still there.
    const blob = git(main, 'rev-parse', 'HEAD:design/rules/old.md')
    rmSync(join(main, '.git', 'objects', blob.slice(0, 2), blob.slice(2)))
    const run = await runTheTool(entry, {}, ['--pin-only'])
    expect(run.code, run.err + run.out).toBe(1)
    expect(run.err).toContain(`cat-file blob ${git(main, 'rev-parse', 'HEAD')}:design/rules/old.md in ${main} failed`)
    expect(stepsOf(run)).toEqual([])
    expect(stateOf(entry)).toBe('submitted')
  }, 120_000)
})

// These tests cite a decision.
describe('exit 75 from the sandbox launcher means wait, never red (wave 13p round 19)', () => {
  // MUTATION PROOF in the commit message: runInSandbox reading exit 75 as any other exit, and this goes red where the
  // entry does not merge.
  it('keeps the entry in its place, says the launcher\'s sentence, tries again and lands', async () => {
    const main = mainCheckout('no-room')
    const { entry } = await submitGit(main, 'no-room', (dir) => write(dir, { 'src/no-room.txt': 'room\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const sentence = 'sandbox: the machine has 71.2 GB free where the sandboxes are, under the 80 GB a new build or test run needs. Nothing was started; it can start once space is freed.'
    const ran = await runTheTool(entry, { STAND_IN_SANDBOX_NO_ROOM: '2' })
    expect(ran.code, ran.err + ran.out).toBe(0)
    expect(stepsOf(ran)).toEqual(['integrating', 'no-room-to-integrate', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(ran, 'no-room-to-integrate')).toEqual({ says: sentence })
    const said = readFileSync(ran.log, 'utf8')
    expect(said).toContain(`no room: ${sentence} Nothing ran, so nothing is red`)
    expect(said).toContain('the sandbox launcher had room again')
    expect(readingOf(entry)['machine']['bounced']).toBeUndefined()
    expect(stateOf(entry)).toBe('merged')
  }, 300_000)
})


describe('a merge sandbox comes down when its entry ends, whichever run brought it up (problem dW_m4pOEqrJm)', () => {
  // MUTATION PROOF in the commit message: the ending of a run bringing down only a sandbox its own session brought up,
  // and this goes red where the sandbox is still running.
  it('is brought down by a later run that lands the entry, though an earlier run brought it up', async () => {
    const main = mainCheckout('down-by-a-later-run')
    const { entry } = await submitGit(main, 'down-by-a-later-run', (dir) => write(dir, { 'src/later.txt': 'later\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    // THE FIRST RUN IS KILLED as its green tested step is reported: it brought the sandbox up, and never brings it down.
    let accepted!: () => void
    const stepAccepted = new Promise<void>((resolve) => { accepted = resolve })
    let record!: () => void
    const mayRecord = new Promise<void>((resolve) => { record = resolve })
    beforeRecording.set(entry, async (step) => {
      if (step === 'tested') {
        accepted()
        await mayRecord
      }
    })
    const first = startTheTool(entry)
    hooks.set(entry, (step) => {
      if (step === 'tested') signalTheGroup(first.child.pid!, 'SIGKILL')
    })
    try {
      await first.done
      await stepAccepted
      hooks.delete(entry)
      // THE WORKER REPORTS THE KILLED RUN'S END when it finds the process gone (lib/worker.ts); this test does it in its place.
      const machine = await import('../src/server/lib/merge-state-machine.ts')
      machine.theMergeToolRunEnded({ workspaceId: 'default', id: entry, session: String(readingOf(entry)['tool']['session']), reason: 'Synthetic: the run was killed.', actor: office })
      const name = sandboxFolderOf(entry).split('/').pop()!
      const instance = () => JSON.parse(readFileSync(join(sandboxFolderOf(entry), 'instance.json'), 'utf8')) as { running: boolean }
      expect(instance().running, 'the killed run left its sandbox up').toBe(true)
      expect(readingOf(entry)['machine']['tested']['green']).toBe(true)

      // A step the killed run sent must never count as the next run's, even when recorded after that run starts.
      const later = startTheTool(entry)
      record()
      const second = await later.done
      expect(second.code, second.err + second.out).toBe(0)
      expect(stepsOf(second)).toEqual(['landing', 'landed'])
      expect(stateOf(entry)).toBe('merged')
      expect(readFileSync(second.log, 'utf8')).toContain(`sandbox ${name} was brought up by session`)
      expect(readFileSync(second.log, 'utf8')).toContain(`merge entry ${entry} is merged, so this run, which holds the entry, brings it down`)
      expect(instance().running, 'the sandbox is still up after its entry merged').toBe(false)
    } finally {
      record()
      beforeRecording.delete(entry)
      hooks.delete(entry)
    }
  }, 300_000)
})

// ============================================================================ 8. interrupted landing

/** The SQL and its journal row enter the synthetic branch in the same first commit. */
function addSyntheticMigration(dir: string): void {
  write(dir, {
    'drizzle/0001_synthetic.sql': '-- synthetic migration\n',
    'drizzle/meta/_journal.json': JSON.stringify({
      version: '7', dialect: 'sqlite',
      entries: [{ idx: 1, version: '6', when: 200, tag: '0001_synthetic', breakpoints: true }],
    }, null, 2) + '\n',
  })
}

describe('a landing uses the backup age only when no migration came along', () => {
  // MUTATION PROOF: accept an answer with no JSON line. This case goes red when main moves.
  it('fails before main moves when the backup prints help and exits 0 without JSON', async () => {
    const main = mainCheckout('backup-help-only')
    const { entry } = await submitGit(main, 'backup-help-only', (dir) => write(dir, { 'src/help.txt': 'synthetic change\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    writeFileSync(`${main}.backup-help-only`, '')
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).not.toBe(0)
    expect(landed.err + landed.out).toContain('no JSON skip or backup-taken report (with to)')
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    expect(state.landing.backedUp).toBeNull()
    expect(state.landing.moved).toBeNull()
    const steps = readFileSync(join(workdirOf(entry), 'steps.jsonl'), 'utf8').split('\n').filter((one) => one !== '').map((one) => JSON.parse(one))
    expect(steps.some((one) => one.step === 'landed')).toBe(false)
    expect(marksOf(main, 'backup')).toEqual([])
    expect(stateOf(entry)).toBe('landing')
  }, 180_000)

  // MUTATION PROOF: land.mjs never passes --if-older-than, and this case goes red on the requested
  // arguments and the missing skip recorded in backedUp.
  /** Mutation: prune after a skip too. The no-prune mark assertion goes red. */
  it('passes the floor without a migration and records the one-minute-old backup it relied on', async () => {
    const main = mainCheckout('recent-backup')
    const { entry } = await submitGit(main, 'recent-backup', (dir) => write(dir, { 'src/recent.txt': 'synthetic change\n' }))
    const recent = { backup: `${main}.synthetic-backup.db`, ageMinutes: 1 }
    writeFileSync(`${main}.recent-backup.json`, JSON.stringify(recent))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(JSON.parse(readFileSync(`${main}.marks/requested-backup.json`, 'utf8'))).toEqual({ args: ['--json', '--if-older-than', '60'], head: M })
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    expect(state.landing.backedUp).toMatchObject({ at: expect.any(String), log: expect.any(String), skipped: true, ...recent })
    expect(parseStoredStamp(state.landing.backedUp.at)).not.toBeNull()
    expect(git(main, 'rev-parse', 'HEAD')).toBe(state.landing.Cfinal)
    expect(git(main, 'rev-parse', 'HEAD')).not.toBe(M)
    expect(detailOf(entry, 'landed')).toMatchObject({ backup: { skipped: true, ...recent } })
    expect(factsOf(landed, 'landed')?.['says']).toContain(`backup skipped; relying on ${recent.backup}, 1.00 minutes old`)
    expect(marksOf(main, 'prune')).toEqual([])
    expect(state.landing.pruned).toBeNull()
    expect(marksOf(main, 'backup')).toEqual([])
    expect(stateOf(entry)).toBe('merged')
  }, 180_000)

  // MUTATION PROOF: pass --if-older-than even when migrationsCameAlong is true, and this case goes
  // red because the stand-in skips and the landing refuses to move main without a fresh copy.
  it('backs up without the floor when a migration brings a one-minute-old backup', async () => {
    const main = mainCheckout('migration-backup')
    const { entry } = await submitGit(main, 'migration-backup', addSyntheticMigration)
    writeFileSync(`${main}.recent-backup.json`, JSON.stringify({ backup: `${main}.synthetic-backup.db`, ageMinutes: 1 }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    // A migration lands only after a press.
    await pressedToLand(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(JSON.parse(readFileSync(`${main}.marks/requested-backup.json`, 'utf8'))).toEqual({ args: ['--json'], head: M })
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    expect(state.landing.migrationsCameAlong).toBe(true)
    expect(state.landing.backedUp).toEqual({ at: expect.any(String), log: expect.any(String), database: `${main}/synthetic-source.db` })
    expect(detailOf(entry, 'landed')).toMatchObject({ backup: state.landing.backedUp, migrationsCameAlong: true })
    expect(marksOf(main, 'backup').map((one) => one.head)).toEqual([M])
    // The migration runs before main moves (chapter 1, rule 2): main is still at M, and it runs in the clone at the final
    // commit, on the database the backup named.
    expect(marksOf(main, 'migrate').map((one) => one.head)).toEqual([M])
    expect(state.landing.migrated).toMatchObject({ beforeTheMove: true, from: state.integrated.clone, database: `${main}/synthetic-source.db` })
    expect(git(main, 'rev-parse', 'HEAD')).toBe(state.landing.Cfinal)
    expect(stateOf(entry)).toBe('merged')
  }, 180_000)

  // ONE MOVE OF THE LIVE CHECKOUT PER LANDING (wave 13v round 15, item 3). A server watching main restarts when main's
  // files change; migrated after the move, it restarts, refuses a database behind its code, and restarts again. Read
  // from the tool's own log: the migration comes first, from the clone at the final commit, and main moves once.
  // MUTATION PROOF: remove the call to migrateBeforeTheMove in tools/merge-tool/land.mjs, and this case goes red on the
  // order of the log lines and on the HEAD the migration saw.
  it('migrates from the clone before main moves, and moves main once, by its own log', async () => {
    const main = mainCheckout('migrate-before-move')
    const { entry } = await submitGit(main, 'migrate-before-move', addSyntheticMigration)
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    // A migration lands only after a press.
    await pressedToLand(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    const Cfinal = state.landing.Cfinal as string
    const lines = readFileSync(landed.log, 'utf8').split('\n')
    const migrating = lines.findIndex((line) => line.includes(`migrating ${main}/synthetic-source.db from ${state.integrated.clone as string} at ${Cfinal} before main moves`))
    const moves = lines.flatMap((line, index) => (line.includes('main moved from') && line.includes('by fast-forward') ? [index] : []))
    expect(migrating, lines.join('\n')).toBeGreaterThanOrEqual(0)
    expect(moves.map((index) => lines[index]!.slice(20))).toEqual([`main moved from ${M} to ${Cfinal} by fast-forward`])
    expect(migrating).toBeLessThan(moves[0]!)
    expect(lines.some((line) => line.includes('migrating after main moved'))).toBe(false)
    const [mark] = marksOf(main, 'migrate')
    expect(marksOf(main, 'migrate')).toHaveLength(1)
    expect(mark).toMatchObject({ head: M, ranIn: state.integrated.clone, ranAt: Cfinal })
    expect(factsOf(landed, 'landed')?.['says']).toContain('migrated before main moved')
    expect(stateOf(entry)).toBe('merged')
  }, 180_000)
})

describe('a landing prunes after each backup it takes', () => {
  /** Problem ALuP6FvWOQfD. Mutations: print the unrounded age, omit the prune, or omit its persisted marker. */
  it('prunes after main moved and the migration, and carries removals and leftovers into the record', async () => {
    const main = mainCheckout('prune-after-backup')
    // The stand-in reads the real state file before it performs its synthetic prune.
    const M = git(main, 'rev-parse', 'HEAD')
    const { entry } = await submitGit(main, 'prune-after-backup', addSyntheticMigration)
    writeFileSync(`${main}.prune-state`, join(workdirOf(entry), 'state.json'))
    await runTheTool(entry)
    await released(entry)
    // A migration lands only after a press.
    await pressedToLand(entry)
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    expect(marksOf(main, 'backup').map((one) => one.head)).toEqual([M])
    expect(marksOf(main, 'prune').map((one) => one.head)).toEqual([state.landing.Cfinal])
    expect(JSON.parse(readFileSync(`${main}.marks/requested-prune.json`, 'utf8'))).toEqual({
      args: ['--json'], head: state.landing.Cfinal, migrated: true,
      pending: { at: expect.any(String), failed: 'prune result was not recorded; it is unknown and the prune will not be run again' },
    })
    const pruned = state.landing.pruned
    expect(pruned).toMatchObject({
      at: expect.any(String), log: expect.any(String),
      removed: [{ name: 'mole-office-20260101-000001.db', ageMinutes: 63.24589, bytes: 456, freedBytes: 123 }],
      left: [{ name: 'mole-office-20260101-000003.db', reason: 'incomplete: synthetic missing files folder or list' }],
    })
    expect(pruned.failed).toBeUndefined()
    expect(detailOf(entry, 'landed').pruned).toEqual(pruned)
    expect(factsOf(landed, 'landed')?.says).toContain('removed mole-office-20260101-000001.db, 63.2 minutes old, 456 bytes in size, 123 bytes freed')
    expect(factsOf(landed, 'landed')?.says).toContain('left mole-office-20260101-000003.db: incomplete: synthetic missing files folder or list')
  }, 120_000)

  /** Mutation: fail the landing on a failed prune. Both cases then fail to reach landed. */
  for (const failure of ['exit 1', 'no JSON line']) it(`still lands and records a prune failure: ${failure}`, async () => {
    const main = mainCheckout(`prune-fails-${failure.replaceAll(' ', '-')}`)
    const { entry } = await submitGit(main, `prune-fails-${failure.replaceAll(' ', '-')}`, (dir) => write(dir, { 'src/prune.txt': 'synthetic change\n' }))
    writeFileSync(`${main}${failure === 'exit 1' ? '.fail-prune-once' : '.prune-no-json'}`, '')
    await runTheTool(entry)
    await released(entry)
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8'))
    expect(git(main, 'rev-parse', 'HEAD')).toBe(state.landing.Cfinal)
    expect(state.landing.pruned.failed).toContain(failure === 'exit 1' ? 'exited 1' : 'returned no JSON result line')
    expect(detailOf(entry, 'landed').pruned).toEqual(state.landing.pruned)
    expect(factsOf(landed, 'landed')?.says).toContain('prune failed:')
  }, 120_000)

  /** Mutation: run the command even without its package script. This case loses its no-script answer. */
  it('does not run a prune in a lane with no prune script', async () => {
    const main = mainCheckout('no-prune-script')
    const { entry } = await submitGit(main, 'no-prune-script', (dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      delete pkg.scripts['db:prune-backups']
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
    })
    await runTheTool(entry)
    await released(entry)
    const landed = await runTheTool(entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(marksOf(main, 'prune')).toEqual([])
    expect(detailOf(entry, 'landed').pruned.says).toContain('no db:prune-backups script')
  }, 120_000)

  /** Mutation: ignore saved pruned state. The resumed landing then prunes twice (R6). */
  it('resumes after a recorded or interrupted prune without pruning again', async () => {
    const main = mainCheckout('resume-prune')
    const { entry } = await submitGit(main, 'resume-prune', (dir) => write(dir, { 'src/prune.txt': 'synthetic change\n' }))
    await runTheTool(entry)
    await released(entry)
    writeFileSync(`${main}.fail-backup-once`, '')
    const interrupted = await runTheTool(entry)
    expect(interrupted.code).not.toBe(0)
    const file = join(workdirOf(entry), 'state.json')
    const state = JSON.parse(readFileSync(file, 'utf8'))
    git(main, 'merge', '--ff-only', '-q', state.landing.Cfinal)
    state.landing.backedUp = { at: state.landing.startedAt, log: 'synthetic backup already taken' }
    state.landing.pruned = { at: state.landing.startedAt, failed: 'synthetic interrupted prune: result unknown' }
    writeFileSync(file, JSON.stringify(state))
    const resumed = await runTheTool(entry)
    expect(resumed.code, resumed.err + resumed.out).toBe(0)
    expect(stepsOf(resumed)).toEqual(['landed'])
    expect(marksOf(main, 'prune')).toEqual([])
    expect(detailOf(entry, 'landed').pruned).toEqual(state.landing.pruned)
    expect(factsOf(resumed, 'landed')?.says).toContain('prune failed: synthetic interrupted prune: result unknown')
  }, 120_000)
})

describe('a landing that is interrupted', () => {
  it('resumes from the persisted state, and one interrupted after main moved reports landed without a second backup', async () => {
    const main = mainCheckout('resume')
    const { entry } = await submitGit(main, 'resume', (dir) => write(dir, { 'src/d.txt': 'd\n' }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const M = git(main, 'rev-parse', 'HEAD')
    // SYNTHETIC: the backup fails once, which ends the tool run after the landing step was persisted.
    writeFileSync(`${main}.fail-backup-once`, '')
    const interrupted = await runTheTool(entry)
    expect(interrupted.code).toBe(1)
    expect(stepsOf(interrupted)).toEqual(['integrating', 'integrated', 'tested', 'landing'])
    // THE ENDING LINE IS THE LAST THING PRINTED, and says the same as the entry (src/config/merge-tool.mjs).
    const lastLine = interrupted.out.trim().split('\n').at(-1)!
    expect(lastLine.startsWith('MOLE-OFFICE-MERGE-TOOL-ENDED ')).toBe(true)
    expect(JSON.parse(lastLine.slice('MOLE-OFFICE-MERGE-TOOL-ENDED '.length))).toEqual({ ok: false, says: (t.api.getRecord(entry)!.data['tool'] as { reason: string }).reason })
    expect(interrupted.err).toContain('db:backup')
    expect(stateOf(entry)).toBe('landing')
    expect(git(main, 'rev-parse', 'HEAD')).toBe(M)
    const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { landing: { M: string; Cfinal: string; backedUp: unknown } }
    expect(state.landing).toMatchObject({ M, backedUp: null })
    expect(marksOf(main, 'backup')).toEqual([])
    const tool = t.api.getRecord(entry)!.data['tool'] as { reason?: string }
    expect(tool.reason).toContain('could not go on')

    const resumed = await runTheTool(entry)
    expect(resumed.code, resumed.err + resumed.out).toBe(0)
    expect(stepsOf(resumed)).toEqual(['landed'])
    expect(git(main, 'rev-parse', 'HEAD')).toBe(state.landing.Cfinal)
    expect(marksOf(main, 'backup').map((one) => one.head)).toEqual([M])
    expect(stateOf(entry)).toBe('merged')

    // INTERRUPTED AFTER MAIN MOVED: the tree already shows the move, so only what follows is done.
    const second = await submitGit(main, 'resume-after-move', (dir) => write(dir, { 'src/e.txt': 'e\n' }))
    expect((await runTheTool(second.entry)).code).toBe(0)
    await released(second.entry)
    const M2 = git(main, 'rev-parse', 'HEAD')
    writeFileSync(`${main}.fail-backup-once`, '')
    const stopped = await runTheTool(second.entry)
    expect(stopped.code).toBe(1)
    expect(stateOf(second.entry)).toBe('landing')
    const plan = JSON.parse(readFileSync(join(workdirOf(second.entry), 'state.json'), 'utf8')) as { landing: { Cfinal: string } }
    git(main, 'merge', '--ff-only', '-q', plan.landing.Cfinal) // as if the tool had been killed right after its own fast-forward
    const after = await runTheTool(second.entry)
    expect(after.code, after.err + after.out).toBe(0)
    expect(stepsOf(after)).toEqual(['landed'])
    expect(after.out).toContain('already at the final commit')
    expect(factsOf(after, 'landed')).toMatchObject({ mainAfter: plan.landing.Cfinal })
    expect(detailOf(second.entry, 'landed')).toMatchObject({ mainBefore: M2, mainAfter: plan.landing.Cfinal })
    expect(marksOf(main, 'backup').map((one) => one.head)).toEqual([M])
    expect(stateOf(second.entry)).toBe('merged')
  }, 240_000)

  // Read old stamps directly, including nested state, without starting another merge tool.
  it('reads a state written while its stamps were UTC as the moments they state, and refuses one that is no moment', async () => {
    const folder = scratch('stamp-reader')
    const file = join(folder, 'state.json')
    const argv = process.argv
    process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-stamp-entry', '--session', 'synthetic-stamp-session', '--workdir', folder, '--api', proxyApi]
    let reader: typeof import('../tools/merge-tool/log-and-state.mjs')
    try {
      reader = await import('../tools/merge-tool/log-and-state.mjs')
    } finally {
      process.argv = argv
    }
    const utc = '2026-09-24T12:34:56.000Z'
    const old = {
      pinned: { at: utc }, integrated: { at: utc }, landing: { startedAt: utc },
      sandbox: { upAt: utc, downAt: utc, clearedAt: utc }, writtenAt: utc,
      history: [{ at: utc }], untouched: 'synthetic content',
    }
    writeFileSync(file, JSON.stringify(old))
    const read = reader.readStateAt(file)
    const stamps = [read.pinned.at, read.integrated.at, read.landing.startedAt, read.sandbox.upAt, read.sandbox.downAt, read.sandbox.clearedAt, read.writtenAt, read.history[0].at]
    for (const one of stamps) {
      expect(parseStoredStamp(one), `a local stamp is ${one}`).toBe(Date.parse(utc))
      expect(one).not.toMatch(/Z$/u)
    }
    expect(read.untouched).toBe(old.untouched)
    const saved = reader.writeStateAt(file, { resumed: true }, 'synthetic-stamp-entry')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(saved)
    expect(saved.pinned.at).toBe(read.pinned.at)
    expect(saved.integrated.at).toBe(read.integrated.at)
    expect(saved.landing.startedAt).toBe(read.landing.startedAt)
    expect(parseStoredStamp(saved.writtenAt)).not.toBeNull()
    expect(parseStoredStamp(reader.stamp())).not.toBeNull()
    writeFileSync(file, JSON.stringify({ ...old, pinned: { at: 'the day before yesterday' } }))
    expect(() => reader.readStateAt(file)).toThrow('state.pinned.at = "the day before yesterday", which is not a moment this tool can read')
    expect(JSON.parse(readFileSync(file, 'utf8')).pinned.at).toBe('the day before yesterday')
  })
})

// ============================================================================ 9. the files adapter

describe('the files adapter', () => {
  /**
   * A RUN THAT STAGES `staged` IN ITS OWN TREE, under `src/out/` (inside the worker's work area), commits it,
   * finishes and is sealed; the entry is submitted with that folder as `stagedAt`, so the seal holds every
   * byte the entry lands. `elsewhere` stages in a folder outside the tree instead, which the seal never saw.
   */
  async function submitFiles(root: string, staged: Record<string, string>, operations: Record<string, unknown>[], onConflict?: string, elsewhere?: string): Promise<string> {
    let stagedAt = ''
    const worker = workerClone(mainCheckout(`files-run-${String(Date.now())}`), `files-${String(Math.random()).slice(2, 8)}`, (dir) => {
      stagedAt = join(dir, 'src', 'out')
      mkdirSync(stagedAt, { recursive: true })
      write(dir, { 'src/f.txt': 'f\n' })
      write(elsewhere ?? stagedAt, staged)
    })
    const run = await sealedRun(worker)
    const r = await app.inject({
      method: 'POST',
      url: '/api/merge-queue',
      headers: asWorker,
      payload: { run, changeset: { adapter: 'files', root, stagedAt: elsewhere ?? realpathSync(stagedAt), operations, ...(onConflict === undefined ? {} : { onConflict }) } },
    })
    expect(r.statusCode, r.body).toBe(201)
    return String(r.json().entry.id)
  }

  it('lands adds and modifies, reads them back through the office, and never overwrites a file whose hash moved', async () => {
    const root = aFilesRoot('files-root')
    const A = '{"synthetic":"a report file"}\n'
    const B0 = '{"b":"before"}\n'
    const B1 = '{"b":"after"}\n'
    write(root, { 'notes/b.json': B0, 'old/c.json': '{"c":1}\n' })
    // A report record points at the add's target, so the office's own file door serves it back.
    const report = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: 'A synthetic report', data: { blocks: [{ id: 'b-1', type: 'text', text: 'x' }] }, actor: t.api.HUMAN })
    writeDataBypassingTheGate(t, report.id, { blocks: [{ id: 'b-1', type: 'file', path: join(root, 'report-files', 'a.json'), name: 'a.json' }] })
    const entry = await submitFiles(root, { 'report-files/a.json': A, 'notes/b.json': B1 }, [
      { op: 'add', path: 'report-files/a.json', before: 'absent', after: sha256(A), source: 'synthetic: written by tests/the-merger.test.ts', record: report.id },
      { op: 'modify', path: 'notes/b.json', before: sha256(B0), after: sha256(B1), source: 'synthetic: written by tests/the-merger.test.ts' },
    ])
    const pin = await runTheTool(entry)
    expect(pin.code, pin.err + pin.out).toBe(0)
    expect(stepsOf(pin)).toEqual(['pinned'])
    expect(factsOf(pin, 'pinned')!['files']).toEqual({ 'report-files/a.json': sha256(A), 'notes/b.json': sha256(B1) })
    expect(factsOf(pin, 'pinned')!['checker']['decided'].filter((one: { ok: boolean }) => !one.ok)).toEqual([])
    expect(readFileSync(join(workdirOf(entry), 'hold', 'notes', 'b.json'), 'utf8')).toBe(B1)
    await released(entry)
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const integrated = factsOf(run, 'integrated')!
    expect(integrated['files']).toEqual({ 'report-files/a.json': sha256(A), 'notes/b.json': sha256(B1) })
    expect(integrated['mainAt']).toMatch(/^folder-sha256:[0-9a-f]{64}$/)
    expect(integrated['checker']['needsJudgment']).toEqual([])
    expect(detailOf(entry, 'integrated')['keptBoth']).toEqual([])
    expect(factsOf(run, 'tested')).toMatchObject({ green: true, says: expect.stringContaining('no test suite') })
    expect(factsOf(run, 'landing')).toEqual({ mainAt: integrated['mainAt'] })
    const landed = detailOf(entry, 'landed')
    expect(landed['applied']).toEqual([
      { op: 'add', path: 'report-files/a.json', landsAt: 'report-files/a.json', did: 'created' },
      { op: 'modify', path: 'notes/b.json', landsAt: 'notes/b.json', did: 'replaced' },
    ])
    expect(landed['readBack']).toEqual([
      { path: 'report-files/a.json', expected: sha256(A), found: sha256(A), through: 'the office (GET /api/file)', officeSaid: null },
      { path: 'notes/b.json', expected: sha256(B1), found: sha256(B1), through: expect.stringContaining('the office refused'), officeSaid: expect.stringContaining('40') },
    ])
    expect(factsOf(run, 'landed')!['says']).toContain('1 through the office, 1 from the file system')
    expect(factsOf(run, 'landed')!['mainAfter']).not.toBe(integrated['mainAt'])
    expect(readFileSync(join(root, 'report-files', 'a.json'), 'utf8')).toBe(A)
    expect(readFileSync(join(root, 'notes', 'b.json'), 'utf8')).toBe(B1)
    expect(stateOf(entry)).toBe('merged')
    expect(readingOf(entry)['machine']['integrated']).toMatchObject({ rebasedTip: null, mainBefore: integrated['mainAt'] })

    // A MODIFY WHOSE TARGET MOVED AFTER IT WAS PINNED IS A CONFLICT (R3), and the file is not touched.
    const B2 = '{"b":"third"}\n'
    const conflicting = await submitFiles(root, { 'notes/b.json': B2 }, [{ op: 'modify', path: 'notes/b.json', before: sha256(B1), after: sha256(B2), source: 'synthetic' }])
    expect((await runTheTool(conflicting)).code).toBe(0)
    expect(stateOf(conflicting)).toBe('pinned')
    await released(conflicting)
    write(root, { 'notes/b.json': '{"b":"changed by hand meanwhile"}\n' })
    const bounced = await runTheTool(conflicting)
    expect(bounced.code, bounced.err + bounced.out).toBe(0)
    expect(stepsOf(bounced)).toEqual(['integrating', 'conflict'])
    expect(factsOf(bounced, 'conflict')).toMatchObject({ files: ['notes/b.json'] })
    expect(stateOf(conflicting)).toBe('bounced')
    expect(readFileSync(join(root, 'notes', 'b.json'), 'utf8')).toBe('{"b":"changed by hand meanwhile"}\n')
    write(root, { 'notes/b.json': B1 })

    // KEEP-BOTH: an add over a file that is there lands beside it, and the original is untouched.
    const B3 = '{"b":"from elsewhere"}\n'
    const kept = await submitFiles(root, { 'notes/b.json': B3 }, [{ op: 'add', path: 'notes/b.json', before: 'absent', after: sha256(B3), source: 'synthetic' }], 'keep-both')
    expect((await runTheTool(kept)).code).toBe(0)
    expect(stateOf(kept)).toBe('pinned')
    await released(kept)
    const beside = await runTheTool(kept)
    expect(beside.code, beside.err + beside.out).toBe(0)
    expect(stepsOf(beside)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const landsAt = `notes/b.kept-from-${kept.slice(0, 8)}.json`
    expect(detailOf(kept, 'integrated')['keptBoth']).toEqual([{ path: 'notes/b.json', landsAt }])
    expect(factsOf(beside, 'integrated')!['checker']['decided']).toContainEqual({ path: 'notes/b.json', check: 'no-overwrite', ok: true, detail: expect.stringContaining(landsAt) })
    expect(readFileSync(join(root, landsAt), 'utf8')).toBe(B3)
    expect(readFileSync(join(root, 'notes', 'b.json'), 'utf8')).toBe(B1)

    // A STAGED FILE THAT IS NOT WHAT WAS SUBMITTED BOUNCES AT THE PIN, with the checker's words, and nothing lands.
    const wrong = await submitFiles(root, { 'report-files/d.json': '{"d":"other bytes"}\n' }, [{ op: 'add', path: 'report-files/d.json', before: 'absent', after: sha256('{"d":"what was said"}\n'), source: 'synthetic' }])
    const refused = await runTheTool(wrong)
    expect(refused.code, refused.err + refused.out).toBe(0)
    expect(stepsOf(refused)).toEqual(['pinned'])
    expect(factsOf(refused, 'pinned')!['files']).toEqual({ 'report-files/d.json': sha256('{"d":"other bytes"}\n') })
    expect(stateOf(wrong)).toBe('bounced')
    expect(readingOf(wrong)['machine']['bounced']).toMatchObject({ reason: 'guard', files: ['report-files/d.json'] })
    expect(existsSync(join(root, 'report-files', 'd.json'))).toBe(false)

    // A DELETE WAITS FOR THE SECRETARY: the tool stops before taking the lane, and nothing is written.
    const deleting = await submitFiles(root, {}, [{ op: 'delete', path: 'old/c.json', before: sha256('{"c":1}\n'), after: 'absent', source: 'synthetic: superseded' }])
    expect((await runTheTool(deleting)).code).toBe(0)
    await released(deleting)
    const waits = await runTheTool(deleting)
    expect(waits.code, waits.err + waits.out).toBe(0)
    expect(stepsOf(waits)).toEqual([])
    expect(waits.out).toContain("secretary's confirmation")
    expect(stateOf(deleting)).toBe('judged')
    expect(existsSync(join(root, 'old', 'c.json'))).toBe(true)

    // A STAGED FOLDER THE SEAL NEVER SAW BOUNCES AT THE PIN AS UNJUDGED, naming the path, and nothing lands.
    // Its bytes are exactly what the entry says, so the checker decides nothing against it: only the seal can.
    const E = '{"e":"staged outside the sealed tree"}\n'
    const unsealed = await submitFiles(root, { 'report-files/e.json': E }, [{ op: 'add', path: 'report-files/e.json', before: 'absent', after: sha256(E), source: 'synthetic' }], undefined, scratch('files-staged-outside'))
    const outside = await runTheTool(unsealed)
    expect(outside.code, outside.err + outside.out).toBe(0)
    expect(stepsOf(outside)).toEqual(['pinned'])
    expect(factsOf(outside, 'pinned')!['checker']['decided'].filter((one: { ok: boolean }) => !one.ok)).toEqual([])
    expect(stateOf(unsealed)).toBe('bounced')
    expect(readingOf(unsealed)['machine']['bounced']).toMatchObject({ reason: 'unjudged', files: ['report-files/e.json'] })
    expect(readingOf(unsealed)['machine']['bounced']['says']).toContain('are not among the files seal')
    expect(existsSync(join(root, 'report-files', 'e.json'))).toBe(false)

    // A FILE THE CHECKER HANDS ON — a type it has no reader for — BOUNCES AT THE PIN AS UNJUDGED, with the
    // checker's own words, instead of taking the lane and waiting in it for a check nobody can make.
    const NOTE = 'A synthetic note, in a type the files checker has no reader for.\n'
    const handed = await submitFiles(root, { 'notes/f.txt': NOTE }, [{ op: 'add', path: 'notes/f.txt', before: 'absent', after: sha256(NOTE), source: 'synthetic: written by tests/the-merger.test.ts' }])
    const unread = await runTheTool(handed)
    expect(unread.code, unread.err + unread.out).toBe(0)
    expect(stepsOf(unread)).toEqual(['pinned'])
    expect(factsOf(unread, 'pinned')!['checker']['needsJudgment']).toEqual([{ path: 'notes/f.txt', why: expect.stringContaining('No content check exists for .txt files') }])
    expect(stateOf(handed)).toBe('bounced')
    expect(readingOf(handed)['machine']['bounced']).toMatchObject({ reason: 'unjudged', files: ['notes/f.txt'] })
    expect(readingOf(handed)['machine']['bounced']['says']).toContain('No content check exists for .txt files')
    expect(readingOf(handed)['occupies']).toBeNull()
    expect(existsSync(join(root, 'notes', 'f.txt'))).toBe(false)
  }, 240_000)

  /** A run whose work is `stagedAt`, a folder no repository holds, sealed as a files seal to land in `root`. */
  async function aFilesSealedRun(stagedAt: string, root: string, sources?: Record<string, unknown>): Promise<string> {
    const run = t.api.createRecord({
      kind: 'session', title: 'Synthetic files-sealed merger run', workspaceId: 'default', actor: { type: 'agent', id: 'mq-worker' }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'mq-worker', submission: { kind: 'files', stagedAt, root, ...(sources === undefined ? {} : { sources }) } },
    }).id
    theRunReportsForTheQueue(t, run, { type: 'agent', id: 'mq-worker' })
    const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
    expect(r.statusCode, r.body).toBe(200)
    return run
  }

  /** The inspector's release of a files seal, through the real doors: no git base, and the before it read. */
  async function releasedOnAFilesSeal(entry: string, before: Record<string, string>): Promise<void> {
    expect(stateOf(entry)).toBe('pinned')
    const run = String(t.api.getRecord(entry)!.data['run'])
    const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; files: { stagedAt: string; files: { path: string }[] } }
    const read = { sealId, sealHash: seal.hash, worktree: '/synthetic/a-copy-of-its-own', ofItsOwn: true, says: 'Synthetic: a copy of the staged files, each checked against the seal.', staged: seal.files.stagedAt, before }
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asInspector, payload: { changes: seal.files.files.map((one) => ({ path: one.path, changes: 'a synthetic change' })), base: null, read } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const verdict = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asInspector, payload: { verdict: 'released', traced: syntheticTrace(t, seal.files.files.map((one) => one.path)), check: 'Synthetic: read the files and the text they replace.', chaptersRead: [], read } })
    expect(verdict.statusCode, verdict.body).toBe(201)
    expect(stateOf(entry)).toBe('judged')
  }

  /**
   * MUTATION PROOF, each run alone on 23 September 2026 in tools/the-merger.mjs: without the first pass
   * over the hold, the first file of the plan lands before the changed second is found, and this goes
   * red on it; without the mode set on the open file, bin/run.sh lands 100644 and the tool's own
   * read-back stops it ("reads back with mode 100644 (expected 100755)"), so the read-back is proved in
   * the same run. NOT REACHED BY ANY TEST: the hash taken again as each file is written, which closes
   * the moment between the first pass and the write; no step is reported in that moment, so no hook here
   * can change a file inside it.
   */
  // MUTATION PROOF, 23 September 2026: leave the origin out of the manifest tools/the-merger.mjs writes, and
  // this goes red. NOT REACHED BY ANY TEST: the words the landing adds for a file decided by its hash over
  // the 256 MiB limit, because reaching them means landing a quarter-gigabyte through the office's read-back;
  // the checker's own decision, which the landing repeats, is proved in its own test file.
  it('carries each original its files seal recorded, and the folder it was staged in, into the manifest the checker reads (A2)', async () => {
    const root = aFilesRoot('files-origin-root')
    const REC = '{"t":1}\n'
    const original = scratch('files-origin-original')
    write(original, { 'ticks.jsonl': `${REC}\0\0\0` })
    const stagedAt = scratch('files-origin-staged')
    write(stagedAt, { 'runs/ticks.jsonl': REC })
    const run = await aFilesSealedRun(stagedAt, root, { 'runs/ticks.jsonl': { path: join(original, 'ticks.jsonl'), transform: 'trailing-nul-trim' } })
    const submitted = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'files', root, stagedAt, operations: [{ op: 'add', path: 'runs/ticks.jsonl', before: 'absent', after: sha256(REC), source: 'written by the recovery run' }] } } })
    expect(submitted.statusCode, submitted.body).toBe(201)
    const entry = String(submitted.json().entry.id)
    const pin = await runTheTool(entry)
    expect(pin.code, pin.err + pin.out).toBe(0)
    const manifest = JSON.parse(readFileSync(join(workdirOf(entry), 'hold', 'manifest.json'), 'utf8')) as { stagedAt: string; operations: Record<string, unknown>[] }
    expect(manifest.stagedAt).toBe(stagedAt)
    // READ OFF THE SEAL, NOT THE ENTRY: the entry's own `source` says something else entirely.
    expect(manifest.operations[0]!['origin']).toEqual({ path: realpathSync(join(original, 'ticks.jsonl')), sha256: sha256(`${REC}\0\0\0`), transform: 'trailing-nul-trim', couldWrite: null })
    // NO SANDBOX IS RECORDED FOR THIS RUN, so the checker does not take the original as one, and says why.
    expect(factsOf(pin, 'pinned')!['checker']['needsJudgment']).toEqual([{ path: 'runs/ticks.jsonl', why: expect.stringContaining('The office cannot say where the run could write') }])
  }, 120_000)

  it('lands an entry on a files seal with its sealed mode and the modify its release read, and writes nothing from a hold changed after integrating', async () => {
    const root = aFilesRoot('files-sealed-root')
    const B0 = '{"b":"what the check saw landed"}\n'
    const B1 = '{"b":"the recovered text"}\n'
    const RUN = '#!/bin/sh\necho synthetic\n'
    write(root, { 'notes/b.json': B0 })
    // THE ADD IS A BYTE-FOR-BYTE COPY OF AN ORIGINAL on this machine, so the files checker decides it
    // rather than handing a type it cannot read on to an inspector.
    const original = scratch('files-sealed-original')
    write(original, { 'run.sh': RUN })
    const stagedAt = scratch('files-sealed-staged')
    write(stagedAt, { 'bin/run.sh': RUN, 'notes/b.json': B1 })
    chmodSync(join(stagedAt, 'bin', 'run.sh'), 0o755)
    const run = await aFilesSealedRun(stagedAt, root)
    const operations = [
      { op: 'add', path: 'bin/run.sh', before: 'absent', after: sha256(RUN), mode: '100755', source: join(original, 'run.sh') },
      { op: 'modify', path: 'notes/b.json', before: sha256(B0), after: sha256(B1), source: 'synthetic: written by tests/the-merger.test.ts' },
    ]
    const submitted = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'files', root, stagedAt, operations } } })
    expect(submitted.statusCode, submitted.body).toBe(201)
    const entry = String(submitted.json().entry.id)
    const pin = await runTheTool(entry)
    expect(pin.code, pin.err + pin.out).toBe(0)
    expect(stepsOf(pin)).toEqual(['pinned'])
    expect(factsOf(pin, 'pinned')!['checker']['needsJudgment']).toEqual([])
    await releasedOnAFilesSeal(entry, { 'notes/b.json': sha256(B0) })
    const landing = await runTheTool(entry)
    expect(landing.code, landing.err + landing.out).toBe(0)
    expect(stepsOf(landing)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(readFileSync(join(root, 'bin', 'run.sh'), 'utf8')).toBe(RUN)
    expect(statSync(join(root, 'bin', 'run.sh')).mode & 0o777).toBe(0o755)
    expect(readFileSync(join(root, 'notes', 'b.json'), 'utf8')).toBe(B1)
    expect(detailOf(entry, 'landed')['readBack']).toContainEqual(expect.objectContaining({ path: 'bin/run.sh', expected: sha256(RUN), found: sha256(RUN), modeExpected: '100755', modeFound: '100755' }))
    expect(stateOf(entry)).toBe('merged')

    // A HELD FILE CHANGED AFTER THE ENTRY WAS INTEGRATED stops the landing before ANYTHING is written: the
    // changed file is the second of the plan, so a landing that only hashed each file as it wrote it
    // would have written the first before it found the second.
    const root2 = aFilesRoot('files-sealed-root-2')
    const C = '{"c":"sealed"}\n'
    const D = '{"d":"sealed"}\n'
    const staged2 = scratch('files-sealed-staged-2')
    write(staged2, { 'notes/c.json': C, 'notes/d.json': D })
    const run2 = await aFilesSealedRun(staged2, root2)
    const adds = [C, D].map((text, index) => ({ op: 'add', path: `notes/${index === 0 ? 'c' : 'd'}.json`, before: 'absent', after: sha256(text), source: 'synthetic: written by tests/the-merger.test.ts' }))
    const submitted2 = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run: run2, changeset: { adapter: 'files', root: root2, stagedAt: staged2, operations: adds } } })
    expect(submitted2.statusCode, submitted2.body).toBe(201)
    const entry2 = String(submitted2.json().entry.id)
    expect((await runTheTool(entry2)).code).toBe(0)
    await releasedOnAFilesSeal(entry2, {})
    hooks.set(entry2, (step) => {
      if (step === 'landing') writeFileSync(join(workdirOf(entry2), 'hold', 'notes', 'd.json'), '{"d":"changed in the hold"}\n')
    })
    const stopped = await runTheTool(entry2)
    hooks.delete(entry2)
    expect(stopped.code, stopped.err + stopped.out).toBe(1)
    expect(stepsOf(stopped)).toEqual(['integrating', 'integrated', 'tested', 'landing'])
    expect(stopped.err + stopped.out).toContain('notes/d.json')
    expect(existsSync(join(root2, 'notes', 'c.json')), 'the first file of the plan was written before the changed second was found').toBe(false)
    expect(existsSync(join(root2, 'notes', 'd.json'))).toBe(false)
  }, 240_000)
})

// ACCEPTANCE FINDING 49 (report EnJvvsDTF_Dx, block f-49): a record id is 12 characters of A-Za-z0-9_-, and one in
// 4,096 begins with `--`. The tool refused such a --session as a missing value, so a real session record could not
// start it, and this file's own fresh records made it red about once in every few dozen runs.
// MUTATION PROOF, 23 September 2026: any value beginning with `--` refused again, and the first half goes red.
it('takes a session id that begins with two dashes, and still refuses a flag whose value was forgotten', () => {
  const tool = (...args: string[]) => spawnSync(process.execPath, [TOOL, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: proxyApi } })
  // THE PARSE IS ENDED ON PURPOSE by a word the tool does not know, after the dashed id: reaching that word
  // is the proof that the id was taken as --session's value, and nothing is started.
  const dashed = tool('--entry', 'no-such-entry', '--session', '--0123456789', '--not-a-flag-of-this-tool')
  expect(dashed.status).toBe(2)
  expect(dashed.stderr).toContain('Unknown argument --not-a-flag-of-this-tool.')
  expect(dashed.stderr).not.toContain('needs a value')
  const forgotten = tool('--entry', 'no-such-entry', '--session', '--api', proxyApi)
  expect(forgotten.status).toBe(2)
  expect(forgotten.stderr).toContain('--session needs a value.')
}, 60_000)

// ============================================================================ 11. a secretary's design/-only entry

describe("a secretary's design/-only entry, submitted with no run", () => {
  // THE OFFICE FILES AND SEALS THE SECRETARY'S RUN, AND THE RULE OF A DECISION COVERS IT
  // IN PLACE OF A RELEASE. Which
  // lane it takes is the tool's own documents rule (the coordinator's 9sQNuC_N8MVX): a document no test reads lands with no
  // suite, and a design/ file the suite reads is tested with the suite. Neither is checked.
  // MUTATION PROOF, alone in src/server/lib/merge-state-machine.ts: the coverage rule removed, and the case goes red
  // where the entry stays pinned, waiting for an inspector's release nobody asks for.
  const asSecretary = as('agent', 'mq-secretary')

  beforeAll(async () => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'mq-secretary', name: 'Synthetic mq-secretary', role: 'secretary' } })
    expect(r.statusCode, r.body).toBe(201)
  })

  /** The secretary's clone of main with one commit on `work`, submitted with the secretary's body. */
  async function submitAsTheSecretary(main: string, name: string, edit: (dir: string) => void): Promise<{ entry: string; run: string }> {
    const folder = workerClone(main, name, edit)
    const r = await app.inject({
      method: 'POST',
      url: '/api/merge-queue',
      headers: asSecretary,
      payload: { changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' }, workingDirectory: folder },
    })
    expect(r.statusCode, r.body).toBe(201)
    return { entry: String(r.json().entry.id), run: String(r.json().entry.run) }
  }

  /** Main with the reads recorder, the files given, and one code landing, so main's tree has a record of what the suite reads. */
  async function aMainWithARecord(name: string, files: Record<string, string>): Promise<string> {
    const main = mainCheckout(name)
    write(main, {
      'tools/record-what-tests-read.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read.mjs'), 'utf8'),
      'tools/record-what-tests-read-hooks.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read-hooks.mjs'), 'utf8'),
      ...files,
    })
    execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: main })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries the recorder and the design/ files of the case')
    const first = await submitGit(main, `${name}-first`, (dir) => write(dir, { 'src/first.txt': 'first\n' }))
    expect((await runTheTool(first.entry)).code).toBe(0)
    await released(first.entry)
    expect((await runTheTool(first.entry)).code).toBe(0)
    expect(stateOf(first.entry)).toBe('merged')
    expect(existsSync(join(base, 'work', 'reads', `${git(main, 'rev-parse', 'HEAD^{tree}')}.json`))).toBe(true)
    return main
  }

  const suitesOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))

  it('lands a design/ document no test reads through the documents lane, with no suite and no check', async () => {
    const main = await aMainWithARecord('secretary-documents', { 'design/notes.md': 'The notes, as they were.\n' })
    const { entry, run } = await submitAsTheSecretary(main, 'secretary-documents', (dir) => write(dir, { 'design/notes.md': 'The notes, as they are now.\n' }))
    const M = git(main, 'rev-parse', 'HEAD')
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stepsOf(done)).toEqual(['pinned', 'integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(done, 'pinned')).toMatchObject({ documents: { files: ['design/notes.md'] } })
    // THE GIT CHECKER HANDED THE PROTECTED design/ PATH ON, AND THE RULE COVERED IT: no check again was asked.
    expect(factsOf(done, 'integrated')!['checker']['needsJudgment']).toEqual([{ path: 'design/notes.md', why: expect.any(String) }])
    expect(factsOf(done, 'tested')!['says']).toContain('A documentation entry')
    expect(suitesOf(entry), 'no suite ran').toHaveLength(0)
    expect(readingOf(entry)['lane']).toBe(`${main} documents`)
    expect(stateOf(entry)).toBe('merged')
    expect(t.api.getRecord(entry)!.data['reinspection']).toBeUndefined()
    expect(t.api.getRecord(run)!.data['theCheck']).toBeUndefined()
    expect(git(main, 'rev-parse', 'HEAD^')).toBe(M)
    expect(readFileSync(join(main, 'design', 'notes.md'), 'utf8')).toBe('The notes, as they are now.\n')
  }, 300_000)

})

describe('line files are judged by line, not by file (the line rule, wave 13v round 6)', () => {
  // THE COORDINATOR'S DESIGN ANSWER cHz3hjwN4flv. For a file on the list of line files, an entry's verdict holds on a tree when its
  // own lines stand there unchanged and no line somebody else changed meets them; every other file keeps decision R2, by
  // file. The fixture's word lists are synthetic, at the paths the list names, with an anchor line per wave as the real
  // ones have. MUTATION PROOFS are in the commit message.
  const EN = 'src/shared/words/en.ts'
  const ZH = 'src/shared/words/zh.ts'
  const wordList = (name: string): string =>
    [
      `// SYNTHETIC word list of the merger test (${name}).`,
      `export const ${name} = {`,
      "  first: 'first',",
      '  // wave 13a: add new sections above this line',
      "  second: 'second',",
      "  third: 'third',",
      "  fourth: 'fourth',",
      '  // wave 13b: add new sections above this line',
      "  fifth: 'fifth',",
      "  sixth: 'sixth',",
      "  seventh: 'seventh',",
      '}',
      '',
    ].join('\n')
  const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8')
  /** A line added above a wave's anchor, in both word lists. */
  const above = (wave: string, line: string) => (dir: string) =>
    write(dir, {
      [EN]: read(dir, EN).replace(`  // wave ${wave}:`, `  ${line}\n  // wave ${wave}:`),
      [ZH]: read(dir, ZH).replace(`  // wave ${wave}:`, `  ${line}\n  // wave ${wave}:`),
    })
  const long = (dir: string) => read(dir, 'src/long.txt')
  function wordsCheckout(name: string): string {
    const main = mainCheckout(name)
    write(main, { [EN]: wordList('en'), [ZH]: wordList('zh') })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Synthetic word lists')
    return main
  }
  async function judgedInOrder(main: string, ...edits: [string, (dir: string) => void][]): Promise<string[]> {
    const ids: string[] = []
    for (const [name, edit] of edits) ids.push((await submitGit(main, name, edit)).entry)
    for (const id of ids) {
      expect((await runTheTool(id)).code).toBe(0)
      await released(id)
    }
    return ids
  }
  const suiteCallsOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))



  it('still judges a code file two entries change in different lines by file: the rider is checked again for it alone', async () => {
    const main = wordsCheckout('lines-code')
    const [A, B] = await judgedInOrder(
      main,
      [
        'lines-code-a',
        (dir) => {
          write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by A\n') })
          above('13a', "byA: 'by A',")(dir)
        },
      ],
      [
        'lines-code-b',
        (dir) => {
          write(dir, { 'src/long.txt': long(dir).replace('line 19\n', 'line 19 by B\n') })
          above('13b', "byB: 'by B',")(dir)
        },
      ],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    expect((factsOf(first, 'tested')!['testedWith']['bus'] as { entry: string }[]).map((one) => one.entry)).toEqual([B])
    expect(readFileSync(first.log, 'utf8')).toContain(
      `On this bus's tree src/long.txt will not hold what its release read, so it borrows this bus's result only after a check of that file releases it again: src/long.txt (by file, decision R2)`,
    )
    expect(stateOf(A!)).toBe('merged')

    const second = await runTheTool(B!)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated'])
    expect(readingOf(B!)['machine']['reinspection']).toMatchObject({ only: ['src/long.txt'] })
    expect(readFileSync(second.log, 'utf8')).toContain('src/long.txt is not what the verdict read; it is judged by file (decision R2)')
  }, 420_000)

  it("at an entry's own turn, other entries' lines in a word list keep its verdict, and its own lines changed by somebody else do not", async () => {
    // EACH IS TESTED ALONE. Main moves under both after their release: it changes `seventh`, far from both, and makes
    // one of Y's own changes, to `third`, itself, so those lines are no longer Y's.
    const main = wordsCheckout('lines-own')
    const [X, Y] = await judgedInOrder(
      main,
      ['lines-own-x', above('13a', "byX: 'by X',")],
      ['lines-own-y', (dir) => write(dir, { [EN]: read(dir, EN).replace("third: 'third'", "third: 'third by Y'").replace("fifth: 'fifth'", "fifth: 'fifth by Y'") })],
    )
    write(main, { [EN]: read(main, EN).replace("seventh: 'seventh'", "seventh: 'seventh by main'").replace("third: 'third'", "third: 'third by Y'") })
    git(main, 'commit', '-q', '-am', 'Main changes the English word list under both')
    const alone = { MOLE_OFFICE_BUS_MOST_ENTRIES: '1' }

    const x = await runTheTool(X!, alone)
    expect(x.code, x.err + x.out).toBe(0)
    expect(stepsOf(x)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(x, 'integrated')!['lines']).toEqual([{ path: EN, held: true, ranges: 'line 4' }])
    expect(stateOf(X!)).toBe('merged')

    const y = await runTheTool(Y!, alone)
    expect(y.code, y.err + y.out).toBe(0)
    expect(stepsOf(y)).toEqual(['integrating', 'integrated'])
    expect(factsOf(y, 'integrated')!['lines']).toEqual([{ path: EN, held: false, why: 'lines changed by somebody else meet its own at line 6 of its base' }])
    expect(readingOf(Y!)['machine']['reinspection']).toMatchObject({ only: [EN] })
    expect(readFileSync(y.log, 'utf8')).toContain(`${EN} is not what the verdict read, and by line it does not hold`)
  }, 420_000)

})

// ============================================================================ 13. a changed plugin folder that git keeps as a link (wave 13x round 21)

/**
 * A CHANGED PLUGIN FOLDER GIT KEEPS AS A LINK IS NAMED IN THE LANDED STEP (wave 13x round 21, backlog item 0). The
 * change adds plugins/made-up-linked as a link to ../made-up-elsewhere, so the link leads to nothing. The office reads
 * no plugin whose folder is a link: it lists a link to another place and a link to nothing as refused, and a link to a
 * file is not on its list at all. Before the fix the landing named no plugin and said nothing, because
 * thePluginsChangedBetween took an id only from a path with a part after plugins/<id>/. The id and the target of the
 * link are made up; no such plugin exists.
 *
 * MUTATION PROOF is in the code commit's message: putting rest.length > 0 back, and taking the link check out, each
 * make this case red.
 */
describe('a landing whose changed plugin folder is a link (wave 13x round 21)', () => {
  it('names the plugin in the landed step, says no page was built because the office reads no plugin whose folder is a link, and leaves main clean', async () => {
    const main = mainCheckout('plugin-folder-link')
    const { entry } = await submitGit(main, 'plugin-folder-link', (dir) => {
      mkdirSync(join(dir, 'plugins'), { recursive: true })
      symlinkSync('../made-up-elsewhere', join(dir, 'plugins', 'made-up-linked'))
    })

    // RUN 1: submitted -> pinned, and the tool stops because the entry waits on the inspector.
    const first = await runTheTool(entry)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stepsOf(first)).toEqual(['pinned'])
    await released(entry)

    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stepsOf(run)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const landed = detailOf(entry, 'landed')
    const final = landed['final'] as string
    const says = `the page of the plugin made-up-linked was NOT built: git keeps plugins/made-up-linked at ${final.slice(0, 12)} as a link, and the office reads no plugin whose folder is a link`
    expect(factsOf(run, 'landed')!['says']).toContain(says)
    expect(landed['pluginPages']).toEqual([{ id: 'made-up-linked', built: false, staged: null, log: null, says }])
    expect(git(main, 'status', '--porcelain'), 'the main checkout is clean').toBe('')
    expect(stateOf(entry)).toBe('merged')
  }, 240_000)
})
