// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROFILE PAGE NAMES WHO SET HOW AN AGENT READS RELEASES.
 *
 * Wave 13y round 10b, on the inspector's check 2GcQyaWmFcsO and the acceptance VWOz_tTzHtNn. Since round 10 a
 * secretary the owner has raised may say how another agent reads releases. The Releases panel still said "This agent
 * said so" for every agent that said it. Now it says that only when the agent itself said it; when another agent did,
 * it names that agent and says it did so as a secretary raised by the owner.
 *
 * Each value is written through the real door and read back through the real GET, and the sentence is the one the
 * page draws behind the "?" on the panel's heading (`whoSaidTheReleaseReading`). Every agent here is made up for the
 * test, in a fresh test database.
 *
 * PICTURES, only when R10B_SHOTS names a folder: both pages, with the Releases panel scrolled into view, at 1440, 990, 660
 * and 390 pixels wide in light and dark, and at 1440 in Chinese.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - `if (said.by.id === agentId)` changed to `if (said.by.kind === 'agent')` in `whoSaidTheReleaseReading`, which is
 *     what the page did before: case 2 goes red.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantsReply, ReleaseReadingReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let pp: ProfileModule

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

const keys = new Map<string, string>()

async function say(about: string, headers: Record<string, string>, because: string): Promise<void> {
  const reply = await app.app.inject({
    method: 'POST',
    url: `/api/participants/agent/${about}/reads-releases-from-the-check`,
    headers,
    payload: { ...FOR_THE_PERSON, on: true, because },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The sentence the Releases panel draws on this agent's page, from what the two doors the page reads answer. */
async function theSentenceOn(handle: string): Promise<string> {
  const profile = await app.app.inject({ method: 'GET', url: `/api/participants/agent/${handle}/profile`, headers: AS_THE_PERSON })
  expect(profile.statusCode, profile.body).toBe(200)
  const agentId = (profile.json() as { participant: { id: string } }).participant.id
  const read = await app.app.inject({ method: 'GET', url: `/api/participants/agent/${agentId}/reads-releases-from-the-check`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const said = (read.json() as ReleaseReadingReply).readsReleasesFromTheCheck
  expect(said, `nothing is stored for ${handle}`).not.toBeNull()
  const everyone = await app.app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  expect(everyone.statusCode, everyone.body).toBe(200)
  return pp.whoSaidTheReleaseReading(said!, agentId, everyone.json() as ParticipantsReply, null)
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  pp = await import('../src/web/pages/ProfilePage.tsx')
  for (const [handle, role] of [[THE_TEST_OFFICES_SECRETARY.handle, 'secretary'], ['itself-i', 'worker'], ['other-o', 'worker']] as const) {
    const made = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: `Synthetic ${handle}`, role } })
    expect(made.statusCode, made.body).toBe(201)
    const key = (made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key
    if (typeof key === 'string') keys.set(handle, key)
  }
  const pressed = await app.app.inject({
    method: 'POST',
    url: `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`,
    headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
    payload: { reason: 'a test raises it', endsWhen: 'when you say' },
  })
  expect(pressed.statusCode, pressed.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('the Releases panel names who said it', () => {
  it('1: says "This agent said so" when the agent itself said it, with its own key', async () => {
    expect(keys.get('itself-i'), 'the registration gave no key').toBeDefined()
    await say('itself-i', asAgent('itself-i', keys.get('itself-i')), 'Test: it reads its own releases.')
    const sentence = await theSentenceOn('itself-i')
    expect(sentence).toMatch(/^This agent said so .+\. Its reason: Test: it reads its own releases\.$/)
    expect(sentence).not.toContain('secretary')
  })

  it('2: names a raised secretary, and says it set it as one, when that secretary said it', async () => {
    await say('other-o', asAgent(THE_TEST_OFFICES_SECRETARY.handle, keys.get(THE_TEST_OFFICES_SECRETARY.handle)), 'Test: the secretary set it.')
    const sentence = await theSentenceOn('other-o')
    expect(sentence).toMatch(
      new RegExp(`^Synthetic ${THE_TEST_OFFICES_SECRETARY.handle} set this .+, as a secretary raised by the owner\\. The reason: Test: the secretary set it\\.$`),
    )
    expect(sentence).not.toContain('This agent said so')
  })

  it.skipIf(!process.env['R10B_SHOTS'])('3: photographs both pages with the Releases panel in view', async () => {
    const dir = process.env['R10B_SHOTS'] as string
    mkdirSync(dir, { recursive: true })
    const live = await liveApp({ name: 'release-reading-r10b', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      const shots: [number, 'light' | 'dark', 'en' | 'zh'][] = [
        ...[1440, 990, 660, 390].flatMap((width) => (['light', 'dark'] as const).map((look) => [width, look, 'en'] as [number, 'light' | 'dark', 'en'])),
        [1440, 'light', 'zh'],
        [1440, 'dark', 'zh'],
      ]
      for (const handle of ['itself-i', 'other-o']) {
        for (const [width, look, lang] of shots) {
          const page = await live.browser.newPage({ viewport: { width, height: 1000 } })
          await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
          await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/who/agent/${handle}`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
          const theSwitch = page.locator('[data-target="uiSurface/profile.releases"] [role="switch"]')
          await theSwitch.waitFor({ timeout: 30_000 })
          await theSwitch.scrollIntoViewIfNeeded()
          await page.screenshot({ path: `${dir}/releases-${handle}-${String(width)}-${look}-${lang}.png` })
          await page.close()
        }
      }
    } finally {
      await live.stop()
    }
  }, 600_000)
})
