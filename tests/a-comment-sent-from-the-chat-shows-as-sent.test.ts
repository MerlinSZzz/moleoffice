// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantOnTheWire } from '../src/web/api.ts'

// PROBLEM h9yY-r8s3vHZ. The chat re-reads a conversation with since=<its last read>. Sending a
// comment moves the word of the message that carries it, and wrote nothing that re-read looked at, so
// the page went on saying the comment had not been sent until it was reloaded. It showed only when
// the page's last read fell in a later second than the comment's last write, which is what the wait
// below makes sure of.

let app: LiveApp
let bundle: string
let fern: ParticipantOnTheWire
let note: string
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

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-sent-from-the-chat', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  await ask('/api/participants/person/' + THE_PERSON, 'PATCH', { name: 'Robin Test' })
  await file('agent', 'Fern Test', { handle: 'fern-sent-test', runtime: 'codex', state: 'active' })
  fern = (await ask('/api/participants/agent/fern-sent-test')).participant
  await ask('/api/participants/agent/' + fern.id, 'PATCH', { startedBy: 'me' })
  // DESIGN D DRAWS THE CORNER CIRCLE ONLY WHILE A MESSAGE WAITS, so one made-up line is left waiting for the reader.
  // It is from an agent the cases do not open, because opening a conversation marks its messages seen and the next case
  // would then find no circle.
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
  note = await file('note', 'Test note title', { body: 'A made-up note for the sent-comment check.' })
  const result = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'sent-proof.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {theApiIsOnPort} from './src/web/lib/api-address.ts';
      theApiIsOnPort(${app.apiPort});
      const {Chat} = await import('./src/web/components/Chat.tsx');
      const {UI_CSS} = await import('./src/web/components/ui.tsx');
      const {readLanguage} = await import('./src/web/lib/language.ts');
      const {openReview} = await import('./src/web/lib/review.ts');
      await readLanguage();
      window.sentProof = { openReview };
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
  await app.page.route('**/sent-proof?*', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>' }))
  app.page.on('pageerror', error => errors.push(error.message))
}, 240_000)

afterAll(async () => { await app?.stop() })

