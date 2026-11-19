// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUPS TAB FOLDS THE GROUPS MOLE OFFICE OPENED, THE PERSON'S AND UNREAD ONES INCLUDED.
 *
 * One decision, that groups fold and unread ones fold too, widens criterion SC1 of
 * design/messages/SECRETARIAT-CHAT-ACCEPTANCE.md as another decision amended
 * it. The Groups tab draws three categories: the pinned Secretaries; the
 * default grouping, holding every group the person is in that a person or an agent opened, open; and one fold, holding
 * every group the office opened by itself and every group the person is not in. A group the office opened goes in the
 * fold even when the person is a member and even when it holds unread messages. The fold goes by who opened the group,
 * because a membership row does not record who added the member.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. The pure rule: `whereEachGroupSits` over a pinned group, a hand-opened group the person is in, a
 *      hand-opened group the person is not in, an office-opened group the person is in and an office-opened group the person
 *      is not in. Each lands once, in the right list, in the given order.
 *   2. In a real browser against a real server: two agents claim the same path, so the office opens
 *      a group through its own door with the owner as a member, and an agent writes a message into
 *      it. That group is not under the default grouping. It is in the closed fold, whose heading
 *      reads the new words and the count. One press opens the fold and the row is there, bold. A
 *      group the owner opened by hand, that the owner is in, is still open under the default grouping.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN EACH CASE RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   - The pure case: `theOfficeOpenedIt` in src/shared/groups.ts always answers false, so the
 *     office-opened group the person is in lands in `yours`.
 *   - The browser case: `whereEachGroupSits` folds by membership alone again (the line reads
 *     `else if (mine.has(group.id)) his.push(group)`), so the office-opened group is drawn open
 *     under the default grouping.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONTACT_GROUP_WORDS } from '../src/shared/contacts.ts'
import { moleOffice } from '../src/shared/participants.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { whereEachGroupSits } from '../src/shared/groups.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

/** The two agents whose claims on one path make the office open a group. */
const CLAIMANTS = ['fold-office-ada', 'fold-office-bruno'] as const
/** The one path both claim. */
const THE_PATH = 'src/fold-office/the-same-file.ts'
/** The groups the owner opens by hand with themselves in them, so the default grouping has rows. */
const THEIR_OWN = ['The person’s own group one', 'The person’s own group two', 'The person’s own group three'] as const

/** The group the office opened for the two claims, read back from the door that opened it. */
let officeGroup = { id: '', name: '' }

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return await res.json()
}

/** Every group this world holds, and the ids the reader is in, read from the one door. */
interface TheGroups {
  groups: {
    id: string
    name: string
    pinned: boolean
    unread: number
    anythingUnread: boolean
    openedBy: ParticipantRef
  }[]
  yours: string[]
}

async function readTheGroups(): Promise<TheGroups> {
  const reply = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as TheGroups
}

