// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY APPOINT WHOM, AND WHICH RULE REFUSED. Criterion P58.
 *
 * Only the person may raise a secretary to full powers (the acting-for level), and only the person may
 * appoint a secretary. Below that, a supervisor may appoint a supervisor, and a worker may not.
 *
 * ---------------------------------------------------------------------------------------
 * THREE RULES, AND EVERY REFUSAL NAMES THE ONE IT BROKE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A card whose `appointedBy` is the person is the person's to give. No agent may give it,
 *      whatever rung it stands on. That is the secretary, and it is the inspector.
 *   2. A card whose `appoints` is nobody gives no role at all. That is the inspector, which is off
 *      the tree and starts nothing. The worker card said nobody too until 23 October 2026, when the
 *      owner decided that the cards are given by rank; it now gives a role at or below its own rung,
 *      so a worker makes a worker and nothing above it.
 *   3. Otherwise a starter gives a role AT OR BELOW its own rung. **This is the change**: it was
 *      strictly below, so a supervisor could not make a supervisor, and it must be able to.
 *
 * ALL THREE ARE READ OFF THE CARDS. `appointedBy` and `appoints` are fields in
 * design/permissions/roles.json, so who may appoint whom moves by editing that file. The last test
 * here proves that by moving one field and asking the route again.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
let reader: typeof import('../src/server/lib/roles.ts')

const GUARD_ACTS: (string | null)[] = ['decision.write', 'fork.settle', 'fork.replace', 'fork.reopen', 'fork.remove', 'act.revoke', 'ask.remove', 'plan.commit', 'direction.shelve', 'goal.confirm', 'import.accept', 'implementation.accept', 'office.scene-settings.change', 'regulation.revoke', 'module-graph.arrange', 'fork.pin', 'fork.reclassify', 'plan.shape', 'workdomain.change', 'implementation.retire', 'repository.repoint', 'restriction.dismiss', 'block.method.change']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** Register one agent under one starter, and hand back the status and what was said. */
async function register(
  starter: Record<string, string>,
  body: { handle: string; name: string; role: string },
): Promise<{ status: number; said: string }> {
  const reply = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers: starter, payload: body })
  return { status: reply.statusCode, said: String((reply.json() as { error?: unknown }).error ?? reply.body) }
}

