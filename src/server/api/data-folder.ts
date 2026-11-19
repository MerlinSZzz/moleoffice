// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER DOORS: where the office keeps its data, the press that moves it, and the press that confirms a move.
 *
 *   GET  /api/office/data-folder           where the data is, the mark, and whether this caller may press   (any caller on this computer)
 *   POST /api/office/data-folder/move      the press, {"to": <place>}: start a mover and answer once it is at work (the person, or a secretary under their grant)
 *   POST /api/office/data-folder/confirm   the press: remove the old folder's copied files                          (the person, or a secretary under their grant)
 *
 * src/config/the-data-folder-move.mjs is the mover and the one check both it and this door ask before a move. This
 * door only reads who is pressing, whether a move may start, and starts `data-folder move <to>` in a group of its own,
 * so it outlives the server it stops. Criteria DF18 to DF21 of design/window/the-data-folder-move.criteria.md.
 *
 * THE PERSON, OR A SECRETARY HOLDING THEIR GRANT. Moving the office's data folder moves every file the office keeps,
 * and stopping the office for the copy is the life of the service on their computer, so the card keeps both presses and
 * a secretary presses them only where this office's list of what the grant carries says the grant does. The reading is
 * open to any caller on this computer: it changes nothing, and a page asks it to know whether to draw the presses.
 *
 * NO PRESS STARTS ANYTHING IN A TEST WORLD, because a move would stop the office the world runs from and the confirm
 * would remove files in a folder that is deleted with the world. Every press stays on this machine: the folder, the
 * `.env`, the mark and the process it starts are this computer's own.
 */

import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { REPO_ROOT, THE_INSTALL } from '../../config/settings.mjs'
import { readStartAtLogin, theOfficeThisServerIs } from '../../config/start-at-login.mjs'
import {
  confirmTheMove,
  readTheMoveMark,
  readWhetherTheMoverIsAlive,
  theChosenByWords,
  theEnvironmentTheMoverIsHanded,
  theFactsOfAMove,
  theMoveMarkPath,
  theMoverIsAlive,
  theDriveOfAPlace,
  theMoverLogPath,
  whereTheDataIs,
  whyAMoveThereIsRefused,
  type ADriveReading,
} from '../../config/the-data-folder-move.mjs'
import { THIS_PLATFORM } from '../../config/the-paths-of-a-system.mjs'
import type { DataFolderConfirmed, DataFolderMoveStarted, DataFolderReading, TheMarkInTheReading } from '../../shared/data-folder.ts'
import type { ALiveRun } from '../../shared/shutting-down.ts'
import type { CodedRefusal, DataFolderRefusalCode } from '../../shared/refusal-codes.ts'
import { theHomeDirectory } from '../lib/adapters/index.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { named } from '../lib/named-timers.ts'
import { theLiveRuns } from '../lib/pausing.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, mayPressForThePerson, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { osProbe, registerResource, type OsProbe } from '../lib/resources.ts'
import { route } from '../lib/route.ts'
import { database } from '../lib/runtime.ts'
import { theWorldsOwnAuthority } from '../lib/worldauthority.ts'

export {
  theEarlierDataFoldersOfTheMark,
  theStoredFilesNeedTheMarkWords,
  theStoredFileNeedsTheMarkRefusal,
  type TheEarlierDataFoldersCannotBeKnown,
} from '../lib/the-earlier-data-folders.ts'

const READ_NOTE =
  'WHERE THE OFFICE KEEPS ITS DATA ON THIS COMPUTER, the state of the last move, and whether this caller may press. ' +
  'The folder, the database and who chose the folder are answered from this computer\'s `.env` and environment, the ' +
  'mark from the per-user folder, and the two presses from the same check they will ask. With `?to=<place>` it also ' +
  'answers whether a move there would be refused, with the sentence. Any caller on this computer may read it, and it ' +
  'changes nothing.'