beforeAll(async () => {
  app = await liveApp({ name: 'groups-fold-office', viewport: { width: 1440, height: 1000 } })

  // GROUPS THE OWNER OPENS BY HAND, with the owner as the member. These stay open.
  for (const name of THEIR_OWN) {
    await post(
      '/api/groups',
      {
        name,
        because: 'The owner opened it to talk about one piece of work.',
        members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' }],
      },
      AS_THE_OWNER,
    )
  }

  // TWO AGENTS CLAIM THE SAME PATH. The second claim makes the office open a group for the pair
  // through its own door, `openTheGroupForAnOverlap` in src/server/lib/claims.ts, with the owner
  // added as a member.
  const opened: string[] = []
  for (const handle of CLAIMANTS) {
    await post(
      '/api/records',
      { kind: 'agent', title: `Agent ${handle}`, data: { handle, state: 'active', runtime: 'claude-code', workArea: ['src'] } },
      AS_THE_OWNER,
    )
    const run = (await post(
      '/api/records',
      { kind: 'session', title: `${handle} on the same file`, data: { state: 'running', runtime: 'claude-code' } },
      asAgent(handle),
    )) as { record: { id: string } }
    const filed = (await post(
      '/api/claims',
      { run: run.record.id, things: [{ what: 'path', id: THE_PATH }] },
      asAgent(handle),
    )) as { groupsOpened: string[] }
    opened.push(...filed.groupsOpened)
  }
  expect(opened, 'two claims on one path open exactly one group').toHaveLength(1)

  // AN AGENT WRITES INTO IT, so it holds a message the owner has not read.
  await post(
    '/api/records',
    {
      kind: 'message',
      title: 'I will go first on the file',
      data: { body: 'I will go first on the file, then hand it over.', toGroup: opened[0] },
    },
    asAgent(CLAIMANTS[0]),
  )

  const truth = await readTheGroups()
  const found = truth.groups.find((one) => one.id === opened[0])
  if (found === undefined) throw new Error(`the group ${String(opened[0])} was opened and then could not be read back`)
  officeGroup = { id: found.id, name: found.name }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the panel and leave it drawing the Groups tab, after a hard load so the fold starts closed. */
async function openTheGroups(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  if ((await app.page.$('.px-chat')) === null) {
    await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await app.page.click('.px-chat-circle')
  }
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-top-group[data-category="default"] .px-chat-contact', { timeout: 20_000 })
}

/** The shape the tab draws, read once so every count below is from the same drawing. */
interface TheTabShape {
  hasFold: boolean
  heading: string
  count: string
  expanded: string | null
  foldNames: string[]
  defaultNames: string[]
  officeRow: { unread: string | null; weight: number } | null
}

async function readTheTab(officeName: string): Promise<TheTabShape> {
  return app.page.evaluate((name: string) => {
    const tab = document.querySelector('.px-chat-under-tabs[data-showing="groups"]')
    const fold = tab?.querySelector('.px-chat-top-group[data-category="folded"]') ?? null
    const namesIn = (scope: Element | null | undefined): string[] =>
      Array.from(scope?.querySelectorAll('.px-chat-contact .px-chat-name') ?? []).map(
        (one) => one.textContent?.trim() ?? '',
      )
    const nameInFold = Array.from(fold?.querySelectorAll('.px-chat-contact .px-chat-name') ?? []).find(
      (one) => one.textContent?.trim() === name,
    )
    const row = nameInFold?.closest('.px-chat-contact') ?? null
    return {
      hasFold: fold !== null,
      heading: fold?.querySelector('.px-chat-top-name')?.textContent?.trim() ?? '',
      count: fold?.querySelector('.px-chat-top-count')?.textContent?.trim() ?? '',
      expanded: fold?.querySelector('.px-chat-fold')?.getAttribute('aria-expanded') ?? null,
      foldNames: namesIn(fold),
      defaultNames: namesIn(tab?.querySelector('.px-chat-top-group[data-category="default"]')),
      officeRow:
        row === null || nameInFold === undefined
          ? null
          : {
              unread: row.getAttribute('data-unread'),
              weight: Number(getComputedStyle(nameInFold).fontWeight),
            },
    }
  }, officeName)
}

/**
 * The id the office's own row holds in this test's office, read from its database. A fresh office
 * draws it new each time, and the server runs in another process, so this process cannot know it.
 */
function theOfficesOwnIdHere(): string {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true, fileMustExist: true })
  try {
    return theOfficesOwnIdIn(db)
  } finally {
    db.close()
  }
}

/** Put the fold in the asked state with one press, and wait until the tab agrees. */
async function setTheFold(want: 'true' | 'false'): Promise<void> {
  const press = '.px-chat-top-group[data-category="folded"] .px-chat-fold'
  const now = await app.page.$eval(press, (one) => one.getAttribute('aria-expanded')).catch(() => null)
  if (now === want) return
  await app.page.click(press)
  await app.page.waitForFunction(
    ([selector, wanted]: [string, string]) => document.querySelector(selector)?.getAttribute('aria-expanded') === wanted,
    [press, want] as [string, string],
    { timeout: 20_000 },
  )
}

describe('where each group sits, by who opened it', () => {
  it('puts each of five kinds of group once, in the right list, in the given order', () => {
    const someone: ParticipantRef = { kind: 'person', id: THE_PERSON }
    const anAgent: ParticipantRef = { kind: 'agent', id: 'fold-office-ada' }
    const groups = [
      { id: 'office-not-their', pinned: false, openedBy: moleOffice() },
      { id: 'hand-their', pinned: false, openedBy: someone },
      { id: 'secretariat', pinned: true, openedBy: moleOffice() },
      { id: 'office-their', pinned: false, openedBy: moleOffice() },
      { id: 'hand-not-their', pinned: false, openedBy: anAgent },
    ]
    const sat = whereEachGroupSits(groups, ['hand-their', 'secretariat', 'office-their'])

    // THE CONTROL: every group comes back once, so a function dropping one cannot pass the placement.
    const all = [...sat.pinned, ...sat.yours, ...sat.folded].map((one) => one.id)
    expect([...all].sort(), 'a group was dropped or placed twice').toEqual(groups.map((one) => one.id).sort())

    expect(sat.pinned.map((one) => one.id)).toEqual(['secretariat'])
    expect(sat.yours.map((one) => one.id), 'the open list is not exactly the hand-opened group the person is in').toEqual([
      'hand-their',
    ])
    expect(sat.folded.map((one) => one.id), 'the fold is not the office-opened groups and the ones the person is not in').toEqual([
      'office-not-their',
      'office-their',
      'hand-not-their',
    ])
  })
})

