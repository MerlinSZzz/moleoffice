// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS TO THE OFFICE'S TERMINALS. Wave 13u, round 1.
 *
 *   GET  /api/terminals              every terminal the holder holds, and where the holder stands  (the person, secretary own key or grant)
 *   POST /api/terminals              open one: a command, in a folder (the person's home folder when none is named)  (the person or grant)
 *                                    or the shell with a line a secretary prepared, never entered  (secretary words or grant)
 *   GET  /api/terminals/:id/stream   read one: its screen now, then its output as it comes     (secretary own key for agent terminals and one it prepared while it runs; person or grant otherwise)
 *   GET  /api/terminals/stream       read several in one reading, every event marked with its terminal  (each as its own stream)
 *   POST /api/terminals/:id/input    type into one: any keys, or one whole line from a secretary  (the person, words or grant)
 *   POST /api/terminals/:id/resize   give one a new size                                      (the person or grant)
 *   POST /api/terminals/:id/close    end one, and forget it                                   (the person or grant)
 *   POST /api/terminals/holder/restart  restart the holder, which ends every terminal it holds  (the person or grant)
 *   POST /api/terminals/:id/keep-my-line  keep its last line as a note                         (the person or grant)
 *   POST /api/terminals/:id/name     give one a name, a group and tags, kept in the holder      (the person or grant)
 *
 * The terminals themselves are held by the terminal holder, a process of its own, so they keep running
 * while this server restarts (src/server/lib/terminals.ts says how the server reaches it).
 *
 * ---------------------------------------------------------------------------------------
 * HOW A TERMINAL IS READ AND TYPED INTO: ONE STREAM OUT, POSTS IN
 * ---------------------------------------------------------------------------------------
 *
 * Output goes out as server-sent events on a GET that stays open, written the way GET /api/events
 * writes its stream. Typing comes in as ordinary POSTs. So src/server/api/events.ts's rule holds: every
 * write goes through the API's one write door, with its hooks, and the stream only carries what
 * happened. Wave 13u round 1 measured the other way, a WebSocket, and chose this one. A WebSocket
 * upgrade does not pass the office's arrival stamp, CORS or the page's way of proving itself, so it
 * would have been a second write door with rules of its own. A key and its echo through this way
 * measured 0.1 ms on the stream and about 3 ms for the POST through the office's hooks.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY DO WHAT
 * ---------------------------------------------------------------------------------------
 *
 * The person types any keys. A secretary with its own key on this computer may read the list and
 * agent-bound terminal streams, and the stream of a terminal it prepared for the person while that terminal runs. Manual
 * terminal streams remain the person's or the grant's where the office's list carries reading. One reading of several
 * terminals asks for each the authority its own stream asks, and is refused whole when one is refused. Other terminal
 * mutations, naming a terminal among them, keep their person or grant guards. Typing one whole line still requires
 * written permission for that line or the grant, and so does preparing one, as described below.
 * No supervisor, worker or sandbox gains the secretary's authority. The socket's provenance is
 * checked because a sandbox can reach this computer's listener while carrying an agent's key.
 *
 * A terminal opened under the grant names the secretary. A close under the grant refuses an
 * agent's terminal. A line kept under the grant is the secretary's note. Reads write no press row.
 *
 * A SECRETARY TYPES ONE WHOLE LINE (wave 13s round 83). Typing asks the person first, and the person types any keys. A
 * secretary sends one line, as `line`, with no Enter or other key in it, and the holder types it and then Enter as
 * somebody else's line: never the person's last line and never kept as the person's words, only counted. The secretary
 * is let through in one of two ways. With the owner's words, the words must name this terminal and this exact line, and
 * the secretary must have its own key. Without words, it is the grant, where this office's list says the grant carries
 * typing. Each line typed is written down without its text, and the typing sources name the secretary, never the person.
 * A secretary may never send keys as the person does, because the holder could not tell its keys from the person's.
 *
 * A SECRETARY PREPARES A LINE FOR THE PERSON TO RUN. A secretary opens the shell for the person with one line typed in
 * it, sent as `line` to the opening door. The office types the line and never an Enter, so the person runs it with their
 * own Enter, changes it or clears it. The line holds no Enter, Tab, Escape or other key, by the one test of a key in
 * src/config/a-control-character.mjs, and the holder tests it again and refuses it in its own words. With the owner's
 * words, the words must name this folder and this exact line, and the secretary must have its own key. Without words,
 * it is the grant, where this office's list says the grant carries opening a terminal. The list and the stream give the
 * whole line and the secretary that prepared it, every page is told at once on GET /api/events which secretary prepared
 * a terminal, and that secretary may read the terminal while it runs. The person sends no prepared line.
 *
 * FROM ANOTHER COMPUTER, THE PERSON'S OWN KEY ONLY. This is point (d) of a decision, from wave 13u round
 * 14. The doors one
 * terminal's view asks (the list, reading, typing, resizing, closing, and the keeping doors), and one reading of several
 * terminals beside one terminal's stream, declare
 * `thePersonMayFromAnotherComputer`, the widening of a decision: from another computer they answer only the
 * person's key itself, over an encrypted door (`thePersonMayAskFromThere` in lib/reach.ts), and every door still asks
 * the authority each door names. A secretary reads agent terminals, and a terminal it prepared, on its own key only on
 * this computer. Opening a terminal, naming one and
 * starting the holder stay on this computer. Every input is counted against where it came from, as the chat records where a message was written: the
 * level, the machine, the program and the account (lib/terminal-typed-from.ts). Each reader is sent those sources on
 * its stream, and reading, typing into or closing a terminal from another computer is said to the person.
 *
 * WHAT THESE CHECKS DO NOT REACH. They are checks on these doors. The holder's socket is this user's only
 * (src/config/the-terminal-holder.mjs), so another user of the machine cannot reach a terminal, but a
 * program running as this same user can connect to the socket itself and pass by these doors. Such a
 * program can already run any command as this user, so the socket gives it no new power over the
 * machine; what it does give is the person's own open terminals. Agents in a sandbox cannot reach the
 * socket, because a sandbox has its own home. An agent run on this machine as this user is kept from
 * these doors and not from the socket.
 *
 * KEYS ARRIVE IN THE ORDER THE HOLDER RECEIVES THE POSTS. Each POST is its own request, so two sent
 * at once may arrive in either order. A page sends the next keys only once the POST before has been
 * answered.
 */

import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { HOME_MOVED_HEADER } from '../../config/visit-headers.mjs'
import {
  THE_FIRST_SIZE,
  THE_LARGEST_SIDE,
  THE_LONGEST_TERMINAL_GROUP,
  THE_LONGEST_TERMINAL_NAME,
  THE_LONGEST_TERMINAL_TAG,
  THE_MOST_TAGS_ON_A_TERMINAL,
} from '../../config/the-terminal-holder.mjs'
import { A_CONTROL_CHARACTER } from '../../config/a-control-character.mjs'
import { theHomeDirectory } from '../lib/adapters/index.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theCorsHeadersOfAHijackedReply } from '../lib/an-origin-that-is-not-this-office.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  createRecord,
  theSecretaryActingForThePerson,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  THE_LONGEST_LINE_KEPT,
  THE_MOST_TERMINALS_IN_ONE_READING,
  TYPED_IN_TERMINAL,
  theCommandLine,
  whyThisLooksLikeASecret,
  type HolderState,
  type TheKeeping,
  type TheLastLine,
} from '@shared/terminals.ts'
import { asListed } from '../lib/agent-pane.ts'
import { closeTheTerminalAsSecretary, rememberTheKeepingOfTheAgentIn, whoOpensIt } from '../lib/terminal-agents.ts'
import { takeTheLinesLater, theKeepingOf } from '../lib/terminal-keeping.ts'
import { forgetTypedFrom, recordAnInput, sayATerminalWasUsedFromAnotherComputer, theSourceOf, typedFromOf, watchTypedFrom } from '../lib/terminal-typed-from.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { THEIR_OWN_PROGRAM, readWhoSentItFromThisComputer } from '../lib/from-a-sandbox.ts'
import { route } from '../lib/route.ts'
import { restartTheHolder, startAHolderAsAPageDoes } from '../lib/the-holders-restart.ts'
import {
  aTerminalRefusal,
  askTheHolderFor,
  nameATerminal,
  openATerminalWithAPreparedLine,
  theEnvironmentATerminalGets,
  theHolder,
  theHolderState,
  theShellOf,
  THE_PAGES_HOLDER_READ_MS,
  typeALineForSomebodyElse,
  watchATerminal,
  type TerminalEvent,
  type TerminalReading,
} from '../lib/terminals.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { whichWorldAnswered } from '../lib/world.ts'
import { named } from '../lib/named-timers.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'

