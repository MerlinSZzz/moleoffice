// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER THIS CHECKOUT IS THE STABLE CHECKOUT, AT A DATED TAG OF ITS OWN CLONE.
 *
 * After the switch the office runs from a separate clone, the "stable checkout". Condition 3,
 * as reworded (oBVSWaD1dd6h): the stable checkout is its own clone, on branch stable at the dated tag
 * of its last upgrade; only the upgrade moves it; the office refuses to start from it at anything
 * else. Also (fPbGHEXq5OfR): the start refuses anything but a dated tag, with a test.
 *
 * The server's start calls `whyThisCheckoutIsNotAtADatedStableTag` and refuses with
 * `THE_STABLE_TAG_REFUSAL_EXIT_CODE` when it says anything. The setting that tells a start it runs
 * from the stable checkout (`MOLE_OFFICE_DEVELOPMENT_CHECKOUT`) and the call at the join are another
 * piece's; this file is the check alone.
 *
 * IT READS FILES ONLY AND SPAWNS NO GIT. A server may meet a checkout whose Git cannot run, and the
 * one question here is answerable from the files Git leaves behind: `.git/HEAD`, the branch ref, the
 * loose refs under `.git/refs/` and `packed-refs`. No Git object is ever read, so a loose annotated
 * tag is never peeled here, and its refusal says so.
 *
 * ONE SENTENCE A REFUSAL. Every refusal begins with `THE_STABLE_TAG_REFUSAL_BEGINS`, so a supervisor
 * that started the server can find the server's own sentence in the child's output.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * THE NAME OF A DATED STABLE TAG: `stable-YYYY-MM-DD-something`.
 *
 * The same rule the bootstrap and the upgrade test their tags with (tools/stable/stable-bootstrap-transaction.mjs
 * and tools/stable/stable-upgrade-transaction.mjs), tested against a tag's whole name. A tag's name is its
 * whole path under `refs/tags/`, so a tag kept in a nested folder (`refs/tags/a/stable-...`) has the
 * name `a/stable-...` and is not a dated stable tag.
 */
