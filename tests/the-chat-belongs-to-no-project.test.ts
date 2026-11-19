// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT BELONGS TO NO PROJECT. ITEM CG-1 OF LINE 13Y.
 *
 * The owner wrote, on 4 November 2026 (project panelx, whole): 「chat这边我在其他project打开后会提示
 * "This conversation belongs to Mole Office."这个没必要显示，chat应该是global的」 — opened in another project, the chat must not
 * say a conversation belongs to one.
 *
 * WHAT IS DRAWN TODAY. The chat's own line, `chat.conversationBelongsTo` ("This conversation belongs to {name}." /
 * "这段对话属于{name}。"), was taken out of Chat.tsx by commit 2bef25342 on 4 November 2026: no code draws it, and the key
 * survives only in the made-from files. The line that still says a conversation is about a project is put together for
 * the send plan beside the chat: `src/server/lib/agents.ts` says `said({ key: 'agentElsewhere', values: { title, where,
 * here } })` when a comment's chosen agent record sits in another project (and `runElsewhere` for a run), and
 * `src/shared/send-plan-words.ts` fills the stored sentence `sendPlan.line.agentElsewhere` /
 * `sendPlan.line.runElsewhere`. In English it ends "and this conversation is about \"{here}\""; in Chinese it ends
 * "而这段对话属于项目“{here}”。" The review pane draws it with `sayTheLine` (ReviewBar.tsx), beside the chat that put the
 * comment there.
 *
 * WHAT THIS PROVES, in a real browser against a Mole Office of its own:
 *   1. the send plan beside the chat, read on an English page, is the neutral sentence from the word file — the agent's
 *      or run's title, and the project it is in, and nothing saying the conversation belongs to or is about a project;
 *   2. the same two lines on a Chinese page carry no Chinese belonging clause;
 *   3. the chat opened in two projects draws no belonging line at all.
 *
 * The switch is proved, not assumed: the second project is read back off the project block after it is chosen, and the
 * pane is waited for by the line itself. Without that, a switcher that did nothing would make "no line in either
 * project" true for the wrong reason — the one way this test could pass on a broken build.
 *
 * A test never copies a value that can change: the two English sentences are read from the word file by their keys after
 * the change. On the cut those keys are absent, which is part of what makes this file red there.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { readStoredWord, type WordKey } from '../src/shared/i18n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { switchTheProject, theProjectIdOnScreen } from './switch-the-project.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The project the review and the chat start in, and the one a comment's people belong to. */
const HERE = 'default'
const THERE = 'far-bench'
const THERE_IS_CALLED = 'Far bench'

const NOTE = 'Bench heights for the far harbour'
const FAR_AGENT = 'Harbour surveyor'
const FAR_RUN = 'Harbour soundings'
const COMMENT_TO_AGENT = 'The tide table needs a second reading.'
const COMMENT_TO_RUN = 'The soundings were taken at the wrong depth.'

/** The belonging clause that must not be drawn, in either language. */
const BELONGS = /this conversation is about|belongs to|这段对话属于|属于项目/i

const PICTURES = process.env['CG1_PICTURES']
const PICTURES_LABEL = 'Made-up data — an invented office, not real office data'

let app: LiveApp
let noteId = ''
let reviewId = ''

async function post<T>(path: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const sent = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(sent.status, await sent.clone().text()).toBe(201)
  return (await sent.json()) as T
}

/** One comment on the review, addressed to whoever the review may not send it to. */
async function aComment(body: string, recipient: Record<string, unknown>): Promise<void> {
  const target = { target: { kind: 'record', recordId: noteId, workspaceId: HERE }, place: { at: 'surface' } }
  const made = await post<{ record: { id: string } }>('/api/records', PERSON, {
    kind: 'annotation',
    title: body.slice(0, 40),
    data: { body, context: target },
  })
  const chose = await fetch(`${app.api}/api/records/${made.record.id}`, {
    method: 'PATCH',
    headers: PERSON,
    body: JSON.stringify({ dataPatch: { chosenRecipient: recipient } }),
  })
  expect(chose.ok, await chose.clone().text()).toBe(true)
  // A MOMENT BETWEEN COMMENTS, so each has its own place in the review's order.
  await new Promise((done) => setTimeout(done, 1050))
}

