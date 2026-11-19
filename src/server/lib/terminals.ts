// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER'S SIDE OF THE OFFICE'S TERMINALS: IT ASKS THE HOLDER, AND RECORDS IT. Wave 13u, round 1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The terminals are held by the terminal holder, a process of its own (src/holder/index.mjs), so they
 * keep running while this server restarts. This module is how the server reaches it: one connection
 * per request, made and closed for it, and one connection held open for each viewer of a terminal.
 * Nothing here is kept between requests, so a server that has just restarted reaches the holder the
 * same way as one that has run for a week. Where the holder's socket is, and the words it speaks, are
 * in src/config/the-terminal-holder.mjs.
 *
 * Who may do what is decided in src/server/api/terminals.ts, not here and not in the holder.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLDER IN THE PROCESS LEDGER
 * ---------------------------------------------------------------------------------------
 *
 * The service command starts the holder, before the server, and cannot write to the office. So the
 * server records it: at start, and again whenever it reaches a holder that is not the one it last
 * recorded. It files a session row titled THE_TERMINAL_HOLDER carrying the holder's pid and start
 * time, and a process row under it, as it does for its message worker. A row already standing for the
 * same process (the same pid and start time) is kept, so a server restart does not file the holder
 * twice. Earlier rows of the holder are closed as replaced. The holder is stopped through the ledger's
 * one release door, POST /api/resources/:id/release, which signals its process group.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { REPO_ROOT, settingValue, settings } from '../../config/settings.mjs'
