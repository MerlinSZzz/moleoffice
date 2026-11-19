// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * POINTING AT A CHAT MESSAGE WORKS FROM ANY PROJECT'S PAGE. Problem rJzSELmOPUas: with a page open on ai-news,
 * a message in the chat was right-clicked, and the comment written about it was refused
 * as not in that project. The message had been filed in another project, and a comment is checked
 * against the records of the project the page has open.
 *
 * With the message centre a message belongs to no project, so it can be pointed at from any
 * page. THIS FILE DOES WHAT THE OWNER DID, IN CHINESE: a made-up agent's message is written in panelx; the page is opened on
 * ai-news at ?lang=zh; the message is right-clicked in the chat, words are typed in the box, and 开始评审 (Start review)
 * is pressed. The owner pressed 保存，不发送, which shape B replaced with Start review; the new press makes the same write first,
 * a message whose target is the part pointed at, with no recipient chosen, and then starts the page's review.
 * Nothing is refused, and the stored comment points at the message and keeps ai-news as the place it was written.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   In `recordInWorkspace` (src/server/lib/records.ts), refuse a message from a project other than the message centre
 *   again (drop `&& record.workspaceId !== MESSAGE_CENTRE`) → the box draws 什么都没有写入。 and the case goes red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORDS = 'Test: 这条消息说的是哪一次试验？'
const THE_MESSAGE = 'Test: the gripper trial ran twice.'

let app: LiveApp
let messageId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'point-across', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const post = async (headers: Record<string, string>, path: string, body: unknown): Promise<Record<string, any>> => {
    const made = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    expect(made.status, await made.clone().text()).toBeLessThan(300)
    return (await made.json()) as Record<string, any>
  }
  for (const [id, title] of [['panelx', 'Mole Office'], ['ai-news', 'AI News']]) await post(AS_THE_PERSON, '/api/workspaces', { id, title })
  await post({ ...AS_THE_PERSON, 'x-mole-office-workspace': 'panelx' }, '/api/records', {
    kind: 'agent',
    title: 'Gripper Agent',
    data: { handle: 'gripper-agent', runtime: 'claude-code', state: 'active' },
  })
  // WRITTEN IN PANELX, as the owner’s message from the other project was.
  const said = await post(
    { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'gripper-agent', 'x-mole-office-workspace': 'panelx' },
    '/api/records',
    { kind: 'message', title: THE_MESSAGE, data: { body: THE_MESSAGE, to: [{ kind: 'person', id: THE_PERSON }] } },
  )
  messageId = said['record'].id
  // THE PAGE IS ON AI-NEWS, which is where the owner’s page was.
  await app.page.addInitScript(() => window.localStorage.setItem('mole-office.workspace', 'ai-news'))
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('writes a comment on a message from panelx, with the page on ai-news, and refuses nothing', async () => {
  await app.page.goto(`${app.site}/?lang=zh#/chat`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  const contact = app.page.locator('.px-chat-contact:has(.px-chat-name:text-is("Gripper Agent"))')
  await contact.waitFor({ timeout: 20_000 })
  await contact.click()
  const bubble = app.page.locator(`.px-chat-said .px-chat-bubble:has-text("${THE_MESSAGE}")`).first()
  await bubble.waitFor({ timeout: 20_000 })
  await bubble.locator('.px-chat-foot').first().click({ button: 'right' })
  await app.page.locator('.px-talk textarea').first().fill(WORDS)
  await app.page.getByRole('button', { name: '开始评审', exact: true }).click()
  await app.page.waitForSelector('.px-talk-said, .px-talk .px-error-note, .px-talk [role="alert"]', { timeout: 15_000 })
  const box = (await app.page.locator('.px-talk').first().textContent()) ?? ''
  expect(box, 'the box says nothing was written').not.toContain('什么都没有写入')

  const pool = (await (await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_PERSON })).json()) as {
    messages: { body: string; target: { target: Record<string, string> } | null; writtenIn?: { project?: string } }[]
  }
  const written = pool.messages.find((one) => one.body === WORDS)
  expect(written, 'the comment was not stored').toBeDefined()
  expect(written?.target?.target['recordId'], 'the comment does not point at the message').toBe(messageId)
  expect(written?.writtenIn?.project, 'the comment does not say it was written on the ai-news page').toBe('ai-news')
}, 120_000)
