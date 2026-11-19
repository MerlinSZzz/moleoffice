// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Who may apply a durable import over HTTP.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/import` took no actor at all. The handler's first parameter was named `_req` and was
 * never read, so a body-less POST from anything that could reach the port replaced every authored
 * row in the database — every record, every link, every change row, including every `decision`,
 * which is the one kind `HUMAN_ONLY_KINDS` exists to protect. Attributed to nobody.
 *
 * It was the cheapest possible bypass of the only access control this product has. Guarding
 * `deleteRecord` and `restoreRecord` — done twice in one week here, once after an audit and once
 * after a route was found reaching its no-op shortcut before the guard — means nothing while one
 * unauthenticated POST rewrites the same rows wholesale.
 *
 * It was found by an adversary attacking from outside, not by the suite, and not by anybody reading
 * the file: from inside, a route that simply never mentions an actor looks like a route that has
 * nothing to do with actors.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TESTS GO THROUGH HTTP
 * ---------------------------------------------------------------------------------------
 *
 * Because the boundary is HTTP, deliberately. `applyImport()` stays callable without an actor, so
 * that `scripts/import.ts` and `scripts/restore-check.ts` keep working — those are run by an
 * operator at a terminal who already holds the database file, and a guard there would protect
 * nothing from anybody. A test calling the library would therefore prove the opposite of what is
 * wanted. The request is the thing under test.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HUMAN_ONLY_KINDS } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let built: Awaited<ReturnType<typeof apiApp>>
let app: Awaited<ReturnType<typeof apiApp>>['app']

beforeEach(async () => {
  db = await freshDb()
  built = await apiApp()
  app = built.app
})

afterEach(async () => {
  await app.close()
  db.close()
})

const post = (headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/import', headers })

describe('applying an import over HTTP is a human-only act', () => {
  it('refuses an agent', async () => {
    const res = await post({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' })
    expect(res.statusCode, res.body).toBe(403)
    // The refusal names who was refused and what kind of thing is being protected, because an
    // agent learns what it may do from what it is told, and a bare 403 sends it looking for a
    // permission endpoint that has never existed.
    expect(res.body).toContain('claude-code')
    expect(res.body).toContain(HUMAN_ONLY_KINDS[0] as string)
  })

  it('refuses a system actor as well as an agent', async () => {
    // The rule is written as "not human" rather than "is an agent". scripts/reindex.ts already
    // writes as a system actor, so a condition narrowed to `agent` would leave this route open to
    // exactly the caller most likely to be automated.
    const res = await post({ 'x-mole-office-actor-type': 'system', 'x-mole-office-actor-id': 'reindex-script' })
    expect(res.statusCode, res.body).toBe(403)
  })

  it('refuses an EMPTY actor type rather than reading it as human', async () => {
    // The sibling defect, found in the same sweep: a header that is present and blank used to be
    // truthy-tested and fall through to the human default. A client building headers from an unset
    // variable produces exactly this.
    const res = await post({ 'x-mole-office-actor-type': '', 'x-mole-office-actor-id': 'whoever' })
    expect(res.statusCode, res.body).not.toBe(200)
  })

  it('refuses a MISSPELT actor header rather than reading it as human', async () => {
    // `x-mole-office-actor` instead of `x-mole-office-actor-type`. I made this exact mistake by hand
    // while testing the guard on another route — under the old `x-panelx-` prefix, where it was the
    // same dropped `-type` — and the request was silently promoted to human.
    const res = await post({ 'x-mole-office-actor': 'agent', 'x-mole-office-actor-id': 'claude-code' })
    expect(res.statusCode, res.body).not.toBe(200)
  })

  it('writes nothing when it refuses', async () => {
    const before = db.api.listRecords({ workspaceId: 'default', includeDeleted: true }).length
    const changesBefore = db.api.listChanges({ workspaceId: 'default' }).length

    await post({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' })

    // A refusal that had already replaced half the tables would be worse than no refusal, because
    // the reply would say one thing and the database another.
    expect(db.api.listRecords({ workspaceId: 'default', includeDeleted: true }).length).toBe(before)
    expect(db.api.listChanges({ workspaceId: 'default' }).length).toBe(changesBefore)
  })

  it('lets the human through to the import itself', async () => {
    // The other half, and it matters: a guard that refused everybody would pass every test above
    // while making restore-from-backup impossible over HTTP.
    //
    // There is no archive on disk in a fresh test database, so the import cannot SUCCEED here. What
    // this asserts is that the human gets past the GUARD — the reply is about the archive, not about
    // permission. Anything but 403 proves that.
    const res = await post({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id })
    expect(res.statusCode).not.toBe(403)
  })

  it('leaves the dry run readable by anybody', async () => {
    // GET writes nothing, so it stays open. Refusing it would make an agent unable to find out what
    // an import WOULD do, which is the reply that exists to stop anybody pressing the other button
    // blind.
    const res = await app.inject({
      method: 'GET',
      url: '/api/import',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(res.statusCode, res.body).toBe(200)
  })
})
