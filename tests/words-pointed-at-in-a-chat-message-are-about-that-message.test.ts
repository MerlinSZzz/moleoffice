// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORDS POINTED AT IN A CHAT MESSAGE ARE ABOUT THAT MESSAGE, NOT ABOUT THE PAGE UNDER THE CHAT.
 *
 * Problem p0H_xbR84hhx: the chat drew each message with no `data-target`, so a right-click on words
 * in a message climbed to the nearest element that had one, which was the shell's key for the page
 * that happened to be open. The comment was filed against that page, and a reader later could not
 * tell which message it answered. Every message the chat draws now carries its own record's target,
 * the way every other row in the product does.
 *
 * WHAT THIS FILE DOES. In a test office with a made-up agent, it opens the conversation in the corner
 * panel over the Settings page, selects words inside one message, right-clicks them, writes a comment
 * and keeps it with Start review, which shape B put where Save without sending was: it writes the
 * comment, sends nothing, and starts the page's review. It then reads what the server stored and checks that the comment
 * points at the sentence of that message holding the words, with the selected words, and not at the
 * page. Since problem DowO7yEioWp0 a message's sentences are parts of it, so the words are filed
 * against the part of the message they are in rather than against the whole message.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Context } from '../src/shared/targets.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const THE_MESSAGE = 'Option two keeps the gripper cooler during the long trials.'
const THE_WORDS = 'keeps the gripper cooler'
const THE_COMMENT = 'I choose this one.'

let messageId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'chat-message-target', viewport: { width: 1440, height: 1000 } })
  const file = async (headers: Record<string, string>, body: unknown): Promise<string> => {
    const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
    expect(made.status, await made.clone().text()).toBe(201)
    return ((await made.json()) as { record: { id: string } }).record.id
  }
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Option Agent',
    data: { handle: 'option-agent', runtime: 'claude-code', state: 'active' },
  })
  messageId = await file(
    { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'option-agent' },
    { kind: 'message', title: THE_MESSAGE.slice(0, 40), data: { body: THE_MESSAGE, to: [{ kind: 'person', id: THE_PERSON }] } },
  )

  // OVER ANOTHER PAGE, which is the case the problem was found in: a page key is then the nearest
  // one above the message if the message says nothing.
  await app.page.goto(`${app.site}/#/settings`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Option Agent"))')
  await app.page.waitForSelector(`.px-chat-words:has-text("${THE_MESSAGE}")`, { timeout: 20_000 })
  await sleep(500)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a right-click on words in a chat message', () => {
  it('is filed against the sentence of that message, with the words selected', async () => {
    // SELECT THE WORDS, then right-click in the middle of them, the way a person does.
    await app.page.evaluate(
      ({ message, words }) => {
        const bubble = [...document.querySelectorAll('.px-chat-words')].find((one) => one.textContent?.includes(message))
        if (bubble === undefined) throw new Error('the message is not drawn')
        const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node !== null && !(node.textContent ?? '').includes(words)) node = walker.nextNode()
        if (node === null) throw new Error('the words are not in one run of text')
        const start = (node.textContent ?? '').indexOf(words)
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + words.length)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        const at = range.getBoundingClientRect()
        node.parentElement?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: Math.round(at.left + at.width / 2),
            clientY: Math.round(at.top + at.height / 2),
          }),
        )
      },
      { message: THE_MESSAGE, words: THE_WORDS },
    )
    await app.page.waitForSelector('.px-talk', { timeout: 15_000 })
    await app.page.locator('.px-talk textarea').first().fill(THE_COMMENT)
    await app.page.getByRole('button', { name: 'Start review', exact: true }).click()
    await app.page.waitForSelector('.px-talk-said', { timeout: 15_000 })

    const reply = (await (
      await fetch(`${app.api}/api/messages/comments`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { comments?: { kind: string; data?: { body?: string; context?: Context; target?: Context } }[] }
    const written = (reply.comments ?? []).find((row) => row.data?.body === THE_COMMENT)
    expect(written, `the comment was not stored: ${JSON.stringify(reply).slice(0, 300)}`).toBeDefined()
    const context = (written?.kind === 'annotation' ? written.data?.context : written?.data?.target) ?? null
    expect(context?.target, 'the comment was not filed against the sentence of the message').toEqual({
      kind: 'region',
      recordId: messageId,
      regionId: 'data.body@0',
    })
    const place = context?.place
    const pointed = place?.at === 'quote' ? place.words : place?.at === 'words' ? place.span.quote : null
    expect(pointed, 'the selected words were not kept').toBe(THE_WORDS)
  }, 120_000)
})