import { askTheHolder, ONE_REQUEST_MS, THE_HOLDER_PROTOCOL, theTerminalHolderLog, theTerminalHolderSocket, howTheHolderIsNotThisCopys } from '../../config/the-terminal-holder.mjs'
import { thisSystem, type ASystem } from '../../config/systems/the-system.mjs'
import { theSameSpelling } from '../../config/the-paths-of-a-system.mjs'
import { theBoundPort } from './bound-address.ts'
import { announce } from './events.ts'
import type { AgentPaneRefusalCode, AgentStepsRefusalCode, CodedRefusal, TerminalAgentRefusalCode, TerminalGrantRefusalCode, TerminalHolderRestartRefusalCode, TerminalRefusalCode, TerminalTypedForAnotherRefusalCode, WayBackRefusalCode } from '@shared/refusal-codes.ts'
import { createRecord, listRecords, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { THE_TERMINAL_HOLDER, theOwnPartBlock, theOwnPartUsageReceipt, closeTheEarlierOwnRows, theProcessesTheEarlierOwnRowsCloseReads, type OwnPart } from './own-rows.ts'
import { theRecordedProcessOf } from '../../config/own-rows.mjs'
import { liveRowsOfKey, osProbe, readAProcess, readFirst, registerResource, theGroupsOf, type AProcessToRead, type LedgerEntry } from './resources.ts'
import { readTheGroupItsParentNames } from '../../config/systems/windows-groups.mjs'
import { worldNow } from './runtime.ts'

/** How the server signs what it writes about the holder, here and in lib/the-holders-restart.ts. */
export const THE_SERVER: Actor = { type: 'agent', id: 'mole-office/the-api-server' }

/** One terminal, and where the holder stands: the shapes are shared with the pages. */
export type { HolderState, TerminalReading } from '@shared/terminals.ts'
import type { HolderState } from '@shared/terminals.ts'
import type { TerminalParty, TerminalReading } from '@shared/terminals.ts'
import { sqlite } from '../db/client.ts'
import { theCanonicalAgentId } from './registry-aliases/worker-runs.ts'

/** The holder, as its hello describes it. */
export interface HolderHello {
  protocol: number
  pid: number
  startedAt: string | null
  database: string
  /**
   * The requests newer than the protocol that the holder names (UNDERSTANDS in src/holder/index.mjs). A holder with no
   * list is older than every one of them, and a request it does not name is never sent to it.
   */
  understands?: string[]
  /** Set only by a read that may return another copy's holder: the copy it names, and the office's sentence about it. */
  anotherCopy?: { copy: string; says: string }
}

/**
 * A REFUSAL A TERMINAL PAGE CAN MEET, with its code, so the page draws it in its own language (src/shared/
 * refusal-codes.ts, TERMINAL_REFUSAL_CODES and TERMINAL_GRANT_REFUSAL_CODES). The English sentence stays for an agent and Developer mode.
 */
export function aTerminalRefusal(
  code:
    | TerminalRefusalCode
    | TerminalGrantRefusalCode
    | TerminalAgentRefusalCode
    | WayBackRefusalCode
    | AgentPaneRefusalCode
    | AgentStepsRefusalCode
    | TerminalHolderRestartRefusalCode
    | TerminalTypedForAnotherRefusalCode,
  sentence: string,
  status: number,
  reason?: string,
): PanelError {
  // EVERY CODE HERE TAKES NO VALUES. The union is too wide for the type checker to match it to CodedRefusal case by case.
  return new PanelError(sentence, status, undefined, undefined, reason, { code, values: {} } as CodedRefusal)
}

/** The code of a refusal the holder answered, from the code the holder gave it. */
function theHoldersRefusal(answer: Record<string, unknown>): PanelError {
  const sentence = String(answer['error'])
  if (answer['code'] === 'no-such-terminal') return aTerminalRefusal('terminalNotHeld', sentence, 400)
  if (answer['code'] === 'ended') return aTerminalRefusal('terminalEnded', sentence, 400)
  // A LINE THE PERSON HAS HALF TYPED is about the terminal as it stands, not about the request, so it is a conflict.
  if (answer['code'] === 'half-typed') return aTerminalRefusal('terminalLineHalfTyped', sentence, 409)
  return new PanelError(sentence, 400)
}

/** The socket of the holder of this office's database. */
export function theHolderSocket(): string {
  return theTerminalHolderSocket(settings().databasePath)
}

/**
 * ASK THE HOLDER ONE THING. An answer with `ok: false` is the holder refusing, and becomes a 400 with
 * its own sentence. No holder at all is a 503 that says so; a holder that does not answer in time is a
 * 504. Nothing is retried and nothing is guessed. Each terminal the answer holds is read as asTheOfficeReadsIt says.
 */
export async function askTheHolderFor(request: Record<string, unknown>, waitMs: number = ONE_REQUEST_MS): Promise<Record<string, unknown>> {
  let answer: Record<string, unknown> & { ok: boolean }
  try {
    answer = await askTheHolder(theHolderSocket(), request, waitMs)
  } catch (err) {
    const code = (err as { code?: string }).code
    const sentence = err instanceof Error ? err.message : String(err)
    if (code === 'absent' || code === 'refused') {
      throw aTerminalRefusal('terminalHolderNotRunning', `${sentence} So no terminal can be opened, read or typed into.`, 503, 'No terminal holder is running.')
    }
    if (code === 'silent') throw aTerminalRefusal('terminalHolderNoAnswer', sentence, 504)
    throw aTerminalRefusal('terminalHolderUnusable', sentence, 502)
  }
  if (!answer.ok) throw theHoldersRefusal(answer)
  const terminal = answer['terminal']
  if (isAReading(terminal)) answer['terminal'] = asTheOfficeReadsIt(terminal)
  const terminals = answer['terminals']
  if (Array.isArray(terminals)) answer['terminals'] = terminals.map((one: unknown) => (isAReading(one) ? asTheOfficeReadsIt(one) : one))
  return answer
}

const isAReading = (value: unknown): value is TerminalReading => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A TERMINAL AS THE OFFICE READS IT, after a re-mint as before one (item 30c part 3, the holder reread). The holder keeps
 * a terminal's opener and agent as the server gave them when it opened, and it never restarts, so a terminal opened
 * before a re-mint names its agent by the old id. Each party of kind agent is read here as the canonical registry id that
 * its stored id names, through the filed aliases and never by a handle. An id that no alias owns is kept as the holder
 * holds it: the agent's current id, or an id that names nobody. A person is not read here, and the holder's own memory
 * is not changed. Every terminal the server reads from the holder is read here first: the answers of askTheHolderFor
 * and the first answer of watchATerminal.
 */
function asTheOfficeReadsIt(reading: TerminalReading): TerminalReading {
  const read = (party: TerminalParty | null): TerminalParty | null => (party?.kind === 'agent' ? { ...party, id: theCanonicalAgentId(sqlite, party.id) } : party)
  return { ...reading, who: read(reading.who), agent: read(reading.agent) }
}

/**
 * HOW LONG THE TERMINALS PAGE'S READ WAITS FOR THE HOLDER, for its hello and again for its list (wave 13u, round 8).
 * The holder answers from memory in a few milliseconds, so a holder that takes longer is stuck, and the page says
 * that it did not answer within this time rather than looking stuck itself. No holder at all is answered at once:
 * there is no socket, or nobody listens on it, and the connection is refused without any wait.
 */
export const THE_PAGES_HOLDER_READ_MS = 1_000

/** How much of the end of the holder's log is read for its last line. */
const THE_END_OF_THE_LOG_BYTES = 4096

/**
 * The last line of the holder's log: `null` when there is no log file, and `unread` with the reason when
 * one is there and could not be read, so "the holder has written no log" is said only when that is true.
 */
export function theHoldersLastWord(): { lastWord: string | null; logUnread: string | null } {
  let fd: number | null = null
  try {
    fd = openSync(theTerminalHolderLog(settings().databasePath), 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, THE_END_OF_THE_LOG_BYTES)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '')
    return { lastWord: lines.length === 0 ? null : lines[lines.length - 1]!, logUnread: null }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { lastWord: null, logUnread: null }
    return { lastWord: null, logUnread: err instanceof Error ? err.message : String(err) }
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * WHERE THE HOLDER STANDS, in one of four states (src/shared/terminals.ts), worked out here for every reader: the list door, the
 * health check (and through it the self-check), and so the pages.
 *
 * - `running`: a holder answers for this database and speaks this server's words.
 * - `off`: none answers, and MOLE_OFFICE_TERMINAL_HOLDER is off, so none was meant to be started.
 * - `not running`: none answers. `says` is why it could not be reached, and `lastWord` is the last line
 *   of the holder's log: its own last sentence, such as why it could not start, or that it stopped. It
 *   is null when there is no log to read. The log holds no terminal output, only when the holder and
 *   each terminal started and ended.
 * - `unusable`: something answers, but it speaks other words or holds another database, so nothing is
 *   asked of it. `says` is the server's sentence.
 *
 * No holder is never read as an empty list of terminals: the person is told that there is no holder.
 */
export async function theHolderState(waitMs: number = ONE_REQUEST_MS, record: 'record' | 'do not record' = 'record'): Promise<HolderState> {
  try {
    const hello = await theHolder(waitMs, record, 'return it')
    watchWhatAnswersForTheHolder()
    if (hello.anotherCopy !== undefined) return { state: 'unusable', says: hello.anotherCopy.says, noAnswerWithinMs: null, anotherCopy: { copy: hello.anotherCopy.copy, pid: hello.pid, startedAt: hello.startedAt } }
    return { state: 'running', pid: hello.pid, startedAt: hello.startedAt }
  } catch (err) {
    if (!(err instanceof PanelError)) throw err
    // SOMETHING ANSWERED, as a holder this office cannot use or one that does not answer in time, so its end is watched too.
    if (err.status === 504 || err.status === 502) watchWhatAnswersForTheHolder()
    // A HOLDER THAT DOES NOT ANSWER IN TIME (504) is there and cannot be used, which is not "not running".
    if (err.status === 504) return { state: 'unusable', says: err.message, noAnswerWithinMs: waitMs }
    if (err.status === 502) return { state: 'unusable', says: err.message, noAnswerWithinMs: null }
    if (settingValue('MOLE_OFFICE_TERMINAL_HOLDER') === 'off') {
      return { state: 'off', says: 'No terminal holder runs, because MOLE_OFFICE_TERMINAL_HOLDER is off, so none is started.' }
    }
    const log = theHoldersLastWord()
    return { state: 'not running', says: err.message, lastWord: log.lastWord, logUnread: log.logUnread }
  }
}

/**
 * ONE CONNECTION IS KEPT OPEN TO WHAT ANSWERS ON THE HOLDER'S SOCKET, so the office knows when it ends (wave 13y round
 * 147, item 102 added). The owner's old holder ended while Terminal management was open, and the page kept saying that a
 * program answered and could not be used, because nothing told it otherwise.
 *
 * A read that finds something answering opens the connection, whether it is a holder the office can use or not. Nothing
 * is asked on it. When the program ends, the connection closes, and every open page is told that where the holder
 * stands changed. The next read opens it again. A new holder is told by `theHolder` when it records one. A holder started
 * outside the office, by a command in a shell, is noticed only when a door next asks the holder.
 */
let theWatchOfTheHolder: Socket | null = null

function watchWhatAnswersForTheHolder(): void {
  if (theWatchOfTheHolder !== null) return
  const socket = createConnection(theHolderSocket())
  theWatchOfTheHolder = socket
  // The connection holds no request, so it must not keep the server from stopping.
  socket.unref()
  // A failed connection closes too, and the close says it.
  socket.on('error', () => undefined)
  socket.once('close', () => {
    theWatchOfTheHolder = null
    tellThePagesWhereTheHolderStandsChanged("What answered on the terminal holder's socket ended.")
  })
}

/** Tell every open page that where the holder stands changed, so Terminal management reads it again. */
function tellThePagesWhereTheHolderStandsChanged(because: string): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['terminals'], about: null, groupId: null, because })
}