/** Open the note's page and the review pane on our review, and read the send plan's lines. */
async function openThePane(page: Page, language: 'en' | 'zh'): Promise<string[]> {
  // THE BROWSER REMEMBERS THE COLUMN OPEN, as one that had it open does, so the plan is drawn at 390 as well as at
  // 1440: the phone's Reviews switch is behind the closed sidebar, and the review pane is the block the picture shows.
  await page.addInitScript((word) => {
    localStorage.setItem('mole-office.review', word)
  }, `open|${reviewId}|default|${reviewId}|default`)
  await page.goto(`${app.site}/?lang=${language}#/r/${noteId}`)
  await waitForThePage(page)
  const drawn = page.locator('[data-part="send-the-review"] .px-send-says')
  const open = await drawn.first().waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  )
  if (!open) {
    if ((await page.locator('.px-pane-list .px-rev-go').count()) === 0) await page.locator('.px-review-switch').click()
    await page.locator('.px-pane-list .px-rev-go').first().click()
    await drawn.first().waitFor({ timeout: 30_000 })
  }
  return drawn.allInnerTexts()
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-belongs-to-nobody', viewport: { width: 1440, height: 1000 }, workspace: HERE })

  // A SECOND PROJECT, with an agent and a run filed in it and only in it.
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: PERSON,
    body: JSON.stringify({ id: THERE, title: THERE_IS_CALLED }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const there = { ...PERSON, 'x-mole-office-workspace': THERE }
  const agent = await post<{ record: { id: string } }>('/api/records', there, {
    kind: 'agent',
    title: FAR_AGENT,
    data: { handle: 'harbour-surveyor', runtime: 'claude-code', state: 'active' },
  })
  const run = await post<{ record: { id: string } }>('/api/records', there, {
    kind: 'session',
    title: FAR_RUN,
    data: { state: 'idle', runtime: 'claude-code' },
  })

  // A REVIEW IN THIS PROJECT, with one comment for each of them.
  const note = await post<{ record: { id: string } }>('/api/records', PERSON, {
    kind: 'note',
    title: NOTE,
    data: { body: 'Made-up bench heights, for a chat that belongs to no project.' },
  })
  noteId = note.record.id
  const target = { target: { kind: 'record', recordId: noteId, workspaceId: HERE }, place: { at: 'surface' } }
  const review = await post<{ review: { id: string } }>('/api/reviews', PERSON, { entry: target })
  reviewId = review.review.id
  await aComment(COMMENT_TO_AGENT, { kind: 'agent', agentId: agent.record.id })
  await aComment(COMMENT_TO_RUN, { kind: 'session', sessionId: run.record.id })
  const finished = await fetch(`${app.api}/api/reviews/${reviewId}/finish-collecting`, {
    method: 'POST',
    headers: PERSON,
    body: JSON.stringify({}),
  })
  expect(finished.ok, await finished.clone().text()).toBe(true)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the chat opened in any project', () => {
  it('draws no line saying a conversation belongs to or is about a project, in English and in Chinese', async () => {
    // 1. THE SEND PLAN BESIDE THE CHAT, in English: the neutral sentence, from the word file, and no belonging clause.
    const english = await openThePane(app.page, 'en')
    expect(english.length, 'the review has two comments and the plan draws each one').toBe(2)
    expect(english.join('\n'), 'a send-plan line says the conversation is about a project').not.toMatch(BELONGS)
    expect(english[0]).toBe(readStoredWord('sendPlan.line.agentInAnotherProject' as WordKey, { title: FAR_AGENT, where: THERE_IS_CALLED }))
    expect(english[1]).toBe(readStoredWord('sendPlan.line.runInAnotherProject' as WordKey, { title: FAR_RUN, where: THERE_IS_CALLED }))
    // The word file above is the new names; a cut that still holds the old ones answers a placeholder here.
    expect(Object.hasOwn(enWave13y, 'sendPlan.line.agentInAnotherProject')).toBe(true)

    // 2. THE SAME PLAN ON A CHINESE PAGE. It may fall back to the new English (Chinese waits for its round); it must not
    //    carry the Chinese clause that was drawn before.
    const chinese = await openThePane(app.page, 'zh')
    expect(chinese.length, 'the review has two comments and the plan draws each one').toBe(2)
    expect(chinese.join('\n'), 'a send-plan line says the conversation belongs to a project in Chinese').not.toMatch(BELONGS)

    // 3. THE CHAT ITSELF, in this project and then in the one the comment's people are in.
    await app.page.goto(`${app.site}/?lang=en#/`)
    await waitForThePage(app.page)
    await openTheChat(app.page)
    await app.page.locator('.px-chat').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.px-chat').innerText(), 'the chat says a conversation belongs to a project here').not.toMatch(BELONGS)

    expect(await theProjectIdOnScreen(app.page), 'the chat case did not start in the first project').toBe(HERE)
    await switchTheProject(app.page, THERE)
    await waitForThePage(app.page)
    expect(await theProjectIdOnScreen(app.page), 'the project switcher did not move').toBe(THERE)
    // THE SWITCH MAY HAVE CLOSED THE PANEL: open it again the way the page offers, then read it in the other project.
    await openTheChat(app.page)
    await app.page.locator('.px-chat').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.px-chat').innerText(), 'the chat says a conversation belongs to a project there').not.toMatch(BELONGS)
  }, 180_000)
})

