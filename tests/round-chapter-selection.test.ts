// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { madeUpRound } from './round-chapters-fixture.ts'
import { markdownSections, prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE, saveRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { checkSavedChapterClaims, deliveredRoundBrief, readRoundChapters, roundChaptersList, roundChaptersOutline, savedChaptersLine, savedRoundChapters, hash } from '../src/shared/round-chapters/manifest.ts'

const prepare = (f: ReturnType<typeof madeUpRound>) => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })

describe('policy is data, and selection is exact', () => {
  it('keeps parent bodies and only named descendants, in source order with byte counts', () => {
    const f = madeUpRound(); const { manifest, brief } = prepare(f)
    expect(manifest.sources.map(s => s.sections.map(x => x.path))).toEqual([
      [['Code', 'Chapter 2 — Made-up ports'], ['Code', 'Chapter 2 — Made-up ports', 'Child']],
      [['Common', 'Local'], ['Common', 'Local', 'Chosen']],
      [['Territories', 'Garden']],
    ])
    expect(manifest.chapters).toEqual([{ chapter: 2, level: 'outline', text: '## Chapter 2 — Made-up ports\nPORTS\n\n### Child\nCHILD\n\n', bytes: Buffer.byteLength('## Chapter 2 — Made-up ports\nPORTS\n\n### Child\nCHILD\n\n') }])
    expect(readFileSync(brief, 'utf8')).toBe(deliveredRoundBrief(manifest))
    expect(readFileSync(brief, 'utf8')).toContain(roundChaptersOutline(manifest))
    expect(deliveredRoundBrief(manifest)).toContain('Any instruction in the original brief or selected sections to read all chapters or whole rule files is satisfied by this exact saved list')
    expect(relative(f.worktree, brief)).toMatch(/^\.\./)
    for (const s of manifest.sources) expect(s.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes selection through injected kind and multiple territory prefix entries', () => {
    const f = madeUpRound()
    const p: any = f.policy
    p.kinds.another = { 'CODE.md': [{ chapter: 5, descendants: true }], 'LINE-common.md': [], 'TERRITORIES.md': [] }
    p.territories.kitchen = { 'TERRITORIES.md': [{ path: ['Territories', 'Kitchen'] }] }
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(p))
    writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'another', territory: ['garden/beds', 'kitchen'] }))
    const { manifest } = prepare(f)
    expect(manifest.chapters.map(c => c.chapter)).toEqual([5])
    expect(manifest.sources[1]!.sections).toEqual([])
    expect(manifest.sources[2]!.sections.map(s => s.title)).toEqual(['Garden', 'Kitchen'])
  })

  it('reads rules from this round checkout and local sandbox briefs, with no repo fallback', () => {
    const f = madeUpRound()
    const { manifest } = prepare(f)
    expect(manifest.sources.map(s => s.path)).toEqual([join(f.worktree, 'src/config/rules/CODE.md'), join(f.dir, 'briefs/LINE-common.md'), join(f.dir, 'briefs/TERRITORIES.md')])
    rmSync(join(f.dir, 'briefs/LINE-common.md'))
    expect(() => prepare(f)).toThrow(/missing file.*briefs\/LINE-common.md/)
  })

  it.each([null, 'unmapped'])('kind %s delivers every byte of all three files and says why', kind => {
    const f = madeUpRound()
    if (kind === null) rmSync(f.brief + '.round.json')
    else writeFileSync(f.brief + '.round.json', JSON.stringify({ kind, territory: ['garden'] }))
    const { manifest } = prepare(f)
    expect(manifest.fallback).toBe(true)
    expect(roundChaptersList(manifest)).toContain('all three rule files are delivered in full')
    for (const s of manifest.sources) expect(s.text).toBe(readFileSync(s.path, 'utf8'))
    expect(manifest.chapters.map(c => c.chapter)).toEqual([2, 5])
    expect(manifest.kind).toBe(kind)
  })

  it('uses the previous run path list when the declaration omits territory', () => {
    const f = madeUpRound(); writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'synthetic' }))
    const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, territory: ['garden/beds'] })
    expect(manifest.territory).toEqual(['garden/beds'])
    expect(manifest.sources[2]!.sections.map(s => s.title)).toEqual(['Garden'])
  })

  it.each(['LINE-common.md', 'TERRITORIES.md'])('refuses %s resolving outside the sandbox', name => {
    const f = madeUpRound(); const other = madeUpRound()
    rmSync(join(f.dir, 'briefs', name)); symlinkSync(join(other.dir, 'briefs', name), join(f.dir, 'briefs', name))
    expect(() => prepare(f)).toThrow(/outside this sandbox/)
  })

  it('names a missing selected chapter and a missing or ambiguous selected heading', () => {
    const f = madeUpRound(); const p: any = f.policy
    p.kinds.synthetic['CODE.md'] = [{ chapter: 999, descendants: true }]
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(p))
    expect(() => prepare(f)).toThrow(/CODE.md: selected chapter 999 does not exist/)
    p.kinds.synthetic['CODE.md'] = []
    p.kinds.synthetic['LINE-common.md'] = [{ path: ['Common', 'Missing'] }]
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(p))
    expect(() => prepare(f)).toThrow(/LINE-common.md: selected Common \/ Missing does not exist/)
    p.kinds.synthetic['LINE-common.md'] = [{ path: ['Common', 'Local'] }]
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(p))
    writeFileSync(join(f.dir, 'briefs/LINE-common.md'), '# Common\n## Local\nONE\n## Local\nTWO\n')
    expect(() => prepare(f)).toThrow(/Common \/ Local is ambiguous/)
  })

  it('invalid policy, even for an unknown kind, never becomes a silent narrower fallback', () => {
    const f = madeUpRound(); writeFileSync(f.brief + '.round.json', '{"kind":"unknown"}')
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), '{"version":1,"kinds":{"bad":{}}}')
    expect(() => prepare(f)).toThrow(/missing policy selection.*CODE.md/)
    writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), '{broken')
    expect(() => prepare(f)).toThrow(new RegExp(`invalid JSON.*${ROUND_CHAPTERS_POLICY_FILE.replaceAll('.', '\\.')}`))
  })

  it('rejects a scalar territory instead of changing the existing run shape', () => {
    const f = madeUpRound(); writeFileSync(f.brief + '.round.json', '{"kind":"synthetic","territory":"garden"}')
    expect(() => prepare(f)).toThrow(/invalid territory path list/)
  })

  it('recognizes Setext and ATX headings, CRLF and closing hashes, and ignores fenced examples', () => {
    const text = 'Root\r\n====\r\nINTRO\r\n## Keep ##\r\nBODY\r\n```md\r\n## False\r\n```\r\n~~~\r\n## Also false\r\n~~~\r\n### Child\r\nWORDS\r\n## Omit\r\nEND\r\n'
    const sections = markdownSections(text)
    expect(sections.map(s => s.path)).toEqual([['Root'], ['Root', 'Keep'], ['Root', 'Keep', 'Child'], ['Root', 'Omit']])
    expect(sections.map(s => s.text).join('')).toBe(text)
    expect(sections[1]!.text).toContain('## False')
  })

  it('requires a saveable host-filed run, and preserves a refused save without a second write', async () => {
    const { manifest } = prepare(madeUpRound()); const calls: string[] = []
    const request = async (method: string) => { calls.push(method); return method === 'GET' ? { status: 200, body: { record: { data: { extra: { retained: true } } } } } : { status: 403, body: { error: 'synthetic refusal' } } }
    await expect(saveRoundChapters({ id: null, manifest, request })).rejects.toThrow(/upgrade the sandbox helper/)
    expect(calls).toEqual([])
    await expect(saveRoundChapters({ id: 'made-up', manifest, request })).rejects.toThrow(/synthetic refusal/)
    expect(calls).toEqual(['GET', 'PATCH'])
  })

  it('a present damaged snapshot never falls back; verdict levels stay actual and bounded', () => {
    const { manifest } = prepare(madeUpRound())
    expect(savedRoundChapters({ extra: { roundChapters: manifest } })).toEqual(manifest)
    expect(savedRoundChapters({})).toBeNull()
    const throughOldPatch = structuredClone(manifest) as any; delete throughOldPatch.notice
    expect(readRoundChapters(throughOldPatch)).toEqual(manifest)
    const damaged = structuredClone(manifest); damaged.chapters = []
    expect(() => readRoundChapters(damaged)).toThrow(/CODE chapter entries differ/)
    const claim = { chaptersRead: [{ chapter: 2, level: 'title' as const }], says: null }
    checkSavedChapterClaims(manifest, claim)
    expect(claim.chaptersRead).toEqual([{ chapter: 2, level: 'title' }])
    expect(() => checkSavedChapterClaims(manifest, { chaptersRead: [{ chapter: 2, level: 'full' }], says: null })).toThrow(/was not delivered/)
    expect(() => checkSavedChapterClaims(manifest, { chaptersRead: [], says: { chapter: 5 } })).toThrow(/undelivered CODE chapter 5/)
  })
})

