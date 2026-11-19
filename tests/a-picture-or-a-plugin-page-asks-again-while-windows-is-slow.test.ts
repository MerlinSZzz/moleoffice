// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE'S BYTES AND A PLUGIN PAGE'S FILE ARE ASKED AGAIN WHILE WINDOWS IS SLOW TO SAY WHO SENT THEM. Wave 13t,
 * round W42.
 *
 * Inside the installed Windows app the office asks Windows which program sent a request, and waits only so long. When
 * the answer comes late, the office refuses the request with the code `senderNotReadInTime`
 * (src/server/lib/from-a-sandbox.ts), before a door does anything. Round W40 made the page's transport ask such a
 * request again (tests/a-press-asks-again-while-windows-is-slow.test.ts). Two plain fetches in src/web/api.ts go to the
 * same office and were not asked again: the bytes of an offered picture, read when a person picks one
 * (avatarOnOfferBytes), and a plugin page's file, read before its frame is drawn (pluginPageFile). The first then said
 * that the picture could not be fetched, and the second said the refusal's sentence, though sending the same request
 * again was all the refusal asked for. Both now ask again as the transport does, and say what they said before only
 * when the last ask is refused too.
 *
 *   R1 a picture refused once is read from the second answer, and was asked twice;
 *   R2 a picture refused every time is asked four times in all, and says what the same read says when the picture
 *      is not there, which is not the refusal's sentence;
 *   R3 a plugin page's file refused once loads, and was asked twice;
 *   R4 a plugin page's file refused every time is asked four times in all, and says the refusal's sentence;
 *   R5 any other refusal is asked once, for a picture and for a plugin page's file.
 *
 * THE REFUSAL IS THIS TEST'S, NOT THE OFFICE'S. This file loads src/web/api.ts in Node and puts a stand-in in place of
 * `fetch`, which answers in the shape the server sends. The round's other cases answer in a browser with `page.route`
 * instead. That was not done here, because a plugin page's file needs a plugin that is built and switched on, and
 * neither read looks at the reply's headers. tests/the-windows-window-is-the-person.test.ts T5 holds that the server
 * sends this code. NOTHING HERE RAN ON WINDOWS.
 *
 * Each wait before asking again is 2 seconds, so R2 and R4 take about 6 seconds each.
 *
 * MUTATIONS, after a control run: the two reads do not ask a refused request again (red: R1 to R4 were asked once);
 * they ask again whatever the refusal's code (red: R5 was asked again); a picture refused every time says another
 * sentence than a picture that is not there (red: R2).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Api = typeof import('../src/web/api.ts')
let theApi: Api['api']
let ASKED_AGAIN_AT_MOST: number

/**
 * The server's refusal of a request whose sender was not read in time, in the shape src/server/lib/from-a-sandbox.ts
 * sends it: its sentence from the word list and its wait from the server's own constant, so neither is written here.
 * It is made in `beforeAll`, once the constant has been read.
 */
let THE_CODED_REFUSAL: { error: string; code: 'senderNotReadInTime'; values: { seconds: number } }

/** A made-up picture's bytes: the first four of a PNG file. */
const THE_PICTURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const refused = (): Response =>
  new Response(JSON.stringify(THE_CODED_REFUSAL), { status: 503, headers: { 'content-type': 'application/json' } })
const notThere = (): Response =>
  new Response(JSON.stringify({ error: 'Nothing is kept at this made-up address.' }), { status: 404, headers: { 'content-type': 'application/json' } })
const thePicture = (): Response => new Response(THE_PICTURE, { status: 200, headers: { 'content-type': 'image/png' } })
const thePage = (): Response => new Response('<!doctype html><title>A made-up plugin page</title>', { status: 200, headers: { 'content-type': 'text/html' } })

/** The addresses the stand-in was asked for, in order, since the last `answerWith`. */
let asked: string[] = []
/** The answers the stand-in gives, in order; the last one is given again for every ask after it. */
let answers: (() => Response)[] = []

function answerWith(...replies: (() => Response)[]): void {
  asked = []
  answers = replies
}

const theRealFetch = globalThis.fetch
let t: TestDb

