// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "PROPOSED SHORT NAMES" IS ON THE AGENT'S OWN PAGE AND NOT ON THE SETTINGS PAGE.
 *
 * The Proposed short names panel does not belong in Settings. Criterion M50 of
 * design/messages/ACCEPTANCE.md section 18.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH HALVES ARE MEASURED, AND WHY NEITHER IS ENOUGH ALONE
 * ---------------------------------------------------------------------------------------
 *
 * "It left Settings" and "it arrived on the profile" are two different facts and a build can get
 * one without the other. Deleting the panel outright would pass an absence check on Settings and
 * lose the thing; adding it to the profile without taking it off Settings would pass a presence
 * check and leave the noise that had to go. So one case asserts the Settings page draws
 * no such panel, and the other asserts the agent's page draws exactly its own row.
 *
 * NOTHING ELSE ON THE SETTINGS PAGE CHANGES, which the first case also carries: the panels around
 * the one that left are counted, so a change that took the page apart while removing one panel
 * does not pass.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The Settings case waits for a panel that IS still there before asserting the one that is not, so
 * "no proposed names on Settings" cannot pass on a page that failed to draw at all. The profile
 * case asserts the profile really is the agent's page before asserting what is on it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 * - Put `<ProposedNamesPanel />` back on src/web/pages/SettingsPage.tsx: the first case fails.
 * - Delete `<ProposedNamesPanel only={who.id} />` from src/web/pages/ProfilePage.tsx: the second
 *   case fails.
 * - Drop the `only` filter in src/web/components/ProposedNames.tsx (return `everyRow`): the second
 *   case fails, because the agent's page then draws names about two other agents.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROPOSED_NAMES } from '../src/shared/participants.ts'
import { PROPOSED_NAME_WORDS } from '../src/web/components/ProposedNames.tsx'
import { whoPath, pathFor } from '../src/web/components/router.tsx'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The proposal this test drives. There is at least one; the case says so before it uses it. */
const THE_PROPOSAL = PROPOSED_NAMES[0]

/**
 * A SECOND PROPOSAL, REGISTERED SO THAT "ONLY ITS OWN" MEASURES SOMETHING.
 *
 * With one proposed agent registered there is one live row wherever it is drawn, so a page ignoring
 * `only` would draw exactly what a page honouring it draws and the assertion would pass either way.
 * Two registered agents is what makes the filter observable.
 */
const THE_OTHER = PROPOSED_NAMES[1]

beforeAll(async () => {
  app = await liveApp({ name: 'names-off-settings', viewport: { width: 1440, height: 1000 } })
  // THE AGENT THE PROPOSAL IS ABOUT HAS TO BE REGISTERED HERE, or the panel has nothing to draw
  // wherever it lives, and both cases below would pass on an empty installation.
  expect(THE_PROPOSAL, 'nothing is proposed, so this whole file measures nothing').toBeDefined()
  if (THE_PROPOSAL === undefined) return
  expect(THE_OTHER, 'only one name is proposed, so "only its own" measures nothing').toBeDefined()
  // WRITTEN AS LEGACY ROWS, STRAIGHT INTO THE STACK'S OWN DATABASE. `PROPOSED_NAMES` holds the ids of
  // agents on the owner's installation registered before the mint, so each one's id is its handle. A
  // registration through a door today mints a new id, which no proposal names. `join(app.dir,
  // 'panelx.db')` is the file the live server opens, as in a-contacts-row-says-the-state-of-the-conversation.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = '2026-09-02 10:00:00'
    for (const one of [THE_PROPOSAL, THE_OTHER]) {
      if (one === undefined) continue
      db.prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
          "'generated') ON CONFLICT(id) DO NOTHING",
      ).run(`avatar-default-agent-${one.id}`, at)
      db.prepare(
        'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) ' +
          "VALUES (?, ?, ?, ?, 0, ?, 'person', ?)",
      ).run(
        one.id,
        `A name that is a whole description of what ${one.id} does`,
        one.id,
        `avatar-default-agent-${one.id}`,
        at,
        THE_PERSON,
      )
    }
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the Settings page no longer carries it', () => {
  it('draws no proposed names, while still drawing the settings around them', async () => {
    await app.page.goto(`${app.site}/#${pathFor('settings')}`)
    await waitForThePage(app.page, 30_000)
    // THE CONTROL: the page really drew. Without this, a Settings page that failed to render at all
    // would pass "there are no proposed names on it".
    await app.page.waitForSelector('.set-title', { timeout: 20_000 })
    // One category is drawn at a time (wave 13y round 125): each is chosen in turn, so every panel is drawn once and
    // read while it is drawn.
    // WHICH PARTS OF THE SCREEN THE PAGE DECLARES, read off the one attribute that carries them.
    // `TARGET_ATTRIBUTE` is asked for rather than typed, so renaming it moves this test with it.
    const panels: string[] = []
    let proposedRows = 0
    let words = ''
    await readEverySettingsCategory(app.page, async () => {
      panels.push(...(await app.page.$$eval(
        `.set [${TARGET_ATTRIBUTE}]`,
        (all, attribute: string) => all.map((one) => one.getAttribute(attribute) ?? ''),
        TARGET_ATTRIBUTE,
      )))
      proposedRows += await app.page.$$eval('.prn-row', (all) => all.length)
      words += `${await app.page.evaluate(() => document.body.textContent ?? '')}\n`
    })
    expect(panels.length, 'the Settings page drew no panels at all, so nothing below is measured').toBeGreaterThan(4)
    expect(panels, 'the proposed names are still declared on the Settings page').not.toContain(
      targetAttributeValue({ kind: 'uiSurface', surfaceId: 'settings.shortnames' }),
    )
    expect(panels, 'the profile’s panel is being drawn on the Settings page').not.toContain(
      targetAttributeValue({ kind: 'uiSurface', surfaceId: 'profile.shortname' }),
    )
    expect(proposedRows, 'a proposed name is drawn on Settings').toBe(0)

    expect(words, 'the Settings page still says "Proposed short names"').not.toContain(PROPOSED_NAME_WORDS.title)
  }, 120_000)
})

describe('the agent’s own page carries it, and only its own', () => {
  it('draws the one row that is about this agent', async () => {
    if (THE_PROPOSAL === undefined) return
    await app.page.goto(`${app.site}/#${whoPath('agent', THE_PROPOSAL.id)}`)
    await waitForThePage(app.page, 30_000)
    // THE CONTROL: this really is that agent's page.
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    await app.page.waitForSelector('.prn-row', { timeout: 20_000 })

    const words = await app.page.evaluate(() => document.body.textContent ?? '')
    expect(words, 'the agent’s page does not say "Proposed short names"').toContain(PROPOSED_NAME_WORDS.title)

    const drawn = await app.page.$$eval('.prn-row', (all) =>
      all.map((one) => one.getAttribute('data-agent') ?? ''),
    )
    expect(drawn, 'this page draws a name proposed for somebody else').toEqual([THE_PROPOSAL.id])
    // AND THE OTHER ONE IS REALLY LIVE, so the assertion above is a filter working rather than a
    // list that had one row anyway. Its own page draws its own row.
    if (THE_OTHER === undefined) return
    await app.page.goto(`${app.site}/#${whoPath('agent', THE_OTHER.id)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.prn-row', { timeout: 20_000 })
    const theirs = await app.page.$$eval('.prn-row', (all) =>
      all.map((one) => one.getAttribute('data-agent') ?? ''),
    )
    expect(theirs, 'the second agent’s page does not draw its own row').toEqual([THE_OTHER.id])
  }, 120_000)
})
