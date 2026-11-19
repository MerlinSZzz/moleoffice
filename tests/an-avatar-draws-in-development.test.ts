// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PICTURE OF A PERSON OR AN AGENT REALLY DRAWS UNDER `npm run dev`, AND THE WORDS UNDER IT
 * ONLY NAME A REASON THAT HAPPENED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 4 September 2026 every avatar in `npm run dev` was a broken image. The server hands back
 * `/api/assets/<id>`, a path with no host, and a browser resolves a bare path against the page's own
 * origin. In development that origin is Vite, and Vite answers the app's own HTML with status 200.
 * So there was no console error, no 4xx and nothing in any test, and every picture had
 * `naturalWidth` 0. The alternative text then said the picture had been *drawn by Mole Office because
 * the chosen picture could not be loaded*, which was false twice over: the drawn one is the same
 * address, and it could not be loaded either. Problem `YY3ryy7FEpK2`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A REAL BROWSER AND NOT A RENDER TO A STRING
 * ---------------------------------------------------------------------------------------
 *
 * The defect is invisible to everything but a browser fetching the bytes. The markup was correct in
 * the sense that it always had been; the address in it resolved to the wrong server, and only a
 * browser resolves an address. `tests/the-picture-beside-a-name.test.ts` renders this component to a
 * string and passed throughout. So this test opens a real page on a real dev stack and reads
 * `naturalWidth` off the elements, which is zero for an image the browser could not decode.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { avatarUrlFor, defaultAvatarAssetId } from '../src/shared/participants.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
/** The registry id the office gave Builder X. Its default drawing is kept under this id, not its handle. */
let builderId: string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What one picture on the page turned out to be. */
interface PictureOnThePage {
  src: string
  naturalWidth: number
  alt: string
  which: string | null
}

beforeAll(async () => {
  app = await liveApp({ name: 'avatar-in-dev', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents?: { id: string; handle: string }[]
  }
  const builder = listed.agents?.find((one) => one.handle === 'builder-x')
  expect(builder, 'builder-x is not in the registry').toBeDefined()
  builderId = builder!.id
}, 300_000)

afterAll(async () => {
  await app.stop()
})

/**
 * Open the chat panel and hand back every picture in it, once the browser has finished with each.
 *
 * WAITING FOR `complete` IS NOT THE SAME AS WAITING FOR SUCCESS. A broken image is `complete` too;
 * it is `naturalWidth` that separates the two, and that is what the assertions read.
 */
async function thePicturesInTheChatPanel(): Promise<PictureOnThePage[]> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 60_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
  // EACH PICTURE IS BROUGHT ON SCREEN FIRST, as a reader scrolling the panel would. Since round 18 of
  // wave 13w a picture is asked for only when its row comes near the screen,
  // so one below the panel's fold is not fetched until then, and would never be `complete`.
  for (const picture of await app.page.$$('img.avatar')) await picture.scrollIntoViewIfNeeded({ timeout: 10_000 })
  await app.page.waitForFunction(
    () => Array.from(document.querySelectorAll('img.avatar')).every((one) => (one as HTMLImageElement).complete),
    undefined,
    { timeout: 30_000 },
  )
  return app.page.$$eval('img.avatar', (all) =>
    all.map((one) => {
      const picture = one as HTMLImageElement
      return {
        src: picture.src,
        naturalWidth: picture.naturalWidth,
        alt: picture.alt,
        which: picture.getAttribute('data-picture'),
      }
    }),
  )
}

describe('a picture is asked for on the API door, so it draws under npm run dev', () => {
  it('is the reason a bare path cannot work: the web port answers the app HTML for it', async () => {
    // THIS IS THE MEASUREMENT THE REST OF THE FILE RESTS ON. It is asserted rather than described,
    // because if Vite ever stopped answering 200 for an unknown path the tests below would still
    // pass and would no longer be measuring anything.
    const path = avatarUrlFor(defaultAvatarAssetId({ kind: 'agent', id: builderId }))
    const fromTheWebPort = await fetch(`${app.site}${path}`)
    expect(fromTheWebPort.status).toBe(200)
    expect(fromTheWebPort.headers.get('content-type') ?? '').toContain('text/html')

    const fromTheApi = await fetch(`${app.api}${path}`, { headers: AS_THE_OWNER })
    expect(fromTheApi.status).toBe(200)
    expect(fromTheApi.headers.get('content-type') ?? '').toContain('image')
  }, 120_000)

  it('draws every avatar in the panel, with real pixels behind it', async () => {
    const pictures = await thePicturesInTheChatPanel()
    expect(pictures.length, 'the chat panel drew no picture at all, so nothing was measured').toBeGreaterThan(0)
    for (const picture of pictures) {
      expect(
        picture.naturalWidth,
        `the browser could not decode ${picture.src}, so this avatar is a broken image`,
      ).toBeGreaterThan(0)
    }
  }, 180_000)

  it('sends each one to the API door and never to the page own origin', async () => {
    const pictures = await thePicturesInTheChatPanel()
    for (const picture of pictures) {
      // THE API AND NOT ONE PATH ON IT. This used to name /api/assets/, which was every picture's
      // address until criterion M53: somebody nobody has chosen a picture for is now sent to the
      // picture they are given, at /api/avatars/drawn/chill-bee, and that is still the API door.
      // What this case is about is the origin — problem `YY3ryy7FEpK2` was every avatar being asked
      // of Vite, which answers the app's own HTML with a 200 and no error anywhere.
      expect(picture.src, `${picture.src} was not sent to the API`).toContain(`${app.api}/api/`)
      expect(picture.src.startsWith(`${app.site}/`), `${picture.src} was sent to Vite`).toBe(false)
    }
  }, 180_000)

  it('says nothing about a fallback that did not happen', async () => {
    const pictures = await thePicturesInTheChatPanel()
    for (const picture of pictures) {
      // The picture drew, so the only true label is the name. A label naming a reason here would be
      // a sentence about a swap the browser never made.
      expect(picture.which, `${picture.src} claims a state other than the picture the server chose`).toBe('chosen')
      expect(
        picture.alt,
        `the words under ${picture.src} name a reason, and no picture failed`,
      ).not.toContain('could not be loaded')
      expect(picture.alt.length, 'the picture has no label at all').toBeGreaterThan(0)
    }
  }, 180_000)
})
