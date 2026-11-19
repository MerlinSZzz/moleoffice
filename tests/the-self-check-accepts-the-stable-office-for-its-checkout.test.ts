// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SELF-CHECK ACCEPTS THE STABLE OFFICE FOR ITS DEVELOPMENT CHECKOUT (decision fPbGHEXq5OfR).
 *
 * The office runs from the stable checkout while the owner works in the development checkout, so an
 * office whose checkout differs is still this checkout's office when the office names this checkout as
 * the development checkout it serves AND the database and the port agree. The excuse covers the
 * checkout fact alone: a database or a port difference stays a wrong world, an unknown is never read
 * as equal or as different, and the excuse never hides one. When a difference was excused the answer
 * carries `servesFor` with the two folders; a wrong world carries none, even when the checkout was
 * excused and the database or the port then differed.
 *
 * Every world below is a literal and every header is made and read in this file: no server is started
 * and nothing is written.
 *
 * MUTATIONS, in src/config/the-self-check.mjs:
 *   - the excuse is dropped (a checkout difference is always a difference): the same-world case goes red;
 *   - any named development checkout is excused without comparing it with this checkout: the
 *     other-folder case and the stable-checkout-expected case go red;
 *   - the excused checkout is still listed among the differences or the unknowns: the same-world and
 *     cannot-tell cases go red;
 *   - a database or a port difference is excused along with the checkout: those cases go red;
 *   - `servesFor` is added to a wrong world: those cases go red.
 * MUTATIONS, in src/config/the-self-check-words.mjs:
 *   - the servesFor sentence is dropped, in English or in Chinese: the words case goes red;
 *   - theAnswerInWords writes the sentence when no difference was excused: the words case goes red.
 */

import { describe, expect, it } from 'vitest'
import { theAnswerInWords, whatAWorldHeaderShows, whatTheFactsShow, type Healthy } from '../src/config/the-self-check.mjs'
import { formatWorldHeader, type WorldOnTheWire } from '../src/config/world-header.mjs'

const THIS_CHECKOUT = '/srv/work/this-checkout'
const STABLE_CHECKOUT = '/srv/work/a-stable-checkout'
const ANOTHER_FOLDER = '/srv/work/a-different-folder'
const ADDRESS = 'http://127.0.0.1:8787'

const SERVES_FOR = { stableCheckout: STABLE_CHECKOUT, developmentCheckout: THIS_CHECKOUT }

const REPOSITORY_DIFFERS = { key: 'repository', what: 'the checkout', expected: THIS_CHECKOUT, answered: STABLE_CHECKOUT }

/** The world this checkout declares: its database, this checkout, its port; nothing else is compared. */
const EXPECTED: WorldOnTheWire = { database: '0123456789abcdef', repository: THIS_CHECKOUT, port: '8787', head: '', standing: '' }

/** The stable office answering: it runs from its own checkout and names this checkout as the one it serves. */
const THE_STABLE_OFFICE: WorldOnTheWire = {
  ...EXPECTED,
  repository: STABLE_CHECKOUT,
  head: 'abc1234',
  standing: 'canonical',
  developmentCheckout: THIS_CHECKOUT,
}

/** Read one answered world through a header, as the session hook reads a reply's own header. */
const shown = (answered: WorldOnTheWire, expected: WorldOnTheWire = EXPECTED) =>
  whatAWorldHeaderShows(formatWorldHeader(answered), ADDRESS, expected)

