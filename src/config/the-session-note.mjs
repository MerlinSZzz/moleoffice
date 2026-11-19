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
 * AND THE STATES IN WHICH A RUN IS OVER, which both writers ask of the record a note names. The list is
 * `RUN_IS_OVER_STATES` in src/server/lib/keys.ts. The hook runs on Node 18 and cannot import a `.ts` file, so this is
 * its copy, and tests/the-hook-adopts-the-record-that-names-its-conversation.test.ts fails if the two differ.
 *
 * A CONVERSATION ID NAMES A FILE, so an id is taken only when it is letters, digits, dots, underscores and dashes, and
 * starts with a letter or a digit: an id with a slash, or `..`, would name a file outside the folder. Claude Code's ids
 * are UUIDs. Any other id has no note: nothing is read or written for it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * project of each, why the old one is superseded, and the run the record is a child of; null for any of those it does
 * not say. Null for all of it when there is no note, when it is unreadable or names no record, or when the id cannot
 * name a note.
 * @param {string} conversation
 * @returns {{ id: string, at: string | null, supersedes: string | null, workspace: string | null,
 *   supersedesWorkspace: string | null, supersededBecause: 'held' | null, childOf: string | null } | null}
 */
export function theSessionNote(conversation) {
  const path = theSessionNotePath(conversation)
  if (path === null) return null
  const word = (/** @type {unknown} */ value) => (typeof value === 'string' && value !== '' ? value : null)
  try {
    const held = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof held !== 'object' || held === null || typeof held.id !== 'string' || held.id === '') return null
    const supersedes = word(held.supersedes)
    return {
      id: held.id,
      at: typeof held.at === 'string' ? held.at : null,
      supersedes,
      workspace: word(held.workspace),
      supersedesWorkspace: supersedes === null ? null : word(held.supersedesWorkspace),
      supersededBecause: supersedes !== null && held.supersededBecause === 'held' ? 'held' : null,
      childOf: word(held.childOf),
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
 * Write the note of `conversation`, naming record `id`, and, when `supersedes` names one, the record it supersedes;
 * `places` says which project each is in, why the old one is superseded and which run the record is a child of, when
 * the writer knows. Answers where it is; null when the id cannot name a note.
 * @param {string} conversation
 * @param {string} id
 * @param {string} at  when, as the hook writes it: "YYYY-MM-DD HH:MM", local time
 * @param {string | null} [supersedes]
 * @param {{ workspace?: string | null, supersedesWorkspace?: string | null, supersededBecause?: 'held' | null,
 *   childOf?: string | null }} [places]
 * @returns {string | null}
 */
export function writeTheSessionNote(conversation, id, at, supersedes = null, places = {}) {
  const path = theSessionNotePath(conversation)
  if (path === null) return null
  const { workspace = null, supersedesWorkspace = null, supersededBecause = null, childOf = null } = places
  mkdirSync(THE_SESSION_NOTES_FOLDER, { recursive: true })
  writeFileSync(path, JSON.stringify({
    id,
    at,
    ...(supersedes === null ? {} : { supersedes }),
    ...(workspace === null ? {} : { workspace }),
    ...(supersedes === null || supersedesWorkspace === null ? {} : { supersedesWorkspace }),
    ...(supersedes === null || supersededBecause === null ? {} : { supersededBecause }),
    ...(childOf === null ? {} : { childOf }),
  }), 'utf8')
  return path
}
