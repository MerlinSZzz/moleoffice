#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK A CHANGESET OF FILES PASSES BEFORE IT LANDS IN THE MAIN WORLD.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/checks/files-changeset.mjs --manifest <manifest.json> --root <main world folder>
 *
 * `--root` is the folder the targets are relative to: for Mole Office's own data files it is the
 * checkout, and a target reads `data/report-files/<name>`. The checker only READS the root; it
 * writes nothing anywhere. It prints the JSON and exits as tools/checks/verdict.mjs says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A FILES CHANGESET IS
 * ---------------------------------------------------------------------------------------
 *
 * The sandbox v1 spec, R3 (21 September 2026): what the queue carries is a
 * changeset, and for a folder that is not git (pictures, PDFs, datasets, Mole Office's data/
 * files) the changeset is a manifest of operations plus the new bytes. The manifest:
 *
 *   {
 *     "why": "optional, for a person",
 *     "operations": [
 *       {
 *         "op": "add" | "modify" | "delete" | "rename",
 *         "target": "data/report-files/ab12.pdf",   the path in the main world, relative to --root
 *         "from": "data/…",                         rename only: the path it moves from
 *         "blob": "report-files/ab12.pdf",          the new bytes, relative to the manifest's folder;
 *                                                   add and modify need one, delete has none, a
 *                                                   rename needs one only if it changes the bytes
 *         "before_hash": "absent" | "<sha256>",     add: "absent"; modify and delete: the sha256 of
 *                                                   the target as it stands; rename: of `from`
 *         "after_hash": "<sha256>",                 the sha256 the path holds afterwards; not on delete
 *         "source": "/home/…/originals/x.pdf",      provenance: where it came from, or why it goes
 *         "origin": { "path", "sha256", "transform", "couldWrite" }   optional, from a files seal:
 *                                                   the original the run named at finish, its sha256
 *                                                   then, an optional named repair, and whether the
 *                                                   run could have written where it lies, by A2 of a
 *                                                   decision
 *         "size": 1234,                             optional: the blob's length in bytes
 *         "record": "<office record id>",           optional: the record this file answers
 *         "expect": { "pages": 3, "width": 640, "height": 480, "rows": 12 }   optional
 *       }
 *     ],
 *     "stagedAt": "/abs/folder"   optional: the folder the entry was staged in, so a source there is
 *                                 known to be the new file itself and not an original
 *   }
 *
 * Every hash is a sha256 in 64 lower-case hex characters. A key the checker does not know fails
 * that entry. To keep both versions when the target already exists, the submitter names another
 * target: the check stays "the target is absent", and nothing is overwritten under any name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DECIDES, PER OPERATION
 * ---------------------------------------------------------------------------------------
 *
 *   manifest-entry  the entry has the fields its op needs, in the right shapes, and no other key
 *   provenance      `source` is there and says something
 *   blob            the blob is a file inside the manifest's folder
 *   sha256, size    the blob's bytes are the ones the entry names
 *   no-overwrite    add: the target is absent. modify and delete: the target holds before_hash.
 *                   rename: `from` holds before_hash and the target is absent. Nothing is ever
 *                   written through a symbolic link or outside the root.
 *   origin          when the entry carries a files seal's record of its original (`origin`) and the
 *                   run could not have written where it lies: the original still holds the sha256
 *                   its seal recorded at finish
 *   source-bytes    the blob is byte for byte its original, or, with no `origin`, the file its
 *                   `source` names when that is a file on this machine; or, with the transform
 *                   trailing-nul-trim, its original with only NUL padding cut off the end,
 *                   recomputed from both files
 *   protected, generated   the target is in a protected area or written by a generator: decided
 *                   as a fact as well as handed on (below), so the queue never lands it on a
 *                   model's release alone, by A2 of a decision
 *   content-limit   a faithful copy over the 256 MiB content limit, neither protected nor generated,
 *                   is decided by its hash, in words that say its content was not read
 *   type            what the first bytes say (src/shared/file-signatures.ts) is what the name says
 *   decodes / structure / parses   the content check for the type (tools/checks/file-contents.mjs)
 *   expected        what `expect` states is what the content check measured
 *
 * AND WHAT IT HANDS ON (needsJudgment):
 *
 *   - Every delete: a delete in the main world waits for a secretary's
 *     confirmation. The checker still decides that the target holds before_hash.
 *   - A target in a protected area or written by a generator (.mole-office/protected.json).
 *   - A file this checker has no content reader for, a picture whose pixels its reader does not
 *     decode, and a source or original whose bytes are not the blob's, or do not make it by the
 *     transform named — unless the blob is byte for byte its source file, see below.
 *   - A file nothing compared with an original, said in so many words (acceptance finding 45, where
 *     this used to pass without a word): an original the run could have written, because it lies in
 *     the run's sandbox or the office cannot say where the run could write; an absolute source that
 *     is no file here; and a source that is the new file itself, inside the folder the entry was held
 *     or staged in.
 *   - A file over the content limit, unless it is decided by its hash as above.
 *
 * A FAITHFUL COPY OF A DAMAGED ORIGINAL IS NOT A FAILED COPY. When the blob is byte for byte the
 * file its `source` names, or its sealed original, or that original with only its NUL padding cut
 * off, whatever is wrong with its type or content was wrong in the original,
 * and the changeset did not cause it. The type and content findings are then handed on as a
 * judgment instead of failing the changeset: whether a damaged original should land is for a
 * reader to say. Measured on 21 September 2026 against the recovery originals this was built for:
 * one PDF whose startxref points at nothing (pdfinfo repairs it) and one JPEG with no end-of-image
 * marker (Pillow decodes it), both real originals.
 */

