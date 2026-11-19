// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE-CARD MIRROR SETTLES: A COPY IT HAS JUST WRITTEN READS CURRENT, AND A SECOND RUN WRITES NOTHING.
 *
 * Problem 9Y5Isyx1zzy0. On 2 October 2026 the mirror rewrote every copy on the owner's project, and
 * GET /api/roles then still read three copies out of date: the secretary's in `mustRead`, the
 * inspector's in `rung`, and the administrator's in both. Every further run rewrote the same three.
 *
 * WHY. The mirror rewrote an existing copy with a merge patch (`dataPatch`). The record door does not
 * store a null from a merge patch: a null deletes the key. Those three cards declare nulls (a `rung`
 * of null, and `mustRead.andWhatItsStarterNames` of null), so each rewrite stored them without those
 * keys, while the comparison compared the stored card exactly with the declared one. The writer and
 * the comparison read the card two ways.
 *
 * WHAT THIS FILE HOLDS THE MIRROR TO, with the real declaration, so those three cards are in it:
 *   - after the mirror rewrites copies that already exist, which is the owner's case and not a first
 *     copy, every copy reads current;
 *   - each stored card is exactly the declared card, nulls included;
 *   - a second run in a row rewrites nothing and writes no revision;
 *   - a copy somebody changed by hand still reads out of date, naming the field, and the next run
 *     puts it back and keeps the portrait its holder had.
 *
 * MUTATION, run on 2 October 2026: in src/server/api/roles.ts, put back the merge patch the mirror
 * used, `patchRecord(held.id, { dataPatch: data, title: titleFor(card), summary: card.duties }, actor)`.
 * The first case goes red naming secretary, inspector and administrator as out of date, the second
 * names the stored card missing its nulls, the third names the three rewritten again, and the fourth
 * finds the three rewritten beside the inspector.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'

/**
 * IMPORTED AFTER THE SERVER IS BUILT. `freshDb()` resets the modules, so a static import here would be
 * a second copy of the reader holding a declaration the server does not serve. The same reason is
 * written out at length in tests/a-role-card-is-readable-in-mole-office.test.ts.
 */
let reader: typeof import('../src/server/lib/roles.ts')

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** Everything the boot hands the reader, so a re-read in a test is the read the server makes. */
const GUARD_ACTS: (string | null)[] = ['decision.write', 'fork.settle', 'fork.replace', 'fork.reopen', 'fork.remove', 'act.revoke', 'ask.remove', 'plan.commit', 'direction.shelve', 'goal.confirm', 'import.accept', 'implementation.accept', 'office.scene-settings.change', 'regulation.revoke', 'module-graph.arrange', 'fork.pin', 'fork.reclassify', 'plan.shape', 'workdomain.change', 'implementation.retire', 'repository.repoint', 'restriction.dismiss', 'block.method.change']

/** The three cards the owner's project could not settle. */
const THE_THREE = ['secretary', 'inspector', 'administrator']

interface CopyRow {
  role: string
  record: string | null
  state: string
  differsIn: string[]
}

interface MirrorReply {
  written: string[]
  rewritten: string[]
  alreadyCurrent: string[]
}

const made: string[] = []

async function readRoles(): Promise<{ mirror: CopyRow[]; cards: Record<string, unknown>[]; personCards: Record<string, unknown>[] }> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles' })
  expect(reply.statusCode).toBe(200)
  return reply.json()
}

async function mirror(): Promise<MirrorReply> {
  const reply = await app.inject({ method: 'POST', url: '/api/roles/mirror', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as MirrorReply
}

function revisionsOf(id: string): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
}

/** The copies that do not read current, with what each differs in, so a failure names them. */
function notCurrent(rows: CopyRow[]): CopyRow[] {
  return rows.filter((one) => one.state !== 'current')
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  reader = await import('../src/server/lib/roles.ts')

  // THE OWNER'S CASE IS A REWRITE, NOT A FIRST COPY. A first copy is created whole and always read
  // current; the fault was in rewriting a copy that already existed. So the copies are made, then
  // every card is changed in a declaration put in front of the server, the mirror rewrites all of
  // them, and the real declaration comes back. The case below then runs the mirror over copies that
  // exist and differ from the real cards, which is what the owner's project ran.
  await mirror()
  const decl = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  for (const card of [...decl.cards, ...decl.personCards]) card.duties = `${card.duties} (changed for this test)`
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-mirror-settles-'))
  made.push(dir)
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS, file })
  await mirror()
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS })
})

