// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW COMPARES THE VERSION OF THE SERVICE THAT ANSWERS WITH ITS OWN (src/desktop/the-services-version.mjs).
 *
 * A service keeps running when Mole Office is replaced by a newer copy, so a newer window can find an older service
 * answering for its office. Nothing on the wire said which version a service runs. Now GET /api/health says it, the
 * self-check carries it onto its answer, and the window compares it with its own version. These cases prove each of
 * those steps without a window. tests/the-window-says-its-service-is-older.test.ts proves what the window then does.
 *   1. `compareVersions` orders two versions as section 11 of SemVer 2.0.0 does, and gives null when either is not a
 *      version at all.
 *   2. `howTheServicesVersionCompares` reads one self-check answer in each case, made the way
 *      whatAnswersForThisOffice makes it. Only a healthy answer with no `version` field is older without a version:
 *      its service is from before services said their version. A healthy answer whose version is present but is not
 *      a string is not compared. A version that is null, a window version that is null, an answer that is neither
 *      healthy nor unhealthy, and an answer that carries `servesFor` or `updateWaiting` are not compared, each with
 *      its own reason.
 *   3. GET /api/health says the version the server runs, which is theVersion().
 *   4. whoIsAt hands the health check's version back as the body sent it, a string, null, or any other value the
 *      body sent, and leaves it out only when the body had none or could not be read. whatAnswersForThisOffice carries
 *      it onto a healthy answer, and carries none when the body had none.
 *
 * The module is new, so every case of 1 and 2 imports it when it runs.
 *
 * MUTATIONS, proved after a control run on the commit whose message is "the window says when its service is older:
 * the code", and the two unreadable-version mutations on the commit whose message is "a version the window cannot
 * read is not compared: the code":
 *   - `no-field-is-not-compared`, a healthy answer with no version field not compared: a case of 2 red;
 *   - `null-is-older`, a version of null read as older: a case of 2 red;
 *   - `pre-release-as-text`, pre-release identifiers compared as text, so beta.10 comes before beta.9: case 1 red;
 *   - `serves-for-compared`, an answer that carries `servesFor` compared: a case of 2 red;
 *   - `health-drops-the-version`, src/config/world-address.mjs leaves the version out of an ok health check: case 4 red;
 *   - `no-version-on-health`, src/server/index.ts says no version on GET /api/health: case 3 red;
 *   - `unreadable-version-dropped`, src/config/world-address.mjs drops a version that is present but not a string or
 *     null: the new self-check case red;
 *   - `unreadable-is-older`, src/desktop/the-services-version.mjs reads a value that is not a string as an older
 *     service: the new case of 2 red, and the new self-check case red.
 */

import { describe, expect, it } from 'vitest'
import { theVersion } from '../src/config/settings.mjs'
import { whatAnswersForThisOffice } from '../src/config/the-self-check.mjs'
import { whoIsAt } from '../src/config/world-address.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { apiApp, buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'

buildTheFirstOfficeInAHook()

/** The world every answer here names: made up, and the same on both sides, so nothing differs and nothing is unknown. */
const WORLD = { database: '0a1b2c3d4e5f6071', repository: '/an/install/of/mole-office', port: '4321', head: 'abc1234', standing: 'canonical' }
const ADDRESS = 'http://127.0.0.1:4321'
/** The version of the window in case 2. */
const THE_WINDOWS = '0.1.0-beta.7'

