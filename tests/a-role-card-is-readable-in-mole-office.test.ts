// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD IS READABLE INSIDE MOLE OFFICE, AND THE COPY SAYS WHEN IT NO LONGER MATCHES.
 *
 * Criterion P12 of design/permissions/ACCEPTANCE.md, which first sums up the role cards needed now:
 * *Each of the cards is one thing a person can read, and the card
 * and the enforcement cannot disagree. Measured by mutation: change what a role may do in the
 * declaration without changing the card, and a test goes red.*
 *
 * THE CARD AND THE ENFORCEMENT ARE ONE FILE, so they cannot disagree by construction: the gate reads
 * `design/permissions/roles.json` and so does the card a person reads. What CAN disagree is the copy
 * filed as a record — which exists because the owner's standing rule is that writing meant for the owner is
 * published inside Mole Office rather than in a file the owner has to open a checkout for. So the mutation
 * this criterion asks for is done here on the copy: change the declaration, leave the copy, and the
 * product says the copy is out of date and names the field.
 *
 * THE COPY GRANTS NOTHING, and that is proved too. A record saying a worker may do something is not
 * a worker being allowed to do it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import { THE_MAILER_CARD_THAT_LEFT, THE_SUMMONS_POWER_THAT_LEFT } from './the-mailer-card-that-left.ts'

/**
 * THE READER IS IMPORTED AFTER THE SERVER IS BUILT, AND NOT AT THE TOP OF THIS FILE.
 *
 * `freshDb()` calls `vi.resetModules()`, and `buildApp` reaches lib/roles.ts through a dynamic
 * import inside itself. A static import up here would therefore be a DIFFERENT INSTANCE of that
 * module, with its own held declaration: this file would change a set of cards nothing was serving,
 * every assertion about a stale copy would pass for the wrong reason, and the server would go on
 * enforcing the cards on disk. That happened, and it is the sort of test that looks like it works.
 */
let reader: typeof import('../src/server/lib/roles.ts')

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Everything the boot hands the reader, so a re-read in a test is the read the server makes. */
const GUARD_ACTS: (string | null)[] = ['decision.write', 'fork.settle', 'fork.replace', 'fork.reopen', 'fork.remove', 'act.revoke', 'ask.remove', 'plan.commit', 'direction.shelve', 'goal.confirm', 'import.accept', 'implementation.accept', 'office.scene-settings.change', 'regulation.revoke', 'module-graph.arrange', 'fork.pin', 'fork.reclassify', 'plan.shape', 'workdomain.change', 'implementation.retire', 'repository.repoint', 'restriction.dismiss', 'block.method.change']

async function readRoles(): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles' })
  expect(reply.statusCode).toBe(200)
  return reply.json() as Record<string, unknown>
}

async function mirror(): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: '/api/roles/mirror', headers: AS_THE_PERSON })
  expect(reply.statusCode).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The folders `declareWith` made, each holding one changed declaration. Removed after all. */
const made: string[] = []

/** Put a changed declaration in front of the running server, the way editing the file would. */
function declareWith(change: (decl: RolesDeclaration) => void): void {
  const decl = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  change(decl)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-roles-'))
  made.push(dir)
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS, file })
}

function backToTheRealCards(): void {
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS })
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the cards name their chapters from the office's own
  // chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  const built = await apiApp()
  app = built.app
  await app.ready()
  // AFTER `apiApp()`, so this is the instance `buildApp` loaded and holds its declaration.
  reader = await import('../src/server/lib/roles.ts')
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'w-one', name: 'Worker One', role: 'worker' },
  })
})