const MOVE_NOTE =
  'MOVE THE OFFICE\'S DATA FOLDER TO ANOTHER PLACE ON THIS COMPUTER. Only the proved person may press, or a secretary ' +
  'holding the person\'s grant where this office\'s list of what the grant carries says the grant presses it, and a ' +
  'test world is refused. Body {"to": <place>}. It is refused with a code and starts nothing when this office does ' +
  'not run from an installed bundle, when an agent run the office started is still at work, and when the mover\'s own ' +
  'check refuses the place. Otherwise it starts `data-folder move <place>` in a group of its own, so the mover outlives ' +
  'the server it stops, hands it the server\'s environment without the names the `.env` load supplied, and writes its ' +
  'output to `data-folder-move.log` beside the mark. It registers the mover in the process ledger and answers 202 once ' +
  'the mark names the mover alive. The office stops for the move, so the page asks again until the office answers.'

const CONFIRM_NOTE =
  'REMOVE THE OLD DATA FOLDER\'S COPIED FILES AFTER A MOVE ON THIS COMPUTER. Only the proved person may press, or a ' +
  'secretary holding the person\'s grant where this office\'s list of what the grant carries says the grant presses ' +
  'it, and a test world is refused. It takes no body. It removes only the names the mark lists whose bytes still match, ' +
  'then the folders left empty, keeps and names everything else, and answers what it removed and what it kept. It is ' +
  'refused, and changes nothing, unless the mark says the move started and this office runs from the mark\'s new folder.'

const theMovePress = z.object({ to: z.string().min(1).max(10_000) }).strict()
const theReadingQuestion = z.strictObject({ to: z.string().max(10_000).optional() })

/** A refusal of these doors, with its code, so the page draws it in its own language. */
function aRefusal(code: DataFolderRefusalCode, sentence: string, status: number, values: Record<string, string> = {}): PanelError {
  return new PanelError(sentence, status, undefined, undefined, undefined, { code, values } as CodedRefusal)
}

/**
 * THE ONE PERSON-ONLY CHECK OF THIS FILE, asked first by both presses, before anything else is read. The person first,
 * then the grant this office's list may open the door to, and the old refusal otherwise. A refusal of the grant's own
 * check is thrown again with its code, so the page draws the check's sentence.
 */
function onlyThePerson(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor)) return
  try {
    if (aRaiseCarriesIt(actor)) return
  } catch (err) {
    // THE GRANT'S CHECK REFUSED: its sentence and status are the refusal's own, and the page draws its code.
    if (err instanceof PanelError) throw aRefusal('dataFolderNotUnderTheGrant', err.message, err.status, { why: err.message })
    throw err
  }
  try {
    assertThePersonIsProved(
      actor,
      doing,
      'Only the person may move the office\'s data folder or confirm a move, or a secretary holding the person\'s grant ' +
        'where this office\'s list of what the grant carries says so. Any other agent is refused.',
      'Nothing was started or changed.',
    )
  } catch (err) {
    if (err instanceof PanelError) throw aRefusal('dataFolderOnlyThePerson', err.message, err.status)
    throw err
  }
}

/** The mover's process, as the system layer starts it. The door starts no process of its own. */
type TheMoversProcess = ReturnType<NonNullable<OsProbe['startTheDataFolderMover']>>

/** What each route hands the door, and what a test hands in its place. */
export interface TheWaysToMove {
  /** The server's own session, which the mover's ledger row is filed under. */
  session: string
  workspaceId: string
  /** Whether this office runs from an installed bundle. */
  fromABundle: () => boolean
  /** Where the move's mark is. */
  markPath: () => string
  /** Every agent run the office started that is still at work. */
  runsAtWork: () => ALiveRun[]
  /** Why a move to a place is refused, or null when it may go on. On Windows the answer waits for the drive's type. */
  whyRefused: (to: string) => string | null | Promise<string | null>
  /** Start the mover, in a group of its own. */
  startTheMover: (input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }) => TheMoversProcess
  /** How long the door waits for the mark to name the mover at work. */
  waitMs: number
}