/** The pid and start time of the holder this server last recorded in the ledger, so it is recorded once. */
let theHolderRecorded: { pid: number; startedAt: string | null } | null = null

/**
 * WHO THE HOLDER IS, and a ledger row for it if it is not the one already recorded. A holder that
 * speaks other words than this server is refused by name, rather than half understood. So is one from
 * another copy of Mole Office (whyTheHolderIsNotThisCopys in src/config/the-terminal-holder.mjs).
 */
export async function theHolder(waitMs: number = ONE_REQUEST_MS, record: 'record' | 'do not record' = 'record', anotherCopys: 'refuse' | 'return it' = 'refuse'): Promise<HolderHello> {
  const answer = await askTheHolderFor({ op: 'hello' }, waitMs)
  const hello: HolderHello = {
    protocol: Number(answer['protocol']),
    pid: Number(answer['pid']),
    startedAt: typeof answer['startedAt'] === 'string' ? answer['startedAt'] : null,
    database: String(answer['database']),
  }
  const understands = answer['understands']
  if (Array.isArray(understands) && understands.every((one) => typeof one === 'string')) hello.understands = understands
  if (hello.protocol !== THE_HOLDER_PROTOCOL) {
    throw aTerminalRefusal(
      'terminalHolderUnusable',
      `The terminal holder, process ${String(hello.pid)}, speaks version ${String(hello.protocol)} of the holder's words, and this ` +
        `server speaks version ${String(THE_HOLDER_PROTOCOL)}. Nothing was asked of it. Stopping it ends its terminals.`,
      502,
    )
  }
  if (hello.database !== settings().databasePath) {
    throw aTerminalRefusal(
      'terminalHolderUnusable',
      `The terminal holder on ${theHolderSocket()} holds terminals for the database ${hello.database}, not this office's ` +
        `${settings().databasePath}. Nothing was asked of it.`,
      502,
    )
  }
  const fault = howTheHolderIsNotThisCopys(answer)
  if (fault !== null) {
    if (anotherCopys === 'return it' && fault.mayBeReplaced) {
      hello.anotherCopy = { copy: fault.copy, says: fault.says }
      return hello
    }
    throw aTerminalRefusal('terminalHolderUnusable', `${fault.says} Nothing was asked of it.`, 502)
  }
  if (record === 'record' && (theHolderRecorded === null || theHolderRecorded.pid !== hello.pid || theHolderRecorded.startedAt !== hello.startedAt)) {
    // MARKED AS RECORDED BEFORE THE WAIT BELOW, so a second hello answered meanwhile does not record it again. A record
    // that failed is marked as not made.
    const before = theHolderRecorded
    const mine = { pid: hello.pid, startedAt: hello.startedAt }
    theHolderRecorded = mine
    try {
      await readFirstAndRecordTheHolder(hello)
    } catch (failed) {
      if (theHolderRecorded === mine) theHolderRecorded = before
      throw failed
    }
    tellThePagesWhereTheHolderStandsChanged(`The terminal holder, process ${String(hello.pid)}, answered, and the office recorded it.`)
    // THE AGENTS IN TERMINALS ARE BROUGHT INTO STEP WITH THIS HOLDER (wave 13u, round 3): those an earlier holder held
    // are opened again with their resume command, and the person is told. Read lazily, because that module asks this
    // one for the holder. It never throws.
    const { reconcileTheAgentsInTerminals } = await import('./terminal-agents.ts')
    await reconcileTheAgentsInTerminals(hello)
  }
  return hello
}