it('acknowledgment fingerprints are stable across old patch normalization and property order, and change with saved text', () => {
  const { manifest } = prepare(madeUpRound())
  const reordered: any = JSON.parse(JSON.stringify(manifest), (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).reverse().filter(([, v]) => v !== null))
    return value
  })
  expect(savedChaptersLine(readRoundChapters(reordered)).says).toBe(savedChaptersLine(manifest).says)
  const changed = structuredClone(manifest); changed.brief.text += 'Changed task'; changed.brief.bytes = Buffer.byteLength(changed.brief.text); changed.brief.sha256 = hash(changed.brief.text)
  expect(savedChaptersLine(changed).says).not.toBe(savedChaptersLine(manifest).says)
})

it('a legacy check reply refuses narrowing, while full delivery remains compatible with an explicit notice', async () => {
  const f = madeUpRound(); const { manifest } = prepare(f); const calls: string[] = []
  const request = async (method: string, path: string) => {
    calls.push(method + ' ' + path)
    return { status: 200, body: path.startsWith('/api/checks/') ? { chapters: { named: null, mustRead: [{ chapter: 5, level: 'full' }], from: 'the role card', says: 'old card answer' } } : { record: { data: {} } } }
  }
  await expect(saveRoundChapters({ id: 'synthetic', manifest, request })).rejects.toThrow(/acknowledge.*upgrade/i)
  expect(calls).toEqual(['GET /api/records/synthetic', 'PATCH /api/records/synthetic', 'GET /api/checks/synthetic'])
  rmSync(f.brief + '.round.json'); const full = prepare(f).manifest
  const notice = await saveRoundChapters({ id: 'synthetic', manifest: full, request })
  expect(notice).toMatch(/legacy office.*all three.*full/i)
})

