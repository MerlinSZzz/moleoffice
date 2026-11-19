// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST JOB RUNNER, STARTED AND KEPT BY THE OFFICE, so that an asked host job runs without a timer or a person.
 *
 * Until wave 13q round 59 an asked host job waited for a user timer that ran `tools/run-the-host-jobs.mjs --once` every
 * minute, and an office with no such timer never ran one. Now the office starts the runner itself, with
 * `--with-the-office=<its own pid>`, in a process group of its own, files that process in the ledger under the API
 * server's own session, and asks the group to stop when the office stops (src/server/index.ts). It then waits for the
 * runner to end, at most THE_STOP_WAIT_MS, and closes the runner's row. The runner also stops by itself within a second
 * of the office's process being gone, so an office ended outright leaves no runner behind.
 *
 * A RUNNER THE LEDGER CANNOT FILE IS ASKED TO STOP AT ONCE. The ledger is what a person tidying up reads, so a runner
 * the office started and the ledger does not hold could not be found from it (Inspector's refusal of wave 13q round
 * 59). The words say why, and the next start is counted against the bound as any other.
 *
 * ONE AT A TIME. A runner is started only when no runner this office started is still running. The runner's own lock
 * refuses a second runner beside it, from a person's `--once` or a user timer, so the two cannot run one job twice.
 *
 * A RUNNER THAT ENDS IS SAID IN WORDS, AND ANOTHER IS STARTED AT ONCE, at most AT_MOST_STARTS times in THE_WINDOW_MS.
 * A runner that cannot run, such as one whose office key cannot be read, would otherwise start and end again every
 * few seconds for ever. When the bound is used up, the words say when the next start is.
 *
 * ONLY WHILE A HOST TOOL IS REGISTERED. A runner with no tool to run would ask the take door every few seconds for
 * nothing, and every scratch office a test starts would carry one. The file is read again at every look.
 *
 * NOTHING HERE SPAWNS OR SIGNALS. The start is the OS layer's (`startTheHostJobRunner` in ./resources.ts), and the stop
 * is `askAProcessGroupToStop` with the group recorded at the start.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { localStamp } from '@shared/time.ts'
import { readTheHostTools } from '../../config/host-tools.mjs'
import { theHostJobsFolderBeside } from '../../config/host-tools-file.mjs'
import { maskedAsAPrintedLine } from '../../config/inspection-ending.mjs'
import { howToStart, keysPathFrom } from '../../config/settings.mjs'
import { theHostToolsFile } from './host-jobs.ts'
import { named } from './named-timers.ts'
import type { Actor } from './records.ts'
import { AT_MOST_STARTS, THE_LOOK_MS, THE_NOTE_OF_A_STOPPED_RUNNER, THE_STOP_WAIT_MS, THE_WINDOW_MS, theRunnerRuns, theStartsAreUsedUp } from './host-job-runner-bounds.ts'
import { askAProcessGroupToStop, osProbe, readFirst, registerResource, releaseResource, theProcessesARegistrationReads, type OsProbe } from './resources.ts'
import { worldNow } from './runtime.ts'
import { underATestRunner } from '@shared/under-a-test-runner.ts'

/** The runner's log: in its own folder beside the database, with its lock and the answer it holds. */
export function theHostJobRunnersLog(): string {
  return join(theHostJobsFolderBeside(keysPathFrom(process.env)), 'runner.log')
}

type HowItEnded = { code: number | null; signal: string | null; error: string | null }

const THE_API_SERVER: Actor = { type: 'agent', id: 'mole-office/the-api-server' }

/** The runner this office started and that has not ended, with how it will end and its row once the ledger holds it. */
let theRunner: { pid: number; pgid: number; ended: Promise<HowItEnded>; rowId: string | null } | null = null
let theWords = 'This office process has not started a host job runner. The office starts one only once it serves, on the port it bound.'

/** What GET /api/host-tools says of the runner: whether one runs, its process, and in words how it stands. */
export function whatTheHostJobRunnerIs(): { running: boolean; pid: number | null; says: string } {
  return { running: theRunner !== null, pid: theRunner?.pid ?? null, says: theWords }
}