afterAll(async () => {
  backToTheRealCards()
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the cards are readable in the product', () => {
  it('serves every card, with the chapter list and where the declaration lives', async () => {
    const said = await readRoles()
    expect((said['cards'] as { name: string }[]).map((one) => one.name)).toEqual([
      'worker',
      'supervisor',
      'secretary',
      'inspector',
      // THE MAILER, a tool's card from a decision, is not here:
      // the mailer card left on 1 October 2026, and another decision makes the mail tool the owner's
      // own tool, not an agent or a role card.
    ])
    expect(String(said['declaredIn'])).toContain('roles.json')
    const declared = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
    expect((said['chapters'] as { number: number }[]).map((one) => one.number)).toEqual(declared.chapters.map((one) => one.number))
  })

  it('says no card has been copied here yet, rather than an empty list saying nothing', async () => {
    const said = await readRoles()
    expect((said['mirror'] as { state: string }[]).every((one) => one.state === 'not copied yet')).toBe(true)
    // SIX SINCE 27 SEPTEMBER 2026: the five an agent holds, the mailer the fifth, and the one a person holds.
    // Criterion P45: a person has a role card too. The two are
    // separate lists in the declaration and one list here, because copying and reading are the same
    // job for both. FIVE SINCE 1 OCTOBER 2026: the mailer card left.
    expect(String(said['mirrorSays'])).toContain('5 of 5 cards have no current copy')
  })

  it('copies every card into the project, and says what it did', async () => {
    const done = await mirror()
    // The four an agent holds, then the one a person holds. Criterion P45.
    expect(done['written']).toEqual(['worker', 'supervisor', 'secretary', 'inspector', 'administrator'])
    expect(done['rewritten']).toEqual([])
    const said = await readRoles()
    expect((said['mirror'] as { state: string }[]).every((one) => one.state === 'current')).toBe(true)
    expect(String(said['mirrorSays'])).toContain('every copy matches')
  })

  it('writes nothing the second time, rather than reporting a write that did not happen', async () => {
    const done = await mirror()
    expect(done['written']).toEqual([])
    expect(done['rewritten']).toEqual([])
    expect(done['alreadyCurrent']).toEqual([
      'worker', 'supervisor', 'secretary', 'inspector', 'administrator',
    ])
  })

  it('files each copy as a record a person can open', async () => {
    const said = await readRoles()
    const one = (said['mirror'] as { role: string; record: string | null }[]).find((row) => row.role === 'worker')
    const record = t.api.getRecord(String(one?.record))
    expect(record?.kind).toBe('role_card')
    expect(record?.title).toBe('The worker role card')
    expect((record?.data['card'] as { name: string }).name).toBe('worker')
  })
})