describe('compareVersions', () => {
  it('orders versions as SemVer 2.0.0 does, and gives null for anything that is not a version', async () => {
    const { compareVersions } = await import('../src/desktop/the-services-version.mjs')
    // Each list is in order, lowest first: every pair is compared both ways.
    const inOrder = [
      ['0.1.0-beta.6', '0.1.0-beta.7'],
      ['0.1.0-beta.9', '0.1.0-beta.10'],
      ['0.1.0-beta.7', '0.1.0'],
      ['0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-beta'],
      ['0.1.0', '0.1.1', '0.2.0', '1.0.0'],
    ]
    for (const list of inOrder) {
      for (const [i, lower] of list.entries()) {
        for (const higher of list.slice(i + 1)) {
          expect(compareVersions(lower, higher), `${lower} against ${higher}`).toBe(-1)
          expect(compareVersions(higher, lower), `${higher} against ${lower}`).toBe(1)
        }
      }
    }
    for (const one of ['0.1.0-beta.6', '0.1.0', '1.0.0']) expect(compareVersions(one, one), one).toBe(0)
    // Build metadata is left out of the order.
    expect(compareVersions('1.0.0+abc', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.0+abc')).toBe(0)
    for (const notAVersion of ['', '1.2', 'abc', 'v1.0.0']) {
      expect(compareVersions(notAVersion, '1.0.0'), JSON.stringify(notAVersion)).toBeNull()
      expect(compareVersions('1.0.0', notAVersion), JSON.stringify(notAVersion)).toBeNull()
    }
  })
})

describe('howTheServicesVersionCompares', () => {
  const healthy = { answer: 'healthy' as const, address: ADDRESS, world: WORLD, holder: null }
  const unhealthy = { answer: 'unhealthy' as const, address: ADDRESS, world: WORLD, reasons: ['its database cannot be read'], holder: null }
  const older = '0.1.0-beta.6'
  const servesFor = { stableCheckout: '/a/stable/checkout', developmentCheckout: WORLD.repository }
  const notAnswering = { answer: 'not-answering' as const, address: ADDRESS, failure: 'refused' as const, why: 'nothing listens' }
  /** Expect an answer that is not compared, with a reason, and give the reason. */
  const notCompared = (what: string, said: unknown): string => {
    expect(said, what).toEqual({ is: 'not compared', why: expect.any(String) })
    const why = (said as { why: string }).why
    expect(why.trim(), what).not.toBe('')
    return why
  }

  it('reads a healthy answer with no version field as a service older than the window, from before services said their version', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    expect(howTheServicesVersionCompares(healthy, THE_WINDOWS)).toEqual({ is: 'older', service: null, window: THE_WINDOWS })
  })

  it('does not compare a healthy answer whose version is null', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('a healthy answer whose version is null', howTheServicesVersionCompares({ ...healthy, version: null }, THE_WINDOWS))
  })

  it('does not compare a healthy answer whose version is present but is not a string', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('a healthy answer whose version is a number', howTheServicesVersionCompares({ ...healthy, version: 123 }, THE_WINDOWS))
  })

  it('does not compare an unhealthy answer with no version field', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('an unhealthy answer with no version field', howTheServicesVersionCompares(unhealthy, THE_WINDOWS))
  })

  it('names the older version of an unhealthy answer', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    expect(howTheServicesVersionCompares({ ...unhealthy, version: older }, THE_WINDOWS)).toEqual({ is: 'older', service: older, window: THE_WINDOWS })
  })

  it('names the older version of a healthy answer, and says when the service is the same or newer', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    expect(howTheServicesVersionCompares({ ...healthy, version: older }, THE_WINDOWS)).toEqual({ is: 'older', service: older, window: THE_WINDOWS })
    expect(howTheServicesVersionCompares({ ...healthy, version: THE_WINDOWS }, THE_WINDOWS)).toEqual({ is: 'same' })
    expect(howTheServicesVersionCompares({ ...healthy, version: '0.1.0' }, THE_WINDOWS)).toEqual({ is: 'newer', service: '0.1.0', window: THE_WINDOWS })
  })

  it('does not compare an answer that carries servesFor', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('an answer that carries servesFor', howTheServicesVersionCompares({ ...healthy, version: older, servesFor }, THE_WINDOWS))
  })

  it('does not compare an answer that carries updateWaiting', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('an answer that carries updateWaiting', howTheServicesVersionCompares({ ...unhealthy, version: older, updateWaiting: true as const }, THE_WINDOWS))
  })

  it('does not compare when the window has no version', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('a window whose version is null', howTheServicesVersionCompares({ ...healthy, version: older }, null))
  })

  it('does not compare an answer that is neither healthy nor unhealthy, or a version that is not a version', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    notCompared('an office that does not answer', howTheServicesVersionCompares(notAnswering, THE_WINDOWS))
    for (const answer of [
      { answer: 'wrong-world' as const, address: ADDRESS, world: null, differences: [], notSaid: 'it said no world' },
      { answer: 'cannot-tell' as const, address: ADDRESS, world: WORLD, unknowns: [] },
    ]) {
      expect(howTheServicesVersionCompares(answer, THE_WINDOWS), answer.answer).toEqual({ is: 'not compared', why: expect.any(String) })
    }
    for (const [service, window] of [['abc', THE_WINDOWS], [older, '1.2'], [older, '']] as const) {
      expect(howTheServicesVersionCompares({ ...healthy, version: service }, window), `${service} against ${window}`).toEqual({ is: 'not compared', why: expect.any(String) })
    }
  })

  it('says a reason of its own for each answer it does not compare', async () => {
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    const whys = [
      notCompared('a healthy answer whose version is null', howTheServicesVersionCompares({ ...healthy, version: null }, THE_WINDOWS)),
      notCompared('an unhealthy answer with no version field', howTheServicesVersionCompares(unhealthy, THE_WINDOWS)),
      notCompared('an answer that carries servesFor', howTheServicesVersionCompares({ ...healthy, version: older, servesFor }, THE_WINDOWS)),
      notCompared('an answer that carries updateWaiting', howTheServicesVersionCompares({ ...unhealthy, version: older, updateWaiting: true as const }, THE_WINDOWS)),
      notCompared('a window whose version is null', howTheServicesVersionCompares({ ...healthy, version: older }, null)),
      notCompared('an office that does not answer', howTheServicesVersionCompares(notAnswering, THE_WINDOWS)),
    ]
    expect(new Set(whys).size, JSON.stringify(whys)).toBe(whys.length)
  })
})

