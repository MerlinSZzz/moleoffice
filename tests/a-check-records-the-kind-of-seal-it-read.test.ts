// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5.
 * whichTreeWasRead records the seal's kind, independent of whether git can record a tip.
 * These are labelled synthetic seals, read by the real tool against its fixture office.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => { await fixture.close() })

function assembly() {
  return fixture.state.writes.find(({ path }) => path.endsWith('/assembled'))!.body.read
}

function seal(kind: 'git' | 'records') {
  fixture.state.submission = {
    id: 'synthetic-seal',
    seal: { kind, hash: 'a'.repeat(64), git: kind === 'git' ? { directory: fixture.checkout, commit: fixture.git('rev-parse', 'HEAD'), forkBase: fixture.base } : null, records: kind === 'records' ? { records: [], links: [] } : null },
  }
}

describe('the check tool names the kind it read', () => {
  /** MUTATION: omit namedKind in whichTreeWasRead. This git case goes red on sealKind.
   * Only the read in whichTreeWasRead fails: the prompt hook arms the preload after the worktree
   * and diff have been read. --dry stops after assembly and runs no model. */
  it('records git and no tip when the sealed worktree tip cannot be read', async () => {
    seal('git')
    const check = aMadeUpCheckSession()
    const armed = join(fixture.home, 'fail-the-tip')
    fixture.state.onPrompt = async () => { writeFileSync(armed, 'Synthetic failure of the reading tip.\n') }
    const preload = join(fixture.home, 'fail-the-reading-tip.mjs')
    writeFileSync(preload, `// Synthetic failure of only the reading tip, never a model or live office.
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
const original = childProcess.execFileSync
// The tool's git is guarded (tools/sandbox-git.mjs), which puts its own options before the command.
childProcess.execFileSync = (command, args, options) => {
  if (command === 'git' && args.slice(-2).join(' ') === 'rev-parse HEAD' && options?.cwd === ${JSON.stringify(fixture.pathFor(check))} && existsSync(${JSON.stringify(armed)})) {
    writeFileSync(${JSON.stringify(join(fixture.home, 'tip-failed'))}, 'The reading tip failed.\\n')
    throw new Error('Synthetic: cannot read the tip')
  }
  return original(command, args, options)
}
syncBuiltinESMExports()
`)
    const result = await fixture.inspect(['--check', check], { NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(preload).href}` })
    expect(result.code, result.err).toBe(0)
    expect(existsSync(join(fixture.home, 'tip-failed'))).toBe(true)
    expect(assembly()).toMatchObject({ sealId: 'synthetic-seal', sealKind: 'git' })
    expect(assembly()).not.toHaveProperty('tip')
  })

  /** MUTATION: omit namedKind in whichTreeWasRead. This records case goes red on sealKind. */
  it('records records with no tip', async () => {
    seal('records')
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).toMatchObject({ sealKind: 'records', worktree: 'record manifest synthetic-seal' })
    expect(assembly()).not.toHaveProperty('tip')
    expect(assembly()).not.toHaveProperty('linkEvidence')
  })

  /** MUTATION: leave linkEvidence off the records reading. This case goes red. */
  it('records that it read link evidence when the office handed the pinned links', async () => {
    seal('records')
    Object.assign(fixture.state.reading, {
      pinnedLinks: {
        links: [{ id: 'synthetic-link', standing: 'as sealed', inferredAtTheSeal: false, now: { type: 'about', from: 'synthetic-from', to: 'synthetic-to', createdAt: '2026-10-31 10:00:00', createdBy: 'a-synthetic-worker', createdByType: 'agent', inferred: false } }],
        says: 'Synthetic: the stand-in office says the seal pinned one link.',
      },
    })
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).toMatchObject({ sealKind: 'records', linkEvidence: 'read' })
  })

  /** MUTATION: leave linkEvidence off the records reading. This case goes red. */
  it('records that the seal was made before seals pinned links', async () => {
    seal('records')
    Object.assign(fixture.state.reading, { pinnedLinks: { links: null, says: 'Synthetic: the stand-in office says this seal was made before seals pinned links.' } })
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).toMatchObject({ sealKind: 'records', linkEvidence: 'sealed-before-links' })
  })

  /** MUTATION: add linkEvidence whatever the seal kind. This git case goes red. */
  it('records no link evidence for a git seal, though the office names links', async () => {
    seal('git')
    Object.assign(fixture.state.reading, { pinnedLinks: { links: [], says: 'Synthetic: the stand-in office names no links for this seal.' } })
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).toMatchObject({ sealKind: 'git' })
    expect(assembly()).not.toHaveProperty('linkEvidence')
  })

  /** MUTATION: omit namedKind in whichTreeWasRead. This files case goes red on sealKind. */
  it('records files with no tip', async () => {
    const staged = join(fixture.home, 'staged')
    const root = join(fixture.home, 'landing')
    mkdirSync(staged)
    mkdirSync(root)
    writeFileSync(join(staged, 'work'), 'Synthetic sealed file.\n')
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256').update('Synthetic sealed file.\n').digest('hex')
    fixture.state.filesArea = [{ written: root, resolved: root }]
    fixture.state.submission = { id: 'synthetic-seal', seal: { kind: 'files', hash: 'a'.repeat(64), git: null, records: null, files: { stagedAt: staged, root, files: [{ path: 'work', hash, mode: '100644' }] } } }
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).toMatchObject({ sealKind: 'files', staged })
    expect(assembly()).not.toHaveProperty('tip')
  })

  /** MUTATION: default an absent seal kind to git. This unsealed case goes red. */
  it('leaves the kind absent when no seal was read', async () => {
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()])
    expect(result.code, result.err).toBe(0)
    expect(assembly()).not.toHaveProperty('sealKind')
  })
})
