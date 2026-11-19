// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ADDRESS_AS_PARTS, ADDRESS_AS_PART_MAX_CHARACTERS } from '../src/shared/address-as.ts'
import { createI18n, type PageLanguage } from '../src/shared/i18n.ts'
import type { ParticipantOnTheWire, ProfileReply } from '../src/web/api.ts'

// Every name and address here is made up. Only the test office's built-in person id is reused.
const PARTS = { name: 'Rowan Ashby', secondPerson: 'thou', thirdPerson: 'xe', title: '总工程师 / Save' }
const STAMP = '2026-09-12 09:08:07'
const PERSON: Record<string, string> = {
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
}
let app: LiveApp
let worker: { id: string; headers: Record<string, string> }
let secretary: { id: string; headers: Record<string, string> }
let profilePatch: Partial<ParticipantOnTheWire> | null = null

async function ask(method: string, path: string, headers = PERSON, body?: unknown) {
  const response = await fetch(app.api + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await response.json() as {
    participant: ParticipantOnTheWire; agent: { id: string }; whatToGiveIt: { key: string }; error: string
  }
  return { status: response.status, json }
}

async function start(handle: string, name: string, role: string) {
  const reply = await ask('POST', '/api/agents/started', PERSON, { handle, name, role })
  expect(reply.status).toBe(201)
  return { id: reply.json.agent.id, headers: {
    ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle,
    'x-mole-office-key': reply.json.whatToGiveIt.key,
  } }
}

async function set(kind: 'person' | 'agent', id: string, headers = PERSON, parts: Partial<typeof PARTS> = PARTS) {
  const reply = await ask('PUT', `/api/participants/${kind}/${id}/address-as`, headers, parts)
  expect(reply.status, reply.json.error).toBe(200)
  return reply.json.participant.addressAsSetBy!.at
}

async function open(kind: 'person' | 'agent', id: string, lang: PageLanguage, theme = 'light', asAgent = false) {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${theme}&reader=${asAgent ? worker.id : ''}#/who/${kind}/${id}`)
  await waitForThePage(app.page)
  await app.page.waitForSelector('.prof-address-as')
}

const card = () => app.page.locator('.px-panel').filter({ has: app.page.locator('.prof-address-as') })

async function photo(name: string, editor = false) {
  const dir = process.env['ADDRESS_CARD_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await (editor ? app.page.locator('.prof-address-as-form') : card()).scrollIntoViewIfNeeded()
  await app.page.screenshot({ path: `${dir}/${name}.png` })
}

beforeAll(async () => {
  app = await liveApp({ name: 'address-card-languages', viewport: { width: 1440, height: 1000 } })
  expect((await ask('PATCH', `/api/participants/person/${THE_PERSON}`, PERSON, { name: 'Morgan Vale' })).status).toBe(200)
  worker = await start('cedar-of-tests', 'Cedar Finch', 'worker')
  secretary = await start('reed-of-tests', 'Reed Scribe', 'secretary')
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    const reader = query.get('reader')
    localStorage.setItem('mole-office.actor', JSON.stringify(reader ? { type: 'agent', id: reader } : { type: 'human', id: person }))
  }, { person: THE_PERSON })
  // Old and unavailable setters cannot be made through today's write door. These cases alter only
  // the browser reply from this test office, and never write invented provenance to a real office.
  await app.page.route('**/api/participants/*/*/profile', async (route) => {
    const response = await route.fetch()
    const reply = await response.json() as ProfileReply
    if (profilePatch !== null) Object.assign(reply.participant, profilePatch)
    await route.fulfill({ response, json: reply })
  })
}, 240_000)

afterAll(async () => { await app?.stop() })

