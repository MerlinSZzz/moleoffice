// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOLDING ROWS OF ISOLATED WORLDS THAT ARE NOT RUNNING ARE CLOSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A HOLDING ROW WAS, AND WHY THEY ARE STILL HERE
 * ---------------------------------------------------------------------------------------
 *
 * `tools/isolated-mole-office.mjs start <name>` starts a Mole Office of its own on a copy of the
 * corpus. Until 11 September 2026 a world started without `--show-to-the-person` filed a session
 * record titled `Holding isolated world <name>` and took a seven-day lease on its database and
 * ports so a third party's cleanup would refuse to remove them. The lease design was withdrawn as
 * over-design. The hold and the `holdTheWorld` that wrote it went with it (commit `081f7f50`).
 *
 * THE ROWS THE LEASE WROTE ARE STILL THERE. Problem `2G9jNsuJwJf4`: on the owner's own office on
 * 12 September 2026, 17 rows titled `Holding isolated world …` said `running` for worlds that had
 * been stopped hours or days earlier. The world
 * tool no longer creates them, so nothing will create another; these are the last of them, and
 * nothing was closing them.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST OF WHAT IS RUNNING IS THE TOOL'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * The tool writes one directory per world under `<checkout>/.logs/isolated/<name>/`, and
 * `where.json` in it names the process group of the world's API. `node tools/isolated-mole-office.mjs
 * list` reads those files and says for each whether the API process is alive. This reads the same
 * files and asks that same question — is the process with this number still there — through the one
 * probe Mole Office reads this machine through, so the sweep and the tool cannot disagree about
 * which worlds are up.
 *
 * IT USED TO SEND THE SIGNAL ITSELF, with `process.kill(pid, 0)`, and that put an operating-system
 * access in a file the boundary does not allow one in. `osProbe().processById` answers the identical
 * question — the number names a process, or it does not — without a second reader of the machine.
 *
 * A WORLD WHOSE FILE CANNOT BE READ IS LEFT ALONE. An unknown world is not a stopped one, and
 * closing its row would be the sweep inventing the absence it is supposed to read. The world's own
 * directory name is known even then, so its row is skipped by name.
 *
 * NOTHING IS DELETED. The row is closed with `finished` and the one cause this reading supports:
 * `the world is not running`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { records } from '../db/schema.ts'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import type { TheWorldsStopped } from '@shared/worlds.ts'
import type { PanelRecord } from '@shared/types.ts'
import { listRecords, patchRecord, type Actor } from './records.ts'
// IS THIS PROCESS STILL THERE? The one reader of this machine, rather than a second one here.
import { liveRowById, moleOfficePartOf, osProbe, theHostPidOfAProcessInAContainer, whatHoldsIt } from './resources.ts'
// WHETHER A HOLDING ROW STILL CLAIMS TO BE GOING: own-rows.mjs's check, which reads the states from still-going.mjs.
import { stillGoing } from '../../config/own-rows.mjs'

/** The words every holding row's title begins with, written by the tool once and read here once. */
export const THE_HOLDING_PREFIX = 'Holding isolated world '
/** The prefix with its last character raised by one: the first title after every title that begins with the prefix. */
const THE_PREFIX_RAISED = THE_HOLDING_PREFIX.slice(0, -1) + String.fromCharCode(THE_HOLDING_PREFIX.charCodeAt(THE_HOLDING_PREFIX.length - 1) + 1)

/** The name of a world a holding row stands for, or null because the title is not one. */
export function theWorldAHoldingRowHolds(title: string): string | null {
  if (!title.startsWith(THE_HOLDING_PREFIX)) return null
  const name = title.slice(THE_HOLDING_PREFIX.length).trim()
  return name === '' ? null : name
}

/** One reader of the tool's files, shared by the holding-row sweep and confirmation. */
function theRecordedIsolatedWorlds(folder: string): {
  worlds: Map<string, Record<string, unknown>>
  couldNotRead: Map<string, string>
} {
  const worlds = new Map<string, Record<string, unknown>>()
  const couldNotRead = new Map<string, string>()
  if (!existsSync(folder)) return { worlds, couldNotRead }
  for (const name of readdirSync(folder)) {
    const file = join(folder, name, 'where.json')
    if (!existsSync(file)) continue
    try {
      const where: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof where !== 'object' || where === null || Array.isArray(where)) {
        throw new Error('where.json is not an object')
      }
      worlds.set(name, where as Record<string, unknown>)
    } catch (error) {
      couldNotRead.set(name, error instanceof Error ? error.message : String(error))
    }
  }
  return { worlds, couldNotRead }
}

/**
 * WHICH ISOLATED WORLDS THE TOOL SAYS ARE RUNNING, read from its own `where.json` files.
 *
 * `running` names the worlds whose API process the machine still has. `couldNotRead` names the
 * worlds whose directory exists but whose file could not be read, so the caller leaves their rows
 * alone rather than closing a row for a world it could not check.
 */
export function theRunningIsolatedWorlds(folder: string): { running: Set<string>; couldNotRead: Set<string> } {
  const { worlds, couldNotRead } = theRecordedIsolatedWorlds(folder)
  const running = new Set<string>()
  for (const [name, where] of worlds) {
    const pgid = where['apiPgid']
    const alive = typeof pgid === 'number' && Number.isInteger(pgid) && pgid > 0 && osProbe().processById(pgid) !== null
    if (alive) running.add(name)
  }
  return { running, couldNotRead: new Set(couldNotRead.keys()) }
}

/**
 * CONFIRM RELEASES THIS RUN'S TEST WORLDS, not every run of its agent (FrF3zyjDmnOE).
 * C31/C32 keep worlds shown to the person up for their look. An agent writes where.json, so its
 * numbers are not authority to signal: every member must work in this checkout and the leader
 * must be an API or Vite. Sandbox numbers go through the ledger's existing namespace reader.
 * Nothing in the checkout is written or removed. A failed check or signal is reported, never
 * allowed to undo or block the confirmation already committed by the caller.
 */
export function stopTheUnshownWorldsOfARun(run: PanelRecord): TheWorldsStopped {
  const outcome: TheWorldsStopped = { says: '', stopped: [], leftForThePerson: [], notChecked: [] }
  try {
    const directory = run.data['workingDirectory']
    if (typeof directory !== 'string' || directory.trim() === '') {
      return { ...outcome, says: 'No working directory was recorded for this run, so no test worlds were stopped.' }
    }
    const folder = join(directory, '.logs', 'isolated')
    if (!existsSync(folder)) return { ...outcome, says: 'This run has no isolated-world folder, so no test worlds were stopped.' }
    const { worlds, couldNotRead } = theRecordedIsolatedWorlds(folder)
    outcome.notChecked.push(...couldNotRead.keys())
    const sentences = [...couldNotRead].map(([name, why]) => `World "${name}" could not be checked: ${why}.`)
    const probe = osProbe()
    for (const [name, where] of worlds) {
      if (where['worldAtTheOffice'] || where['registeredWith']) {
        outcome.leftForThePerson.push(name)
        sentences.push(`World "${name}" was left for the person.`)
        continue
      }
      // THE LEDGER IS ASKED FIRST: stopping a world frees its two ports, so a live world the ledger says holds
      // either of them, or the world's database, keeps this one up.
      const ports = [where['apiPort'], where['webPort']]
      const database = where['db']
      if (!ports.every((one) => typeof one === 'number' && Number.isInteger(one) && one > 0) || typeof database !== 'string' || database === '') {
        outcome.notChecked.push(name)
        sentences.push(`World "${name}" was not stopped: its where.json does not name both ports and its database, so the ledger could not be asked whether a live world holds them.`)
        continue
      }
      const held = whatHoldsIt({ ports: ports as number[], database })
      if (held.holders.length > 0) {
        outcome.notChecked.push(name)
        sentences.push(`World "${name}" was not stopped, because the ledger says a live world holds what stopping it would free. ${held.says}`)
        continue
      }
      const groups: string[] = []
      for (const [field, group] of [['apiPgid', 'API group'], ['webPgid', 'browser group']] as const) {
        try {
          const recorded = where[field]
          if (typeof recorded !== 'number' || !Number.isInteger(recorded) || recorded <= 0) {
            throw new Error(`${group} id is not a positive whole number`)
          }
          let pgid = recorded
          const sandbox = run.data['sandbox']
          if (sandbox !== undefined && sandbox !== null) {
            const container = typeof sandbox === 'object' ? (sandbox as Record<string, unknown>)['container'] : null
            const row = typeof container === 'string' ? liveRowById(container, run.workspaceId) : null
            if (row === null || row.entry.type !== 'container') throw new Error('the sandbox has no live container row')
            pgid = theHostPidOfAProcessInAContainer(row.entry.key, recorded, probe).hostPid
          }
          // FrF3zyjDmnOE, chapter 2: an agent's recorded number must never stop the office itself.
          if (pgid === probe.ownProcessGroup()) {
            throw new Error(`this is Mole Office's own process group, ${pgid}, so it cannot be stopped`)
          }
          const members = probe.processesInGroup(pgid)
          if (members.length === 0) {
            groups.push(`${group} is already gone`)
            continue
          }
          const leader = members.find((one) => one.pid === pgid && one.pgid === pgid)
          if (!leader) throw new Error('the group leader could not be read')
          // FrF3zyjDmnOE, chapter 2: a stale where.json may name a later group with the same command
          // and folder. localStampOf writes startedAt after both processes are up, without a zone.
          // tools/sandbox.mjs sets and checks TZ to this machine's zone for every sandbox, so this
          // machine's local time reader also reads a sandbox world's stamp in the zone that wrote it.
          const recordedStart = typeof where['startedAt'] === 'string' ? parseStoredStamp(where['startedAt']) : null
          if (recordedStart === null) throw new Error('where.json startedAt is missing or could not be read')
          const leaderStart = parseStoredStamp(leader.startedAt)
          if (leaderStart === null) throw new Error('the group leader start time could not be read')
          if (leaderStart > recordedStart) {
            throw new Error(`the group leader started at ${leader.startedAt}, after where.json startedAt ${where['startedAt']}`)
          }
          const part = moleOfficePartOf(leader.command)
          const servesDev = /(?:^|\s)(?:\S*\/)?tools\/serve-dev\.mjs(?:\s|$)/.test(leader.command) &&
            !/^(?:\S*\/)?(?:ba)?sh\s+-c(?:\s|$)/.test(leader.command)
          if (!servesDev && part !== 'the API server' && part !== 'the server watcher' && part !== 'the browser app') {
            throw new Error('the leader is not a world API or Vite')
          }
          const table = probe.processTable?.()
          if (!table || !table.ok) throw new Error(table?.reason ?? 'the probe cannot read process working directories')
          for (const member of members) {
            const cwd = table.processes.find((one) => one.pid === member.pid)?.cwd
            if (member.pgid !== pgid || cwd !== directory) {
              throw new Error(`process ${member.pid} works in ${cwd ?? 'a folder that could not be read'}, outside the run checkout ${directory}`)
            }
          }
          probe.killProcessGroup(pgid, 'SIGTERM')
          if (!outcome.stopped.includes(name)) outcome.stopped.push(name)
          groups.push(`${group} was stopped with SIGTERM`)
        } catch (error) {
          if (!outcome.notChecked.includes(name)) outcome.notChecked.push(name)
          groups.push(`${group} could not be checked or stopped: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      sentences.push(`World "${name}": ${groups.join('; ')}.`)
    }
    return { ...outcome, says: sentences.length === 0 ? 'This run holds no recorded test worlds, so none were stopped.' : sentences.join(' ') }
  } catch (error) {
    return { ...outcome, says: `The run's test worlds could not be checked: ${error instanceof Error ? error.message : String(error)}. The run is closed either way.` }
  }
}

