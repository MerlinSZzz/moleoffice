// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY IS ONE LIST — CRITERION P74.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED
 * ---------------------------------------------------------------------------------------
 *
 * Are a Visitors section and a Visiting agents section in the Embassy needed, when an agent is
 * already read as online or offline?
 *
 * WHAT WAS THERE: three panels — Citizens, Visitors, Visiting agents — which were three MECHANISMS
 * drawn as three kinds of participant: a world's roll, a registered trip and a credential. A reader
 * looking for somebody had to know which of the three they were in before they could find them. And
 * the presence the product already has was on the profile page, not on the row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a credential waiting for the owner is a ROW in the same list, marked asks to come in;
 *   · that row carries the confirm and refuse presses;
 *   · a row that is not waiting carries neither;
 *   · once confirmed the row is an ordinary agent row and the mark is gone;
 *   · every row a registry here holds carries its presence, and the reading is the same one the
 *     profile page draws;
 *   · the page draws ONE list of participants: the two old headings are gone;
 *   · the credential is named on the agent's profile.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the pending-credential loop from `theEmbassy` → the row and press cases go red.
 *   make `thePresence` return null always → the presence cases go red.
 *   draw `AsksToComeIn` on every row → the case that says an ordinary row has no press goes red.
 *   drop the credential Fact from ProfilePage.tsx → the profile case goes red.
 *   make `noKeyWorksUnder` (src/shared/visitors.ts) false always → the keyless visitor's case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { SURFACES } from '../src/shared/surfaces.ts'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')
type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: FastifyInstance
let ep: EmbassyModule
let pp: ProfileModule
let waiting: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** The test secretary's registry id. It is minted at registration, so it is not the secretary's handle. */
function argusId(): string {
  return (t.client.sqlite.prepare(`SELECT id FROM agents WHERE handle = '${THE_TEST_OFFICES_SECRETARY.handle}'`).get() as { id: string }).id
}

async function embassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

/** Ask for a credential and leave it waiting. Returns its id. */
async function aCredentialWaiting(handle: string): Promise<string> {
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
  expect(credential['standing'], 'it waits for the owner').toBe('pending')
  return credential['id'] as string
}