describe('a copy that no longer matches the declaration says so, and names the field', () => {
  it('is the mutation this criterion asks for: change the declaration, leave the copy', async () => {
    // MOVING A POWER DOWN THE TREE, which is what a change to what a role may do looks like now.
    // Criterion P57: the worker's step gains Groups and dispatch, so the gate lets a worker open a
    // group, and the copy of the worker card — which was written with the names filled in — says it
    // is out of date. Its duties change too, so the copy is stale in a field the tree did not touch
    // as well as in one it did.
    declareWith((decl) => {
      // The worker's step gains Groups and dispatch, from whichever step holds it. Found by the
      // power rather than by a rung number, so moving a rung does not silently make this a no-op.
      const from = decl.tree.find((step) => step.adds.includes('Groups and dispatch'))
      const worker = decl.tree.find((step) => step.rung === 1)
      if (from === undefined || worker === undefined) throw new Error('the tree has no Groups and dispatch')
      from.adds = from.adds.filter((one) => one !== 'Groups and dispatch')
      worker.adds = [...worker.adds, 'Groups and dispatch']
      const card = decl.cards.find((one) => one.name === 'worker')
      if (card === undefined) throw new Error('no worker card')
      card.duties = 'It opens a group now, which is what this mutation changed.'
    })
    const said = await readRoles()
    const one = (said['mirror'] as { role: string; state: string; differsIn: string[] }[]).find((row) => row.role === 'worker')
    expect(one?.state).toBe('out of date')
    expect(one?.differsIn).toContain('duties')
    expect(one?.differsIn).toContain('powers')
    expect(String(said['mirrorSays'])).toContain('worker (out of date)')
    expect(String(said['mirrorSays'])).toContain('a stale reading and not a stale rule')
  })

  it('is the declaration that is enforced while the copy is stale, not the copy', async () => {
    // The declaration's tree now puts Groups and dispatch on the worker's step, and the declaration
    // is what the gate reads. This is the whole reason the copy is called a copy.
    const reply = await app.inject({ method: 'POST', url: '/api/groups', headers: asAgent('w-one'), payload: { title: 'A group' } })
    expect(reply.statusCode, 'the stale copy was enforced instead of the declaration').not.toBe(403)
  })

  it('rewrites only the cards that changed when the mirror is run again', async () => {
    // ONE OF THE SIX, AND WHICH ONE IS THE TREE ANSWERING. The mutation gave the worker's step a
    // power the supervisor's step used to add, so the worker's card changed. The supervisor and the
    // secretary hold the same SET either way — a step holds everything below it — and the copy lists
    // powers in the declaration's order rather than the tree's, so neither of those copies changed
    // by a character. The inspector is off the tree and the administrator is a person's card. The
    // mailer, off the tree too, left the declaration on 1 October 2026.
    const done = await mirror()
    expect(done['rewritten']).toEqual(['worker'])
    expect(done['written']).toEqual([])
    expect(done['alreadyCurrent']).toEqual(['supervisor', 'secretary', 'inspector', 'administrator'])
    const said = await readRoles()
    const stale = (said['mirror'] as { role: string; state: string; differsIn: string[] }[]).filter(
      (one) => one.state !== 'current',
    )
    // NAMING WHAT IS STALE RATHER THAN SAYING `false`. A copy that will not come current is a fault
    // in the mirror, and a bare boolean sends the next reader to find out which card and which field.
    expect(stale, `still stale after the mirror ran: ${JSON.stringify(stale)}`).toEqual([])
  })

  it('goes back to saying out of date when the declaration goes back', async () => {
    backToTheRealCards()
    const said = await readRoles()
    const one = (said['mirror'] as { role: string; state: string }[]).find((row) => row.role === 'worker')
    expect(one?.state).toBe('out of date')
    await mirror()
    expect(((await readRoles())['mirror'] as { state: string }[]).every((row) => row.state === 'current')).toBe(true)
  })
})

/**
 * A CARD THAT LEAVES THE DECLARATION KEEPS ITS COPY, AND THE MIRROR LEAVES THAT COPY ALONE.
 *
 * A decision took the mailer card out of design/permissions/roles.json on 1 October 2026.
 * A project that had copied it still holds the copy. The mirror copies what is declared and nothing
 * else, so it neither rewrites nor deletes a copy of a card that has gone: the record keeps its id,
 * its history and its links. The read lists no row for it, because it lists the declared cards.
 */
describe('a card that leaves the declaration keeps its copy, untouched', () => {
  it('copies the mailer card while it is declared, and leaves the copy as it was after the card goes', async () => {
    declareWith((decl) => {
      decl.cards.push(THE_MAILER_CARD_THAT_LEFT)
      decl.powers.push(THE_SUMMONS_POWER_THAT_LEFT)
    })
    const first = await mirror()
    expect(first['written']).toEqual(['mailer'])
    const copy = (((await readRoles())['mirror']) as { role: string; record: string | null }[]).find((row) => row.role === 'mailer')
    const id = String(copy?.record)
    const revisions = () => (t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
    const before = { record: t.api.getRecord(id), revisions: revisions() }
    expect(before.record?.kind).toBe('role_card')

    backToTheRealCards()
    const second = await mirror()
    expect(second['written']).toEqual([])
    expect(second['rewritten']).toEqual([])
    expect(second['alreadyCurrent']).not.toContain('mailer')
    const after = t.api.getRecord(id)
    expect(after, 'the copy of the card that left was deleted').not.toBeNull()
    expect(after?.deletedAt ?? null, 'the copy of the card that left was deleted').toBeNull()
    expect(after?.data, 'the copy of the card that left was rewritten').toEqual(before.record?.data)
    expect(revisions(), 'the mirror wrote a revision on the copy of a card that left').toBe(before.revisions)
    const rows = ((await readRoles())['mirror']) as { role: string }[]
    expect(rows.map((row) => row.role), 'the read lists a card nobody declares').not.toContain('mailer')
  })
})
