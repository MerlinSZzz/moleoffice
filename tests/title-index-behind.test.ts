// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CALLER IS TOLD WHEN THE DATABASE STILL CARRIES THE OLD UNIQUE INDEX ON (workspace_id, title).
 *
 * `records_title_idx` was `CREATE UNIQUE INDEX` from the first migration until 17 August 2026. The
 * migration `drizzle/0030_titles_may_repeat` makes it a plain index, because the owner settled that
 * an id is identity and a title is presentation. Every title-to-record lookup was made to refuse an
 * ambiguous name first, and only then was the constraint dropped.
 *
 * SO SQLITE CAN ONLY REFUSE A REPEATED TITLE ON A DATABASE THAT HAS NOT HAD THAT MIGRATION APPLIED,
 * and `constraintMessage` in src/server/lib/http.ts is the one place that says so. The branch is
 * unreachable on an up-to-date database, which is exactly why it needs a test: nothing else would
 * ever run it, and the sentence it prints is a diagnosis. It used to read "Titles are unique because
 * typing a title is how you link to something", which is now false and sends the reader looking for
 * a mistake in their own request instead of at their database.
 *
 * The old index is put back here by hand. That is the only way to reach the branch, and it is
 * honest about what it is doing rather than mocking the error.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** File a module and hand back the whole response. */
async function file(title: string) {
  return await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AGENT,
    payload: {
      kind: 'module',
      title,
      data: { context: 'Something the wrist camera cannot see without.', parts: [] },
    },
  })
}

describe('a database that has not had drizzle/0030_titles_may_repeat applied', () => {
  it('says the migration is missing and names the command, rather than blaming the request', async () => {
    // Put the pre-0030 constraint back. Nothing else can reach the branch under test, and it goes
    // on while the table is empty because a UNIQUE index cannot be built over rows that repeat.
    t.client.sqlite.exec('DROP INDEX records_title_idx')
    t.client.sqlite.exec('CREATE UNIQUE INDEX records_title_idx ON records (workspace_id, title)')

    expect((await file('Tray clamp')).statusCode).toBe(201)
    const refused = await file('Tray clamp')

    expect(refused.statusCode, refused.body).toBe(409)
    const said = String((JSON.parse(refused.body) as { error: unknown }).error)
    // The conclusion, first: it is the database that is behind, not the request that is wrong.
    expect(said).toContain('This database still refuses two records with the same title')
    // Which migration, and the command that applies it.
    expect(said).toContain('drizzle/0030_titles_may_repeat')
    expect(said).toContain('npm run db:migrate')
    // And the promise the product no longer keeps must not be made again.
    expect(said).not.toContain('Titles are unique')
  })

  it('stores the second record once the migration has been applied, which is why the branch is unreachable', async () => {
    // The shape `0030_titles_may_repeat` leaves: the same index, over the same two columns, without
    // the word UNIQUE. The same request that was refused above is now stored.
    t.client.sqlite.exec('DROP INDEX records_title_idx')
    t.client.sqlite.exec('CREATE INDEX records_title_idx ON records (workspace_id, title)')

    const stored = await file('Tray clamp')
    expect(stored.statusCode, stored.body).toBe(201)
    // And Mole Office says what else answers to the name instead of refusing to store it.
    const reply = JSON.parse(stored.body) as { sameTitle?: { id: string }[] }
    expect(reply.sameTitle?.length).toBeGreaterThan(0)
  })
})