afterAll(async () => {
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS })
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the mirror settles on the real declaration', () => {
  it('reads every copy current straight after it rewrote them', async () => {
    // THE REAL DECLARATION HOLDS THE THREE CARDS, AND A NULL. Without them this case would pass for
    // the wrong reason, so it says so instead.
    const before = await readRoles()
    const declared = [...before.cards, ...before.personCards]
    for (const name of THE_THREE) {
      expect(declared.map((one) => one['name']), `the declaration has no ${name} card`).toContain(name)
    }
    expect(
      declared.some((one) => JSON.stringify(one).includes('null')),
      'no declared card holds a null, so this file no longer tests what lost the nulls',
    ).toBe(true)
    expect(notCurrent(before.mirror).map((one) => one.role), 'the copies were not out of date before the run').toEqual(
      declared.map((one) => one['name']),
    )

    const done = await mirror()
    expect(done.rewritten).toEqual(declared.map((one) => one['name']))
    const after = await readRoles()
    expect(notCurrent(after.mirror), `out of date straight after the mirror rewrote them: ${JSON.stringify(notCurrent(after.mirror))}`).toEqual([])
  })

  it('stores each card exactly as the declaration holds it, nulls included', async () => {
    const said = await readRoles()
    for (const card of [...said.cards, ...said.personCards]) {
      const row = said.mirror.find((one) => one.role === card['name'])
      const stored = t.api.getRecord(String(row?.record))?.data['card']
      // Source marks the response; it is not a field of the card kept in its declaration or mirror.
      const { source, ...declaredCard } = card
      expect(source).toBe('built-in')
      expect(stored, `the ${String(card['name'])} copy is not the declared card`).toStrictEqual(declaredCard)
    }
  })

  it('rewrites nothing on a second run in a row, and writes no revision', async () => {
    const ids = (await readRoles()).mirror.map((one) => String(one.record))
    const revisions = ids.map(revisionsOf)
    const done = await mirror()
    expect(done.rewritten, 'the second run rewrote these').toEqual([])
    expect(done.written).toEqual([])
    expect(done.alreadyCurrent).toEqual(['worker', 'supervisor', 'secretary', 'inspector', 'administrator'])
    expect(ids.map(revisionsOf), 'a run that changed nothing wrote a revision').toEqual(revisions)
    expect(notCurrent((await readRoles()).mirror)).toEqual([])
  })
})

describe('a copy changed by hand still reads out of date', () => {
  it('names the field somebody changed and the key somebody added, and the next run puts them back', async () => {
    const said = await readRoles()
    const row = said.mirror.find((one) => one.role === 'inspector')
    const id = String(row?.record)
    const portrait = t.api.getRecord(id)?.data['portrait']
    expect(typeof portrait, 'the copy has no portrait to keep').toBe('string')

    // BY HAND, THROUGH THE ORDINARY RECORD DOOR, as a person editing the copy would.
    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { card: { duties: 'Somebody wrote this by hand.', addedByHand: 'A key the card does not have.' } } },
    })
    expect(edit.statusCode, edit.body).toBe(200)

    const stale = (await readRoles()).mirror.find((one) => one.role === 'inspector')
    expect(stale?.state).toBe('out of date')
    expect(stale?.differsIn).toContain('duties')
    expect(stale?.differsIn).toContain('addedByHand, which the card no longer has')

    const done = await mirror()
    expect(done.rewritten).toEqual(['inspector'])
    const after = await readRoles()
    expect(notCurrent(after.mirror), `still out of date after the mirror put it back: ${JSON.stringify(notCurrent(after.mirror))}`).toEqual([])
    expect(t.api.getRecord(id)?.data['portrait'], 'the rewrite took off the portrait its holder had').toBe(portrait)
    expect((await mirror()).rewritten).toEqual([])
  })
})
