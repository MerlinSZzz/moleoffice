// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE STAMP A BUILT PAGE CARRIES, SO THE FRESHNESS DOOR CAN TELL WHETHER THE BUILD IS BEHIND THE
 * CHECKOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY IT IS A FILE
 * ---------------------------------------------------------------------------------------
 *
 * S2 of design/ground/ACCEPTANCE.md section 9. A built page is a bundle: the code in it is the code
 * that was in the checkout when `vite build` ran, and after that it does not move. So the question
 * "is the page I am serving as new as the checkout" cannot be answered by a process start time, and
 * a build has no process to ask. It is answered by writing down, at the moment of the build, the
 * newest source file the page is built from and the commit the build was made at, in a small file
 * inside the built page's own folder. The API reads that file and compares it with the source on
 * disk now.
 *
 * THE COMPARISON IS THE SAME ONE THE SERVER MAKES ABOUT ITSELF, and it is deliberately the same
 * function: how new something is is whether the newest source it took in is older than the newest
 * source on disk, to the second. Two spellings of that would be free to disagree about the same
 * pair of times, which is the defect CLAUDE.md names at the top of the file.
 *
 * WHY IT IS JAVASCRIPT. The same reason src/config/settings.mjs and src/config/newest-source.mjs
 * are: the tool that writes it (`tools/build-the-page.mjs`) runs under plain node, and the server
 * that reads it imports it through the TypeScript loader. Everything in src/config is read by
 * callers this repository does not control the Node version of.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { theBuildStampIn } from './settings.mjs'
import { localStampOf } from './stopped-run-cause.mjs'
import { theFilesBuiltFrom } from './import-graph.mjs'
import { THE_PAGES_ENTRY } from './newest-source.mjs'
import { whatGuardedGitSays } from './guarded-git.mjs'

/** How long git is given to compare the two commits. */
const COMPARES_TWO_COMMITS_TIMEOUT_MS = 15_000

// THE STAMP'S NAME, ITS SHAPE AND ITS ONE READER are in src/config/settings.mjs, which reads a
// bundle's stamp to tell a bundle from a checkout and must stay importable on its own (the session
// hook copies it alone). They are re-exported here, beside the writer, for every other caller.
export { THE_BUILD_STAMP_FILE, theBuildStampIn, readTheBuildStamp } from './settings.mjs'

/**
 * WRITE THE STAMP OF A BUILD.
 *
 * `newestSource` is the reading from `newestSourceBuiltFrom(THE_PAGES_ENTRY)`: the newest file the
 * page is built from at the moment the build began, and how many files that is. It is written
 * before the build runs, so a file that changes WHILE the build is running leaves the stamp behind
 * it — which is the safe direction to be wrong in, exactly as `isBehindTheCheckout` says.
 *
 * @param {string} webDir the folder the built page is being written into
 * `files`, when given, is how many files the newest one was found among; a bundle's stamp carries it so
 * a server running from the bundle can say it without walking a source tree it does not have.
 * `version`, when given, is package.json's version, which a bundle carries here because it has no
 * package.json of its own (theVersion() in src/config/settings.mjs reads it back).
 * @param {{ at?: Date, newestSource?: { at: Date, file: string, files?: number } | null, commit?: string | null, version?: string }} [what]
 * @returns {{ written: string }}
 */
export function writeTheBuildStamp(webDir, what = {}) {
  const at = what.at ?? new Date()
  const newest = what.newestSource ?? null
  const stamp = {
    builtAt: localStampOf(at),
    builtAtMs: at.getTime(),
    commit: what.commit ?? null,
    newestSourceAt: newest === null ? null : localStampOf(newest.at),
    newestSourceAtMs: newest === null ? null : newest.at.getTime(),
    newestSourceFile: newest === null ? null : newest.file,
    newestSourceFiles: newest === null || newest.files === undefined ? null : newest.files,
    ...(what.version === undefined ? {} : { version: what.version }),
  }
  mkdirSync(dirname(theBuildStampIn(webDir)), { recursive: true })
  mkdirSync(webDir, { recursive: true })
  writeFileSync(theBuildStampIn(webDir), `${JSON.stringify(stamp, null, 2)}\n`)
  return { written: theBuildStampIn(webDir) }
}

