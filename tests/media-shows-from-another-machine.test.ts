// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Cache-root media stay inside this worktree; the outside-root reference is synthetic and never written. TMPDIR can be inside the allowed cache; all browser boundary assertions remain. */
/**
 * A PICTURE OR A VIDEO IN A RECORD SHOWS, FROM ANY MACHINE THAT CAN REACH THE API. CRITERION M54.
 *
 * On another machine the media were not shown: the page said refused, with a very long notice. It
 * must transfer on request: when the person presses to show media, a picture or a video is
 * transferred and shown.
 *
 * ---------------------------------------------------------------------------------------
 * THE CAUSE, MEASURED FIRST, AND IT IS NOT THE MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * The sentence the owner quoted is the alt text of `3-draw-it-already-drawn-light.png`, which places it
 * in report `ubALECmP9ub4` — THE DRAWINGS handback. On a copy of the owner's corpus that record holds twenty
 * pictures and every one of them is under `~/.cache/mole-office/handback-shots/`. Asked for one:
 *
 *   403 "…is outside every preview root, so Mole Office will not read it — even though
 *   "THE DRAWINGS — first handback…" (ubALECmP9ub4) points at it. … The preview roots are
 *   <the checkout> (MOLE_OFFICE_PREVIEW_ROOTS is unset, so this is the Mole Office
 *   checkout). …"
 *
 * That is the long sentence, and the alt text is drawn under it because the picture never arrived.
 * It refuses on the machine the API runs on exactly as it refuses on the owner's other computer — that computer is only where
 * the owner happened to be reading. Nothing about the request depends on the reader's machine: the route
 * declares `reach: 'remote'`, no image block in the corpus names a `machine`, and the page fetches
 * the bytes through `whereRequestsGo`, which is the API's own door.
 *
 * THE PICTURES ARE THERE BECAUSE THIS PROJECT PUT THEM THERE. An agent may not drop a screenshot
 * into the home folder. Since then every screenshot an agent makes goes under
 * ~/.cache/mole-office. So one of this project's rules moved the files and another refused to serve
 * them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * 1. A PICTURE UNDER ~/.cache/mole-office DRAWS. That is the file the owner could not see.
 * 2. THE SAME PICTURE DRAWS FROM A SECOND ADDRESS — the one other machines reach this computer at —
 *    with the bytes served by the API. `127.0.0.2` stands in for the owner's other computer: every Linux machine has the
 *    whole of 127.0.0.0/8, so the stack answers on two addresses and a browser treats them as two
 *    different origins, which is the whole of what a page on another machine is up against.
 * 3. A VIDEO DRAWS A PLAYER rather than a broken picture.
 * 4. A FILE OUTSIDE EVERY ROOT IS STILL REFUSED, and the refusal on the screen is ONE SHORT
 *    SENTENCE with the whole account behind it.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Every case waits for the block to reach a settled state and reads which state that is, so a
 * picture that never loaded and a picture that was refused can never be confused for each other.
 * Case 4 is the control for cases 1 to 3: the boundary still exists, so "the picture drew" is a
 * boundary that admits the right file rather than a boundary that was deleted.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'

let app: LiveApp

/** The second address this stack is also served on, standing in for the other machine. */
const OTHER_MACHINE = '127.0.0.2'

/** Where this product's agents put what they make, and the built-in preview root under test. */
const OURS = join(process.cwd(), '.logs')

let ourDirectory = ''
let outside = ''
let recordId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A real png: the eight-byte signature and a one-pixel image, so a browser can decode it. */
const A_PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Bytes under a video's name.
 *
 * THEY ARE NOT A PLAYABLE VIDEO AND THIS TEST DOES NOT CLAIM THEY ARE. What is measured is that the
 * page draws a player for what the API served as a video instead of an `<img>` that fails — the
 * failure this replaces drew the broken-picture frame, which reads as "the file is missing" for a
 * file that arrived whole. Whether a real clip decodes is the browser's business, not this rule's.
 */
const NOT_REALLY_A_VIDEO = Buffer.from('this file is served as video/mp4 and is not one', 'utf8')