/** The ways this server's doors use, or null because it was given none. */
let thisOfficesWays: TheWaysToMove | null = null

/** Whether a move is starting in this server now. */
let aMoveIsStarting = false

/** Hand the doors the ways a test needs, or null to take them away. */
export function thisOfficeMovesItsDataFolderWith(ways: TheWaysToMove | null): void {
  thisOfficesWays = ways
}

/** The real ways: this office's bundle, mark, runs, check and system layer, and a ten-second wait. */
export function theRealWaysToMove(session: string, workspaceId: string): TheWaysToMove {
  return {
    session,
    workspaceId,
    fromABundle: () => THE_INSTALL.from === 'bundle',
    markPath: () => theMoveMarkPath(),
    runsAtWork: () => theLiveRuns().pausable,
    whyRefused: (to) => {
      const ask = (drive: ADriveReading): string | null =>
        whyAMoveThereIsRefused(
          to,
          theFactsOfAMove(to, readStartAtLogin({ home: theHomeDirectory(), office: theOfficeThisServerIs() }), undefined, drive),
        )
      // OFF WINDOWS NO DRIVE IS READ, so the answer comes at once, as it did before.
      return THIS_PLATFORM === 'win32' ? theDriveOfAPlace(to).then(ask) : ask(null)
    },
    startTheMover: (input) => {
      // CALLED ON THE PROBE: the method reads the probe's own system, so a copy of it taken off the probe has none.
      const probe = osProbe()
      if (probe.startTheDataFolderMover === undefined) {
        throw new PanelError(theNoWayToStartWords(), 503, undefined, undefined, undefined, {
          code: 'dataFolderNoWayToStart',
          values: {},
        } as CodedRefusal)
      }
      return probe.startTheDataFolderMover(input)
    },
    waitMs: 10_000,
  }
}

// ------------------------------------------------------------ the sentences a person reads

/** Why a move is refused in a test world. */
export function theTestWorldWords(): string {
  return (
    'This Mole Office is a test world. A data folder move here would stop the office the world runs from, and the ' +
    'confirm would remove files in a folder that is deleted with the world. Nothing was started and nothing was ' +
    'changed. Press it on the office itself.'
  )
}

/** Why a move is refused when this server has no way to start the mover. */
export function theNoWayToStartWords(): string {
  return 'This server was not given a way to start the data folder mover, so no move was started and nothing was changed.'
}

/** Why a move is refused when this office runs from a checkout. */
export function theNotABundleWords(): string {
  return (
    "This office runs from a checkout, and a checkout's data folder is not moved from Settings. Nothing was started " +
    'and nothing was changed.'
  )
}

/** The handles the refusal names, one for each run that is at work. */
export function theRunsAtWorkValues(runs: readonly ALiveRun[]): { runs: string } {
  return { runs: runs.map((run) => run.agent?.handle ?? run.session).join(', ') }
}

/** Why a move is refused while agent runs are at work. */
export function theRunsAtWorkWords(runs: readonly ALiveRun[]): string {
  const { runs: handles } = theRunsAtWorkValues(runs)
  return (
    `The move stops the office for as long as the copy takes, and these agent runs are at work: ${handles}. Nothing ` +
    'was started and nothing was changed. Wait until they have finished.'
  )
}

/** Why a press is refused while another move is already starting in this server. */
export function theMoveStartingWords(): string {
  return (
    'A data folder move is already starting in this server, so this press started nothing and nothing was changed. ' +
    'Wait for the move to be seen at work, or for this server to say it was not.'
  )
}

/** Why a move is refused: the mover's own check's sentence. */
export function theMoveRefusedWords(why: string): string {
  return why
}

/** Why the mover ended before the door saw it at work, with the end of its log. */
export function theMoverEndedWords(log: string): string {
  return `The data folder mover ended before this door saw it at work, so no move was seen to start. Its log ends: ${log}`
}

