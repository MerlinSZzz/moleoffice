// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROUND CHAT BUTTON CARRIES A PICTURE, AND THE OWNER CHOOSES WHICH.
 *
 * The pictures kept to choose from are mole-at-the-sill, three-moles-at-the-sill, mole-in-a-porthole,
 * two-moles-talking, mole-at-the-sill.svg and mole-in-a-porthole.svg. The rest are deleted, and the
 * default is mole-at-the-sill. Criterion M38 of design/messages/ACCEPTANCE.md section 9g.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The decision: with no picture chosen, the button draws mole-at-the-sill in the light look,
 * inside that look's frame; picking one still stores it and changes the button. Not choosing stays a
 * different stored fact from choosing mole-at-the-sill: the row keeps NULL and Settings presses no
 * picture. The bytes are fetched as the browser fetches them, so a name that has no file behind it
 * fails here rather than drawing a broken picture with no console error — the fault Avatar.tsx
 * already records.
 *
 * THE FILES ARE READ FROM THE DECLARATION, so a picture added or renamed there is checked without
 * this file being edited, and a name declared with no file in the checkout fails.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case asserts the button is there and that nobody has chosen a picture, before it asserts
 * which picture it draws. The unread bubble is asserted still to work in the same case as the
 * picture, because losing it while gaining a picture is the failure this change could cause.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import type { Request } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES,
  CIRCLE_PICTURES,
  circlePictureUrl,
} from '../src/shared/messages.ts'
import { AVATARS_IN_THE_CHECKOUT } from '../src/shared/participants.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const CIRCLE_DIR = join(fileURLToPath(new URL('../', import.meta.url)), AVATARS_IN_THE_CHECKOUT, 'circle')

async function openThePage(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
}

