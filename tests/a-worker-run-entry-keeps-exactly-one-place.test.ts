// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { readTheWorkerRun } from '../src/shared/worker-runs.ts'

const common = {
  state: 'wanted', askedAt: '2026-01-01 00:00:00', handle: 'fixture-worker',
  askedBy: { who: { kind: 'agent', id: 'fixture-supervisor' }, session: 'fixture-run' },
  brief: { path: '/fixture/brief.md', sha256: 'fixture-hash', bytes: 1 },
}
const sandbox = { folder: '/fixture/sandbox', instance: 'fixture', container: 'fixture-container' }
const place = { kind: 'worktree', folder: '/fixture/worktree', repository: { name: 'fixture', root: '/fixture/repository' } }

describe('the worker run entry has exactly one location', () => {
  it('reads an existing sandbox entry unchanged', () => {
    const entry = { ...common, sandbox }
    expect(readTheWorkerRun(entry)).toEqual(entry)
  })
  it('reads a place entry', () => {
    const entry = { ...common, place }
    expect(readTheWorkerRun(entry)).toEqual(entry)
  })
  it('refuses entries with both locations or neither', () => {
    expect(readTheWorkerRun({ ...common, sandbox, place })).toBeNull()
    expect(readTheWorkerRun(common)).toBeNull()
  })
})
