// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LEAD PANE NAMES AN AGENT BY ITS RECORD OR ITS HANDLE, AND NEVER DRAWS AN ID AS A NAME (wave 13y round 83).
 *
 * The lead pane drew an agent's raw record id where its name belongs. Its `nameOf` matched a sender or the followed
 * agent by registry id only, and fell back to the id it was given. Now the pane reads the reference the way a stored
 * sender is read (`theAgentAStoredSenderNames` in src/shared/messages.ts): the registry id, then the agent's own record
 * in the project, then the one agent with that handle. When nobody answers, the pane says in words that it has no name
 * for the agent.
 *
 * Over a test office with one agent filed as a record, the browser follows that agent by its record id and by its
 * handle, and each time the following line and the stop press name the agent. Followed by an id nobody has, the pane
 * says it has no name for the agent and the id is nowhere in the pane. An offer from the agent waits in every case, so
 * a case knows the names have been read when the offer names the agent. Following it by its registry id is
 * tests/the-following-controls-fit-a-narrow-screen.test.ts, and following the agent that made the offer would take the
 * offer.
 *
 * MUTATIONS:
 *   1. Leave the record step out of `theAgentAStoredSenderNames`: the record-id cases fail.
 *   2. Put back `?? ref.id` as what `nameOf` in src/web/components/Leading.tsx draws when nobody answers: the
 *      unknown id is drawn in the pane.
 *   3. `nameOf` compares the registry id only, as before round 83: the record-id and handle cases fail.
 *
 * With W13Y_LEAD_NAME_SHOTS set to a folder, it photographs the page at 1440, 990, 660 and 390 in both themes, followed
 * by the record id and by the unknown id, under the made-up label.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LEADING, theAgentAStoredSenderNames } from '../src/shared/messages.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'

const NAME = 'Lead Guide'
const HANDLE = 'lead-guide'
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
const SHOTS = process.env.W13Y_LEAD_NAME_SHOTS
const LABEL = `Made-up data — a test office with one agent, "${NAME}", not real office data`

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_GUIDE = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }

describe('the reader of a stored sender', () => {
  // NOT TYPED AS THE READER'S LIST, so the file is read the same before and after the list could carry a record.
  const guide = { who: { kind: 'agent' as const, id: 'Rg1registryId' }, name: NAME, handle: HANDLE, record: 'Rc1recordOfIt' }
  const withRecords = [guide]
  const withoutRecords = [{ who: guide.who, name: guide.name, handle: guide.handle }]

  it("answers an agent's own record with that agent", () => {
    expect(theAgentAStoredSenderNames({ kind: 'agent', id: 'Rc1recordOfIt' }, withRecords)).toEqual(guide.who)
  })

  it('answers an id and a handle as before', () => {
    expect(theAgentAStoredSenderNames(guide.who, withRecords)).toEqual(guide.who)
    expect(theAgentAStoredSenderNames({ kind: 'agent', id: HANDLE }, withRecords)).toEqual(guide.who)
  })

  it('answers nobody for a record id when the list carries no records, as the server builds it', () => {
    expect(theAgentAStoredSenderNames({ kind: 'agent', id: 'Rc1recordOfIt' }, withoutRecords)).toBeNull()
  })
})

