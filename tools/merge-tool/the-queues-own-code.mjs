// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LIST, IN A MODULE THAT IMPORTS NOTHING, so a test can read it without starting a run. Part of the merge tool,
 * tools/the-merger.mjs, whose header names every module.
 *
 * An entry ending in `/` names a folder and covers every file under it. Any other entry names one file exactly.
 * isTheQueuesOwnCode below is the one reader of that rule.
 */
import './a-library-is-not-a-program.mjs'

/**
 * THE QUEUE'S OWN CODE: an entry that changes it is tested alone, so the queue is never tested by a suite that holds its
 * own change (the rule for the queue's own code).
 */
export const THE_QUEUES_OWN_CODE = [
  'tools/the-merger.mjs',
  'tools/merge-tool/',
  // The three files outside the tool through which git.mjs and what-a-clone-names.mjs start git on a clone in a sandbox
  // folder or read its index. A change to one changes every git command the tool runs on a folder a sandbox can write.
  'src/config/guarded-git.mjs',
  // The shared landing footer and retained histories determine what the queue replays and preserves.
  'src/shared/merge/landed-history.mjs',
  'src/config/outside-the-commit.mjs',
  'tools/sandbox-git.mjs',
  'tools/test-audit-table-markers.mjs',
  // The eight files outside the tool that the owner-content gate (owner-content.mjs) takes its patterns and lists from:
  // tests/the-owners-content-patterns.ts, which makes the patterns and which integrate loads through arguments.mjs; the
  // owner's names, handles and research words in tests/the-names-the-gates-refuse.ts; the real name in
  // tests/the-owners-copyright-line.ts and the copyright line in tests/the-copyright-line.ts; the one reader of the file
  // of the owner's content, tests/the-owners-content-list.ts; LICENSE, from which the copyright line's holder is read;
  // the shapes in tools/screen-leaks.mjs; and the reader that finds comments in tests/the-pieces-of-a-source.ts. A change
  // to one changes what the gate refuses or lets through.
  'tests/the-owners-content-patterns.ts',
  'tests/the-names-the-gates-refuse.ts',
  'tests/the-owners-copyright-line.ts',
  'tests/the-copyright-line.ts',
  'tests/the-owners-content-list.ts',
  'LICENSE',
  'tools/screen-leaks.mjs',
  'tests/the-pieces-of-a-source.ts',
  // The file outside the tool from which red-files.mjs reads when a test file passed. A change to it changes which
  // files the queue counts as red.
  'tools/a-passed-test-file.mjs',
  // The file outside the tool from which cloud-suite-door.mjs reads the box's load while the suite ran. A change to it
  // changes what the suite's line on the cloud box says.
  'tools/the-box-under-the-suite.mjs',
  // The file outside the tool from which cloud-suite-door.mjs takes where the box's startup journals lie beside a log,
  // and the check against their index that decides whether the queue keeps them. A change to it changes which of the
  // box's returned files the queue keeps beside the suite log.
  'tools/cloud-suite-journals.mjs',
  // The two files outside the tool from which arguments.mjs and the merger's start check work out the pairing (wave
  // 13q). A change to one changes which settings the tool and what it starts read, and whether the tool starts at all.
  'src/config/the-office-tool-environment.mjs',
  'src/config/stable-tag.mjs',
  // The file outside the tool from which take-back.mjs chooses the trunk. A change to it changes which commit the
  // inverse changes are built on, and whether an unknown trunk is refused.
  'src/config/inspection-base.mjs',
  // The file outside the tool from which testing.mjs takes the built-page prerequisite and gives it to plugin-lane.mjs.
  // A change to it changes whether the privacy gate can run on the integrated tree.
  'src/config/the-built-page.mjs',
  // The file outside the tool from which integrate.mjs and pairs.mjs read the markers a mutation run leaves behind.
  // A change to it changes which trees the queue refuses to integrate or test together.
  'tests/applied-mutations.ts',
  // The file outside the tool from which documents.mjs and integrate.mjs read generated paths and their patterns.
  // A change to it changes which files are regenerated before testing and which changes can carry suite evidence.
  'tools/checks/protected-areas.mjs',
  // The file outside the tool from which arguments.mjs takes the runner prerequisites, resource limits and costs and gives them to second-opinion.mjs.
  // A change to it changes whether files still red can receive a second opinion within the budget.
  'tools/modal-tests.mjs',
  // The file outside the tool from which resolve-a-conflict.mjs selects tests for the resolved paths. A change to it
  // changes which tests the tool names to check the resolution.
  'tools/related-tests.mjs',
  // The file outside the tool from which testing.mjs reads the floor of paths the suite counts as read. A change to
  // it changes which suite evidence can be carried past another change.
  'tools/what-tests-name.mjs',
  // The file outside the tool that testing.mjs runs to work out an entry's related tests. A change to it changes which
  // tests the queue runs on an entry.
  'tools/run-named-tests.mjs',
  'src/server/lib/merge-state-machine.ts',
  'src/server/lib/merge-conflict-notices.ts',
  'src/server/lib/merge-queue.ts',
  'src/server/lib/the-office-writes-into-a-sandbox.ts',
  // The mark under which the state machine asks the next-round door for a fix round itself. A change to it changes
  // which asks the door takes as the office's.
  'src/server/lib/the-office-asks-for-a-round.ts',
  // The next-round door's own functions, which the state machine calls in the office's process to ask a line's next
  // round for a fix round. A change to them changes how the queue asks, and which asks are taken.
  'src/server/lib/next-round.ts',
  // The next-round field name and reader the state machine imports, to read a run's next round when it asks. A change to
  // them changes what the queue reads of a round it asked for.
  'src/shared/next-round.ts',
  'src/shared/merge-queue.ts',
  'src/shared/whole-suite-red.ts',
  'src/shared/merge-class.ts',
  'src/config/whole-suite-red.mjs',
  // The position reader rejects invalid settings before partial coverage can authorize an entry.
  'src/config/related-tests-only.mjs',
  // The file outside the tool from which arguments.mjs reads the switch and gives it to pairs.mjs, which decides whether
  // an entry that changes the queue's own code may ride a bus. A change to it changes which entries are tested alone.
  'src/config/queue-code-rides-a-bus.mjs',
  // The positions of the integrate step's two guards with a row decide whether an entry is sent back there.
  'src/config/integration-guards.mjs',
  // The file outside the tool from which push.mjs reads the attribution pattern, which the submission door reads too.
  // A change to it changes which landed commits the tool refuses to push and which entries the queue refuses.
  'src/config/attribution-lines.mjs',
  // The restart entries define the server-start path case that requires whole-suite coverage.
  'tools/files-that-restart-the-server.mjs',
  // These words explain the queue's coverage and omissions on the tested entry.
  'src/shared/words/en-wave-13u.ts',
  'src/shared/plugin-change.ts',
  'src/shared/the-plain-privacy-files.ts',
  // The reader of a red run's failure lines, which the tool sends with each file that changed its answer or is red on
  // main, and the bound the step door checks them against.
  'src/shared/the-failure-lines-of-a-red-run.ts',
]

/** Whether a path is the queue's own code. An entry ending in `/` covers every file under that folder. */
export function isTheQueuesOwnCode(path) {
  return THE_QUEUES_OWN_CODE.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))
}