/** How often a stream that carries nothing says it is still open, as GET /api/events does. */
const KEEP_OPEN_EVERY_MS = 25_000

/** How many bytes may wait for one reader of a terminal's stream before it is let go. */
const THE_MOST_A_READER_MAY_FALL_BEHIND = 8 * 1024 * 1024

/** The most one POST may type: a long paste, and no more. */
const THE_LONGEST_TYPING = 64 * 1024

/**
 * WHO MAY BRING AN AGENT'S RUN BACK BESIDES THE PERSON: the agent's own superior, by the registry's starters
 * (src/server/lib/terminal-agents.ts, aStarterAboveTheAgentPresses). The agents come back down the chain, one at a time.
 */
export const A_SUPERIOR_MAY_BRING_ITS_AGENT_BACK =
  "An agent's own superior on this computer, the agent that started it or one above that agent, may bring that " +
  "agent's run back on its own key. No press brings every agent back."

/** The shared refusal for terminal doors; individual doors admit only the authority they name. */
export const THE_TERMINAL_PERMISSION =
  "Only the person may use the terminal doors of the office, or a secretary holding the person's grant where " +
  "this office's list of what the grant carries says so. A secretary with its own key may also open an agent in a " +
  "terminal, close an agent terminal it opened, and read the terminal list and agents' terminals. " +
  `${A_SUPERIOR_MAY_BRING_ITS_AGENT_BACK} A secretary may type one whole line with the owner's ` +
  "written words for that line. Any other agent is refused, and nothing from a sandbox counts."

/**
 * A secretary's new authority belongs on this computer. An agent's key proves its holder, not the
 * machine running it, so ask the socket's provenance as well. An in-process call has no arrival.
 * The provenance is read by the way that waits, so it holds no thread inside the installed Windows app.
 */
export async function assertATerminalAgentIsHere(req: FastifyRequest, actor: Actor): Promise<void> {
  if (actor.type !== 'agent' || actor.from === undefined) return
  if (actor.from === 'this machine' && (await readWhoSentItFromThisComputer(req)) === THEIR_OWN_PROGRAM) return
  throw aTerminalRefusal('terminalsOnlyThePerson', THE_TERMINAL_PERMISSION, 403)
}

/** The common coded refusal; typing and grant-only doors retain their separate guards. */
function onlyThePerson(actor: Actor, doing: string): void {
  try {
    assertThePersonIsProved(
      actor,
      doing,
      THE_TERMINAL_PERMISSION,
    )
  } catch (err) {
    // THE SAME REFUSAL, WITH A CODE, so a page draws it in its own language (terminalsOnlyThePerson).
    if (err instanceof PanelError) throw aTerminalRefusal('terminalsOnlyThePerson', err.message, err.status, err.reason)
    throw err
  }
}

/**
 * THE PERSON, OR THEIR GRANT WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE DOOR, as `onlyThePersonMay` in api/visitors.ts
 * asks it. The check answers for the door this request named, and refuses in its own words where the list keeps it.
 */
function thePersonOrTheGrant(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor) || aRaiseCarriesIt(actor)) return
  onlyThePerson(actor, doing)
}

const aSide = z.number().int().min(1).max(THE_LARGEST_SIDE)

const openPress = z
  .object({
    /** THE PERSON'S HOME FOLDER WHEN NOT SAID (wave 13u, round 7): the Terminals page's press opens a shell there. The answer names the folder used. */
    folder: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    cols: aSide.optional(),
    rows: aSide.optional(),
    /** Whether what the person types is kept as their notes; on when not said (decision YLv8grhgilBV, point 1). */
    keeping: z.boolean().optional(),
  })
  .strict()

const keepingPress = z.object({ on: z.boolean() }).strict()

const typing = z.object({ data: z.string().min(1).max(THE_LONGEST_TYPING) }).strict()

/** What a secretary sends: one line, and the owner's words where it carries them. The holder judges the line itself. */
const aSecretarysLine = z.object({ line: z.string(), warrant: z.unknown().optional() }).strict()

/** What is written down when the line was typed and its Enter was not, after the holder's reason. */
const TYPED_WITHOUT_ENTER = {
  'the-person-typed': 'typed without its Enter, because the person typed while it waited',
  ended: 'typed without its Enter, because the terminal ended while it waited',
  'the-person-ended-the-line': 'typed without its Enter, because the person pressed Enter on it or cleared it while it waited',
} as const

/**
 * A SECRETARY TYPES ONE WHOLE LINE FOR THE PERSON (wave 13s round 83), after the door has found the caller is not the
 * person. With the owner's words in the body, the words are read before anything else in it, so a caller refused is
 * told who may first. They must name this terminal and this exact line, and only a secretary with its own key may carry
 * them. Without words, it is the grant, where this office's list says the grant carries typing; the check refuses in its
 * own words where the list keeps typing or asks first. Any other caller gets the person-only refusal.
 *
 * The holder types the line and then Enter (`typeALineForSomebodyElse`), and nothing else is typed here. The act is
 * written down before the answer, without the line's text, and a press under the grant is written beside it. The lines
 * the holder says wait to be taken are left for the person's next typing, whose door takes them. When the line was
 * typed and the office's Enter was not, the answer is a refusal that says why: the line is still on the terminal, or the
 * person pressed Enter on it or cleared it in the holder's pause (round 86).
 */