import { createHash } from 'node:crypto'
import { closeSync, constants, createReadStream, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'

import { cannotRun, decide, exitTwoOnACrash, finish, needsJudgment, newVerdict, readFlags } from './verdict.mjs'
import { PROTECTED_AREAS_FILE, generatorOf, isRelativePath, protectingPattern, readProtectedAreas } from './protected-areas.mjs'
import { readerFor } from './file-contents.mjs'
import { typeOfBytes, typeOfExtension } from '../../src/shared/file-signatures.ts'

const TOOL = 'tools/checks/files-changeset.mjs'
const USAGE = 'Usage: node tools/checks/files-changeset.mjs --manifest <manifest.json> --root <main world folder>'

/** The largest file whose content is read into memory for a content check. Hashes stream. */
const CONTENT_MAX_BYTES = 256 * 1024 * 1024

const SHA256 = /^[0-9a-f]{64}$/u

/** Which keys each op needs, and which it may carry. `source` is judged by its own check. */
const OPS = {
  add: { needs: ['target', 'blob', 'before_hash', 'after_hash'], may: ['source', 'size', 'record', 'expect', 'origin'] },
  modify: { needs: ['target', 'blob', 'before_hash', 'after_hash'], may: ['source', 'size', 'record', 'expect', 'origin'] },
  delete: { needs: ['target', 'before_hash'], may: ['source', 'record'] },
  rename: { needs: ['from', 'target', 'before_hash', 'after_hash'], may: ['blob', 'source', 'size', 'record', 'expect'] },
}

const EXPECTABLE = ['pages', 'width', 'height', 'rows']

/** The repairs of an original that office code can recompute from the bytes. One, for now. */
const TRANSFORMS = ['trailing-nul-trim']

/** What is wrong with an entry's `origin`, as sentences; empty when nothing is. */
function originProblems(origin) {
  if (typeof origin !== 'object' || origin === null || Array.isArray(origin)) return ['"origin" is not an object.']
  const problems = []
  const unknown = Object.keys(origin).filter((key) => !['path', 'sha256', 'transform', 'couldWrite'].includes(key))
  if (unknown.length > 0) problems.push(`"origin" does not carry ${unknown.map((key) => `"${key}"`).join(', ')}.`)
  if (typeof origin.path !== 'string' || !isAbsolute(origin.path)) problems.push('"origin.path" is not an absolute path.')
  if (typeof origin.sha256 !== 'string' || !SHA256.test(origin.sha256)) problems.push('"origin.sha256" is not a sha256 in 64 lower-case hex characters.')
  if (origin.transform !== undefined && !TRANSFORMS.includes(origin.transform)) problems.push(`"origin.transform" is ${JSON.stringify(origin.transform)}; it may be ${TRANSFORMS.join(', ')}.`)
  if (origin.couldWrite !== true && origin.couldWrite !== false && origin.couldWrite !== null) problems.push('"origin.couldWrite" is not true, false or null.')
  return problems
}

/** What is wrong with one entry's shape, as sentences; empty when nothing is. */
function entryProblems(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return ['The entry is not an object.']
  const shape = OPS[entry.op]
  if (shape === undefined) return [`"op" is ${JSON.stringify(entry.op)}; it is one of ${Object.keys(OPS).join(', ')}.`]
  const problems = []
  const unknown = Object.keys(entry).filter((key) => key !== 'op' && !shape.needs.includes(key) && !shape.may.includes(key))
  if (unknown.length > 0) problems.push(`A ${entry.op} does not carry ${unknown.map((key) => `"${key}"`).join(', ')}.`)
  for (const key of shape.needs) if (entry[key] === undefined) problems.push(`A ${entry.op} needs "${key}".`)
  for (const key of ['target', 'from', 'blob']) {
    if (entry[key] !== undefined && (!isRelativePath(entry[key]) || entry[key].endsWith('/'))) {
      problems.push(`"${key}" is ${JSON.stringify(entry[key])}, which is not the relative path of one file.`)
    }
  }
  if (entry.op === 'add' && entry.before_hash !== undefined && entry.before_hash !== 'absent') {
    problems.push('An add says the target is absent before it: "before_hash" is "absent".')
  }
  if (entry.op !== 'add' && entry.before_hash !== undefined && !SHA256.test(entry.before_hash)) {
    problems.push(`"before_hash" is ${JSON.stringify(entry.before_hash)}, not a sha256 in 64 lower-case hex characters.`)
  }
  if (entry.after_hash !== undefined && !SHA256.test(entry.after_hash)) {
    problems.push(`"after_hash" is ${JSON.stringify(entry.after_hash)}, not a sha256 in 64 lower-case hex characters.`)
  }
  if (entry.op === 'rename' && entry.blob === undefined && entry.after_hash !== undefined && entry.after_hash !== entry.before_hash) {
    problems.push('A rename that changes the bytes needs a "blob" with the new bytes.')
  }
  if (entry.size !== undefined && !(Number.isInteger(entry.size) && entry.size >= 0)) problems.push('"size" is not a whole number of bytes.')
  if (entry.source !== undefined && typeof entry.source !== 'string') problems.push('"source" is not a string.')
  if (entry.origin !== undefined) problems.push(...originProblems(entry.origin))
  if (entry.record !== undefined && (typeof entry.record !== 'string' || entry.record === '')) problems.push('"record" is not a record id.')
  if (entry.expect !== undefined) {
    if (typeof entry.expect !== 'object' || entry.expect === null || Array.isArray(entry.expect)) problems.push('"expect" is not an object.')
    else {
      for (const [key, value] of Object.entries(entry.expect)) {
        if (!EXPECTABLE.includes(key)) problems.push(`"expect" names "${key}"; it may name ${EXPECTABLE.join(', ')}.`)
        else if (!(Number.isInteger(value) && value >= 0)) problems.push(`"expect.${key}" is not a whole number.`)
      }
    }
  }
  return problems
}

/** The sha256 of a file, streamed so a large one is not held in memory. */
function sha256Of(path) {
  return new Promise((done, failed) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', failed)
      .on('end', () => done(hash.digest('hex')))
  })
}