it('names every setter path in English and Chinese, with the stored local stamp and no invented role', async () => {
  for (const lang of ['en', 'zh'] as const) {
    const words = createI18n(lang).t
    const check = async (name: string, kind: 'person' | 'agent', id: string, expected: string | null, asAgent = false) => {
      await open(kind, id, lang, 'light', asAgent)
      if (expected === null) expect(await app.page.locator('.prof-address-as-set-by').count()).toBe(0)
      else await expect.poll(() => app.page.locator('.prof-address-as-set-by').textContent()).toBe(expected)
      expect(await card().innerText()).not.toContain('secretary')
      expect(await card().innerText()).not.toContain('秘书')
      await photo(`setter-${name}-${lang}`)
    }
    profilePatch = null
    let at = await set('person', THE_PERSON)
    await check('person-self', 'person', THE_PERSON, words('address.setByYou', { at }))
    await check('person-self-other-reader', 'person', THE_PERSON, words('address.setBySelfPerson', { name: 'Morgan Vale', at }), true)
    at = await set('agent', worker.id)
    await check('owner-agent', 'agent', worker.id, words('address.setByYou', { at }))
    await check('owner-agent-other-reader', 'agent', worker.id, words('address.setByNamed', { name: 'Morgan Vale', at }), true)
    at = await set('person', THE_PERSON, secretary.headers)
    await check('secretary-person', 'person', THE_PERSON, words('address.setByNamed', { name: 'Reed Scribe', at }))
    at = await set('agent', worker.id, secretary.headers)
    await check('secretary-agent', 'agent', worker.id, words('address.setByNamed', { name: 'Reed Scribe', at }))
    at = await set('agent', worker.id, worker.headers)
    await check('agent-self', 'agent', worker.id, words('address.setBySelfAgent', { name: 'Cedar Finch', at }))

    for (const kind of ['person', 'agent'] as const) {
      profilePatch = { addressAsSetBy: { kind, id: 'a-setter-no-longer-in-the-list', at: STAMP } }
      await check(`unknown-${kind}`, 'agent', worker.id, words(kind === 'agent' ? 'address.setByUnknownAgent' : 'address.setByUnknownPerson', { at: STAMP }))
      expect(await card().innerText()).not.toContain('a-setter-no-longer-in-the-list')
    }
    profilePatch = { addressAsSetBy: null, addressAs: PARTS }
    await check('before-recording', 'agent', worker.id, words('address.setBeforeRecording'))
    profilePatch = { addressAsSetBy: null, addressAs: {} }
    await check('nothing-set', 'agent', worker.id, null)
    profilePatch = null
    at = await set('agent', worker.id, worker.headers, {})
    await check('cleared-by-agent', 'agent', worker.id, words('address.setBySelfAgent', { name: 'Cedar Finch', at }))
  }
}, 240_000)

