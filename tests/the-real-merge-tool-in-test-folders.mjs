#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REAL MERGE TOOL, RUN IN A TEST'S OWN FOLDERS. SYNTHETIC, FOR
 * tests/the-merge-tool-outlives-an-office-restart.test.ts ONLY.
 *
 * The message worker starts the merge tool with four words of its own (--entry, --session, --api and
 * --workspace) and never with --sandbox-tool. That test names this file in MOLE_OFFICE_FAKE_MERGE_TOOL,
 * so the worker starts this file with those four words. This file then runs the real
 * tools/the-merger.mjs with every word it was given, and adds these:
 *
 *   --sandbox-tool  tests/stand-in-sandbox-tool-that-files-rows.mjs, so no container is started
 *   --workdir       <RESTART_TEST_BASE>/work/<entry>, so nothing is written under ~/.cache
 *   --sandboxes     <RESTART_TEST_BASE>/sandboxes
 *   --slot-every 1, --office-for 120 and --health-for 60, so the test's waits are short
 *
 * The worker gives a run no MOLE_OFFICE_ setting except the office's address and project. So the
 * test's folder comes in RESTART_TEST_BASE, and its database in RESTART_TEST_DB. The tool gets that
 * database as MOLE_OFFICE_DB only to find the test office's key file beside it. On the owner's
 * machine the tool finds the live office's key file with no setting at all. The tool's own commits go at
 * the test address in MOLE_OFFICE_COMMIT_EMAIL (tests/the-test-commit-address.mjs), and not at its placeholder default.
 *
 * The tool runs in this process's group, so the worker's stop by group reaches it. Its output goes
 * where this file's goes, and this file exits with the tool's own code.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'

const base = process.env['RESTART_TEST_BASE']
const db = process.env['RESTART_TEST_DB']
if (!base || !db) {
  process.stderr.write('the-real-merge-tool-in-test-folders.mjs: RESTART_TEST_BASE and RESTART_TEST_DB must both be set. Nothing was started.\n')
  process.exit(2)
}
const given = process.argv.slice(2)
const entry = given[given.indexOf('--entry') + 1]
const checkout = fileURLToPath(new URL('..', import.meta.url))
const child = spawn(
  process.execPath,
  [
    join(checkout, 'tools', 'the-merger.mjs'),
    ...given,
    '--sandbox-tool', join(checkout, 'tests', 'stand-in-sandbox-tool-that-files-rows.mjs'),
    '--workdir', join(base, 'work', entry),
    '--sandboxes', join(base, 'sandboxes'),
    '--slot-every', '1',
    '--office-for', '120',
    '--health-for', '60',
  ],
  // THE BUS LEAVES AT ONCE in these tests: its 30-minute wait for riders is not what they are about.
  { stdio: 'inherit', env: { ...process.env, MOLE_OFFICE_DB: db, MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '0', MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS } },
)
child.on('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)))
