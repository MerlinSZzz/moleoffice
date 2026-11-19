// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST FILES THAT HAVE MOVED: the files whose wave has made them read the test office's constants
 * (tests/a-page-of-a-test-office.ts) instead of writing the owner, an agent handle or a home path out.
 *
 * WHERE A WAVE WRITES ITS LIST: in tests/moved/<wave>.txt, its own file, one path per line, such as
 * tests/moved/13s.txt. Not in MOVED below. MOVED holds the files listed before the wave lists existed:
 * wave 13j's from its rounds 29 and 30, and wave 13s's from its rounds 14 and 14b. From now on a wave
 * writes its files in its own list. Two waves that write to one file cannot share a merge bus; two waves
 * with a list each can.
 *
 * Plan eIeEzSGXdTpu, steps 2 and 3, one wave a round, because the other waves' files must not move under
 * them. Two gates read MOVED and every list together, through theMovedFiles and whatIsWrongWithTheLists
 * below: tests/the-test-offices-owner-is-read-from-one-place.test.ts (the owner and the secretary, round
 * 29) and tests/the-test-files-name-no-real-home.test.ts (home paths, round 30). It is a module of its
 * own, and not an export of either gate, because a test file that imports another test file runs that
 * file's tests a second time.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The folder of the wave lists, from the repository. Every file in it ending .txt is a list. */
export const THE_WAVES_LISTS = 'tests/moved'

/** What a sentence calls MOVED. */
export const MOVED_IS = 'MOVED in tests/the-moved-test-files.ts'

/**
 * HOW A LIST SAYS ITS PRONOUN SLICE IS DONE: its first line is exactly this, and nothing else about the
 * list changes. A gate read every file on such a list until it was deleted on 12 November 2026,
 * so the list said so in the one place a wave already writes to, rather than in an array in the gate. A
 * line that starts with # anywhere else, or in any other words, is refused by whatIsWrongWithTheLists.
 */
export const A_DONE_LIST_BEGINS = '# done: every file on this list calls the owner by no pronoun'

/** MOVED is not a file in tests/moved/, so it says the same here, beside the list it is about. */
export const MOVED_IS_DONE: boolean = true

