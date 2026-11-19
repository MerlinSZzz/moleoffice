// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESOLVER CANNOT WRITE CANONICAL OWNERSHIP, AND THE PROOF IS STRUCTURAL RATHER THAN A COMMENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A GREP TEST AND NOT A SENTENCE IN A HEADER
 * ---------------------------------------------------------------------------------------
 *
 * The reason is this repository's own experience: the rule
 * that the server does not spawn a process was quietly false for two months while it was only a
 * comment. So the rule that the implementation map never writes a `links` row is a walk over the
 * source.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR MECHANISMS, AND THIS FILE HOLDS THE THREE THAT ARE NOT A GATE
 * ---------------------------------------------------------------------------------------
 *
 * A.4: *"An LLM guess must not silently become canonical ownership."*
 *
 *   1. THE DATABASE REFUSES THE STRONGEST FORM OF IT. `links.from_id` and `links.to_id` are
 *      declared foreign keys to `records.id`, and a path has no record. The foreign key is asked
 *      here directly, with a real insert, because a declared constraint that is not enforced at run
 *      time is a promise rather than a mechanism — SQLite only enforces them with
 *      `PRAGMA foreign_keys` on, and this asserts which it is.
 *   3. NOTHING IN THE MAP MODULE TOUCHES `links`. The walk.
 *
 * The fourth — only a person may accept — is a gate and is driven over the real function in
 * `tests/implementation-map.test.ts`. The fifth was the reader, in the
 * implementation-provenance test, deleted on 12 November 2026.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'


let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})




describe('the database refuses it even if the code tried', () => {
  it('will not take a links row pointing at a path', () => {
    // A path is not a record, so this is the row a resolver would have to write to claim ownership.
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO links (owner_id, id, from_id, to_id, type, created_at, updated_at, created_by) ' +
            `VALUES ('${THE_TEST_OFFICES_OWNER.id}', 'l1', 'src/server/lib/records.ts', 'src/a.ts', 'implements', '2026-08-25 10:00:00', ` +
            "'2026-08-25 10:00:00', 'agent:x')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i)
  })

})
