// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE RECORDS WHERE IT WAS WRITTEN FROM: THE MACHINE, AND THE PROGRAM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M63 of design/messages/ACCEPTANCE.md, that a message says which machine's browser it
 * was written from. A machine is named by the trusted tailnet's name for the caller, and by the
 * hostname when the caller is on this machine.
 *
 * Four things:
 *
 *   1. A MESSAGE WRITTEN FROM THIS MACHINE SAYS SO, by this machine's own name.
 *   2. A MESSAGE WRITTEN FROM SOMEWHERE ELSE IS TOLD APART FROM ONE WRITTEN HERE. This stack is
 *      served on a second address as well as on loopback — the same arrangement
 *      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES makes — so a write through that door arrives on the
 *      listener for other machines and is recorded through the other branch.
 *   3. WHAT THE WRITER SAID IT IS WRITING IN is kept, and it is what the writer said rather than
 *      anything guessed from the request.
 *   4. THE WRITER CANNOT WRITE THIS FIELD. A message able to claim it came from a machine it did
 *      not come from is worse than one that says nothing, so a value sent in the body is replaced.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SECOND ADDRESS AND NOT A SECOND MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * Every Linux machine has the whole of `127.0.0.0/8`, so `127.0.0.2` is a second address on this
 * one and needs no network and no second computer. What it gives is a request that arrives on the
 * OTHER LISTENER — the one for other machines — which is the branch a real call from another machine takes.
 * What it cannot give is a caller that really is elsewhere, so the address measured for it is still
 * a loopback address; the reading says `an address` rather than naming a machine, and that is the
 * honest answer rather than a name nobody could read.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whereItWasWrittenReads } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

/** The second address this stack is also served on. See the file header. */
const OTHER_ADDRESS = '127.0.0.2'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Written {
  machine?: string
  how?: string
  program?: string
}