it('keeps the four stored values exact while translating titles, labels and empty parts at every width and look', async () => {
  profilePatch = null
  await set('person', THE_PERSON)
  await set('agent', worker.id, worker.headers)
  // The sweep of every width and theme is dropped; one width per language keeps the same claims:
  // the four stored values, the translated titles and labels, the empty parts and the card's bounds.
  const widthForLanguage = { en: 1440, zh: 990, xx: 660 } as const
  for (const lang of ['en', 'zh', 'xx'] as const) {
    const words = createI18n(lang).t
    const width = widthForLanguage[lang]
    for (const kind of ['person', 'agent'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await open(kind, kind === 'person' ? THE_PERSON : worker.id, lang)
      expect(await card().locator('.px-panel-title').textContent()).toBe(words(kind === 'person' ? 'address.titleYours' : 'address.titleTheirs'))
      expect(await card().locator('.prof-label').allTextContents()).toEqual(ADDRESS_AS_PARTS.map((part) => words(`address.part.${part}`)))
      expect(await card().locator('.prof-value').allTextContents()).toEqual(ADDRESS_AS_PARTS.map((part) => PARTS[part]))
      expect(await card().locator('[data-empty="yes"]').count()).toBe(0)
      expect(await app.page.locator('.prof-address-as-edit').count()).toBe(kind === 'person' ? 1 : 0)
      await card().scrollIntoViewIfNeeded()
      const bounds = await card().boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      if (lang !== 'xx') await photo(`${kind}-${lang}-${width}`)
      if (lang !== 'xx' && kind === 'person' && process.env['ADDRESS_CARD_SHOTS']) {
        await app.page.getByRole('button', { name: words('address.change'), exact: true }).click()
        await photo(`editor-${lang}-${width}`, true)
      }
      profilePatch = { addressAs: { name: PARTS.name } }
      await open(kind, kind === 'person' ? THE_PERSON : worker.id, lang)
      expect(await card().locator('.prof-value').allTextContents()).toEqual([PARTS.name, words('address.notSet'), words('address.notSet'), words('address.notSet')])
      expect(await card().locator('[data-empty="yes"]').count()).toBe(3)
      profilePatch = null
    }
  }
}, 240_000)

it('translates the editor presses and connection fault, keeps a refusal verbatim, and saves content unchanged', async () => {
  profilePatch = null
  await app.page.setViewportSize({ width: 660, height: 1000 })
  for (const lang of ['en', 'zh', 'xx'] as const) {
    const words = createI18n(lang).t
    await set('person', THE_PERSON)
    await open('person', THE_PERSON, lang)
    await app.page.getByRole('button', { name: words('address.change'), exact: true }).click()
    const form = app.page.locator('.prof-address-as-form')
    expect(await form.locator('h3').textContent()).toBe(words('address.titleYours'))
    expect(await form.locator('.prof-label').allTextContents()).toEqual(ADDRESS_AS_PARTS.map((part) => words(`address.part.${part}`)))
    expect(await form.locator('input').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(ADDRESS_AS_PARTS.map((part) => PARTS[part]))
    await form.getByRole('button', { name: words('address.leave'), exact: true }).click()
    expect(await form.count()).toBe(0)
    await app.page.getByRole('button', { name: words('address.change'), exact: true }).click()
    const tooLong = 'x'.repeat(ADDRESS_AS_PART_MAX_CHARACTERS + 1)
    const refusal = await ask('PUT', `/api/participants/person/${THE_PERSON}/address-as`, PERSON, { ...PARTS, name: tooLong })
    expect(refusal.status).toBe(400)
    await form.locator('[name="name"]').fill(tooLong)
    await form.getByRole('button', { name: words('address.save'), exact: true }).click()
    // Drawn by ErrorNote since wave 13k round 12, so a coded refusal is in the page's language. This
    // refusal has no code, so ErrorNote keeps the door's sentence as it was written, under the lead.
    await expect.poll(() => app.page.locator('.prof-address-as-failure .px-error-msg').textContent()).toContain(refusal.json.error)
    expect(await app.page.locator('.prof-address-as-failure .px-error-mark strong').textContent()).toBe(words('address.faultLead'))

    const path = `**/api/participants/person/${THE_PERSON}/address-as`
    await app.page.route(path, (route) => route.abort('failed'))
    await form.locator('[name="name"]').fill(PARTS.name)
    await form.getByRole('button', { name: words('address.save'), exact: true }).click()
    await expect.poll(() => app.page.locator('.prof-address-as-fault').textContent()).toBe(words('address.faultUnconfirmed'))
    expect(await form.locator('[name="name"]').inputValue()).toBe(PARTS.name)
    await app.page.unroute(path)

    // A gateway that answers without a server reason is also a connection fault, even with an HTTP status.
    await app.page.route(path, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    const gatewayReply = app.page.waitForResponse((response) => response.url().endsWith('/address-as') && response.status() === 503)
    await form.getByRole('button', { name: words('address.save'), exact: true }).click()
    await gatewayReply
    await expect.poll(() => app.page.locator('.prof-address-as-fault').textContent()).toBe(words('address.faultUnconfirmed'))
    await app.page.unroute(path)

    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    await app.page.route(path, async (route) => { await waiting; await route.continue() })
    await form.locator('[name="title"]').fill('Atlas / 领航员')
    const save = form.getByRole('button', { name: words('address.save'), exact: true })
    try {
      await save.click()
      await expect.poll(() => save.isDisabled()).toBe(true)
      await save.dispatchEvent('click')
      await expect.poll(() => form.locator('[role="status"]').textContent()).toBe(words('address.saving'))
    } finally { release() }
    await expect.poll(() => form.count()).toBe(0)
    await app.page.unroute(path)
    const stored = await ask('GET', `/api/participants/person/${THE_PERSON}`)
    expect(stored.json.participant.addressAs).toEqual({ ...PARTS, title: 'Atlas / 领航员' })
    await expect.poll(() => card().locator('.prof-value').last().textContent()).toBe('Atlas / 领航员')
  }
}, 180_000)