/** File one unread message for the person, so design D draws the corner circle while the chat is shut. */
async function aWaitingMessage(handle: string, words: string): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle },
    body: JSON.stringify({ kind: 'message', title: words.slice(0, 40), data: { body: words, to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  return ((await said.json()) as { record: { id: string } }).record.id
}

/** What the button draws: the address of its picture, and its text. */
async function theButton(): Promise<{ src: string; text: string }> {
  return app.page.$eval('.px-chat-circle', (one) => ({
    src: one.querySelector('img')?.getAttribute('src') ?? '',
    text: one.textContent ?? '',
  }))
}

/** Whether the picture on the button has been fetched and drawn. */
async function thePictureIsDrawn(): Promise<boolean> {
  return app.page.locator('.px-chat-circle img').evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)
}

const THE_DEFAULT = `/api/chat-circle/${CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES}`

const looks = ['light'] as const
const widths = [1440, 990, 660, 390] as const

async function useLook(look: string): Promise<void> {
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
}

async function photograph(name: string, panel = false): Promise<void> {
  const folder = process.env.C2_SHOTS_DIR
  if (!folder) return
  mkdirSync(folder, { recursive: true })
  for (const width of widths) {
    await app.page.setViewportSize({ width, height: 1000 })
    if (panel) {
      await app.page.locator('.ccl-faces').scrollIntoViewIfNeeded()
      await app.page.locator('.ccl-faces').locator('xpath=ancestor::section[1]').screenshot({ path: join(folder, `${name}-${width}.png`) })
    } else {
      await app.page.screenshot({ path: join(folder, `${name}-${width}.png`) })
    }
    const box = await app.page.locator('.px-chat-circle').boundingBox()
    expect(box?.width).toBe(48)
    expect(box?.height).toBe(48)
    // THE CORNER'S INSET IS --fab-inset in src/web/tokens.css, 1rem at every width since wave 13q
    // round 4; the 12 pixels this once expected at 390 is gone.
    expect(box?.x).toBe(width - 48 - 16)
    expect(box?.y).toBe(1000 - 48 - 16)
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}

async function assertLook(look: string): Promise<void> {
  const drawn = await app.page.$eval('.px-chat-circle', (one) => {
    const css = getComputedStyle(one)
    return { background: css.backgroundColor, ink: css.color,
      radius: css.borderRadius, border: css.border, shadow: css.boxShadow, name: one.getAttribute('aria-label') }
  })
  expect(drawn.name).toBeTruthy()
  expect(drawn.background).toBe(look === 'light' ? 'rgb(253, 200, 0)' : 'rgb(38, 115, 201)')
  expect(drawn.ink).toBe(look === 'light' ? 'rgb(28, 41, 60)' : 'rgb(255, 255, 255)')
  // ROUND IN EVERY LOOK: the button is round in the light look too (wave 13y round 145).
  expect(drawn.radius).toBe('50%')
  expect(drawn.border).toBe(look === 'light' ? '3px solid rgb(28, 41, 60)' : '1px solid rgb(125, 187, 242)')
  expect(drawn.shadow).toBe(look === 'light' ? 'rgb(28, 41, 60) 4px 4px 0px 0px' : 'rgba(12, 92, 171, 0.45) 0px 10px 30px 0px')
}

async function me(): Promise<{ circlePicture: string | null }> {
  const got = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { participant: { circlePicture: string | null } }).participant
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-button-picture', viewport: { width: 1440, height: 1000 } })
  // THE WAITING MESSAGE'S WRITER IS FILED ONCE, so a second look cannot file the same handle again.
  const keeper = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Builder Picture Waiter', data: { handle: 'builder-picture-waiter', runtime: 'claude-code', state: 'active' } }),
  })
  expect(keeper.status, await keeper.clone().text()).toBe(201)
  // THE PERSON LAST HAD THE CHAT BESIDE THE PAGE, so the circle opens it there and the seam's away press puts it away.
  // The chat opens the way the person last had it, and the corner window when nothing is kept.
  const beside = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatOpensAs: 'split' }) })
  expect(beside.status, await beside.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the four the owner kept are the four the product has', () => {
  it('has a file in this checkout for every one of them', () => {
    // THE CONTROL: there are four to check. An empty declaration would pass the loop for free.
    expect(CIRCLE_PICTURES).toHaveLength(4)
    expect(CIRCLE_PICTURES.map((one) => one.name)).toEqual([
      'mole-at-the-sill',
      'three-moles-at-the-sill',
      'mole-in-a-porthole',
      'two-moles-talking',
    ])
    for (const one of CIRCLE_PICTURES) {
      const file = join(CIRCLE_DIR, one.file)
      expect(existsSync(file), `${one.name} names ${one.file}, which is not in this checkout`).toBe(true)
      expect(readFileSync(file).length, `${one.file} is empty`).toBeGreaterThan(0)
    }
  })

  it('serves each of them, and refuses a name nobody declared', async () => {
    for (const one of CIRCLE_PICTURES) {
      const got = await fetch(`${app.api}${circlePictureUrl(one.name)}`, { headers: AS_THE_OWNER })
      expect(got.status, `${one.name} is not served`).toBe(200)
      const type = got.headers.get('content-type') ?? ''
      expect(type, `${one.name} comes back as ${type}`).toMatch(one.file.endsWith('.svg') ? /svg/ : /png/)
      expect((await got.arrayBuffer()).byteLength).toBeGreaterThan(0)
    }
    // AND ONE OF THE THREE THE OWNER DELETED IS A REFUSAL AND NOT A READ OF SOMETHING ELSE.
    const gone = await fetch(`${app.api}/api/chat-circle/mole-face-close`, { headers: AS_THE_OWNER })
    expect(gone.status).toBe(404)
    expect(await gone.text()).toContain('mole-at-the-sill')
  }, 60_000)
})