/** The Embassy's own half, drawn with what the server actually said. */
function drawn(said: WhatTheEmbassySays): string {
  return renderToStaticMarkup(h(ep.TheEmbassy, { said }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  waiting = await aCredentialWaiting('the-other-worker')

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
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. one list

describe('the Embassy reply', () => {
  it('makes a credential waiting for the owner a row, marked asks to come in', async () => {
    const said = await embassy()
    const row = said.rows.find((one) => one.standing === 'asks to come in')
    expect(row, 'the credential is a row and not a section').toBeDefined()
    expect(row?.who).toEqual({ kind: 'agent', id: 'the-other-worker' })
    expect(row?.name, 'named by the handle it asked under').toBe('the-other-worker')
    expect(row?.credential, 'and the row names the credential').toBe(waiting)
  })

  it('gives a row asking to come in no presence, because it has never been let speak', async () => {
    const said = await embassy()
    const row = said.rows.find((one) => one.standing === 'asks to come in') as EmbassyRow
    expect(row.presence, 'nothing it sends is stored until the owner confirms it').toBeNull()
  })

  it('gives every row a registry here holds its presence, in the words a person reads', async () => {
    const said = await embassy()
    const secretary = said.rows.find((one) => one.who.id === argusId()) as EmbassyRow
    expect(secretary.presence, 'a registered agent has a reading').not.toBeNull()
    expect(secretary.presence?.word.length, 'a word, not a stored token').toBeGreaterThan(0)
    expect(secretary.presence?.says.length, 'and the sentence behind it').toBeGreaterThan(10)
  })

  it('says the same about one agent as the agent’s own profile does', async () => {
    const said = await embassy()
    const row = said.rows.find((one) => one.who.id === argusId()) as EmbassyRow
    const profile = await app.inject({
      method: 'GET',
      url: `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`,
      headers: AS_THE_PERSON,
    })
    expect(profile.statusCode).toBe(200)
    const page = (profile.json() as Record<string, unknown>)['presence'] as Record<string, unknown>
    expect(row.presence?.word, 'one reading, two places').toBe(page['word'])
    expect(row.presence?.colour).toBe(page['colour'])
  })

  it('makes the row an ordinary agent once the owner confirms it', async () => {
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${waiting}/confirm`,
      headers: AS_THE_PERSON,
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const said = await embassy()
    expect(said.rows.filter((one) => one.standing === 'asks to come in'), 'nothing is waiting now').toEqual([])
  })

  it('refuses the confirm press to every caller but the person', async () => {
    const second = await aCredentialWaiting('a-third-worker')
    const said = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${second}/confirm`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    })
    expect(said.statusCode).toBe(403)
    const back = await embassy()
    expect(
      back.rows.some((one) => one.standing === 'asks to come in' && one.who.id === 'a-third-worker'),
      'it is still waiting',
    ).toBe(true)
  })

  it('shows a pending visitor whose key was removed, because the owner can still end it', async () => {
    const keyless = await aCredentialWaiting('keyless-worker')
    t.client.sqlite
      .prepare('UPDATE visitor_credentials SET token_hash = ? WHERE id = ?')
      .run(`${REMOVED_MARK}${keyless}`, keyless)

    const confirmation = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${keyless}/confirm`,
      headers: AS_THE_PERSON,
    })
    expect(confirmation.statusCode, 'a copy has no key to confirm').toBe(409)

    const before = await embassy()
    const visitor = before.visitors.find((one) => one.id === keyless)
    expect(visitor?.standing).toBe('pending')
    expect(visitor?.tokenRemoved).toBe(true)
    const waiting = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_THE_PERSON })
    expect(waiting.statusCode, waiting.body).toBe(200)
    const row = (waiting.json() as { items: { id: string; act: string }[] }).items.find((one) => one.id === keyless)
    expect(row, 'the waiting door counts the same pending visitor').toBeDefined()
    expect(row?.act).toBe('confirm')
    expect(drawn(before), 'the Embassy shows the pending visitor').toContain('keyless-worker')
    // ITS CARD OFFERS ONLY WHAT THE SERVER WILL DO. The confirm above was refused, so the card draws no press to let it
    // in, and draws the state the credential's own page names it by: no token works under it. Seen in round 25's
    // pictures: the card said it could join once let in, over a press the server refuses. Before, the card drew the
    // credential page's sentence on a copy without its key; the page draws its state word instead now, as decided.
    const alone = drawn({ ...before, visitors: before.visitors.filter((one) => one.id === keyless) })
    const { CREDENTIAL_WORDS } = await import('../src/web/pages/CredentialPage.tsx')
    expect(alone, 'the keyless card offers a press the server refuses').not.toContain(ep.EMBASSY_WORDS.confirm)
    expect(alone).toContain(CREDENTIAL_WORDS.tokenRemovedStanding)
    expect(alone, 'the owner can still refuse it').toContain(ep.EMBASSY_WORDS.refuse)
    // AND IT IS DRAWN ONCE. Its row asks to come in, by the rule the card reads, so the list below does not draw it
    // again as an ordinary visitor. Seen in the same pictures: it was in both places.
    expect(before.rows.find((one) => one.credential === keyless)?.standing).toBe('asks to come in')
    expect(drawn(before).split('>keyless-worker<').length - 1, 'the keyless visitor is drawn twice').toBe(1)

    const refused = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${keyless}/end`,
      headers: AS_THE_PERSON,
    })
    expect(refused.statusCode, refused.body).toBe(200)
    expect((refused.json() as { credential: { standing: string } }).credential.standing).toBe('ended')
    const after = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_THE_PERSON })
    expect((after.json() as { items: { id: string }[] }).items.some((one) => one.id === keyless)).toBe(false)
    expect(drawn(await embassy())).not.toContain('keyless-worker')
  })
})

// ============================================================ 2. what the page draws