/** Why the mover wrote no mark the door could see at work, naming its group and its log. */
export function theMoverNotSeenWords(group: string, log: string): string {
  return (
    `The data folder mover started as process group ${group} and wrote no mark this door could see at work. Its log ` +
    `is ${log}. The mover is registered in the process ledger, and this door did not stop it.`
  )
}

/** Why the confirm is refused: the mover's own check's sentence. */
export function theNothingToConfirmWords(why: string): string {
  return why
}

/** What the move press says once the mark names the mover alive. */
export function theMoveStartedWords(pid: number, logPath: string): string {
  return (
    `The data folder mover started as process ${String(pid)}. The office stops now, and the panel asks again until ` +
    `the office answers. The mover writes its log to ${logPath}.`
  )
}

/** What the confirm press says about what it removed and what it kept. A kept name ending in `/` is a folder it could not read or remove. */
export function theMoveConfirmedWords(removed: readonly string[], kept: readonly string[]): string {
  const gone = removed.length === 1 ? '1 copied file was removed' : `${String(removed.length)} copied files were removed`
  const unreadFolders = kept.filter((name) => name.endsWith('/')).length
  const keptFiles = kept.length - unreadFolders
  const stayed = keptFiles === 1 ? '1 file was kept as it is' : `${String(keptFiles)} files were kept as they are`
  const unread =
    unreadFolders === 0
      ? ''
      : unreadFolders === 1
        ? ' 1 folder could not be read or removed, so it was kept with whatever it holds.'
        : ` ${String(unreadFolders)} folders could not be read or removed, so they were kept with whatever they hold.`
  return `The move was confirmed. ${gone}, and ${stayed}.${unread} The old folder is now one of the earlier data folders.`
}

// ------------------------------------------------------------ the helpers

/** The last bytes of a file, or a sentence saying it could not be read. */
function theEndOfTheLog(logPath: string, atMost = 2_000): string {
  try {
    const text = readFileSync(logPath, 'utf8')
    return text.length === 0 ? 'the log has nothing in it' : text.slice(-atMost)
  } catch {
    return 'the log could not be read'
  }
}

/** Whether the mark now is not the one that was read before the mover started. */
function theMarkIsNew(before: ReturnType<typeof readTheMoveMark>, now: ReturnType<typeof readTheMoveMark>): boolean {
  return JSON.stringify(before) !== JSON.stringify(now)
}

/**
 * WAIT FOR THE MARK TO NAME THE MOVER AT WORK, reading it every fifty milliseconds, for the first of: a mark that is
 * new, names the place asked and whose mover is alive; the child's exit; and the ways' wait running out. Every way out
 * clears the timers, drops the exit listeners and lets go of the child.
 */
async function theMoveIsSeenAtWork(input: {
  ways: TheWaysToMove
  child: TheMoversProcess
  markPath: string
  logPath: string
  before: ReturnType<typeof readTheMoveMark>
  to: string
  log: (line: string) => void
}): Promise<DataFolderMoveStarted> {
  const { ways, child, markPath, logPath, before, to, log } = input
  return await new Promise<DataFolderMoveStarted>((resolve, reject) => {
    let settled = false
    let poll: ReturnType<typeof setTimeout> | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    const finish = (answer: () => void): void => {
      if (settled) return
      settled = true
      if (poll !== null) clearTimeout(poll)
      if (deadline !== null) clearTimeout(deadline)
      child.removeListener('exit', onExit)
      child.removeListener('error', onError)
      child.unref()
      answer()
    }
    const onExit = (): void => {
      const end = theEndOfTheLog(logPath)
      finish(() => reject(aRefusal('dataFolderMoverEnded', theMoverEndedWords(end), 409, { log: end })))
    }
    const onError = (): void => {
      const end = theEndOfTheLog(logPath)
      finish(() => reject(aRefusal('dataFolderMoverEnded', theMoverEndedWords(end), 409, { log: end })))
    }
    const look = (): void => {
      if (settled) return
      const now = readTheMoveMark(markPath)
      if (
        now.state === 'read' &&
        now.mark.to === to &&
        theMoverIsAlive(now.mark.mover) &&
        theMarkIsNew(before, now)
      ) {
        finish(() =>
          resolve({
            mover: { pid: now.mark.mover.pid },
            mark: now.mark,
            logPath,
            says: theMoveStartedWords(now.mark.mover.pid, logPath),
          }),
        )
        return
      }
      poll = setTimeout(named('the check for the data folder mover', log, look), 50)
    }
    const ranOut = (): void => {
      const group = String(child.pid)
      finish(() =>
        reject(aRefusal('dataFolderMoverNotSeen', theMoverNotSeenWords(group, logPath), 503, { group, log: logPath })),
      )
    }
    child.once('exit', onExit)
    child.once('error', onError)
    deadline = setTimeout(named('the wait for the data folder mover', log, ranOut), ways.waitMs)
    look()
  })
}