/** Wave 13j's test files, from its rounds 29 and 30, then wave 13s's, from its rounds 14 and 14b. A wave adds no more here; it writes its files in tests/moved/<wave>.txt. */
export const MOVED: readonly string[] = [
  'tests/a-card-is-enlarged-by-dragging-its-edge.test.ts',
  'tests/a-card-is-enlarged-in-both-directions.test.ts',
  'tests/a-cards-comment-count-does-not-move.test.ts',
  'tests/a-cards-size-is-the-readers.test.ts',
  'tests/a-comment-says-what-it-is-about.test.ts',
  'tests/a-corner-moves-both-its-edges.test.ts',
  'tests/a-counter-that-waits-for-a-count-says-so.test.ts',
  'tests/a-fork-something-replaced-says-so.test.ts',
  'tests/a-fresh-clone-names-nobody.test.ts',
  'tests/a-hold-is-counted-once-an-hour.test.ts',
  'tests/a-length-with-no-summary-says-so.test.ts',
  'tests/a-level-written-by-part-draws-the-parts.test.ts',
  'tests/a-long-press-drags-with-a-mouse.test.ts',
  'tests/a-long-press-moves-a-card-on-a-phone.test.ts',
  'tests/a-mark-reaches-its-person-and-nobody-else.test.ts',
  'tests/a-message-to-an-agent-the-office-could-not-tell-about-is-not-routed.test.ts',
  'tests/a-moved-card-takes-its-lines.test.ts',
  'tests/a-new-key-grant-is-withdrawn-by-who-granted-it.test.ts',
  'tests/a-node-says-more-in-the-browser.test.ts',
  'tests/a-page-of-a-test-office.ts',
  'tests/a-part-of-a-report-can-be-pointed-at.test.ts',
  'tests/a-press-moves-nothing-on-a-drawing.test.ts',
  'tests/a-test-office-draws-no-machine-name.test.ts',
  'tests/a-warrant-cites-only-the-persons-proved-words-after-the-close.test.ts',
  'tests/a-withdrawn-design-goes-on-the-shelf.test.ts',
  'tests/agent-threads.test.ts',
  'tests/an-arrangement-stays-with-its-drawing.test.ts',
  'tests/applied-events-equal-a-fresh-read.test.ts',
  'tests/changing-an-instruction-before-it-goes.test.ts',
  'tests/config.test.ts',
  'tests/dragging-one-card-moves-no-other.test.ts',
  'tests/each-edge-of-a-card-moves-alone.test.ts',
  'tests/every-list-says-what-it-is.test.ts',
  'tests/every-test-process-is-given-the-test-offices-owner.ts',
  'tests/every-window-b-step-is-named.test.ts',
  'tests/family-pages.test.ts',
  'tests/family-rows.test.ts',
  'tests/findings-list.test.ts',
  'tests/graph-edit.test.ts',
  'tests/graph-layout.test.ts',
  'tests/graph-model.test.ts',
  'tests/horizons-in-a-browser.test.ts',
  'tests/hours-at-two-levels.test.ts',
  'tests/implementation-map-boundary.test.ts',
  'tests/neutral-names.ts',
  'tests/no-column-default-names-a-person.test.ts',
  'tests/no-stored-week-key-in-normal.test.ts',
  'tests/notes-list-handback.test.ts',
  'tests/one-configuration-source.test.ts',
  'tests/one-listener-for-the-whole-product.test.ts',
  'tests/plan-graph-drawing.test.ts',
  'tests/plan-receipts-say-the-cost.test.ts',
  'tests/plan-table-cells.test.ts',
  'tests/plan-table-editing.test.ts',
  'tests/plan-writing-carries-values.test.ts',
  'tests/planning.test.ts',
  'tests/record-tiers.test.ts',
  'tests/records-queries-pages.test.ts',
  'tests/records.test.ts',
  'tests/schedule-board.test.ts',
  'tests/seed-title-repeats.test.ts',
  'tests/seven-surfaces.test.ts',
  'tests/the-browser-and-the-server-mean-the-same-person.test.ts',
  'tests/the-checks-model-and-clock-are-settings.test.ts',
  'tests/the-content-reveals-by-area.test.ts',
  'tests/the-counters-page-as-cards.test.ts',
  'tests/the-demo-corpus-names-none-of-the-owners-work.test.ts',
  'tests/the-drawing-on-the-whole-screen.test.ts',
  'tests/the-first-run-guide.test.ts',
  'tests/the-horizons-page.test.ts',
  'tests/the-level-follows-the-area.test.ts',
  'tests/the-level-holds-through-a-band.test.ts',
  'tests/the-owner-comes-from-the-installer.test.ts',
  'tests/the-owners-list-names-a-replaced-forks-link.test.ts',
  'tests/the-owners-project-is-not-in-the-source.test.ts',
  'tests/the-page-can-enter-another-world-and-come-back.test.ts',
  'tests/the-person-can-reach-it.test.ts',
  'tests/the-press-closes-the-window.test.ts',
  'tests/the-reports-page-lists-reports-and-notes-of-every-project.test.ts',
  'tests/the-restore-check-names-the-office-owner.test.ts',
  'tests/the-secretariat-chat-is-pinned-and-its-joins-are-short.test.ts',
  'tests/the-secretary-broadcasts-on-a-schedule.test.ts',
  'tests/the-seed-names-the-office-owner.test.ts',
  'tests/the-skill-says-how-to-reach-the-office-from-elsewhere.test.ts',
  'tests/the-two-page-controls-are-graph-and-list.test.ts',
  'tests/the-waiter-carries-its-credential.test.ts',
  'tests/the-waiter-holds-while-the-session-answers.test.ts',
  'tests/the-worker-presses-the-dead-letter-sweep-each-pass.test.ts',
  'tests/time-given-stays-editable.test.ts',
  'tests/title-identity.test.ts',
  'tests/usage-hook.test.ts',
  'tests/what-a-message-answers.test.ts',
  'tests/who-may-read-which-message-the-gaps-left.test.ts',
  'tests/workspace-move.test.ts',
  'tests/wrong-turns-are-not-failures.test.ts',
  // Wave 13s's test files, from its rounds 14 and 14b. tests/migration.test.ts is not here. The owner gate allows its one string that quotes the owner's old column default, and wave 13s is to list the file in tests/moved/13s.txt (the coordinator, message 71-q69FV3L2-).
  'tests/a-deep-link-reads-its-project-first.test.ts',
  'tests/a-direction-can-be-shelved.test.ts',
  'tests/a-file-block-is-drawn-as-a-file.test.ts',
  'tests/a-fork-says-who-may-settle-it.test.ts',
  'tests/a-fresh-office-copies-the-default-regulations.test.ts',
  'tests/a-frozen-review-refusal-promises-only-what-a-review-does.test.ts',
  'tests/a-link-row-names-its-record.test.ts',
  'tests/a-picture-in-a-report-opens-large.test.ts',
  'tests/a-raise-carries-revoking-an-agents-key.test.ts',
  'tests/a-restore-keeps-the-change-logs-order.test.ts',
  'tests/a-right-click-on-a-report-picture-takes-that-picture.test.ts',
  'tests/a-role-cards-chapters-are-named-by-the-office.test.ts',
  'tests/a-run-does-not-inherit-its-agents-grant.test.ts',
  'tests/a-write-names-its-run.test.ts',
  'tests/an-agent-acts-on-the-owners-own-words.test.ts',
  'tests/an-incident-is-filed-by-a-secretary-or-the-person.test.ts',
  'tests/another-machine-is-named-by-the-person.test.ts',
  'tests/blocks-profiles.test.ts',
  'tests/every-key-records-how-it-was-proved.test.ts',
  'tests/every-window-b-step-keeps-the-ledger.test.ts',
  'tests/goals.test.ts',
  'tests/guard-registry.test.ts',
  'tests/his-list-honours-an-act-on-his-words.test.ts',
  'tests/home-builds-the-form-on-demand.test.ts',
  'tests/human-only-http.test.ts',
  'tests/migration-vocabulary.test.ts',
  'tests/one-definition-of-a-chapter.test.ts',
  'tests/one-message-pool.test.ts',
  'tests/one-notebook-for-one-secretary.test.ts',
  'tests/patch.test.ts',
  'tests/priority-is-several-facts.test.ts',
  'tests/restore-command.test.ts',
  'tests/restore-semantics.test.ts',
  'tests/revision-ledger.test.ts',
  'tests/server-refusal-inventory.ts',
  'tests/sql-comments.ts',
  'tests/the-card-shows-the-notebooks-numbers.test.ts',
  'tests/the-default-set-is-made-from-the-chapter-records.test.ts',
  'tests/the-family-lists-share-one-design.test.ts',
  'tests/the-kinds-examples-name-no-home.test.ts',
  'tests/the-person-writes-first-in-the-notebook.test.ts',
  'tests/the-renamed-words-are-read-as-the-new-ones.test.ts',
  'tests/the-review-ring-stays-over-the-bar-and-the-strips.test.ts',
  'tests/the-revoke-press-reaches-an-act-made-under-a-period.test.ts',
  'tests/the-secretary-reads-its-notebook-first.test.ts',
  'tests/the-secretary-takes-its-own-entry-out.test.ts',
  'tests/the-wire-carries-structure.test.ts',
  'tests/the-workspace-notes-name-the-route-that-moves-a-record.test.ts',
  'tests/validate.test.ts',
  'tests/viz.test.ts',
  'tests/what-a-link-may-join-and-what-it-records.test.ts',
  'tests/what-the-office-keeps-is-the-persons-setting.test.ts',
  'tests/who-settles-a-fork.test.ts',
]

