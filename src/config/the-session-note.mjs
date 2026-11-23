// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SESSION HOOK'S NOTE: WHICH RECORD A CLAUDE CODE CONVERSATION IS FILED AS, KEPT ON DISK.
 *
 * tools/session-hook.mjs files a session record when a conversation starts and keeps a note of it in
 * `<checkout>/.logs/session-<conversation>.json`, holding {"id", "at"}. `stop` and `end` have only the
 * conversation's id to go on, so the note is how they find the record to stamp with the conversation at the end of
 * each turn, and to close at the end. The server reads the same notes back (`recordsTheHookFiled` in
 * src/server/lib/sessions.ts), and reads only "id".
 *
 * A SECOND WRITER SINCE 29 SEPTEMBER 2026: tools/register-myself.mjs (problem Tv32CoCfV-cP). An agent's start hook filed
 * a record for his conversation and noted it. His registration, admitted at the owner's press, filed a second record
 * for the same conversation, and his waiter held his handle on that one. The Stop hook went on stamping the first, so
 * nothing tied his process to the record his handle was on, and the office showed him as Cannot reach. register-myself
 * now points the note at the record the registration gave the conversation. When the record the note named before was
 * the start hook's own (live, of this conversation, held by no agent), it also writes "supersedes", naming it, and the
 * hook closes that record at the end of the next turn: an agent may not end a run it did not start or file (problem
 * FZQflYp1vHuY), and the hook is one of the office's own processes. So the folder, the name, the reading and the
 * writing are declared here once, for both writers.
 *
 * THE PROJECT EACH NAMED RECORD IS IN, SINCE 3 OCTOBER 2026 (problem uEpCGFcsM4Z6; the refusal of check tGSC1GMzXgPv).
 * A start whose waiter holds its handle on a record in another project takes that record over, and the note then names a
 * record outside the folder's project. `stop` and `end` asked for it under the folder's project, the office answered 404,
 * and the stamp and the close were lost. So the note says which project its record is in ("workspace"), and which project
 * the record it supersedes is in ("supersedesWorkspace"), and the hook reads the record there in every mode. A note with
 * no project names a record in the folder's project, as every note did before. "supersededBecause" says why the old
 * record is closed: "held" for a takeover; absent for a registration.
 *
 * THE RUN A CHILD WAS STARTED UNDER, SINCE 13 OCTOBER 2026 (problem c3p75p8aALd2). A session started by hand inside
 * another session inherits the outer one's MOLE_OFFICE_SESSION. While the outer conversation still runs, the hook files
 * the inner session's own record with that run as its parent, and the note says so in "childOf". Every later start,
 * stop and end of the inner session then reads its own record through the note, and not the run the environment names.
 *
 * THE AGENT KEY FILE OF THE SESSION'S WAITER, SINCE 23 NOVEMBER 2026. A session started by hand names its agent and
 * holds no key of it: the key is in a file that only its waiter was given, in MOLE_AGENT_KEY_FILE. The office lets no
 * name alone stamp, change or end a run, so the hook's stamp, its compaction note and its end were refused. So the
 * waiter (tools/hold-the-handle.mjs), once the office has taken its hold, writes the full path of that file into the
 * note as "agentKeyFile", and the hook reads the key from it at a compaction, a stop and an end and sends it under the
 * agent's name. The note holds the path and never the key, and every writer that rewrites a note carries the path the
 * note already holds. A path that is not a full one is read as none and refused by the writer. The lines both print
 * about it are `THE_KEY_FILE_ENTRY_SAYS`, below, and neither names the path.
 *
 * AND THE OFFICE THAT WAITER HELD, SINCE THE SAME DAY. The waiter holds its handle on the office it asks, which its
 * `--api` names when it is given, and the hook asks the office its own install or environment names. Nothing compared
 * the two, so a hook pointed at another office sent the key there. So the waiter writes the address it asked beside the path, as "agentKeyOffice", at the same
 * moment and only then, and the hook sends the key only when its own address is that one, compared as written: one
 * office written two ways is not the same office here. An office is read and written only beside a key file, and a note
 * that names a key file and no office sends no key. Every writer that rewrites a note carries both, through
 * `theWaitersKeyFileAndOffice`. The note holds the address, and no line prints it.
 *
 * AND THE STATES IN WHICH A RUN IS OVER, which both writers ask of the record a note names. The list is
 * `RUN_IS_OVER_STATES` in src/server/lib/keys.ts. The hook runs on Node 18 and cannot import a `.ts` file, so this is
 * its copy, and tests/the-hook-adopts-the-record-that-names-its-conversation.test.ts fails if the two differ.
 *
 * A CONVERSATION ID NAMES A FILE, so an id is taken only when it is letters, digits, dots, underscores and dashes, and
 * starts with a letter or a digit: an id with a slash, or `..`, would name a file outside the folder. Claude Code's ids
 * are UUIDs. Any other id has no note: nothing is read or written for it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { THE_INSTALL } from './settings.mjs'