/** What sits at a path, without following a link there: 'file', 'link', 'other', or null. */
function whatIsAt(path) {
  try {
    const stat = lstatSync(path)
    return stat.isSymbolicLink() ? 'link' : stat.isFile() ? 'file' : 'other'
  } catch {
    return null
  }
}

/**
 * Whether a relative path stays inside a folder once every link on the way is followed. The deepest
 * part of the path that exists is resolved; a link there that points out of the folder, or points
 * nowhere, says no.
 */
function staysInside(realFolder, relative) {
  let probe = join(realFolder, relative)
  while (whatIsAt(probe) === null && probe !== realFolder) probe = dirname(probe)
  try {
    const real = realpathSync(probe)
    return real === realFolder || real.startsWith(realFolder + sep)
  } catch {
    return false
  }
}

/** Whether a real path is a folder or lies inside it. */
function within(real, folder) {
  return folder !== null && (real === folder || real.startsWith(folder + sep))
}

/**
 * WHETHER `original` IS `blob` WITH ONLY NUL BYTES AFTER IT: the one repair of an original that office
 * code recomputes from the bytes, by A2 of a decision of 23 September 2026. A file carved
 * off a disk keeps the padding of its last block, and the recovered copy is the original with that
 * padding cut off. Both files are read in pieces, never whole, and neither is followed through a link.
 */