/** What typing a line for somebody else answered: whether its Enter was sent, and how many ended lines wait to be taken. */
export type TypedForAnother =
  | { entered: true; linesToTake: number }
  | { entered: false; why: 'ended' | 'the-person-typed' | 'the-person-ended-the-line'; linesToTake: number }

/**
 * TYPE ONE LINE AND ITS ENTER INTO A TERMINAL FOR SOMEBODY OTHER THAN THE PERSON (wave 13s, round 83). The holder never
 * reads it as the person's typing (typeALine in src/holder/index.mjs). Who may ask for it is decided by the door.
 *
 * The holder's hello is read first, and a holder that does not name typeALine is refused before anything is sent. It
 * started before the request was added, and it would answer only that it does not know the request. A line the person
 * has half typed is refused with a code of its own (theHoldersRefusal). The holder does not press Enter when the person
 * typed in its pause, nor when the person ended the line in it, and says which (round 86). `linesToTake` is above 0 when
 * keeping is on.
 * The secretary's door does not take them: they wait for the person's next typed line, whose door takes them, and the
 * line typed here is only counted among them, never kept. If the person turns keeping off before then, the holder lets
 * those lines go, and the count of the line typed here goes with them.
 */
export async function typeALineForSomebodyElse(terminal: string, text: string): Promise<TypedForAnother> {
  const hello = await theHolder()
  if (!(hello.understands ?? []).includes('typeALine')) {
    throw aTerminalRefusal(
      'terminalHolderTooOld',
      `The terminal holder that runs now, process ${String(hello.pid)}, is older than this office and cannot type a line ` +
        `for somebody else. Nothing was typed into terminal ${terminal}. Restarting the holder ends every terminal the ` +
        'person has open.',
      409,
    )
  }
  const answer = await askTheHolderFor({ op: 'typeALine', terminal, text })
  const linesToTake = answer['linesToTake']
  const why = answer['why']
  if (typeof linesToTake === 'number' && answer['entered'] === true) return { entered: true, linesToTake }
  if (
    typeof linesToTake === 'number' &&
    answer['entered'] === false &&
    (why === 'ended' || why === 'the-person-typed' || why === 'the-person-ended-the-line')
  ) {
    return { entered: false, why, linesToTake }
  }
  throw aTerminalRefusal(
    'terminalHolderUnusable',
    `The terminal holder answered in words this server does not read when it was asked to type a line into terminal ` +
      `${terminal}. The line may have been typed, and whether its Enter was sent is not known.`,
    502,
  )
}

