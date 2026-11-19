// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY LISTS EVERY VISITING AGENT AND EVERY WORLD, WITH WHAT EACH HAS DONE — AND SAYS THAT A
 * WORLD'S OWNER IS A CLAIM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Criteria P26 and P31 of design/permissions/ACCEPTANCE.md, on answer 3: these trusted agents and
 * worlds are confirmed by the administrator in the Embassy, from the page on either machine, and
 * their counts are kept there.
 *
 *   P26. *The Embassy row for a visitor carries who, machine, facts, request count, writes, mismatch
 *        count, who confirmed it and when it expires. It is readable from either machine's page.*
 *   P31. *The world row says the ownership is what that world said, not what this one checked, in
 *        the place a person reads it.*
 *
 * It also measures what criterion P28 asks to be DRAWN and not only declared: the credential's page
 * says what it cannot prove, and the two presses are one press each.
 *
 * ---------------------------------------------------------------------------------------
 * THE COUNTS ARE MADE REAL BEFORE THEY ARE READ
 * ---------------------------------------------------------------------------------------
 *
 * A page that drew three zeroes would pass "the row carries a request count". So the setup below
 * makes a credential, confirms it, sends two requests under it — one of them from a different start
 * directory, so one is a mismatch — and then asserts the numbers are 2 and 1 rather than merely
 * present. `writes` is asserted at 0 in the same breath, because it is the number most likely to be
 * wrong by counting every POST.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor, visitorPath } from '../src/web/components/router.tsx'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'
import { CREDENTIAL_WORDS } from '../src/web/pages/CredentialPage.tsx'
import { A_WORLDS_OWNER_IS_A_CLAIM, WHAT_A_CREDENTIAL_CANNOT_PROVE } from '../src/shared/visitors.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The world loquat says it is, and who it says started it. Checked by nothing here — criterion P31. */
const LOQUAT_WORLD = 'd0d0d0d0d0d0d0d0'
const CONVERSATION = '/transcripts/loquat/one'
const STARTED_IN = `${THE_TEST_FIXTURE_ROOT}/work/loquat`

let credentialId = ''
let token = ''

interface CredentialOnTheWire {
  id: string
  handle: string
  name: string
  standing: string
  world: string | null
  machine: string | null
  facts: { conversationPath: string | null; startDirectory: string | null }
  requests: number
  writes: number
  mismatches: number
  confirmedBy: { kind: string; id: string } | null
  endsAt: string
}

interface WorldOnTheWire {
  world: { name: string; databaseIdentity: string }
  owner: { kind: string; id: string } | null
  ownerIsAClaim: string
  citizens: number
  credentials: number
  requests: number
  mismatches: number
}

async function embassy(): Promise<{ visitors: CredentialOnTheWire[]; worlds: WorldOnTheWire[] }> {
  const got = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as { visitors: CredentialOnTheWire[]; worlds: WorldOnTheWire[] }
}