function trailingNulTrim(original, blob) {
  const open = (path) => openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  const a = open(original)
  const b = open(blob)
  try {
    const piece = 8 * 1024 * 1024
    const left = Buffer.allocUnsafe(piece)
    const right = Buffer.allocUnsafe(piece)
    let at = 0
    for (;;) {
      const got = readSync(b, right, 0, piece, null)
      if (got === 0) break
      let have = 0
      while (have < got) {
        const read = readSync(a, left, have, got - have, null)
        if (read === 0) return { ok: false, said: `the original ends at byte ${String(at + have)}, before the landed file does` }
        have += read
      }
      const differs = left.subarray(0, got).compare(right.subarray(0, got))
      if (differs !== 0) {
        let first = 0
        while (left[first] === right[first]) first += 1
        return { ok: false, said: `the original and the landed file differ at byte ${String(at + first)}` }
      }
      at += got
    }
    let removed = 0
    for (;;) {
      const read = readSync(a, left, 0, piece, null)
      if (read === 0) break
      const notNul = left.subarray(0, read).findIndex((byte) => byte !== 0)
      if (notNul !== -1) return { ok: false, said: `the original holds a byte that is not NUL at byte ${String(at + removed + notNul)}, after the landed file ends` }
      removed += read
    }
    return { ok: true, removed }
  } finally {
    closeSync(a)
    closeSync(b)
  }
}

/** The first bytes of a file in hex and printable characters, for naming what was found instead. */
function firstBytesSaid(bytes) {
  const head = [...bytes.subarray(0, Math.min(8, bytes.length))]
  const hex = head.map((b) => b.toString(16).padStart(2, '0')).join(' ')
  const printable = head.map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('')
  return bytes.length === 0 ? 'nothing (the file is empty)' : `${hex} ("${printable}")`
}

exitTwoOnACrash(TOOL)

const flags = readFlags(TOOL, process.argv.slice(2), ['--manifest', '--root'], USAGE)
if (flags['--manifest'] === undefined || flags['--root'] === undefined) cannotRun(TOOL, `Both --manifest and --root are needed. ${USAGE}`)
const manifestPath = resolve(flags['--manifest'])
if (whatIsAt(manifestPath) !== 'file') cannotRun(TOOL, `There is no manifest file at ${manifestPath}. Nothing was checked.`)
let realRoot
try {
  realRoot = realpathSync(resolve(flags['--root']))
  if (whatIsAt(realRoot) !== 'other') throw new Error('it is not a folder')
} catch (err) {
  cannotRun(TOOL, `The main world folder ${resolve(flags['--root'])} cannot be read (${err.message}). Nothing was checked.`)
}
const realManifestFolder = realpathSync(dirname(manifestPath))

// THE RULES IN FORCE: the main world's own declaration as it stands now.
let areas = { protected: [], generated: [] }
let configSaid = `none: ${realRoot} has no ${PROTECTED_AREAS_FILE}, so nothing there is protected`
const configPath = join(realRoot, PROTECTED_AREAS_FILE)
if (whatIsAt(configPath) === 'file') {
  try {
    areas = readProtectedAreas(readFileSync(configPath, 'utf8'), configPath)
    configSaid = configPath
  } catch (err) {
    cannotRun(TOOL, `${err.message} Nothing was checked.`)
  }
}