/** A fresh window whose project, look and actor are set before the app runs. */
async function aWindow(width: number, theme: 'light' | 'dark', project: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 1000 } })
  await context.addInitScript(({ id, theme, project }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', project)
  }, { id: THE_PERSON, theme, project })
  return { context, page: await context.newPage() }
}

it.skipIf(PICTURES === undefined)('photographs the chat in a project that is not the office\'s own, and the send plan beside it, at 1440 and 390 in both looks', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      // THE CHAT OPENED IN THE OTHER PROJECT, which is what the owner did when he saw the line.
      const chat = await aWindow(width, theme, THERE)
      try {
        await chat.page.goto(`${app.site}/?lang=en#/`)
        await waitForThePage(chat.page)
        // THE PICTURE IS OF THE LOOK IT SAYS: the preset was stored before the first goto, and the page has used it.
        expect(await chat.page.locator('html').getAttribute('data-theme'), 'the chat picture is not in its look').toBe(theme)
        await openTheChat(chat.page)
        await chat.page.locator('.px-chat').first().waitFor({ timeout: 30_000 })
        expect(await theProjectIdOnScreen(chat.page), 'the picture is not of the other project').toBe(THERE)
        // A CONVERSATION IS OPENED, so the picture is of the chat talking rather than of its contact list, and the label
        // goes inside the composer's own padded row: the panel's left drag grip runs the whole height of its edge, and the
        // composer's padding puts the label past it.
        if ((await chat.page.locator('.px-chat-write').count()) === 0) {
          await chat.page.locator('.px-chat-contact').first().click()
        }
        await chat.page.locator('.px-chat-write').first().waitFor({ timeout: 30_000 })
        await putTheMadeUpLabelIn(chat.page, PICTURES_LABEL, chat.page.locator('.px-chat-write > *').first(), 'the-chat-belongs-to-no-project')
        await chat.page.mouse.move(width - 2, (width <= 390 ? 844 : 1000) - 2)
        await chat.page.waitForTimeout(500)
        await chat.page.screenshot({ path: join(folder, `cg1-chat-${String(width)}-${theme}.png`) })
      } finally {
        await chat.context.close()
      }
      // AND THE SEND PLAN the chat's review draws, with the line a comment to the other project says.
      const plan = await aWindow(width, theme, HERE)
      try {
        await openThePane(plan.page, 'en')
        expect(await plan.page.locator('html').getAttribute('data-theme'), 'the send plan picture is not in its look').toBe(theme)
        // THE REVIEW PANE IS THE BLOCK THE PICTURE SHOWS, and at 390 it covers the page; the label goes above the plan
        // inside the pane, where the picture can see it.
        await putTheMadeUpLabelIn(plan.page, PICTURES_LABEL, plan.page.locator('[data-part="send-the-review"]').first(), 'the-chat-belongs-to-no-project')
        await plan.page.mouse.move(width - 2, (width <= 390 ? 844 : 1000) - 2)
        await plan.page.waitForTimeout(500)
        await plan.page.screenshot({ path: join(folder, `cg1-send-plan-${String(width)}-${theme}.png`) })
      } finally {
        await plan.context.close()
      }
    }
  }
}, 300_000)
