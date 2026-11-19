// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, thePersonsKeyHeader, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, type PageLanguage } from '../src/shared/i18n.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'
import type { ParticipantOnTheWire, OneGroupReply } from '../src/web/api.ts'

let app: LiveApp
let bundle: string
let fern: ParticipantOnTheWire
let moss: ParticipantOnTheWire
let group: OneGroupReply['group']
let note: string
const shots = process.env.W13Q_G10_SHOTS
const errors: string[] = []
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const authored = ['Robin Test', 'Fern Test', 'Cedar Test Circle', 'Empty Test Circle',
  'The Cedar test shelf is ready. 原文保留。', 'Test note title', 'Check the test shelf', 'Moss Test']

async function ask(path: string, method = 'GET', body?: unknown, as = headers) {
  const reply = await fetch(app.api + path, { method, headers: as, body: body === undefined ? undefined : JSON.stringify(body) })
  const aLetterNothingHolds = method === 'POST' && path === '/api/records' && body !== undefined && theAnswerToAWriteInATestOffice(as, body) === 409
  expect(aLetterNothingHolds ? reply.status === 409 : reply.ok, await reply.clone().text()).toBe(true)
  return reply.json()
}

async function file(kind: string, title: string, data: unknown) {
  return (await ask('/api/records', 'POST', { kind, title, data })).record.id as string
}