const verdict = newVerdict()
const checked = { manifest: manifestPath, root: realRoot, config: configSaid, operations: 0 }

let manifest = null
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (err) {
  decide(verdict, manifestPath, 'manifest', false, `The manifest is not JSON: ${err.message}.`)
}
if (manifest !== null) {
  const unknownTop = typeof manifest === 'object' && !Array.isArray(manifest) ? Object.keys(manifest).filter((key) => key !== 'operations' && key !== 'why' && key !== 'stagedAt') : []
  if (typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.operations)) {
    decide(verdict, manifestPath, 'manifest', false, 'The manifest is not an object with an "operations" list.')
    manifest = null
  } else if (unknownTop.length > 0) {
    decide(verdict, manifestPath, 'manifest', false, `The manifest carries ${unknownTop.map((key) => `"${key}"`).join(', ')}, which this checker does not know; it knows "operations", "why" and "stagedAt".`)
    manifest = null
  } else if (manifest.operations.length === 0) {
    decide(verdict, manifestPath, 'manifest', false, 'The manifest lists no operations: there is nothing to land.')
    manifest = null
  }
}

// THE FOLDER THE ENTRY WAS STAGED IN, when the manifest names it: a source there is the new file
// itself, not an original (acceptance finding 45). Resolved once; a folder that is not there names nothing.
let realStagedAt = null
if (typeof manifest?.stagedAt === 'string' && isAbsolute(manifest.stagedAt)) {
  try {
    realStagedAt = realpathSync(manifest.stagedAt)
  } catch {
    realStagedAt = null
  }
}