/** The standing holder session for this pid and the start time read by the ledger's process probe. */
function theStandingHolderSession(hello: HolderHello, startedAt: string | null) {
  const workspaceId = settings().workspace
  return listRecords({ workspaceId, kind: 'session' }).find((row) => {
    if (row.title !== THE_TERMINAL_HOLDER || row.data['state'] !== 'running') return false
    const recorded = theRecordedProcessOf(row)
    return recorded.pid === hello.pid && recorded.pidStartedAt === startedAt
  })
}

/** The open process row the ledger holds for this very holder, or null. Writes nothing. */
export function theOpenRowRecordingTheHolder(hello: HolderHello): LedgerEntry | null {
  const startedAt = osProbe().processById(hello.pid)?.startedAt ?? null
  const standing = theStandingHolderSession(hello, startedAt)
  if (standing === undefined) return null
  return liveRowsOfKey({ workspaceId: settings().workspace, type: 'process', key: String(hello.pid) }).find((row) => row.sessionRecordId === standing.id) ?? null
}

/**
 * WRITE THE HOLDER INTO THE LEDGER, unless a live row already stands for this very process.
 *
 * Exported for the server's start, which calls it through `theHolder` too, and for a test. `groupItsJobObjectHolds` is
 * the holder's group on Windows, which `readFirstAndRecordTheHolder` reads; the row records it.
 */