/** The words for a runner whose row the ledger refused, which the office then asked to stop. */
export function notFiledSoAskedToStop(pid: number, pgid: number): string {
  return `The host job runner, process ${String(pid)} in a process group of its own (${String(pgid)}), could not be filed in the ledger, so the office asked its group to stop.`
}

/** How a runner ended, in words. */
function howItEndedInWords(how: HowItEnded): string {
  if (how.error !== null) return `because its start failed (${how.error})`
  if (how.signal !== null) return `by the signal ${how.signal}`
  return `with exit code ${String(how.code)}`
}

/** The last line of the runner's log that holds anything, masked as a printed line, or null when there is none. */
function theLastLineOf(logPath: string): string | null {
  let fd: number | null = null
  try {
    const size = statSync(logPath).size
    const length = Math.min(size, 4096)
    const tail = Buffer.alloc(length)
    fd = openSync(logPath, 'r')
    readSync(fd, tail, 0, length, size - length)
    const lines = tail.toString('utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '')
    const last = lines.at(-1)
    return last === undefined ? null : maskedAsAPrintedLine(last)
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

export interface TheHostJobRunnersKeeper {
  /**
   * Asks the runner's group to stop, by the group recorded at its start, and starts no other. It waits for the runner
   * to end, at most THE_STOP_WAIT_MS, and then closes its row.
   */
  stop(): Promise<void>
}

/**
 * KEEP THE HOST JOB RUNNER for as long as this office serves. `sessionRecordId` is the API server's own session row,
 * which the runner's ledger row is filed under; `api` is the address this process answers on. `probe` and `lookMs` are
 * a test's.
 */
export function keepTheHostJobRunner(the: {
  workspaceId: string
  sessionRecordId: string | null
  api: string | null
  checkout: string
  say: (line: string) => void
  probe?: Pick<OsProbe, 'startTheHostJobRunner' | 'platform'>
  lookMs?: number
}): TheHostJobRunnersKeeper {
  const probe = the.probe ?? osProbe()
  const lookMs = the.lookMs ?? THE_LOOK_MS
  const logPath = theHostJobRunnersLog()
  const starts: number[] = []
  let lastEnding: string | null = null
  let stopping = false
  let looking = false

  const say = (now: string): void => {
    const words = lastEnding === null ? now : `${now} ${lastEnding}`
    if (words === theWords) return
    theWords = words
    the.say(`host job runner: ${words}`)
  }

  /** Why this office can start no runner at all, or null when it can. */
  const whyNone = ((): string | null => {
    if (underATestRunner()) return 'This office process runs under a test runner, so it starts no host job runner.'
    if (the.sessionRecordId === null) return 'The API server has no session row of its own, so a host job runner could not be filed in the ledger, and the office starts none.'
    if (the.api === null) return 'This office process has bound no address, so it starts no host job runner.'
    if (probe.startTheHostJobRunner === undefined) return `The office starts no host job runner on ${probe.platform}: only the Linux OS layer can start one so far, so an asked host job waits.`
    try {
      howToStart('host-job-runner')
    } catch (err) {
      return `${err instanceof Error ? err.message : String(err)} An asked host job waits.`
    }
    return null
  })()

  const look = async (): Promise<void> => {
    if (stopping || looking || theRunner !== null) return
    looking = true
    try {
      const read = readTheHostTools(theHostToolsFile())
      if ('refused' in read) return say(`${read.refused} So the office starts no host job runner; it reads the file again every ${String(lookMs / 1000)} seconds.`)
      if (read.tools.length === 0) return say(`No host tool is registered, so the office starts no host job runner; it reads its host-tools.json again every ${String(lookMs / 1000)} seconds.`)
      const now = Date.now()
      while (starts.length > 0 && now - (starts[0] as number) >= THE_WINDOW_MS) starts.shift()
      if (starts.length >= AT_MOST_STARTS) return say(theStartsAreUsedUp(starts.length, localStamp(new Date((starts[0] as number) + THE_WINDOW_MS))))
      starts.push(now)
      const started = localStamp(new Date(now))
      let child: ReturnType<NonNullable<OsProbe['startTheHostJobRunner']>>
      try {
        child = (probe.startTheHostJobRunner as NonNullable<OsProbe['startTheHostJobRunner']>)({
          args: [`--with-the-office=${String(process.pid)}`, '--api', the.api as string],
          cwd: the.checkout,
          logPath,
        })
      } catch (err) {
        lastEnding = `The office could not start the host job runner at ${started}: ${err instanceof Error ? err.message : String(err)}`
        return say('No host job runner runs.')
      }
      const runner = { pid: child.pid, pgid: child.pgid, ended: child.ended, rowId: null as string | null }
      theRunner = runner
      let unfiled: string | null = null
      try {
        const input = {
          workspaceId: the.workspaceId,
          sessionRecordId: the.sessionRecordId as string,
          type: 'process',
          key: String(child.pid),
          detail: 'the Mole Office host job runner',
          world: worldNow(),
          startedByTheProduct: true,
          actor: THE_API_SERVER,
        } as const
        runner.rowId = (await readFirst(() => theProcessesARegistrationReads(input), () => registerResource(input))).id
      } catch (err) {
        unfiled = err instanceof Error ? err.message : String(err)
      }
      if (unfiled === null) {
        say(theRunnerRuns(child.pid, child.pgid, started, logPath))
      } else {
        try {
          await askAProcessGroupToStop(child.pgid)
          say(`${notFiledSoAskedToStop(child.pid, child.pgid)} It was started at ${started}. The ledger said: ${unfiled}`)
        } catch (err) {
          say(
            `The host job runner, process ${String(child.pid)} in a process group of its own (${String(child.pgid)}), started at ${started}, could not be filed in the ledger (${unfiled}), ` +
              `and the office could not ask its group to stop either, so it runs with no row: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
      void child.ended.then(async (how) => {
        theRunner = null
        if (stopping) return
        if (runner.rowId !== null) {
          try {
            await releaseResource(runner.rowId, { actor: { ...THE_API_SERVER, sessionId: the.sessionRecordId as string }, note: 'the host job runner ended' }, the.workspaceId)
          } catch (err) {
            the.say(`host job runner: the row ${runner.rowId} of process ${String(child.pid)}, which ended, could not be closed: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        const last = theLastLineOf(logPath)
        lastEnding =
          `The runner before, process ${String(child.pid)}, ended at ${localStamp(new Date())} ${howItEndedInWords(how)}` +
          (unfiled === null ? '' : ', after the office asked it to stop because its row could not be filed in the ledger') +
          (last === null ? ', and its log holds no line.' : `. The last line of its log was: ${last}`)
        say('No host job runner runs.')
        await look()
      })
    } finally {
      looking = false
    }
  }

  if (whyNone !== null) {
    say(whyNone)
    return { stop: async () => {} }
  }
  void look()
  const timer = setInterval(named('the host job runner watch', (line) => the.say(line), () => void look()), lookMs)
  timer.unref()
  return {
    stop: async () => {
      stopping = true
      clearInterval(timer)
      const running = theRunner
      if (running === null) return
      try {
        await askAProcessGroupToStop(running.pgid)
        the.say(`host job runner: the runner in group ${String(running.pgid)} was asked to stop`)
      } catch (err) {
        the.say(`host job runner: the runner in group ${String(running.pgid)} could not be asked to stop: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      // WAITED FOR, so that its row is closed while this office can still close it. The row is closed only once the
      // process is gone, so nothing is signalled a second time.
      let theWait: ReturnType<typeof setTimeout> | undefined
      const ended = await Promise.race([
        running.ended.then(() => true),
        new Promise<false>((done) => {
          theWait = setTimeout(named("the wait for the host job runner's end", (line) => the.say(line), () => done(false)), THE_STOP_WAIT_MS)
        }),
      ])
      clearTimeout(theWait)
      if (!ended) {
        the.say(`host job runner: the runner in group ${String(running.pgid)} had not ended ${String(THE_STOP_WAIT_MS / 1000)} seconds after it was asked to stop, so its row stays open in the ledger`)
        return
      }
      if (running.rowId === null) return
      try {
        await releaseResource(running.rowId, { actor: { ...THE_API_SERVER, sessionId: the.sessionRecordId as string }, note: THE_NOTE_OF_A_STOPPED_RUNNER }, the.workspaceId)
        the.say(`host job runner: the runner in group ${String(running.pgid)} ended, and its row ${running.rowId} was closed`)
      } catch (err) {
        the.say(`host job runner: the row ${running.rowId} of the runner in group ${String(running.pgid)}, which ended, could not be closed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}