/**
 * Every listed path with the list it is in: MOVED first, then each list in tests/moved/ by its name. A line
 * that starts with # is not a path: a list's done line is read by theListsDone, and any other is refused.
 * tests/moved/whose-file.ts reads the lists through this, so the lists are read in one place.
 */
export function theListings(repo: string = REPO): { path: string; list: string }[] {
  const listings = MOVED.map((path) => ({ path, list: MOVED_IS }))
  const folder = join(repo, THE_WAVES_LISTS)
  for (const name of readdirSync(folder).filter((one) => one.endsWith('.txt')).sort()) {
    const list = `${THE_WAVES_LISTS}/${name}`
    for (const line of readFileSync(join(folder, name), 'utf8').split('\n')) {
      if (line.trim() !== '' && !line.trim().startsWith('#')) listings.push({ path: line.trim(), list })
    }
  }
  return listings
}

/** The lists whose pronoun slice is done: MOVED when MOVED_IS_DONE, then each list whose first line is A_DONE_LIST_BEGINS. */
export function theListsDone(repo: string = REPO): string[] {
  const done = MOVED_IS_DONE ? [MOVED_IS] : []
  const folder = join(repo, THE_WAVES_LISTS)
  for (const name of readdirSync(folder).filter((one) => one.endsWith('.txt')).sort()) {
    if (readFileSync(join(folder, name), 'utf8').split('\n')[0] === A_DONE_LIST_BEGINS) done.push(`${THE_WAVES_LISTS}/${name}`)
  }
  return done
}