async function aSecretaryTypesALine(req: FastifyRequest, actor: Actor): Promise<{ typed: number; entered: true; typedFrom: string; says: string }> {
  const words = theWordsInTheBody(req)
  if (words === undefined ? !aRaiseCarriesIt(actor) : !aSecretaryWithItsOwnKey(actor)) onlyThePerson(actor, theActKeptHere(req))
  const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
  const sent = aSecretarysLine.safeParse(req.body ?? {})
  if (!sent.success) {
    throw aTerminalRefusal(
      'terminalASecretaryTypesALine',
      `A secretary types one whole line into a terminal, sent as {"line": "…"} with no Enter or other key in it. It ` +
        `does not send data, which is how the person types keys. Nothing was typed into terminal ${id}.`,
      400,
    )
  }
  const line = sent.data.line
  let acting = actor
  if (words !== undefined) {
    try {
      acting = actorWithTheWordsItActsOn(req, words, `terminals.type:${JSON.stringify({ terminal: id, line })}`)
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      throw aTerminalRefusal('terminalTypingWordsRefused', `${err.message} Nothing was typed into terminal ${id}.`, err.status)
    }
    if (!(acting.warrant !== undefined && theSecretaryActingForThePerson(acting))) {
      throw aTerminalRefusal(
        'terminalTypingWordsRefused',
        `Only the secretary, with its own key, may type a line with the person's words. Nothing was typed into terminal ${id}.`,
        403,
      )
    }
  }
  const typed = await typeALineForSomebodyElse(id, line)
  writeDownAnActUnderTheRaise(acting, {
    setting: 'terminals',
    field: `one line typed into terminal ${id}`,
    before: null,
    after: typed.entered ? 'entered' : TYPED_WITHOUT_ENTER[typed.why],
    workspaceId: workspaceOf(req),
  })
  const source = theSourceOf(req, acting)
  recordAnInput(id, source)
  if (typed.entered) {
    return { typed: line.length, entered: true, typedFrom: source.level, says: `The line was typed into terminal ${id}, and Enter was pressed after it.` }
  }
  if (typed.why === 'the-person-typed') {
    throw aTerminalRefusal(
      'terminalTypedWithoutEnterThePersonTyped',
      `The line was typed into terminal ${id}, but Enter was not pressed after it, because the person typed while it ` +
        'waited. The line is still there, not entered.',
      409,
    )
  }
  if (typed.why === 'the-person-ended-the-line') {
    throw aTerminalRefusal(
      'terminalTypedWithoutEnterThePersonEndedTheLine',
      `The line was typed into terminal ${id}, but the office did not press Enter after it, because the person pressed ` +
        'Enter on the line or cleared it while it waited. If they pressed Enter, the line was sent with anything they ' +
        'had typed onto it.',
      409,
    )
  }
  throw aTerminalRefusal(
    'terminalTypedWithoutEnterEnded',
    `The line was typed into terminal ${id}, but Enter was not pressed after it, because the terminal ended while it waited.`,
    409,
  )
}

/**
 * What a secretary sends to open a terminal for the person with one line prepared in it: the line, the folder (the
 * person's home folder when none is named), the size, the keeping, and the owner's words where it carries them. A
 * prepared terminal opens the shell, so no command is sent.
 */
const preparePress = z
  .object({
    folder: z.string().min(1).optional(),
    line: z.string(),
    warrant: z.unknown().optional(),
    cols: aSide.optional(),
    rows: aSide.optional(),
    keeping: z.boolean().optional(),
  })
  .strict()

/**
 * A SECRETARY OPENS A TERMINAL FOR THE PERSON WITH ONE LINE PREPARED IN IT, for the person to run with their own Enter.
 * The door reached here because the body carries `line`. With the owner's words in the body, the words must name this
 * folder and this exact line, as `terminals.open:` and JSON {folder, line}, and only a secretary with its own key may
 * carry them. Without words, it is the grant, where this office's list says the grant carries opening a terminal. The
 * person types their own lines, so a line from the person is refused, as is any other caller.
 *
 * The line is refused when it is empty or holds a key, by the one test of a key (src/config/a-control-character.mjs),
 * and the holder tests it again. The office types the line and never an Enter. The act is written down before the
 * answer, with the terminal and without the line's text, and a press under the grant is written beside it.
 */
async function aSecretaryPreparesATerminal(req: FastifyRequest, actor: Actor): Promise<TerminalReading> {
  const words = theWordsInTheBody(req)
  if (words === undefined ? !aRaiseCarriesIt(actor) : !aSecretaryWithItsOwnKey(actor)) {
    // ONLY THE PERSON GETS PAST THE PERSON-ONLY REFUSAL, and the person types their own line into a terminal.
    onlyThePerson(actor, theActKeptHere(req))
    throw aTerminalRefusal(
      'terminalPreparedLineFromThePerson',
      'A line is prepared by a secretary for the person to run, and the person types their own line in the terminal. Nothing was opened.',
      400,
    )
  }
  if (words !== undefined) await assertATerminalAgentIsHere(req, actor)
  const sent = (req.body ?? {}) as Record<string, unknown>
  if (Object.hasOwn(sent, 'command') || Object.hasOwn(sent, 'args')) {
    throw aTerminalRefusal(
      'terminalPreparedLineWithACommand',
      'A terminal with a prepared line opens the shell, so no command or arguments may be sent beside the line. Nothing was opened.',
      400,
    )
  }
  const body = parse(preparePress, sent, 'The terminal cannot be opened:')
  const line = body.line
  const folderAsked = body.folder ?? theHomeDirectory()
  let acting = actor
  if (words !== undefined) {
    try {
      acting = actorWithTheWordsItActsOn(req, words, `terminals.open:${JSON.stringify({ folder: folderAsked, line })}`)
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      throw aTerminalRefusal('terminalPreparingWordsRefused', `${err.message} Nothing was opened.`, err.status)
    }
    if (!(acting.warrant !== undefined && theSecretaryActingForThePerson(acting))) {
      throw aTerminalRefusal(
        'terminalPreparingWordsRefused',
        "Only the secretary, with its own key, may open a terminal with a line prepared in it on the person's words. Nothing was opened.",
        403,
      )
    }
  }
  if (line === '' || A_CONTROL_CHARACTER.test(line)) {
    throw aTerminalRefusal(
      'terminalPreparedLineHasAKey',
      'A prepared line is one line of text, with no Enter, Tab, Escape or other key in it, and it is not empty. Nothing was opened.',
      400,
    )
  }
  const folder = theFolder(folderAsked)
  const env = theEnvironmentATerminalGets()
  const shell = theShellOf(env)
  if (shell.command === undefined || shell.command === '') {
    throw new PanelError(`This server has no ${shell.variable} to open with the prepared line. Nothing was opened.`)
  }
  const by = whoOpensIt(actor)
  const terminal = await openATerminalWithAPreparedLine(
    {
      who: by,
      agent: null,
      project: workspaceOf(req),
      command: shell.command,
      args: [],
      folder,
      env,
      cols: body.cols ?? THE_FIRST_SIZE.cols,
      rows: body.rows ?? THE_FIRST_SIZE.rows,
      keeping: body.keeping ?? true,
    },
    line,
    by,
  )
  writeDownAnActUnderTheRaise(acting, {
    setting: 'terminals',
    field: `one terminal opened with a line prepared in it, ${terminal.id}`,
    before: null,
    after: 'typed, not entered',
    workspaceId: workspaceOf(req),
  })
  recordAnInput(terminal.id, theSourceOf(req, acting))
  return terminal
}

/**
 * WHETHER A SECRETARY WITH ITS OWN KEY MAY READ THIS TERMINAL: one bound to an agent, or one it prepared for the person
 * while it runs. A manual shell is neither, and a terminal no longer listed is neither.
 */