/** File one message through the address given, and read back what was stored on it. */
async function sendFrom(
  origin: string,
  headers: Record<string, string>,
  data: Record<string, unknown>,
): Promise<{ status: number; writtenFrom: Written | null; id: string }> {
  const res = await fetch(`${origin}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: 'a line', data }),
  })
  const held = (await res.json()) as { record?: { id: string; data?: { writtenFrom?: Written } } }
  return {
    status: res.status,
    writtenFrom: held.record?.data?.writtenFrom ?? null,
    id: held.record?.id ?? '',
  }
}

beforeAll(async () => {
  app = await liveApp({
    name: 'written-from',
    viewport: { width: 1440, height: 1000 },
    addressForOtherMachines: OTHER_ADDRESS,
  })
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Nib',
      data: { handle: 'nib', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(agent.status, await agent.text()).toBe(201)
  // THE OTHER DOOR IS THE OWNER'S OTHER COMPUTER, WHICH THEY TRUST. A message they write there carries their name and no key, and
  // since item 1 of a decision, that counts as the owner only from a machine the office trusts while the window is
  // open; `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says how.
  await trustTheMachineThatCallsThroughTheOtherDoor(
    { api: app.api, keysFile: join(app.dir, 'keys.json') },
    `http://${OTHER_ADDRESS}:${String(app.apiPort)}`,
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('where a message was written from', () => {
  // EVERY MESSAGE HERE IS THE PERSON'S TO A REGISTERED AGENT NOTHING HOLDS, so each answers the unheld 409 (decision
  // `60sbc5I-bwKx`). The letter and `writtenFrom` are stored all the same, which is what this file measures.
  it('records this machine by its own name, and what the writer said it is writing in', async () => {
    const written = await sendFrom(
      app.api,
      { ...AS_THE_OWNER, 'x-mole-office-program': 'Chrome' },
      { body: 'Written on this machine.', to: [{ kind: 'agent', id: 'nib' }] },
    )
    expect(written.status).toBe(409)
    expect(written.writtenFrom?.how).toBe('this machine')
    // WHAT THE OPERATING-SYSTEM LAYER ANSWERS, asked the same way it asks. The server is a child of
    // this process, so its environment is this one's.
    expect(written.writtenFrom?.machine).toBe(process.env['HOSTNAME']?.trim() || hostname())
    expect(written.writtenFrom?.program).toBe('Chrome')
  })

  it('records nothing about a program when the writer said nothing', async () => {
    const written = await sendFrom(
      app.api,
      AS_THE_OWNER,
      { body: 'Written by something that does not say.', to: [{ kind: 'agent', id: 'nib' }] },
    )
    expect(written.status).toBe(409)
    expect(written.writtenFrom?.how).toBe('this machine')
    // ABSENT, NOT EMPTY AND NOT "unknown". Nothing said, so nothing is stored.
    expect(written.writtenFrom?.program).toBeUndefined()
  })

  it('tells a message written through the other machines’ door apart from one written here', async () => {
    const here = await sendFrom(
      app.api,
      { ...AS_THE_OWNER, 'x-mole-office-program': 'Chrome' },
      { body: 'From the loopback door.', to: [{ kind: 'agent', id: 'nib' }] },
    )
    const there = await sendFrom(
      `http://${OTHER_ADDRESS}:${String(app.apiPort)}`,
      { ...AS_THE_OWNER, 'x-mole-office-program': 'Chrome' },
      { body: 'From the other machines door.', to: [{ kind: 'agent', id: 'nib' }] },
    )
    expect(here.status).toBe(409)
    expect(there.status).toBe(409)

    // THE REQUIREMENT: the two are not recorded as the same origin. Both readings are asserted to
    // be there before they are compared, so "they differ" can never be two absences differing.
    expect(here.writtenFrom, 'nothing was recorded for the message written here').not.toBeNull()
    expect(there.writtenFrom, 'nothing was recorded for the message written through the other door').not.toBeNull()
    expect(here.writtenFrom?.how).toBe('this machine')
    expect(['an address', 'nobody could tell']).toContain(there.writtenFrom?.how)
    expect(there.writtenFrom?.machine).not.toBe(here.writtenFrom?.machine)

    // AND WHAT A READER IS SHOWN SAYS WHICH IS A NAME AND WHICH IS AN ADDRESS, so nobody reads a
    // loopback address as a machine somebody called that.
    const saidThere = whereItWasWrittenReads({
      machine: there.writtenFrom?.machine ?? null,
      how: there.writtenFrom?.how ?? '',
      program: there.writtenFrom?.program ?? null,
    })
    if (there.writtenFrom?.how === 'an address') expect(saidThere).toContain('the address')
    expect(saidThere).toContain('Chrome')
  })

  it('replaces a writtenFrom the caller sent, rather than storing it', async () => {
    // A WELL-SHAPED CLAIM, because that is the one worth refusing. A malformed one never reaches
    // this: the shape check refuses the body first, like any other field it cannot read.
    const written = await sendFrom(
      app.api,
      { ...AS_THE_OWNER, 'x-mole-office-program': 'Firefox' },
      {
        body: 'Claiming to be somewhere else.',
        to: [{ kind: 'agent', id: 'nib' }],
        writtenFrom: { machine: 'a-machine-nobody-has', how: 'this machine', program: 'Chrome' },
      },
    )
    expect(written.status).toBe(409)
    expect(written.writtenFrom?.machine).not.toBe('a-machine-nobody-has')
    expect(written.writtenFrom?.how).toBe('this machine')
    // AND THE PROGRAM IS THE ONE THE HEADER SAID, not the one the body claimed.
    expect(written.writtenFrom?.program).toBe('Firefox')
  })

  it('is on the message when it is read back, so a screen has it without a second request', async () => {
    const written = await sendFrom(
      app.api,
      { ...AS_THE_OWNER, 'x-mole-office-program': 'Chrome' },
      { body: 'Read back.', to: [{ kind: 'agent', id: 'nib' }] },
    )
    expect(written.status).toBe(409)
    const res = await fetch(`${app.api}/api/messages/${written.id}`, { headers: AS_THE_OWNER })
    const held = (await res.json()) as { message?: { writtenFrom?: Written | null } }
    expect(res.status, JSON.stringify(held)).toBe(200)
    expect(held.message?.writtenFrom?.program).toBe('Chrome')
    expect(held.message?.writtenFrom?.how).toBe('this machine')
  })

  it('draws it on the message in the chat, as one short line', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // DESIGN D (wave 13y) DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so the chat is opened the way the page offers it.
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-from', { timeout: 30_000 })
    const said = await app.page.$eval('.px-chat-from', (el) => el.textContent ?? '')
    // WHAT THE BROWSER ITSELF SENT. The page is Chromium, so it says Chrome; the machine half is
    // this machine, by its own name. Neither is written into the page — both were measured or told
    // at the moment the message was written.
    expect(said).toContain(process.env['HOSTNAME'] ?? hostname())
    expect(said.startsWith('from ')).toBe(true)
  }, 120_000)

  it('refuses a near-miss spelling of the header rather than dropping it', async () => {
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, 'x-mole-office-porgram': 'Chrome' },
      body: JSON.stringify({
        kind: 'message',
        title: 'a line',
        data: { body: 'A misspelt header.', to: [{ kind: 'agent', id: 'nib' }] },
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await res.text()).toContain('x-mole-office-porgram')
  })
})
