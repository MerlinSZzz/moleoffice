// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { declaredStorageOmission } from '../lib/storage/omissions.ts'
/**
 * Inline preview: the bytes of one file that a record already points at.
 *
 *   GET /api/file?path=<absolute path>   the file's own bytes, or a refusal saying why not
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR, AND WHAT IT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * A module's curated summary may hold an image block, and until now the page drew a grey box and
 * a path where the picture goes: a browser cannot open a `file:///...` address from a page it
 * fetched over http, so there was no `<img>` element on the page at all. Refusing to fake that
 * with a `file://` src was right and is documented three times in src/web. It argued against
 * FAKING the picture. It never argued against serving the bytes.
 *
 * So this serves the bytes. It is NOT a file server, and the difference is the whole design:
 *
 *   A FILE SERVER answers "give me /etc/shadow" by deciding whether the CALLER may have it.
 *   THIS answers "show me the picture that module points at" by deciding whether MOLE OFFICE ALREADY
 *   POINTS AT IT. There is no authentication here to lean on — Mole Office binds to loopback with no
 *   login, so anything on this machine, including another agent, can reach this port. The
 *   confinement therefore cannot be about who is asking. It is about what is already recorded.
 *
 * Mole Office stays a curated read surface. It serves what a record points at, and nothing else: not
 * the directory that file sits in, not the files beside it, not the files under a directory a
 * record points at, and nothing that only a deleted record ever mentioned.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONFINEMENT CONTRACT. EVERY CLAUSE IS CHECKED ON EVERY REQUEST, AND EVERY ONE IS A TEST
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE REQUEST MUST BE A PLAIN ABSOLUTE PATH. No `..` segment in any position, no NUL, no
 *      relative path. `..` is REFUSED rather than normalised away: normalising it would mean a
 *      caller could spell a referenced path in a way that walks through somewhere else on the way,
 *      and the guard would have laundered it instead of catching it.
 *
 *   2. A LIVE RECORD MUST ALREADY STORE THAT EXACT PATH. The reference set is every string stored
 *      under a `path` key anywhere in a live record's `data` — which is what `data.paths[]`
 *      (PathRef) and an image block in `data.summaryBlocks[]` (ImageBlock) are, and what any later
 *      shape that declares a path will be, without this file being edited. A path referenced only
 *      by a DELETED record is refused, and the refusal names the record and how to restore it: a
 *      soft delete withdraws the record's pointers, or deleting a record would leave its files
 *      quietly readable forever.
 *
 *   3. IT MUST BE ON THIS MACHINE. A PathRef and an ImageBlock both carry `machine`, and "empty
 *      means this one" is their declared meaning. A reference that names another machine is
 *      refused, and THIS MACHINE'S FILE OF THE SAME NAME IS NOT SERVED IN ITS PLACE. That breaks
 *      the principle at the top of USER.md, "Never silently substitute semantics":
 *      /data/runs/bench_loop_0726 on birch and /data/runs/bench_loop_0726 here are two different
 *      files, and answering with the second under the first's name would be evidence about
 *      something nobody asked for.
 *
 *   4. IT MUST SIT INSIDE A PREVIEW ROOT, both as written and after every symlink on the way has
 *      been resolved. Roots come from MOLE_OFFICE_PREVIEW_ROOTS, and when nobody has set it they
 *      are this checkout and ~/.cache/mole-office — the two directories this product itself writes
 *      into. This is the clause that does not depend on the record being honest: an agent may write
 *      records, so an agent could file a module pointing at ~/.ssh/id_rsa and satisfy clause 2 by
 *      itself. It cannot satisfy this one, because the roots are configuration and not content.
 *
 *   5. WHAT COMES BACK IS THE FILE, OR THE REASON IT IS NOT. A missing file is reported as
 *      missing, an unreadable one as unreadable, a directory as a directory, a device as a device,
 *      one too large to show in the page with its size and the cap. NOTHING STANDS IN FOR THE
 *      CONTENT — no placeholder image, no empty 200, no "not found" picture. A stand-in served
 *      under the file's own URL is a fabricated observation, and it is the one failure this whole
 *      product is built to refuse.
 *
 * ---------------------------------------------------------------------------------------
 * A VIDEO IS STREAMED, ANY FILE CAN BE SAVED WHOLE, AND A STRETCH IS ASKED FOR BY NAME
 * ---------------------------------------------------------------------------------------
 *
 * A report's video could not be watched in the page above the cap, and had to be opened on the host
 * instead. The shape was set out in message 7fFI7J3l5Gih, and two messages in panelx agreed
 * it. So:
 *
 *   - A VIDEO IS STREAMED FROM THE DESCRIPTOR THAT WAS CHECKED, and has no cap. The page hands this
 *     address to its player, which asks for one stretch at a time with `Range`, and each stretch
 *     is answered 206 with `content-range` saying where in the whole file it sits. That is not the
 *     truncation clause 5 forbids: the first 25 MB served AS the file is a lie, and a stretch the
 *     browser asked for by its offsets, labelled with them, is exactly what was asked.
 *   - `download=1` SAVES THE FILE, of any type and any size, as an attachment.
 *   - `open=1` OPENS THE FILE IN THE BROWSER, of any type and any size, streamed and inline. The chat's Open press asks
 *     for it, so a file of any size sent in the chat can be opened, and the page's own fetch never does.
 *   - `workspace=` IN THE ADDRESS NAMES THE PROJECT, because a player and a download link fetch the
 *     file themselves and cannot send x-mole-office-workspace. It means what the header means, and
 *     the two disagreeing is refused rather than one of them chosen.
 *   - Every other file shown in the page keeps the 25 MB cap, because the page reads it whole.
 *
 * Every request, every stretch and every HEAD passes the same five clauses first. A HEAD is
 * answered with the headers the GET would carry and no bytes, and a refused HEAD is refused as the
 * GET is, so it tells a caller nothing about a file the clauses keep from it.
 *
 * AN MP4 PLAYS AS IT ARRIVES ONLY WHEN ITS INDEX COMES FIRST. ffmpeg writes the index (the `moov`
 * box) at the end unless it is given `-movflags +faststart`, and a player given such a file has to
 * fetch the end of it before it can show the first frame. Streaming cannot mend that; the file
 * has to be written that way.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER CACHES NOTHING, AND THE BROWSER KEEPS ONLY WHAT IT IS TOLD IT MAY
 * ---------------------------------------------------------------------------------------
 *
 * The reference set is read from the records table on every request, the roots are read from the
 * environment on every request, and the path is resolved against the filesystem on every request.
 * A cached "yes" would keep serving a file after the record that authorised it was deleted or
 * after a symlink under it was repointed, which is exactly the window an attacker wants and
 * exactly the staleness a reader must not be given.
 *
 * The browser may keep a file a page shows, for the reader who asked and nobody else.
 * `whatABrowserMayKeep` below says for how long, and why. Deleting the record that points at a file
 * still refuses every request for it from then on. A browser that kept the file before then can
 * still draw its own copy: for at most ten seconds when the file is at a path, and until the copy
 * is gone when one of the office's stores named it. It was accepted that a device which has
 * already seen a file keeps it. A saved file and a file of a type no page shows are kept by nobody.
 */