describe('the Embassy page', () => {
  /**
   * THE LIST'S NAME, criterion P78: the list is called Citizens, not Who the office knows. It is
   * written out here rather than compared against the constant, because a case that
   * read the constant would follow a rename anywhere it went and hold nothing.
   *
   * THE TWO PLACES THAT HOLD IT MUST AGREE. The panel draws `EMBASSY_WORDS.everybody`; the comment
   * layer and the pointing layer name the same panel through `SURFACES['embassy.citizens']`. A
   * reader who commented on Citizens and was answered about Who the office knows would be reading
   * two names for one thing.
   */
  it('is called Citizens, which is the owner\'s word for it', async () => {
    const page = drawn(await embassy())
    expect(page).toContain('>Citizens<')
    expect(ep.EMBASSY_WORDS.everybody).toBe('Citizens')
    expect(SURFACES['embassy.citizens'], 'the name the comment layer uses').toBe('Citizens')
  })

  it('draws one list of participants, and neither old heading', async () => {
    const page = drawn(await embassy())
    expect(page).toContain(ep.EMBASSY_WORDS.everybody)
    expect(page, 'the owner\'s words: 这没必要吧').not.toContain('>Visitors<')
    expect(page).not.toContain('>Visiting agents<')
    expect(page, 'the worlds are still their own panel, because a world is not a participant').toContain(
      ep.EMBASSY_WORDS.worlds,
    )
  })

  /**
   * THE TWO PRESSES MOVED OUT OF THE LIST ON 8 SEPTEMBER 2026, criterion P78. P74 put a waiting
   * credential in the one list with the presses on its row; P78 puts it in a block above the list.
   * The presses are the same and the place is not, so these two cases moved with them. Before, the
   * block also drew a sentence on what confirming means; the page draws no sentence on what a press
   * does now, as decided.
   */
  it('puts both presses in the block above the list, not on a row in it', async () => {
    const page = drawn(await embassy())
    expect(page, 'the block').toContain(ep.EMBASSY_WORDS.asking)
    expect(page).toContain(ep.EMBASSY_WORDS.confirm)
    expect(page).toContain(ep.EMBASSY_WORDS.refuse)
  })

  it('draws no block and no press while nothing is waiting', async () => {
    const said = await embassy()
    const ordinary: WhatTheEmbassySays = {
      ...said,
      rows: said.rows.filter((one) => one.standing !== 'asks to come in'),
      visitors: said.visitors.filter((one) => one.standing !== 'pending'),
    }
    const page = drawn(ordinary)
    expect(page, 'a heading about nothing').not.toContain(ep.EMBASSY_WORDS.asking)
    expect(page).not.toContain(ep.EMBASSY_WORDS.confirm)
    expect(page).not.toContain(ep.EMBASSY_WORDS.refuse)
  })

  it('draws presence on a row, a fact the product already had', async () => {
    const said = await embassy()
    const secretary = said.rows.find((one) => one.who.id === argusId()) as EmbassyRow
    const page = drawn(said)
    expect(page).toContain(secretary.presence?.word)
  })
})

// ============================================================ 3. the credential on the profile

describe('the agent’s profile', () => {
  // Plan 7FEOshq3mBGG keeps the credential and admission machinery in developer mode.
  beforeAll(async () => { (await import('../src/web/lib/mode.ts')).setMode('inspect') })
  afterAll(async () => { (await import('../src/web/lib/mode.ts')).setMode('normal') })
  it('names the credential the office let it in on', async () => {
    const profile = await app.inject({
      method: 'GET',
      url: `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`,
      headers: AS_THE_PERSON,
    })
    const said = profile.json() as Record<string, unknown>
    const who = said['participant'] as Record<string, unknown>
    const withOne = { ...said, participant: { ...who, credential: waiting } }
    const page = renderToStaticMarkup(
      h(pp.TheProfile, { said: withOne, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
    )
    expect(page).toContain(PROFILE_WORDS.credential)
    expect(page).toContain(waiting)
  })

  it('says an agent registered here needed none, rather than leaving a gap', async () => {
    const profile = await app.inject({
      method: 'GET',
      url: `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`,
      headers: AS_THE_PERSON,
    })
    const page = renderToStaticMarkup(
      h(pp.TheProfile, { said: profile.json(), onChanged: () => {} } as unknown as Parameters<
        ProfileModule['TheProfile']
      >[0]),
    )
    expect(page).toContain(PROFILE_WORDS.noCredential)
  })
})