/** What one image block on the page settled on: the phase, the tag, the sentence, the fold. */
interface Drawn {
  phase: string | null
  tag: string | null
  said: string | null
  detail: string | null
  /** The element that carries the media, when one was drawn: `IMG`, `VIDEO`, or null. */
  media: string | null
  /** Whether the src is a blob the page made from bytes it fetched, rather than a file path. */
  fromBytes: boolean
  /** Whether the src is the API's own file door, which a video's player now asks a stretch at a time. */
  fromTheDoor: boolean
  /** For a picture, whether the browser really decoded it. Zero on a broken image. */
  width: number
}

/**
 * The three blocks in the order the record declares them.
 *
 * BY POSITION RATHER THAN BY ID, because a block's element carries the path it was drawn from and
 * not its id. The count is asserted before anything is read, so a page that drew two of the three
 * fails here rather than quietly measuring the wrong one.
 */
const BLOCKS = ['ours', 'moving', 'outside'] as const

async function whatIsDrawn(site: string, blockId: (typeof BLOCKS)[number]): Promise<Drawn> {
  await app.page.goto(`${site}/#${recordPath(recordId)}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.sb-image', { timeout: 30_000 })
  const drawn = await app.page.$$eval('.sb-image', (all) => all.length)
  expect(drawn, 'the page did not draw all three blocks, so the one read below may be another').toBe(BLOCKS.length)
  const selector = `.sb-image:nth-of-type(${String(BLOCKS.indexOf(blockId) + 1)})`
  await app.page.waitForSelector(selector, { timeout: 30_000 })
  // SETTLED, WHICHEVER WAY IT WENT. `asking` is neither a picture nor a refusal, and reading the
  // block while it is still asking is what would make this test flap.
  await app.page.waitForFunction(
    (css: string) => {
      const one = document.querySelector(css)
      if (one === null) return false
      const stand = one.querySelector('.sb-image-stand')
      if (stand === null) return one.querySelector('img, video') !== null
      const phase = stand.getAttribute('data-preview')
      return phase !== 'asking' && phase !== 'not-asked'
    },
    selector,
    { timeout: 30_000 },
  )
  return app.page.$eval(selector, (one) => {
    const stand = one.querySelector('.sb-image-stand')
    const media = one.querySelector('img, video')
    const src = media?.getAttribute('src') ?? ''
    return {
      phase: stand?.getAttribute('data-preview') ?? null,
      tag: stand?.querySelector('.sb-image-tag')?.textContent ?? null,
      said: stand?.querySelector('p')?.textContent ?? null,
      detail: stand?.querySelector('.sb-image-more p')?.textContent ?? null,
      media: media === null ? null : media.tagName,
      fromBytes: src.startsWith('blob:'),
      fromTheDoor: src.includes('/api/file?path='),
      width: media instanceof HTMLImageElement ? media.naturalWidth : media === null ? 0 : 1,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({
    name: 'media-from-another-machine',
    viewport: { width: 1440, height: 1000 },
    addressForOtherMachines: OTHER_MACHINE,
  })
  // THE PAGE ON THE SECOND ADDRESS IS THE OWNER'S OTHER COMPUTER, WHICH THEY TRUST. Its requests carry the owner's name and no
  // key. Since item 1 of a decision, that counts as the owner only from a machine the office trusts while the window is
  // open. `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says how.
  await trustTheMachineThatCallsThroughTheOtherDoor(
    { api: app.api, keysFile: join(app.dir, 'keys.json') },
    `http://${OTHER_MACHINE}:${String(app.apiPort)}`,
  )

  // A DIRECTORY OF THIS TEST'S OWN UNDER THE ROOT BEING MEASURED, so what is measured is the root
  // and not a file somebody left there. It is removed in `afterAll`.
  mkdirSync(OURS, { recursive: true })
  ourDirectory = mkdtempSync(join(OURS, 'media-test-'))
  writeFileSync(join(ourDirectory, 'shot.png'), A_PICTURE)
  writeFileSync(join(ourDirectory, 'clip.mp4'), NOT_REALLY_A_VIDEO)

  // AND ONE OUTSIDE EVERY ROOT, which is what the boundary still has to refuse.
  // The lexical root refusal precedes any file open; this synthetic pathname is never created.
  outside = '/__mole_office_preview_fixture__/media-outside'

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'module',
      title: 'A handback with pictures in it',
      summary: 'Three blocks: a picture an agent made, a video, and a file outside every root.',
      data: {
        context: 'Stands in for a handback report, whose pictures are where agents put what they make.',
        parts: [],
        summaryBlocks: [
          {
            id: 'ours',
            type: 'image',
            path: join(ourDirectory, 'shot.png'),
            alt: 'A screenshot an agent made.',
          },
          {
            id: 'moving',
            type: 'image',
            path: join(ourDirectory, 'clip.mp4'),
            alt: 'A recording an agent made.',
          },
          {
            id: 'outside',
            type: 'image',
            path: join(outside, 'secret.png'),
            alt: 'A file nobody said Mole Office may read.',
          },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app.stop()
  if (ourDirectory !== '') rmSync(ourDirectory, { recursive: true, force: true })
})

describe('a picture an agent made shows', () => {
  it('draws it from the machine the API runs on, which it did not before', async () => {
    const drawn = await whatIsDrawn(app.site, 'ours')
    expect(drawn.phase, `the block settled on "${String(drawn.phase)}": ${String(drawn.said)}`).toBeNull()
    expect(drawn.media, 'no picture was drawn').toBe('IMG')
    expect(drawn.fromBytes, 'the picture is not the bytes Mole Office served').toBe(true)
    expect(drawn.width, 'the browser could not decode what it was given').toBeGreaterThan(0)
  }, 180_000)

  it('draws the same picture for a page opened on the address other machines reach', async () => {
    const remote = `http://${OTHER_MACHINE}:${String(app.webPort)}`
    const drawn = await whatIsDrawn(remote, 'ours')
    expect(drawn.phase, `the block settled on "${String(drawn.phase)}": ${String(drawn.said)}`).toBeNull()
    expect(drawn.media, 'no picture was drawn for the page on the second address').toBe('IMG')
    // THE BYTES CAME FROM THE API AND NOT FROM THE PAGE'S OWN ORIGIN. A blob url is bytes this page
    // fetched; anything else would be the browser asked to load a path, which is the failure the
    // avatar layer already met once.
    expect(drawn.fromBytes, 'the picture did not come through the API').toBe(true)
    expect(drawn.width, 'the browser could not decode what it was given').toBeGreaterThan(0)
  }, 180_000)

  it('draws a player for a file the API served as a video, not a broken picture', async () => {
    const drawn = await whatIsDrawn(app.site, 'moving')
    expect(drawn.phase, `the block settled on "${String(drawn.phase)}": ${String(drawn.said)}`).toBeNull()
    expect(drawn.media, 'a video was not drawn as a video').toBe('VIDEO')
    // A VIDEO IS PLAYED FROM THE DOOR ITSELF, A STRETCH AT A TIME, and not from a copy the page read
    // whole, as the owner's message of 24 September 2026 says. It still comes
    // through the API: the address is GET /api/file, which checks every stretch as it checks the whole
    // file.
    expect(drawn.fromTheDoor, 'the video is not played from the API door').toBe(true)
    expect(drawn.fromBytes, 'the video was read whole into the page again').toBe(false)
  }, 180_000)
})

describe('the boundary is still there, and its refusal is one sentence', () => {
  it('refuses a file outside every root, in one short sentence with the rest behind it', async () => {
    const drawn = await whatIsDrawn(app.site, 'outside')
    expect(drawn.phase, 'a file outside every preview root was served').toBe('refused')
    expect(drawn.media, 'a picture was drawn for a file that was refused').toBeNull()

    const said = drawn.said ?? ''
    expect(said, 'the refusal says nothing').not.toBe('')
    // ONE SENTENCE. A warning to a person needs only to be short, here as elsewhere.
    // The old one was 300 characters of confinement contract.
    expect(said.length, `the refusal on the screen is ${String(said.length)} characters: ${said}`).toBeLessThan(140)
    expect(said, 'the whole contract is still on the screen').not.toContain('MOLE_OFFICE_PREVIEW_ROOTS')

    // AND NOTHING IS LOST: the door's whole account is one press away.
    const detail = drawn.detail ?? ''
    expect(detail, 'the full account is not behind the short sentence').toContain('MOLE_OFFICE_PREVIEW_ROOTS')
    expect(detail.length, 'the fold holds nothing more than the sentence above it').toBeGreaterThan(said.length)
  }, 180_000)
})
