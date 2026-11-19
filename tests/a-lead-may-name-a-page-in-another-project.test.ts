// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD MAY NAME A PAGE, AND MAY NAME ONE IN ANOTHER PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M60 of design/messages/ACCEPTANCE.md:
 *
 *   A lead to the drawing …/#/pipeline/TEoKg5mV7egP did not go there. A reader in another project
 *   had to press again to switch, and that is not needed: a reader who agreed to be taken there
 *   needs no second confirmation.
 *
 * The case exactly: a lead to a pipeline DRAWING — an address, not a record — in the project the reader was
 * not reading, taken from the project they were.
 *
 * Four things, and each is a separate failure:
 *
 *   1. A LEAD MAY NAME A PAGE. Before this the lead's target had to be something inside a record,
 *      and a pipeline's drawing is a page.
 *   2. A LEAD MAY NAME ANOTHER PROJECT. A lead is an offer to move a person, and a person is not
 *      held to one project. (A comment's target could not name another project until wave 13q's
 *      round 17: a comment is a message kept in the message centre now, so it may point at a record
 *      of any project its writer may read. Problem 8zw4lqj3ZNm_, and
 *      tests/a-comment-may-point-into-a-project-its-writer-may-read.test.ts.)
 *   3. A PROJECT NOBODY HAS IS REFUSED. An offer naming a misspelt project would move the reader
 *      to an empty screen and tell them nothing about why.
 *   4. ONE PRESS DOES BOTH HALVES. Taking the offer changes the project AND the page, with nothing
 *      else asked of the reader. This is the half of M60 that is about the browser, and it is why
 *      this file drives one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
/** The pipeline whose drawing the guide offers to take the owner to. It is in the OTHER project. */
let pipelineThere = ''
/** A record in this project, for the comment that must still be refused across the boundary. */
let noteHere = ''

const OTHER = 'robotics'
const OTHER_TITLE = 'Robotics'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'guide-p',
}

const IN_THE_OTHER_PROJECT = { ...AS_THE_OWNER, 'x-mole-office-workspace': OTHER }

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** One message from the guide to the owner, written in `default`, carrying whatever lead is passed. */
async function offer(lead: unknown, words: string): Promise<Response> {
  return write(AS_THE_GUIDE, {
    kind: 'message',
    title: words.slice(0, 40),
    data: { body: words, to: [{ kind: 'person', id: THE_PERSON }], lead },
  })
}

/** The address in the bar. */
async function whereWeAre(): Promise<string> {
  return app.page.evaluate(() => window.location.hash)
}

/** Which project this browser is reading, as the browser itself stores it. */
async function whichProject(): Promise<string | null> {
  return app.page.evaluate(() => window.localStorage.getItem('mole-office.workspace'))
}

beforeAll(async () => {
  app = await liveApp({ name: 'lead-across-projects', viewport: { width: 1440, height: 1000 } })

  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: OTHER, title: OTHER_TITLE }),
  })
  expect(made.status, await made.text()).toBe(201)

  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Guide P',
    data: { handle: 'guide-p', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)

  const pipeline = await write(IN_THE_OTHER_PROJECT, {
    kind: 'pipeline',
    title: 'Handover v2',
    data: { blockIds: [] },
  })
  const pipelineBody = (await pipeline.json()) as { record?: { id: string } }
  expect(pipeline.status, JSON.stringify(pipelineBody)).toBe(201)
  pipelineThere = pipelineBody.record?.id ?? ''

  const note = await write(AS_THE_OWNER, {
    kind: 'note',
    title: 'A note in this project',
    data: { date: '2026-09-06', body: 'Here so a comment has something to be refused about.' },
  })
  const noteBody = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(noteBody)).toBe(201)
  noteHere = noteBody.record?.id ?? ''
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('what the door accepts and what it still refuses', () => {
  it('accepts a lead naming a page in another project', async () => {
    const res = await offer(
      { target: { kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER } },
      'The drawing of Handover v2 is here. Come and look at it.',
    )
    expect(res.status, await res.text()).toBe(201)
  })

  it('refuses a lead naming a project this installation does not hold', async () => {
    const res = await offer(
      { target: { kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: 'robotcs' } },
      'A misspelt project.',
    )
    expect(res.status).toBe(404)
    const said = await res.text()
    expect(said).toContain('robotcs')
    expect(said).toContain(OTHER)
  })

  it('refuses a lead naming a record the project it names does not hold', async () => {
    const res = await offer(
      { target: { kind: 'record', recordId: 'no-such-id-1', workspaceId: OTHER } },
      'Nothing is there.',
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await res.text()).toContain('no-such-id-1')
  })

  it('accepts a COMMENT whose target is in another project its writer may read (problem 8zw4lqj3ZNm_)', async () => {
    const res = await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'A comment across the boundary',
      data: {
        body: 'This is about that.',
        to: [{ kind: 'person', id: THE_PERSON }],
        target: { target: { kind: 'record', recordId: pipelineThere, workspaceId: OTHER } },
      },
    })
    expect(res.status, await res.text()).toBe(201)
  })

  it('accepts a comment whose target is in this project, so the check did not simply stop', async () => {
    const res = await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'A comment on a note here',
      data: {
        body: 'This is about the note.',
        to: [{ kind: 'person', id: THE_PERSON }],
        target: { target: { kind: 'record', recordId: noteHere, workspaceId: 'default' } },
      },
    })
    expect(res.status, await res.text()).toBe(201)
  })
})

