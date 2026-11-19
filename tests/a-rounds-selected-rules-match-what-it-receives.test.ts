// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it, vi } from 'vitest'
import { basename, join } from 'node:path'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { madeUpRound } from './round-chapters-fixture.ts'
import { prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE, saveRoundChapters, THE_LEGACY_OFFICE_NOTE, THE_UNSAFE_TERRITORY_NOTICE, unknownKindNotice } from '../src/shared/round-chapters/delivery.ts'
import { deliveredRoundBrief, readRoundChapters, roundChaptersGivenText, roundChaptersOutline, roundChaptersText, savedChaptersLine } from '../src/shared/round-chapters/manifest.ts'
import { freshDb } from './helpers.ts'
import { NEXT_FILE, nextWhole, THE_FALLBACK_RULE, THE_PACK_REFUSAL, twoHeadings } from '../src/shared/round-start-pack.ts'

function round(task = '**The removal.** Then one code commit taking the paragraph out of manifest.ts. Nothing else changes.\n') {
  const f = madeUpRound()
  rmSync(f.brief + '.round.json')
  writeFileSync(f.brief, task)
  const policy = { version: 1, kinds: { development: { 'CODE.md': [{ chapter: 2, descendants: true }], 'LINE-common.md': '*', 'TERRITORIES.md': '*' } } }
  writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(policy))
  const territories = `# Territories\n\n## Lines\n\n${THE_FALLBACK_RULE}, for files not named: use history.\n\n### alpha, first line (sandbox ${basename(f.dir)})\nOWN FILE.\n\n#### Details\nOWN DETAIL.\n\n### beta, second line (sandbox another)\nOTHER FILE.\n`
  writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), territories)
  return { ...f, territories, prepare: () => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief }) }
}