describe('the button draws mole-at-the-sill when no picture is chosen', () => {
  it.each(looks)('draws mole-at-the-sill in the %s look, in the look\'s frame', async (look) => {
    expect((await me()).circlePicture, 'somebody has already chosen, so the default is not measured').toBeNull()
    await useLook(look)
    // DESIGN D DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so one made-up message waits for the person.
    const waiting = await aWaitingMessage('builder-picture-waiter', 'A made-up line waiting for the reader.')
    const pictures: string[] = []
    const watch = (request: Request): void => { if (request.url().includes('/api/chat-circle/')) pictures.push(request.url()) }
    app.page.on('request', watch)
    try {
      await openThePage()
      const button = await theButton()
      expect(button.src, 'with no choice the button draws mole-at-the-sill').toContain(THE_DEFAULT)
      expect(button.text, 'the button still draws the dot').not.toContain('●')
      await app.page.waitForFunction(() => {
        const img = document.querySelector('.px-chat-circle img') as HTMLImageElement | null
        return img !== null && img.complete && img.naturalWidth > 0
      })
      expect(await thePictureIsDrawn()).toBe(true)
      await assertLook(look)
      await photograph(`closed-default-${look}`)
      await app.page.click('.px-chat-circle')
      await app.page.waitForSelector('.px-chat')
      // THE CIRCLE IS NOT DRAWN WHILE THE CHAT IS OPEN. Put it away with the drawn press, so the
      // button the look is read from is on the screen again.
      await app.page.click('.px-chat-seam-away')
      await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
      await assertLook(look)
      expect(pictures.length, 'the default picture was never asked for').toBeGreaterThan(0)
      expect(pictures.every((url) => url.includes(THE_DEFAULT)), pictures.join(', ')).toBe(true)
      const marked = await fetch(`${app.api}/api/messages/${waiting}/mark`, {
        method: 'POST',
        headers: AS_THE_OWNER,
        body: JSON.stringify({ mark: 'seen' }),
      })
      expect(marked.status, await marked.clone().text()).toBe(200)
    } finally {
      app.page.off('request', watch)
    }
  }, 120_000)

  it('keeps its unread bubble, which is the thing the picture could have taken', async () => {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'agent',
        title: 'Builder Button',
        data: { handle: 'builder-button', runtime: 'claude-code', state: 'active' },
      }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-button' },
      body: JSON.stringify({
        kind: 'message',
        title: 'something unread',
        data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)

    await openThePage()
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-circle .px-chat-unread').length === 1,
      undefined,
      { timeout: 20_000 },
    )
    const bubble = await app.page.$eval('.px-chat-circle .px-chat-unread', (one) => one.textContent ?? '')
    expect(bubble).toBe('1')
    // The default picture and the frame remain underneath the unread bubble in the light look.
    for (const look of looks) {
      await useLook(look)
      await openThePage()
      expect((await theButton()).src).toContain(THE_DEFAULT)
      expect(await app.page.locator('.px-chat-circle .px-chat-unread').textContent()).toBe('1')
      await photograph(`unread-default-${look}`)
    }
  }, 120_000)
})