/**
 * CLOSE EVERY HOLDING ROW WHOSE WORLD THE TOOL DOES NOT SHOW AS RUNNING.
 *
 * It returns the ids it closed. A world on the list, and a world whose file could not be read, are
 * both left exactly as they are.
 */
export function closeTheHoldingRowsOfWorldsThatAreGone(input: {
  workspaceId: string
  /** The tool's `.logs/isolated` directory: one subdirectory per world. */
  folder: string
  now: Date
  actor: Actor
}): string[] {
  const { running, couldNotRead } = theRunningIsolatedWorlds(input.folder)
  const stamp = localStamp(input.now)
  const closed: string[] = []
  // ONLY THE ROWS WHOSE TITLE BEGINS AS A HOLDING ROW'S DOES ARE READ, by the title column and with no JSON parsed;
  // `theWorldAHoldingRowHolds` still decides. Reading every session row for these few was 90 ms of every minute at the
  // live counts (wave 13y round 16). AS A RANGE OF TITLES, so SQLite reads them by `records_title_idx` (workspace, title):
  // under the column's binary order a title begins with the prefix exactly when it lies between the prefix and the prefix
  // with its last character raised by one. As `substr` it read every session title of the project, 7.4 ms of each
  // minute on a made-up office of the live size, against under 0.1 ms (wave 13y round 21).
  const titledAsAHold = sql`${records.title} >= ${THE_HOLDING_PREFIX} AND ${records.title} < ${THE_PREFIX_RAISED}`
  for (const record of listRecords({ workspaceId: input.workspaceId, kind: 'session', alsoWhere: titledAsAHold })) {
    const name = theWorldAHoldingRowHolds(record.title)
    if (name === null) continue
    if (!stillGoing(record)) continue
    if (running.has(name) || couldNotRead.has(name)) continue
    patchRecord(
      record.id,
      {
        dataPatch: {
          state: 'finished',
          closedAt: stamp,
          closedBecause: 'the world is not running',
          closedHow: 'went-stale',
        },
      },
      input.actor,
    )
    closed.push(record.id)
  }
  return closed
}