describe('the lead pane', () => {
  let app: LiveApp
  let recordOfTheGuide = ''
  let registryId = ''

  beforeAll(async () => {
    app = await liveApp({ name: 'lead-pane-names', viewport: { width: 1440, height: 1000 } })
    const write = async (headers: Record<string, string>, body: unknown): Promise<{ record?: { id: string } }> => {
      const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = await reply.text()
      expect(reply.status, text).toBe(201)
      return JSON.parse(text) as { record?: { id: string } }
    }
    recordOfTheGuide = (await write(AS_THE_OWNER, { kind: 'agent', title: NAME, data: { handle: HANDLE, state: 'active' } })).record?.id ?? ''
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
      agents: { id: string; handle: string; name: string; record?: string | null }[]
    }
    const row = listed.agents.find((one) => one.handle === HANDLE)
    registryId = row?.id ?? ''
    // THE THREE ARE DIFFERENT STRINGS, or a case below would prove nothing about the one it names.
    expect([recordOfTheGuide, registryId, HANDLE, row?.name, row?.record], JSON.stringify(row)).toEqual([
      recordOfTheGuide, registryId, HANDLE, NAME, recordOfTheGuide,
    ])
    expect(new Set([recordOfTheGuide, registryId, HANDLE]).size).toBe(3)
    const place = (await write(AS_THE_OWNER, { kind: 'note', title: 'Where the guide leads', data: { date: '2026-10-25', body: 'A note.' } })).record?.id ?? ''
    await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'Come and read this',
      data: { body: 'Read this note.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: place, workspaceId: 'default' } } },
    })
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** A window of its own that follows `who`, in one theme and at one width, with the offer from the guide drawn. */
  async function following(who: string, theme: 'light' | 'dark', width: number, height: number) {
    const context = await app.browser.newContext({ viewport: { width, height }, colorScheme: theme })
    await context.addInitScript(
      ([key, value, look]) => {
        window.localStorage.setItem(key as string, value as string)
        window.localStorage.setItem('mole-office.preset.theme', look as string)
      },
      [FOLLOWING_KEY, `agent:${who}`, theme],
    )
    const page = await context.newPage()
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // THE NAMES HAVE BEEN READ when the offer names the guide: the offer and the following line draw from one read.
    await page
      .locator('.px-lead-offer .px-lead-words', { hasText: NAME })
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(async () => {
        throw new Error(`the offer from ${NAME} never named it; the pane says: ${await whatThePaneSays(page)}`)
      })
    return { context, page }
  }

  /** Every word the pane holds, drawn or not, and every name a press is called aloud. */
  async function whatThePaneSays(page: Page): Promise<string> {
    return page.evaluate(() => {
      const pane = document.querySelector('.px-lead-here')
      if (pane === null) return '(no pane)'
      const aloud = [...pane.querySelectorAll('[aria-label]')].map((one) => one.getAttribute('aria-label') ?? '')
      return [pane.textContent ?? '', ...aloud].join(' | ')
    })
  }

  async function theFollowingLine(page: Page): Promise<{ line: string; stop: string }> {
    return page.evaluate(() => ({
      line: document.querySelector('.px-lead-following .px-lead-short')?.textContent ?? '(no line)',
      stop: document.querySelector('.px-lead-following .px-lead-stop')?.getAttribute('aria-label') ?? '(no stop press)',
    }))
  }

  for (const [called, who] of [
    ['its record id', () => recordOfTheGuide],
    ['its handle', () => HANDLE],
  ] as const) {
    it(`followed by ${called}, names the agent on the following line and the stop press`, async () => {
      const { context, page } = await following(who(), 'light', 1440, 1000)
      try {
        const seen = await theFollowingLine(page)
        expect(seen, await whatThePaneSays(page)).toEqual({ line: LEADING.following(NAME), stop: LEADING.stopFollowing(NAME) })
        expect(await whatThePaneSays(page)).not.toContain(who())
      } finally {
        await context.close()
      }
    }, 120_000)
  }

  it('followed by an id nobody has, says it has no name for the agent and never draws the id', async () => {
    const { context, page } = await following(NOBODYS, 'light', 1440, 1000)
    try {
      const said = await whatThePaneSays(page)
      expect(said, 'the id is drawn in the pane').not.toContain(NOBODYS)
      const seen = await theFollowingLine(page)
      expect(seen.line, said).toMatch(/no name/)
      expect(seen.stop, said).toMatch(/no name/)
    } finally {
      await context.close()
    }
  }, 120_000)

  it.runIf(SHOTS)('photographs the page at the four widths in both themes', async () => {
    for (const [called, who] of [
      ['record', () => recordOfTheGuide],
      ['nobody', () => NOBODYS],
    ] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          const { context, page } = await following(who(), theme, width, width === 390 ? 844 : 1000)
          try {
            // ABOVE THE PAGE'S FIRST BLOCK, inside the page. Put before the page itself, the label is a cell of the
            // shell's row and is stretched to the window's height, under the pane.
            await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *').first(), `the lead pane, ${called}, ${theme} at ${width}`)
            await page.screenshot({ path: `${SHOTS}/${called}-${theme}-${width}.png` })
          } finally {
            await context.close()
          }
        }
      }
    }
  }, 600_000)
})