describe('the health check says its version', () => {
  it('answers GET /api/health with the version this server runs', async () => {
    const t = await freshDb()
    try {
      const { app } = await apiApp()
      try {
        const reply = await app.inject({ method: 'GET', url: '/api/health' })
        const body = reply.json<Record<string, unknown>>()
        expect(Object.keys(body), reply.body).toContain('version')
        expect(body['version']).toBe(theVersion())
      } finally {
        await app.close()
      }
    } finally {
      t.close()
    }
  })
})

describe('the self-check reads the version the health check said', () => {
  /** A fetch that answers every ask with this body, carrying the world, as an office does. */
  const answering =
    (body: string): typeof fetch =>
    () =>
      Promise.resolve(new Response(body, { status: 200, headers: { [WORLD_HEADER]: formatWorldHeader(WORLD), 'content-type': 'application/json' } }))
  const asked = (body: string) => whoIsAt(ADDRESS, { withHealth: true, fetchImpl: answering(body), asks: 1 })

  it('hands back the version as the body said it, and none when the body had none or could not be read', async () => {
    const named = await asked(JSON.stringify({ ok: true, version: '0.1.0-beta.6' }))
    expect(named.answering && named.health).toMatchObject({ ok: true, version: '0.1.0-beta.6' })
    const none = await asked(JSON.stringify({ ok: true, version: null }))
    expect(none.answering && none.health).toMatchObject({ ok: true, version: null })
    const absent = await asked(JSON.stringify({ ok: true }))
    expect(absent.answering && absent.health && Object.keys(absent.health)).not.toContain('version')
    const unread = await asked('this is not JSON')
    expect(unread.answering && unread.health).toMatchObject({ ok: false })
    expect(unread.answering && unread.health && Object.keys(unread.health)).not.toContain('version')

    const found = await whatAnswersForThisOffice({ address: ADDRESS, expected: WORLD, fetchImpl: answering(JSON.stringify({ ok: true, version: '0.1.0-beta.6' })), asks: 1 })
    expect(found).toMatchObject({ answer: 'healthy', version: '0.1.0-beta.6' })
    const foundWithout = await whatAnswersForThisOffice({ address: ADDRESS, expected: WORLD, fetchImpl: answering(JSON.stringify({ ok: true })), asks: 1 })
    expect(foundWithout.answer).toBe('healthy')
    expect(Object.keys(foundWithout)).not.toContain('version')

    const unreadable = await asked(JSON.stringify({ ok: true, version: 123 }))
    expect(unreadable.answering && unreadable.health).toMatchObject({ ok: true, version: 123 })
    const foundUnreadable = await whatAnswersForThisOffice({ address: ADDRESS, expected: WORLD, fetchImpl: answering(JSON.stringify({ ok: true, version: 123 })), asks: 1 })
    expect(foundUnreadable).toMatchObject({ answer: 'healthy', version: 123 })
    const { howTheServicesVersionCompares } = await import('../src/desktop/the-services-version.mjs')
    expect(howTheServicesVersionCompares(foundUnreadable, THE_WINDOWS)).toEqual({ is: 'not compared', why: expect.any(String) })
  })
})
