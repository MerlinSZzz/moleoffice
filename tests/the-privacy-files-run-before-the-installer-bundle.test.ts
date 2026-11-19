// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The bundle never starts the privacy runner: two privacy files bundle the checkout themselves.
 * Each packager checks the built page, runs the privacy files, then starts the bundle, in that order.
 * This static criterion creates no folder and never runs a packager.
 * Mutations: import the runner in bundle.mjs; move Linux's call after the bundle; remove Mac's
 * call; move the built-page check after the call; remove Windows's call (round W13). Each guarded
 * place is mutated on its own.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = (name: string) => readFileSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), 'utf8')

describe('privacy files run before the installer bundle without a loop', () => {
  it('bundle.mjs neither imports the privacy runner nor names vitest', () => {
    expect(source('bundle.mjs')).not.toMatch(/the-plain-privacy-run|\bvitest\b|\brunThePlainPrivacyFiles\b/)
  })

  for (const platform of ['linux', 'mac', 'windows']) {
    it(`${platform}: the owner-content step runs against REPO_ROOT inside try before spawning the bundle`, () => {
      const text = source(`package-${platform}.mjs`)
      expect(text).toMatch(/import\s*\{\s*runTheOwnerContentStep\s*\}\s*from\s*['"]\.\/the-owner-content-verdict\.mjs['"]/)
      const call = /runTheOwnerContentStep\(\{\s*root:\s*REPO_ROOT,\s*work,\s*say,\s*verdictPath:\s*verdictFile\s*\}\)/.exec(text)
      const bundle = /spawnSync\(process\.execPath,\s*\[join\(REPO_ROOT,\s*['"]scripts['"],\s*['"]bundle\.mjs['"]\)/.exec(text)
      expect(call, `${platform} must call the owner-content step`).not.toBeNull()
      expect(bundle).not.toBeNull()
      expect(call!.index).toBeGreaterThan(text.lastIndexOf('try {', call!.index))
      expect(text.lastIndexOf('try {', call!.index)).toBeGreaterThan(0)
      expect(call!.index, `${platform} privacy files must precede the bundle`).toBeLessThan(bundle!.index)
      expect(text.slice(call!.index, bundle!.index)).toMatch(/\.refused/)
      expect(text.slice(call!.index, bundle!.index)).toContain('fail(')
    })

    it(`${platform}: the built-page refusal is before the owner-content step`, () => {
      const text = source(`package-${platform}.mjs`)
      const page = /const\s+(\w+)\s*=\s*missingWebBuild\(THE_BUILT_PAGE\)/.exec(text)
      const call = /runTheOwnerContentStep\(\{/.exec(text)
      expect(page, `${platform} must check the built page`).not.toBeNull()
      expect(call).not.toBeNull()
      expect(page!.index, `${platform} built page must be checked first`).toBeLessThan(call!.index)
      expect(text.slice(page!.index, call!.index)).toMatch(new RegExp(`if \\(\\s*${page![1]} !== null\\s*\\) fail\\(${page![1]}\\)`))
    })
  }
})
