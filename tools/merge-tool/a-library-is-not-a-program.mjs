// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A LIBRARY OF THE MERGE TOOL RUN WITH NODE REFUSES (wave 13u, item 54). Every file of this folder but its programs
 * imports this module before anything else. When node was started on one of those libraries, this module says in one
 * sentence what does run it, and exits 2 before the library's other modules run. Until 30 October 2026 owner-content.mjs,
 * run with node, exited 0 and screened nothing, so a round that ran it by hand could report its screen clean.
 *
 * Imported, it does nothing: by the merge tool, by vitest, by a test's own program, and in a process started on one of
 * the folder's programs, as the cleanup watcher, a merge driver git starts and the trial replay are. It imports node's
 * own modules only, so nothing a library imports has run when it refuses.
 */
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The files of this folder that read their own command line. Each is run as a program by the merge tool, git or a person. */
export const THE_PROGRAMS = Object.freeze(['cleanup.mjs', 'cli.mjs', 'journal-join.mjs', 'list-join.mjs', 'resolve-a-conflict.mjs', 'the-address-scan.mjs', 'trial-replay.mjs'])

/**
 * THE LIBRARIES A PROJECT-ONLY PROGRAM LOADS, AND THE PROGRAM THAT LOADS EACH. The merge tool is also a
 * tool a project can run without the office, whose command line is a later piece. The office never uses
 * those libraries, so the office tool must not reach them and the refusal below names their own loader.
 * @type {Readonly<Record<string, string>>}
 */
export const THE_LIBRARIES_A_PROJECT_LOADS = Object.freeze({ 'local-keeper.mjs': 'tools/merge-tool/cli.mjs', 'the-command-words.mjs': 'tools/merge-tool/cli.mjs' })

/**
 * The gates a round may check by hand, with what a check by hand imports from each. integrate.mjs runs all three.
 * @type {Record<string, string>}
 */
const THE_GATES = {
  'owner-content.mjs': 'screenTheAddedLines and theScreenSaid',
  'addresses.mjs': 'screenTheAddedLines and theScreenSaid',
  'commit-addresses.mjs': 'screenTheCommits and theScreenSaid',
}

/**
 * The sentence a library of this folder, named by its file name, says when node is started on it.
 * @param {string} name
 */
export function theRefusal(name) {
  if (Object.hasOwn(THE_GATES, name)) {
    return `tools/merge-tool/${name} is a library of the merge tool and has no command line, so run with node it checks nothing; the check runs in tools/merge-tool/integrate.mjs, which node tools/the-merger.mjs loads, and a check by hand imports ${THE_GATES[name]} from this file.`
  }
  if (Object.hasOwn(THE_LIBRARIES_A_PROJECT_LOADS, name)) {
    return `tools/merge-tool/${name} is a library of the merge tool and has no command line, so run with node it does nothing; ${THE_LIBRARIES_A_PROJECT_LOADS[name]} loads it, and the office does not.`
  }
  return `tools/merge-tool/${name} is a library of the merge tool and has no command line, so run with node it does nothing; node tools/the-merger.mjs loads it.`
}

/** The file node was started on, with its links followed. null when there is none, as with `node -e`. */
const started = process.argv[1] !== undefined && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : null
if (started !== null && dirname(started) === dirname(fileURLToPath(import.meta.url)) && !THE_PROGRAMS.includes(basename(started))) {
  process.stderr.write(`${theRefusal(basename(started))}\n`)
  process.exit(2)
}