/**
 * The folder the notes are kept in: `.logs` in the data folder of the install this file is in, which is the hook's own.
 * In a checkout that is the checkout. In an installed office it is the person's data folder, because the office's own
 * folder may be one the person cannot write to, such as /opt (round W21).
 */
export const THE_SESSION_NOTES_FOLDER = join(THE_INSTALL.dataRoot, '.logs')

/** The states in which a session record's run is over. A copy of RUN_IS_OVER_STATES in src/server/lib/keys.ts. */
export const RUN_IS_OVER_STATES = ['finished', 'crashed', 'paused', 'orphaned']

const A_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * WHAT THE WAITER AND THE HOOK SAY ABOUT THE KEY FILE A NOTE NAMES, declared once, for both and for their tests. No line
 * names the path or the key. The waiter's lines go to its output: one when it wrote the path, left out when it starts
 * again, and one when its key came from a file and it wrote nothing, saying why. The hook's three go to its stderr, when
 * the file the note names is not there or was not used, or when the note does not say that its waiter held the office
 * the hook asks, and the hook then sends the agent's name alone. No line names an office's address either.
 */
export const THE_KEY_FILE_ENTRY_SAYS = Object.freeze({
  written:
    "This session's note names this waiter's key file and the office it holds its handle on now, so a session hook that asks " +
    "that same office sends the agent's key at a compaction, a stop and an end.",
  noConversation: "This session's note was not told about this waiter's key file, because CLAUDE_CODE_SESSION_ID names no conversation a note can be kept for.",
  noNote: "This session's note was not told about this waiter's key file, because this conversation has no note that names a record, and the waiter never makes one.",
  anotherRecord: "This session's note was not told about this waiter's key file, because the note names another record than the one this waiter holds its handle on.",
  /** @param {string} code */
  notWritten: (code) => `This session's note was not told about this waiter's key file, because writing the note failed (${code}).`,
  absent: "session-hook: the agent key file this session's note names is not there, so the hook sent the agent's name alone, with no key.",
  refused:
    "session-hook: the agent key file this session's note names was not used, because a key file must be this user's own regular file, " +
    'not a link, that nobody else may read or change, holding exactly one key. So the hook sent the agent\'s name alone, with no key.',
  anotherOffice:
    "session-hook: the agent key file this session's note names was not used, because the note does not say that its waiter held " +
    "the office this hook asks. So the hook sent the agent's name alone, with no key.",
})

/**
 * Whether `conversation` can name a note.
 * @param {unknown} conversation
 * @returns {conversation is string}
 */
export function aConversationANoteCanName(conversation) {
  return typeof conversation === 'string' && A_CONVERSATION_ID.test(conversation)
}

/**
 * Where the note of `conversation` is, or null when its id cannot name one.
 * @param {string} conversation
 * @returns {string | null}
 */
export function theSessionNotePath(conversation) {
  return aConversationANoteCanName(conversation) ? join(THE_SESSION_NOTES_FOLDER, `session-${conversation}.json`) : null
}

/**
 * What the note of `conversation` holds: the record it names, when it was written, the record that one supersedes, the
 * project of each, why the old one is superseded, the run the record is a child of, the full path of the agent key
 * file the session's waiter was given, and the office that waiter held, as it was written; null for any of those it
 * does not say, for a path that is not a full one, and for an office when there is no key file.
 * Null for all of it when there is no note, when it is unreadable or names no record, or when the id cannot name a note.
 * @param {string} conversation
 * @returns {{ id: string, at: string | null, supersedes: string | null, workspace: string | null,
 *   supersedesWorkspace: string | null, supersededBecause: 'held' | null, childOf: string | null,
 *   agentKeyFile: string | null, agentKeyOffice: string | null } | null}
 */
