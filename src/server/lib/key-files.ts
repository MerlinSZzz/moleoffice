// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE NAMES EVERY FILE UNDER A SANDBOX'S out/ FOLDER THAT HOLDS A KEY IT MADE, REMOVES EVERY ONE WHOSE KEY IS
 * REVOKED, AND NEVER TOUCHES ONE WHOSE KEY IS LIVE.
 *
 * Problem 296sqTPPdWsQ (29 September 2026): wave 13q handed each of its in-process subagents its run key through a file
 * named run-key in the w13m sandbox's out/ folder, and every agent in that sandbox runs as one user and could read every
 * one of them. A supervisor's run key acts for the runs it started (lib/acting-for.ts), as item 7 of a decision says,
 * so no such file is needed. Two more decisions make finding such things the office's job
 * rather than a rule in a brief. This check was asked
 * for (message pEcpMdlrsJr6): name every such file whose run still runs, and every one whose run has ended, whose key
 * is already revoked but which should not exist either; tell the supervisor and the one above it; delete nothing and
 * have nothing deleted, because removing a key file by itself is a standing deletion, which needs the person's
 * decision. That decision covers a file whose key is revoked, and only that (WHAT IS REMOVED, below).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LOOKED AT
 * ---------------------------------------------------------------------------------------
 *
 * Every instance folder under SANDBOXES_FOLDER (src/config/sandbox-folder.mjs), and in each only its out/ folder, walked
 * without following a link, no deeper than DEEPEST, and never into node_modules
 * or .git. A file counts when it is a regular file, opened once without waiting or following a link (lib/a-small-file.ts;
 * problem PrEssiyVNlf_), of at most A_KEY_FILE_IS_AT_MOST bytes, holds nothing but one key's 64 hex characters,
 * and the SHA-256 of that is a key this office made (`held_keys`, live or revoked). So a key is found by what the file
 * holds, whatever it is called. A sandbox made elsewhere with --sandboxes is not looked at.
 *
 * EVERY ENTRY IS READ, A SLICE AT A TIME. The walk used to stop after 20,000 entries of one out/ folder. A key file past
 * them was never named, and the walk still held the server's one thread for seconds. Now the reminder watcher walks in
 * slices of about A_SLICE_MS each (`nameTheKeyFilesInTheSandboxesASliceAtATime`) and gives the thread back between them.
 * A folder is listed a piece at a time and stays open from one slice to the next. So a slice goes on from the entry the
 * last one stopped at, and never starts again from the top. A listing read that way comes in the order the disk keeps.
 * So the files found are put back in the order a walk of whole listings reached them (`inTheOrderOfWholeListings`), and
 * a notice names them in the same order as before.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SAID, AND TO WHOM
 * ---------------------------------------------------------------------------------------
 *
 * The two live agents nearest above the key's holder in its starter chain (`theStartersAbove` in lib/claims.ts): for a
 * subagent's run key, its supervisor and the agent that started the supervisor. Where the chain has fewer than two, the
 * person is told as well, so somebody who can act always hears. One message each, naming each file, whose key it holds,
 * its run and whether that run still runs, and never the key. A file already told to one recipient in the same state is
 * not told again: what was told is kept on the notice itself (`extra.keyFiles`), as the reminders keep theirs, and read
 * back only off the office's own notices as the office wrote them (problem kRDCnFmhBSpc), so a restart sends nothing
 * twice, and neither another message nor a later change to a notice can stop one. A file whose run ends after it was
 * told is told again, as ended.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REMOVED, AND WHAT IS NEVER TOUCHED
 * ---------------------------------------------------------------------------------------
 *
 * A FILE WHOSE KEY IS REVOKED IS REMOVED as the walk finds it, and the notice says
 * so. That replaced "delete nothing" for revoked keys. Nothing is
 * ever renamed or moved: the one act on a file is its removal, after every check, through its folder held open from the
 * sandboxes folder down. How, and the one thing that can still happen, is on `removeARevokedKeysFile`.
 *
 * A FILE WHOSE KEY IS LIVE IS NEVER DELETED, MOVED OR CHANGED BY THE CHECK, only named, and nothing outside the
 * sandboxes folder is ever touched. The one exception is an agent's own act, said exactly on `removeARevokedKeysFile`. A
 * file's bytes are read only to hash them, and are never kept, logged or sent.
 */
