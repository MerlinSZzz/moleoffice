// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PLUGIN-ONLY CHANGE IS, AND WHETHER A MANIFEST IS ACCEPTED, ARE EACH WORKED OUT IN ONE PLACE. Wave 13x round
 * 16, step 4 of the plugin pipeline udGnc-Bsr15R (block 1Asl25_3DvQM), under the plan VlQueUhVQQmi, by the
 * owner's decision.
 *
 * WHAT THIS FILE PROVES:
 * 1. A change is plugin-only when every path it touches is inside one plugin's folder, and the rule says whether the
 *    change touches that plugin's manifest. A change that also touches anything else, two plugins, the README beside
 *    them, or a folder whose name is not a plugin id, is not one.
 * 2. A manifest is read from its text by one function, and each refusal says why, with its one-word cause beside the
 *    sentence, as the secretary's 2ofDpr3_ED-D and a decision say. A refused field keeps its path,
 *    so the plugin's own check
 *    can tell a view the interface does not have from any other fault.
 */

import { describe, expect, it } from 'vitest'

import { aManifestFrom, aPluginOnlyChange } from '../src/shared/plugins.ts'


/** A manifest this office accepts, for the made-up plugin `id`. */
function aGoodManifest(id: string): Record<string, unknown> {
  return {
    id,
    name: { en: 'A made-up plugin' },
    version: '1.0.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 50 },
  }
}

describe('a plugin-only change, and a manifest, each read by one rule', () => {
  it('1. names a change inside one plugin folder, and whether it touches the manifest', () => {
    expect(aPluginOnlyChange(['plugins/made-up/main.ts'])).toEqual({ id: 'made-up', manifest: false })
    expect(aPluginOnlyChange(['plugins/made-up/main.ts', 'plugins/made-up/tests/count.test.ts'])).toEqual({ id: 'made-up', manifest: false })
    expect(aPluginOnlyChange(['plugins/made-up/main.ts', 'plugins/made-up/plugin.json'])).toEqual({ id: 'made-up', manifest: true })
    // NOT ONE.
    expect(aPluginOnlyChange([]), 'no path at all').toBeNull()
    expect(aPluginOnlyChange(['plugins/made-up/main.ts', 'src/shared/plugin-read.ts']), 'the interface as well').toBeNull()
    expect(aPluginOnlyChange(['plugins/made-up/main.ts', 'plugins/another-one/main.ts']), 'two plugins').toBeNull()
    expect(aPluginOnlyChange(['plugins/README.md']), 'the README beside the plugins').toBeNull()
    expect(aPluginOnlyChange(['plugins/Made_Up/main.ts']), 'a folder name that is not a plugin id').toBeNull()
    expect(aPluginOnlyChange(['plugins/made-up']), 'the folder itself').toBeNull()
    expect(aPluginOnlyChange(['./plugins/made-up/main.ts']), 'a path not written from the root').toBeNull()
    expect(aPluginOnlyChange(['plugins/made-up/../../src/x.ts']), 'a path that climbs out').toBeNull()
  })

  it('2. reads a manifest from its text, and says why it refuses one', () => {
    expect(aManifestFrom('made-up', JSON.stringify(aGoodManifest('made-up')))).toEqual({ manifest: aGoodManifest('made-up') })
    expect(aManifestFrom('made-up', null)).toEqual({ refusal: 'The folder has no plugin.json.', issues: [{ path: '', message: 'The folder has no plugin.json.' }], refusedBecause: { cause: 'no-manifest' } })
    const notJson = aManifestFrom('made-up', '{ not json')
    expect('refusal' in notJson && notJson.refusal.startsWith('plugin.json is not JSON: ')).toBe(true)
    expect('refusedBecause' in notJson && notJson.refusedBecause).toEqual({ cause: 'manifest-is-not-json' })
    const otherId = aManifestFrom('made-up', JSON.stringify(aGoodManifest('another-one')))
    expect(otherId).toEqual({
      refusal: 'plugin.json says its id is "another-one", and its folder is "made-up". They must be the same.',
      issues: [{ path: 'id', message: 'plugin.json says its id is "another-one", and its folder is "made-up". They must be the same.' }],
      refusedBecause: { cause: 'id-differs', said: 'another-one' },
    })
    const aViewItHasNot = aManifestFrom('made-up', JSON.stringify({ ...aGoodManifest('made-up'), reads: ['projects', 'rooms'] }))
    expect('issues' in aViewItHasNot && aViewItHasNot.issues.map((one) => one.path)).toEqual(['reads.1'])
    expect('refusal' in aViewItHasNot && aViewItHasNot.refusal.startsWith('plugin.json is not a manifest this office accepts. reads.1: ')).toBe(true)
  })

})
