#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CHECK THAT HAS TO PASS BEFORE ANYTHING IS PUBLISHED: nothing under `data/` is in the
 * repository.
 *
 *     node tools/open-source-gate.mjs
 *
 * Exit 0 and one line when nothing is tracked. Exit 1 and the list of files when something is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * THIS IS NOT THE RELEASE GATE. `design/PROBLEM-CLUSTERS.md` has that one — cluster 0, filed, scoped
 * and deliberately not started, covering the whole question of what may be
 * published and what has to come out first. This file is ONE of its checks, built now because
 * criterion M3 of `design/messages/ACCEPTANCE.md` asks for it by name: *an uploaded avatar is a file
 * under `data/avatars/` that never enters the repository; a test fails if any file under `data/` is
 * tracked, and the pre-open-source gate runs the same check.* Nothing else has been brought forward
 * from cluster 0, and this file must not grow into it by accident: a check added here that nobody
 * decided is a release rule nobody agreed to.
 *
 * WHY THE CHECK EXISTS AT ALL. `data/` is where the operator's own work lives: the database, its
 * backups, and now the pictures people upload of themselves. A picture somebody uploads is theirs,
 * and this repository is meant to be publishable — so the two must never meet, and "we remembered"
 * is not a mechanism.
 *
 * THE TEST AND THIS TOOL RUN THE SAME FUNCTION. It is exported from here and imported by
 * `tests/avatars.test.ts`, so the two cannot come to disagree about
 * what the check is — which is the defect this repository keeps producing.
 *
 * THERE IS AN ALLOWLIST AND IT IS EMPTY, on purpose and measured. `git ls-files data/` on 3 September
 * 2026 printed nothing, so no file under `data/` was ever deliberately tracked and the honest
 * allowlist is the empty one. It stays a list rather than becoming "nothing is allowed" so that a
 * file somebody DOES decide to track — a README saying what the directory is for, say — is added
 * with its reason beside it instead of by weakening the check.
 */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The files under `data/` that may be tracked, each with the reason it is.
 *
 * EMPTY, AND THAT IS A MEASUREMENT AND NOT AN OVERSIGHT. See the header.
 *
 * @type {{ path: string, why: string }[]}
 */
export const TRACKED_ON_PURPOSE = []

/** Where this checkout is. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every file under `data/` that git is tracking, in the order git lists them.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function filesUnderDataThatGitTracks(root = ROOT) {
  const out = execFileSync('git', ['ls-files', 'data/'], { cwd: root, encoding: 'utf8' })
  return out.split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

/**
 * What is wrong, in sentences, or an empty list because nothing is.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function whatIsTrackedThatShouldNotBe(root = ROOT) {
  const allowed = new Set(TRACKED_ON_PURPOSE.map((entry) => entry.path))
  return filesUnderDataThatGitTracks(root)
    .filter((file) => !allowed.has(file))
    .map(
      (file) =>
        `${file} is under data/ and git is tracking it. That directory holds the operator's own work — the ` +
        'database, its backups, and the pictures people uploaded of themselves — and none of it may be published. ' +
        `Take it out with: git rm --cached ${file}`,
    )
}

/**
 * RUN ONLY WHEN SOMEBODY RAN THIS FILE, never when a test imported it.
 *
 * The test imports the two functions above so that the check it makes and the check this tool makes
 * are the same code. Without this guard the import would run the check and, on a repository that
 * failed it, call `process.exit(1)` in the middle of the test runner.
 */
const runDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (runDirectly) main()

function main() {
  const complaints = whatIsTrackedThatShouldNotBe()
  if (complaints.length > 0) {
    for (const line of complaints) console.error(line)
    console.error('')
    console.error(`${String(complaints.length)} file(s) under data/ are in the repository. Nothing may be published.`)
    process.exit(1)
  }
  const kept =
    TRACKED_ON_PURPOSE.length === 0
      ? ''
      : `, apart from the ${String(TRACKED_ON_PURPOSE.length)} tracked on purpose`
  console.log(`Nothing under data/ is in the repository${kept}.`)
}
