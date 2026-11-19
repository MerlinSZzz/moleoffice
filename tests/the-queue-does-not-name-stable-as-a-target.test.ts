// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OLD: no source gate named the branch reserved for the served office.
 * NEW: the queue and landing modules declare no literal stable branch target.
 * WHY: WshQXf2e8gVB condition 5, forwarded in jsWxuF31of8n.
 *
 * This is a source declaration gate, not a proof about arbitrary runtime inputs.
 * The separate handoff rehearsal advances development main and its HEAD while
 * observing the stable service. Existing queue tests cover lane validation.
 * MUTATION: add git(root, ['update-ref', 'refs/heads/stable', Cfinal]) to landGit.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { parseSync } from 'rolldown/utils'

const root = fileURLToPath(new URL('..', import.meta.url))

it('the queue and landing declare no stable branch target', () => {
  const files = [
    'tools/the-merger.mjs',
    ...readdirSync(join(root, 'tools/merge-tool')).filter(name => name.endsWith('.mjs')).map(name => `tools/merge-tool/${name}`),
    ...['src/server/lib', 'src/server/api'].flatMap(folder => readdirSync(join(root, folder))
      .filter(name => /^merge.*\.ts$/.test(name)).map(name => `${folder}/${name}`)),
  ]
  const targets: string[] = []
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8')
    const parsed = parseSync(file, source)
    expect(parsed.errors, `${file} must parse before its declarations can be checked`).toEqual([])
    const visit = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return
      const node = value as { type?: string; value?: unknown; start?: number; expressions?: unknown[]; quasis?: { value: { cooked: string | null } }[] }
      const text = node.type === 'Literal' ? node.value
        : node.type === 'TemplateLiteral' && node.expressions?.length === 0 ? node.quasis?.[0]?.value.cooked : null
      if (typeof text === 'string' && /^(?:refs\/heads\/)?stable$/.test(text)) {
        targets.push(`${file}:${source.slice(0, node.start ?? 0).split('\n').length}: ${text}`)
      }
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(visit)
        else if (typeof child === 'object') visit(child)
      }
    }
    visit(parsed.program)
  }
  expect(targets, 'Stable belongs to the explicit handoff and upgrade tools; a queue declaration needs review.').toEqual([])
})
