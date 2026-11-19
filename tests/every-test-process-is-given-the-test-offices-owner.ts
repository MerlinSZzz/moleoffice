// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY TEST PROCESS IS GIVEN THE TEST OFFICE'S OWNER, AND THIS IS THE ONE PLACE THAT GIVES IT.
 *
 * Since 30 September 2026 the product names no owner, by two decisions, the second holding
 * FLO-14. Who owns an office is a setting in its own
 * database, written at the first migrate from MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME. So
 * every test process gets those two settings here, set the way an installer's .env sets them, from
 * THE_TEST_OFFICES_OWNER in tests/the-test-offices-owner.ts, and @shared/person.ts is told the same
 * owner. liveApp hands its servers this process's environment, so every test office it starts has this
 * owner, and its pages draw this owner's id and name
 * (tests/a-test-office-draws-no-machine-name.test.ts).
 * Nothing in src/ names the owner.
 *
 * THIS FILE RUNS BEFORE EVERY TEST FILE, SO IT LOADS TWO MODULES THAT IMPORT NOTHING. The office's id
 * and the owner the server said, which a page component asks for, are given by
 * tests/a-page-of-a-test-office.ts, with the word tables it loads. A test file that needs them imports
 * that file itself.
 *
 * A test that means a fresh office, owned by nobody named, takes the two variables out of its own
 * child's environment, as tests/a-fresh-clone-names-nobody.test.ts does.
 *
 * vitest.config.ts names this file under `setupFiles`, after the file that takes the agent's variables
 * out, so it runs in each test process before the test file is collected.
 */
import { theOwnerIsKnown } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'

export { THE_TEST_OFFICES_OWNER }

theOwnerIsKnown(THE_TEST_OFFICES_OWNER.id)
process.env.MOLE_OFFICE_OWNER_ID = THE_TEST_OFFICES_OWNER.id
process.env.MOLE_OFFICE_OWNER_NAME = THE_TEST_OFFICES_OWNER.name