import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, resolve as resolvePath } from 'node:path'
import { Readable } from 'node:stream'
import { sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { MEDIA_FORMATS } from '@shared/reportmedia.ts'
import { MAX_PREVIEW_BYTES } from '@shared/preview-limit.ts'
import { ACTOR_HEADERS, WORKSPACE_HEADER } from '@shared/request-headers.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { theShownFileKind, WORD_CONTENT_TYPE, type ShownFile } from '@shared/shown-file.ts'
import { records } from '../db/schema.ts'
import { ACROSS_WORKSPACES, getRecord, listRecords } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { actorFrom, stampWorkspace, workspaceFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { onlyTheMessagesThisReaderMayRead, theMessageReader, theMessagesHiddenFrom, type AMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { requireWorkspace } from '../lib/require-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { theCallerHoldsIt } from '../lib/version-tags.ts'
import { DEVICE_HALF_HEADER, KEY_HEADER } from '../../config/key-header.mjs'
import { settings } from '../../config/settings.mjs'
import { theNamesInAPath } from '../../config/the-paths-of-a-system.mjs'
import { route } from '../lib/route.ts'
import { textFileText, wordDocumentBlocks } from '../lib/word-document.ts'
import {
  PREVIEW_ROOTS_VAR,
  STORES_BESIDE_THE_DATABASE,
  configuredPreviewRoots,
  openConfined,
  previewRoots,
  rootsSentence,
  storedPathsIn,
  theDataFolderHasMoved,
  usableStoredPath,
  whereAFileIs,
  whereAStoreIs,
  whereStoredFilesAreNow,
  type OpenFile,
  type PreviewRoot,
  type StoreBesideTheDatabase,
  type StoredPath,
  type WhereAFileIs,
} from '../lib/where-a-file-may-be-read.ts'
import { inside } from '@shared/path-inside.ts'

// ============================================================================ configuration

// THE PREVIEW ROOTS, THE STORES BESIDE THE DATABASE, THE PATHS A RECORD STORES AND THE CONFINED OPEN are in
// src/server/lib/where-a-file-may-be-read.ts, so the stores in src/server/lib/ ask the same rules without importing
// this door. Each name this file exported before is exported from here still.
export {
  PREVIEW_ROOTS_VAR,
  STORES_BESIDE_THE_DATABASE,
  configuredPreviewRoots,
  inside,
  openConfined,
  previewRoots,
  rootsSentence,
  storedPathsIn,
  theDataFolderHasMoved,
  usableStoredPath,
  whereAFileIs,
  whereAStoreIs,
  whereStoredFilesAreNow,
}
export type { OpenFile, PreviewRoot, StoreBesideTheDatabase, StoredPath, WhereAFileIs }

// THE LARGEST FILE SHOWN IN THE PAGE WHEN IT IS NOT A VIDEO, 25 MB. It is in src/shared/preview-limit.ts with the reasons,
// because the chat reads it too.
export { MAX_PREVIEW_BYTES }

/** One registered repository, in another project, whose root would have allowed a refused file. */
interface RepositoryElsewhere {
  repositoryName: string
  workspaceId: string
}

/**
 * THE REPOSITORY THAT WOULD HAVE ALLOWED THIS FILE, OR NULL.
 *
 * The fence is now derived, so a refused file is outside every directory this project derives. The
 * reachable thing that would have allowed it is a repository registered in ANOTHER project whose
 * root sits above the file: register that repository here and the file becomes previewable. A work
 * area of this project cannot reach it either — a work area is repository-relative, so it resolves
 * inside a repository root this project already has, and a file outside all of them is outside every
 * work area too.
 *
 * IT NAMES A REPOSITORY AND A PROJECT AND NOT A RECORD, for the reason `referencedElsewhere` gives:
 * a project may say where something is and may not read into it.
 */
function repositoryThatWouldAllow(path: string, workspaceId: string): RepositoryElsewhere | null {
  let found: RepositoryElsewhere | null = null
  let longest = -1
  for (const workspace of listWorkspaces()) {
    if (workspace.id === workspaceId) continue
    for (const repository of listRepositories(workspace.id)) {
      if (repository.root === null) continue
      if (!inside(path, repository.root)) continue
      if (repository.root.length <= longest) continue
      found = { repositoryName: repository.name, workspaceId: workspace.id }
      longest = repository.root.length
    }
  }
  return found
}

/**
 * WHAT WOULD HAVE ALLOWED THIS FILE, AND THE PRESS THAT REGISTERS IT.
 *
 * Criterion U4 asks the refusal to name the repository or the work area that would have allowed the
 * file, and the press that registers one. The press exists: Settings, then the Repositories panel.
 * When a repository in another project is rooted above the file it is named; when nothing is, the
 * clause says no repository reaches it and names the same press. This REPLACES the old last clause
 * that told the reader to edit MOLE_OFFICE_PREVIEW_ROOTS.
 */
function whatWouldHaveAllowed(path: string, workspaceId: string): string {
  const press = 'Register one on the Settings page, in the Repositories panel.'
  const elsewhere = repositoryThatWouldAllow(path, workspaceId)
  if (elsewhere !== null) {
    return (
      `Repository "${elsewhere.repositoryName}" in project "${elsewhere.workspaceId}" is rooted above this file. ` +
      press
    )
  }
  return `No repository registered anywhere on this machine is rooted above this file, and a work area can only name a directory inside one. ${press}`
}

// ============================================================================ the request

const fileQuery = z.strictObject(
  {
    path: z
      .string({ error: 'path must be text: the absolute path of a file some record already points at' })
      .min(1, {
        error:
          'path must not be empty. It is the absolute path of a file a record already points at — the same string ' +
          'the record stores, copied exactly.',
      }),
    // SAVE IT RATHER THAN SHOW IT, whole and of any size, as the person asked.
    download: z
      .literal('1', { error: 'download takes one value, 1: download=1 asks for the file to be saved, whole' })
      .optional(),
    // OPEN IT IN THE BROWSER, streamed and of any size. The page's own fetch never asks for it.
    open: z
      .literal('1', { error: 'open takes one value, 1: open=1 asks for the file to be opened in the browser, streamed' })
      .optional(),
    // THE REPORT'S OWN WORD, for the frame its press creates. It is not the chat's Open: no other
    // caller sends it, and without it even open=1 keeps the answer it had before the report learned
    // to draw HTML and PDF files in a frame. It only means something beside open=1.
    shown: z
      .literal('1', { error: 'shown takes one value, 1: shown=1 asks for the report\'s showing of the file' })
      .optional(),
    // THE PAGE'S OWN READ OF A FILE IT DRAWS AS WORDS: a Word document's blocks, or a text or
    // Markdown file's text, as data. Asked alone, never beside a save, an open or a metadata read.
    words: z
      .literal('1', { error: 'words takes one value, 1: words=1 asks for the file\'s words as data, for the page to draw' })
      .optional(),
    // A RECORD THE PAGE IS DRAWING, used only after its reference and reader are checked.
    record: z.string().optional(),
    // The file's type and length without its bytes.
    metadata: z
      .literal('1', { error: 'metadata takes one value, 1: metadata=1 asks for the file type and length' })
      .optional(),
    // THE PROJECT, FOR A CALLER THAT CANNOT SEND A HEADER: a video's player and a download link.
    workspace: z
      .string({ error: 'workspace must be text: the id of the project the record pointing at this file is in' })
      .min(1, { error: 'workspace must not be empty. Leave it out, or name the project the record is in.' })
      .optional(),
    // A FILE TICKET, which lib/file-tickets.ts honoured before this route ran, for this path and this browser. A
    // ticket it did not honour never reaches here. The route reads nothing from it.
    ticket: z.string().optional(),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `GET /api/file takes "path", and may take "download=1" or "open=1", "metadata=1", "shown=1", "words=1", "workspace", "record", and "ticket", and this request sent ` +
          `${issue.keys.map((k) => `"${k}"`).join(', ')}. There is nothing else to ask for: this endpoint serves ` +
          'one file, named in full, and it has no listing, no directory and no search.'
        : undefined,
  },
)

/**
 * WHICH PROJECT A PREVIEW IS ASKED IN: the header every request of the page carries, or `workspace`
 * in the address. A video's player and a download link fetch the file themselves and cannot send a
 * header, so the page writes the project into their address instead, as the person
 * asked. It means exactly what the header means. A request that names two different
 * projects is refused, because choosing one would answer a question somebody did not ask.
 */
function theProjectAskedIn(req: FastifyRequest, inTheAddress: string | undefined): string {
  if (inTheAddress === undefined) return workspaceOf(req)
  const claim = workspaceFrom(req)
  if (claim.stated && claim.id !== inTheAddress) {
    throw new PanelError(
      `This request names two projects: "${claim.id}" in x-mole-office-workspace and "${inTheAddress}" in the ` +
        'address. A preview is served on the authority of a record in one project, so the request is refused ' +
        'rather than answered from either. Name one of them. Nothing was read.',
    )
  }
  const id = requireWorkspace(inTheAddress, true).id
  stampWorkspace(req, { id, stated: true })
  return id
}

/**
 * The path as a request may spell it, or a 400 saying which rule it broke.
 *
 * ---------------------------------------------------------------------------------------
 * `..` IS REFUSED, NOT RESOLVED, AND THE ORDER MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * `/tmp/root/sub/../picture.png` and `/tmp/root/picture.png` name the same file, and a normaliser
 * would happily turn the first into the second — at which point the reference check would pass and
 * this endpoint would have followed a path that climbed out of a directory and back in. Refusing
 * the spelling outright keeps one property that is worth more than the convenience: every path
 * this endpoint acts on is the path it was given, segment for segment.
 *
 * PERCENT-ENCODING IS NOT DECODED HERE, and must not be. Fastify has already decoded the query
 * string once, so `%2e%2e%2f` arrives as `../` and is caught above. Decoding a SECOND time would
 * turn `%252e%252e` — a strange but legal filename — into a traversal that was never written, so
 * the encoded-twice case falls through to the reference check and is refused for the honest reason
 * that nothing points at a file with that name.
 */
function requestedPath(raw: string): string {
  if (raw.includes('\0')) {
    throw new PanelError(
      'path contains a NUL byte, which no filename on this machine can hold. It is refused before anything ' +
        'touches the filesystem, because a NUL is how a path is cut short into a different path.',
    )
  }
  if (!isAbsolute(raw)) {
    throw new PanelError(
      `path must be absolute, and this one is ${JSON.stringify(raw)}. A relative path would mean a different file ` +
        'depending on where this server happened to be started, so it is refused rather than resolved. Records ' +
        'store absolute paths — copy the one the record holds.',
    )
  }
  const climbing = theNamesInAPath(raw).some((name) => name === '..')
  if (climbing) {
    throw new PanelError(
      `path contains a ".." segment (${JSON.stringify(raw)}). It is refused rather than normalised away: a path ` +
        'that climbs out of a directory and back in names the same file by a route through somewhere else, and ' +
        'this endpoint acts only on paths spelled as they are. Send the path the record stores.',
    )
  }
  // Safe now: with no `..` in it, resolvePath only collapses "//", "/./" and a trailing slash —
  // three spellings of one path, and it is applied to the stored side identically so the two are
  // compared on equal terms.
  return resolvePath(raw)
}

// ============================================================================ the reference set

/** The longest run of letters, digits, ".", "_" and "-" in a name, or undefined when it has none. */
export function theLongestRunIn(name: string): string | undefined {
  return name.match(/[A-Za-z0-9._-]+/g)?.reduce((longest, one) => (one.length > longest.length ? one : longest))
}

/**
 * THE RECORDS THAT COULD STORE THIS PATH, as a condition on their stored text, or undefined to read every record.
 *
 * A stored path names the one asked for when `usableStoredPath` makes it the same, and that takes out "//", "/./" and a
 * trailing "/" and nothing else. So the asked path's last segment is in the stored path as written, and so is every run
 * of letters, digits, ".", "_" and "-" in it. JSON writes none of those characters escaped except as "\u", so a record
 * whose text holds neither the longest such run nor "\u" stores no path naming this file. A last segment with no such
 * run gives no condition, and every record is walked.
 *
 * THE LAST SEGMENT AND NOT THE WHOLE PATH, because a folder every stored path shares, such as the project's own, would
 * keep every record. Measured on a copy of an office with 43,987 records, before this: a search for a picture a record
 * names read 338 MB and took 0.65 to 0.78 s, and one for a path nothing names 493 MB and 1.15 to 1.23 s (wave 13y round
 * 34). tests/the-file-search-reads-only-the-records-that-hold-the-files-name.test.ts holds each spelling.
 */
function recordsThatCouldStore(path: string): SQL | undefined {
  const run = theLongestRunIn(basename(path))
  if (run === undefined) return undefined
  return sql`(instr(${records.data}, ${run}) > 0 OR instr(${records.data}, ${'\\u'}) > 0)`
}

/**
 * Every reference to this exact path, live records and deleted ones alike, IN ONE PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORKSPACE COMES FROM THE REQUEST, AND IT CANNOT COME FROM THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * This read used to be `listRecords({ workspaceId: 'default' })`, hard-coded, which was harmless
 * for exactly as long as there was one project. After the corpus migration the `default` workspace
 * holds ZERO records, so no preview of any real record could succeed — and it failed with the wrong
 * sentence, "No live record points at …", which is untrue and sends the caller to fix a record that
 * is already right. Measured 2026-08-12 in both directions: a file only a `panelx` record points at
 * was refused whatever header was sent, and a file a `default` record pointed at was SERVED to a
 * request working in `panelx`, with `x-mole-office-record` naming a record from another project.
 *
 * It is the request's workspace and not the record's, because finding the record is the thing being
 * scoped: reading the project off the record it just found would make the query answer its own
 * precondition, and the endpoint would be cross-project by construction. It is not
 * `ACROSS_WORKSPACES` for the same reason — that is today's leak, written down.
 */
function referencesTo(path: string, workspaceId: string): StoredPath[] {
  return listRecords({ workspaceId, includeDeleted: true, alsoWhere: recordsThatCouldStore(path) })
    .flatMap(storedPathsIn)
    .filter((ref) => ref.normalised === path)
}

/**
 * Records in OTHER projects that point at this path — read only to say so, never to serve from.
 *
 * A path referenced from another project is not "nothing points at it", and answering with that
 * sentence is the same substitution this file refuses everywhere else: it tells the caller to file
 * a reference that already exists. So the fourth refusal names the project and the header that
 * would work, and nothing about the file is read.
 *
 * IT NAMES THE PROJECT AND NOT THE RECORD. `moveRecordToWorkspace` and `resolveSessionRef` both
 * settled this shape already — a project may say WHERE something is and may not read into it — and
 * the record's title would be a fact from another project served to a request that is not in it.
 */
function referencedElsewhere(path: string, workspaceId: string, reader: AMessageReader): string[] {
  const seen = new Set<string>()
  // A MESSAGE THE READER MAY NOT READ IS NOT COUNTED as a record pointing here.
  for (const record of onlyTheMessagesThisReaderMayRead(reader, listRecords({ workspaceId: ACROSS_WORKSPACES, includeDeleted: false, alsoWhere: recordsThatCouldStore(path) }))) {
    if (record.workspaceId === workspaceId) continue
    if (storedPathsIn(record).some((ref) => ref.normalised === path && ref.machine === null)) {
      seen.add(record.workspaceId)
    }
  }
  return [...seen].sort()
}

/** Live references whose record says the file is on a directory Mole Office can see: this machine. */
function localLiveReferences(refs: readonly StoredPath[]): StoredPath[] {
  return refs.filter((ref) => !ref.deleted && ref.machine === null)
}

/**
 * The live local reference that authorises this preview, or the refusal that fits what is there.
 *
 * The three refusals are deliberately different sentences, because they are three different facts
 * about the record and only one of them is fixed by editing a file:
 *
 *   nothing points at it            — file it on the record it belongs to
 *   only a deleted record points    — restore that record, and it says which
 *   only another machine points     — this machine's file of that name is NOT the one asked for
 */
function authorisingReference(
  path: string,
  refs: readonly StoredPath[],
  workspaceId: string,
  reader: AMessageReader,
): StoredPath {
  const local = localLiveReferences(refs)
  const first = local[0]
  if (first !== undefined) return first

  const live = refs.filter((ref) => !ref.deleted)
  const elsewhere = live.filter((ref) => ref.machine !== null)
  if (elsewhere.length > 0) {
    const named = [...new Set(elsewhere.map((ref) => ref.machine))].join(', ')
    const one = elsewhere[0] as StoredPath
    throw new PanelError(
      `${path} is pointed at by "${one.recordTitle}" (${one.recordId}, ${one.where}), and that reference says the ` +
        `file is on ${named} — not on this machine. Mole Office cannot read another machine's disk, and it will NOT ` +
        `serve this machine's file of the same name in its place: two machines with the same path hold two ` +
        `different files, and answering with the wrong one under the right name is exactly the substitution this ` +
        `product refuses. Copy the file here and point a record at it, or read it where it is.`,
      409,
      undefined,
      undefined,
      `The record says this file is on ${named}, not here.`,
    )
  }

  const deleted = refs.filter((ref) => ref.deleted)
  if (deleted.length > 0) {
    const one = deleted[0] as StoredPath
    throw new PanelError(
      `The only record${deleted.length === 1 ? '' : 's'} pointing at ${path} ${deleted.length === 1 ? 'has' : 'have'} ` +
        `been deleted: ${deleted.map((ref) => `"${ref.recordTitle}" (${ref.recordId})`).join(', ')}. A soft delete ` +
        `withdraws what the record pointed at, so the file is no longer previewable — otherwise deleting a record ` +
        `would leave everything it named readable for good. Restore it with ` +
        `POST /api/records/${one.recordId}/restore if this preview should exist.`,
      403,
      undefined,
      undefined,
      'The only record pointing at this file has been deleted.',
    )
  }

  // THE FOURTH REFUSAL, and it has to come before the one below. "Nothing points at it" is untrue
  // when something does, one project over, and it sends the caller to file a reference that already
  // exists. Which project, and the header that reaches it — not which record, because a record's
  // title is a fact belonging to a project this request is not working in.
  const elsewhereProjects = referencedElsewhere(path, workspaceId, reader)
  if (elsewhereProjects.length > 0) {
    const named = elsewhereProjects.map((id) => `"${id}"`).join(', ')
    throw new PanelError(
      `No record in this project points at ${path}, and ${elsewhereProjects.length === 1 ? 'one does' : 'records do'} ` +
        `in ${named}. This request is working in "${workspaceId}", and a preview is served on the authority of a ` +
        `record in the project being asked about — otherwise one project's file list would be readable from every ` +
        `other. Send \`x-mole-office-workspace: ${elsewhereProjects[0]}\` to ask there. Which record it is, and what it ` +
        `is called, belong to that project and are not reported here.`,
      403,
      undefined,
      undefined,
      `Nothing in this project points at this file; something in "${String(elsewhereProjects[0])}" does.`,
    )
  }

  throw new PanelError(
    `No live record in this project points at ${path}, so Mole Office will not read it. This endpoint serves a file only when a record ` +
      `already stores that exact path — a module's data.paths[] entry, or an image block in data.summaryBlocks[] — ` +
      `which is what makes it a preview of the record rather than a way to read this machine. A path that merely ` +
      `sits inside a directory some record points at is NOT covered: a directory reference does not carry the files ` +
      `under it, or pointing at a project folder would hand over everything in it. File the path on the record it ` +
      `belongs to, then ask again.`,
    403,
    undefined,
    undefined,
    'No live record points at this file, so Mole Office will not read it.',
  )
}

// ============================================================================ reading the file

/** A file that was read, with the facts the response is built from. */
export interface ReadFile {
  bytes: Buffer
  size: number
}

/** The refusal of a file too large to show in the page, which is not a video. */
function tooLargeToShow(path: string, size: number): PanelError {
  return new PanelError(
    `${path} is ${size.toLocaleString('en-GB')} bytes, and the preview limit is ` +
      `${MAX_PREVIEW_BYTES.toLocaleString('en-GB')} for a file the page shows whole. It is refused whole rather ` +
      `than served short: the first ${MAX_PREVIEW_BYTES.toLocaleString('en-GB')} bytes of a file are not the file, ` +
      'and a truncated one looks corrupt at best and complete at worst. Save it whole by adding download=1 to ' +
      'the same address, or open it in the browser, streamed, by adding open=1.',
    413,
  )
}

/** Open an approved path and read it whole, up to the limit for a file the page shows whole. */
export function readConfined(path: string): ReadFile {
  const { fd, size } = openConfined(path)
  try {
    if (size > MAX_PREVIEW_BYTES) throw tooLargeToShow(path, size)
    return { bytes: readFileSync(fd), size }
  } finally {
    closeSync(fd)
  }
}

/**
 * THE ONE STRETCH OF BYTES A `Range` HEADER ASKS FOR (RFC 9110, section 14), THE WHOLE FILE, OR
 * NONE OF IT.
 *
 * ONE STRETCH, IN BYTES. A player asks for one at a time. A header this does not read, whether
 * another unit, several stretches or a malformed one, is answered with the whole file, which RFC
 * 9110 lets a server do with any Range it does not take, rather than guessing which part was meant.
 * A stretch that starts past the end, or a last-n of nothing, is `none of it`, and is answered 416.
 * A stretch running past the end is cut at the end, as the RFC says, and `content-range` says so.
 */
export function theStretchAskedFor(header: string | undefined, size: number): { start: number; end: number } | 'whole' | 'none of it' {
  if (header === undefined) return 'whole'
  const asked = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/iu.exec(header)
  if (asked === null) return 'whole'
  const first = asked[1] ?? ''
  const last = asked[2] ?? ''
  if (first === '' && last === '') return 'whole'
  if (first === '') {
    const count = Number(last)
    if (!Number.isSafeInteger(count)) return 'whole'
    if (count === 0 || size === 0) return 'none of it'
    return { start: Math.max(0, size - count), end: size - 1 }
  }
  // A stretch whose last byte comes before its first is not one this reads; one that starts at or
  // past the end is one the file has none of. The order matters: `bytes=<size>-` is the second.
  const start = Number(first)
  const said = last === '' ? null : Number(last)
  if (!Number.isSafeInteger(start) || (said !== null && (!Number.isSafeInteger(said) || said < start))) return 'whole'
  if (start >= size) return 'none of it'
  return { start, end: said === null ? size - 1 : Math.min(said, size - 1) }
}

/**
 * OPEN A FILE TO SEND, WHOSE ROUTE HAS ALREADY FOUND IT AND CHECKED IT, and say how long it is.
 *
 * For a route that names its file itself: a portrait, an uploaded picture, a file in a resident's space (wave 13y
 * round 34). Not `openConfined`, whose checks and sentences are the preview's; a link the route's own folder holds is
 * followed as it was when these files were read whole. The size is the open descriptor's, so the length a reply
 * promises is the length of the file it sends. A file that became something else between the route's check and this
 * open is a broken assumption and fails loudly, rather than going out as a reply that stops halfway.
 */
export function openToSend(path: string): OpenFile {
  const fd = openSync(path, 'r')
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error(`${path} was a file when its route looked and is not one now. Nothing was sent.`)
    return { fd, size: stat.size }
  } catch (err) {
    closeSync(fd)
    throw err
  }
}

/** The answer to a stretch the file has none of: 416, and the sentence saying so, with the descriptor closed. */
export function refuseAStretchItHasNoneOf(req: FastifyRequest, reply: FastifyReply, asked: string, file: OpenFile): FastifyReply {
  closeSync(file.fd)
  return reply
    .code(416)
    .type('application/json; charset=utf-8')
    .header('content-range', `bytes */${String(file.size)}`)
    .send({
      error:
        `${asked} is ${file.size.toLocaleString('en-GB')} bytes, and the stretch asked for ` +
        `(${String(req.headers.range)}) has none of them. Nothing was sent.`,
    })
}

/**
 * SEND AN OPEN FILE, OR THE ONE STRETCH OF IT ASKED FOR, FROM ITS DESCRIPTOR. The route has set its own headers; this
 * sets the status, `content-range` and `content-length`, and the descriptor is closed whatever happens.
 */
export function sendTheOpenFile(
  req: FastifyRequest,
  reply: FastifyReply,
  path: string,
  file: OpenFile,
  stretch: { start: number; end: number } | 'whole',
): FastifyReply {
  const start = stretch === 'whole' ? 0 : stretch.start
  const end = stretch === 'whole' ? file.size - 1 : stretch.end
  if (stretch !== 'whole') {
    reply.code(206).header('content-range', `bytes ${String(start)}-${String(end)}/${String(file.size)}`)
  }
  const length = end - start + 1
  reply.header('content-length', String(length))

  // A HEAD IS ANSWERED WITH WHAT THE GET WOULD CARRY, and no bytes are read for it. Fastify's own
  // HEAD handling sets the length to 0 for an empty answer and keeps the one set here only for a
  // stream, which it drains, so a HEAD is handed a stream with nothing in it.
  if (req.method === 'HEAD') {
    closeSync(file.fd)
    return reply.send(Readable.from([]))
  }
  if (length === 0) {
    closeSync(file.fd)
    return reply.send(Buffer.alloc(0))
  }
  // FROM THE DESCRIPTOR THAT WAS CHECKED, never the path again, and only the bytes promised: the
  // stream ends at `end` even if the file grows while it is sent. It closes the descriptor when it
  // ends, fails, or the caller goes away.
  return reply.send(createReadStream(path, { fd: file.fd, start, end, autoClose: true }))
}

// ============================================================================ what it is served as

/**
 * Extension to content type. This list IS the definition of what Mole Office claims to recognise.
 *
 * Anything not on it is served as `application/octet-stream`, which is the honest "I do not know
 * what this is". Guessing `text/plain` for an unknown extension would be a claim about the bytes
 * that nobody checked, and a browser told something is text will render it as text.
 */
export const PREVIEW_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  // A WORD DOCUMENT IS SHOWN AS ITS OWN WORDS. The type is the one Word gives it, so a plain read
  // is the file's own bytes, and only the page's read, words=1, asks the door for its blocks.
  '.docx': WORD_CONTENT_TYPE,
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  // THE SOUND AND FILM FORMATS A REPORT PLAYS, from their one list, so the
  // type served here is the type the record door and the page expect for the same extension.
  ...Object.fromEntries(MEDIA_FORMATS.map((format) => [format.extension, format.contentType])),
}

/** What an unrecognised extension is served as: bytes, described as bytes. */
export const UNKNOWN_CONTENT_TYPE = 'application/octet-stream'

/** What an HTML file is served as, by either extension that names one. */
const HTML_TYPE = 'text/html; charset=utf-8'

/**
 * The two types a browser will execute as a document if it is allowed to.
 *
 * Mole Office serves its own app from this origin in production, so an HTML report or an SVG with a
 * script in it, opened from here, would run as Mole Office — able to call this API as the person, who
 * is the one identity allowed to write a `decision`. Both are still served, but never as this origin:
 * each answer carries a Content-Security-Policy whose `sandbox` puts the document in an origin of its
 * own. An SVG runs no script at all. An HTML file runs the scripts and styles written inside it, by
 * a recorded engineering decision that a stricter header can undo, and its policy names only inline
 * script and style, data images, and data
 * fonts: no connection, no form, no base address and no top-level navigation, so the file's own
 * drawing works and nothing it does can reach Mole Office.
 */
const EXECUTABLE_TYPES = new Set([HTML_TYPE, 'image/svg+xml'])

/**
 * What lets an attached HTML file draw itself and cannot reach the office.
 *
 * The file's own inline scripts and styles run, as does an image or font written into the file as
 * data. Everything else is shut: no network connection, no form submission, no `<base>` to change
 * what a relative address means. `sandbox` already stops forms, pop-ups and top-level navigation,
 * and they are stated here as well because this header is the whole promise: a browser that reads
 * one of the two must not be more permissive than the other.
 */
const THE_PAGE_POLICY =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"

/** What a PDF is served as, from its own extension. */
const PDF_TYPE = 'application/pdf'

/**
 * WHAT HOLDS A PDF THE REPORT SHOWS IN A FRAME.
 *
 * Chromium's PDF reader will not draw inside a frame that carries a `sandbox` attribute at all: the
 * frame lands on a browser error page. So the frame has none, and this answer carries the sandbox
 * instead: the document is in an origin of its own, with no script, no connection, no form and no
 * way back to Mole Office. It is added only to the answer that asks to show the PDF, open=1
 * together with shown=1, not to a plain read, a save or a metadata read, and it is not the HTML
 * page policy: nothing of the PDF's own is allowed to run.
 */
const THE_PDF_POLICY = "default-src 'none'; sandbox"

function contentTypeFor(path: string): string {
  return PREVIEW_CONTENT_TYPES[extname(path).toLowerCase()] ?? UNKNOWN_CONTENT_TYPE
}

/**
 * `inline; filename="overlay_05.png"`, or `attachment; …` for a file being saved, with the real
 * name beside it for anything not ASCII.
 *
 * THE NAME IS THE ONE THE REPORT SHOWS, where the record names one. A file a report carries is stored
 * under a fresh id, and on another machine the page and this door are two origins, so a browser ignores
 * the save link's `download` attribute and takes this name (wave 13y round 135, item 80). The stored
 * path's last part is the fallback, for a reference that names no file, such as a picture.
 *
 * A quote, a backslash or a control character in a filename would break the header's own grammar,
 * so the plain form is reduced to safe characters and `filename*` carries the name as it really
 * is. Two spellings of one fact, which is normally the defect this codebase hunts — here it is the
 * header's own format, and both are built from the same string in the same expression.
 */
function dispositionFor(name: string, how: 'inline' | 'attachment'): string {
  const plain = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${how}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** A type the page plays rather than reads whole: a video, which is streamed and has no cap. */
export function isAVideoType(type: string): boolean {
  return type.startsWith('video/')
}

// ============================================================================ what a browser may keep

/** What a file one of the office's stores named says, what a file at a path says, and what every other answer says. */
const A_STORED_FILE = 'private, max-age=31536000, immutable'
const A_FILE_AT_A_PATH = 'private, max-age=10'
const KEPT_BY_NOBODY = 'no-store'

/** How long a file at a path must have gone unchanged before it is given a tag, in nanoseconds. */
const UNCHANGED_FOR = 2_000_000_000n

/**
 * THE NAME A STORE GIVES A FILE: an office id, then the file's own extension, in lower case. The report store
 * names a file in `storedNameFor` in lib/reportfiles.ts, and lib/messagepictures.ts and lib/returnedfiles.ts
 * name theirs the same way. An id from before ids began with a letter or a digit is read as one too.
 */
const A_NAME_A_STORE_GIVES = /^[A-Za-z0-9_-]{12}(\.[a-z0-9]{0,19})?$/

/** The request headers that say who the reader is and in which project. A kept answer is kept for these values only. */
const WHO_IS_READING = [ACTOR_HEADERS.type, ACTOR_HEADERS.id, ACTOR_HEADERS.session, KEY_HEADER, DEVICE_HALF_HEADER, WORKSPACE_HEADER, 'cookie'].join(', ')

/**
 * WHAT A BROWSER MAY KEEP OF A FILE IT IS SENT, AND THE VERSION TAG IT ASKS AGAIN WITH.
 *
 * A FILE ONE OF THE OFFICE'S STORES NAMED IS KEPT A YEAR. The report store, the message pictures and the
 * returned files each write a file once, under a fresh office id, and never write other bytes under that
 * name. So the server could only ever answer that name with the bytes the browser already holds. A file
 * put into a store's folder by hand, under any other name, is answered as a file at a path.
 *
 * A FILE AT A PATH CAN CHANGE. It is kept ten seconds, and then the browser asks again with its tag, and an
 * unchanged file is answered 304 with no bytes. Ten seconds covers a page opened again soon after, which is
 * when the same picture is asked for again. It is short enough that a changed file is drawn new by any page
 * opened ten seconds after the browser last asked.
 *
 * THE TAG IS READ FROM THE FILE'S INODE, and not from its bytes: the device, the inode number, the size, and
 * the last change to the bytes (mtime) and to the inode (ctime), each to the nanosecond. Reading the bytes
 * to digest them would read a whole video to answer a request for one stretch of it. A write sets ctime to
 * the time of the write, and no call can set ctime to anything else.
 *
 * A FILE AT A PATH CHANGED IN THE LAST TWO SECONDS HAS NO TAG, and is kept by nobody, as before. Some file
 * systems keep a time only to the second, and FAT only to two seconds. A file written twice inside one such
 * step keeps the same times, and often the same size. Two seconds after the last change, any further
 * change carries a later time. A file whose times are ahead of this machine's clock has no tag either. A
 * stored file has a tag at any age, since its name only ever has one version.
 *
 * A SAVED FILE (download=1) AND A FILE OF A TYPE NO PAGE SHOWS ARE KEPT BY NOBODY, as before.
 *
 * PRIVATE, AND FOR THE READER WHO ASKED. `private` keeps the answer out of every cache shared between
 * people, such as a proxy. Vary names the request headers that say who the reader is and in which
 * project. A browser holding the answer for one reader sends another reader's request to the server, and
 * the server checks that reader again.
 */
function whatABrowserMayKeep(canonical: string, fd: number, type: string, saved: boolean): { cacheControl: string; tag: string | null } {
  if (saved || type === UNKNOWN_CONTENT_TYPE) return { cacheControl: KEPT_BY_NOBODY, tag: null }
  const file = fstatSync(fd, { bigint: true })
  const stored = aStoresOwnFile(canonical)
  const now = BigInt(Date.now()) * 1_000_000n
  if (!stored && (now - file.mtimeNs < UNCHANGED_FOR || now - file.ctimeNs < UNCHANGED_FOR)) {
    return { cacheControl: KEPT_BY_NOBODY, tag: null }
  }
  const version = `${String(file.dev)}:${String(file.ino)}:${String(file.size)}:${String(file.mtimeNs)}:${String(file.ctimeNs)}`
  return {
    cacheControl: stored ? A_STORED_FILE : A_FILE_AT_A_PATH,
    tag: `"${createHash('sha1').update(version).digest('base64url')}"`,
  }
}

/** Whether a file, its links resolved, sits in one of the office's stores under a name that store gives. */
function aStoresOwnFile(canonical: string): boolean {
  if (!A_NAME_A_STORE_GIVES.test(basename(canonical))) return false
  const folder = dirname(canonical)
  return STORES_BESIDE_THE_DATABASE.some((store) => {
    const where = whereAStoreIs(store)
    return existsSync(where) && realpathSync(where) === folder
  })
}

/**
 * THE RANGE STILL ASKED FOR. A Range sent with If-Range asks for the stretch only while the file is the version
 * the If-Range names, and otherwise for the whole file. A version is named here only by its tag, and a date
 * names none.
 */
function theRangeStillAsked(req: FastifyRequest, tag: string | null): string | undefined {
  const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
  const ifRange = req.headers['if-range']
  if (range === undefined || ifRange === undefined) return range
  return tag !== null && typeof ifRange === 'string' && ifRange.trim() === tag ? range : undefined
}

/** The most a words answer may be before the file is refused rather than cut. */
const MOST_WORDS_ANSWER_BYTES = 25 * 1024 * 1024

/**
 * SEND A WORD DOCUMENT, A TEXT FILE OR A MARKDOWN FILE AS ITS WORDS, AS DATA, OR REFUSE IT WHOLE.
 *
 * The page draws the answer itself, so the office's right-click reaches the words. No HTML is made
 * here and none of the file's markup is sent as markup: a Word document is its blocks of plain runs,
 * and a text or Markdown file is its text, which the page draws as text or with its one Markdown
 * reader. The answer is built from the bytes this request already opened, and the same descriptor
 * is closed on every path. A file over the cap is refused before its bytes are read, because the
 * answer is made from the bytes and the cap is on the file. A refusal is the JSON sentence every
 * refusal here is, and carries nothing of the file.
 */
function sendTheWords(reply: FastifyReply, file: OpenFile, type: string, name: string, reference: StoredPath, readFrom: string | null): FastifyReply {
  let answer: string
  try {
    const kind = theShownFileKind(type)
    if (kind === null) throw new PanelError(sayInEnglish('sb.file.notShownAsWords'), 415)
    if (file.size > MAX_PREVIEW_BYTES) throw new PanelError(sayInEnglish('sb.file.tooLargeToShow', { limit: MAX_PREVIEW_BYTES }), 413)
    const bytes = readFileSync(file.fd)
    const shown: ShownFile = kind === 'word'
      ? { name, kind, ...wordDocumentBlocks(bytes) }
      : { name, kind, text: textFileText(bytes) }
    answer = JSON.stringify(shown)
  } finally {
    closeSync(file.fd)
  }
  if (Buffer.byteLength(answer, 'utf8') > MOST_WORDS_ANSWER_BYTES) {
    throw new PanelError(sayInEnglish('sb.file.tooLargeToShow', { limit: MOST_WORDS_ANSWER_BYTES }), 413)
  }
  reply
    .type('application/json; charset=utf-8')
    // THE WORDS ARE READ AGAIN EACH TIME: a page that drew a file keeps no copy a later reader could be shown.
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .header('x-mole-office-record', reference.recordId)
    .header('x-mole-office-reference', reference.where)
  if (readFrom !== null) reply.header('x-mole-office-read-from', readFrom)
  // A string would let the shared tag hook add its own tag and a 304 under no-store, as the
  // metadata answer says.
  return reply.header('content-length', Buffer.byteLength(answer, 'utf8')).send(Readable.from([answer]))
}

// ============================================================================ the route

/**
 * The sentence GET /api lists this endpoint with. Declared beside the route, in `config.note`,
 * rather than in the maps in api/kinds.ts: a note that travels with the route cannot be left
 * behind when the route moves, and the maps are what the route groups written before that channel
 * existed still use.
 */
const FILE_ROUTE_NOTE =
  'Preview one file inline: the bytes of the file at ?path=<absolute path>, or a refusal saying exactly why not. ' +
  'IT IS NOT A FILE SERVER. Two things must hold and both are re-checked on every request: some LIVE record IN ' +
  'THE PROJECT YOU ARE ASKING IN must already store that exact path in a `path` field — a module\'s data.paths[] ' +
  'entry or an image block in data.summaryBlocks[] — and the file must sit inside a preview root, as written and ' +
  'after every symlink has been ' +
  'resolved. Roots come from MOLE_OFFICE_PREVIEW_ROOTS, colon-separated absolute paths, defaulting to the Mole Office ' +
  'checkout and each store beside the database; an empty setting means preview nothing and is honoured. A path ' +
  'inside report-files, message-pictures or returned-files of the default data folder is read from the same ' +
  'store beside the database in use when that is elsewhere, and x-mole-office-read-from names where. A path nothing points at is refused even ' +
  'though it exists, a path only ANOTHER PROJECT points at is refused naming that project and the header that ' +
  'reaches it — never the record, whose title belongs to a project this request is not in — a path only a ' +
  'deleted record points at is refused and names the record to restore, a file ' +
  'inside a directory some record points at is refused because a directory reference does not carry its contents, ' +
  'a ".." in any position is refused rather than normalised, and a symlink resolving outside the roots is refused ' +
  'after being followed. A reference that names another machine is refused rather than answered with this ' +
  'machine\'s file of the same name. A file that is missing, unreadable, a directory or a device is refused saying ' +
  'which of those it is, and so is one larger than 25 MB that the page would show whole — nothing ever stands in ' +
  'for the content. A video is streamed with no limit, and a Range header asks for one stretch of any file, ' +
  'answered 206 with content-range naming where it sits in the whole. download=1 saves the file whole, of any ' +
  'size, as an attachment, and open=1 opens it in the browser, streamed, of any size. metadata=1 returns the type and length without file bytes. words=1 returns a Word document as its blocks, and a text or Markdown file as its text, as JSON for the page to draw; it is refused for any other kind and beside download=1, open=1 or metadata=1. workspace=<project> in the address means what x-mole-office-workspace means, for a ' +
  'player or a download link that cannot send a header; the two naming different projects is refused. A HEAD ' +
  'is checked as the GET is and answered with its headers. ticket=<ticket> is an address POST /api/file/ticket made, ' +
  'for a browser\'s own load: it opens this one path, by a GET or a HEAD, in the browser it was made for, and is ' +
  'refused anywhere else. Every answer of this door, a refusal included, tells the browser to send no referrer.'

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // NO REFERRER FROM ANYTHING THIS DOOR ANSWERS, SEC-2 item 3: the bytes, a generated page, a PDF in a frame and a
  // refusal. A link in an opened file would otherwise send this address on, and a ticketed address carries its ticket.
  // Before the route, because a hook added after a route does not run for it.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('referrer-policy', 'no-referrer')
    return payload
  })
  app.get('/file', route('source.read', 'remote', FILE_ROUTE_NOTE), async (req, reply) => {
    const query = parse(fileQuery, req.query, 'The query string is not usable:')
    const shown = query.shown === '1'
    const words = query.words === '1'
    if (query.download === '1' && query.open === '1') {
      throw new PanelError('download=1 saves the file and open=1 opens it in the browser, and this request asked for both. Ask for one. Nothing was read.', 400)
    }
    if (words && (query.download === '1' || query.open === '1' || query.metadata === '1')) {
      throw new PanelError('words=1 asks for the file\'s words as data, and this request also asked to save, open or describe the file. Ask for one. Nothing was read.', 400)
    }
    // The same pair every other route uses — the header's shape, then the project's existence — so
    // an unknown project is the standard 404 listing the ones that exist rather than a preview
    // quietly answered from somewhere else. A project written into the address means the same.
    const workspaceId = theProjectAskedIn(req, query.workspace)
    const asked = requestedPath(query.path)

    // The reference check runs BEFORE anything touches the filesystem. A path nothing points at is
    // refused without this server so much as asking whether it exists, so the refusal cannot be
    // read as an answer to "is there a file here".
    // A MESSAGE THE CALLER MAY NOT READ IS NO AUTHORITY TO READ THE FILE IT POINTS AT, a picture sent in
    // it included, and no refusal below names it.
    const reader = theMessageReader(actorFrom(req))
    // A record named by the page is only a hint: it must independently authorize this exact path.
    // In every other case the full search retains the same refusals and competing references.
    const candidate = query.record === undefined ? null : getRecord(query.record)
    const hinted = candidate !== null && candidate.workspaceId === workspaceId && candidate.deletedAt === null
      ? storedPathsIn(candidate).find((ref) => ref.normalised === asked && !ref.deleted && ref.machine === null)
      : undefined
    let reference: StoredPath
    if (hinted !== undefined && !theMessagesHiddenFrom(reader, [hinted.recordId]).has(hinted.recordId)) {
      reference = hinted
    } else {
      const everyReference = referencesTo(asked, workspaceId)
      const hiddenHere = theMessagesHiddenFrom(reader, everyReference.map((ref) => ref.recordId))
      reference = authorisingReference(
        asked,
        everyReference.filter((ref) => !hiddenHere.has(ref.recordId)),
        workspaceId,
        reader,
      )
    }

    // A FILE A STORE HELD BEFORE THE DATA FOLDER MOVED is read from where that store is now. The
    // reference above was met by the path the record names; everything below reads `at`, and every
    // refusal names both.
    const where = whereAFileIs(asked, workspaceId)
    const { at, roots } = where
    const named = at === asked ? asked : `${asked} (read from ${at}, where its store is now)`

    if (where.is === 'outside') {
      // ONE SHORT SENTENCE ON THE SCREEN AND THE WHOLE ACCOUNT BEHIND IT, criterion M54. The owner read a
      // box carrying this entire paragraph over an alt text and said the picture was simply gone.
      // `reason` is what the box draws; `message` is unchanged and is one press away on it, and it
      // is the whole of what a caller reading JSON gets, as before.
      throw new PanelError(
        `${named} is outside every preview root, so Mole Office will not read it — even though "${reference.recordTitle}" ` +
          `(${reference.recordId}) points at it. A record can be written by an agent; the roots cannot, which is why ` +
          `they are the boundary rather than the reference. ${rootsSentence(roots)} ${whatWouldHaveAllowed(at, workspaceId)}`,
        403,
        undefined,
        undefined,
        'This file is outside the directories Mole Office may read.',
      )
    }

    /**
     * The path with every symlink on the way resolved. This is the answer containment is really
     * judged on: /tmp/root/link.png being inside the root says nothing if the link points at
     * /etc/shadow, and it is the content that has to be inside a root, not the name.
     */
    if (where.is === 'not-there' || where.is === 'unresolved') {
      if (where.is === 'not-there') {
        if (declaredStorageOmission(settings().databasePath, at)) {
          throw new PanelError('This attachment was left out on purpose when the backup was uploaded, so the restored copy does not have it.', 404,
            undefined, undefined, undefined, { code: 'storageMediaOmitted', values: {} })
        }
        throw new PanelError(
          `${named} is not there. "${reference.recordTitle}" (${reference.recordId}, ${reference.where}) points at ` +
            'it, so the reference is stale rather than the request being wrong — the file has moved, been renamed ' +
            'or been deleted since somebody wrote it down. NOTHING is served in its place: a placeholder under the ' +
            "file's own name would be a picture of something nobody has. Fix the path on the record, or put the " +
            'file back.',
          404,
          undefined,
          undefined,
          'The file is not there any more; the record still points at it.',
        )
      }
      if (where.code === 'ELOOP') {
        throw new PanelError(
          `${named} is a symbolic link that points at itself, or at a chain of links with no end (${where.code}). There is ` +
            'no file at the end of it to serve.',
          409,
        )
      }
      throw new PanelError(
        `${named} could not be resolved (${where.code}). It is reported as that rather than as missing: "there is no such ` +
          'file" and "this server cannot look" are different answers, and only one of them is about the file.',
        409,
      )
    }

    const canonical = where.canonical
    if (where.is === 'linked-out') {
      throw new PanelError(
        `${named} resolves to ${canonical}, which is outside every preview root. A link inside a root pointing out ` +
          'of it is the oldest way round a confinement rule, so containment is judged after the links have been ' +
          `followed and not before. ${rootsSentence(roots)} Nothing was read.`,
        403,
        undefined,
        undefined,
        'This file is a link out of the directories Mole Office may read.',
      )
    }

    const file = openConfined(canonical)
    const type = contentTypeFor(canonical)
    const saved = query.download === '1'
    const opened = query.open === '1'
    const metadata = query.metadata === '1'

    // THE PAGE'S READ OF A FILE IT DRAWS AS WORDS is answered as data, or refused whole, before any
    // header of the file's own is set. Only words=1 asks for it; every other read is unchanged.
    if (words) return sendTheWords(reply, file, type, reference.name ?? basename(canonical), reference, at === asked ? null : at)

    // WHAT IS SENT, DECIDED BEFORE A HEADER IS SET, so a refusal goes out as the JSON sentence it is
    // and never under the file's own type. A video, a saved file and an opened one are streamed and have no cap;
    // any other file the page shows whole keeps it, as the person asked.
    // A metadata answer reads no file bytes, so it has no cap either.
    let stretch: ReturnType<typeof theStretchAskedFor>
    let keeping: ReturnType<typeof whatABrowserMayKeep>
    try {
      if (!saved && !opened && !metadata && !isAVideoType(type) && file.size > MAX_PREVIEW_BYTES) throw tooLargeToShow(canonical, file.size)
      keeping = whatABrowserMayKeep(canonical, file.fd, type, saved)
      stretch = metadata ? 'whole' : theStretchAskedFor(theRangeStillAsked(req, keeping.tag), file.size)
    } catch (err) {
      closeSync(file.fd)
      throw err
    }
    // A VERSION THE BROWSER ALREADY HOLDS IS ANSWERED BEFORE A STRETCH IS, as the conditional requests are
    // ordered: a 304 says the whole of what it holds is still the file.
    const sent = keeping.tag !== null && theCallerHoldsIt(req.headers['if-none-match'], keeping.tag) ? 'nothing, it is held' : stretch
    if (sent === 'none of it') return refuseAStretchItHasNoneOf(req, reply, asked, file)

    reply
      .type(metadata ? 'application/json' : type)
      // What a browser may keep, and for whom: `whatABrowserMayKeep` says why.
      .header('cache-control', keeping.cacheControl)
      // File types come from the extension; metadata is JSON. `nosniff` stops the browser deciding
      // for itself that a file is something else — which is how an "image" becomes a script.
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', dispositionFor(reference.name ?? basename(canonical), saved ? 'attachment' : 'inline'))
      // Which record authorised this, answerable from the response itself. A reader holding bytes
      // should be able to find out why Mole Office was willing to serve them.
      .header('x-mole-office-record', reference.recordId)
      .header('x-mole-office-reference', reference.where)
      // A STRETCH MAY BE ASKED FOR BY ITS OFFSETS, which is how a player plays as the bytes arrive.
      .header('accept-ranges', 'bytes')

    // WHERE THE BYTES WERE READ FROM, when that is not the path the record names.
    if (at !== asked) reply.header('x-mole-office-read-from', at)

    if (type === PDF_TYPE && opened && shown && !saved && !metadata) {
      // THE PDF IS SHOWN, NOT SAVED OR DESCRIBED: the one answer a frame reads. open=1 alone is the
      // chat's Open and carries no policy, exactly as at the cut.
      reply.header('content-security-policy', THE_PDF_POLICY)
    } else if (type === HTML_TYPE) {
      // THE CUT'S SANDBOX FOR EVERY ANSWER EXCEPT THE REPORT'S OWN. The report's frame is the only
      // place the file's inline scripts and styles may run; open=1 alone is the chat's Open and
      // stays what it was, a sandbox with no script.
      reply.header('content-security-policy', opened && shown ? THE_PAGE_POLICY : "default-src 'none'; sandbox")
    } else if (EXECUTABLE_TYPES.has(type)) {
      reply.header('content-security-policy', "default-src 'none'; sandbox")
    }

    if (keeping.tag !== null) {
      // ADDED TO, not replaced: the cross-origin hook has already named Origin here.
      const vary = reply.getHeader('vary')
      const already = Array.isArray(vary) ? vary.join(', ') : vary === undefined ? '' : String(vary)
      reply.header('etag', keeping.tag).header('vary', already === '' ? WHO_IS_READING : `${already}, ${WHO_IS_READING}`)
    }
    if (metadata) reply.removeHeader('content-disposition').removeHeader('accept-ranges')
    if (sent === 'nothing, it is held') {
      closeSync(file.fd)
      return reply.code(304).send()
    }

    if (metadata) {
      closeSync(file.fd)
      const description = JSON.stringify({ type, size: file.size })
      // A string would let the shared tag hook add its own tag and a 304 under no-store.
      // A stream leaves the file's tag and 304 decision with this door.
      return reply.header('content-length', Buffer.byteLength(description)).send(Readable.from([description]))
    }

    return sendTheOpenFile(req, reply, canonical, file, sent)
  })
}