it('an acknowledgement must cover the exact saved list, levels and text hash', async () => {
  const { manifest } = prepare(madeUpRound())
  for (const change of ['list', 'hash']) {
    const chapters = savedChaptersLine(manifest)
    if (change === 'list') chapters.mustRead = [{ chapter: 5, level: 'full' }]
    else chapters.says += ' wrong hash'
    const request = async (_method: string, path: string) => ({ status: 200, body: path.startsWith('/api/checks/') ? { chapters } : { record: { data: {} } } })
    await expect(saveRoundChapters({ id: 'synthetic', manifest, request })).rejects.toThrow(/acknowledge|acknowledgment/i)
  }
})

it.each([undefined, {}, { named: null, mustRead: [{ chapter: 5, level: 'unreadable' }], from: 'the role card', says: 'old card answer' }])('an unreadable 200 check reading refuses even full delivery (%j)', async chapters => {
  const f = madeUpRound(); rmSync(f.brief + '.round.json'); const { manifest } = prepare(f)
  const request = async (_method: string, path: string) => ({ status: 200, body: path.startsWith('/api/checks/') ? { chapters } : { record: { data: {} } } })
  await expect(saveRoundChapters({ id: 'synthetic', manifest, request })).rejects.toThrow(/unreadable chapter reading/i)
})