beforeAll(async () => {
  // THE SERVER'S OWN WAIT. Loading src/server/lib/from-a-sandbox.ts opens a database, so it is loaded only after
  // freshDb() has made a throwaway one. This file uses that database for nothing else.
  t = await freshDb()
  const { THE_LONGEST_A_READING_WAITS } = await import('../src/server/lib/from-a-sandbox.ts')
  const theWait = { seconds: THE_LONGEST_A_READING_WAITS / 1000 }
  THE_CODED_REFUSAL = { error: createI18n('en').t('server.senderNotReadInTime', theWait), code: 'senderNotReadInTime', values: theWait }
  // src/web/api.ts reads window.localStorage at module scope; this is the smallest stand-in that lets it load.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  }
  globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
    asked.push(String(input))
    const answer = answers[Math.min(asked.length, answers.length) - 1]
    if (answer === undefined) throw new Error('The stand-in for fetch was given no answer.')
    return Promise.resolve(answer())
  }
  const loaded = await import('../src/web/api.ts')
  theApi = loaded.api
  ASKED_AGAIN_AT_MOST = loaded.ASKED_AGAIN_AT_MOST
})

afterAll(() => {
  globalThis.fetch = theRealFetch
  t.close()
})

const THE_PICTURES_ADDRESS = '/api/avatars/made-up-set/made-up-picture.png'

/** What reading the made-up picture said when it failed, or null when it did not fail. */
const whatThePictureReadSays = (): Promise<string | null> =>
  theApi.avatarOnOfferBytes(THE_PICTURES_ADDRESS, 'made-up').then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

describe('a picture and a plugin page, when Windows did not say in time who sent them', () => {
  it('R1: a picture refused once is read from the second answer, and was asked twice', async () => {
    answerWith(refused, thePicture)
    const bytes = await theApi.avatarOnOfferBytes(THE_PICTURES_ADDRESS, 'made-up')
    expect(bytes).toBe(Buffer.from(THE_PICTURE).toString('base64'))
    expect(asked, 'the picture was not asked again exactly once').toHaveLength(2)
    expect(new Set(asked).size, 'the picture was asked again at another address').toBe(1)
  }, 30_000)

  it('R2: a picture refused every time is asked four times in all, and says what any other failed read says', async () => {
    // THE SENTENCE IS THE CODE'S OWN, read from the same read's answer to a picture that is not there, so that no
    // word of it is written here.
    answerWith(notThere)
    const saidWhenNotThere = await whatThePictureReadSays()
    expect(saidWhenNotThere, 'a picture that is not there was read').not.toBeNull()
    answerWith(refused)
    const said = await whatThePictureReadSays()
    expect(said, 'a picture refused every time was read').not.toBeNull()
    expect(said, "the picture said the refusal's sentence").not.toBe(THE_CODED_REFUSAL.error)
    expect(said).toBe(saidWhenNotThere)
    expect(asked).toHaveLength(1 + ASKED_AGAIN_AT_MOST)
  }, 30_000)

  it("R3: a plugin page's file refused once loads, and was asked twice", async () => {
    answerWith(refused, thePage)
    expect(await theApi.pluginPageFile('made-up-plugin', 'made-up-page')).toEqual({ loads: true })
    expect(asked, "the plugin page's file was not asked again exactly once").toHaveLength(2)
    expect(new Set(asked).size, "the plugin page's file was asked again at another address").toBe(1)
  }, 30_000)

  it("R4: a plugin page's file refused every time is asked four times in all, and says the refusal's sentence", async () => {
    answerWith(refused)
    expect(await theApi.pluginPageFile('made-up-plugin', 'made-up-page')).toEqual({
      loads: false,
      said: createI18n('en').t('server.senderNotReadInTime', THE_CODED_REFUSAL.values),
    })
    expect(asked).toHaveLength(1 + ASKED_AGAIN_AT_MOST)
  }, 30_000)

  it("R5: any other refusal is asked once, for a picture and for a plugin page's file", async () => {
    answerWith(notThere, thePicture)
    expect(await whatThePictureReadSays(), 'a picture that is not there was read').not.toBeNull()
    expect(asked, 'a picture that is not there was asked again').toHaveLength(1)
    answerWith(notThere, thePage)
    expect(await theApi.pluginPageFile('made-up-plugin', 'made-up-page')).toEqual({ loads: false, said: 'Nothing is kept at this made-up address.' })
    expect(asked, "a plugin page's file that is not there was asked again").toHaveLength(1)
  }, 30_000)
})
