// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINES THIS OFFICE TRUSTS — CRITERION P73.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS FOUND, AND WHAT WAS MEASURED BEFORE ANY OF THIS EXISTED
 * ---------------------------------------------------------------------------------------
 *
 * The trusted devices and addresses could not be adjusted in Settings or in Worlds, and where the
 * setting goes was left to the secretary to decide.
 *
 * MEASURED THEN: there was nothing to adjust anywhere.
 *
 *   · no table, no setting, no list;
 *   · which callers this office let in was decided by which SOCKET a request arrived on —
 *     `stampArrival` in src/server/lib/http.ts, and no header sets it;
 *   · the one address anybody could name was MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES, read in exactly
 *     one place, src/config/settings.mjs, and changed only by editing a file and restarting;
 *   · the visitor gate read no address at all: `FACTS_COMPARED` in src/shared/visitors.ts holds the
 *     conversation path and the start directory, and the machine is recorded and never compared.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the two presses work, and are the person's: an agent is refused and nothing is written;
 *   · a name that is not a machine, and an every-address spelling, are refused with what to write;
 *   · removing keeps the row, with who, when and why;
 *   · confirming a visitor credential adds the machine it was confirmed for, and confirming a
 *     second credential from the same machine adds nothing rather than a second row;
 *   · GET /api/access answers from the SAME list, so the two cannot name different machines;
 *   · the panel is drawn with presses on the world's page and without them in Settings.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `onlyThePersonMay` from POST /api/office/trusted-machines → the refusal case goes red.
 *   make `stopTrustingThisMachine` DELETE the row → the kept-row case goes red.
 *   drop `alsoTrustTheMachine` from the confirm route → the credential case goes red.
 *   give `readAccess` its own list instead of the one passed in → the one-list case goes red.
 *   draw `presses` as always true in TrustedMachines.tsx → the Settings case goes red.
 *   put the capitals back into `WHAT_THE_LIST_DECIDES` → the empty-list case goes red on both the
 *     missing fact and the four-capital run. Measured 7 September 2026.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { settingNamed } from '../src/config/settings.mjs'
import type { TrustedMachine, WhatTheOfficeTrusts } from '../src/shared/trustedmachines.ts'

type TrustedModule = typeof import('../src/web/components/TrustedMachines.tsx')

let t: TestDb
let app: FastifyInstance
let tm: TrustedModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-cl' }

async function trusted(): Promise<WhatTheOfficeTrusts> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/trusted-machines', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeTrusts
}