// ------------------------------------------------------------ the routes

export async function dataFolderRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/data-folder',
    route(
      'office.data-folder',
      'local',
      { because: 'acts-on-this-machine', act: 'Reading the office\'s data folder on this computer' },
      READ_NOTE,
    ),
    async (req): Promise<DataFolderReading> => {
      const question = parse(theReadingQuestion, req.query ?? {}, 'The data folder question is not usable:')
      const ways = thisOfficesWays ?? theRealWaysToMove('', '')
      const where = whereTheDataIs()
      const read = readTheMoveMark(ways.markPath())
      const mark: TheMarkInTheReading =
        read.state === 'read' ? { state: 'read', mark: read.mark, moverAlive: await readWhetherTheMoverIsAlive(read.mark.mover) } : read
      const actor = actorFrom(req)
      const theCallerIsThePerson = thePersonIsProved(actor)
      // THE SAME QUESTION THE MOVE AND THE CONFIRM PRESSES ASK, asked without a reason and without marking anything, so
      // reading the panel writes no press row. The door each press is named beside the route's own read: an answer this
      // office set for that door is what decides.
      const mayMove = theCallerIsThePerson || mayPressForThePerson(actor, false, { also: ['office.move-data-folder'] }).may
      const mayConfirm =
        theCallerIsThePerson || mayPressForThePerson(actor, false, { also: ['office.confirm-data-folder-move'] }).may
      return {
        folder: where.folder,
        database: where.database,
        chosenBy: where.chosenBy,
        chosenBySays: theChosenByWords(where.chosenBy),
        fromABundle: ways.fromABundle(),
        mark,
        theCallerIsThePerson,
        mayMove,
        mayConfirm,
        ...(question.to === undefined
          ? {}
          : { wouldRefuse: { to: question.to, why: await ways.whyRefused(question.to) } }),
      }
    },
  )

  app.post(
    '/office/data-folder/move',
    route(
      'office.move-data-folder',
      'local',
      { because: 'acts-on-this-machine', act: 'Moving the office\'s data folder on this computer' },
      MOVE_NOTE,
    ),
    async (req, reply): Promise<DataFolderMoveStarted> => {
      const actor = actorFrom(req)
      // THE ONE PERSON-ONLY CHECK, BEFORE ANYTHING ELSE IS READ.
      onlyThePerson(actor, theActKeptHere(req))
      // A TEST WORLD SERVES FROM A COPY OF THE CHECKOUT THAT IS DELETED WITH IT, and a move would stop the office the
      // world runs from and confirm files in a folder that goes with it.
      if (theWorldsOwnAuthority().inATestWorld) throw aRefusal('dataFolderTestWorld', theTestWorldWords(), 409)
      const ways = thisOfficesWays
      if (ways === null) throw aRefusal('dataFolderNoWayToStart', theNoWayToStartWords(), 503)
      const body = parse(theMovePress, req.body ?? {}, 'The data folder move press is not usable:')
      // A CHECKOUT'S DATA FOLDER IS NOT MOVED FROM SETTINGS: the checkout is a developer's, and the folder is beside it.
      if (!ways.fromABundle()) throw aRefusal('dataFolderNotABundle', theNotABundleWords(), 409)
      // THE MOVE STOPS THE OFFICE FOR AS LONG AS THE COPY TAKES, so no run the office started may be at work.
      const runsAtWork = ways.runsAtWork()
      if (runsAtWork.length > 0) {
        throw aRefusal('dataFolderRunsAtWork', theRunsAtWorkWords(runsAtWork), 409, theRunsAtWorkValues(runsAtWork))
      }
      // THE FLAG IS HELD FROM HERE TO THE ANSWER, so a second press cannot start a second mover.
      if (aMoveIsStarting) throw aRefusal('dataFolderMoveStarting', theMoveStartingWords(), 409)
      aMoveIsStarting = true
      try {
        // THE MOVER'S OWN CHECK, asked while the office still runs. The same function the mover asks, so the door and the
        // mover cannot disagree about a place.
        const refusal = await ways.whyRefused(body.to)
        if (refusal !== null) throw aRefusal('dataFolderMoveRefused', theMoveRefusedWords(refusal), 409, { why: refusal })
        const markPath = ways.markPath()
        const logPath = theMoverLogPath(markPath)
        const before = readTheMoveMark(markPath)
        const child = ways.startTheMover({
          to: body.to,
          cwd: REPO_ROOT,
          logPath,
          env: theEnvironmentTheMoverIsHanded(),
        })
        // THE LEDGER ROW AT ONCE, BEFORE ANY WAIT: a mover that outlives this server must be on the list of what is running.
        try {
          registerResource({
            workspaceId: ways.workspaceId,
            sessionRecordId: ways.session,
            type: 'process',
            key: String(child.pid),
            detail: 'the data folder mover',
            startedByTheProduct: true,
            actor: { type: 'agent', id: 'mole-office/the-api-server' },
          })
        } catch (error) {
          child.unref()
          throw error
        }
        const started = await theMoveIsSeenAtWork({
          ways,
          child,
          markPath,
          logPath,
          before,
          to: body.to,
          log: (line) => req.log.warn(line),
        })
        reply.code(202)
        return started
      } finally {
        aMoveIsStarting = false
      }
    },
  )

  app.post(
    '/office/data-folder/confirm',
    route(
      'office.confirm-data-folder-move',
      'local',
      { because: 'acts-on-this-machine', act: 'Removing the old data folder\'s copied files on this computer' },
      CONFIRM_NOTE,
    ),
    async (req): Promise<DataFolderConfirmed> => {
      onlyThePerson(actorFrom(req), theActKeptHere(req))
      if (theWorldsOwnAuthority().inATestWorld) throw aRefusal('dataFolderTestWorld', theTestWorldWords(), 409)
      takesNoInput(req, 'POST /api/office/data-folder/confirm', 'It takes nothing: the mark says what to remove.')
      // THE DATABASE THIS SERVER OPENED, read from the module that opened the file and not from the settings: a running
      // SQLite connection holds the file it opened, whatever the `.env` has said since.
      const opened = database().path
      // ONLY THE MARK'S OWN REFUSALS are answered as nothing to confirm. A fault after them, such as a mark that
      // cannot be written, comes through as the fault it is.
      const done = confirmTheMove(thisOfficesWays?.markPath() ?? theMoveMarkPath(), opened)
      if ('refused' in done) throw aRefusal('dataFolderNothingToConfirm', theNothingToConfirmWords(done.refused), 409, { why: done.refused })
      return {
        removed: done.removed,
        kept: done.kept,
        says: theMoveConfirmedWords(done.removed, done.kept),
      }
    },
  )
}
