// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT LEFT BY AN ABANDONED REVIEW DOES NOT STOP THE CHAT'S SEND.
 *
 * Abandoning a review leaves its comments as they were, so a comment it held is still drawn in the chat as not sent.
 * A review started later on another page never holds that comment: it collects only what its starter wrote at or after
 * its start, and the comments saved before its start inside its own scope. On main's code the chat's Send them
 * compares every shown comment that is not sent with the open review. The old comment is not in the review, so Send
 * them answers that the review had changed and sends nothing, in that conversation, every time.
 *
 * This test writes a comment in a review of one note and abandons that review. It then starts a review of another
 * note, writes a new comment to the same agent, opens that review and the conversation, and presses Send them. It
 * asks that Send them goes on to the finish question rather than the changed-review sentence, and that finishing sends
 * the new comment while the old one stays not sent. It fails on main's code.
 *
 * Everything here is made up. The servers come from `liveApp` in tests/helpers.ts, on a database of this test's own.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantOnTheWire } from '../src/web/api.ts'

let app: LiveApp
let bundle: string
let wren: ParticipantOnTheWire
const errors: string[] = []
const en = createI18n('en')
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function ask(path: string, method = 'GET', body?: unknown) {
  const reply = await fetch(app.api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const aLetterNothingHolds = path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  expect(aLetterNothingHolds ? reply.status === 409 : reply.ok, await reply.clone().text()).toBe(true)
  return reply.json()
}

async function file(kind: string, title: string, data: unknown) {
  return (await ask('/api/records', 'POST', { kind, title, data })).record.id as string
}

/** A comment to the made-up agent, pointing at the surface of a note. */
async function aComment(title: string, body: string, note: string) {
  const target = { target: { kind: 'record', recordId: note, workspaceId: 'default' }, place: { at: 'surface' } }
  return file('message', title, { body, chosenRecipient: { kind: 'new', said: 'a new test agent' }, to: [{ kind: 'agent', id: wren.id }], target })
}

/** The ids of the reader's own comments in the conversation with the made-up agent that nobody has sent yet. */
async function stillUnsent(): Promise<string[]> {
  const read = (await ask(`/api/messages/conversation?kind=agent&id=${encodeURIComponent(wren.id)}&only=my-unsent`)) as {
    messages: { id: string; notSentYet: boolean }[]
  }
  return read.messages.filter((one) => one.notSentYet).map((one) => one.id).sort()
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-of-an-abandoned-review', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  await ask('/api/participants/person/' + THE_PERSON, 'PATCH', { name: 'Robin Test' })
  await file('agent', 'Wren Test', { handle: 'wren-abandoned-test', runtime: 'codex', state: 'active' })
  wren = (await ask('/api/participants/agent/wren-abandoned-test')).participant
  await ask('/api/participants/agent/' + wren.id, 'PATCH', { startedBy: 'me' })
  // THE CORNER CIRCLE IS DRAWN ONLY WHILE A MESSAGE WAITS, so one made-up line from another agent waits for the reader.
  await file('agent', 'Circle Keeper', { handle: 'circle-keeper', runtime: 'codex', state: 'active' })
  const keeper = (await ask('/api/participants/agent/circle-keeper')).participant
  const waiting = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': keeper.id },
    body: JSON.stringify({
      kind: 'message',
      title: 'A made-up waiting line',
      data: { body: 'A made-up line waiting for the reader.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(waiting.status, await waiting.clone().text()).toBe(201)
  const result = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'abandoned-proof.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {theApiIsOnPort} from './src/web/lib/api-address.ts';
      theApiIsOnPort(${app.apiPort});
      const {Chat} = await import('./src/web/components/Chat.tsx');
      const {UI_CSS} = await import('./src/web/components/ui.tsx');
      const {readLanguage} = await import('./src/web/lib/language.ts');
      const {openReview} = await import('./src/web/lib/review.ts');
      await readLanguage();
      window.abandonedProof = { openReview };
      createRoot(document.getElementById('root')).render(<><style>{UI_CSS}</style><Chat/></>);
    ` },
    loader: { '.css': 'empty' }, bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  bundle = result.outputFiles[0]!.text
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.removeItem('mole-office.chat.open')
    localStorage.removeItem('mole-office.chat.with')
  })
  await app.page.route('**/abandoned-proof?*', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>' }))
  app.page.on('pageerror', error => errors.push(error.message))
}, 240_000)

afterAll(async () => { await app?.stop() })

it('sends the open review\'s comment from the chat when a comment of an abandoned review is still drawn as not sent in that conversation', async () => {
  const page = app.page

  // THE OLD COMMENT: written in a review of one note, and that review abandoned.
  const first = await file('note', 'Made-up abandoned page', { body: 'A made-up kiln log.' })
  const abandoned = await ask('/api/reviews', 'POST', { entry: { target: { kind: 'record', recordId: first, workspaceId: 'default' }, place: { at: 'surface' } } })
  const old = await aComment('Made-up abandoned comment', 'The kiln was fired once.', first)
  await ask(`/api/reviews/${abandoned.review.id}/abandon`, 'POST')

  // THE NEW COMMENT: written in a review of another note, started after the first was abandoned.
  const second = await file('note', 'Made-up open page', { body: 'A made-up glaze list.' })
  const open = await ask('/api/reviews', 'POST', { entry: { target: { kind: 'record', recordId: second, workspaceId: 'default' }, place: { at: 'surface' } } })
  const fresh = await aComment('Made-up open comment', 'The glaze was mixed twice.', second)
  expect(await stillUnsent(), 'both comments are not sent before the press').toEqual([old, fresh].sort())

  await page.goto(app.api + '/abandoned-proof?lang=en')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.locator('.px-chat-circle').click()
  await page.locator('.px-chat-filter').waitFor({ timeout: 10_000 })
  await page.evaluate(id => (window as any).abandonedProof.openReview(id, true), open.review.id)
  await page.locator('[data-contact="agent:' + wren.id + '"]').click()
  await page.getByText('The kiln was fired once.', { exact: true }).waitFor({ timeout: 10_000 })
  await page.getByText('The glaze was mixed twice.', { exact: true }).waitFor({ timeout: 10_000 })
  await page.getByText(en.t('chat.unsentHere', { n: 2 }), { exact: true }).waitFor({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  const finish = page.getByRole('button', { name: /^Finish collecting ·/ })
  const refused = page.getByText(en.t('review.b.changedNothingSent'), { exact: true })
  await finish.or(refused).first().waitFor({ timeout: 10_000 })
  expect(await refused.count(), 'Send them answered that the review had changed').toBe(0)

  await finish.click()
  await expect.poll(stillUnsent, { message: 'the open review\'s comment was not sent, or the old one was', timeout: 15_000 }).toEqual([old])
  expect(await refused.count(), 'the chat said the review had changed').toBe(0)
  expect(errors).toEqual([])
}, 90_000)