import { lstatSync, opendirSync, readdirSync, unlinkSync, type Dir, type Dirent } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

import { SANDBOXES_FOLDER } from '../../config/sandbox-folder.mjs'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { isMoleOffice, moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { sqlite } from '../db/client.ts'
import { aSmallFileAndWhichItIs, theWordsOfASmallFile } from './a-small-file.ts'
import { theStartersAbove } from './claims.ts'
import { writeASystemLineToOne } from './groups.ts'
import { keyHash, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theSessionIdsAnywhereWhere } from './session-fields.ts'
import { inAFolderHeldOpen } from './resources.ts'
import type { Actor } from './records.ts'

/** The office, as the writer of its own notices. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }

/** The largest file read to see whether it holds a key. A key is 64 characters; this leaves room for a line end. */
export const A_KEY_FILE_IS_AT_MOST = 256
/** How deep under out/ the walk goes. */
export const DEEPEST = 8
/** How long one slice of the walk may hold the server's thread, in milliseconds, before it gives the thread back. */
export const A_SLICE_MS = 50
/** Folders never walked: a dependency tree or a git store holds no file an agent put a key in. */
const NOT_WALKED = new Set(['node_modules', '.git'])
/** What a key looks like: the office makes each one as 32 random bytes in hex. */
const A_KEY = /^[0-9a-f]{64}$/

/** One file that holds a key this office made. Never the key itself. */
export interface AKeyFile {
  /** The file, as the walk reached it. */
  path: string
  /** The instance folder's name. */
  sandbox: string
  /** The `held_keys` row of the key it holds. */
  keyRow: string
  /** Whose key it is: `held_keys.whose_kind` and `whose_id`. */
  holderKind: string
  holder: string
  /** The run whose own key it is, or null because it is no run's key. */
  run: { id: string; workspaceId: string; state: string } | null
  /** The key can no longer act: it is revoked, or its run has ended. */
  ended: boolean
  /** Its row in held_keys says it is revoked: the one thing that lets the check remove the file. */
  revoked: boolean
  /** The out/ folder the walk found it under, `<root>/<sandbox>/out`. */
  outFolder: string
  /** What became of the file: removed, or why it was kept; null when it was not to be removed (its key is live). */
  removal: 'removed' | string | null
}

/** What one walk found. */
export interface WhatTheWalkFound {
  files: AKeyFile[]
  /** How many instance folders had an out/ folder that was walked. */
  sandboxes: number
  /** Folders and files that could not be read: said in the log. */
  unread: number
  /** How many entries of the out/ folders were read. */
  entries: number
}

/** A walk of every sandbox's out/ folder that stops for time and goes on from where it stopped. */
export interface AWalk {
  /** What the walk found. Its files are complete, and in the order a walk of whole listings reaches them, once it is done. */
  readonly found: WhatTheWalkFound
  /**
   * Read entries until the walk is done, or until `performance.now()` reaches `until` after an entry. Answers whether
   * the walk is done.
   */
  walkOn(until: number): boolean
  /** Close the folder being listed, if one is open. For a walk that stops before it is done. */
  stop(): void
}

/**
 * The key a small file holds, or null because it holds anything else, or 'unread' because it could not be read. The file
 * is opened once and judged by what was opened (lib/a-small-file.ts; problem PrEssiyVNlf_), so a path swapped for a
 * named pipe after the walk listed it cannot hold the office on the read.
 */
function theKeyInAFile(path: string): string | null | 'unread' {
  const held = theWordsOfASmallFile(path, A_KEY_FILE_IS_AT_MOST)
  if (held === null || held === 'unread') return held
  const words = held.trim()
  return A_KEY.test(words) ? words : null
}

/**
 * The run whose own key a `held_keys` row is, or null because no run's record names it.
 *
 * ONLY THE ROWS WHOSE KEPT `runKeyId` IS THIS ONE ARE ASKED ABOUT (lib/session-fields.ts), and the whole question is still
 * asked of them, first by rowid as before. It parsed every session row for each file found, about 24 ms each on a copy
 * at the live counts (wave 13y round 17).
 */
function theRunWhoseKeyThisIs(keyRow: string): AKeyFile['run'] {
  const ids = theSessionIdsAnywhereWhere((one) => one.runKeyId === keyRow)
  if (ids.length === 0) return null
  const row = sqlite
    .prepare(
      "SELECT id, workspace_id AS workspaceId, json_extract(data, '$.state') AS state FROM records " +
        `WHERE id IN (${ids.map(() => '?').join(', ')}) AND kind = 'session' AND deleted_at IS NULL ` +
        "AND json_extract(data, '$.extra.runKeyId') = ? ORDER BY rowid LIMIT 1",
    )
    .get(...ids, keyRow) as { id: string; workspaceId: string; state: unknown } | undefined
  return row === undefined ? null : { id: row.id, workspaceId: row.workspaceId, state: String(row.state) }
}

/** A folder under one out/ folder, still to be listed, and how deep under out/ it is. */
interface AFolderToList {
  dir: string
  depth: number
}

/** One sandbox's out/ folder, as far as the walk has gone through it. */
interface AnOutFolderWalked {
  out: string
  sandbox: string
  /** The folders still to list, the last one first. */
  stack: AFolderToList[]
  /** The folder being listed now, held open from one slice to the next. */
  listing: { folder: AFolderToList; dir: Dir } | null
  /** The key files found under it so far. */
  files: AKeyFile[]
}

/** Look at one entry of a folder: a folder goes on the stack, and a file that holds a key this office made is kept. */
function lookAtOneEntry(entry: Dirent, folder: AFolderToList, walked: AnOutFolderWalked, found: WhatTheWalkFound): void {
  const path = join(folder.dir, entry.name)
  // A LINK IS NEVER FOLLOWED: it could lead anywhere on this machine, and what is looked at is the sandbox's own out/.
  if (entry.isSymbolicLink()) return
  if (entry.isDirectory()) {
    if (folder.depth < DEEPEST && !NOT_WALKED.has(entry.name)) walked.stack.push({ dir: path, depth: folder.depth + 1 })
    return
  }
  if (!entry.isFile()) return
  const key = theKeyInAFile(path)
  if (key === 'unread') {
    found.unread += 1
    return
  }
  if (key === null) return
  const row = theHeldKeyRowWhoseHashIs(keyHash(key))
  if (row === null) return
  const run = theRunWhoseKeyThisIs(row.id)
  walked.files.push({
    path,
    sandbox: walked.sandbox,
    keyRow: row.id,
    holderKind: row.whoseKind,
    holder: row.whoseId,
    run,
    ended: row.revokedAt !== null || (run !== null && theRunHasEnded(run.state)),
    revoked: row.revokedAt !== null,
    outFolder: walked.out,
    removal: null,
  })
}

/**
 * THE ORDER A WALK OF WHOLE LISTINGS REACHED THE FILES OF ONE out/ FOLDER IN. A whole listing comes sorted by the bytes
 * of each name. That walk read a folder's own files in that order, and then went into its folders, the last name first.
 */
function inTheOrderOfWholeListings(out: string): (a: AKeyFile, b: AKeyFile) => number {
  return (a, b) => {
    const pathOfA = relative(out, a.path).split(sep)
    const pathOfB = relative(out, b.path).split(sep)
    let at = 0
    while (at < pathOfA.length - 1 && at < pathOfB.length - 1 && pathOfA[at] === pathOfB[at]) at += 1
    const aIsHere = at === pathOfA.length - 1
    const bIsHere = at === pathOfB.length - 1
    // A FOLDER'S OWN FILES COME BEFORE ANYTHING IN ITS FOLDERS.
    if (aIsHere !== bIsHere) return aIsHere ? -1 : 1
    const byName = Buffer.compare(Buffer.from(pathOfA[at] ?? ''), Buffer.from(pathOfB[at] ?? ''))
    return aIsHere ? byName : -byName
  }
}

/** The out/ folder of every instance folder under `root`, in the order of their names. */
function theOutFolders(root: string, found: WhatTheWalkFound): { out: string; sandbox: string }[] {
  let instances
  try {
    instances = readdirSync(root, { withFileTypes: true })
  } catch {
    // NO SANDBOXES FOLDER is an installation that never made a sandbox: nothing to look at, and nothing wrong.
    return []
  }
  const outFolders: { out: string; sandbox: string }[] = []
  for (const instance of instances) {
    if (!instance.isDirectory() || instance.isSymbolicLink()) continue
    const out = join(root, instance.name, 'out')
    let isAFolder = false
    try {
      isAFolder = lstatSync(out).isDirectory()
    } catch {
      isAFolder = false
    }
    if (!isAFolder) continue
    found.sandboxes += 1
    outFolders.push({ out, sandbox: instance.name })
  }
  return outFolders
}

/**
 * A WALK OF EVERY SANDBOX'S out/ FOLDER under `root`, one sandbox after another in the order of their names, that can
 * stop after any entry and go on from the next. `root` is SANDBOXES_FOLDER unless a test names another.
 */
export function aWalkOfTheOutFolders(root: string = SANDBOXES_FOLDER): AWalk {
  const found: WhatTheWalkFound = { files: [], sandboxes: 0, unread: 0, entries: 0 }
  let toWalk: { out: string; sandbox: string }[] | null = null
  let walked: AnOutFolderWalked | null = null
  return {
    found,
    walkOn(until: number): boolean {
      toWalk ??= theOutFolders(root, found)
      for (;;) {
        if (walked === null) {
          const next = toWalk.shift()
          if (next === undefined) return true
          walked = { ...next, stack: [{ dir: next.out, depth: 0 }], listing: null, files: [] }
        }
        if (walked.listing === null) {
          const folder = walked.stack.pop()
          if (folder === undefined) {
            found.files.push(...walked.files.sort(inTheOrderOfWholeListings(walked.out)))
            walked = null
            continue
          }
          try {
            walked.listing = { folder, dir: opendirSync(folder.dir) }
          } catch {
            found.unread += 1
          }
          continue
        }
        let entry: Dirent | null
        try {
          entry = walked.listing.dir.readSync()
        } catch {
          found.unread += 1
          entry = null
        }
        if (entry === null) {
          walked.listing.dir.closeSync()
          walked.listing = null
          continue
        }
        found.entries += 1
        lookAtOneEntry(entry, walked.listing.folder, walked, found)
        if (performance.now() >= until) return false
      }
    },
    stop(): void {
      walked?.listing?.dir.closeSync()
      if (walked !== null) walked.listing = null
    },
  }
}

/**
 * EVERY FILE UNDER A SANDBOX'S out/ FOLDER THAT HOLDS A KEY THIS OFFICE MADE, in every instance folder under `root`, in
 * one walk that does not stop. `root` is SANDBOXES_FOLDER unless a test names another.
 */
export function theKeyFilesInTheSandboxes(root: string = SANDBOXES_FOLDER): WhatTheWalkFound {
  const walk = aWalkOfTheOutFolders(root)
  try {
    walk.walkOn(Infinity)
  } finally {
    walk.stop()
  }
  return walk.found
}

/** The name a sentence gives an agent: its handle, or the id where no row answers. */
function theHandleOf(id: string): string {
  const row = readParticipant({ kind: 'agent', id })
  return row !== null && 'startedBy' in row ? row.handle : id
}

/**
 * WHO IS TOLD OF ONE FILE: the two live agents nearest above the key's holder, and the person where the chain has fewer.
 * A key that is not an agent's is the person's to hear about.
 */
function whoIsToldOf(file: AKeyFile): ParticipantRef[] {
  const told: ParticipantRef[] = []
  if (file.holderKind === 'agent') {
    for (const above of theStartersAbove(file.holder)) {
      const row = readParticipant({ kind: 'agent', id: above })
      const agent = row !== null && 'startedBy' in row ? row : null
      if (agent === null || agent.retired === true) continue
      told.push({ kind: 'agent', id: agent.id })
      if (told.length === 2) break
    }
  }
  if (told.length < 2) told.push({ kind: 'person', id: THE_PERSON })
  return told
}

/** One file, as a sentence. Never the key. */
function oneFileInWords(file: AKeyFile): string {
  if (file.holderKind !== 'agent') {
    return `${file.path} holds a key of ${file.holder} (${file.holderKind})${file.ended ? ', which is revoked' : ''}.`
  }
  const whose = theHandleOf(file.holder)
  if (file.run === null) {
    return `${file.path} holds the key of "${whose}" itself${file.ended ? ', which is revoked' : ''}.${whatBecameOfIt(file)}`
  }
  return file.ended
    ? `${file.path} holds the run key of "${whose}" for run ${file.run.id}, which has ended (${file.run.state}).${whatBecameOfIt(file)}`
    : `${file.path} holds the run key of "${whose}" for run ${file.run.id}, which is still ${file.run.state}: anyone in that sandbox who reads the file can act as "${whose}" until the run ends.`
}

/** What became of a file whose key is revoked, in words; nothing for a file whose key is live, which is only named. */
function whatBecameOfIt(file: AKeyFile): string {
  if (file.removal === null) return ''
  return file.removal === 'removed' ? ' Its key is revoked, and the file was removed.' : ` Its key is revoked, and the file was kept: ${file.removal}.`
}

/** The whole sentence of one notice. */
function theNoticeInWords(files: readonly AKeyFile[]): string {
  return [
    `${files.length === 1 ? 'A file' : `${String(files.length)} files`} under a sandbox's out/ folder ${files.length === 1 ? 'holds a key' : 'hold keys'} this office made:`,
    ...files.map(oneFileInWords),
    'A supervisor’s run key acts for the runs of agents it registered and started, while they run, ' +
      'so a subagent needs no key file: it sends that key and names itself and its own run.',
    'A file whose key is revoked is removed as it is found; a file whose key is live is never removed, only named.',
  ].join(' ')
}

/**
 * What was already told, as "<recipient> <path> <key row> <ended>", read off the office's own notices AS THE OFFICE WROTE
 * THEM, and off nothing else (problem kRDCnFmhBSpc). A message an agent writes with the same field names no notice the
 * office sent, and must not stop one; nor may a later change to a notice. A message's recipient may change what the
 * message holds (found on 29 September 2026, fixing KBKHHtTTnaMY), so a supervisor could have added to its own notice a
 * file it had not been told of, with its superior in `to`, and kept that file from the one level above it that is told
 * precisely so that one level cannot keep it quiet. So each notice is read from its create revision, which no later write
 * changes, and counts only when the office wrote it as itself: its `sentBy` there names Mole Office, which nothing but the
 * office's own code can write (lib/records.ts refuses that sender from any request when a message is written, and every
 * later write that would change a message's sender or make a record into a message from anybody but its writer:
 * refuseASenderThisWriteWouldChange, problem KBKHHtTTnaMY). The notices are found by what they hold now, one indexed
 * read each; a notice whose field somebody took off is simply told again, which is loud rather than silent.
 */
function whatWasAlreadyTold(): Set<string> {
  const told = new Set<string>()
  const notices = sqlite
    .prepare(
      // ONLY THE OFFICE'S OWN MESSAGES, through the index of senders. A message's sender cannot change after it is written
      // (above), so a notice the office wrote still names it. Every message was parsed before (wave 13y round 17).
      "SELECT id FROM records WHERE kind = 'message' AND (CASE WHEN json_valid(data) THEN json_extract(data, '$.sentBy.id') END) = ? " +
        "AND deleted_at IS NULL AND json_extract(data, '$.extra.keyFiles') IS NOT NULL",
    )
    .all(moleOffice().id) as { id: string }[]
  const asWritten = sqlite.prepare("SELECT kind, data FROM revisions WHERE record_id = ? AND op = 'create' ORDER BY seq LIMIT 1")
  for (const { id } of notices) {
    const first = asWritten.get(id) as { kind: string; data: string | null } | undefined
    if (first === undefined || first.kind !== 'message' || first.data === null) continue
    let data: { to?: unknown; sentBy?: unknown; extra?: { keyFiles?: unknown } }
    try {
      data = JSON.parse(first.data) as typeof data
    } catch {
      continue
    }
    const sentBy = data.sentBy as ParticipantRef | undefined
    if (sentBy === undefined || sentBy === null || typeof sentBy !== 'object' || !isMoleOffice(sentBy)) continue
    const to = Array.isArray(data.to) ? (data.to[0] as ParticipantRef | undefined) : undefined
    const files = Array.isArray(data.extra?.keyFiles) ? data.extra.keyFiles : []
    if (to === undefined) continue
    for (const file of files as { path?: unknown; keyRow?: unknown; ended?: unknown }[]) {
      told.add(aToldLine(to, String(file.path), String(file.keyRow), file.ended === true))
    }
  }
  return told
}

function aToldLine(to: ParticipantRef, path: string, keyRow: string, ended: boolean): string {
  return `${to.kind}:${to.id} ${path} ${keyRow} ${ended ? 'ended' : 'live'}`
}

/**
 * TELL WHO MUST KNOW OF THE FILES FOUND, once each: one message to each recipient naming what it has not yet been told.
 * `workspaceId` is where a notice about a key that is no run's is filed; a run's key is told in its run's project.
 * Answers who was told of how many files.
 */
export function tellWhoMustKnowOfTheKeyFiles(files: readonly AKeyFile[], workspaceId: string): { to: ParticipantRef; files: number }[] {
  if (files.length === 0) return []
  const already = whatWasAlreadyTold()
  const byRecipient = new Map<string, { to: ParticipantRef; files: AKeyFile[] }>()
  for (const file of files) {
    for (const to of whoIsToldOf(file)) {
      if (already.has(aToldLine(to, file.path, file.keyRow, file.ended))) continue
      const slot = `${to.kind}:${to.id}`
      const held = byRecipient.get(slot) ?? { to, files: [] }
      held.files.push(file)
      byRecipient.set(slot, held)
    }
  }
  const told: { to: ParticipantRef; files: number }[] = []
  for (const { to, files: notYetTold } of byRecipient.values()) {
    const where = notYetTold.find((one) => one.run !== null)?.run?.workspaceId ?? workspaceId
    writeASystemLineToOne(to, where, SYSTEM_LINES.keyFilesLeftInASandbox(theNoticeInWords(notYetTold)), theOffice(), undefined, {
      keyFiles: notYetTold.map((one) => ({ path: one.path, keyRow: one.keyRow, ended: one.ended })),
    })
    told.push({ to, files: notYetTold.length })
  }
  return told
}

/** An error's code, for the reason a file was left. */
function codeOf(err: unknown): string {
  return String((err as NodeJS.ErrnoException).code ?? err)
}

/**
 * REMOVE A FILE WHOSE KEY IS REVOKED, AND NEVER ANY OTHER. See the header.
 *
 * THE FOLDER IS THE SANDBOX'S, and an agent may change it at any moment the whole walk long, since every file is read
 * before any is removed. So nothing is removed by the path the walk read, and nothing is ever renamed or moved (the
 * inspector's refusal of 29 September 2026, check gGNrx-Uqdqcc: a rename done first went through a folder swapped for a
 * link and moved a file outside the sandboxes folder):
 *   1. The file's folder is held open from the sandboxes folder down (`inAFolderHeldOpen` in lib/resources.ts, the
 *      operating-system layer), a link at any part refused. Every later step names the file inside that held folder, so
 *      nothing outside it can be reached.
 *   2. Through it, the file must be a small regular file and no link, holding the very key row the walk found, and that
 *      row must be revoked now.
 *   3. Just before the removal, the name must still lead to the file that was read: the same device and inode.
 * Anything else, and the file is left as it is and named, with the reason in the notice. So is every file on a machine
 * where a folder cannot be held open that way: that is the fallback, and it is said, never silent.
 *
 * WHAT CAN STILL HAPPEN, and only this: in the microseconds between step 3 and the removal, an agent that puts another
 * file at that name in that same folder has that file removed instead, whatever it holds, a live key included. It can
 * only be a file the agent put there itself, inside its own sandbox; nothing outside the held folder can be reached,
 * because the removal names the file inside that folder, wherever its path leads by then. POSIX has no removal of "this
 * file and no other", and this is the closest the check comes to one.
 *
 * Answers 'removed', or why the file was left. Exported for the test that changes a folder or a file between the walk and
 * the removal; the check itself calls it only for a file whose key the walk read as revoked.
 */
export function removeARevokedKeysFile(file: AKeyFile): 'removed' | string {
  const root = dirname(dirname(file.outFolder))
  const parts = relative(root, dirname(file.path)).split(sep)
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return 'its folder is not inside the sandboxes folder'
  const done = inAFolderHeldOpen(root, parts, (inside) => {
    const itself = inside(basename(file.path))
    const read = aSmallFileAndWhichItIs(itself, A_KEY_FILE_IS_AT_MOST)
    if (read === 'unread') return 'it could not be read again, or it is a link now'
    if (read === null) return 'it is no longer a small regular file'
    const words = read.words.trim()
    if (!A_KEY.test(words)) return 'it no longer holds one key'
    const row = theHeldKeyRowWhoseHashIs(keyHash(words))
    if (row === null || row.id !== file.keyRow) return 'it holds another key than the one the check found'
    if (row.revokedAt === null) return 'its key is live, and a live key’s file is never removed'
    let now
    try {
      now = lstatSync(itself)
    } catch (err) {
      return `it could not be looked at again (${codeOf(err)})`
    }
    if (now.dev !== read.dev || now.ino !== read.ino) return 'another file took its name while it was being checked'
    try {
      unlinkSync(itself)
    } catch (err) {
      return `it could not be removed (${codeOf(err)})`
    }
    return 'removed'
  })
  if (typeof done === 'string') return done
  return done.notHeld === 'a link' ? 'a link lies on its path inside the sandbox' : `its folder could not be held open (${done.notHeld})`
}

/** After one walk: the removal of every file whose key is revoked, the notices, and a line in the log for what happened. */
function actOnWhatTheWalkFound(found: WhatTheWalkFound, workspaceId: string, log: (line: string) => void): void {
  for (const file of found.files) if (file.revoked) file.removal = removeARevokedKeysFile(file)
  const removed = found.files.filter((one) => one.removal === 'removed').length
  const kept = found.files.filter((one) => one.removal !== null && one.removal !== 'removed').length
  const told = tellWhoMustKnowOfTheKeyFiles(found.files, workspaceId)
  if (told.length > 0 || removed > 0 || kept > 0) {
    log(
      `The key-file check removed ${String(removed)} file${removed === 1 ? '' : 's'} whose key is revoked` +
        (kept > 0 ? `, kept ${String(kept)} it could not remove` : '') +
        (told.length > 0 ? `, and named key files to ${told.map((one) => `${one.to.kind} ${one.to.id} (${String(one.files)})`).join(', ')}` : '') +
        '. A file whose key is live is never removed.',
    )
  }
  if (found.unread > 0) log(`The key-file check could not read ${String(found.unread)} folders or files under sandboxes' out/ folders.`)
}

/**
 * ONE WALK THAT DOES NOT STOP, THEN THE REMOVALS, THE NOTICES AND THE LINE IN THE LOG. A test runs it with a folder of its
 * own as `root`. The reminder watcher runs the same walk and the same acts a slice at a time, below.
 */
export function nameTheKeyFilesInTheSandboxes(workspaceId: string, log: (line: string) => void, root: string = SANDBOXES_FOLDER): void {
  actOnWhatTheWalkFound(theKeyFilesInTheSandboxes(root), workspaceId, log)
}

/**
 * THE KEY-FILE CHECK AS THE REMINDER WATCHER RUNS IT (lib/reminders.ts): the walk in slices of about `sliceMs` each, the
 * server's thread given back between two slices, then the removals, the notices and the line in the log, as
 * `nameTheKeyFilesInTheSandboxes` does them. `slice` runs each slice and the acts, so the watcher can time them.
 */
export async function nameTheKeyFilesInTheSandboxesASliceAtATime(
  workspaceId: string,
  log: (line: string) => void,
  slice: (work: () => boolean) => boolean = (work) => work(),
  root: string = SANDBOXES_FOLDER,
  sliceMs: number = A_SLICE_MS,
): Promise<void> {
  const walk = aWalkOfTheOutFolders(root)
  try {
    while (!slice(() => walk.walkOn(performance.now() + sliceMs))) await new Promise<void>((resolve) => setImmediate(resolve))
  } finally {
    // A SLICE THAT THREW LEAVES THE WALK STOPPED with a folder open, so it is closed here.
    walk.stop()
  }
  slice(() => {
    actOnWhatTheWalkFound(walk.found, workspaceId, log)
    return true
  })
}
