// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { objectId, sizeBytes, writeTestPack } from './packed-head-fixture.ts'

/** Made-up repository: a tiny commit in a pack with an unrelated, incompressible 16 MiB blob. */
export function largePackedCommitFixture(position: 'first' | 'last' = 'last', delta: 6 | 7 | null = null) {
  const directory = mkdtempSync(join(tmpdir(), 'mole-large-packed-commit-'))
  execFileSync('git', ['init', '-q', '-b', 'main', directory], { stdio: 'pipe' })
  const tree = objectId('tree', Buffer.alloc(0))
  mkdirSync(join(directory, '.git', 'objects', tree.slice(0, 2)))
  writeFileSync(join(directory, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), deflateSync(Buffer.from('tree 0\0')))
  const body = Buffer.from(`tree ${tree}\nauthor Synthetic <test@example.invalid> 1 +0000\ncommitter Synthetic <test@example.invalid> 1 +0000\n\nMade-up commit.\n`)
  let head = objectId('commit', body)
  const blob = randomBytes(16 * 1024 * 1024)
  const commit = { type: 1, body, id: head }
  const unrelated = { type: 3, body: blob, id: objectId('blob', blob) }
  if (delta === null) writeTestPack(directory, position === 'first' ? [commit, unrelated] : [unrelated, commit])
  else {
    const inserted = Buffer.from('Synthetic change.\n')
    const instructions = Buffer.concat([sizeBytes(body.length), sizeBytes(body.length + inserted.length),
      Buffer.from([0x90, body.length, inserted.length]), inserted])
    head = objectId('commit', Buffer.concat([body, inserted]))
    writeTestPack(directory, [commit, unrelated, { type: delta, body: instructions, id: head, base: delta === 6 ? 0 : commit.id }])
  }
  writeFileSync(join(directory, '.git', 'refs', 'heads', 'main'), head + '\n')
  writeFileSync(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  if (execFileSync('git', ['-C', directory, 'cat-file', '-t', 'HEAD'], { encoding: 'utf8' }).trim() !== 'commit') {
    throw new Error('The made-up repository does not have a readable Git commit at HEAD')
  }
  const objects = join(directory, '.git', 'objects')
  return { directory, objects, head, packBytes: statSync(join(objects, 'pack', 'fixture.pack')).size }
}