export function recordTheHolder(hello: HolderHello, groupItsJobObjectHolds?: number): { sessionRecordId: string; filed: boolean } {
  const workspaceId = settings().workspace
  const part = theHoldersPart()
  const checkout = part.checkout
  /**
   * THE HOLDER'S START TIME IS THE ONE THE LEDGER READS, as the message worker's is. The holder reads its own once and
   * sends none when it cannot read its own entry in the process table, and a row with a pid and no start time draws the
   * third mark for a holder that is running. The ledger row below reads the holder's process through this same probe, so
   * the two rows name the same start time. Wave 13y round 33, item 9.8 (a).
   */
  const startedAt = osProbe().processById(hello.pid)?.startedAt ?? null
  const standing = theStandingHolderSession(hello, startedAt)
  if (standing !== undefined) return { sessionRecordId: standing.id, filed: false }

  const now = new Date()
  closeTheEarlierOwnRows({ workspaceId, part, actor: THE_SERVER, now })
  const filed = createRecord({
    kind: 'session',
    title: THE_TERMINAL_HOLDER,
    workspaceId,
    data: {
      state: 'running',
      runtime: 'mole-office',
      // THE HOLDER'S OWN WORD FOR ITS START, OR NONE. The moment the server records it is not when it began, so a holder
      // that sent none has none here, and its page says its start time is unknown. Wave 13y round 34, item 9.8 (c).
      ...(hello.startedAt === null ? {} : { startedAt: hello.startedAt }),
      doing: "Holds the office's terminals, so they keep running while the server restarts.",
      workingDirectory: checkout,
      startedByMoleOffice: true,
      // The holder runs no model. Its receipt says what it does not cover: what runs in its terminals.
      usageReceipt: theOwnPartUsageReceipt(THE_TERMINAL_HOLDER, process.env),
      extra: theOwnPartBlock(part, hello.pid, startedAt),
    },
    actor: THE_SERVER,
  })
  registerResource({
    workspaceId,
    sessionRecordId: filed.id,
    type: 'process',
    key: String(hello.pid),
    detail: 'the Mole Office terminal holder',
    world: worldNow(),
    startedByTheProduct: true,
    ...(groupItsJobObjectHolds === undefined ? {} : { groupItsJobObjectHolds }),
    actor: THE_SERVER,
  })
  return { sessionRecordId: filed.id, filed: true }
}

/** The holder as one of the office's own parts: its role, the port this server is bound to, and this checkout. */
function theHoldersPart(): OwnPart {
  return { role: THE_TERMINAL_HOLDER, port: theBoundPort(), checkout: REPO_ROOT.replace(/\/$/, '') }
}

/** The processes `recordTheHolder` reads, for `readFirst`: the holder's own, and those of the earlier rows it closes. */
export function theProcessesRecordingTheHolderReads(hello: HolderHello): AProcessToRead[] {
  return [
    { pid: hello.pid, alsoItsStarterIfEnded: false },
    ...theProcessesTheEarlierOwnRowsCloseReads({ workspaceId: settings().workspace, part: theHoldersPart(), now: new Date() }),
  ]
}

/**
 * RECORD THE HOLDER, WITH EVERY PROCESS THE RECORD READS READ FIRST, without holding the thread (Windows; `readFirst` in
 * lib/resources.ts). `theHolder` and the restart (lib/the-holders-restart.ts) both record it this way.
 */
export async function readFirstAndRecordTheHolder(hello: HolderHello): Promise<ReturnType<typeof recordTheHolder>> {
  const group = await theGroupTheHoldersJobObjectHolds(hello)
  return await readFirst(() => theProcessesRecordingTheHolderReads(hello), () => recordTheHolder(hello, group))
}