export function theSessionNote(conversation) {
  const path = theSessionNotePath(conversation)
  if (path === null) return null
  const word = (/** @type {unknown} */ value) => (typeof value === 'string' && value !== '' ? value : null)
  try {
    const held = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof held !== 'object' || held === null || typeof held.id !== 'string' || held.id === '') return null
    const supersedes = word(held.supersedes)
    const agentKeyFile = typeof held.agentKeyFile === 'string' && isAbsolute(held.agentKeyFile) ? held.agentKeyFile : null
    return {
      id: held.id,
      at: typeof held.at === 'string' ? held.at : null,
      supersedes,
      workspace: word(held.workspace),
      supersedesWorkspace: supersedes === null ? null : word(held.supersedesWorkspace),
      supersededBecause: supersedes !== null && held.supersededBecause === 'held' ? 'held' : null,
      childOf: word(held.childOf),
      agentKeyFile,
      agentKeyOffice: agentKeyFile === null ? null : word(held.agentKeyOffice),
    }
  } catch {
    return null
  }
}

/**
 * The record the note of `conversation` names, or null.
 * @param {string} conversation
 * @returns {string | null}
 */
export function theRecordTheNoteNames(conversation) {
  return theSessionNote(conversation)?.id ?? null
}

/**
 * The waiter's key file and the office it held, as the note `note` holds them, for a writer that rewrites the note to
 * hand on: each rewrite spreads this into its `places`, so no rewrite keeps one and drops the other.
 * @param {{ agentKeyFile?: string | null, agentKeyOffice?: string | null } | null | undefined} note
 * @returns {{ agentKeyFile: string | null, agentKeyOffice: string | null }}
 */
export function theWaitersKeyFileAndOffice(note) {
  return { agentKeyFile: note?.agentKeyFile ?? null, agentKeyOffice: note?.agentKeyOffice ?? null }
}

/**
 * Write the note of `conversation`, naming record `id`, and, when `supersedes` names one, the record it supersedes;
 * `places` says which project each is in, why the old one is superseded, which run the record is a child of, the
 * full path of the agent key file the session's waiter was given and the office that waiter held, when the writer
 * knows. A writer that rewrites a note hands on the path and the office the note holds (`theWaitersKeyFileAndOffice`),
 * or the note loses them. An office is written only beside a key file, as "supersedesWorkspace" only beside
 * "supersedes". Answers where it is; null when the id cannot name a note.
 * Throws, and writes nothing, when the key file is named by a path that is not a full one.
 * @param {string} conversation
 * @param {string} id
 * @param {string} at  when, as the hook writes it: "YYYY-MM-DD HH:MM", local time
 * @param {string | null} [supersedes]
 * @param {{ workspace?: string | null, supersedesWorkspace?: string | null, supersededBecause?: 'held' | null,
 *   childOf?: string | null, agentKeyFile?: string | null, agentKeyOffice?: string | null }} [places]
 * @returns {string | null}
 */
export function writeTheSessionNote(conversation, id, at, supersedes = null, places = {}) {
  const path = theSessionNotePath(conversation)
  if (path === null) return null
  const {
    workspace = null,
    supersedesWorkspace = null,
    supersededBecause = null,
    childOf = null,
    agentKeyFile = null,
    agentKeyOffice = null,
  } = places
  if (agentKeyFile !== null && !isAbsolute(agentKeyFile)) {
    throw new Error("A session's note names its agent key file by a full path only, and this one was not, so the note was not written.")
  }
  mkdirSync(THE_SESSION_NOTES_FOLDER, { recursive: true })
  writeFileSync(path, JSON.stringify({
    id,
    at,
    ...(supersedes === null ? {} : { supersedes }),
    ...(workspace === null ? {} : { workspace }),
    ...(supersedes === null || supersedesWorkspace === null ? {} : { supersedesWorkspace }),
    ...(supersedes === null || supersededBecause === null ? {} : { supersededBecause }),
    ...(childOf === null ? {} : { childOf }),
    ...(agentKeyFile === null ? {} : { agentKeyFile }),
    ...(agentKeyFile === null || agentKeyOffice === null ? {} : { agentKeyOffice }),
  }), 'utf8')
  return path
}