function aSecretaryMayReadIt(listed: TerminalReading | null, actor: Actor): boolean {
  if (listed === null) return false
  if (listed.agent?.kind === 'agent') return true
  const prepared = listed.prepared
  return listed.state === 'running' && prepared?.by.kind === 'agent' && prepared.by.id === whoOpensIt(actor).id
}

/** What the person sends to name a terminal: a name, a group and tags, each none when null or empty. */
const namingPress = z.object({ name: z.string().nullable(), group: z.string().nullable(), tags: z.array(z.string()) }).strict()

/** One reading of several terminals names them in its query, as terminals=<id>,<id>. */
const aReading = z.object({ terminals: z.string() })

/**
 * A NAME OR A GROUP AS IT IS KEPT: the spaces around it taken off, or null for none. A blank one, one longer than the
 * holder keeps or one that holds a key is refused with its code, and the holder tests the same again.
 */
function aKeptLabel(value: string | null, longest: number, code: 'terminalNameRefused' | 'terminalGroupRefused', which: string, id: string): string | null {
  if (value === null) return null
  const kept = value.trim()
  if (kept === '' || Array.from(kept).length > longest || A_CONTROL_CHARACTER.test(kept)) {
    throw aTerminalRefusal(
      code,
      `A terminal's ${which} is a short line of text with no key such as Enter in it, or none. This one is blank, too long or holds a key. Nothing was changed in terminal ${id}.`,
      400,
    )
  }
  return kept
}

/** The tags as they are kept: each with the spaces around it taken off, refused when one is blank, too long, keyed or there twice. */
function theKeptTags(tags: string[], id: string): string[] {
  const kept = tags.map((tag) => tag.trim())
  const wrong =
    kept.length > THE_MOST_TAGS_ON_A_TERMINAL ||
    new Set(kept).size !== kept.length ||
    kept.some((tag) => tag === '' || Array.from(tag).length > THE_LONGEST_TERMINAL_TAG || A_CONTROL_CHARACTER.test(tag))
  if (wrong) {
    throw aTerminalRefusal(
      'terminalTagsRefused',
      "A terminal's tags are a few short words, each with no key such as Enter in it, and no tag twice. One of these is " +
        `blank, too long, holds a key or is there twice, or there are too many. Nothing was changed in terminal ${id}.`,
      400,
    )
  }
  return kept
}

const resizing = z.object({ cols: aSide, rows: aSide }).strict()

const theTerminalNamed = z.object({ id: z.string().min(1) })

