// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * POWERS ARE A TREE, AND EVERY REFUSAL IS COMPUTED FROM IT.
 *
 * Criterion P57 of design/permissions/ACCEPTANCE.md section 11:
 * powers and duties come apart, and powers are a tree.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS THAT NOTHING ELSE DOES
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-declaration-decides-what-a-role-may-do.test.ts` holds that there is ONE declaration and
 * that what `GET /api/access` publishes is what the gate enforces. Neither of those says anything
 * about the SHAPE of the declaration, and both were green on the day every card carried a May-not
 * list written out by hand. This file is about that shape:
 *
 *   · a refusal is a subtraction — every act the file names, minus the acts under the powers the
 *     holder has — and the subtraction is recomputed here from the raw declaration, so a reader can
 *     see the answer come out twice by two routes;
 *   · a rung holds everything the rung below holds, which is the whole of what "a tree" means;
 *   · moving a power from one step to another changes what an agent may do with no code change.
 *
 * WHY THE LAST ONE IS DRIVEN THROUGH THE SERVER. A subtraction that agrees with itself proves
 * nothing about the product. So the last test reads a declaration with one power moved, starts the
 * refusal against it, and asks the route: a worker opens a group, which it may not do today.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { actsRefusedTo, everyActNamed, powerNamesOn, type RolesDeclaration } from '../src/shared/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
/**
 * THE SERVER'S OWN COPY OF THE READER, and not the one a static import would give.
 *
 * `freshDb()` calls `vi.resetModules()`, so everything the server loads after it is a new module
 * graph. A statically imported `readTheRoleCards` would hold ITS declaration and the running server
 * would hold another, and swapping one would change nothing the gate reads. The same device as
 * `reader` in tests/a-role-card-is-readable-in-mole-office.test.ts, for the same reason.
 */
let reader: typeof import('../src/server/lib/roles.ts')
/** The server's own start reading of the cards, from the same module graph, to put them back after a case. */
let atStart: typeof import('../src/server/lib/role-cards-at-start.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The governance act keys the boot hands the reader, so a power may name one of them. */
const PUBLISHED_ACTS: (string | null)[] = ['decision.write', 'fork.settle', 'fork.replace', 'fork.reopen', 'fork.remove', 'act.revoke', 'ask.remove', 'plan.commit', 'direction.shelve', 'goal.confirm', 'import.accept', 'implementation.accept', 'office.scene-settings.change', 'regulation.revoke', 'module-graph.arrange', 'fork.pin', 'fork.reclassify', 'plan.shape', 'workdomain.change', 'implementation.retire', 'repository.repoint', 'restriction.dismiss', 'block.method.change']

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

beforeAll(async () => {
  t = await freshDb()
  reader = await import('../src/server/lib/roles.ts')
  atStart = await import('../src/server/lib/role-cards-at-start.ts')
  app = await apiApp()
  await app.app.ready()
}, 60_000)

/** The folders `reading` below made, each holding one changed declaration. Removed after each case. */
const made: string[] = []

afterAll(async () => {
  await app.app.close()
  t.close()
  reader.forgetTheRoleCards()
})

afterEach(() => {
  // THE SHIPPED CARDS AGAIN, READ AS THE SERVER'S START READS THEM: `reading` leaves the reader holding a
  // changed declaration, and the running server asks the same module for the cards on every request.
  reader.forgetTheRoleCards()
  atStart.readTheRoleCardsAtStart()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The declaration as JSON text, straight off the disk, with nothing read through a type. */
function theFileItself(): string {
  return readFileSync(reader.theRoleCardsFile(), 'utf8')
}

/** The declaration with one thing changed, served to the reader from a file of its own. */
function reading(change: (decl: RolesDeclaration) => void): RolesDeclaration {
  const decl = JSON.parse(theFileItself()) as RolesDeclaration
  change(decl)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-tree-'))
  made.push(dir)
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  reader.forgetTheRoleCards()
  return reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS, file })
}

describe('a refusal is a subtraction, not a list', () => {
  it('refuses exactly what is left when the powers a card holds are taken away', () => {
    const decl = reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
    for (const card of decl.cards) {
      // THE SAME ANSWER BY A SECOND ROUTE, worked out here from the raw declaration rather than by
      // calling the thing under test. Every act any power names, minus the acts under the powers
      // this card holds.
      const held = new Set(powerNamesOn(decl, card))
      const shouldBeRefused = new Set<string>()
      for (const power of decl.powers) {
        if (held.has(power.name)) continue
        for (const act of power.acts) shouldBeRefused.add(act.act)
      }
      expect([...actsRefusedTo(decl, card.name).keys()].sort(), `the ${card.name} card`).toEqual(
        [...shouldBeRefused].sort(),
      )
    }
  })

  it('refuses the person nothing, because the person holds every power there is', () => {
    const decl = reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
    const person = decl.personCards[0]
    expect(person, 'the declaration holds no person card').toBeDefined()
    const held = new Set(powerNamesOn(decl, person as never))
    expect([...held].sort()).toEqual(decl.powers.map((one) => one.name).sort())
  })

  it('keeps the person’s own acts off every step of the tree, so no rung reaches them by itself', () => {
    const decl = reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
    const theirs = decl.elevation.givesThePower
    for (const step of decl.tree) {
      expect(step.adds, `the ${step.role} step adds the person’s own acts`).not.toContain(theirs)
    }
    for (const card of decl.cards) {
      expect(powerNamesOn(decl, card), `the ${card.name} card holds the person’s own acts by itself`).not.toContain(theirs)
    }
  })
})

describe('a rung holds everything the rung below holds', () => {
  it('gives each step every power of the step under it, and refuses it a subset of what that step is refused', () => {
    const decl = reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
    const steps = [...decl.tree].sort((a, b) => a.rung - b.rung)
    for (const [at, step] of steps.entries()) {
      if (at === 0) continue
      const below = steps[at - 1]
      if (below === undefined) continue
      const here = decl.cards.find((one) => one.name === step.role)
      const under = decl.cards.find((one) => one.name === below.role)
      if (here === undefined || under === undefined) throw new Error('a step names a card that is not there')
      for (const power of powerNamesOn(decl, under)) {
        expect(powerNamesOn(decl, here), `${here.name} lost a power ${under.name} holds`).toContain(power)
      }
      for (const act of actsRefusedTo(decl, here.name).keys()) {
        expect([...actsRefusedTo(decl, under.name).keys()], `${under.name} may do what ${here.name} may not`).toContain(act)
      }
    }
  })

  it('names every act it refuses somewhere in the powers, so no refusal comes from nowhere', () => {
    const decl = reader.readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
    const named = everyActNamed(decl)
    for (const card of decl.cards) {
      for (const [act, inWords] of actsRefusedTo(decl, card.name)) {
        expect(named.has(act), `${card.name} is refused ${act}, which no power names`).toBe(true)
        expect(named.get(act)).toBe(inWords)
      }
    }
  })
})

describe('moving a power on the tree changes what an agent may do, with no code change', () => {
  it('lets a worker open a group once the worker’s step holds Groups and dispatch', async () => {
    await app.app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'w-one', name: 'Worker One', role: 'worker' },
    })

    // AS IT STANDS: refused, and the refusal names the powers a worker does hold.
    const before = await app.app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asAgent('w-one'),
      payload: { title: 'A group a worker wanted' },
    })
    expect(before.statusCode).toBe(403)
    expect(String((before.json() as { error?: unknown }).error ?? '')).toContain('a power it does not hold')

    // THE ONE CHANGE, AND IT IS DATA: Groups and dispatch moves from the supervisor's step to the
    // worker's. No file under src/ is touched, and the server is not rebuilt.
    reading((decl) => {
      const from = decl.tree.find((step) => step.adds.includes('Groups and dispatch'))
      const to = decl.tree.find((step) => step.rung === 1)
      if (from === undefined || to === undefined) throw new Error('the tree has no Groups and dispatch')
      from.adds = from.adds.filter((one) => one !== 'Groups and dispatch')
      to.adds = [...to.adds, 'Groups and dispatch']
    })
    expect(powerNamesOn(reader.theRoleCards(), reader.theRoleCards().cards[0] as never)).toContain('Groups and dispatch')

    const after = await app.app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asAgent('w-one'),
      payload: { title: 'A group a worker may now open' },
    })
    expect(after.statusCode, after.body).not.toBe(403)
  })
})