/** Every file that has moved, from MOVED and every wave list, sorted and without repeats. */
export function theMovedFiles(repo: string = REPO): string[] {
  return [...new Set(theListings(repo).map((one) => one.path))].sort()
}

/** One sentence for each path listed more than once and each listed path that is not a file, naming the lists. */
export function whatIsWrongWithTheLists(repo: string = REPO): string[] {
  const listings = theListings(repo)
  const wrong: string[] = []
  for (const path of theMovedFiles(repo)) {
    const lists = listings.filter((one) => one.path === path).map((one) => one.list)
    if (lists.length > 1) wrong.push(`${path} is listed more than once: in ${lists.join(' and in ')}.`)
  }
  for (const { path, list } of listings) {
    if (!existsSync(join(repo, path))) wrong.push(`${list} names ${path}, which is not a file.`)
  }
  const folder = join(repo, THE_WAVES_LISTS)
  for (const name of readdirSync(folder).filter((one) => one.endsWith('.txt')).sort()) {
    readFileSync(join(folder, name), 'utf8')
      .split('\n')
      .forEach((line, at) => {
        if (!line.trim().startsWith('#') || (at === 0 && line === A_DONE_LIST_BEGINS)) return
        wrong.push(
          `${THE_WAVES_LISTS}/${name}, line ${String(at + 1)}, starts with # but is not the done line. A list says it is done only on its first line, in exactly these words: ${A_DONE_LIST_BEGINS}`,
        )
      })
  }
  return wrong
}

/**
 * The lists in tests/moved/ that once said they were done and no longer do (wave 13j, round 41). A list that
 * loses its done line drops out of theListsDone without a word, and the pronoun gate stops reading its files.
 * So a list whose done line is in its git history, and is not its first line now, is named here, and the
 * test of the lists fails. It reads the history with `git log -S`, and throws in a shallow clone or outside a
 * repository rather than answer that nothing was lost.
 */
export function theListsThatLostTheirDoneLine(repo: string = REPO): string[] {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  if (git('rev-parse', '--is-shallow-repository') !== 'false') {
    throw new Error('theListsThatLostTheirDoneLine: this is a shallow clone, so the history cannot say which lists once said they were done.')
  }
  const folder = join(repo, THE_WAVES_LISTS)
  return readdirSync(folder)
    .filter((one) => one.endsWith('.txt'))
    .sort()
    .map((name) => `${THE_WAVES_LISTS}/${name}`)
    .filter((list) => readFileSync(join(repo, list), 'utf8').split('\n')[0] !== A_DONE_LIST_BEGINS)
    .filter((list) => git('log', `-S${A_DONE_LIST_BEGINS}`, '--format=%H', '--', list) !== '')
}
