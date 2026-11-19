// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DRAWN AVATAR SET IS WHOLE, AND THE GENERATING TOOL WILL NOT RUN WITHOUT A KEY.
 *
 * Criterion M30 of design/messages/ACCEPTANCE.md: *a set of drawn animal avatars (SVG, one style) is
 * offered on the participant page … when an OpenRouter key is present in `.env`, a tool generates
 * pictures with an image model on request and never runs without the key.*
 *
 * WHAT THIS MEASURES AND WHAT IT DOES NOT. It measures the files: the twelve animals are all there,
 * each is a small SVG with a viewBox, and each has a PNG beside it, because the avatar route takes
 * png, jpeg and webp and refuses SVG. It does not judge whether a drawing looks like the animal —
 * a person looked at all twelve at 32 and at 256 pixels on 4 September 2026, in both themes, and
 * that is not a thing a test can hold.
 *
 * THE SIZE LIMIT IS NOT DECORATION. These are hand-written flat shapes; an SVG here that has grown
 * past twelve kilobytes has stopped being one, and is most likely a traced or exported drawing with
 * a thousand path points, which is a different thing with different licence questions.
 */

import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { AVATARS_IN_THE_CHECKOUT } from '../src/shared/participants.ts'

/** The checkout this test is running in, found from this file and not from the working directory. */
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DRAWINGS = join(ROOT, AVATARS_IN_THE_CHECKOUT)

/** The twelve, by name. Adding a thirteenth means adding it here, which is the point of the list. */
const ANIMALS = [
  'mole',
  'mouse',
  'sheepdog',
  'owl',
  'fox',
  'badger',
  'hedgehog',
  'rabbit',
  'otter',
  'bear',
  'cat',
  'raven',
] as const

/** Past this an SVG is no longer a hand-written flat drawing. */
const BIGGEST_DRAWING = 12 * 1024

describe('the twelve drawn avatars are all there', () => {
  it.each(ANIMALS)('%s is an SVG with a viewBox, under twelve kilobytes', (animal) => {
    const file = join(DRAWINGS, `${animal}.svg`)
    expect(existsSync(file), `${file} is missing`).toBe(true)
    const size = statSync(file).size
    expect(size, `${animal}.svg is ${String(size)} bytes`).toBeLessThanOrEqual(BIGGEST_DRAWING)
    const drawing = readFileSync(file, 'utf8')
    expect(drawing, `${animal}.svg does not open with an svg element`).toMatch(/<svg[\s>]/)
    expect(drawing, `${animal}.svg does not close its svg element`).toContain('</svg>')
    expect(drawing, `${animal}.svg has no viewBox, so it cannot be drawn at another size`).toMatch(
      /viewBox="0 0 \d+ \d+"/,
    )
  })

  it.each(ANIMALS)('%s has a PNG beside it, because the avatar route refuses an SVG', (animal) => {
    const png = join(DRAWINGS, 'png', `${animal}.png`)
    expect(existsSync(png), `${png} is missing; run node tools/avatars-to-png.mjs`).toBe(true)
    const bytes = readFileSync(png)
    // The eight-byte PNG signature, read rather than trusted from the file name.
    expect([...bytes.subarray(0, 8)], `${animal}.png does not start with the PNG signature`).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ])
    // Width and height live at bytes 16 and 20 of every PNG, in the IHDR chunk.
    expect(bytes.readUInt32BE(16), `${animal}.png is not 512 wide`).toBe(512)
    expect(bytes.readUInt32BE(20), `${animal}.png is not 512 tall`).toBe(512)
  })
})

describe('the generating tool will not run without a key', () => {
  /**
   * Run it with the key set to an empty string rather than deleted, because `.env` is read by the
   * tool and would put the operator's key back: `process.loadEnvFile` does not overwrite a name the
   * environment already carries, and an empty name is carried. So this measures the refusal on a
   * machine that HAS a key, which is the machine that would otherwise never see it.
   */
  function askWithNoKey(): { code: number; said: string } {
    try {
      execFileSync('node', ['tools/avatars-from-openrouter.mjs', 'nothing-should-be-written', 'anything'], {
        cwd: ROOT,
        env: { ...process.env, OPENROUTER_API_KEY: '' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { code: 0, said: '' }
    } catch (thrown) {
      const failure = thrown as { status?: number; stderr?: string }
      return { code: failure.status ?? -1, said: failure.stderr ?? '' }
    }
  }

  it('exits 2, says the key is the reason, and writes nothing', () => {
    const ran = askWithNoKey()
    expect(ran.code, 'the tool did not refuse').toBe(2)
    expect(ran.said).toContain('OPENROUTER_API_KEY')
    expect(ran.said).toContain('nothing was written')
    expect(existsSync(join(DRAWINGS, 'generated', 'nothing-should-be-written.png'))).toBe(false)
  })
})