export const DATED_STABLE_TAG = /^stable-\d{4}-\d{2}-\d{2}-[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * THE EXIT CODE OF A SERVER THAT DID NOT START BECAUSE THIS CHECKOUT IS NOT THE STABLE CHECKOUT AT A
 * DATED TAG.
 *
 * The server and serve-dev use 0, 1 and 75 (the service lock), and the stand-in serve-dev starts uses
 * 2 for its usage error; 78 is unused by any of them. It is EX_CONFIG in sysexits, and the checkout's
 * configuration, not its code, is what the start refuses. The code alone tells a program that started
 * a server that this ending is not a crash.
 */
export const THE_STABLE_TAG_REFUSAL_EXIT_CODE = 78

/** The words every refusal sentence begins with, for a supervisor reading the child's output. */
export const THE_STABLE_TAG_REFUSAL_BEGINS = 'This server did not start: this checkout is not at a dated stable tag,'

/**
 * THE NAME OF THIS REFUSAL ON THE WIRE. The stand-in answers 503 with `refusal: THE_STABLE_TAG_REFUSAL`
 * beside its sentence, so a self-check can tell this refusal from every other without matching English.
 */
export const THE_STABLE_TAG_REFUSAL = 'not-at-a-dated-stable-tag'

/**
 * THE TWO STEPS THAT PUT THE COPY BACK, for the agent asked to do it. That agent meets the refusal
 * first in serve-dev's log, in the refusal file and in the stand-in's 503 body, so serve-dev puts
 * these steps after the server's sentence in all three (kM-Vho9xqlCm). The second step is
 * needed because serve-dev starts the server again only when a file it watches changes, and a
 * put-back may change none. troubleshooting.md has the same steps at more length. The owner's
 * window shows its own sentence instead, so no command is put to the owner.
 */
export const THE_STABLE_TAG_PUT_BACK =
  'For the agent asked to put this copy back, there are two steps. ' +
  '1. In the stable checkout, put branch stable back at the dated tag of its last upgrade. Do not run the ' +
  'upgrade instead, and do not move the branch to any other commit. ' +
  '2. Stop this serve-dev by the process group id recorded when it was started, then start ' +
  '`node tools/serve-dev.mjs --built --prepared` again in the stable checkout, with ' +
  'MOLE_OFFICE_DEVELOPMENT_CHECKOUT, MOLE_OFFICE_DB (absolute), MOLE_OFFICE_PORT and NODE_ENV=production. ' +
  'If no record names that group, stop and report up. troubleshooting.md has the same steps.'

/** @param {unknown} err @returns {string} */
const theErrorMessage = (err) => (err instanceof Error ? err.message : String(err))

/** A ref file's text with the newline it ends in taken off, or why it could not be read. */
/**
 * @param {string} path
 * @returns {{ read: string } | { absent: true } | { failed: string }}
 */
function theTextAt(path) {
  try {
    return { read: readFileSync(path, 'utf8').trim() }
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { absent: true }
    return { failed: theErrorMessage(err) }
  }
}

/** A tag as one place in `packed-refs` or one loose ref file holds it. */
/** @typedef {{ commit: string, peeled: string | null }} ATag */

/** The commit a tag stands for: its peeled commit when packed-refs gives one, otherwise what it holds. */
/** @param {ATag} tag @returns {string} */
const theCommitOf = (tag) => tag.peeled ?? tag.commit

/**
 * THE PACKED REFS: branch stable and every tag, with a peeled commit where `packed-refs` gives one.
 *
 * A `^<sha>` line peels the ref above it, and the peeled commit is the one compared. A missing file is
 * an ordinary empty answer: Git writes one only once refs have been packed.
 *
 * @param {string} git
 * @returns {{ branch: string | null, tags: Map<string, ATag> } | { refused: string }}
 */
function thePackedRefs(git) {
  const path = join(git, 'packed-refs')
  const read = theTextAt(path)
  if ('absent' in read) return { branch: null, tags: new Map() }
  if ('failed' in read) return { refused: `${THE_STABLE_TAG_REFUSAL_BEGINS} and ${path} could not be read (${read.failed}).` }
  /** @type {string | null} */
  let branch = null
  /** @type {Map<string, ATag>} */
  const tags = new Map()
  /** @type {string | null} */
  let above = null
  for (const line of read.read.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    if (line.startsWith('^')) {
      const tag = above === null ? undefined : tags.get(above)
      if (tag !== undefined) tag.peeled = line.slice(1)
      above = null
      continue
    }
    const space = line.indexOf(' ')
    if (space < 0) continue
    const id = line.slice(0, space)
    const ref = line.slice(space + 1)
    above = null
    if (ref === 'refs/heads/stable') {
      branch = id
      continue
    }
    if (ref.startsWith('refs/tags/')) {
      const name = ref.slice('refs/tags/'.length)
      tags.set(name, { commit: id, peeled: null })
      above = name
    }
  }
  return { branch, tags }
}

/**
 * THE LOOSE TAGS under `.git/refs/tags/`, however deeply nested. A tag's name is its whole path under
 * that folder, with `/` between the pieces, exactly as Git names it in `packed-refs`.
 *
 * @param {string} git
 * @returns {{ tags: Map<string, ATag> } | { refused: string }}
 */
function theLooseTags(git) {
  const folder = join(git, 'refs', 'tags')
  /** @type {string[]} */
  let found
  try {
    found = readdirSync(folder, { recursive: true, encoding: 'utf8' })
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { tags: new Map() }
    return { refused: `${THE_STABLE_TAG_REFUSAL_BEGINS} and ${folder} could not be read (${theErrorMessage(err)}).` }
  }
  /** @type {Map<string, ATag>} */
  const tags = new Map()
  for (const foundPath of found) {
    const path = join(folder, foundPath)
    let isFile = false
    try {
      isFile = statSync(path).isFile()
    } catch (err) {
      return { refused: `${THE_STABLE_TAG_REFUSAL_BEGINS} and ${path} could not be read (${theErrorMessage(err)}).` }
    }
    if (!isFile) continue
    const read = theTextAt(path)
    if ('absent' in read) continue
    if ('failed' in read) return { refused: `${THE_STABLE_TAG_REFUSAL_BEGINS} and ${path} could not be read (${read.failed}).` }
    const name = foundPath.split(sep).join('/')
    tags.set(name, { commit: read.read, peeled: null })
  }
  return { tags }
}

/**
 * WHY THIS CHECKOUT IS NOT THE STABLE CHECKOUT AT A DATED TAG, or null when it is.
 *
 * @param {string} root the checkout to read
 * @returns {string | null} one plain sentence naming what it found, or null
 */
export function whyThisCheckoutIsNotAtADatedStableTag(root) {
  const found = theDatedStableTagOf(root)
  return 'refused' in found ? found.refused : null
}

/**
 * THE DATED STABLE TAG THIS CHECKOUT IS AT, or the sentence saying why it is not the stable checkout at one. When more
 * than one dated tag names HEAD's commit, the first by name is given.
 *
 * @param {string} root the checkout to read
 * @returns {{ tag: string } | { refused: string }}
 */
export function theDatedStableTagOf(root) {
  /** @param {string} and what it found @returns {{ refused: string }} */
  const refused = (and) => ({ refused: `${THE_STABLE_TAG_REFUSAL_BEGINS} ${and}` })
  // ITS OWN CLONE, NOT A LINKED WORKTREE. A linked worktree's `.git` is a file that names the clone
  // that holds it, so the checkout is not its own clone and the stable checkout must be.
  const git = join(root, '.git')
  let dotGit
  try {
    dotGit = statSync(git)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return refused(`and there is no .git at ${git}, so this is not a Git checkout.`)
    }
    return refused(`and ${git} could not be read (${theErrorMessage(err)}).`)
  }
  if (!dotGit.isDirectory()) {
    return refused(
      `and ${git} is a file, not a folder, so this is a linked worktree; the stable checkout must be its own clone.`,
    )
  }
  // HEAD, EXACTLY ON BRANCH STABLE. A detached HEAD or another branch is refused by name, never guessed at.
  const headPath = join(git, 'HEAD')
  let head
  try {
    head = readFileSync(headPath, 'utf8')
  } catch (err) {
    return refused(`and ${headPath} could not be read (${theErrorMessage(err)}).`)
  }
  if (head !== 'ref: refs/heads/stable\n') {
    const held = head.trim()
    if (held.startsWith('ref: ')) return refused(`and ${headPath} names ${held.slice(5)}, not refs/heads/stable.`)
    if (/^[0-9a-f]{40}$/.test(held)) {
      return refused(`and ${headPath} names the commit ${held} with a detached HEAD, not the branch stable.`)
    }
    return refused(`and ${headPath} holds "${held}", which is not the branch stable.`)
  }
  // THE BRANCH'S COMMIT: the loose ref when it is there (it wins in Git), otherwise the packed one.
  const packed = thePackedRefs(git)
  if ('refused' in packed) return { refused: packed.refused }
  const looseBranchPath = join(git, 'refs', 'heads', 'stable')
  const looseBranch = theTextAt(looseBranchPath)
  let headCommit
  if ('failed' in looseBranch) return refused(`and ${looseBranchPath} could not be read (${looseBranch.failed}).`)
  if ('read' in looseBranch) {
    if (!/^[0-9a-f]{40}$/.test(looseBranch.read)) {
      return refused(`and ${looseBranchPath} holds "${looseBranch.read}", which is not a commit id.`)
    }
    headCommit = looseBranch.read
  } else if (packed.branch !== null) {
    headCommit = packed.branch
  } else {
    return refused(`and HEAD is refs/heads/stable, and its commit is in neither ${looseBranchPath} nor ${join(git, 'packed-refs')}.`)
  }
  // THE TAGS: the loose files under `.git/refs/tags/` and `packed-refs`. A loose ref wins over a packed
  // one of the same name, as it does in Git.
  const loose = theLooseTags(git)
  if ('refused' in loose) return { refused: loose.refused }
  /** @type {Map<string, ATag>} */
  const tags = new Map(loose.tags)
  for (const [name, tag] of packed.tags) if (!tags.has(name)) tags.set(name, tag)
  const dated = [...tags.entries()].filter(([name]) => DATED_STABLE_TAG.test(name)).sort(([one], [other]) => one.localeCompare(other))
  if (dated.length > 0) {
    const atHead = dated.find(([, tag]) => theCommitOf(tag) === headCommit)
    if (atHead !== undefined) return { tag: atHead[0] }
    const first = dated[0]
    if (first !== undefined) {
      const [name, tag] = first
      return refused(
        `and HEAD is refs/heads/stable at ${headCommit}, and the dated tag ${name} points at ${tag.commit}, not at ` +
          'that commit; a loose annotated tag points at a tag object, and only lightweight tags and packed tags with a ' +
          'peeled commit are read.',
      )
    }
  }
  const atHead = [...tags.entries()]
    .filter(([, tag]) => theCommitOf(tag) === headCommit)
    .map(([name]) => name)
    .sort()
  return refused(
    `and HEAD is refs/heads/stable at ${headCommit}, and no tag whose name is a dated stable tag names that commit; ` +
      (atHead.length === 0
        ? 'no tag points at that commit.'
        : `the tags at it are ${atHead.join(', ')}, and none of them is a dated stable tag like stable-2026-10-19-something.`),
  )
}