const named = new Set()
for (const [index, entry] of (manifest?.operations ?? []).entries()) {
  checked.operations += 1
  const path = typeof entry?.target === 'string' && entry.target !== '' ? entry.target : `operations[${String(index)}]`
  const problems = entryProblems(entry)
  const paths = problems.length === 0 ? [entry.target, ...(entry.from === undefined ? [] : [entry.from])] : []
  const twice = paths.filter((one) => named.has(one))
  if (twice.length > 0) problems.push(`${twice.join(' and ')} ${twice.length === 1 ? 'is' : 'are'} already named by an earlier operation; one path, one operation.`)
  if (problems.length > 0) {
    decide(verdict, path, 'manifest-entry', false, problems.join(' '))
    continue
  }
  for (const one of paths) named.add(one)
  decide(
    verdict,
    path,
    'manifest-entry',
    true,
    entry.op === 'rename'
      ? `A rename of ${entry.from} to ${entry.target}${entry.blob === undefined ? ', bytes unchanged' : `, with new bytes from ${entry.blob}`}.`
      : entry.op === 'delete'
        ? `A delete of ${entry.target}.`
        : `A${entry.op === 'add' ? 'n add of a new file' : ' modify of the file'} at ${entry.target}, from ${entry.blob}.`,
  )

  // PROVENANCE.
  const source = typeof entry.source === 'string' ? entry.source.trim() : ''
  decide(verdict, path, 'provenance', source !== '', source !== '' ? `It says where it came from: ${source}.` : 'It says nowhere where it came from or why: "source" is missing or empty.')

  // THE BYTES IT BRINGS: the blob's, or for a rename with none, the bytes already at `from`.
  let contentPath = null
  let bytesOk = true
  if (entry.blob !== undefined) {
    const blobPath = join(realManifestFolder, entry.blob)
    const blobIs = whatIsAt(blobPath)
    if (!staysInside(realManifestFolder, entry.blob) || blobIs !== 'file') {
      decide(verdict, path, 'blob', false, blobIs === null ? `There is no blob at ${blobPath}.` : `The blob at ${blobPath} is not a plain file inside the manifest's folder.`)
      bytesOk = false
    } else {
      contentPath = blobPath
      const size = lstatSync(blobPath).size
      decide(verdict, path, 'blob', true, `The blob is ${blobPath}, ${String(size)} bytes.`)
      const hash = await sha256Of(blobPath)
      const same = hash === entry.after_hash
      decide(verdict, path, 'sha256', same, same ? 'The blob\'s sha256 is the after_hash.' : `The blob's sha256 is ${hash}; the entry says ${entry.after_hash}.`)
      if (!same) bytesOk = false
      if (entry.size !== undefined) decide(verdict, path, 'size', size === entry.size, `The blob is ${String(size)} bytes; the entry says ${String(entry.size)}.`)
    }
  }

  // THE MAIN WORLD: nothing is overwritten that the entry did not name by its hash.
  const world = async (relative, mustHold) => {
    const full = join(realRoot, relative)
    if (!staysInside(realRoot, relative)) return { ok: false, said: `${relative} leads out of ${realRoot} through a symbolic link.` }
    const is = whatIsAt(full)
    if (mustHold === 'absent') {
      if (is === null) return { ok: true, said: `${relative} is absent in the main world.` }
      if (is !== 'file') return { ok: false, said: `${relative} already exists in the main world (as ${is === 'link' ? 'a symbolic link' : 'something that is not a file'}).` }
      return {
        ok: false,
        said: `${relative} already exists in the main world (sha256 ${await sha256Of(full)}), and the files adapter never overwrites. Submit a modify naming that hash as before_hash, or name another target to keep both.`,
      }
    }
    if (is === null) return { ok: false, said: `${relative} is not in the main world, so there is nothing whose hash could be ${mustHold}.` }
    if (is !== 'file') return { ok: false, said: `${relative} in the main world is ${is === 'link' ? 'a symbolic link' : 'not a plain file'}, and nothing is written through one.` }
    const hash = await sha256Of(full)
    return hash === mustHold
      ? { ok: true, said: `${relative} in the main world holds the before_hash.` }
      : { ok: false, said: `${relative} in the main world holds sha256 ${hash}, not the before_hash ${mustHold}: it changed after the change was made, which is a conflict.` }
  }
  const sayings = []
  let worldOk = true
  if (entry.op === 'rename') {
    const was = await world(entry.from, entry.before_hash)
    const into = await world(entry.target, 'absent')
    sayings.push(was.said, into.said)
    worldOk = was.ok && into.ok
    if (entry.blob === undefined && was.ok) contentPath = join(realRoot, entry.from)
  } else {
    const at = await world(entry.target, entry.op === 'add' ? 'absent' : entry.before_hash)
    sayings.push(at.said)
    worldOk = at.ok
  }
  decide(verdict, path, 'no-overwrite', worldOk, sayings.join(' '))
  if (entry.op === 'delete') {
    needsJudgment(verdict, path, 'It deletes a file from the main world, and a delete there waits for a secretary\'s confirmation.')
  }

  // WHERE IT GOES: a protected area, or a file a command writes, is read by the inspector. It is also
  // DECIDED as a fact — `protected` or `generated`, ok — because the queue must tell such a path from
  // any other handed-on one without reading a sentence: it never lands on a model's release alone, by A2
  // of a decision and its condition 4.
  let guarded = false
  for (const one of paths) {
    const generator = generatorOf(areas, one)
    const pattern = protectingPattern(areas, one)
    if (generator !== null) {
      const said = `It is written by \`${generator.command.join(' ')}\` (${PROTECTED_AREAS_FILE}), which a files changeset does not run.`
      needsJudgment(verdict, one, said)
      decide(verdict, one, 'generated', true, said)
      guarded = true
    } else if (pattern !== null) {
      const said = `It is in a protected area (${JSON.stringify(pattern)} in ${PROTECTED_AREAS_FILE}). Read it.`
      needsJudgment(verdict, one, said)
      decide(verdict, one, 'protected', true, said)
      guarded = true
    }
  }

  if (entry.op === 'delete' || contentPath === null || !bytesOk) continue

  // WHERE THE BYTES CAME FROM, compared with them where that can be done, and said where it cannot.
  // Acceptance finding 45: an absolute source that names no file used to skip this step without a
  // word, and a source that was the staged file itself was called "byte for byte the file at its
  // source". A files seal's own record of the original, when the entry carries one, is read instead.
  let faithful = false
  let faithfulSaid = ''
  if (entry.origin !== undefined) {
    const origin = entry.origin
    if (origin.couldWrite !== false) {
      needsJudgment(
        verdict,
        path,
        origin.couldWrite === true
          ? `Its named original ${origin.path} lies inside the sandbox the run worked in, where the run could have written it, so it is not taken as an original and nothing compared these bytes with one.`
          : // NULL IS TWO CASES, and the sentence names both (the check of run 5OEGnN3JXrRs, 23 September 2026): no
            // sandbox recorded, or one whose folder its own ledger row does not vouch for, which is how a lookalike
            // folder shows. Only the second is suspicious, and the run's sandbox field tells them apart.
            `The office cannot say where the run could write: it recorded no sandbox for the run, or one whose folder that sandbox's own ledger row does not vouch for, which is how a lookalike folder shows (the run's sandbox field tells which). So its named original ${origin.path} could have been written by the run. It is not taken as an original, and nothing compared these bytes with one.`,
      )
    } else if (whatIsAt(origin.path) !== 'file') {
      decide(verdict, path, 'origin', false, `The named original ${origin.path} ${whatIsAt(origin.path) === null ? 'is gone' : 'is no longer a plain file'} since the run finished; its seal holds sha256 ${origin.sha256}.`)
    } else {
      const now = await sha256Of(origin.path)
      if (now !== origin.sha256) {
        decide(verdict, path, 'origin', false, `The named original ${origin.path} changed after the run finished: its seal holds sha256 ${origin.sha256}, and it holds ${now} now.`)
      } else {
        decide(verdict, path, 'origin', true, `The named original ${origin.path} lies where the run could not write, and holds the sha256 its seal recorded at finish.`)
        if (origin.transform === 'trailing-nul-trim') {
          const relation = trailingNulTrim(origin.path, contentPath)
          if (relation.ok) {
            faithful = true
            faithfulSaid = `its original ${origin.path} (sha256 ${origin.sha256}) with ${String(relation.removed)} trailing NUL bytes removed`
            decide(verdict, path, 'source-bytes', true, `It is ${faithfulSaid}, recomputed from both files: the original begins with exactly these bytes and holds only NUL after them.`)
          } else {
            needsJudgment(verdict, path, `It is named as its original ${origin.path} with the trailing NUL padding removed, and the bytes say otherwise: ${relation.said}.`)
          }
        } else if (now === entry.after_hash) {
          faithful = true
          faithfulSaid = `byte for byte its original ${origin.path} (sha256 ${origin.sha256})`
          decide(verdict, path, 'source-bytes', true, `It is ${faithfulSaid}.`)
        } else {
          needsJudgment(verdict, path, `Its original ${origin.path} holds other bytes (sha256 ${now}) than the ones this entry lands. It may be a converted or repaired copy, or the wrong file.`)
        }
      }
    }
  } else if (isAbsolute(source)) {
    const is = whatIsAt(source)
    const real = is === 'file' ? realpathSync(source) : null
    if (real === null) {
      needsJudgment(verdict, path, `Source bytes not compared: ${source} is not a file on this machine, so nothing compared these bytes with an original.`)
    } else if (within(real, realManifestFolder) || within(real, realStagedAt)) {
      needsJudgment(verdict, path, `Its source ${source} is ${within(real, realManifestFolder) ? 'in the folder this entry was held in' : 'inside the folder this entry was staged in'}, so it is the new file itself and not an original, and nothing compared these bytes with one.`)
    } else {
      const hash = await sha256Of(real)
      faithful = hash === entry.after_hash
      faithfulSaid = `byte for byte the file at its source, ${source} (sha256 ${hash})`
      if (faithful) decide(verdict, path, 'source-bytes', true, `It is ${faithfulSaid}.`)
      else needsJudgment(verdict, path, `Its source ${source} holds other bytes (sha256 ${hash}) than the ones this entry lands. It may be a converted or repaired copy, or the wrong file.`)
    }
  }

  // TYPE AND CONTENT.
  const extension = extname(entry.target).slice(1).toLowerCase()
  const size = lstatSync(contentPath).size
  if (size > CONTENT_MAX_BYTES) {
    // A FAITHFUL COPY OVER THE LIMIT IS DECIDED BY ITS HASH (message TUD14-5BmQOc): a model given
    // it could not read it either. Never for a protected or generated path, and said in words the
    // landing repeats, so a file nobody read says so where a reader will look.
    if (faithful && !guarded) {
      decide(verdict, path, 'content-limit', true, `It is ${String(size)} bytes and ${faithfulSaid}: over the 256 MiB content limit; decided by its hash. Its content was not read.`)
    } else {
      needsJudgment(verdict, path, `It is ${String(size)} bytes, more than the ${String(CONTENT_MAX_BYTES)} this checker reads for a content check. Its hash was checked; its content was not.`)
    }
    continue
  }
  const bytes = readFileSync(contentPath)
  const sniffed = typeOfBytes(bytes)
  const claimed = typeOfExtension(extension)
  const inTheOriginal = faithful ? ` It is ${faithfulSaid}, so this is how the original is; whether a damaged original should land is for a reader to say.` : ''
  if (claimed !== null && sniffed !== claimed) {
    const said = `The name says .${extension} (${claimed}) and the bytes ${sniffed === null ? `begin ${firstBytesSaid(bytes)}, which is no type this checker recognises` : `say ${sniffed}`}.`
    if (faithful) needsJudgment(verdict, path, `${said}${inTheOriginal}`)
    else decide(verdict, path, 'type', false, said)
    continue
  }
  if (claimed !== null) {
    decide(verdict, path, 'type', true, `The bytes are ${sniffed}, as the name says.${sniffed === 'application/zip' ? ' A zip is recognised by its signature and never opened (the promise in src/server/lib/returnedfiles.ts).' : ''}`)
  } else if (sniffed !== null) {
    needsJudgment(verdict, path, `The bytes are ${sniffed} and the name ends in ${extension === '' ? 'no extension' : `.${extension}`}, which does not say so. That can be deliberate.`)
  }
  const reader = readerFor(sniffed, extension)
  if (reader === null) {
    if (!faithful && sniffed !== 'application/zip') {
      needsJudgment(verdict, path, `No content check exists for ${extension === '' ? 'a file with no extension' : `.${extension} files`}, and it is not a byte-for-byte copy of a source file on this machine. Its hash and where it lands were checked; what is in it was not.`)
    }
    continue
  }
  const result = reader(bytes)
  const expected = Object.entries(entry.expect ?? {})
  if (result.judgment !== undefined) {
    needsJudgment(verdict, path, `${result.judgment}${expected.length > 0 ? ` What the entry expects (${expected.map(([key, value]) => `${key} ${String(value)}`).join(', ')}) could not be measured.` : ''}`)
    continue
  }
  if (!result.ok) {
    if (faithful) needsJudgment(verdict, path, `Its content check (${result.check}) found: ${result.detail}${inTheOriginal}`)
    else decide(verdict, path, result.check, false, result.detail)
    continue
  }
  decide(verdict, path, result.check, true, result.detail)
  if (result.check === 'structure' && !faithful) {
    needsJudgment(verdict, path, 'Its structure holds, but its pixels were not decoded by this checker and it is not a byte-for-byte copy of a source file on this machine. Look at it.')
  }
  for (const [key, value] of expected) {
    const measured = result.facts[key]
    decide(
      verdict,
      path,
      'expected',
      measured === value,
      measured === undefined ? `The entry expects ${key} ${String(value)}, and a ${result.check} check of this type does not measure ${key}.` : `The entry expects ${key} ${String(value)}; the file has ${String(measured)}.`,
    )
  }
}

finish(TOOL, checked, verdict)