/** What the confirming press of the holder's restart was shown (src/shared/terminals.ts, TheHolderAsShown). */
const restartPress = z
  .object({
    expect: z
      .object({
        pid: z.number().int().positive(),
        startedAt: z.string().min(1).nullable(),
        terminals: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict()

/**
 * The folder a terminal opens in, refused unless it is an absolute path to a folder that is there. Each refusal has a
 * code, so the page says it in its own language with what to write instead (wave 13u, round 7b).
 */
function theFolder(folder: string): string {
  const values = { folder }
  if (!isAbsolute(folder)) {
    throw new PanelError(`The folder must be an absolute path, and "${folder}" is not one. Nothing was opened.`, 400, undefined, undefined, undefined, { code: 'terminalFolderNotAbsolute', values })
  }
  let isAFolder = false
  try {
    isAFolder = statSync(folder).isDirectory()
  } catch {
    throw new PanelError(`There is no folder at ${folder}. Nothing was opened.`, 400, undefined, undefined, undefined, { code: 'terminalFolderMissing', values })
  }
  if (!isAFolder) throw new PanelError(`${folder} is a file, not a folder. Nothing was opened.`, 400, undefined, undefined, undefined, { code: 'terminalFolderIsAFile', values })
  return folder
}

/**
 * THE TERMINAL AS THE HOLDER LISTS IT NOW, so a line to the person names its command and folder; null when the holder
 * does not list it, and the line then names the terminal by its id.
 */
async function theTerminalIfListed(id: string): Promise<TerminalReading | null> {
  const answer = await askTheHolderFor({ op: 'list' }, THE_PAGES_HOLDER_READ_MS)
  return (answer['terminals'] as TerminalReading[]).find((one) => one.id === id) ?? null
}

/**
 * OPEN A TERMINAL STREAM ON THIS REPLY, once its watches are made: one terminal's stream and one reading of several
 * write the same way. `write` sends one event, and `end` ends the stream once, calling `whenItEnds` first so the
 * caller stops what it watches. The stream ends when the reader leaves.
 */
function openATerminalStream(
  req: FastifyRequest,
  reply: FastifyReply,
  warn: (line: string) => void,
  whenItEnds: () => void,
): { write: (name: string, data: unknown) => void; end: () => void } {
  reply.raw.setHeader('content-type', 'text/event-stream')
  reply.raw.setHeader('cache-control', 'no-cache, no-transform')
  reply.raw.setHeader('connection', 'keep-alive')
  // The world, freshness and CORS headers are set here, as GET /api/events sets them, because the
  // hijack below keeps every onSend hook from running on this reply.
  for (const [name, value] of Object.entries(whichWorldAnswered())) reply.raw.setHeader(name, value)
  for (const [name, value] of Object.entries(theCorsHeadersOfAHijackedReply(req))) {
    reply.raw.setHeader(name, value)
  }
  // The moved-home header is copied too, for criterion DF28. The visit hook sets it on `reply` when the
  // home this request sent is this installation's own former home, and the hook alone decides. Fastify
  // writes a header set on `reply` only when it sends the reply itself, and after the hijack below it
  // never does. Copied here, the stream carries it whenever an ordinary reply to the same request would.
  const movedHome = reply.getHeader(HOME_MOVED_HEADER)
  if (movedHome !== undefined) reply.raw.setHeader(HOME_MOVED_HEADER, movedHome)
  reply.hijack()
  reply.raw.flushHeaders()

  let open = true
  // A READER THAT FALLS TOO FAR BEHIND IS LET GO, as the holder lets go of a watcher: its output would
  // otherwise pile up in this server's memory. Reading the terminal again gives it the screen.
  const write = (name: string, data: unknown): void => {
    if (!open) return
    if (reply.raw.writableLength > THE_MOST_A_READER_MAY_FALL_BEHIND) {
      end()
      return
    }
    reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const end = (): void => {
    if (!open) return
    open = false
    clearInterval(keepOpen)
    whenItEnds()
    reply.raw.end()
  }
  const keepOpen = setInterval(
    named('a terminal stream\'s beat', warn, () => {
      if (open) reply.raw.write(': still here\n\n')
    }),
    KEEP_OPEN_EVERY_MS,
  )
  keepOpen.unref()
  req.raw.once('close', end)
  req.raw.once('error', end)
  return { write, end }
}

/**
 * THE TERMINALS ONE READING NAMES, from terminals=<id>,<id>: one or more, each once, and no more than one reading
 * carries. Anything else is refused with its code, before the holder is asked.
 */
function theTerminalsOfAReading(query: unknown): string[] {
  const asked = aReading.safeParse(query ?? {})
  const ids = asked.success ? asked.data.terminals.split(',') : []
  if (ids.length === 0 || ids.length > THE_MOST_TERMINALS_IN_ONE_READING || ids.some((id) => id === '') || new Set(ids).size !== ids.length) {
    throw aTerminalRefusal(
      'terminalsReadingRefused',
      `One reading names one terminal or more, each once and no more than ${String(THE_MOST_TERMINALS_IN_ONE_READING)}, as terminals=<id>,<id>. Nothing was read.`,
      400,
    )
  }
  return ids
}

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/terminals',
    route(
      'terminals.list',
      'local',
      { because: 'acts-on-this-machine', act: "Reading the office's terminals", thePersonMayFromAnotherComputer: true },
      "The person or a secretary with its own key on this computer reads every terminal the office's terminal holder holds: who opened it, the agent working in it, its project, its command and folder, when it opened, and whether it runs or has ended. `paneView` is the pane a terminal shows when it is the office's view of an agent's tmux pane, and null otherwise; in a view, `agent` names the agent whose pane it shows. When no holder runs, it says why at once, with the holder's own last word, and lists nothing. A holder that does not answer within a second is said to be unusable, with that second. A holder of another copy which the restart press may replace is listed, so the press can show every terminal it would end.",
    ),
    async (req) => {
      const actor = actorFrom(req)
      await assertATerminalAgentIsHere(req, actor)
      if (!aSecretaryWithItsOwnKey(actor)) thePersonOrTheGrant(actor, theActKeptHere(req))
      const holder = await theHolderState(THE_PAGES_HOLDER_READ_MS)
      if (holder.state !== 'running' && !(holder.state === 'unusable' && holder.anotherCopy !== undefined)) return { holder, terminals: null }
      try {
        const answer = await askTheHolderFor({ op: 'list' }, THE_PAGES_HOLDER_READ_MS)
        // A VIEW OF AN AGENT'S TMUX PANE IS SAID AS ONE (round 11), so no page takes it for the agent's own terminal.
        return { holder, terminals: asListed(answer['terminals'] as TerminalReading[]) }
      } catch (err) {
        // A HOLDER THAT SAID HELLO AND THEN DID NOT LIST IN TIME is said as the one that did not say hello in time.
        if (!(err instanceof PanelError) || err.status !== 504) throw err
        return { holder: { state: 'unusable', says: err.message, noAnswerWithinMs: THE_PAGES_HOLDER_READ_MS } satisfies HolderState, terminals: null }
      }
    },
  )

  app.post(
    '/terminals',
    route(
      'terminals.open',
      'local',
      { because: 'acts-on-this-machine', act: 'Opening a terminal' },
      "The person opens a terminal: a command, the shell when none is named, in a folder, the person's home folder when none is named. The answer shows what was started: the command, its arguments, the folder and the names of the variables it was given. A secretary may open the shell for the person with one line prepared in it: body {line, folder?, warrant?}, with no command, and no Enter or other key in the line. The office types the line and never an Enter, so the person runs it with their own Enter, changes it or clears it. It needs either the person's words for this folder and this exact line, for terminals.open: plus JSON {folder, line}, carried with its own key, or the person's grant where this office's list of what the grant carries lets it open a terminal. The list and the terminal's stream give the whole line and the secretary that prepared it, every page is told at once which secretary prepared a terminal, and that secretary may read the terminal while it runs.",
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      if (req.body !== null && typeof req.body === 'object' && Object.hasOwn(req.body, 'line')) {
        const terminal = await aSecretaryPreparesATerminal(req, actor)
        reply.code(201)
        return { terminal }
      }
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const body = parse(openPress, req.body ?? {}, 'The terminal cannot be opened:')
      const folder = theFolder(body.folder ?? theHomeDirectory())
      const env = theEnvironmentATerminalGets()
      const shell = theShellOf(env)
      const command = body.command ?? shell.command
      if (command === undefined || command === '') {
        throw new PanelError(`No command was named, and this server has no ${shell.variable} to open instead. Name a command. Nothing was opened.`)
      }
      await theHolder()
      const answer = await askTheHolderFor({
        op: 'open',
        who: whoOpensIt(actor),
        // THE AGENT WORKING IN IT: none, for a terminal the person opens. Agents in the terminal are round 3.
        agent: null,
        project: workspaceOf(req),
        command,
        args: body.args ?? [],
        folder,
        env,
        cols: body.cols ?? THE_FIRST_SIZE.cols,
        rows: body.rows ?? THE_FIRST_SIZE.rows,
        keeping: body.keeping ?? true,
      })
      reply.code(201)
      return { terminal: answer['terminal'] as TerminalReading }
    },
  )

  app.get(
    '/terminals/:id/stream',
    // `waits: true` SAYS THIS IS HELD OPEN, as GET /api/events says it, so its time is kept out of how long
    // a request takes.
    {
      config: {
        ...route(
          'terminals.read',
          'local',
          { because: 'acts-on-this-machine', act: "Reading a terminal", thePersonMayFromAnotherComputer: true },
          "The person reads one terminal, and a secretary with its own key on this computer reads a terminal bound to an agent, as server-sent events: first its screen as it is now, with the lines above it, then each piece of output as it comes, then its end. The holder keeps a terminal's output in memory only.",
        ).config,
        waits: true,
      },
    },
    async (req, reply) => {
      const actor = actorFrom(req)
      await assertATerminalAgentIsHere(req, actor)
      const secretary = aSecretaryWithItsOwnKey(actor)
      if (!secretary) thePersonOrTheGrant(actor, theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      // A SECRETARY'S OWN KEY READS a terminal bound to an agent, and one it prepared for the person while it runs. A
      // manual shell is neither.
      if (secretary && !aSecretaryMayReadIt(await theTerminalIfListed(id), actor)) {
        thePersonOrTheGrant(actor, theActKeptHere(req))
      }
      await theHolder()
      // THE WATCH IS ASKED FOR BEFORE THE STREAM OPENS, so a terminal that is not there, or a holder that
      // is not running, is an ordinary refusal with its status rather than a stream that ends at once.
      const pendingEvents: TerminalEvent[] = []
      let deliver: ((event: TerminalEvent) => void) | null = null
      let whenGone: (() => void) | null = null
      const watching = await watchATerminal(
        id,
        (event) => (deliver === null ? pendingEvents.push(event) : deliver(event)),
        () => whenGone?.(),
      )
      // A READER THAT LEFT WHILE THE WATCH WAS ASKED FOR is let go at once: its close has already fired.
      if (req.raw.destroyed || reply.raw.destroyed) {
        watching.stop()
        reply.hijack()
        return
      }

      // Set once the screen is written; a reader let go before then has nothing to stop.
      let stopTypedFrom = (): void => {}
      const { write, end } = openATerminalStream(req, reply, (line) => app.log.warn(line), () => {
        stopTypedFrom()
        watching.stop()
      })
      // WHERE ITS TYPING CAME FROM goes with the screen, and again each time an input is counted.
      write('screen', { terminal: watching.terminal, screen: watching.screen, typedFrom: typedFromOf(id) })
      stopTypedFrom = watchTypedFrom(id, (now) => write('typed-from', now))
      sayATerminalWasUsedFromAnotherComputer(req, theSourceOf(req, actor), id, 'read', watching.terminal)
      deliver = (event) => {
        if (event.event === 'output') write('output', { data: event.data })
        else if (event.event === 'ended') write('ended', { exit: event.exit })
        else if (event.event === 'resized') write('resized', { cols: event.cols, rows: event.rows })
        else {
          write('closed', {})
          end()
        }
      }
      for (const event of pendingEvents.splice(0)) deliver(event)
      whenGone = () => {
        write('holder-gone', {
          says: 'The terminal holder ended this stream: it stopped, or this reader fell too far behind. Read the terminal again to get its screen.',
        })
        end()
      }
    },
  )

  app.get(
    '/terminals/stream',
    // `waits: true` SAYS THIS IS HELD OPEN, as one terminal's stream says it.
    {
      config: {
        ...route(
          'terminals.read',
          'local',
          { because: 'acts-on-this-machine', act: 'Reading several terminals', thePersonMayFromAnotherComputer: true },
          "One reading of several terminals, named as terminals=<id>,<id>, one or more and each once, as server-sent events. Every event names the terminal it is about as `terminal`: first each one's screen as it is now, with its reading and the lines above it, then each piece of output as it comes. A terminal closed while it is read is said closed and the others go on; the reading ends when the last is closed. Each terminal is under the same authority as its own stream, GET /api/terminals/:id/stream, and a reading that names one the reader may not read is refused whole.",
        ).config,
        waits: true,
      },
    },
    async (req, reply) => {
      const actor = actorFrom(req)
      await assertATerminalAgentIsHere(req, actor)
      const secretary = aSecretaryWithItsOwnKey(actor)
      if (!secretary) thePersonOrTheGrant(actor, theActKeptHere(req))
      const ids = theTerminalsOfAReading(req.query)
      // EACH TERMINAL UNDER THE AUTHORITY OF ITS OWN STREAM: one the secretary's own key may not read asks the person or
      // the grant, as its own stream does, and a refusal refuses the whole reading.
      if (secretary) {
        const listed = (await askTheHolderFor({ op: 'list' }, THE_PAGES_HOLDER_READ_MS))['terminals'] as TerminalReading[]
        if (ids.some((id) => !aSecretaryMayReadIt(listed.find((one) => one.id === id) ?? null, actor))) thePersonOrTheGrant(actor, theActKeptHere(req))
      }
      await theHolder()
      // EVERY WATCH IS ASKED FOR BEFORE THE STREAM OPENS, so a terminal that is not there is an ordinary refusal with its
      // status, and the watches already made are let go.
      let deliver: ((id: string, event: TerminalEvent) => void) | null = null
      let whenGone: ((id: string) => void) | null = null
      const watches: { id: string; waiting: TerminalEvent[]; terminal: TerminalReading; screen: string; stop: () => void }[] = []
      try {
        for (const id of ids) {
          const waiting: TerminalEvent[] = []
          const watching = await watchATerminal(
            id,
            (event) => (deliver === null ? waiting.push(event) : deliver(id, event)),
            () => whenGone?.(id),
          )
          watches.push({ id, waiting, ...watching })
        }
      } catch (err) {
        for (const one of watches) one.stop()
        throw err
      }
      if (req.raw.destroyed || reply.raw.destroyed) {
        for (const one of watches) one.stop()
        reply.hijack()
        return
      }

      const stillOpen = new Set(ids)
      const stopTypedFrom = new Map<string, () => void>()
      const letGo = (one: { id: string; stop: () => void }): void => {
        stopTypedFrom.get(one.id)?.()
        one.stop()
      }
      const { write, end } = openATerminalStream(req, reply, (line) => app.log.warn(line), () => {
        for (const one of watches) letGo(one)
      })
      const source = theSourceOf(req, actor)
      for (const one of watches) {
        write('screen', { terminal: one.id, reading: one.terminal, screen: one.screen, typedFrom: typedFromOf(one.id) })
        stopTypedFrom.set(one.id, watchTypedFrom(one.id, (now) => write('typed-from', { terminal: one.id, typedFrom: now })))
        sayATerminalWasUsedFromAnotherComputer(req, source, one.id, 'read', one.terminal)
      }
      deliver = (id, event) => {
        if (!stillOpen.has(id)) return
        if (event.event === 'output') write('output', { terminal: id, data: event.data })
        else if (event.event === 'ended') write('ended', { terminal: id, exit: event.exit })
        else if (event.event === 'resized') write('resized', { terminal: id, cols: event.cols, rows: event.rows })
        else {
          // A TERMINAL CLOSED IN THE READING is let go, and the others go on.
          write('closed', { terminal: id })
          stillOpen.delete(id)
          const closed = watches.find((one) => one.id === id)
          if (closed !== undefined) letGo(closed)
          if (stillOpen.size === 0) end()
        }
      }
      for (const one of watches) for (const event of one.waiting.splice(0)) deliver(one.id, event)
      whenGone = (id) => {
        write('holder-gone', {
          terminal: id,
          says: 'The terminal holder ended this reading: it stopped, or this reader fell too far behind. Read the terminals again to get their screens.',
        })
        end()
      }
    },
  )

  app.post(
    '/terminals/:id/input',
    route(
      'terminals.type',
      'local',
      { because: 'acts-on-this-machine', act: 'Typing into a terminal', thePersonMayFromAnotherComputer: true },
      "The person types into one terminal: the characters are given to it as they are, keys such as Enter as their control characters. While the terminal's keeping is on, each line ended with Enter is kept in the person's note for that terminal, a moment later, unless the screen did not show it, an arrow key edited it or it is longer than 2,000 characters; those are only counted. A line that looks like a key is kept, and the terminal view warns about it. A secretary may type one whole line for the person: body {line, warrant?}, with no Enter or other key in the line, and the office presses Enter after it unless the person types first. It needs either the person's words for this exact line, for terminals.type: plus JSON {terminal, line}, carried with its own key, or the person's grant where this office's list of what the grant carries lets it type. The secretary's line is written down without its text, is counted as typed by a secretary, and is never kept as the person's words.",
    ),
    async (req) => {
      const actor = actorFrom(req)
      if (!thePersonIsProved(actor)) return aSecretaryTypesALine(req, actor)
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      const body = parse(typing, req.body ?? {}, 'Nothing was typed:')
      await theHolder()
      const written = await askTheHolderFor({ op: 'write', terminal: id, data: body.data })
      // WHERE IT WAS TYPED FROM, counted once the holder has taken it (lib/terminal-typed-from.ts).
      const source = theSourceOf(req, actor)
      const { began } = recordAnInput(id, source)
      if (began && source.level === 'another computer') sayATerminalWasUsedFromAnotherComputer(req, source, id, 'typed into', await theTerminalIfListed(id))
      // THE PERSON'S TYPING KEPT WITH NO PRESS (src/server/lib/terminal-keeping.ts): the holder says lines wait to be taken.
      if (typeof written['linesToTake'] === 'number' && written['linesToTake'] > 0) takeTheLinesLater(id, actor, (line) => req.log.warn(line))
      return { typed: body.data.length, typedFrom: source.level }
    },
  )

  app.post(
    '/terminals/:id/resize',
    route(
      'terminals.resize',
      'local',
      { because: 'acts-on-this-machine', act: 'Resizing a terminal', thePersonMayFromAnotherComputer: true },
      'The person gives one terminal a new size, in columns and rows. Every reader of it sees the new size.',
    ),
    async (req) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      const body = parse(resizing, req.body ?? {}, 'The terminal was not resized:')
      await theHolder()
      const answer = await askTheHolderFor({ op: 'resize', terminal: id, cols: body.cols, rows: body.rows })
      return { terminal: answer['terminal'] as TerminalReading }
    },
  )

  app.post(
    '/terminals/:id/close',
    route(
      'terminals.close',
      'local',
      { because: 'acts-on-this-machine', act: 'Closing a terminal', thePersonMayFromAnotherComputer: true },
      "The person closes one terminal. A secretary with its own key on this computer may also close an agent terminal it opened. If it still runs, its process group is sent SIGHUP, as when a terminal window is closed; then the holder forgets it and its output.",
    ),
    async (req) => {
      const actor = actorFrom(req)
      const secretary = aSecretaryWithItsOwnKey(actor)
      if (secretary) await assertATerminalAgentIsHere(req, actor)
      else thePersonOrTheGrant(actor, theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      await theHolder()
      const source = theSourceOf(req, actor)
      const before = secretary || actor.press?.underTheGrant !== undefined || source.level === 'another computer' ? await theTerminalIfListed(id) : null
      const ownsAgentTerminal = secretary && before?.agent?.kind === 'agent' && before.who?.kind === 'agent' && before.who.id === whoOpensIt(actor).id
      if (secretary && !ownsAgentTerminal) thePersonOrTheGrant(actor, theActKeptHere(req))
      const underTheGrant = actor.press?.underTheGrant !== undefined
      if (!ownsAgentTerminal && underTheGrant && before !== null && before.agent !== null) {
        // AN AGENT'S RUN WOULD BE ENDED AS CLOSED BY THE PERSON. Refuse before the holder closes anything.
        throw aTerminalRefusal(
          'terminalHoldsAnAgentsRun',
          "Under the person's grant, a secretary may close only a terminal no agent runs in. Nothing was closed.",
          403,
        )
      }
      const answer = ownsAgentTerminal ? await closeTheTerminalAsSecretary(id, actor.id) : await askTheHolderFor({ op: 'close', terminal: id })
      sayATerminalWasUsedFromAnotherComputer(req, source, id, 'closed', before)
      forgetTypedFrom(id)
      return { closed: answer['closed'], wasRunning: answer['wasRunning'] }
    },
  )

  /*
   * START THE TERMINAL HOLDER, the person's press for a holder that is not running (wave 13u, round 3; the review of
   * round 2's pictures, point 1: the notice said what was wrong and not what to do). It starts the holder the one way the
   * service command does (startATerminalHolder in src/config/the-terminal-holder.mjs), detached and in a process group of
   * its own, so it keeps running when this server restarts, and records it in the ledger. Nothing the person must do is a command
   * in a terminal (chapter 10, rule 4).
   */
  app.post(
    '/terminals/holder/start',
    route(
      'terminals.start-holder',
      'local',
      { because: 'acts-on-this-machine', act: 'Starting the terminal holder' },
      "The person starts the office's terminal holder when none runs. It is started detached, in a process group of its own, as mole-office start starts it, and keeps running when the server restarts. A holder that already runs is left as it is.",
    ),
    async (req) => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const started = await startAHolderAsAPageDoes()
      if (started.outcome === 'turned off') {
        throw aTerminalRefusal('terminalHolderTurnedOff', 'No terminal holder was started, because MOLE_OFFICE_TERMINAL_HOLDER is off for this office.', 409)
      }
      if (started.outcome === 'no way to start') {
        throw aTerminalRefusal('terminalHolderDidNotStart', `${started.why} No terminal holder was started.`, 409)
      }
      if (started.outcome === 'another') {
        throw aTerminalRefusal('terminalHolderUnusable', `Something answers on the terminal holder's socket, but not as the holder of this office, so no holder was started.`, 409)
      }
      if (started.outcome === 'another-copy') {
        throw aTerminalRefusal('terminalHolderUnusable', `${started.why} It was not used, and no holder was started. It was left running with its terminals.`, 409)
      }
      if (started.outcome === 'could-not-spawn' || started.outcome === 'ended') {
        throw aTerminalRefusal('terminalHolderDidNotStart', `The terminal holder did not start: ${started.why}.`, 502)
      }
      if (started.outcome === 'silent') {
        throw aTerminalRefusal('terminalHolderNoAnswer', `The terminal holder, process ${String(started.pid)}, did not answer in time. It was left running.`, 504)
      }
      if (started.outcome === 'unknown') {
        // NO CODE FITS YET: a holder answers, and Windows could not say whether it is the one this press started.
        throw new PanelError(
          `A terminal holder, process ${String(started.pid)}, answers for this office, and Windows could not say whether the Job Object of ` +
            `group ${String(started.group)}, which this press started, holds it: ${started.why} It was left running.`,
          502,
        )
      }
      return { holder: await theHolderState(), started: started.outcome === 'started' }
    },
  )

  /*
   * RESTART THE TERMINAL HOLDER, the person's press under Tools in Settings (wave 13u round 23).
   * The page lists the holder and its terminals from GET /api/terminals and says each will be ended; the confirming
   * press sends back what it showed. The holder is stopped only by its own row in the ledger, and a new one is started
   * as the start press starts one. lib/the-holders-restart.ts says each step and where a refusal leaves the holder.
   */
  app.post(
    '/terminals/holder/restart',
    route(
      'terminals.restart-holder',
      'local',
      { because: 'acts-on-this-machine', act: 'Restarting the terminal holder' },
      "The person restarts the office's terminal holder, which ends every terminal it holds. The body is `{ expect: { pid, startedAt, terminals } }`: the holder and the id of every terminal the confirming press was shown, as GET /api/terminals listed them. A different holder, or a terminal the press did not show, is refused before anything is stopped. The holder is stopped by SIGTERM to its process group as the ledger recorded it, never with SIGKILL, and a new holder is started detached, as mole-office start starts one. It answers the holder that was stopped, the holder now, how many running terminals were ended and the old holder's last log line. Agents that worked in the old terminals are opened again with their resume command, and the person is told in one message.",
    ),
    async (req) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const body = restartPress.safeParse(req.body ?? {})
      if (!body.success) {
        throw aTerminalRefusal(
          'terminalHolderRestartBadBody',
          `The restart takes { "expect": { "pid", "startedAt", "terminals" } }, the holder and the terminals the confirming press was shown, and nothing else. ${body.error.issues.map((issue) => `${issue.path.join('.') || 'the body'}: ${issue.message}`).join('; ')}. Nothing was stopped.`,
          400,
        )
      }
      return restartTheHolder(body.data.expect, actor)
    },
  )

  /*
   * THE PERSON'S TYPING AS THEIR OWN WORDS, from round 3 of wave 13u.
   * What the person types passes the
   * person-only typing door, so a line of it may be kept as a note of theirs, which counts as their own words with no further
   * press, as what they write in chat does. Only a line they mark is kept: the holder remembers the last line they ended with
   * Enter, in memory only, and offers it only if the screen showed it (a password at a prompt that does not echo is never
   * shown). A line that looks like a key is offered and kept like any other, and the offer says it looks like one, in
   * words that block nothing. That is round 12. Answer LBC7EuG5aIqI, under one of the owner's decisions, says
   * a suspected key is never refused. The page shows the line before they keep it, and the keep press names the text it saw, so what is
   * kept is exactly what they read. Under the grant the same line is kept as the secretary's note: its writer and grant
   * are recorded, so it never counts as the person's own words.
   */
  app.get(
    '/terminals/:id/last-line',
    route(
      'terminals.last-line',
      'local',
      { because: 'acts-on-this-machine', act: 'Reading the last line typed into a terminal', thePersonMayFromAnotherComputer: true },
      'The person reads the last line they typed into one terminal, offered only when the screen showed it and it is not too long, so they can keep it as their own words. The answer says whether the line looks like a key.',
    ),
    async (req): Promise<TheLastLine> => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      return theLastLineOf(id)
    },
  )

  app.post(
    '/terminals/:id/keep-my-line',
    route(
      'terminals.keep-line',
      'local',
      { because: 'acts-on-this-machine', act: 'Keeping a line typed into a terminal as your own words', thePersonMayFromAnotherComputer: true },
      "The person keeps the last line they typed into one terminal as a note of their own, which counts as their own words. The body names the line they read; a line that changed since or was not shown on the screen is refused and nothing is kept. A line that looks like a key is kept.",
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      const body = parse(keeping, req.body ?? {}, 'Nothing was kept:')
      // EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN (COMMON.md: a door validates everything first).
      const offered = await theLastLineOf(id)
      if (offered.line === null) {
        throw aTerminalRefusal(
          'terminalNoLineToKeep',
          offered.why === 'not-shown'
            ? 'The screen did not show the last line typed into this terminal, as at a password prompt, so it cannot be kept. Nothing was kept.'
            : 'No line has been typed into this terminal yet. Nothing was kept.',
          409,
        )
      }
      if (offered.line.text !== body.text) {
        throw aTerminalRefusal('terminalLineChanged', 'The last line typed into this terminal is not the one you read. Read it again. Nothing was kept.', 409)
      }
      const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
      const terminal = listed.find((one) => one.id === id)
      if (terminal === undefined) throw aTerminalRefusal('terminalNotHeld', `This holder holds no terminal "${id}". Nothing was kept.`, 400)
      const filed = createRecord({
        kind: 'note',
        title: body.text.length > TITLE_LENGTH ? `${body.text.slice(0, TITLE_LENGTH - 1)}…` : body.text,
        workspaceId: workspaceOf(req),
        data: { body: body.text, date: offered.line.at.slice(0, 10), [TYPED_IN_TERMINAL]: `${theCommandLine(terminal)} in ${terminal.folder}` },
        actor,
      })
      reply.code(201)
      return {
        record: { id: filed.id, title: filed.title },
        ...(actor.press?.underTheGrant === undefined ? {} : {
          says: "The line was typed in the terminal. The secretary kept it as its note under the person's grant. It does not count as the person's own words.",
        }),
      }
    },
  )

  /*
   * THE PERSON'S TYPING KEPT WITH NO PRESS. Wave 13u, round 4 built it, by decision YLv8grhgilBV under a
   * decision of the owner's. Each
   * terminal has a switch, on when it opens. While it is on, every line the person ends with Enter goes into one note of theirs for
   * that terminal (src/server/lib/terminal-keeping.ts). The terminal view reads the switch and the note here.
   */
  app.get(
    '/terminals/:id/keeping',
    route(
      'terminals.keeping',
      'local',
      { because: 'acts-on-this-machine', act: 'Reading a terminal\'s setting for keeping typed lines', thePersonMayFromAnotherComputer: true },
      'The person reads whether one terminal keeps what they type as their notes, and the note it keeps it in: how many lines it holds and how many were left out, by why.',
    ),
    async (req): Promise<TheKeeping> => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      await theHolder()
      return theKeepingOf(await theTerminalReading(id, 'Nothing was read.'))
    },
  )

  app.put(
    '/terminals/:id/keeping',
    route(
      'terminals.set-keeping',
      'local',
      { because: 'acts-on-this-machine', act: 'Changing a terminal\'s setting for keeping typed lines', thePersonMayFromAnotherComputer: true },
      "The person turns on or off keeping what they type into one terminal as their notes. Turned off, nothing more is kept and lines waiting to be kept are let go; the press that keeps one line works again. An agent's terminal remembers it when it is opened again.",
    ),
    async (req): Promise<TheKeeping> => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      const body = parse(keepingPress, req.body ?? {}, 'Keeping was not changed:')
      await theHolder()
      await theTerminalReading(id, 'Keeping was not changed.')
      const answer = await askTheHolderFor({ op: 'keeping', terminal: id, on: body.on })
      const reading = answer['terminal'] as TerminalReading
      const recordUnchanged = rememberTheKeepingOfTheAgentIn(id, body.on)
      return { ...theKeepingOf(reading), ...(recordUnchanged && answer['changed'] === false ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
    },
  )

  /*
   * THE PERSON NAMES A TERMINAL, GROUPS IT AND TAGS IT. The holder keeps them with the terminal, in memory only, so they
   * end with it and with every terminal when the holder restarts; there is no table for them. The list and the readings
   * give them back.
   */
  app.post(
    '/terminals/:id/name',
    route(
      'terminals.name',
      'local',
      { because: 'acts-on-this-machine', act: 'Naming a terminal' },
      "The person gives one terminal a name, a group and tags: body {name, group, tags}, where a null name or group and no tags are none, and setting none takes them off. The spaces around each are taken off, and the answer shows them as they are kept. A blank, too long or keyed name, group or tag is refused, and a tag twice. They are kept with the terminal in the terminal holder's memory only, so they end with the terminal, and with every terminal when the holder restarts.",
    ),
    async (req) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const { id } = parse(theTerminalNamed, req.params, 'Which terminal:')
      const body = parse(namingPress, req.body ?? {}, 'Nothing was changed:')
      const names = {
        name: aKeptLabel(body.name, THE_LONGEST_TERMINAL_NAME, 'terminalNameRefused', 'name', id),
        group: aKeptLabel(body.group, THE_LONGEST_TERMINAL_GROUP, 'terminalGroupRefused', 'group', id),
        tags: theKeptTags(body.tags, id),
      }
      const terminal = await nameATerminal(id, names)
      writeDownAnActUnderTheRaise(actor, {
        setting: 'terminals',
        field: `one terminal named, ${id}`,
        before: null,
        after: JSON.stringify(names),
        workspaceId: workspaceOf(req),
      })
      return { terminal }
    },
  )
}

