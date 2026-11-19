// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON CHANGES THEIR NAME AND THEIR STATUS ON THEIR OWN PROFILE PAGE, AND THE SERVER KEEPS IT.
 *
 * Criterion M51 of design/messages/ACCEPTANCE.md section 18: a press on an avatar in the chat opened
 * Everything / Reports and notes rather than a profile page, and there was no way to change the
 * picture, the name or anything else.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY IT IS NOT THE PAGE ALONE
 * ---------------------------------------------------------------------------------------
 *
 * A page can show a new name in a box and send nothing. So the check is made from the OTHER side:
 * type the name in the browser, press keep, then ask the API what it holds. A page wired to no route
 * and a page wired to the wrong one both draw the same thing and neither survives that read.
 *
 * The editor on this page is the same component the Settings page draws, so the point of this test
 * is that the profile page really wires it to the participant routes — not that the component works,
 * which its own test already says.
 *
 * ---------------------------------------------------------------------------------------
 * AND THAT THE PAGE ONLY OFFERS IT WHERE THE DOOR WOULD ALLOW IT
 * ---------------------------------------------------------------------------------------
 *
 * A name is a person's own to set. The door refuses an agent's name being changed from a person's
 * page and refuses one person editing another. So the second case opens an AGENT'S profile and
 * asserts there is no editor on it — a press that is always refused is worse than no press.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case reads the name from the API BEFORE it types, and asserts the stored name is not
 * already the one it is about to type. Without that, a page that sent nothing at all would pass if
 * the name happened to match.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 * - Delete the `<YourAppearance …>` block from src/web/pages/ProfilePage.tsx: the first case fails,
 *   because there is no editor to type into.
 * - Change `onName` there to call nothing (drop the `run(api.changeParticipant(…))` line): the first
 *   case fails at the read-back, because the browser drew a new name and the server kept the old.
 * - Change `yours` there to `true`: the second case fails, because an agent's page then offers an
 *   editor the door would refuse.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { APPEARANCE_WORDS } from '../src/web/components/Appearance.tsx'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The name typed in, chosen so it cannot be what the registry already holds. */
const THE_NEW_NAME = `${THE_TEST_OFFICES_OWNER.name} the second`

/** What the registry holds for the person right now, straight from the API. */
async function nameHeldNow(): Promise<string> {
  const got = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  const held = (await got.json()) as { participant: { name: string } }
  return held.participant.name
}

beforeAll(async () => {
  app = await liveApp({ name: 'profile-edits', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Prof',
      data: { handle: 'builder-prof', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a person renames themselves on their own page and the server keeps it', () => {
  it('sends the typed name through the participant door', async () => {
    // THE CONTROL: the stored name is not already the one about to be typed, so a page that sends
    // nothing cannot pass this by luck.
    const before = await nameHeldNow()
    expect(before, 'the registry already holds the name this test types, so nothing is measured').not.toBe(
      THE_NEW_NAME,
    )

    await app.page.goto(`${app.site}/#${whoPath('person', THE_PERSON)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.app-body', { timeout: 20_000 })

    await app.page.click(`button[aria-label="${APPEARANCE_WORDS.editName}"]`)
    const box = await app.page.waitForSelector('.app-body input', { timeout: 20_000 })
    await box?.fill(THE_NEW_NAME)
    await app.page.click(`.app-body button:has-text("${APPEARANCE_WORDS.keep}")`)

    // READ BACK FROM THE SERVER, not from the screen. A page that drew the new name and sent
    // nothing draws exactly the same thing as one that sent it.
    await expect
      .poll(async () => nameHeldNow(), { timeout: 20_000 })
      .toBe(THE_NEW_NAME)
  }, 180_000)

  it('draws the name the server now holds when the page is opened again', async () => {
    await app.page.goto(`${app.site}/#${whoPath('person', THE_PERSON)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    const drawn = await app.page.$eval('.prof-name', (el) => el.textContent ?? '')
    expect(drawn, 'the profile page draws a name the registry does not hold').toBe(THE_NEW_NAME)
  }, 120_000)
})

describe('an agent’s page offers no editor, because the door would refuse one', () => {
  it('draws the agent and no name box', async () => {
    await app.page.goto(`${app.site}/#${whoPath('agent', 'builder-prof')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    // THE CONTROL: this really is the agent's page, so an absent editor means something.
    const drawn = await app.page.$eval('.prof-name', (el) => el.textContent ?? '')
    expect(drawn, 'this is not the agent’s page, so an absent editor measures nothing').toBe('Builder Prof')
    const editor = await app.page.$('.app-body')
    expect(editor, 'an agent’s profile offers an editor the participant door refuses').toBeNull()
  }, 120_000)
})
