// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST OFFICE NAMES ITS MODELS, AND THIS IS THE ONE PLACE THAT SAYS SO.
 *
 * Since 2 October 2026 the product ships no default model (FLO-05 of a decision): a run with no model named is
 * refused. Until then the settings declared 'opus' for
 * MOLE_OFFICE_AGENT_MODEL and 'sonnet' for MOLE_OFFICE_INSPECTION_MODEL, and the test files that start
 * a run through the message worker relied on them without naming a model. So every test process gets
 * those same two values, set the way an office's .env sets them, and those tests start runs as before.
 * No model is called: the runs are the fake runtime and the fake check tool.
 *
 * A test about an office that names no model hands in an environment of its own without these two,
 * as tests/a-run-the-office-starts-names-its-model.test.ts does.
 *
 * vitest.config.ts names this file under `setupFiles`, after the file that takes the agent's variables
 * out, so it runs in each test process before the test file is collected.
 */

process.env.MOLE_OFFICE_AGENT_MODEL = 'opus'
process.env.MOLE_OFFICE_INSPECTION_MODEL = 'sonnet'
