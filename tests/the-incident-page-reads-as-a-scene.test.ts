// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I3: the incident page reads as a scene, not a form.
 *
 * design/incidents/ACCEPTANCE.md asks for the timeline drawn in order with its evidence one
 * press away; the loss in the owner's words first; the three responsibility sentences with their
 * uncertainty beside them; the corrective actions with their state (decided, built, verified) read
 * from the records they link, never typed twice; four widths, both themes, and a browser test.
 *
 * WHAT THIS FILE HOLDS UP, in one live browser, at four widths and in both themes:
 *
 *   - the loss stands FIRST on the page, above the timeline, and it is the owner's words, not a summary;
 *   - the timeline is drawn in append order, not sorted on the moment's own time text — the two
 *     moments are appended out of chronological order on purpose, and the page must draw them in
 *     the order they were appended;
 *   - every moment's evidence is ONE press away, and the press names the record it opens by that
 *     record's own title, read off the record — pressing it lands on the evidence record's page;
 *   - the three responsibility sentences each stand with their uncertainty beside them;
 *   - a corrective action's state is read off the record it names — the action naming a problem
 *     gone `fixed` reads "built", the one naming a decision reads "decided", the one naming a
 *     criterion reads "decided" — and nothing is typed twice: the incident's own data carries no
 *     state on the action; what the state was read from is on hover over the state, and no longer
 *     drawn beside it, as decided;
 *   - the scene holds at 1440, 990, 660 and 390 with nothing scrolling sideways, and in both
 *     themes.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST:
 *
 *   drop the evidence presses — in `Moment` in src/web/pages/IncidentPage.tsx, draw the evidence
 *   as plain text instead of a RouteLink, so nothing on a moment can be pressed to reach the
 *   record it stands on. The evidence tests go red exactly there.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage, governsTheWholeProject } from './helpers.ts'

let app: LiveApp
let page: Page

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let incidentId = ''
let evidenceOneId = ''
let evidenceTwoId = ''

const THE_OWNERS_LOSS =
  '今天的实验对我而言简直就是灾难，唯一成功的反而是我要求录制的人体+marker数据，后面的几乎全都失败。'

