// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const plugin = join(import.meta.dirname, '..')
// A home folder as this machine spells it: `/home/<name>/` or `/Users/<name>/`,
// with a real folder name between the slashes. The source of this expression
// does not itself contain a home path.
const homePath = /\/(?:home|Users)\/[A-Za-z0-9._-]+\//

/** Every file git holds under plugins/office-map/, relative to the plugin
 * folder. `git ls-files` counts a staged file, so a path added and not yet
 * committed is caught too. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: plugin, encoding: 'utf8' }).split('\0').filter(Boolean)
}

describe('no committed plugin file carries an absolute home path', () => {
  it('reads every tracked file under plugins/office-map and names each home path by file and line', () => {
    const offenders: string[] = []
    for (const file of trackedFiles()) {
      const text = readFileSync(join(plugin, file), 'utf8')
      for (const [index, line] of text.split('\n').entries()) {
        if (homePath.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
