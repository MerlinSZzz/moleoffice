// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUPS TAB FOLDS THE GROUPS THE READER IS NOT IN.
 *
 * Criterion SC1 of design/messages/SECRETARIAT-CHAT-ACCEPTANCE.md, amended 24 September 2026
 * and widened the same day: groups are drawn in
 * three categories — pinned (the office's standing Secretariat group), then every other group the
 * reader is a member of that a person or an agent opened, open, under the default grouping; last,
 * every group the office opened by itself and every group the reader is not a member of, folded
 * under one heading and opened by one press. The heading says how many it holds and is drawn only
 * when it holds one. Nothing is removed.
 *
 * Every group this file makes is opened by hand, by the owner. So the groups the owner is in stay open and
 * the groups the owner is not in fold, as before the widening. The office-opened groups are proved in
 * tests/the-groups-tab-folds-the-groups-the-office-opened.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, in part in a real browser against a real server
 * ---------------------------------------------------------------------------------------
 *
 *   1. The pure rule: `whereEachGroupSits` keeps the server's order, puts every group in exactly
 *      one of its three lists, and keeps the pinned group apart even though `yours` names it.
 *   2. Before any group the owner is not in exists, the tab draws no folded category at all. Then thirty
 *      such groups are seeded, shaped like the owner's (refused-release and overlap groups).
 *   3. The fold is closed at first, says how many groups wait inside, opens and closes on one
 *      press per state, and holds exactly the groups whose ids are not in `yours` (none of this
 *      file's groups is office-opened).
 *   4. Every group is drawn exactly once across the three categories, and no group heading carries
 *      a message count (criterion M123).
 *   5. Edit reaches a row inside the opened fold: the remove presses appear on it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN EACH CASE RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each mutation was made, the named case run red, and the line put back byte for byte.
 *   - The pure case: the `if (group.pinned)` branch is removed, so the pinned group falls into
 *     `yours` (or, being office-opened, into `folded`) and the pinned list is empty.
 *   - The membership case: the default list is drawn from every non-pinned group, so a group the owner is
 *     not in appears open under Default group.
 *   - The empty case: the fold section is drawn always, so it is drawn while it holds no group.
 *   - The count: the heading's number is summed from the groups' unread messages, which is 0.
 *   - The Edit case: the fold's rows are drawn with `editing={false}`, so no remove press appears.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONTACT_GROUP_WORDS } from '../src/shared/contacts.ts'
import { moleOffice } from '../src/shared/participants.ts'
// A NAMESPACE IMPORT so the pure case asks for the function at the moment it runs, and the file can
// also be loaded on the unchanged tip for a "before" picture set.
import * as groupLines from '../src/shared/groups.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** How many groups of each kind this world holds, so a case can say what it expects. */
const THE_OWNERS_GROUPS = 30
const THEIR_GROUPS = 30

/** The agents who stand in the groups the person is not in, so each such group has a member. */
const THEIR_MEMBERS = [
  { handle: 'fold-ada', name: 'Ada' },
  { handle: 'fold-bruno', name: 'Bruno（布鲁诺）' },
  { handle: 'fold-cleo', name: 'Cleo - the reviewer' },
] as const

/**
 * A GROUP THE OWNER IS IN, and one the owner is not, named the two ways the owner's own office names them: a
 * refused release and a pair of claimants overlapping on a file.
 */
function theOwnersGroupName(at: number): string {
  return `The owner's overlap group ${String(at).padStart(2, '0')}`
}
function theirGroupName(at: number): string {
  return at % 2 === 0
    ? `Refused release: fold-worker-${String(at)}`
    : `fold-worker-${String(at)} and fold-worker-${String(at + 1)} on tests/the-fold.test.ts`
}

beforeAll(async () => {
  app = await liveApp({ name: 'groups-fold', viewport: { width: 1440, height: 1000 } })
  // THE PAGE'S READ OF THE GROUPS WAITS A MOMENT BEFORE IT IS SENT, on every load.
  // `THE_GROUPS_ARE_HELD_MS` says why.
  await app.page.route(
    (url) => url.pathname === '/api/groups',
    async (route) => {
      if (route.request().method() === 'GET') await new Promise((wake) => setTimeout(wake, THE_GROUPS_ARE_HELD_MS))
      await route.continue()
    },
  )

  // THE AGENTS STAND IN THE GROUPS THE OWNER IS NOT IN. One is enough per group; the door does not require
  // the opener to be a member, so the person can open a group they are not in.
  for (const one of THEIR_MEMBERS) {
    const made = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ handle: one.handle, name: one.name, runtime: 'claude-code' }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }

  // THIRTY GROUPS THE OWNER IS IN, so the open section is as tall as the owner's and the fold has an open
  // category to sit under. The person is the member, as a group they made themselves would be.
  for (let at = 1; at <= THE_OWNERS_GROUPS; at++) {
    const made = await fetch(`${app.api}/api/groups`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        name: theOwnersGroupName(at),
        because: 'Two agents claimed the same files and neither would go first.',
        members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' }],
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every group this world holds, and the ids the reader is in, read from the one door. */
interface TheGroups {
  groups: { id: string; name: string; pinned: boolean; unread: number; openedBy: { kind: string; id: string } }[]
  yours: string[]
}

async function readTheGroups(): Promise<TheGroups> {
  const reply = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as TheGroups
}

/**
 * HOW LONG THE PAGE'S READ OF THE GROUPS IS HELD BEFORE IT IS SENT.
 *
 * The Groups tab is drawn the moment it is pressed, and its rows come from a separate read. Until that
 * read answers, the tab draws "Reading the groups…" and no rows. Under a loaded machine the first case
 * counted the rows in that gap, found none, and stopped before it seeded the groups the next cases
 * need (the merge queue's run zvMSAii34s5e). Holding the read here makes that gap happen on every
 * run, so a case that reads the tab before its rows are drawn fails every time.
 */
const THE_GROUPS_ARE_HELD_MS = 1500

/** Open the panel, leave it drawing the Groups tab, and wait until the tab has read its groups. */
async function openTheGroups(): Promise<void> {
  // A HARD LOAD, so the panel reads the groups this case seeded. A goto to the same hash is a
  // same-document navigation and reloads nothing, so an earlier case's read would still stand.
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openTheChatBeside(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  // THE ROWS ARE DRAWN ONCE THE READ HAS ANSWERED. The tab draws this sentence until the page has
  // read the groups, and takes it away when that read has put them in place.
  await app.page.waitForFunction(
    () => {
      const tab = document.querySelector('.px-chat-under-tabs[data-showing="groups"]')
      return tab !== null && !(tab.textContent ?? '').includes('Reading the groups…')
    },
    undefined,
    { timeout: 30_000 },
  )
}

/** The shape the tab draws, read once so every count below is from the same drawing. */
interface TheTabShape {
  hasSection: boolean
  heading: string
  count: string
  expanded: string | null
  unreadInHeadings: number
  foldNames: string[]
  defaultNames: string[]
  pinnedNames: string[]
  allNames: string[]
  foldRemovePresses: number
}

async function readTheTab(): Promise<TheTabShape> {
  return app.page.evaluate(() => {
    const tab = document.querySelector('.px-chat-under-tabs[data-showing="groups"]')
    const section = tab?.querySelector('.px-chat-top-group[data-category="folded"]') ?? null
    const scoped = (one: Element | null | undefined): Element | null => one ?? null
    const namesIn = (scope: Element | null): string[] =>
      Array.from(scope?.querySelectorAll('.px-chat-contact .px-chat-name') ?? []).map(
        (one) => one.textContent?.trim() ?? '',
      )
    return {
      hasSection: section !== null,
      heading: section?.querySelector('.px-chat-top-name')?.textContent?.trim() ?? '',
      count: section?.querySelector('.px-chat-top-count')?.textContent?.trim() ?? '',
      expanded: section?.querySelector('.px-chat-fold')?.getAttribute('aria-expanded') ?? null,
      unreadInHeadings: tab?.querySelectorAll('.px-chat-top-heading .px-chat-unread').length ?? 0,
      foldNames: namesIn(section),
      defaultNames: namesIn(scoped(tab?.querySelector('.px-chat-top-group[data-category="default"]'))),
      pinnedNames: namesIn(scoped(tab?.querySelector('.px-chat-top-group[data-category="pinned"]'))),
      allNames: namesIn(scoped(tab)),
      foldRemovePresses: section?.querySelectorAll('.px-chat-place button').length ?? 0,
    }
  })
}

/** Put the fold in the asked state with one press, and wait until the tab agrees. */
async function setTheFold(want: 'true' | 'false'): Promise<void> {
  const now =
    (await app.page.$eval(
      '.px-chat-top-group[data-category="folded"] .px-chat-fold',
      (one) => one.getAttribute('aria-expanded'),
    ).catch(() => null)) ?? null
  if (now === want) return
  await app.page.click('.px-chat-top-group[data-category="folded"] .px-chat-fold')
  await app.page.waitForFunction(
    (wanted: string) =>
      document
        .querySelector('.px-chat-top-group[data-category="folded"] .px-chat-fold')
        ?.getAttribute('aria-expanded') === wanted,
    want,
    { timeout: 20_000 },
  )
}

describe('where each group sits', () => {
  it('keeps the order and puts every group in exactly one list, the pinned group apart', () => {
    // EVERY GROUP HERE BUT THE PINNED ONE WAS OPENED BY HAND, so membership alone decides where
    // it sits. The office-opened groups are the next file's case.
    const byHand = { kind: 'person' as const, id: THE_PERSON }
    const groups = [
      { id: 'one', pinned: false, openedBy: byHand },
      { id: 'secretariat', pinned: true, openedBy: moleOffice() },
      { id: 'two', pinned: false, openedBy: byHand },
      { id: 'three', pinned: false, openedBy: byHand },
      { id: 'four', pinned: false, openedBy: byHand },
    ]
    // THE PINNED GROUP'S ID IS ALSO IN `yours`: the office's standing group is one the reader is a
    // member of, so a rule that sorts by membership alone would draw it twice.
    const sat = groupLines.whereEachGroupSits(groups, ['two', 'secretariat', 'four'])

    // THE CONTROL: every group comes back, so a function dropping one cannot pass the placement.
    const all = [...sat.pinned, ...sat.yours, ...sat.folded].map((one) => one.id)
    expect(all.length, 'a group was dropped or drawn twice').toBe(groups.length)
    expect([...all].sort()).toEqual(groups.map((one) => one.id).sort())
    // THE ORDER IS THE SERVER'S WITHIN EACH LIST.
    expect(sat.pinned.map((one) => one.id)).toEqual(['secretariat'])
    expect(sat.yours.map((one) => one.id)).toEqual(['two', 'four'])
    expect(sat.folded.map((one) => one.id)).toEqual(['one', 'three'])
    // AND THE PINNED GROUP IS APART even though `yours` names it.
    expect(sat.yours.map((one) => one.id), 'the pinned group is also in the owner\'s own list').not.toContain(
      'secretariat',
    )
    expect(sat.folded.map((one) => one.id)).not.toContain('secretariat')
  })
})

describe('the Groups tab folds the groups the owner is not in', () => {
  it('draws no fold while every group is one the owner is in, then seeds the rest', async () => {
    await openTheGroups()
    const before = await readTheGroups()
    const notTheOwners = before.groups.filter(
      (one) => !one.pinned && !before.yours.includes(one.id),
    )
    // THE CONTROL: the tab drew the owner's own groups at all, so a page that drew nothing cannot pass.
    expect(
      await app.page.$$('.px-chat-top-group[data-category="default"] .px-chat-contact'),
      'the fresh world draws no group the owner is in',
    ).not.toHaveLength(0)

    // A FRESH WORLD HOLDS NO GROUP THE OWNER IS NOT IN besides the office's own standing group.
    expect(
      notTheOwners.map((one) => one.name),
      'the fresh world already holds a group the owner is not in; this case needs a world with none',
    ).toEqual([])
    // AND THEN NO FOLDED CATEGORY IS DRAWN. The fold is drawn only while it holds a group.
    expect(
      await app.page.$$('.px-chat-top-group[data-category="folded"]'),
      'the fold is drawn while it holds no group',
    ).toHaveLength(0)

    // THE THIRTY GROUPS THE OWNER IS NOT IN, shaped like the owner's office: refused releases and pairs of
    // claimants overlapping on a file. Each gets one agent, never the person.
    for (let at = 1; at <= THEIR_GROUPS; at++) {
      const member = THEIR_MEMBERS[at % THEIR_MEMBERS.length] as (typeof THEIR_MEMBERS)[number]
      const made = await fetch(`${app.api}/api/groups`, {
        method: 'POST',
        headers: AS_THE_OWNER,
        body: JSON.stringify({
          name: theirGroupName(at),
          because: 'The inspector refused the release, or two agents claimed the same file.',
          members: [{ who: { kind: 'agent', id: member.handle }, because: 'It is a claimant.' }],
        }),
      })
      expect(made.status, await made.clone().text()).toBe(201)
    }
    const after = await readTheGroups()
    expect(
      after.groups.filter((one) => !one.pinned && !after.yours.includes(one.id)).length,
      'the seeded groups the owner is not in are not there',
    ).toBe(THEIR_GROUPS)
  }, 300_000)

  it('is closed at first with its count, opens and closes on one press, and holds exactly the rest', async () => {
    await openTheGroups()
    const truth = await readTheGroups()
    const nonPinned = truth.groups.filter((one) => !one.pinned)
    const theOwnersNames = nonPinned.filter((one) => truth.yours.includes(one.id)).map((one) => one.name)
    const notTheOwnersNames = nonPinned.filter((one) => !truth.yours.includes(one.id)).map((one) => one.name)
    const allNames = truth.groups.map((one) => one.name)

    // THE CONTROL: no group here was opened by the office, so membership alone decides where each
    // unpinned group sits and the two lists below are what the tab must draw.
    expect(
      nonPinned.filter((one) => one.openedBy.kind === moleOffice().kind && one.openedBy.id === moleOffice().id).map((one) => one.name),
      'this world holds an office-opened group, which the fold would hold whatever the membership',
    ).toEqual([])
    // THE CONTROL: both kinds are seeded, so an empty world cannot pass the placement below.
    expect(theOwnersNames.length, 'the world holds no group the owner is in').toBe(THE_OWNERS_GROUPS)
    expect(notTheOwnersNames.length, 'the world holds no group the owner is not in').toBe(THEIR_GROUPS)

    const closed = await readTheTab()
    expect(closed.hasSection, 'the folded category is not drawn').toBe(true)
    expect(closed.heading, 'the folded heading does not say what it holds').toBe(
      CONTACT_GROUP_WORDS.officeOpenedAndNotYourGroups,
    )
    expect(closed.count, 'the folded heading does not say how many groups wait inside').toBe(
      String(notTheOwnersNames.length),
    )
    expect(closed.expanded, 'the fold is not closed at first').toBe('false')
    expect(closed.foldNames, 'a group is drawn inside a closed fold').toEqual([])
    expect(closed.defaultNames, 'the open section is not exactly the groups the owner is in').toEqual(theOwnersNames)
    expect(closed.pinnedNames, 'the pinned section is not the office standing group').toEqual([
      'Secretariat',
    ])
    // NO GROUP HEADING CARRIES A MESSAGE COUNT, criterion M123. The quiet number is its own class.
    expect(closed.unreadInHeadings, 'a group heading carries an unread badge').toBe(0)

    // ONE PRESS OPENS IT, and the rows are exactly the groups the owner is not in, in the server's order.
    await setTheFold('true')
    const opened = await readTheTab()
    expect(opened.expanded, 'one press did not open the fold').toBe('true')
    expect(opened.foldNames, 'the opened fold does not hold exactly the groups the owner is not in').toEqual(
      notTheOwnersNames,
    )
    expect(opened.defaultNames, 'a group the owner is not in is still open under Default group').toEqual(
      theOwnersNames,
    )
    // EVERY GROUP IS DRAWN EXACTLY ONCE across the three categories.
    const drawn = [...opened.pinnedNames, ...opened.defaultNames, ...opened.foldNames]
    expect(drawn.length, 'a group is drawn twice or lost').toBe(allNames.length)
    expect([...drawn].sort()).toEqual([...allNames].sort())

    // ONE MORE PRESS CLOSES IT.
    await setTheFold('false')
    const closedAgain = await readTheTab()
    expect(closedAgain.expanded, 'one press did not close the fold').toBe('false')
    expect(closedAgain.foldNames, 'a group is drawn inside the closed fold again').toEqual([])
  }, 180_000)

  it('reaches a row inside the opened fold with Edit', async () => {
    await openTheGroups()
    await setTheFold('true')
    await app.page.waitForSelector('.px-chat-top-group[data-category="folded"] .px-chat-contact', {
      timeout: 20_000,
    })
    // THE CONTROL: the rows are drawn, and Edit is off so no remove press is on them yet.
    const rows = await app.page.$$('.px-chat-top-group[data-category="folded"] .px-chat-contact')
    expect(rows.length, 'the opened fold draws no row').toBeGreaterThan(0)
    const before = await readTheTab()
    expect(before.foldRemovePresses, 'a remove press is drawn before Edit is on').toBe(0)

    // EDIT IS THE DEFAULT SECTION'S, and it reaches the rows inside the fold.
    await app.page.click('.px-chat-top-group[data-category="default"] .px-chat-edit')
    await app.page.waitForFunction(
      () =>
        (document.querySelectorAll(
          '.px-chat-top-group[data-category="folded"] .px-chat-place button',
        ).length ?? 0) > 0,
      undefined,
      { timeout: 20_000 },
    )
    const after = await readTheTab()
    expect(after.foldRemovePresses, 'Edit does not reach a row inside the opened fold').toBeGreaterThan(0)
  }, 180_000)
})

/**
 * THE PICTURES. Chapter 6 rule 1: the Groups tab with the fold closed and with it open, at 1440,
 * 990, 660 and 390 pixels wide, in light and dark.
 *
 * IT IS GATED, like every other photographing case here: taking pictures is not a check. Run it
 * with SF_GROUPS_FOLD_SHOTS naming the directory the pictures go in. It runs after the case that
 * seeds the groups the owner is not in, so the fold holds the owner's shape.
 */
describe('the Groups fold is looked at', () => {
  it.skipIf(!process.env['SF_GROUPS_FOLD_SHOTS'])(
    'photographs the tab with the fold closed and with it open',
    async () => {
      const shots = process.env['SF_GROUPS_FOLD_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const widths = [1440, 990, 660, 390]
      const themes = ['light', 'dark'] as const

      await openTheGroups()
      await setTheFold('false')
      /**
       * THE FOLD SITS BELOW EVERY GROUP THE OWNER IS IN, as it does in the owner's office. The picture
       * scrolls the tab until the fold's heading is at the top, so the closed heading and its count
       * are in the frame; the open picture shows the rows below it.
       */
      const scrollToTheFold = async (): Promise<void> => {
        await app.page.evaluate(() => {
          document
            .querySelector('.px-chat-top-group[data-category="folded"]')
            ?.scrollIntoView({ block: 'start' })
        })
        await app.page.waitForTimeout(100)
      }
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await scrollToTheFold()
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/groups-fold-closed-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await setTheFold('true')
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await scrollToTheFold()
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/groups-fold-open-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