beforeAll(async () => {
  app = await liveApp({ name: 'embassy-visitors', viewport: { width: 1440, height: 1000 } })

  // A WORLD THAT SAYS IT IS THE OWNER'S. Nothing here checks that, which is the whole of criterion P31.
  const world = await fetch(`${app.api}/api/office/worlds`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'loquat',
      kind: 'remote',
      startedBy: { kind: 'person', id: THE_PERSON },
      databaseIdentity: LOQUAT_WORLD,
      standing: 'canonical',
      installation: 'loquat-installation',
    }),
  })
  expect(world.status, await world.clone().text()).toBe(201)

  // A VISITING AGENT WITH NO WORLD, which is what makes it a visitor rather than a citizen.
  const asked = await fetch(`${app.api}/api/office/visitors`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      handle: 'loquat-worker',
      name: 'The worker on loquat',
      role: 'worker',
      conversationPath: CONVERSATION,
      startDirectory: STARTED_IN,
      runtime: 'claude-code',
      sessionRecord: 'sess-loquat-1',
    }),
  })
  expect(asked.status, await asked.clone().text()).toBe(201)
  const issued = (await asked.json()) as { credential: CredentialOnTheWire; token: string }
  credentialId = issued.credential.id
  token = issued.token

  const confirmed = await fetch(`${app.api}/api/office/visitors/${credentialId}/confirm`, {
    method: 'POST',
    headers: AS_THE_OWNER,
  })
  expect(confirmed.status, await confirmed.clone().text()).toBe(200)

  // TWO REQUESTS UNDER IT, one of them from somewhere else, so the counts below are 2 and 1 rather
  // than 0 and 0 — and a page that drew zeroes could not pass.
  await fetch(`${app.api}/api/health`, {
    headers: {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': CONVERSATION,
      'x-mole-office-start-directory': STARTED_IN,
    },
  })
  await fetch(`${app.api}/api/health`, {
    headers: {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': CONVERSATION,
      'x-mole-office-start-directory': '/tmp/somewhere-else',
    },
  })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('P26 — the Embassy lists every trusted visitor, with what each has done', () => {
  it('carries who, the machine, the facts, the counts, who confirmed it and when it expires', async () => {
    const said = await embassy()
    const row = said.visitors.find((one) => one.id === credentialId)
    expect(row, 'the Embassy has no row for a credential this office issued').toBeDefined()

    expect(row?.handle).toBe('loquat-worker')
    expect(row?.standing).toBe('trusted')
    // A VISITOR HAS NO WORLD. That is what makes it one.
    expect(row?.world).toBeNull()
    expect(row?.facts.conversationPath).toBe(CONVERSATION)
    expect(row?.facts.startDirectory).toBe(STARTED_IN)
    // THE COUNTS ARE REAL AND NOT ZERO.
    expect(row?.requests, 'the request count is not what was actually asked').toBe(2)
    expect(row?.mismatches, 'the mismatch count is not what actually mismatched').toBe(1)
    // AND `writes` IS 0, because both requests were reads. This is the number a count built by
    // looking for POST would get wrong.
    expect(row?.writes).toBe(0)
    expect(row?.confirmedBy?.id).toBe(THE_PERSON)
    expect(row?.endsAt, 'the row does not say when the credential runs out').toBeTruthy()
  }, 60_000)

  /**
   * WHERE THE CREDENTIAL IS DRAWN, AFTER CRITERION P74.
   *
   * WHAT THIS CASE CHECKED BEFORE: a row in a panel of its own called Visiting agents, carrying the
   * credential's counts, whose name led to the credential's page.
   *
   * WHY IT CHANGED: criterion P74. A Visitors and a Visiting agents section are not needed,
   * because an agent is already read as online or offline. The Embassy is one list now, and a
   * CONFIRMED credential's agent is an ordinary row in it, because that is what P74 says it is: once
   * confirmed the row is an ordinary agent with its presence like every other, and the credential is
   * named on its profile.
   *
   * WHAT IT CHECKS NOW, AND IT IS THE SAME FACTS: the Embassy row names the credential and leads to
   * it, and the credential's own page carries the counts P26 asks for. Nothing P26 asked to be
   * readable has stopped being readable; it is one press further in, which is chapter 6's fifth
   * rule — a list locates, a detail page explains.
   */
  it('names the credential on the row and leads to it, and the counts are on its own page', async () => {
    await app.page.goto(`${app.site}/?mode=inspect#${pathFor('embassy')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.emb-row', { timeout: 20_000 })
    // THE LIST OPENS NARROWED TO CONTACTS, which it did before criterion P74 as well: the press and
    // its count are above the list, and a visiting agent is on nobody's contacts list. So this
    // presses it, which is what a person does, rather than asserting against the narrowed view.
    await app.page.click('.emb-show')
    await app.page.waitForFunction(
      () => document.querySelectorAll('.emb-row').length > 0,
      undefined,
      { timeout: 20_000 },
    )

    const rows = await app.page.$$eval('.emb-row', (all) => all.map((one) => one.textContent ?? ''))
    // BY THE NAME A READER SEES, not by the handle. The row draws the agent's name — the credential's
    // own, where no registry here holds it — and its handle is the address behind the link.
    const loquat = rows.find((one) => one.includes('The worker on loquat'))
    expect(loquat, 'the Embassy drew no row for the visiting agent').toBeDefined()
    expect(loquat, 'the row does not say which credential let it in').toContain(EMBASSY_WORDS.registeredOn)

    const href = await app.page.$eval(
      `.emb-row a[href="#${visitorPath(credentialId)}"]`,
      (one) => one.getAttribute('href') ?? '',
    )
    expect(href, 'the Embassy row does not lead to the credential').toBe(`#${visitorPath(credentialId)}`)

    // AND THE COUNTS, ON THE PAGE THAT PRESS OPENS. P26's numbers, one press further in.
    await app.page.goto(`${app.site}/?mode=inspect#${visitorPath(credentialId)}`)
    await waitForThePage(app.page, 30_000)
    const page = await app.page.$eval('body', (one) => one.textContent ?? '')
    expect(page).toContain(CREDENTIAL_WORDS.countMismatches)
    expect(page).toContain(CREDENTIAL_WORDS.expires)
  }, 120_000)
})

describe('P31 — a world’s claim to be the owner’s is a claim, and the Embassy says so', () => {
  it('carries the owner the world named and the sentence saying nothing checked it', async () => {
    const said = await embassy()
    const row = said.worlds.find((one) => one.world.databaseIdentity === LOQUAT_WORLD)
    expect(row, 'the Embassy has no row for a world the office holds').toBeDefined()
    expect(row?.owner?.id, 'the row does not carry who that world said started it').toBe(THE_PERSON)
    // THE SENTENCE TRAVELS ON THE ROW. Not in a document, not once at the top of the panel.
    expect(row?.ownerIsAClaim).toBe(A_WORLDS_OWNER_IS_A_CLAIM)
    expect(row?.ownerIsAClaim).toContain('Mole Office did not check it')
  }, 60_000)

  it('draws that sentence beside the owner, in the place a person reads it', async () => {
    await app.page.goto(`${app.site}/?mode=inspect#${pathFor('embassy')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.emb-world', { timeout: 20_000 })

    // THE CONTROL: the world row really drew, so a missing sentence means a missing sentence.
    const rows = await app.page.$$eval('.emb-world', (all) => all.map((one) => one.textContent ?? ''))
    const loquat = rows.find((one) => one.includes('loquat'))
    expect(loquat, 'the Embassy drew no row for loquat').toBeDefined()
    expect(loquat).toContain(EMBASSY_WORDS.worldOwner)
    expect(loquat, 'the world row draws an owner and does not say it is a claim').toContain(
      'Mole Office did not check it',
    )
  }, 120_000)
})

describe('P28 and P29 — the credential’s page says what it cannot prove, and a confirmation ends it', () => {
  it('draws all four of the things it cannot prove', async () => {
    await app.page.goto(`${app.site}/?mode=inspect#${visitorPath(credentialId)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.cred-limits', { timeout: 20_000 })

    const drawn = await app.page.$eval('.cred-limits', (one) => one.textContent ?? '')
    for (const sentence of WHAT_A_CREDENTIAL_CANNOT_PROVE) {
      expect(drawn, `the page does not say: ${sentence}`).toContain(sentence)
    }
    // AND WHAT A MISMATCH DOES, as a decision answers the facts half of Q2.
    expect(drawn).toContain('does not refuse the request')
    expect(drawn).not.toContain('has not been answered')
  }, 120_000)

  it('shows the mismatch with both facts on it', async () => {
    const drawn = await app.page.$eval('.cred-requests', (one) => one.textContent ?? '')
    expect(drawn, 'the page does not name what the credential was issued with').toContain(STARTED_IN)
    expect(drawn, 'the page does not name what the request sent').toContain('/tmp/somewhere-else')
  }, 60_000)

  it('ends it after confirmation, and the credential is refused afterwards', async () => {
    // The question is required before ending access.
    await app.page.getByRole('button', { name: CREDENTIAL_WORDS.end, exact: true }).click()
    await app.page.getByRole('dialog').getByRole('button', { name: CREDENTIAL_WORDS.end, exact: true }).click()
    await app.page.waitForFunction(
      (ended: string) => (document.querySelector('.panel-title, h2')?.textContent ?? '').includes(ended),
      CREDENTIAL_WORDS.standing.ended,
      { timeout: 20_000 },
    )

    const refused = await fetch(`${app.api}/api/health`, {
      headers: {
        'x-mole-office-credential': token,
        'x-mole-office-conversation': CONVERSATION,
        'x-mole-office-start-directory': STARTED_IN,
      },
    })
    expect(refused.status, 'the ended credential was still answered').toBe(403)
    expect(await refused.text()).toContain(credentialId)
  }, 120_000)
})