/**
 * THE HOLDER'S GROUP ON WINDOWS, read by the way that waits. There the process reader gives every process group 0, and
 * the holder's group is the number of the starter that started it, which is its parent. That number is believed only
 * when the group's Job Object holds the holder (`readTheGroupItsParentNames` in src/config/systems/windows-groups.mjs).
 * Elsewhere there is no Job Object to ask. Where the holder has ended, or the Job Object does not hold it, or Windows
 * cannot say, there is no group, and the row keeps the reader's 0, which a release refuses to stop.
 */
async function theGroupTheHoldersJobObjectHolds(hello: HolderHello): Promise<number | undefined> {
  const { jobObjects } = theGroupsOf()
  if (jobObjects === null) return undefined
  const itself = await readAProcess(hello.pid)
  if (itself === null) return undefined
  const said = await readTheGroupItsParentNames(jobObjects, hello.pid, itself.ppid)
  return 'holds' in said && said.holds ? said.group : undefined
}

/** Forget which holder was recorded. For a test that reads the ledger after a holder was replaced. */
export function forgetTheRecordedHolder(): void {
  theHolderRecorded = null
}

/**
 * THE ENVIRONMENT A TERMINAL IS GIVEN: the names a shell needs to work as it does in any terminal of
 * this user, taken from this server's own environment, and nothing else.
 *
 * It is a list of what is let through rather than of what is kept out, because this server's
 * environment holds keys: the office's own variables, a model login. A name the list does not hold
 * never reaches a terminal. TERM and COLORTERM say what the screens that draw a terminal can show.
 *
 * The list is the system's (`aTerminalIsGiven` in src/config/systems/the-system.mjs), because a shell on Windows
 * needs other names. A name is matched as that system spells names, so in any case on Windows, and the terminal is
 * given it as the list spells it.
 */
export function theEnvironmentATerminalGets(env: NodeJS.ProcessEnv = process.env, system: ASystem = thisSystem()): Record<string, string> {
  const { names, startingWith } = system.aTerminalIsGiven
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    const listed = names.find((one) => theSameSpelling(one, name, system.platform))
    if (listed !== undefined) out[listed] = value
    else if (startingWith.some((start) => name.startsWith(start))) out[name] = value
  }
  out['TERM'] = 'xterm-256color'
  out['COLORTERM'] = 'truecolor'
  return out
}

/**
 * THE SHELL A TERMINAL OPENS WHEN NO COMMAND IS NAMED: what the terminal's own environment names by the variable this
 * system names its shell with, SHELL, and ComSpec on Windows. `command` is undefined when the environment names none.
 */
export function theShellOf(env: Record<string, string>, system: ASystem = thisSystem()): { variable: ASystem['theShellVariable']; command: string | undefined } {
  return { variable: system.theShellVariable, command: env[system.theShellVariable] }
}

/** What a viewer of one terminal is told, in order: the screen once, then output, then the end. */
export type TerminalEvent =
  | { event: 'output'; data: string }
  | { event: 'ended'; exit: { code: number; signal: number | null } }
  | { event: 'closed' }
  | { event: 'resized'; cols: number; rows: number }

/**
 * WATCH ONE TERMINAL on a connection of its own. It resolves with the terminal and its screen as the
 * holder wrote it out, and from then on calls `onEvent` with each piece of output in order. `onGone`
 * is called once when the connection ends for any reason other than `stop`: the holder stopped, or let
 * this viewer go because it fell too far behind. A holder that does not answer the watch within
 * ONE_REQUEST_MS is a 504, as for any other request.
 */