/** The terminal the holder holds by this id, or a refusal saying it holds none. */
async function theTerminalReading(id: string, nothing: string): Promise<TerminalReading> {
  const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
  const terminal = listed.find((one) => one.id === id)
  if (terminal === undefined) throw aTerminalRefusal('terminalNotHeld', `This holder holds no terminal "${id}". ${nothing}`, 400)
  return terminal
}

/** How many characters of a kept line its note's title holds. */
const TITLE_LENGTH = 80

/** What keeping a line names: the text the person read. */
const keeping = z.object({ text: z.string().min(1).max(THE_LONGEST_LINE_KEPT) }).strict()

/** The last line typed into a terminal, as the holder offers it, saying whether it looks like a key. */
async function theLastLineOf(id: string): Promise<TheLastLine> {
  await theHolder()
  const answer = await askTheHolderFor({ op: 'lastLine', terminal: id })
  const line = answer['line'] as TheLastLine['line']
  if (line === null) return { line: null, why: answer['why'] === 'not-shown' ? 'not-shown' : 'none', looksLikeAKey: false }
  if (line.text.length > THE_LONGEST_LINE_KEPT) return { line: null, why: 'too-long', looksLikeAKey: false }
  return { line, why: null, looksLikeAKey: whyThisLooksLikeASecret(line.text) !== null }
}
