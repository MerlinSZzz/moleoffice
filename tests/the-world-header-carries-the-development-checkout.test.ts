// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORLD HEADER CARRIES THE DEVELOPMENT CHECKOUT WHEN A STABLE OFFICE NAMES ONE (decision fPbGHEXq5OfR).
 *
 * The wire key is `dev`, an optional sixth key outside WORLD_FIELDS. A header without it still parses,
 * because an office from before the field sends none; a reader that does not know it ignores it,
 * because parseWorldHeader already ignores keys it was not told about. The value travels under the
 * same encoding as the five facts, so a folder whose path holds `;` or `%` survives.
 *
 * MUTATIONS, in src/config/world-header.mjs:
 *   - formatWorldHeader stops writing `dev=`: the round-trip case goes red;
 *   - parseWorldHeader demands `dev=` as one of the required keys: the old-header case goes red;
 *   - `developmentCheckout` joins the five compared facts: the last case goes red.
 */

import { describe, expect, it } from 'vitest'
import { WORLD_FIELDS, formatWorldHeader, parseWorldHeader, worldInWords, worldsDiffer, type WorldOnTheWire } from '../src/config/world-header.mjs'

const A_WORLD: WorldOnTheWire = {
  database: '0123456789abcdef',
  repository: '/srv/work/a-stable-checkout',
  port: '8787',
  head: 'abc1234',
  standing: 'canonical',
}

const THIS_CHECKOUT = '/srv/work/this-checkout'

describe('the world header carries the development checkout when there is one', () => {
  it('writes dev= for a world that names one, and reads it back equal', () => {
    const world: WorldOnTheWire = { ...A_WORLD, developmentCheckout: THIS_CHECKOUT }
    const text = formatWorldHeader(world)
    expect(text).toContain(`dev=${THIS_CHECKOUT}`)
    const parsed = parseWorldHeader(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world).toEqual(world)
  })

  it('writes no dev= for a world that names none, and reads back no field', () => {
    const text = formatWorldHeader(A_WORLD)
    expect(text).not.toContain('dev=')
    const parsed = parseWorldHeader(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world).toEqual(A_WORLD)
    expect(parsed.world.developmentCheckout).toBeUndefined()
  })

  it('still parses a header from an office that sends no dev= (an old office)', () => {
    const oldHeader = 'db=0123456789abcdef; repo=/srv/work/a-stable-checkout; port=8787; head=abc1234; standing=canonical'
    const parsed = parseWorldHeader(oldHeader)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world).toEqual(A_WORLD)
  })

  it('parses a header that carries dev= beside a key it does not know', () => {
    const text = `${formatWorldHeader({ ...A_WORLD, developmentCheckout: THIS_CHECKOUT })}; later=whatever`
    const parsed = parseWorldHeader(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world.developmentCheckout).toBe(THIS_CHECKOUT)
  })

  it('round-trips a dev value holding a semicolon and a percent sign', () => {
    const developmentCheckout = '/srv/work/a%b;c'
    const parsed = parseWorldHeader(formatWorldHeader({ ...A_WORLD, developmentCheckout }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world.developmentCheckout).toBe(developmentCheckout)
  })

  it('writes no dev= for an empty development checkout', () => {
    expect(formatWorldHeader({ ...A_WORLD, developmentCheckout: '' })).not.toContain('dev=')
  })

  it('is not one of the five facts the header compares: the five keys stay as they are', () => {
    expect(WORLD_FIELDS.map((field) => field.key)).toEqual(['database', 'repository', 'port', 'head', 'standing'])
    // A reader that knows only the five facts sees no difference and no new words.
    const one: WorldOnTheWire = { ...A_WORLD, developmentCheckout: '/srv/work/one' }
    const other: WorldOnTheWire = { ...A_WORLD, developmentCheckout: '/srv/work/two' }
    expect(worldsDiffer(one, other)).toEqual([])
    expect(worldInWords(one)).toBe(worldInWords(A_WORLD))
  })
})
