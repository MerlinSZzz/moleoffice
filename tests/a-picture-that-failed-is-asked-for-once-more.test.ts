// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE THAT FAILED IS ASKED FOR ONCE MORE, AT AN ADDRESS NEW FOR THIS PAGE LOAD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A picture is served with `cache-control: public, max-age=31536000, immutable`, so a browser never
 * asks for the same address again. A copy that reached the browser broken — most likely a file cut
 * short while the office restarted — is kept for a year. `Avatar.tsx` fell back to the drawn picture
 * on the first error and never asked for the chosen one again, so the face stayed wrong until
 * somebody reloaded with the cache disabled. Problem `wFQl7Y1imySi`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FIRST CASE USES THE REAL BROWSER CACHE AND NO page.route
 * ---------------------------------------------------------------------------------------
 *
 * Playwright turns the HTTP cache off while request routing is on, so a routed case would prove
 * "asks again at a new address" and not the thing that went wrong: a broken copy already kept. So
 * the first case cuts the stored file short in this test's own app directory, opens the page, lets
 * the browser keep the broken answer, puts the file back whole and reloads. The plain address then
 * comes from the browser's own cache, and only the retry address reaches the server.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PROFILE PAGE AND NOT THE CHAT PANEL
 * ---------------------------------------------------------------------------------------
 *
 * The other web piece of this wave changes the chat panel's layout, and nothing here may be moved
 * by it. The person's profile page draws one `img.avatar` and no chat panel.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Request } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { defaultAvatarAssetId } from '../src/shared/participants.ts'
import { askedAgain, THIS_LOAD } from '../src/web/components/Avatar.tsx'

let app: LiveApp

/** The owner's own headers, which is who may change the person's picture. */
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A real one-pixel PNG, taken from the other picture tests so this file invents no fixture.
 *
 * The file on disk is cut to half its bytes for the broken copy. A browser reads the PNG signature
 * and the header and then fails, which fires the error this component catches.
 */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** What the one picture on the profile page turned out to be. */
interface PictureOnThePage {
  src: string
  naturalWidth: number
  alt: string
  which: string | null
  askedAgain: string | null
}

beforeAll(async () => {
  app = await liveApp({ name: 'avatar-retry', viewport: { width: 1440, height: 1000 } })
}, 300_000)

afterAll(async () => {
  await app.stop()
})

/**
 * Send a real picture for the person and hand back the file the answer says was stored.
 *
 * The route answers with the participant and with the upload it made. The address is checked to be
 * an asset's, and the file is read from the upload's own `path` rather than guessed: the server
 * names where it put the bytes beside this test's database, in the format it stored them.
 */
async function putAPictureOnJamie(): Promise<string> {
  const sent = await fetch(`${app.api}/api/participants/person/${THE_PERSON}/avatar`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ bytes: A_REAL_PNG.toString('base64') }),
  })
  expect(sent.status, await sent.clone().text()).toBe(201)
  const said = (await sent.json()) as {
    participant: { avatarUrl: string }
    upload: { path: string }
  }
  const address = said.participant.avatarUrl
  expect(address.startsWith('/api/assets/'), `the uploaded picture was not named as an asset: ${address}`).toBe(true)
  return join(app.dir, said.upload.path)
}

/** Cut the stored file to half its bytes, and hand back the whole file so it can be put back. */
function cutTheFileShort(file: string): Buffer {
  const whole = readFileSync(file)
  writeFileSync(file, whole.subarray(0, Math.max(1, Math.floor(whole.length / 2))))
  return whole
}

/**
 * Open the person's profile as a document of its own, so this page load has its own value.
 *
 * An empty page first, because moving between two `#/…` addresses in this app is a change of
 * fragment and does not reload the bundle. A fresh document is what recomputes the one value every
 * picture on the page shares.
 */
async function openTheProfileAFresh(): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#/who/person/${THE_PERSON}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** Wait until the one picture says it is this state and the browser is finished with it, then read it. */
async function waitForThePicture(which: string): Promise<PictureOnThePage> {
  await app.page.waitForSelector(`img.avatar[data-picture="${which}"]`, { timeout: 30_000 })
  await app.page.waitForFunction(
    (wanted) => {
      const one = document.querySelector('img.avatar')
      return one instanceof HTMLImageElement && one.getAttribute('data-picture') === wanted && one.complete
    },
    which,
    { timeout: 30_000 },
  )
  return app.page.$eval('img.avatar', (one) => {
    const picture = one as HTMLImageElement
    return {
      src: picture.src,
      naturalWidth: picture.naturalWidth,
      alt: picture.alt,
      which: picture.getAttribute('data-picture'),
      askedAgain: picture.getAttribute('data-asked-again'),
    }
  })
}

/** Wait until the chosen picture has drawn, which is the state a recovered retry ends in. */
async function waitForTheChosenPictureToDraw(): Promise<void> {
  await app.page.waitForFunction(
    () => {
      const one = document.querySelector('img.avatar')
      return (
        one instanceof HTMLImageElement &&
        one.getAttribute('data-picture') === 'chosen' &&
        one.naturalWidth > 0
      )
    },
    undefined,
    { timeout: 30_000 },
  )
}

// ============================================================================ the real cache

