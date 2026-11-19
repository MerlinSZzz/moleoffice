// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORK AREA IS BY ROLE — CRITERION P92.
 *
 * The design: a worker works in the folders it is given, a supervisor within a given folder, a secretary
 * anywhere, and an inspector in the folders it reviews. The two doors ask the registering agent's card and apply its
 * `workArea` block from design/permissions/roles.json; the refusal is the card's own `says` sentence,
 * so the words a caller reads come from the file that decided them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a worker's file is refused and its folder is accepted;
 *   · a worker naming files at the repository root is accepted, where a file with a path stays
 *     refused;
 *   · a supervisor's second directory is refused;
 *   · a secretary registering none is accepted, and a secretary naming a path is refused;
 *   · a card with no `workArea` block is refused rather than waved through.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · drop `card` from the call to `validateWorkArea` in
 *     src/server/api/participants.ts (pass null) → the worker's file is accepted, so the first
 *     case goes red.
 *   · drop the `rule === undefined` branch in `whyTheAreaBreaksTheCardsRule` in
 *     src/shared/roles.ts → a card with no block is waved through, so the last case goes red.
 *   · drop the `rule.rootFiles === 'by name'` permission from the check in src/shared/roles.ts → the
 *     worker's root files are refused, so the root-file acceptance goes red.
 *   · drop the `!path.includes('/')` root-file condition in src/shared/roles.ts → a file with a path
 *     is accepted, so the case that refuses it goes red.
 *
 * The source files were restored byte-identical after each mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
/** The role-card reader the server itself uses, loaded after `freshDb` named a throwaway database. */
let roles: typeof import('../src/server/lib/roles.ts')
/** The guard act keys, read after the database is named, because importing the guard opens it. */
let guardActKeys: (string | null)[] = []

async function register(payload: Record<string, unknown>): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

const theWorkerSays = (): string => {
  // THE CARD IS READ OFF THE FILE, because the test process's reader is the one the server uses and
  // it is loaded after `freshDb`; the sentence is the same file either way.
  const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  const card = decl.cards.find((one) => one.name === 'worker')
  return card?.workArea?.says ?? ''
}

/** The folders `readTheCardsWithout` made, each holding one changed declaration. Removed after all. */
const made: string[] = []

/** The cards on disk with one thing removed, read back through the reader the server uses. */
function readTheCardsWithout(remove: (decl: RolesDeclaration) => void, guardActKeys: (string | null)[]): void {
  const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  remove(decl)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-roles-p92-'))
  made.push(dir)
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  roles.forgetTheRoleCards()
  roles.readTheRoleCards({ guardActKeys, file })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  roles = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
  // A SUPERVISOR TO START THE WORKERS, so the chain of starters reaches the person and the role
  // rule is not the thing that refuses them.
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'p92-sup', name: 'P92 supervisor', role: 'supervisor', runtime: 'claude-code', workArea: ['src'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the door applies the registering card’s own work-area rule', () => {
  it('refuses a worker’s file and accepts its folder', async () => {
    const file = await register({ handle: 'p92-file', name: 'A file', runtime: 'claude-code', workArea: ['src/server/lib/roles.ts'] })
    expect(file.status, JSON.stringify(file.said)).toBe(400)
    // AND THE REFUSAL IS THE CARD'S OWN SENTENCE, not one typed in the code.
    expect(String(file.said['error'])).toBe(theWorkerSays())

    const folder = await register({ handle: 'p92-folder', name: 'A folder', runtime: 'claude-code', workArea: ['src/server/lib'] })
    expect(folder.status, JSON.stringify(folder.said)).toBe(201)
  })

  it('accepts a worker naming files at the repository root, and still refuses a file with a path', async () => {
    // BY A DECISION OF THE PERSON'S OF 14 SEPTEMBER 2026, a work area may list a specific file under
    // the repository root beside its folders. Both files sit at the root, so both are accepted.
    const rootFiles = await register({ handle: 'p92-root-files', name: 'Root files', runtime: 'claude-code', workArea: ['bridge.py', 'test_bridge.py'] })
    expect(rootFiles.status, JSON.stringify(rootFiles.said)).toBe(201)
    expect((rootFiles.said['agent'] as { workArea: string[] }).workArea).toEqual(['bridge.py', 'test_bridge.py'])

    // AND A FILE WITH A PATH IS STILL A FILE: `src/...` has a slash in it, so the card's sentence is
    // the refusal. This is the case the old rule already had, kept so the new permission cannot
    // quietly become "a worker may register any file".
    const withAPath = await register({ handle: 'p92-file-with-a-path', name: 'A file with a path', runtime: 'claude-code', workArea: ['src/server/lib/roles.ts'] })
    expect(withAPath.status, JSON.stringify(withAPath.said)).toBe(400)
    expect(String(withAPath.said['error'])).toBe(theWorkerSays())
  })

  it('refuses a supervisor’s second directory', async () => {
    const two = await register({ handle: 'p92-sup-two', name: 'Two dirs', role: 'supervisor', runtime: 'claude-code', workArea: ['src/a', 'src/b'] })
    expect(two.status, JSON.stringify(two.said)).toBe(400)
    const one = await register({ handle: 'p92-sup-one', name: 'One dir', role: 'supervisor', runtime: 'claude-code', workArea: ['src/a'] })
    expect(one.status, JSON.stringify(one.said)).toBe(201)
  })

  it('accepts a secretary registering none, and refuses one naming a path', async () => {
    const none = await register({ handle: 'p92-sec', name: 'No area', role: 'secretary', runtime: 'claude-code' })
    expect(none.status, JSON.stringify(none.said)).toBe(201)
    const some = await register({ handle: 'p92-sec-two', name: 'An area', role: 'secretary', runtime: 'claude-code', workArea: ['src'] })
    expect(some.status, JSON.stringify(some.said)).toBe(400)
  })

  it('refuses a registration whose card has no workArea block rather than waving it through', async () => {
    const before = roles.theRoleCards()
    readTheCardsWithout((decl) => {
      const worker = decl.cards.find((one) => one.name === 'worker')
      if (worker !== undefined) delete worker.workArea
    }, guardActKeys)
    try {
      const reply = await register({ handle: 'p92-no-block', name: 'No block', runtime: 'claude-code', workArea: ['src/server/lib'] })
      expect(reply.status, JSON.stringify(reply.said)).toBe(400)
      expect(String(reply.said['error'])).toContain('workArea block')
    } finally {
      // PUT THE REAL CARDS BACK, so the next file that reads them sees the declaration on disk.
      roles.forgetTheRoleCards()
      roles.readTheRoleCards({ guardActKeys })
      expect(roles.theRoleCards()).toEqual(before)
    }
  })
})