/**
 * WHETHER A BUILT PAGE IS THE PAGE OF A COMMIT, judged by what the page is built from.
 *
 * A landing that changes only server or tool files leaves the stamp on the commit the build ran
 * at, and the page is still that commit's page. So when the stamp names an earlier commit, this
 * asks git whether any input of the page differs between that commit and the serving one. No
 * difference means the page is the serving commit's page; a difference, or any failure to tell,
 * means it is not.
 *
 * THE INPUTS are the files the page's entry imports, the files vite.config.ts imports, and the
 * four files and folder the build reads outside them: package.json, package-lock.json,
 * tsconfig.json and public.
 *
 * WHAT IS NOT COMPARED: node_modules on disk, which package-lock.json stands for, and files that
 * are not committed. The check the door made before this function compared neither.
 *
 * It never throws. An unexpected failure is a refusal with its message, because a page that
 * cannot be compared is not shown to be the serving commit's page.
 *
 * @param {string} root the checkout
 * @param {unknown} builtAt the commit the stamp says the page was built at
 * @param {unknown} commit the commit being served
 * @returns {{ same: true } | { same: false, why: string }}
 */
export function whetherThePageIsTheCommits(root, builtAt, commit) {
  try {
    if (builtAt === commit) return { same: true }
    const isACommit = /^[0-9a-f]{40}$/
    if (typeof builtAt !== 'string' || !isACommit.test(builtAt) ||
        typeof commit !== 'string' || !isACommit.test(commit)) {
      return { same: false, why: `The built page's commit (${String(builtAt)}) or the serving commit (${String(commit)}) is not 40 lowercase hex characters, so the page cannot be compared with the serving commit.` }
    }
    /** @type {string[]} */
    const inputs = []
    const seen = new Set()
    let unresolved = 0
    let couldNotRead = 0
    for (const entry of [THE_PAGES_ENTRY, 'vite.config.ts']) {
      const walked = theFilesBuiltFrom(entry, root)
      unresolved += walked.unresolved.length
      couldNotRead += walked.couldNotRead.length
      for (const file of walked.files) {
        if (seen.has(file)) continue
        seen.add(file)
        inputs.push(file)
      }
    }
    if (unresolved !== 0 || couldNotRead !== 0) {
      return { same: false, why: `The page's inputs could not be read in full: ${unresolved} ${unresolved === 1 ? 'import' : 'imports'} could not be resolved and ${couldNotRead} ${couldNotRead === 1 ? 'file' : 'files'} could not be read.` }
    }
    inputs.push('package.json', 'package-lock.json', 'tsconfig.json', 'public')
    const said = whatGuardedGitSays(root, ['diff', '--name-only', '--no-renames', builtAt, commit, '--', ...inputs], COMPARES_TWO_COMMITS_TIMEOUT_MS)
    if (said.status !== 0) {
      const first = said.stderr.split('\n').map(line => line.trim()).find(line => line !== '')
      const reason = (first ?? 'git gave no reason').replace(/\.$/, '')
      return { same: false, why: `Git could not compare the two commits: ${reason}.` }
    }
    const named = said.stdout.split('\n').map(line => line.trim()).filter(line => line !== '')
    if (named.length !== 0) {
      return { same: false, why: `The page's inputs changed after it was built: ${named.slice(0, 5).join(', ')}; ${named.length} ${named.length === 1 ? 'file' : 'files'} changed in all.` }
    }
    return { same: true }
  } catch (error) {
    return { same: false, why: `The page could not be compared with the serving commit: ${error instanceof Error ? error.message : String(error)}` }
  }
}