it('shows a comment sent from the chat as sent without a reload, when the conversation was read in a later second than the comment was written', async () => {
  const page = app.page
  await page.goto(app.api + '/sent-proof?lang=en')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') +
    readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.locator('.px-chat-circle').click()
  await page.locator('.px-chat-filter').waitFor({ timeout: 10_000 })
  const target = { target: { kind: 'record', recordId: note, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await ask('/api/reviews', 'POST', { entry: target })
  await file('message', 'A test review comment', { body: 'A test comment to send.',
    chosenRecipient: { kind: 'new', said: 'a new test agent' }, to: [{ kind: 'agent', id: fern.id }], target })
  // THE PAGE'S LAST READ MUST FALL IN A LATER SECOND THAN THE COMMENT'S LAST WRITE. The write is stamped no later
  // than its reply came back, so wait for the clock to leave the second the reply came back in, rather than for a
  // fixed 2.2 seconds. The stored stamp is not read back: it is local time with no zone, which in the repeated hour
  // of a clock change can read an hour early.
  const answeredIn = Math.floor(Date.now() / 1000)
  await expect.poll(() => Math.floor(Date.now() / 1000) > answeredIn, { timeout: 10_000, interval: 50 }).toBe(true)
  await page.evaluate(id => (window as any).sentProof.openReview(id, true), review.review.id)
  await page.locator('[data-contact="agent:' + fern.id + '"]').click()
  await page.locator('.px-chat-unsent-bar').waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  await page.getByRole('button', { name: /^Finish collecting ·/ }).click()
  await page.waitForFunction(() => !document.querySelector('.px-chat-unsent-bar'), undefined, { timeout: 15_000 })
  expect(errors).toEqual([])
}, 90_000)

it('reads the shown conversation comments fresh at Send, redraws an edited body and sends nothing', async () => {
  const page = app.page
  await page.goto(app.api + '/sent-proof?lang=en')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.locator('.px-chat-circle').click()
  const on = await file('note', 'Made-up chat edit page', { body: 'A made-up firing schedule.' })
  const target = { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await ask('/api/reviews', 'POST', { entry: target })
  const comment = await file('message', 'Made-up chat edit comment', { body: 'The shelf was measured once.',
    chosenRecipient: { kind: 'new', said: 'a new test agent' }, to: [{ kind: 'agent', id: fern.id }], target })
  await page.evaluate(id => (window as any).sentProof.openReview(id, true), review.review.id)
  await page.locator('[data-contact="agent:' + fern.id + '"]').click()
  await page.getByText('The shelf was measured once.', { exact: true }).waitFor()
  let freshReads = 0
  const conversation = '**/api/messages/conversation?*'
  await page.route(conversation, async intercepted => {
    freshReads += 1
    if (freshReads === 1) await intercepted.continue()
    else await intercepted.abort('failed')
  })
  // Change it inside the fresh-read request, so no conversation event can redraw it before the press.
  const route = `**/api/reviews/${review.review.id}`
  await page.route(route, async intercepted => {
    await ask(`/api/records/${comment}`, 'PATCH', { dataPatch: { body: 'The shelf was measured twice.' } })
    await intercepted.continue()
  }, { times: 1 })
  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  await page.getByText('Nothing was sent. The unsent comments or their review changed after they were shown. The conversation has been read again.', { exact: true }).waitFor({ timeout: 10_000 })
  await page.getByText('The shelf was measured twice.', { exact: true }).waitFor({ timeout: 10_000 })
  expect(freshReads, 'the successful fresh reply itself supplies the redraw').toBe(1)
  expect((await ask(`/api/reviews/${review.review.id}`)).review.state).toBe('collecting')
  const shots = process.env['REVIEW_CHAT_SHOTS']
  if (shots) {
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await page.emulateMedia({ colorScheme: theme })
        await page.evaluate(value => { document.documentElement.dataset['theme'] = value }, theme)
        await page.screenshot({ path: `${shots}/chat-${String(width)}-${theme}.png` })
      }
    }
  }
  await ask(`/api/reviews/${review.review.id}/abandon`, 'POST')
  await page.unroute(conversation)
}, 90_000)

// THE OTHER BRANCH OF `sendTheComments`: the review shows no change, so the narrowed read is asked, and it differs.
// The body is changed inside the narrowed read, after the review was read, so only that read can see the new one.
// It has its own agent: an earlier case leaves an unsent comment of an abandoned review in its conversation with fern, and with that comment shown the narrowed read is not asked.
it('compares the unsent comments through the narrowed read at Send, reads the conversation whole when they differ and sends nothing', async () => {
  const page = app.page
  await file('agent', 'Sage Test', { handle: 'sage-narrowed-test', runtime: 'codex', state: 'active' })
  const sage = (await ask('/api/participants/agent/sage-narrowed-test')).participant
  await ask('/api/participants/agent/' + sage.id, 'PATCH', { startedBy: 'me' })
  await page.goto(app.api + '/sent-proof?lang=en')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.locator('.px-chat-circle').click()
  const on = await file('note', 'Made-up chat narrowed page', { body: 'A made-up watering rota.' })
  const target = { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await ask('/api/reviews', 'POST', { entry: target })
  const comment = await file('message', 'Made-up chat narrowed comment', { body: 'The ferns were watered once.',
    chosenRecipient: { kind: 'new', said: 'a new test agent' }, to: [{ kind: 'agent', id: sage.id }], target })
  await page.evaluate(id => (window as any).sentProof.openReview(id, true), review.review.id)
  await page.locator('[data-contact="agent:' + sage.id + '"]').click()
  await page.getByText('The ferns were watered once.', { exact: true }).waitFor()
  const reads: string[] = []
  let edited = false
  const conversation = '**/api/messages/conversation?*'
  await page.route(conversation, async intercepted => {
    reads.push(intercepted.request().url())
    if (!edited && new URL(intercepted.request().url()).searchParams.get('only') === 'my-unsent') {
      edited = true
      await ask(`/api/records/${comment}`, 'PATCH', { dataPatch: { body: 'The ferns were watered twice.' } })
    }
    await intercepted.continue()
  })
  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  await page.getByText(en.t('chat.commentsChangedAtSend'), { exact: true }).waitFor({ timeout: 10_000 })
  await page.getByText('The ferns were watered twice.', { exact: true }).waitFor({ timeout: 10_000 })
  // WHAT EACH READ ASKED: its query's names, with the narrowing's value. A whole read asks for no page and no narrowing.
  const asked = reads.map(one => [...new URL(one).searchParams].map(([name, value]) => name === 'only' ? `only=${value}` : name).sort())
  expect(asked, 'the narrowed read, then one whole read').toEqual([['id', 'kind', 'only=my-unsent'], ['id', 'kind']])
  expect((await ask(`/api/reviews/${review.review.id}`)).review.state).toBe('collecting')
  await ask(`/api/reviews/${review.review.id}/abandon`, 'POST')
  await page.unroute(conversation)
}, 90_000)