describe('a round receives the rules its check reads', () => {
  it('infers development from a real brief instruction and selects the sandbox line and fallback', async () => {
    const f = round(); const { manifest, brief } = f.prepare()
    expect(manifest.kind).toBe('development')
    expect(manifest.fallback).toBe(false)
    const territory = manifest.sources[2]!
    expect(territory.fullFile).toBe(false)
    expect(territory.text).toContain(`${THE_FALLBACK_RULE}, for files not named: use history.`)
    expect(territory.text).toContain('OWN FILE.')
    expect(territory.text).toContain('OWN DETAIL.')
    expect(territory.text).not.toContain('OTHER FILE.')
    const delivered = readFileSync(brief, 'utf8')
    expect(delivered).toBe(deliveredRoundBrief(manifest))
    expect(delivered).toContain(roundChaptersGivenText(manifest))
    expect(delivered).toContain(territory.path)
    expect(delivered).not.toContain('OTHER FILE.')
    const request = async (_method: string, path: string) => ({ status: 200, body: path.startsWith('/api/checks/') ? { chapters: savedChaptersLine(manifest) } : { record: { data: {} } } })
    await expect(saveRoundChapters({ id: 'synthetic', manifest, request })).resolves.toBeNull()
  })

  it('builds the fallback paragraph matcher from the exported marker, metacharacters and all', async () => {
    const marker = 'Fallback rule (v2)+'
    const f = round()
    const territories = `# Territories\n\n## Lines\n\n${marker}, for files not named: use history.\n\nFallback rule v2+ is a decoy.\n\nThis paragraph mentions ${marker} mid-way, not at its start.\n\n### alpha, first line (sandbox ${basename(f.dir)})\nOWN FILE.\n\n#### Details\nOWN DETAIL.\n\n### beta, second line (sandbox another)\nOTHER FILE.\n`
    writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), territories)
    vi.resetModules()
    vi.doMock('../src/shared/round-start-pack.ts', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../src/shared/round-start-pack.ts')>()),
      THE_FALLBACK_RULE: marker,
    }))
    try {
      const { prepareRoundChapters: prepareWithChangedMarker } = await import('../src/shared/round-chapters/delivery.ts')
      const { manifest, brief } = prepareWithChangedMarker({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
      expect(manifest.fallback).toBe(false)
      const territory = manifest.sources[2]!
      expect(territory.fullFile).toBe(false)
      expect(territory.text).toContain(`${marker}, for files not named: use history.`)
      expect(territory.text).toContain('OWN FILE.')
      expect(territory.text).toContain('OWN DETAIL.')
      expect(territory.text).not.toContain('OTHER FILE.')
      expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
      const fenced = territories.replace(`${marker}, for files not named: use history.`, '```md\n' + `${marker}, in an example.` + '\n```')
      writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), fenced)
      expect(prepareWithChangedMarker({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief }).manifest.fallback).toBe(true)
    } finally {
      vi.doUnmock('../src/shared/round-start-pack.ts')
      vi.resetModules()
    }
  })

  it.each([
    'Change only the `description` of the `reportsTo` field of `role_card_words` in src/shared/kinds.ts.\n',
    'Change the header of src/web/lib/plugin-reason.ts so it is true.\n',
    'Change src/shared/x.ts so that nothing else changes.\n',
  ])('recognizes an affirmative code instruction in a different real brief shape', task => {
    expect(round(task).prepare().manifest.kind).toBe('development')
  })

  it.each(['No classification here.\n', '**The removal.** Then one code commit taking the change out. No code changes.\n', 'Round kind: tests\nRound kind: development\n', '```md\nRound kind: development\n```\n', '> Round kind: development\n', '## Previous work\nChange src/shared/old.ts.\n', '## Previous work\nRound kind: tests\n', 'Do not change src/shared/old.ts.\n', 'Round kind: tests\nChange src/shared/code.ts.\n', '# Tests round\n# Development round\n', 'Change nothing in src/shared/x.ts.\n', 'Add no code to src/shared/x.ts.\n', 'Update the test only, not src/shared/x.ts.\n', 'Fix the words; do not touch src/shared/x.ts.\n'])('unknown or conflicting kind keeps the first two files whole (%s)', task => {
    const f = round(task); const { manifest, brief } = f.prepare()
    expect(manifest.kind).toBe('unclassified')
    expect(manifest.notice).toBe(unknownKindNotice(null, true))
    expect(manifest.fallback).toBe(false)
    expect(readRoundChapters(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest)
    for (const source of manifest.sources.slice(0, 2)) {
      expect(source.fullFile).toBe(true)
      expect(source.text).toBe(readFileSync(source.path, 'utf8'))
    }
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersOutline(manifest))
    expect(readFileSync(brief, 'utf8')).toContain(manifest.sources[1]!.text)
    expect(readFileSync(brief, 'utf8')).not.toContain(manifest.sources[0]!.text)
    expect(manifest.sources[2]!.fullFile).toBe(false)
    expect(manifest.sources[2]!.text).toContain('OWN FILE.')
    expect(manifest.sources[2]!.text).not.toContain('OTHER FILE.')
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
  })

  it('keeps an explicit territory selection when no heading names the sandbox', () => {
    const f = round()
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { development: {
      'CODE.md': [{ chapter: 2, descendants: true }],
      'LINE-common.md': '*',
      'TERRITORIES.md': [{ path: ['Territories', 'Lines', 'beta, second line (sandbox another)'] }],
    } } }))
    writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), f.territories.replace(`sandbox ${basename(f.dir)}`, 'sandbox elsewhere'))
    const { manifest, brief } = f.prepare()
    expect(manifest.kind).toBe('development')
    expect(manifest.fallback).toBe(false)
    expect(manifest.notice).toBeNull()
    expect(manifest.pack).toBeUndefined()
    const territory = manifest.sources[2]!
    expect(territory.fullFile).toBe(false)
    expect(territory.text).toBe('### beta, second line (sandbox another)\nOTHER FILE.\n')
    expect(territory.text).toContain('OTHER FILE.')
    expect(territory.text).not.toContain('OWN FILE.')
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
  })

  it('delivers NEXT.md whole once after the saved rules', () => {
    const f = round()
    const next = '## 1. Open items\n\n- A different NEXT.md, not the brief.\n'
    writeFileSync(join(f.dir, NEXT_FILE), next)
    const { manifest, brief } = f.prepare()
    const delivered = readFileSync(brief, 'utf8')
    const part = `${nextWhole(join(f.dir, NEXT_FILE))}\n\n${next}`
    expect(delivered.split(part)).toHaveLength(2)
    expect(delivered.indexOf(part)).toBeGreaterThan(delivered.indexOf(roundChaptersGivenText(manifest)))
  })

  it.each(['missing line', 'missing rule', 'two rules'])('unsafe territory evidence falls back in full: %s', variation => {
    const f = round()
    let text = f.territories
    if (variation === 'missing line') text = text.replace(`sandbox ${basename(f.dir)}`, 'sandbox elsewhere')
    if (variation === 'missing rule') text = text.replace(THE_FALLBACK_RULE, 'Other rule')
    if (variation === 'two rules') text += `\n${THE_FALLBACK_RULE}, another rule.\n`
    writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), text)
    const { manifest, brief } = f.prepare()
    expect(manifest.kind).toBe('development')
    expect(manifest.fallback).toBe(true)
    expect(manifest.notice).toBe(THE_UNSAFE_TERRITORY_NOTICE)
    for (const source of manifest.sources) expect(source.fullFile).toBe(true)
    expect(manifest.sources[2]!.text).toBe(text)
    expect(readRoundChapters(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest)
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
  })

  it('refuses two headings for the sandbox and writes nothing', () => {
    const f = round()
    const text = f.territories.replace('sandbox another', `sandbox ${basename(f.dir)}`)
    writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), text)
    const refusal = THE_PACK_REFUSAL(twoHeadings(2, join(f.dir, 'briefs', 'TERRITORIES.md'), basename(f.dir)))
    expect(() => f.prepare()).toThrow(refusal)
    expect(existsSync(join(f.dir, 'out/round-chapters'))).toBe(false)
  })

  it('does not silently replace a conflicting sandbox policy selection', () => {
    const f = round()
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { development: { 'CODE.md': [], 'LINE-common.md': [], 'TERRITORIES.md': [] } } }))
    const { manifest, brief } = f.prepare()
    expect(manifest.fallback).toBe(true)
    expect(manifest.notice).toBe(THE_UNSAFE_TERRITORY_NOTICE)
    expect(manifest.sources.every(source => source.fullFile)).toBe(true)
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
  })

  it('keeps an unrecognized kind unrecognized and refuses a damaged declaration', () => {
    const f = round('Round kind: alien\n')
    const { manifest } = f.prepare()
    expect(manifest.kind).toBe('alien')
    expect(manifest.fallback).toBe(false)
    expect(manifest.notice).toBe(unknownKindNotice('alien', true))
    expect(manifest.sources[0]!.fullFile).toBe(true)
    expect(manifest.sources[1]!.fullFile).toBe(true)
    writeFileSync(f.brief + '.round.json', '{broken')
    expect(() => f.prepare()).toThrow(/invalid JSON/)
  })

  it('the existing manifest reader acknowledges an unclassified selection without pretending the kind is known', async () => {
    const f = round('No classification here.\n')
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { unclassified: { 'CODE.md': [], 'LINE-common.md': [], 'TERRITORIES.md': [] } } }))
    const { manifest } = f.prepare()
    let stored: typeof manifest | null = null
    const request = async (method: string, path: string, body?: any) => {
      if (method === 'PATCH') stored = readRoundChapters(body.dataPatch.extra.roundChapters)
      if (path.startsWith('/api/checks/')) return { status: 200, body: { chapters: savedChaptersLine(stored!) } }
      return { status: 200, body: { record: { data: {} } } }
    }
    await expect(saveRoundChapters({ id: 'synthetic', manifest, request })).resolves.toBeNull()
    expect(stored).toEqual(manifest)
    expect(manifest.notice).toBe(unknownKindNotice(null, true))
    expect(manifest.sources.slice(0, 2).every(source => source.fullFile)).toBe(true)
    expect(manifest.sources[2]!.text).toContain('OWN FILE.')
  })

  it('permits a legacy check only for the full selection actually delivered', async () => {
    const f = round()
    const legacy = async (_method: string, path: string) => ({ status: 200, body: path.startsWith('/api/checks/') ? { chapters: { named: null, mustRead: [], from: 'the role card', says: null } } : { record: { data: {} } } })
    await expect(saveRoundChapters({ id: 'synthetic', manifest: f.prepare().manifest, request: legacy })).rejects.toThrow(/acknowledge/)
    writeFileSync(f.brief, 'No classification.\n')
    await expect(saveRoundChapters({ id: 'synthetic', manifest: f.prepare().manifest, request: legacy })).rejects.toThrow(/acknowledge/)
    writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), f.territories.replace(`sandbox ${basename(f.dir)}`, 'sandbox elsewhere'))
    const full = f.prepare().manifest
    await expect(saveRoundChapters({ id: 'synthetic', manifest: full, request: legacy })).resolves.toBe(THE_LEGACY_OFFICE_NOTE)
  })

  it('gives the real inspector the same saved territory as the round', async () => {
    const f = round('An unclassified task.\n')
    const { manifest, brief } = f.prepare()
    const db = await freshDb()
    try {
      const inspection = await import('../src/server/lib/inspection.ts')
      const run = db.api.createRecord({ kind: 'session', title: 'Made-up selection', workspaceId: 'default', actor: { type: 'human', id: 'jory' }, origin: 'fixture', data: { state: 'running', extra: { roundChapters: manifest } } })
      const reads = inspection.whatTheInspectorReads(run.id, 'default')
      const prompt = inspection.assembleTheInspectorsPrompt({ reads, changes: inspection.changesInTheWorkArea([], []), workspaceId: 'default' })
      const selection = roundChaptersText(manifest)
      expect(prompt.text).toContain(selection)
      expect(readFileSync(brief, 'utf8')).toContain(roundChaptersGivenText(manifest))
      expect(prompt.text).not.toContain('OTHER FILE.')
      expect(readFileSync(brief, 'utf8')).not.toContain('OTHER FILE.')
    } finally { db.close() }
  }, 30000)
})