async function post(path: string, body: unknown): Promise<{ status: number; id: string }> {
  const res = await fetch(`${app.api}/api${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  const said = (await res.json()) as { record: { id: string } }
  return { status: res.status, id: said.record.id }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-incident-page-reads-as-a-scene', viewport: { width: 1440, height: 1000 } })
  page = app.page

  // THE EVIDENCE, first, because a timeline moment names it and the press must open it.
  evidenceOneId = (await post('/records', { kind: 'note', title: 'The bench log of the five starts' })).id
  evidenceTwoId = (await post('/records', { kind: 'note', title: 'The operator’s own account' })).id
  // A PROBLEM GONE FIXED, for the corrective action that must read "built".
  const problemId = (await post('/records', { kind: 'problem', title: 'EGM speed only latches on a fresh activation', data: { state: 'fixed' } })).id
  // A DECISION, for the corrective action that must read "decided".
  const decisionId = (await post('/records', { kind: 'decision', title: 'Latch the speed limit fresh on every resume', data: {
    ...governsTheWholeProject(), replaces: [] } })).id

  // THE INCIDENT, FILED BY THE PERSON (criterion I4), with the scene the page reads. The two
  // timeline moments are APPENDED OUT OF CHRONOLOGICAL ORDER on purpose: the page must draw them
  // in append order, not sorted on the free-text time.
  const made = await post('/records', {
    kind: 'incident',
    title: 'The EGM speed-limit loss at the bench',
    data: {
      loss: THE_OWNERS_LOSS,
      happened_at: { from: '2026-09-09 14:02', to: '2026-09-09 16:40' },
      where: { project: 'robotics', experimentOrModule: 'EGM fresh-activation check', machine: 'YuMi' },
      timeline: [
        {
          id: 'm-2',
          at: 'later in the afternoon',
          who: 'the operator',
          what: 'Re-armed EGM after a pause, believing the reduced speed limit still held.',
          evidence: evidenceTwoId,
        },
        {
          id: 'm-1',
          at: 'earlier the same afternoon',
          who: 'the operator',
          what: 'Started the first trial under the belief the limit carried across.',
          evidence: evidenceOneId,
        },
      ],
      expected: 'The reduced speed limit carries across a pause and a resume.',
      actual: 'EGM speed only latches on a fresh activation. A resume after a pause is not fresh, and the limit was lost.',
      direct_causes: [{ id: 'c-1', text: 'EGM speed only latches on a fresh activation.', problemId }],
      contributing_factors: [{ id: 'f-1', text: 'No check read the latched speed limit back before a resume.' }],
      responsibility: {
        person: {
          sentence: 'Approved the fresh-activation design without asking whether a resume was covered.',
          uncertainty: 'the owner\'s own words, where they gave them',
        },
        agents: {
          sentence: 'No agent built or reviewed the EGM session code that this incident found wrong.',
          uncertainty: 'measured against the commit history',
          handles: [],
        },
        office: {
          sentence: 'Nothing in the office re-read a latched safety limit before a resume.',
          uncertainty: 'measured: no such check existed',
        },
      },
      corrective_actions: [
        { id: 'ca-1', text: 'Latch the speed limit fresh on every resume.', becameRecordId: problemId, becameRecordKind: 'problem' },
        { id: 'ca-2', text: 'Decide the resume rule before the next bench session.', becameRecordId: decisionId, becameRecordKind: 'decision' },
        { id: 'ca-3', text: 'Write the resume check into the bench checklist as a rule.', becameCriterion: 'I6' },
      ],
      verification: { how: 'Pause and resume an EGM session and read the speed limit before the first move.', verified: false },
      state: 'open',
      found_by: 'the operator, during the bench session',
    },
  })
  incidentId = made.id
})

afterAll(async () => {
  await app.stop()
})

async function openTheScene(): Promise<void> {
  await page.goto(`${app.site}/#/incident/${incidentId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.inc-loss', { timeout: 30_000 })
}

describe('the scene reads in the owner\'s order', () => {
  it('the loss stands first, above the timeline, in the owner\'s words', async () => {
    await openTheScene()
    const loss = page.locator('.inc-loss')
    expect((await loss.textContent())?.trim()).toContain('简直就是灾难')
    const lossBox = await loss.boundingBox()
    const timelineBox = await page.locator('[data-target="uiSurface/incident.timeline"]').boundingBox()
    const lossPanel = page.locator('[data-target="uiSurface/incident.loss"]')
    expect(await lossPanel.count()).toBe(1)
    const lossPanelBox = await lossPanel.boundingBox()
    expect(lossBox).not.toBeNull()
    expect(timelineBox).not.toBeNull()
    expect(lossPanelBox).not.toBeNull()
    // THE LOSS STANDS FIRST: its panel's top edge is above the timeline's.
    expect(lossPanelBox!.y).toBeLessThan(timelineBox!.y)
    // AND NOTHING BETWEEN THE HEADING AND THE LOSS, which is what "first" means: the loss panel is
    // the first panel on the page.
    const firstPanel = page.locator('main section.px-panel').first()
    expect(await firstPanel.getAttribute('data-target')).toBe('uiSurface/incident.loss')
  })

  it('the timeline is drawn in append order, not sorted on the time text', async () => {
    await openTheScene()
    const ats = await page.locator('.inc-moment .inc-moment-at').allTextContents()
    expect(ats.map((one) => one.trim())).toEqual(['later in the afternoon', 'earlier the same afternoon'])
  })

  it('every moment keeps its who and its what as written', async () => {
    await openTheScene()
    const whos = await page.locator('.inc-moment .inc-moment-who').allTextContents()
    expect(whos.map((one) => one.trim())).toEqual(['the operator', 'the operator'])
    const whats = await page.locator('.inc-moment .inc-moment-what').allTextContents()
    expect(whats[0]).toContain('Re-armed EGM after a pause')
  })
})

describe('the evidence is one press away', () => {
  it("the press names the record it opens by the record own title, and is a real press", async () => {
    await openTheScene()
    const presses = page.locator('.inc-moment .inc-evidence')
    expect(await presses.count()).toBe(2)
    const names = await presses.allTextContents()
    expect(names[0]).toContain('The operator’s own account')
    expect(names[1]).toContain('The bench log of the five starts')
    // IT IS A PRESS, not a mention: the element goes to the record it names. The mutation that
    // drops the presses must fail here as well as in the press-through test below.
    const firstHref = await presses.nth(0).getAttribute('href')
    expect(firstHref, 'the evidence is drawn but nothing can be pressed to reach it').toContain(`/r/${evidenceTwoId}`)
  })

  it("pressing it lands on the evidence record own page", async () => {
    await openTheScene()
    await page.locator('.inc-moment .inc-evidence').first().click()
    await waitForThePage(page, 60_000)
    expect(new URL(page.url()).hash).toContain(`/r/${evidenceTwoId}`)
  })
})

describe('the three responsibility sentences stand with their uncertainty beside them', () => {
  it('each part draws a sentence and its uncertainty', async () => {
    await openTheScene()
    const parts = page.locator('.inc-resp-part')
    expect(await parts.count()).toBe(3)
    const names = await parts.locator('.inc-resp-name').allTextContents()
    expect(names.map((one) => one.trim())).toEqual(['The person', 'The agents', 'The office'])
    for (let i = 0; i < 3; i += 1) {
      expect(((await parts.nth(i).locator('.inc-resp-sentence').textContent()) ?? '').trim()).not.toBe('')
      expect(((await parts.nth(i).locator('.inc-resp-uncertain').textContent()) ?? '').trim()).not.toBe('')
    }
  })
})

describe("a corrective action state is read from the record it names, never typed twice", () => {
  it('the action naming a problem gone fixed reads built, the decision one reads decided, the criterion one reads decided', async () => {
    await openTheScene()
    const states = await page.locator('.inc-action .inc-action-state-word').allTextContents()
    expect(states.map((one) => one.trim())).toEqual(['built', 'decided', 'decided'])
  })

  it('each state keeps what it was read from on hover', async () => {
    await openTheScene()
    const readFroms = await page.locator('.inc-action .inc-action-state').evaluateAll((all) => all.map((one) => one.getAttribute('title') ?? ''))
    expect(readFroms[0]).toContain('the problem it became reads fixed')
    expect(readFroms[1]).toContain('the decision it became')
  })

  it("and nothing is typed twice: the incident own data carries no state on the action", async () => {
    const res = await fetch(`${app.api}/api/records/${incidentId}`, { headers: HEADERS })
    expect(res.ok).toBe(true)
    const said = (await res.json()) as { record: { data: { corrective_actions: Record<string, unknown>[] } } }
    for (const action of said.record.data.corrective_actions) {
      expect(action, 'a corrective action must not store its own state').not.toHaveProperty('state')
    }
  })
})

describe('the scene holds at four widths and in both themes', () => {
  const widths = [1440, 990, 660, 390]
  for (const width of widths) {
    it(`at ${String(width)} the loss stands first and nothing scrolls sideways`, async () => {
      await page.setViewportSize({ width, height: 1000 })
      await openTheScene()
      const lossBox = await page.locator('[data-target="uiSurface/incident.loss"]').boundingBox()
      const timelineBox = await page.locator('[data-target="uiSurface/incident.timeline"]').boundingBox()
      expect(lossBox).not.toBeNull()
      expect(timelineBox).not.toBeNull()
      expect(lossBox!.y).toBeLessThan(timelineBox!.y)
      const overflow = await page.evaluate(() => ({
        scroll: document.scrollingElement?.scrollWidth ?? 0,
        client: document.scrollingElement?.clientWidth ?? 0,
      }))
      expect(overflow.scroll, `the scene scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(overflow.client + 1)
    })
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`draws the whole scene in ${theme}`, async () => {
      await page.setViewportSize({ width: 990, height: 1000 })
      await page.emulateMedia({ colorScheme: theme })
      await openTheScene()
      expect(await page.locator('.inc-loss').isVisible()).toBe(true)
      expect(await page.locator('.inc-moment').count()).toBe(2)
      expect(await page.locator('.inc-resp-part').count()).toBe(3)
      expect(await page.locator('.inc-action').count()).toBe(3)
    })
  }
})