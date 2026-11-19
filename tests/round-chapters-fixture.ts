// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { RULE_FILES, savedRoundChapters, type RuleFile } from '../src/shared/round-chapters/manifest.ts'
import { ROUND_CHAPTERS_POLICY_FILE } from '../src/shared/round-chapters/delivery.ts'

export const ROUND_START_RULES: Record<RuleFile, string> = {
  'CODE.md': '# Fixture code\n\n## Chapter 2 — Fixture processes\nUse the recorded fixture group.\n\n## Chapter 5 — Fixture checks\nCheck the supplied fixture.\n',
  'LINE-common.md': '# Fixture line\nKeep the fixture task and its evidence.\n',
  'TERRITORIES.md': '# Fixture territory\nOnly this scratch checkout is in scope.\n',
}

export function expectRoundRulesSaved(data: unknown) {
  const manifest = savedRoundChapters(data)
  expect(manifest?.fallback).toBe(true)
  expect(manifest?.sources.map(({ name, text, fullFile }) => ({ name, text, fullFile })))
    .toEqual(RULE_FILES.map(name => ({ name, text: ROUND_START_RULES[name], fullFile: true })))
}

export const LEGACY_ROUND_CHAPTERS = { chapters: { named: null, mustRead: [], from: 'the role card', says: null } }

/** Keep source links cheap while the one rule file a round reads remains inside its checkout. */
export function linkSourceWithLocalRoundRules(source: string, checkout: string) {
  const link = (from: string, into: string, local: string[]) => {
    mkdirSync(into, { recursive: true })
    for (const name of readdirSync(from)) {
      const target = join(into, name)
      if (name !== local[0]) symlinkSync(join(from, name), target)
      else if (local.length > 1) link(join(from, name), target, local.slice(1))
      else writeFileSync(target, ROUND_START_RULES['CODE.md'], { flag: 'wx' })
    }
  }
  link(join(source, 'src'), join(checkout, 'src'), ['config', 'rules', 'CODE.md'])
}

export function writeRoundStartRules(sandbox: string, worktree: string) {
  const root = realpathSync(sandbox) + sep
  const paths: Record<RuleFile, string> = {
    'CODE.md': join(worktree, 'src/config/rules/CODE.md'),
    'LINE-common.md': join(sandbox, 'briefs/LINE-common.md'),
    'TERRITORIES.md': join(sandbox, 'briefs/TERRITORIES.md'),
  }
  for (const name of RULE_FILES) {
    mkdirSync(dirname(paths[name]), { recursive: true })
    if (!realpathSync(dirname(paths[name])).startsWith(root)) throw new Error('Fixture rule folder resolves outside its sandbox')
    writeFileSync(paths[name], ROUND_START_RULES[name])
  }
}

const scratch: string[] = []
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }) })

export function madeUpRound() {
  const dir = mkdtempSync(join(tmpdir(), 'round-reading-')); scratch.push(dir)
  const worktree = join(dir, 'worktrees', 'synthetic')
  mkdirSync(join(worktree, 'src/config/rules'), { recursive: true })
  mkdirSync(join(dir, 'briefs'))
  const brief = join(dir, 'briefs', 'task.md')
  writeFileSync(brief, 'ORIGINAL task\nwith trailing bytes.\n')
  writeFileSync(join(worktree, 'src/config/rules/CODE.md'), '# Code\n\n## Chapter 2 — Made-up ports\nPORTS\n\n### Child\nCHILD\n\n## Chapter 5 — Made-up tests\nTESTS\n')
  writeFileSync(join(dir, 'briefs/LINE-common.md'), '# Common\nINTRO\n\n## Local\nLOCAL\n\n### Chosen\nCHOSEN\n\n### Omitted\nOMITTED\n\n## Other\nOTHER\n')
  writeFileSync(join(dir, 'briefs/TERRITORIES.md'), '# Territories\n\n## Garden\nGARDEN\n\n## Kitchen\nKITCHEN\n')
  writeFileSync(brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'] }))
  const policy = { version: 1, kinds: { synthetic: { 'CODE.md': [{ chapter: 2, descendants: true }], 'LINE-common.md': [{ path: ['Common', 'Local'] }, { path: ['Common', 'Local', 'Chosen'] }], 'TERRITORIES.md': [] } }, territories: { garden: { 'TERRITORIES.md': [{ path: ['Territories', 'Garden'] }] } } }
  writeFileSync(join(dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(policy))
  return { dir, worktree, brief, policy }
}