describe('the settings offer the four, and the one the owner picks is stored', () => {
  // Every Settings panel is folded to its title, so each visit below opens Settings at
  // "The chat button" by its address, which opens that panel.
  it('draws the four at the size the button draws them', async () => {
    await app.page.goto(`${app.site}/#/settings/chatbutton`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.ccl-face', { timeout: 20_000 })
    const offered = await app.page.$$eval('.ccl-face', (all) =>
      all.map((one) => ({
        name: one.getAttribute('data-picture') ?? '',
        chosen: one.getAttribute('aria-pressed'),
        width: one.querySelector('img')?.getBoundingClientRect().width ?? 0,
      })),
    )
    expect(offered.map((one) => one.name)).toEqual(CIRCLE_PICTURES.map((one) => one.name))
    // No picture was chosen. The default is named as what is showing, and no picture is pressed.
    expect(offered.filter((one) => one.chosen === 'true')).toEqual([])
    for (const one of offered) {
      expect(one.width, `${one.name} is not drawn at the button's own size`).toBeCloseTo(48, 0)
    }
    for (const look of looks) {
      await useLook(look)
      for (const language of ['en', 'zh']) {
        await app.page.goto(`${app.site}/?lang=${language}#/settings/chatbutton`)
        await app.page.waitForSelector('.ccl-faces')
        expect(await app.page.locator('.ccl-face[aria-pressed="true"]').count()).toBe(0)
        expect(await app.page.locator('.ccl-picture-showing .ccl-value').textContent()).toBe(language === 'en' ? 'mole at the sill, the default' : '窗台边的鼹鼠（未选择图片）')
        await photograph(`settings-no-choice-${look}-${language}`, true)
      }
    }
  }, 120_000)

  it('stores the one the owner presses and puts it on the button', async () => {
    await app.page.goto(`${app.site}/#/settings/chatbutton`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.ccl-face[data-picture="two-moles-talking"]', { timeout: 20_000 })
    await app.page.click('.ccl-face[data-picture="two-moles-talking"]')
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat-circle img')?.getAttribute('src')?.includes('two-moles-talking') === true,
      undefined,
      { timeout: 20_000 },
    )
    // THE REGISTRY IS WHAT IS READ. A press that only changed a drawing would pass the line above.
    expect((await me()).circlePicture).toBe('two-moles-talking')
    await app.page.waitForSelector('.ccl-face[data-picture="two-moles-talking"][aria-pressed="true"]')

    // AND IT SURVIVES A RELOAD, because it is stored for the owner and not held on a screen.
    await openThePage()
    expect((await theButton()).src).toContain('two-moles-talking')
    for (const look of looks) {
      await useLook(look)
      const pictures: string[] = []
      const watch = (request: Request): void => { if (request.url().includes('/api/chat-circle/')) pictures.push(request.url()) }
      app.page.on('request', watch)
      try {
        await app.page.reload()
        await waitForThePage(app.page, 30_000)
        await app.page.waitForSelector('.px-chat-circle img')
        const src = (await theButton()).src
        expect(pictures).toEqual([src])
        expect(src).toContain('/api/chat-circle/two-moles-talking')
        expect(await thePictureIsDrawn()).toBe(true)
        await assertLook(look)
        await photograph(`closed-picture-${look}`)
      } finally {
        app.page.off('request', watch)
      }
    }
  }, 120_000)

  it('keeps the saved choice during a refused save and returns to mole-at-the-sill after a saved reset', async () => {
    await app.page.goto(`${app.site}/#/settings/chatbutton`)
    await app.page.waitForSelector('.ccl-face[data-picture="two-moles-talking"][aria-pressed="true"]')
    // THE PICTURE'S OWN WAY BACK is the press drawn right after the four pictures. The panel draws one such press for each
    // setting the person has chosen, all with the same words, and this person has chosen how the chat opens.
    const reset = app.page.locator('.ccl-faces + .btnc').filter({ hasText: 'Back to not chosen' })
    expect(await reset.getAttribute('title')).toBe('If this change is saved, the button returns to mole at the sill.')
    let release!: () => void
    let arrived!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const requestArrived = new Promise<void>((resolve) => { arrived = resolve })
    // THE REFUSAL CARRIES THE SERVER'S OWN HEADERS, the world header among them. Problem
    // `FT0qcy8_Zs19`: a reply with no world header reads to the page as another world answering
    // (src/web/lib/world.ts). The page then blocks itself behind the wrong-world banner until the next
    // real reply, which can be the machine read thirty seconds later, and the click below has thirty
    // seconds. The fault the case waits for was then the wrong-world fault, not this refusal.
    const real = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: { ...AS_THE_OWNER, origin: app.site } })
    expect(real.headers.get('x-mole-office-world'), 'the server sent no world header to copy').toBeTruthy()
    const theServersHeaders = Object.fromEntries(real.headers)
    await real.arrayBuffer()
    delete theServersHeaders['content-length']
    delete theServersHeaders['content-encoding']
    await app.page.route('**/api/participants/person/**', async (route) => {
      if (route.request().method() !== 'PATCH') { await route.continue(); return }
      arrived()
      await pending
      await route.fulfill({ status: 403, headers: theServersHeaders, contentType: 'application/json', body: JSON.stringify({ error: 'Picture choice refused for this test.' }) })
    })
    try {
      await reset.click()
      await requestArrived
      expect(await app.page.locator('.ccl-face[aria-pressed="true"]').getAttribute('data-picture')).toBe('two-moles-talking')
      expect(await app.page.locator('.ccl-picture-showing .ccl-value').textContent()).toBe('two moles talking')
      expect((await theButton()).src).toContain('two-moles-talking')
      release()
      await app.page.waitForSelector('.ccl-fault')
      expect(await app.page.locator('.ccl-fault').textContent()).toContain('Picture choice refused for this test.')
      expect((await me()).circlePicture).toBe('two-moles-talking')
      expect(await app.page.locator('.ccl-face[aria-pressed="true"]').getAttribute('data-picture')).toBe('two-moles-talking')
    } finally {
      release()
      await app.page.unroute('**/api/participants/person/**')
    }
    await reset.click()
    await app.page.waitForFunction((url) => document.querySelector('.px-chat-circle img')?.getAttribute('src')?.includes(url) === true, THE_DEFAULT)
    await app.page.waitForFunction(() => document.querySelector('.ccl-picture-showing .ccl-value')?.textContent === 'mole at the sill, the default')
    expect((await me()).circlePicture).toBeNull()
    expect(await app.page.locator('.ccl-face[aria-pressed="true"]').count()).toBe(0)
    expect(await reset.count()).toBe(0)
    await openThePage()
    expect((await theButton()).src).toContain(THE_DEFAULT)
  }, 120_000)

  it('refuses a picture nobody declared, and refuses to set one on an agent', async () => {
    const wrong = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ circlePicture: 'mole-face-close' }),
    })
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).toContain('mole-at-the-sill')

    const onAnAgent = await fetch(`${app.api}/api/participants/agent/builder-button`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ circlePicture: 'two-moles-talking' }),
    })
    expect(onAnAgent.status).toBe(403)
  }, 60_000)
})