describe('one press takes the reader to the page AND to the project', () => {
  it('says which project the offer would move the person to, and moves them there on one press', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)

    // ---- THE OFFER IS DRAWN AND NOTHING HAS MOVED. M8 is unchanged by M60.
    await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
    expect(await whereWeAre()).toBe('#/records')
    expect(await whichProject()).not.toBe(OTHER)

    // ---- AND IT SAYS THE OFFER CROSSES A PROJECT, BEFORE ANYBODY PRESSES IT. A reader deciding
    // whether to be taken somewhere is deciding about the project as well as the page, because one
    // press does both.
    // Criterion change (wave 13n round 29, problem 30fVQwjGa3Qb): the offer named the page by its
    // address, `/pipeline/<id>`. It names what the page shows now, the pipeline's drawing and its title,
    // read in the other project, and the address is drawn only in developer mode.
    const wordsOfTheOffer = () => app.page.$eval('.px-lead-offer .px-lead-words', (el) => el.textContent ?? '')
    await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toContain('the drawing of the pipeline "Handover v2"')
    const words = await wordsOfTheOffer()
    expect(words).not.toContain(`/pipeline/${pipelineThere}`)
    expect(words).toContain(OTHER_TITLE)

    // ---- ONE PRESS. NOT TWO.
    await app.page.click('.px-lead-offer .px-lead-go')
    const want = `#/pipeline/${pipelineThere}`
    await app.page.waitForFunction(`window.location.hash === ${JSON.stringify(want)}`, { timeout: 30_000 })
    expect(await whereWeAre()).toBe(want)
    expect(await whichProject()).toBe(OTHER)

    // ---- AND THE PAGE IT LANDED ON IS THE DRAWING OF THAT PIPELINE, read in the project that
    // holds it. Without the project half, this page reads `default` and finds no such pipeline.
    await waitForThePage(app.page, 60_000)
    const said = await app.page.evaluate(() => document.body.textContent ?? '')
    expect(said).toContain('Handover v2')
  })
})

/**
 * THE OFFER, LOOKED AT ON A CHINESE PAGE — chapter 6: four widths and both themes (check FwwgzHBjpErx).
 *
 * Since problem 30fVQwjGa3Qb, a lead's page is named by what it shows, in the page language, so on a Chinese page the
 * offer says 流程 Handover v2 的图 where it said "页面 /pipeline/…". The offer is photographed at 1440, 990, 660 and 390 in light and
 * dark, after the words are checked to hold the Chinese name. The case is gated: a run that is not asked for pictures
 * takes none. The pictures go to the folder LEAD_OFFER_SHOTS names, never into the worktree.
 */
describe('the lead offer is looked at on a Chinese page', () => {
  it.skipIf(!process.env['LEAD_OFFER_SHOTS'])(
    'photographs the offer at 1440, 990, 660 and 390 in both themes, in Chinese',
    async () => {
      const shots = process.env['LEAD_OFFER_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const res = await offer(
        { target: { kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER } },
        'The drawing of Handover v2 is here. Come and look at it.',
      )
      expect(res.status, await res.text()).toBe(201)
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.goto(`${app.site}/?lang=zh#/records`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
      // THE PLACE IS NAMED IN CHINESE before it is photographed, so a picture of the English offer cannot pass for this.
      // Criterion change (wave 13n round 29, problem 30fVQwjGa3Qb): this was `页面 /pipeline/<id>`, the
      // address. It is what the page shows now, the brief's own example.
      await expect
        .poll(() => app.page.$eval('.px-lead-offer .px-lead-words', (el) => el.textContent ?? ''), { timeout: 20_000 })
        .toContain('流程 Handover v2 的图')
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
          await app.page.screenshot({ path: `${shots}/lead-offer-zh-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