describe('the Groups tab folds a group the office opened, which belongs to the person and is unread', () => {
  it('draws it inside the closed fold, and one press shows it bold', async () => {
    const truth = await readTheGroups()
    const fromTheDoor = truth.groups.find((one) => one.id === officeGroup.id)
    // THE CONTROL: the group really is the office's, the person really is in it, and it really is unread.
    expect(fromTheDoor?.openedBy, 'the group was not opened by the office').toEqual({ kind: 'agent', id: theOfficesOwnIdHere() })
    expect(truth.yours, 'the owner is not a member of the office-opened group').toContain(officeGroup.id)
    expect(fromTheDoor?.unread ?? 0, 'the agent message is not unread for the person').toBeGreaterThan(0)
    const handOpened = truth.groups.filter((one) => THEIR_OWN.includes(one.name as (typeof THEIR_OWN)[number]))
    expect(handOpened.map((one) => one.name).sort()).toEqual([...THEIR_OWN].sort())
    for (const one of handOpened) expect(truth.yours, `the person is not in ${one.name}`).toContain(one.id)
    // EVERY GROUP THIS WORLD HOLDS BESIDES THE PINNED ONE is either the person's own hand-opened group or the
    // office's, so the fold's count below is a known number.
    const unpinned = truth.groups.filter((one) => !one.pinned).map((one) => one.name)
    expect([...unpinned].sort()).toEqual([...THEIR_OWN, officeGroup.name].sort())

    await openTheGroups()
    const closed = await readTheTab(officeGroup.name)
    expect(closed.defaultNames, 'the office-opened group is drawn open under the default grouping').not.toContain(
      officeGroup.name,
    )
    expect([...closed.defaultNames].sort(), 'a group the person opened by hand is not open under the default grouping').toEqual(
      [...THEIR_OWN].sort(),
    )
    expect(closed.hasFold, 'no fold is drawn').toBe(true)
    expect(closed.heading).toBe(CONTACT_GROUP_WORDS.officeOpenedAndNotYourGroups)
    expect(closed.heading).toBe('Groups Mole Office opened, and groups you are not in')
    expect(closed.count, 'the fold does not say how many groups wait inside').toBe('1')
    expect(closed.expanded, 'the fold is not closed at first').toBe('false')
    expect(closed.foldNames, 'a row is drawn inside the closed fold').toEqual([])

    await setTheFold('true')
    const opened = await readTheTab(officeGroup.name)
    expect(opened.foldNames, 'the opened fold does not hold the office-opened group').toEqual([officeGroup.name])
    expect(opened.officeRow?.unread, 'the row inside the fold is not marked unread').toBe('yes')
    expect(opened.officeRow?.weight ?? 0, 'the row inside the fold is not bold').toBeGreaterThanOrEqual(600)
  }, 180_000)
})

/**
 * THE PICTURES. Chapter 6 rule 1: the Groups tab with the fold closed and with it open, holding an
 * office-opened group the person is in with an unread message, at 1440, 990, 660 and 390 pixels wide, in
 * light and dark.
 *
 * IT IS GATED: taking pictures is not a check. Run it with SF_GROUPS_FOLD_OFFICE_SHOTS naming the
 * directory the pictures go in.
 */
describe('the widened Groups fold is looked at', () => {
  it.skipIf(!process.env['SF_GROUPS_FOLD_OFFICE_SHOTS'])(
    'photographs the tab with the fold closed and with it open',
    async () => {
      const shots = process.env['SF_GROUPS_FOLD_OFFICE_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      for (const state of ['closed', 'open'] as const) {
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await openTheGroups()
        await setTheFold(state === 'open' ? 'true' : 'false')
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            // THE FOLD SITS BELOW THE GROUPS THE PERSON OPENED, so the tab is scrolled until the fold's
            // heading is in the frame.
            await app.page.evaluate(() => {
              document.querySelector('.px-chat-top-group[data-category="folded"]')?.scrollIntoView({ block: 'center' })
            })
            await app.page.waitForTimeout(250)
            await app.page.screenshot({ path: `${shots}/groups-fold-office-${state}-${String(width)}-${theme}.png` })
          }
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