describe('the self-check accepts the stable office that names this checkout', () => {
  it('is the same world, with servesFor, when the office names this checkout and database and port agree', () => {
    expect(whatTheFactsShow(EXPECTED, THE_STABLE_OFFICE)).toEqual({ differences: [], unknowns: [], servesFor: SERVES_FOR })
    const found = shown(THE_STABLE_OFFICE)
    expect(found.answer).toBe('same-world')
    if (found.answer !== 'same-world') return
    expect(found.world).toEqual(THE_STABLE_OFFICE)
    expect(found.servesFor).toEqual(SERVES_FOR)
  })

  it('stays the wrong world when the office names another folder as its development checkout', () => {
    const answered = { ...THE_STABLE_OFFICE, developmentCheckout: ANOTHER_FOLDER }
    expect(whatTheFactsShow(EXPECTED, answered)).toEqual({ differences: [REPOSITORY_DIFFERS], unknowns: [] })
    const found = shown(answered)
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences).toEqual([REPOSITORY_DIFFERS])
    expect('servesFor' in found).toBe(false)
  })

  it('stays the wrong world when the office names no development checkout (as today)', () => {
    const without: WorldOnTheWire = { ...EXPECTED, repository: STABLE_CHECKOUT, head: 'abc1234', standing: 'canonical' }
    expect(whatTheFactsShow(EXPECTED, without)).toEqual({ differences: [REPOSITORY_DIFFERS], unknowns: [] })
    const found = shown(without)
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences).toEqual([REPOSITORY_DIFFERS])
  })

  it('stays the wrong world for an office that sends no dev= in its header (an old office names none)', () => {
    const oldHeader = `db=0123456789abcdef; repo=${STABLE_CHECKOUT}; port=8787; head=abc1234; standing=canonical`
    const found = whatAWorldHeaderShows(oldHeader, ADDRESS, EXPECTED)
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences).toEqual([REPOSITORY_DIFFERS])
    expect(found.world?.developmentCheckout).toBeUndefined()
    expect('servesFor' in found).toBe(false)
  })

  it('is still the wrong world, and carries no servesFor, when the database differs', () => {
    const found = shown({ ...THE_STABLE_OFFICE, database: 'ffffffffffffffff' })
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences).toEqual([{ key: 'database', what: 'the database', expected: '0123456789abcdef', answered: 'ffffffffffffffff' }])
    expect('servesFor' in found).toBe(false)
  })

  it('is still the wrong world, and carries no servesFor, when the port differs', () => {
    const found = shown({ ...THE_STABLE_OFFICE, port: '9911' })
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences).toEqual([{ key: 'port', what: 'the port', expected: '8787', answered: '9911' }])
    expect('servesFor' in found).toBe(false)
  })

  it('cannot tell, with servesFor, when the database is unknown on the office answering', () => {
    const found = shown({ ...THE_STABLE_OFFICE, database: 'unknown' })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([['database', 'the office answering']])
    expect(found.servesFor).toEqual(SERVES_FOR)
  })

  it('cannot tell, with servesFor, when the database is unknown on this checkout', () => {
    const expected: WorldOnTheWire = { ...EXPECTED, database: 'unknown' }
    const found = shown(THE_STABLE_OFFICE, expected)
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([['database', 'this checkout']])
    expect(found.servesFor).toEqual(SERVES_FOR)
  })

  it('is not excused when this checkout is itself a stable checkout and the office names a development checkout of its own', () => {
    // Looking from the stable checkout's own side: the office answering names a development checkout,
    // but it is not this checkout, so the checkout difference stays.
    const expected: WorldOnTheWire = { ...EXPECTED, repository: STABLE_CHECKOUT }
    const answered: WorldOnTheWire = { ...EXPECTED, repository: THIS_CHECKOUT, developmentCheckout: THIS_CHECKOUT }
    const facts = whatTheFactsShow(expected, answered)
    expect(facts.differences).toEqual([{ key: 'repository', what: 'the checkout', expected: STABLE_CHECKOUT, answered: THIS_CHECKOUT }])
    expect(facts.servesFor).toBeUndefined()
    const found = shown(answered, expected)
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences.map((one) => one.key)).toEqual(['repository'])
    expect('servesFor' in found).toBe(false)
  })
})

describe('the answer in words names the two folders when a difference was excused', () => {
  const ENGLISH_LINE = `It runs from the stable checkout ${STABLE_CHECKOUT}, for this development checkout.`
  const CHINESE_LINE = `它从稳定代码目录 ${STABLE_CHECKOUT} 运行，为这个开发代码目录服务。`

  it('adds the line in English and in Chinese when servesFor is present', () => {
    const healthy: Healthy = { answer: 'healthy', address: ADDRESS, world: THE_STABLE_OFFICE, holder: null, servesFor: SERVES_FOR }
    expect(theAnswerInWords(healthy)).toContain(ENGLISH_LINE)
    expect(theAnswerInWords(healthy, 'zh')).toContain(CHINESE_LINE)

    // The cannot-tell answer, read from a header whose database is unknown, carries the same line.
    const found = shown({ ...THE_STABLE_OFFICE, database: 'unknown' })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(theAnswerInWords(found)).toContain(ENGLISH_LINE)
    expect(theAnswerInWords(found, 'zh')).toContain(CHINESE_LINE)
  })

  it('adds no such line when no difference was excused', () => {
    const found = shown({ ...EXPECTED, database: 'unknown' })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(theAnswerInWords(found).join('\n')).not.toContain('stable checkout')
    expect(theAnswerInWords(found, 'zh').join('\n')).not.toContain('稳定代码目录')
  })
})