describe('a broken copy in the browser is asked for again', () => {
  it('recovers the chosen picture on the next page load, with no routing', async () => {
    const file = await putAPictureOnJamie()
    expect(existsSync(file), 'the uploaded picture is not where the upload answer said it was').toBe(true)
    const whole = cutTheFileShort(file)

    // THE FIRST LOAD. The browser keeps the broken answer for a year. The retry is broken too, so
    // the picture settles on the drawn one, which is the state the owner's broken face was in.
    await openTheProfileAFresh()
    const first = await waitForThePicture('drawn')
    expect(first.naturalWidth, 'the drawn fallback did not draw either').toBeGreaterThan(0)
    expect(first.alt, 'the fallback label is not the one this product says').toContain('drawn by Mole Office')

    // THE FILE IS WHOLE AGAIN, AND THE PAGE IS RELOADED. The plain address now comes from the
    // browser's own cache; only the retry, at this page load's own value, reaches the server.
    writeFileSync(file, whole)
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await waitForTheChosenPictureToDraw()
    const after = await waitForThePicture('chosen')

    expect(after.naturalWidth, 'the recovered picture did not draw').toBeGreaterThan(0)
    expect(after.src, 'the recovered picture was not asked for at a new address').toContain('again=')
    expect(after.askedAgain, 'the retry mark is not on the recovered picture').toBe('yes')
    // THE ACCESSIBLE LABEL DOES NOT CHANGE while the retry is in use. It is the name, and not a
    // sentence about a swap that has not happened.
    const name = ((await app.page.locator('.prof-name').textContent()) ?? '').trim()
    expect(name.length, 'the profile page drew no name to compare the label with').toBeGreaterThan(0)
    expect(after.alt, 'the accessible label changed while the chosen picture drew').toBe(name)
  }, 240_000)
})

// ============================================================================ the retry stays broken

describe('a retry that is broken too falls back as before', () => {
  it('keeps the file cut short, ends on the drawn picture, and asks again exactly once', async () => {
    const file = await putAPictureOnJamie()
    const whole = cutTheFileShort(file)

    // page.on('request') does not turn the browser cache off, which routing does. This is the count
    // of addresses that carried the retry value, and there must be exactly one.
    const asked: string[] = []
    const countIt = (request: Request): void => {
      if (request.url().includes('again=')) asked.push(request.url())
    }
    app.page.on('request', countIt)
    let settled: PictureOnThePage
    try {
      await openTheProfileAFresh()
      settled = await waitForThePicture('drawn')
      expect(settled.alt, 'the drawn fallback label is not the one this product says').toContain('drawn by Mole Office')
      expect(
        asked.length,
        `the retry was asked for ${String(asked.length)} time(s), not once:\n${asked.join('\n')}`,
      ).toBe(1)
    } finally {
      app.page.off('request', countIt)
      writeFileSync(file, whole)
    }
  }, 240_000)
})

// ============================================================================ the doors

describe('the picture doors ignore the query', () => {
  it('appends the value, and every door answers image bytes with a query on the address', async () => {
    // THE PURE HALF. A value already in the address gets an ampersand, and a bare address gets a
    // question mark. The default value is the one taken when this module loaded.
    expect(askedAgain('/api/assets/a-picture', 'load-1')).toBe('/api/assets/a-picture?again=load-1')
    expect(askedAgain('/api/assets/a-picture?size=2', 'load-1')).toBe('/api/assets/a-picture?size=2&again=load-1')
    expect(askedAgain('/api/assets/a-picture')).toBe(`/api/assets/a-picture?again=${THIS_LOAD}`)

    // THE THREE DOORS A PARTICIPANT PICTURE COMES THROUGH, each asked with a query. They read only
    // their path, so the query changes nothing about the bytes.
    const assetId = defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })
    const doors = [
      `/api/assets/${assetId}?again=1`,
      '/api/portraits/role/worker/worker-1?again=1',
      '/api/avatars/drawn/chill-bee?again=1',
    ]
    for (const path of doors) {
      const got = await fetch(`${app.api}${path}`, { headers: AS_THE_OWNER })
      const body = await got.clone().text()
      expect(got.status, `${path} answered ${String(got.status)}: ${body.slice(0, 200)}`).toBe(200)
      expect(got.headers.get('content-type') ?? '', `${path} did not answer image bytes`).toContain('image')
    }
  }, 120_000)
})

// ============================================================================ the pictures

/**
 * THE PICTURES. Chapter 6 rule 1: the recovered profile picture, at 1440, 990, 660 and 390 in light
 * and dark.
 *
 * IT IS GATED, like every other photographing case, because taking pictures is not a check. Run it
 * with SF_AVATAR_RETRY_SHOTS set to the directory the pictures go in. The picture is proved to have
 * recovered before the shutter opens, so a photograph of the drawn fallback cannot pass for a look
 * at the recovered one.
 */
describe('the recovered picture is looked at', () => {
  it.skipIf(!process.env['SF_AVATAR_RETRY_SHOTS'])(
    'photographs the recovered profile picture at four widths in both themes',
    async () => {
      const shots = process.env['SF_AVATAR_RETRY_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })

      const file = await putAPictureOnJamie()
      const whole = cutTheFileShort(file)
      await openTheProfileAFresh()
      await waitForThePicture('drawn')
      writeFileSync(file, whole)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await waitForTheChosenPictureToDraw()

      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/recovered-profile-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