async function trust(
  headers: Record<string, string>,
  address: string,
  note?: string,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/office/trusted-machines',
    headers,
    payload: note === undefined ? { address } : { address, note },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function untrust(
  headers: Record<string, string>,
  id: string,
  because?: string,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/office/trusted-machines/${id}/remove`,
    headers,
    payload: because === undefined ? {} : { because },
  })
  return { code: reply.statusCode, said: reply.body }
}

/**
 * Issue a credential and confirm it. Returns the machine the office recorded it as asking from.
 *
 * THE MACHINE IS NOT CHOSEN HERE, AND CANNOT BE. `POST /api/office/visitors` measures it off the
 * socket — `writtenFrom` in src/server/lib/machines.ts — and the route's own comment says why: a
 * caller that could name its own machine could name anybody's. So every credential a test issues
 * asks from the machine the test is running on, which is what makes the second case below the real
 * one: two credentials from one machine add one row.
 */
async function aConfirmedVisitor(handle: string): Promise<string | null> {
  const asked = await app.inject({
    method: 'POST',
    url: '/api/office/visitors',
    headers: AS_THE_PERSON,
    payload: {
      handle,
      name: handle,
      role: 'worker',
      conversationPath: `/logs/${handle}.jsonl`,
      startDirectory: `/work/${handle}`,
    },
  })
  expect(asked.statusCode, asked.body).toBe(201)
  const credential = (asked.json() as Record<string, unknown>)['credential'] as Record<string, unknown>
  const confirmed = await app.inject({
    method: 'POST',
    url: `/api/office/visitors/${String(credential['id'])}/confirm`,
    headers: AS_THE_PERSON,
  })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  return (credential['machine'] as string | null) ?? null
}

/** The panel's own half, drawn with what the server actually said. */
function drawn(said: WhatTheOfficeTrusts, presses: boolean): string {
  return renderToStaticMarkup(h(tm.TrustedMachines, { said, presses, onChanged: () => {} }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  tm = (await import('../src/web/components/TrustedMachines.tsx')) as TrustedModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the list starts empty

describe('the list', () => {
  it('starts empty, and says so rather than saying nothing', async () => {
    const said = await trusted()
    expect(said.machines, 'nothing is trusted until somebody says so').toEqual([])
    expect(said.removed).toEqual([])
    expect(said.says.length, 'the server says what the list decides').toBeGreaterThan(40)
    // IT SAYS THE FACT, AND NOT IN CAPITALS. This assertion read 'REFUSES NOTHING' until the
    // handback picture showed that the capitals this codebase heads its comments with had been
    // copied into a sentence a person reads, and shouted from the middle of a paragraph.
    expect(said.says, 'and says plainly that nothing is refused for being off the list').toContain(
      'Nothing is refused today for being off the list',
    )
    expect(said.says, 'and does not shout inside a sentence a person reads').not.toMatch(/[A-Z]{4,}/)
  })
})

// ============================================================ 2. the two presses

describe('trusting a machine', () => {
  it('writes the machine, with who added it and when', async () => {
    const made = await trust(AS_THE_PERSON, 'windows-box.test', 'the Windows box')
    expect(made.code, made.said).toBe(200)
    const said = await trusted()
    expect(said.machines.map((one) => one.address)).toEqual(['windows-box.test'])
    const one = said.machines[0] as TrustedMachine
    expect(one.how).toBe('a press')
    expect(one.note).toBe('the Windows box')
    expect(one.addedBy).toEqual({ kind: 'person', id: THE_PERSON })
    expect(one.addedAt.length, 'local wall clock').toBeGreaterThan(10)
    expect(one.mayBeRemoved, 'a machine a press added may be removed by one').toBe(true)
  })

  it('refuses every caller but the person, and writes nothing', async () => {
    const said = await trust(AS_AN_AGENT, 'somebody-elses-box')
    expect(said.code).toBe(403)
    // THE SENTENCE NAMES WHO MAY AND WHO ASKED, and names the person as the owner rather than by
    // the owner's id: it is the sentence an agent reads, and an id is a stored word.
    expect(said.said, 'whose act it is').toContain("the owner's own act")
    expect(said.said, 'and who asked').toContain('builder-cl')
    expect(said.said, 'and where the owner does it, which is not the Embassy').toContain("at the world's page")
    expect(said.said).toContain('Nothing was done')
    expect((await trusted()).machines.map((one) => one.address), 'nothing was written').toEqual(['windows-box.test'])
  })

  it('refuses a name with no machine in it, and says what to write', async () => {
    const said = await trust(AS_THE_PERSON, '   ')
    expect(said.code).toBe(400)
    expect(said.said).toContain('device name')
  })

  it('refuses an every-address spelling, because it names no machine', async () => {
    const said = await trust(AS_THE_PERSON, '0.0.0.0')
    expect(said.code).toBe(400)
    expect(said.said).toContain('every address')
  })

  it('refuses a machine it already trusts, and says when it was added', async () => {
    const said = await trust(AS_THE_PERSON, `WINDOWS-BOX.TEST:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`)
    expect(said.code, 'the same machine written another way').toBe(409)
    expect(said.said).toContain('already trusts windows-box.test')
  })
})

describe('removing a machine', () => {
  it('keeps the row, and it reads as removed with who, when and why', async () => {
    const before = (await trusted()).machines[0] as TrustedMachine
    const said = await untrust(AS_THE_PERSON, before.id, 'it is off for good')
    expect(said.code, said.said).toBe(200)
    const after = await trusted()
    expect(after.machines, 'no longer trusted').toEqual([])
    expect(after.removed.map((one) => one.address), 'and the row is still here').toEqual(['windows-box.test'])
    const gone = after.removed[0] as TrustedMachine
    expect(gone.removedBy).toEqual({ kind: 'person', id: THE_PERSON })
    expect(gone.removedBecause).toBe('it is off for good')
    expect(gone.removedAt).not.toBeNull()
  })

  it('refuses every caller but the person', async () => {
    await trust(AS_THE_PERSON, 'apron')
    const one = (await trusted()).machines[0] as TrustedMachine
    const said = await untrust(AS_AN_AGENT, one.id)
    expect(said.code).toBe(403)
    expect((await trusted()).machines.map((each) => each.address)).toContain('apron')
  })

  it('refuses one that is already removed, rather than removing it twice', async () => {
    const gone = (await trusted()).removed[0] as TrustedMachine
    const said = await untrust(AS_THE_PERSON, gone.id)
    expect(said.code).toBe(409)
    expect(said.said).toContain('already removed')
  })

  it('lets a machine be trusted again, and keeps both rows', async () => {
    const said = await trust(AS_THE_PERSON, 'windows-box.test')
    expect(said.code, said.said).toBe(200)
    const after = await trusted()
    expect(after.machines.map((one) => one.address)).toContain('windows-box.test')
    expect(after.removed.map((one) => one.address), 'the owner removed it once and the row stays').toContain('windows-box.test')
  })
})

// ============================================================ 3. a credential adds its machine

describe('confirming a visiting agent', () => {
  it('adds the machine it was confirmed for, saying that is how it got here', async () => {
    const machine = await aConfirmedVisitor('visiting-one')
    expect(machine, 'this machine has a name to record').not.toBeNull()
    const one = (await trusted()).machines.find((each) => each.address === machine)
    expect(one, 'confirming a visitor from a machine is trusting that machine').toBeDefined()
    expect(one?.how).toBe('a credential')
    expect(one?.credential, 'and the row names the credential that added it').not.toBeNull()
  })

  it('adds nothing the second time, rather than a second row for one machine', async () => {
    const before = (await trusted()).machines.length
    await aConfirmedVisitor('visiting-two')
    expect((await trusted()).machines.length).toBe(before)
  })
})

// ============================================================ 4. one list, read in two places

describe('GET /api/access', () => {
  it('answers from the same list, so the two cannot name different machines', async () => {
    const access = await app.inject({ method: 'GET', url: '/api/access', headers: AS_THE_PERSON })
    expect(access.statusCode, access.body).toBe(200)
    const machine = (access.json() as Record<string, unknown>)['machine'] as Record<string, unknown>
    const trusts = machine['trusts'] as TrustedMachine[] | null
    expect(trusts, 'the route hands the list over').not.toBeNull()
    expect((trusts ?? []).map((one) => one.address).sort()).toEqual(
      (await trusted()).machines.map((one) => one.address).sort(),
    )
  })

  it('keeps who has CALLED apart from who is TRUSTED', async () => {
    const access = await app.inject({ method: 'GET', url: '/api/access', headers: AS_THE_PERSON })
    const machine = (access.json() as Record<string, unknown>)['machine'] as Record<string, unknown>
    expect(Object.keys(machine), 'two fields, two facts').toContain('machines')
    expect(Object.keys(machine)).toContain('trusts')
  })
})

// ============================================================ 5. where the presses are

describe('the panel', () => {
  it('carries the presses on the world’s page', async () => {
    const said = await trusted()
    const page = drawn(said, true)
    expect(page).toContain(tm.TRUSTED_WORDS.add)
    expect(page).toContain(tm.TRUSTED_WORDS.remove)
    expect(page, 'and the server’s own sentence about what the list decides').toContain(said.says.slice(0, 40))
  })

  it('carries none in Settings, and says where they are', async () => {
    const page = drawn(await trusted(), false)
    expect(page, 'the owner\'s words: they looked in Settings and could change nothing').not.toContain(tm.TRUSTED_WORDS.add)
    expect(page).not.toContain(tm.TRUSTED_WORDS.remove)
    expect(page, 'the press that goes where the list is set').toContain(tm.TRUSTED_WORDS.setOn)
    expect(page, 'and takes the owner there').toContain('/worlds')
  })

  it('says the office trusts nobody where the list is empty', async () => {
    const page = drawn({ machines: [], removed: [], says: 'x', boundByTheEnvironment: null }, true)
    expect(page).toContain(tm.TRUSTED_WORDS.none)
  })
})
