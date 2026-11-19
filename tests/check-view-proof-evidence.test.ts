// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real temporary file modes; this test makes no Docker protection claim. */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { observeEvidenceFiles } from '../tools/check-view-proof.mjs'

const names = ['start.json', 'receipt.json', 'stdout', 'stderr', 'exit', 'controller.log']

function evidence() {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-evidence-'))
  for (const name of names) {
    writeFileSync(join(root, name), 'Synthetic controller evidence\n', { mode: 0o600 })
    chmodSync(join(root, name), 0o600)
  }
  return { root, descriptor: { out: join(root, 'stdout'), err: join(root, 'stderr'), exit: join(root, 'exit'),
    receipt: join(root, 'receipt.json'), details: join(root, 'controller.log') } }
}

it('observes all six private controller evidence files', () => {
  const f = evidence()
  try {
    expect(observeEvidenceFiles(f.descriptor)).toEqual(names.map(name => ({
      observation: 'controller-evidence-mode', path: join(f.root, name), mode: '0600',
    })))
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

it.each(names.flatMap(name => [0o620, 0o602].map(mode => ({ name, mode }))))(
  'fails and names $name when its mode is $mode', ({ name, mode }) => {
    const f = evidence()
    try {
      const file = join(f.root, name)
      chmodSync(file, mode)
      expect(() => observeEvidenceFiles(f.descriptor)).toThrow(`Controller evidence ${file} is group- or world-writable`)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  },
)
