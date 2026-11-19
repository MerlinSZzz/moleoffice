// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE JOINS A REPLAY GETS, in one place: the migration journal's (journal-join.mjs) and the lists' and imports'
 * (list-join.mjs). The queue's rebase (rebase-with-joins.mjs), the clean copy a supervisor resolves a conflict in
 * (resolve-a-conflict.mjs) and the merge tool's check of that resolution (check-a-resolution.mjs) each give their clone
 * these, so a stop one of them meets is the stop the others meet (tier 2 of the join rule, round B).
 *
 * IT READS NONE OF THE MERGE TOOL'S ARGUMENTS, so the clean copy, which a supervisor runs, can import it.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { JOURNAL_JOIN_REFUSED, JOURNAL_JOINS_SAID, joinTheJournalInThisClone } from './journal-join.mjs'
import { LIST_JOIN_REFUSED, LIST_JOINS_SAID, joinTheListsInThisClone } from './list-join.mjs'

/** Gives `clone` the joins through `setConfig`. */
export function giveTheCloneTheJoins(clone, setConfig) {
  // THE MIGRATION JOURNAL IS JOINED BY ITSELF when a replayed commit and main both appended rows (journal-join.mjs).
  joinTheJournalInThisClone(clone, setConfig)
  // A CONFLICT WHERE BOTH SIDES ONLY ADDED IS JOINED BY ITSELF as well, in a list file or a code file's imports (list-join.mjs,
  // wave 13v round 22 and tier 1 of the list-join rule). Its refusal names the file, the line and the rule.
  joinTheListsInThisClone(clone, setConfig)
}

/** What one of the joins wrote into the clone's git folder, or '' when it wrote nothing. */
export function saidInTheClone(clone, name) {
  return existsSync(join(clone, '.git', name)) ? readFileSync(join(clone, '.git', name), 'utf8').trim() : ''
}

/** Every line the joins wrote in the clone: what they joined and what they refused. */
export function whatTheJoinsSaid(clone) {
  const lines = (name) => saidInTheClone(clone, name).split('\n').filter((one) => one !== '')
  return { joined: [...lines(JOURNAL_JOINS_SAID), ...lines(LIST_JOINS_SAID)], refused: [...lines(JOURNAL_JOIN_REFUSED), ...lines(LIST_JOIN_REFUSED)] }
}
