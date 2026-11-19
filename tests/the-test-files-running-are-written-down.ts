// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RECORD PER RUN OF THE TESTS OF WHICH TEST FILE RAN WHEN, FOR THE GUARD OF THE WORKTREE'S RULES FILE.
 *
 * vitest.config.ts names this file under `globalSetup`. vitest runs it once, in its own process, before
 * any test file starts. It makes one folder for this run, hands its path to every test process as
 * `theTestFilesRunning`, and removes the folder when the run ends. Each test process appends its file's
 * start and end there (tests/a-test-leaves-the-worktrees-rules-file-alone.ts), so a failure can name every
 * test file that was running when the rules file changed. The folder is made by tests/a-test-folder.ts,
 * so a run killed before its end leaves a folder the next run sweeps a day later.
 */
import type { TestProject } from 'vitest/node'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

export default function theTestFilesRunningAreWrittenDown(project: TestProject): () => void {
  const folder = aTestDatabaseFolder('test-files-running')
  project.provide('theTestFilesRunning', folder)
  return () => removeThisTestFolder(folder)
}
