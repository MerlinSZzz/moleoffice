// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN DOCKER MAPS A CONTAINER'S PATH ONCE, by the longest mount it lies in (problem grSlyQ6l89I4).
 *
 * The inspector's check runs with TMPDIR /check/tmp. Then the source of every mount lies under /check/tmp, and the
 * stand-ins, which mapped through every mount in turn, mapped the /work mount's source a second time through the
 * /check/tmp mount. This test runs the one mapping the four stand-ins share (tests/container-path-on-the-host.ts) on the
 * paths of such a check, so it needs no /check folder on the machine that runs it.
 *
 * The paths are made up and nothing is read or written. Mutation: put back the old mapping,
 * `pairs.reduce((v, [inside, outside]) => v.split(inside).join(outside), text)`, and three cases turn red: the mounts in
 * the view's own order, the longest destination, and whole path parts. The opposite order and no mounts stay green.
 */
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { FROM_THE_CONTAINER_TO_THE_HOST } from './container-path-on-the-host.ts'

const toTheHost = runInNewContext(FROM_THE_CONTAINER_TO_THE_HOST) as (text: string, pairs: [string, string][]) => string

/** A check view's three mounts when the test's own TMPDIR is /check/tmp, as it is inside the inspector's check. */
const VIEW = '/check/tmp/mole-office-view-synthetic/sandboxes/inspector/check-views/check-a'
const THE_VIEWS_MOUNTS: [string, string][] = [
  ['/work', `${VIEW}/work`],
  ['/check/home', `${VIEW}/home`],
  ['/check/tmp', `${VIEW}/tmp`],
]

describe('a stand-in maps a container path once', () => {
  it.each([
    ['in the order the view mounts them', THE_VIEWS_MOUNTS],
    ['in the opposite order', [...THE_VIEWS_MOUNTS].reverse()],
  ])('maps /work to its source and not again through /check/tmp, with the mounts %s', (_order, pairs) => {
    expect(toTheHost('/work', pairs)).toBe(`${VIEW}/work`)
    expect(toTheHost('/work/tests/a.test.ts', pairs)).toBe(`${VIEW}/work/tests/a.test.ts`)
    expect(toTheHost('/check/tmp/node-1', pairs)).toBe(`${VIEW}/tmp/node-1`)
    expect(toTheHost('cd /work && HOME=/check/home TMPDIR=/check/tmp node a.js', pairs))
      .toBe(`cd ${VIEW}/work && HOME=${VIEW}/home TMPDIR=${VIEW}/tmp node a.js`)
  })

  it('maps by the longest destination a path lies in, as Docker does', () => {
    const instance = '/check/tmp/mole-office-view-synthetic/sandboxes/inspector'
    const pairs: [string, string][] = [['/check/tmp', `${VIEW}/tmp`], [instance, instance]]
    expect(toTheHost(`${instance}/instance.json`, pairs)).toBe(`${instance}/instance.json`)
    expect(toTheHost('/check/tmp/other', pairs)).toBe(`${VIEW}/tmp/other`)
  })

  it('matches a destination only as whole path parts', () => {
    const pairs: [string, string][] = [['/work', '/synthetic-host/work']]
    expect(toTheHost('/workspace/a', pairs)).toBe('/workspace/a')
    expect(toTheHost('/srv/someone/work/a', pairs)).toBe('/srv/someone/work/a')
    expect(toTheHost('PATH=/work/bin:/usr/bin', pairs)).toBe('PATH=/synthetic-host/work/bin:/usr/bin')
    expect(toTheHost('file:///work/loader.mjs', pairs)).toBe('file:///synthetic-host/work/loader.mjs')
    expect(toTheHost('["/work"]', pairs)).toBe('["/synthetic-host/work"]')
  })

  it('leaves text with no mounts as it is', () => {
    expect(toTheHost('/work/a', [])).toBe('/work/a')
  })
})