beforeAll(async () => {
  const previousMachine = process.env.HOSTNAME
  process.env.HOSTNAME = 'cedar-test-desk'
  try {
    app = await liveApp({ name: 'chat-words-and-tiers', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  } finally {
    if (previousMachine === undefined) delete process.env.HOSTNAME
    else process.env.HOSTNAME = previousMachine
  }
  await app.page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  await ask('/api/participants/person/' + THE_PERSON, 'PATCH', { name: authored[0] })
  await file('agent', authored[1]!, { handle: 'fern-chat-test', runtime: 'codex', state: 'active' })
  fern = (await ask('/api/participants/agent/fern-chat-test')).participant
  await ask('/api/participants/agent/' + fern.id, 'PATCH', { startedBy: 'me' })
  await ask('/api/agents/started', 'POST', { handle: 'moss-chat-test', name: authored[7] },
    { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': fern.id })
  moss = (await ask('/api/participants/agent/moss-chat-test')).participant
  await ask('/api/participants/agent/' + fern.id, 'PATCH', { state: authored[6] })
  note = await file('note', authored[5]!, { body: 'A made-up note for the chat check.' })
  await ask('/api/records', 'POST', { kind: 'message', title: 'Test conversation content',
    data: { body: authored[4], to: [{ kind: 'person', id: THE_PERSON }] } },
  { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': fern.id })
  await ask('/api/records', 'POST', { kind: 'message', title: 'Test record link',
    data: { body: note, to: [{ kind: 'agent', id: fern.id }] } })
  group = (await ask('/api/groups', 'POST', { name: authored[2], because: 'Made-up group for the chat check.',
    members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'Test member.' },
      { who: { kind: 'agent', id: fern.id }, because: 'Test member.' }] })).group
  const result = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'chat-proof.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {theApiIsOnPort} from './src/web/lib/api-address.ts';
      theApiIsOnPort(${app.apiPort});
      const {Chat} = await import('./src/web/components/Chat.tsx');
      const {ChatCirclePanel} = await import('./src/web/components/ChatCircle.tsx');
      const {UI_CSS} = await import('./src/web/components/ui.tsx');
      const {wordCheck} = await import('./src/shared/i18n.ts');
      const {readLanguage} = await import('./src/web/lib/language.ts');
      const {openReview} = await import('./src/web/lib/review.ts');
      const {CHAT_WORDS, CIRCLE_PICTURES} = await import('./src/shared/messages.ts');
      const {GROUP_WORDS} = await import('./src/shared/groups.ts');
      await readLanguage();
      const root = createRoot(document.getElementById('root'));
      function draw(circle=false) {
        root.render(<><style>{UI_CSS}</style>{circle ? <ChatCirclePanel/> : null}<Chat/></>);
      }
      window.chatProof = { check: wordCheck, circle: () => draw(true), openReview,
        tables: () => ({ chat: CHAT_WORDS, group: GROUP_WORDS, pictures: CIRCLE_PICTURES }) };
      draw();
    ` },
    loader: { '.css': 'empty' }, bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  bundle = result.outputFiles[0]!.text
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('look') ?? 'light')
    localStorage.removeItem('mole-office.chat.open')
    localStorage.removeItem('mole-office.chat.with')
  })
  await app.page.route('**/chat-proof?*', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>' }))
  app.page.on('pageerror', error => errors.push(error.message))
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => { await app?.stop() })

async function open(language: PageLanguage = 'en', theme = 'light', width = 1440) {
  const page = app.page
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(app.api + '/chat-proof?lang=' + language + '&look=' + theme)
  await page.evaluate(theme => {
    document.documentElement.dataset.theme = theme
  }, theme)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') +
    readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.locator('.px-chat-circle').click()
  await page.locator('.px-chat-filter').waitFor({ timeout: 10_000 }).catch(async error => {
    throw new Error(String(error) + '\n' + await page.locator('body').innerText() + '\n' + errors.join('\n'))
  })
  // DESIGN D OPENS THE CHAT BESIDE THE PAGE FROM THE CIRCLE. These cases use the window's own close press, so the split
  // is sent to its own window, the frame they were written against, the way tests/open-the-chat.ts does.
  if ((await page.locator('.px-chat[data-where="split"]').count()) > 0) {
    await page.locator('.px-chat-seam-window').click()
    await page.locator('.px-chat[data-where="corner"]').waitFor({ timeout: 20_000 })
  }
  expect(errors).toEqual([])
  return page
}

async function photographOffer(page: Page, name: string) {
  if (!shots) return
  const language = new URL(page.url()).searchParams.get('lang')
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    if (await page.locator('.tiered-undo').count()) await page.locator('.tiered-undo').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, name + '-' + width + '-' + theme + '-' + language + '.png') })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

it('removes a group member once and offers an undo that really adds the member again', async () => {
  const page = await open()
  await page.locator('[data-tab="groups"]').click()
  await page.locator('[data-category="default"] > h3 .px-chat-edit').click()
  const remove = page.getByRole('button', { name: 'Take Fern Test out of this group', exact: true })
  await remove.click()
  await page.getByRole('button', { name: /^Undo ·/ }).waitFor()
  expect((await ask('/api/groups/' + group.id)).group.members.some((one: OneGroupReply['group']['members'][number]) => one.who.id === fern.id)).toBe(false)
  expect(await page.locator('dialog[open]').count()).toBe(0)
  await photographOffer(page, 'member-undo')
  await page.getByRole('button', { name: /^Undo ·/ }).click()
  await remove.waitFor()
  const joined = (await ask('/api/groups/' + group.id)).group.members.find((one: OneGroupReply['group']['members'][number]) => one.who.id === fern.id)
  expect(joined.joinedBecause).toBe(createI18n('en').t('chat.groupUndoBecause'))
  await page.waitForFunction(() => !document.querySelector('.tiered-undo'))
  await page.getByRole('button', { name: 'Take Robin Test out of this group', exact: true }).click()
  await page.getByRole('button', { name: /^Undo ·/ }).waitFor()
  expect((await ask('/api/groups/' + group.id)).yours).toBe(false)
  await photographOffer(page, 'self-remove-undo')
  await page.getByRole('button', { name: /^Undo ·/ }).click()
  await page.waitForFunction(() => !document.querySelector('.tiered-undo'))
  expect((await ask('/api/groups/' + group.id)).yours).toBe(true)
}, 60_000)

it('leaves a group, rejoins through Undo, and ends the undo offer after its window', async () => {
  const page = await open()
  await page.locator('[data-tab="groups"]').click()
  await page.getByRole('button').filter({ has: page.locator('.px-chat-name', { hasText: authored[2] }) }).click()
  await page.getByRole('button', { name: 'Leave this group', exact: true }).click()
  await page.getByRole('button', { name: /^Undo ·/ }).waitFor()
  expect((await ask('/api/groups/' + group.id)).yours).toBe(false)
  await photographOffer(page, 'leave-undo')
  await page.getByRole('button', { name: /^Undo ·/ }).click()
  await page.getByRole('button', { name: 'Leave this group', exact: true }).waitFor()
  expect((await ask('/api/groups/' + group.id)).yours).toBe(true)
  await page.getByRole('button', { name: 'Leave this group', exact: true }).click()
  await page.getByRole('button', { name: /^Undo ·/ }).waitFor()
  await page.waitForFunction(() => ![...document.querySelectorAll('.tiered-undo button')].length, undefined, { timeout: 15_000 })
  expect((await ask('/api/groups/' + group.id)).yours).toBe(false)
  await ask('/api/groups/' + group.id + '/members', 'POST', { who: { kind: 'person', id: THE_PERSON }, because: 'Restore the test fixture.' })
}, 60_000)

it('keeps finish collecting behind its second press, with cancellation and closing requiring neither tier', async () => {
  const page = await open()
  const review = await ask('/api/reviews', 'POST', {
    entry: { target: { kind: 'record', recordId: note, workspaceId: 'default' }, place: { at: 'surface' } },
  })
  await file('message', 'A test review comment', { body: 'A test comment before finishing.',
    chosenRecipient: { kind: 'new', said: 'a new test agent' },
    to: [{ kind: 'agent', id: fern.id }], target: { target: { kind: 'record', recordId: note, workspaceId: 'default' }, place: { at: 'surface' } } })
  await page.evaluate(id => (window as any).chatProof.openReview(id, true), review.review.id)
  await page.locator('[data-contact="agent:' + fern.id + '"]').click()
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && /finish-collecting|\/send$/.test(request.url())) writes.push(request.url()) })
  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  await page.getByRole('button', { name: /^Finish collecting ·/ }).waitFor()
  expect(writes).toEqual([])
  await photographOffer(page, 'finish-confirm')
  expect((await ask('/api/reviews/' + review.review.id)).review.state).toBe('collecting')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await page.getByRole('button', { name: /^Finish collecting ·/ }).count()).toBe(0)
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Send them', exact: true }).click()
  await page.getByRole('button', { name: /^Finish collecting ·/ }).click()
  await page.waitForFunction(() => !document.querySelector('.px-chat-unsent-bar'))
  expect(writes.filter(one => one.endsWith('/finish-collecting'))).toHaveLength(1)
  const people = await ask('/api/participants')
  for (const agent of people.agents as ParticipantOnTheWire[]) {
    if (agent.id !== fern.id && agent.id !== moss.id && agent.handle !== MOLE_OFFICE_HANDLE) await ask('/api/participants/agent/' + agent.id, 'PATCH', { name: 'Hazel Test' })
  }
  await page.locator('.px-chat-close').click()
  expect(await page.locator('.px-chat').count()).toBe(0)
  expect(await page.locator('dialog[open], .tiered-undo').count()).toBe(0)
}, 90_000)