export function watchATerminal(
  terminal: string,
  onEvent: (event: TerminalEvent) => void,
  onGone: () => void,
): Promise<{ terminal: TerminalReading; screen: string; stop: () => void }> {
  return new Promise((done, fail) => {
    const socket: Socket = createConnection(theHolderSocket())
    let pending = ''
    let answered = false
    let stopped = false
    const stop = (): void => {
      stopped = true
      clearTimeout(timer)
      socket.destroy()
    }
    const timer = setTimeout(() => {
      if (answered) return
      answered = true
      stop()
      fail(aTerminalRefusal('terminalHolderNoAnswer', `The terminal holder did not answer within ${String(ONE_REQUEST_MS / 1000)} seconds when terminal ${terminal} was asked for.`, 504))
    }, ONE_REQUEST_MS)
    socket.setEncoding('utf8')
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: 1, op: 'watch', terminal })}\n`))
    socket.on('data', (chunk: string) => {
      pending += chunk
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        const message = JSON.parse(line) as Record<string, unknown>
        if (!answered) {
          answered = true
          clearTimeout(timer)
          if (message['ok'] !== true) {
            stop()
            fail(theHoldersRefusal(message))
            return
          }
          let reading: TerminalReading
          try {
            reading = asTheOfficeReadsIt(message['terminal'] as TerminalReading)
          } catch (err) {
            stop()
            fail(err)
            return
          }
          done({ terminal: reading, screen: String(message['screen']), stop })
          continue
        }
        if (message['event'] === 'output') onEvent({ event: 'output', data: String(message['data']) })
        else if (message['event'] === 'ended') onEvent({ event: 'ended', exit: message['exit'] as { code: number; signal: number | null } })
        else if (message['event'] === 'closed') onEvent({ event: 'closed' })
        else if (message['event'] === 'resized') onEvent({ event: 'resized', cols: Number(message['cols']), rows: Number(message['rows']) })
      }
    })
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      const absent = err.code === 'ENOENT' || err.code === 'ECONNREFUSED'
      fail(
        absent
          ? aTerminalRefusal(
              'terminalHolderNotRunning',
              `No terminal holder is running for this office: nothing answers on ${theHolderSocket()}. So no terminal can be read.`,
              503,
              'No terminal holder is running.',
            )
          : aTerminalRefusal('terminalHolderUnusable', `The terminal holder could not be reached: ${err.message}.`, 502),
      )
    })
    socket.once('close', () => {
      if (!answered) {
        answered = true
        clearTimeout(timer)
        fail(aTerminalRefusal('terminalHolderUnusable', 'The terminal holder closed the connection without answering.', 502))
        return
      }
      if (!stopped) onGone()
    })
  })
}

/**
 * RECORD THE HOLDER AT THE SERVER'S START, if one runs. It never stops the server from starting: no
 * holder, or one that cannot be recorded, is a line in the log, and the terminal doors say the rest.
 */
export async function recordTheHolderAtStart(log: { info: (line: string) => void; warn: (line: string) => void }): Promise<void> {
  const { logTheAgentsInTerminalsTo } = await import('./terminal-agents.ts')
  logTheAgentsInTerminalsTo(log)
  try {
    const hello = await theHolder()
    log.info(`the terminal holder is process ${String(hello.pid)}, and it is in the process ledger`)
  } catch (err) {
    const line = err instanceof Error ? err.message : String(err)
    if (err instanceof PanelError && err.status === 503) log.info(line)
    else log.warn(`The terminal holder could not be recorded: ${line}`)
  }
}


/** Private traffic never uses ordinary holder error text, recording, replay or terminal input helpers. */
export async function askPrivateLoginHolder(request: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { PRIVATE_LOGIN_VERSION, PrivateLoginError, PRIVATE_LOGIN_REASONS } = await import('../../config/private-sandbox-login.mjs')
  try {
    const hello = await askTheHolder(theHolderSocket(), { op: 'hello' }, THE_PAGES_HOLDER_READ_MS)
    if (hello['protocol'] !== THE_HOLDER_PROTOCOL || hello['database'] !== settings().databasePath || !Array.isArray(hello['understands']) || !hello['understands'].includes('privateLoginV1')) throw new PrivateLoginError('Unavailable')
    const answer = await askTheHolder(theHolderSocket(), { ...request, version: PRIVATE_LOGIN_VERSION }, THE_PAGES_HOLDER_READ_MS)
    if (answer.ok !== true) throw new PrivateLoginError(PRIVATE_LOGIN_REASONS.includes(answer['reason'] as never) ? String(answer['reason']) : 'Unsupported')
    return answer
  } catch (err) { throw err instanceof PrivateLoginError ? err : new PrivateLoginError('Unavailable') }
}
