// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PROBLEM 6Kp5LosUARas: `--vite-cache <folder>` says where a world's browser app keeps its pre-bundled dependencies.
 *
 * Without the option, each world keeps them in its own folder, which `stop` deletes, so every world bundles them again
 * from nothing. tests/a-world-says-what-it-is-for.test.ts set MOLE_OFFICE_VITE_CACHE so that its two worlds would share
 * one cache. The tool replaced that value with the world's own folder, so the second world bundled again, and under load
 * it ran out of its 90 s wait. These cases read what the tool sends a world and how it reads the option, without starting
 * a server. The world test shows a second world that does not bundle again.
 *
 * MUTATIONS, each run alone after a green control and restored after (5 November 2026):
 *   - environmentForTheWorld ignores viteCache: the first case is red;
 *   - readArguments takes the folder as written, without resolving it: the relative-folder case is red;
 *   - readArguments takes a second --vite-cache: the twice case is red;
 *   - readArguments does not ask whyAPathIsTheStableCheckout: the stable checkout case is red;
 *   - readArguments does not ask whyAPathIsTheOfficesDataFolder: the data folder case is red.
 */
import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { environmentForTheWorld, readArguments } from '../tools/isolated-mole-office.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { whyAPathIsTheStableCheckout } from '../tools/sandbox-common.mjs'
import { theOfficesDataFolders, whyAPathIsTheOfficesDataFolder } from '../tools/the-offices-data-folder.mjs'

/** What the refusal of a folder no world may keep its cache in says after the helper's own sentence. */
const NO_WORLD_KEEPS_IT_THERE = ' Vite writes in the folder it is given and deletes files there, so no world keeps its cache there either. Nothing was started.'

/**
 * The tool's own function, typed as this file calls it. The tool is JavaScript, so TypeScript reads `viteCache` from its
 * default of null and would refuse a folder.
 */
const theEnvironmentFor = environmentForTheWorld as unknown as (options: Record<string, unknown>) => Record<string, string>

/** What the tool would send a world started in /tmp/place, from a starter whose own environment names a cache. */
function theWorldsEnvironment(viteCache?: string | null): Record<string, string> {
  return theEnvironmentFor({
    base: { MOLE_OFFICE_VITE_CACHE: '/tmp/the-starters-own-cache', PATH: '/usr/bin' },
    db: '/tmp/place/copy.db',
    apiPort: 40001,
    webPort: 40002,
    withMessageWorker: false,
    authority: { startedBy: null, secretaries: [] },
    purpose: null,
    handback: null,
    otherHost: null,
    place: '/tmp/place',
    workspace: 'default',
    ...(viteCache === undefined ? {} : { viteCache }),
  })
}

describe('the cache a world is sent', () => {
  it('is the folder --vite-cache names', () => {
    expect(theWorldsEnvironment('/tmp/shared-cache').MOLE_OFFICE_VITE_CACHE).toBe('/tmp/shared-cache')
  })

  it("is the world's own folder when nothing names one, and never the starter's own setting", () => {
    expect(theWorldsEnvironment().MOLE_OFFICE_VITE_CACHE).toBe(join('/tmp/place', 'vite-cache'))
    expect(theWorldsEnvironment(null).MOLE_OFFICE_VITE_CACHE).toBe(join('/tmp/place', 'vite-cache'))
  })
})

describe('--vite-cache on the command line', () => {
  it('is resolved against the folder the tool runs in', () => {
    const args = readArguments(['start', 'cw-cache', '--vite-cache', 'out/world-cache'])
    expect(args.bad, JSON.stringify(args)).toBeUndefined()
    expect(args.viteCache).toBe(resolve('out/world-cache'))
  })

  it('is null when it is not given', () => {
    expect(readArguments(['start', 'cw-cache']).viteCache).toBeNull()
  })

  it('is refused twice, without a folder, and on stop', () => {
    expect(readArguments(['start', 'cw-cache', '--vite-cache', '/tmp/a', '--vite-cache', '/tmp/b']).bad).toBe('`--vite-cache` was given twice. One cache per start.')
    expect(readArguments(['start', 'cw-cache', '--vite-cache']).bad).toBe("`--vite-cache` needs a folder for the browser app's pre-bundled dependencies after it.")
    expect(readArguments(['start', 'cw-cache', '--vite-cache', '--ready-within', '5']).bad).toBe("`--vite-cache` needs a folder for the browser app's pre-bundled dependencies after it.")
    expect(readArguments(['stop', 'cw-cache', '--vite-cache', '/tmp/a']).bad).toBe('`--vite-cache` belongs to `start`. `stop` reads an instance that already exists.')
  })

  it('is refused inside the stable checkout and in a folder that holds it', () => {
    const stable = theStableCheckoutFolder(homedir())
    for (const [folder, how] of [[join(stable, 'vite-cache'), ' is inside '], [dirname(stable), ' holds ']] as const) {
      const why = whyAPathIsTheStableCheckout(folder)
      expect(why, folder).toContain(how)
      expect(readArguments(['start', 'cw-cache', '--vite-cache', folder]).bad).toBe('`--vite-cache` ' + String(why) + NO_WORLD_KEEPS_IT_THERE)
    }
  })

  it("is refused inside the office's data folder", () => {
    // A data folder outside the stable checkout, so that the stable checkout's refusal does not answer first.
    const data = theOfficesDataFolders().find((folder) => whyAPathIsTheStableCheckout(join(folder, 'vite-cache')) === null)
    expect(data, 'every data folder the settings name is in the stable checkout').toBeDefined()
    const folder = join(String(data), 'vite-cache')
    const why = whyAPathIsTheOfficesDataFolder(folder)
    expect(why, folder).toContain(' is inside ')
    expect(readArguments(['start', 'cw-cache', '--vite-cache', folder]).bad).toBe('`--vite-cache` ' + String(why) + NO_WORLD_KEEPS_IT_THERE)
  })
})
