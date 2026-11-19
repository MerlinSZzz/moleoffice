// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FOLDER SHAPED LIKE A DEVELOPER'S CHECKOUT, FOR A TEST THAT STARTS A RUN.
 *
 * `startOne` (src/worker/index.ts) starts a run in `settings.checkout`, and first writes there the rules
 * file the run's tool reads (`writeRulesInto`, src/worker/rules.ts). With MOLE_OFFICE_FAKE_RUNTIME set,
 * that file is `AGENTS.md`. A test that gave its worker this worktree left `AGENTS.md` at the worktree's
 * root, and a Codex or OpenCode session started there afterwards read it as its rules. A test gives its
 * worker this folder instead, and tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts holds every
 * test to that.
 *
 * WHAT IS COPIED FROM THIS WORKTREE, each file for one reason:
 *
 *   - `CLAUDE.md`: the general rules, the first part of what a run is given. Its developer heading makes
 *     the rules writer read the folder as a developer checkout. So a run is written `AGENTS.md` alone,
 *     and a Claude Code run is written no file.
 *   - `src/config/rules/USER.md`: the part for every agent, which `CLAUDE.md` takes in by reference.
 *   - `.claude/skills/mole-office/SKILL.md`: the skill sections the rules file carries, and the section
 *     `howToLead` gives a run.
 *
 * WHAT THE FOLDER IS NOT:
 *
 *   - Not a git repository, and none is above it. So the rules writer never asks git whether the file
 *     it writes is tracked, and `refuseAWorkingDirectory` allows the folder because it is the checkout
 *     itself.
 *   - Not a copy of the code. It holds no tools/, so a test that starts the merge tool or the launcher
 *     names a fake script for it. It holds no chapters.json, because the office gives each run its
 *     chapters.
 *   - Not where a test reads the rules from. A test that compares what a run was given with the rules
 *     still reads them from this worktree.
 *
 * It is made by `aTestDatabaseFolder` in the temporary directory, and removed when the process ends.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RULES_SOURCE, SKILL_SOURCE, USER_PART_SOURCE } from '../src/worker/rules.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const THIS_WORKTREE = fileURLToPath(new URL('..', import.meta.url))

/** A new folder outside this worktree, holding the three files above and nothing else. */
export function aCheckoutForATestRun(): string {
  const folder = aTestDatabaseFolder('run-checkout')
  for (const file of [RULES_SOURCE, USER_PART_SOURCE, SKILL_SOURCE]) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    copyFileSync(join(THIS_WORKTREE, file), join(folder, file))
  }
  return folder
}