/** Put a changed declaration in front of the running server, the way editing the file would. */
function declareWith(change: (decl: RolesDeclaration) => void): void {
  const decl = JSON.parse(readFileSync(reader.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  change(decl)
  const file = join(mkdtempSync(join(tmpdir(), 'mole-office-appoint-')), 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS, file })
}

/**
 * ONE OFFICE FOR THE FILE. The chain reaches the owner once, and each case registers the agents it
 * needs under handles of its own. beforeEach reads the real declaration again, because two cases
 * move a field on it, and afterEach puts back the one row a case changes.
 */
beforeAll(async () => {
  t = await freshDb()
  reader = await import('../src/server/lib/roles.ts')
  app = await apiApp()
  await app.app.ready()
  // THE CHAIN HAS TO REACH THE OWNER, which is criterion P9 and is checked before the role is. So the
  // secretary is the owner’s, the supervisor is the secretary's, and everything else hangs off those.
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One', role: 'worker' })
  await register(AS_THE_PERSON, { handle: 'insp-one', name: 'Inspector One', role: 'inspector' })
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
  reader.forgetTheRoleCards()
})

beforeEach(() => {
  reader.forgetTheRoleCards()
  reader.readTheRoleCards({ guardActKeys: GUARD_ACTS })
})

afterEach(() => {
  t.client.sqlite.prepare("UPDATE agents SET role = 'worker' WHERE handle = 'w-one'").run()
})

describe('the person appoints anybody', () => {
  it('gives a secretary, an inspector, a supervisor and a worker', async () => {
    for (const [handle, role] of [
      ['s-two', 'secretary'],
      ['i-two', 'inspector'],
      ['sup-two', 'supervisor'],
      ['w-two', 'worker'],
    ] as const) {
      const done = await register(AS_THE_PERSON, { handle, name: `A ${role}`, role })
      expect(done.status, `${role}: ${done.said}`).toBe(201)
    }
  })

  it('is still refused a word no card holds, and the refusal lists the words there are', async () => {
    const no = await register(AS_THE_PERSON, { handle: 'x-one', name: 'X', role: 'chancellor' })
    expect(no.status).toBe(400)
    expect(no.said).toContain('chancellor')
    expect(no.said).toContain('worker')
    expect(no.said).toContain('secretary')
  })
})

describe('an agent appoints at or below its own rung, which is the change', () => {
  it('lets a supervisor make a supervisor, which it could not do before', async () => {
    const done = await register(asAgent('sup-one'), { handle: 'sup-three', name: 'Supervisor Three', role: 'supervisor' })
    expect(done.status, done.said).toBe(201)
  })

  it('lets a supervisor make a worker', async () => {
    const done = await register(asAgent('sup-one'), { handle: 'w-three', name: 'Worker Three', role: 'worker' })
    expect(done.status, done.said).toBe(201)
  })

  it('lets a secretary make a supervisor, because a supervisor is below it', async () => {
    const done = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-four', name: 'Supervisor Four', role: 'supervisor' })
    expect(done.status, done.said).toBe(201)
  })
})

describe('only the person appoints a secretary, and the refusal says so', () => {
  it('refuses a supervisor making one, naming the card’s own line', async () => {
    const no = await register(asAgent('sup-one'), { handle: 's-three', name: 'A secretary', role: 'secretary' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
    expect(no.said).toContain('appointed by the person')
    expect(no.said).toContain('Nothing was written')
  })

  it('refuses a secretary making another one, so the top of the chain is the owner’s and not its own', async () => {
    const no = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 's-four', name: 'A second secretary', role: 'secretary' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
  })

  it('refuses an agent making an inspector for the same reason', async () => {
    const no = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'i-three', name: 'An inspector', role: 'inspector' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('Only the person appoints an inspector')
  })
})

describe('a worker makes a worker and nothing above it, and a card off the tree makes nothing', () => {
  it('refuses a worker making a supervisor, naming the rule that refused', async () => {
    const no = await register(asAgent('w-one'), { handle: 'sup-five', name: 'A supervisor', role: 'supervisor' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('A worker may not make a supervisor')
    expect(no.said).toContain('at or below its own rung')
  })

  it('lets a worker make another worker, at its own rung', async () => {
    const done = await register(asAgent('w-one'), { handle: 'w-four', name: 'Another worker', role: 'worker' })
    expect(done.status, done.said).toBe(201)
  })

  it('reads an agent whose row names no role as a worker, so it makes a worker and nothing above it', async () => {
    t.client.sqlite.prepare("UPDATE agents SET role = NULL WHERE handle = 'w-one'").run()
    const done = await register(asAgent('w-one'), { handle: 'w-five', name: 'Another worker', role: 'worker' })
    expect(done.status, done.said).toBe(201)
    const no = await register(asAgent('w-one'), { handle: 'sup-six', name: 'A supervisor', role: 'supervisor' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('A worker may not make a supervisor')
  })

  it('refuses an inspector, which is off the tree and starts nothing', async () => {
    const no = await register(asAgent('insp-one'), { handle: 'w-six', name: 'A worker', role: 'worker' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('An inspector appoints nobody')
  })
})

describe('the rule is the card’s, so moving the field moves the rule with no code change', () => {
  it('refuses a worker once its card says it appoints nobody', async () => {
    const before = await register(asAgent('w-one'), { handle: 'w-seven', name: 'A worker', role: 'worker' })
    expect(before.status, before.said).toBe(201)

    declareWith((decl) => {
      const worker = decl.cards.find((one) => one.name === 'worker')
      if (worker === undefined) throw new Error('no worker card')
      worker.appoints = 'nobody'
    })

    const after = await register(asAgent('w-one'), { handle: 'w-eight', name: 'A worker', role: 'worker' })
    expect(after.status).toBe(403)
    expect(after.said).toContain('A worker appoints nobody')
    expect(after.said).toContain("the worker card's own line")
  })

  it('lets an agent appoint a secretary once the card says the tree appoints it', async () => {
    const before = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 's-five', name: 'A secretary', role: 'secretary' })
    expect(before.status).toBe(403)

    declareWith((decl) => {
      const secretary = decl.cards.find((one) => one.name === 'secretary')
      if (secretary === undefined) throw new Error('no secretary card')
      secretary.appointedBy = 'the tree'
    })

    // AND IT IS STILL AT OR BELOW: the secretary is the top step, so a secretary may now make one
    // and a supervisor still may not. Two rules, and the second is untouched by moving the first.
    const bySecretary = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 's-six', name: 'A secretary', role: 'secretary' })
    expect(bySecretary.status, bySecretary.said).toBe(201)
    const bySupervisor = await register(asAgent('sup-one'), { handle: 's-seven', name: 'A secretary', role: 'secretary' })
    expect(bySupervisor.status).toBe(403)
    expect(bySupervisor.said).toContain('at or below its own rung')
  })
})
