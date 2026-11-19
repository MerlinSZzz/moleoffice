// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY LISTS EVERY CITIZEN AND EVERY VISITOR, WITH CONTACTS SHOWN AND THE REST ON REQUEST.
 *
 * Criterion M52 of design/messages/ACCEPTANCE.md section 18: an Embassy under World lists every known
 * citizen and visitor of the world, above all those registered as contacts, and by default shows
 * only the contacts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY A VISITOR FROM ANOTHER WORLD IS THE ONE THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * Everybody in this database's two registries is on the reader's contacts list, so on the rows this
 * installation makes by itself the default view and the full view are the same list — a page that
 * ignored the filter entirely would pass. A visitor from ANOTHER world need not be registered here,
 * and is therefore on nobody's contacts list. That row is the difference between the two views, so
 * the test registers one and asserts it is absent by default and present after the press.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Before pressing anything the test asserts the default view is NOT empty — it draws the citizens
 * this installation holds. Without that, a page that failed to render at all would pass "the
 * stranger is not shown by default".
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 * - In src/web/pages/EmbassyPage.tsx change `shown` to return `rows` unfiltered: the first case
 *   fails, because the stranger is drawn before anything is pressed.
 * - In the same file change `shown` to always filter by `one.contact`: the second case fails,
 *   because pressing "Show everyone" then shows nobody new.
 * - In src/server/api/office.ts drop the visits loop from `theEmbassy`: the visitor-row case and the
 *   "show everyone" case both fail, because the stranger has no row at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor, whoPath } from '../src/web/components/router.tsx'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A CALLER FROM ANOTHER WORLD, registered as a visitor and in no registry here.
 *
 * The id is a name no registry answers to, which is the point: the embassy knows about it from the
 * visit alone, and nobody could have it as a contact.
 */
const THE_STRANGER = 'ambassador-from-elsewhere'

/** The world it says it came from. Sixteen hex characters is what a database identity is. */
const ANOTHER_WORLD = 'aaaabbbbccccdddd'

/** Which participants the embassy draws right now, read off the rows. */
async function drawn(): Promise<string[]> {
  return app.page.$$eval('.emb-row .emb-name', (all) => all.map((one) => one.getAttribute('href') ?? ''))
}

/** An agent registered HERE, so the default view has a contact citizen to draw. */
const THE_NEIGHBOUR = 'builder-embassy'

/** The registry id the office gave that agent. Its row links to its page by this id, not the handle. */
let theNeighboursId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'embassy', viewport: { width: 1440, height: 1000 } })

  // A CITIZEN OF THIS WORLD WHO IS ALSO A CONTACT. A fresh installation holds only the person
  // reading and Mole Office, and neither is on anybody's contacts list — the reader is themselves
  // and Mole Office writes system lines and reads no reply. Without a third registration the
  // default view is empty and the control below would measure nothing.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Embassy',
      data: { handle: THE_NEIGHBOUR, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const everyone = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await everyone.json()) as { agents: { id: string; handle: string }[] }).agents
  theNeighboursId = agents.find((one) => one.handle === THE_NEIGHBOUR)?.id ?? ''
  expect(theNeighboursId).not.toBe('')

  // A VISIT FROM A WORLD THAT IS NOT THIS ONE. `POST /api/office/visits` is the door a caller
  // registers a trip at, and it is what the office reads.
  const trip = await fetch(`${app.api}/api/office/visits`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      visitor: { kind: 'agent', id: THE_STRANGER },
      fromWorld: ANOTHER_WORLD,
      why: 'reading the plan this project keeps',
    }),
  })
  expect(trip.status, await trip.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the office knows about a caller no registry here holds', () => {
  it('has a visitor row for it, saying which world it came from and when', async () => {
    const got = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_OWNER })
    expect(got.status, await got.clone().text()).toBe(200)
    const said = (await got.json()) as {
      rows: {
        standing: string
        who: { kind: string; id: string }
        registered: boolean
        fromWorld: string | null
        since: string | null
        contact: boolean
      }[]
    }
    const row = said.rows.find((one) => one.who.id === THE_STRANGER)
    expect(row, 'the embassy has no row for a visitor the office registered').toBeDefined()
    expect(row?.standing, 'the visitor is filed as something other than a visitor').toBe('visitor')
    expect(row?.registered, 'a caller no registry holds is reported as registered here').toBe(false)
    expect(row?.fromWorld, 'the row does not say which world the visitor came from').toBe(ANOTHER_WORLD)
    expect(row?.since, 'the row does not say when the trip began').not.toBeNull()
    expect(row?.contact, 'somebody nobody registered is on the contacts list').toBe(false)

    // AND THE CITIZENS ARE THERE TOO, so this file is measuring a list with both halves in it.
    expect(
      said.rows.some((one) => one.standing === 'citizen'),
      'the embassy lists no citizen at all, so the two panels cannot be told apart',
    ).toBe(true)
  }, 60_000)
})

describe('contacts are shown by default and everyone on request', () => {
  it('does not draw the stranger until "show everyone" is pressed', async () => {
    await app.page.goto(`${app.site}/#${pathFor('embassy')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.emb-row', { timeout: 20_000 })

    // THE CONTROL: the default view is not empty. Without this, a page that drew nothing would pass.
    const first = await drawn()
    expect(first.length, 'the embassy drew no rows at all, so nothing below is measured').toBeGreaterThan(0)
    expect(first, 'the citizen who IS a contact is missing, so the default view is not what it claims').toContain(
      `#${whoPath('agent', theNeighboursId)}`,
    )
    expect(first, 'a caller nobody registered is shown before "show everyone" is pressed').not.toContain(
      `#${whoPath('agent', THE_STRANGER)}`,
    )
  }, 120_000)

  it('draws the stranger once it is pressed, and links the row to their page', async () => {
    await app.page.click('.emb-show')
    await app.page.waitForFunction(
      (href: string) =>
        [...document.querySelectorAll('.emb-row .emb-name')].some((one) => one.getAttribute('href') === href),
      `#${whoPath('agent', THE_STRANGER)}`,
      { timeout: 20_000 },
    )
    const after = await drawn()
    expect(after, 'pressing "show everyone" did not bring in the visitor from another world').toContain(
      `#${whoPath('agent', THE_STRANGER)}`,
    )
    // AND THE PRESS SAYS WHAT IT WOULD DO NEXT, so it is a switch rather than a one-way door.
    const words = await app.page.$eval('.emb-show', (one) => one.textContent ?? '')
    expect(words, 'the press does not offer to narrow the list again').toContain(EMBASSY_WORDS.showContactsOnly)
  }, 120_000)

  it('is reached from the Worlds page, which is where the person\'s words put it', async () => {
    await app.page.goto(`${app.site}/#${pathFor('worlds')}`)
    await waitForThePage(app.page, 30_000)
    // THE CONTROL: the Worlds page really drew, so a missing link means a missing link.
    await app.page.waitForSelector('.wd-title', { timeout: 20_000 })
    const to = await app.page.$eval('.wd-embassy', (one) => one.getAttribute('href') ?? '')
    expect(to, 'the Worlds page does not lead to the embassy').toBe(`#${pathFor('embassy')}`)
  }, 120_000)
})
