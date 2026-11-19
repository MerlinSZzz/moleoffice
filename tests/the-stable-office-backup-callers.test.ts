// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_ENDINGS = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.mts', '.cts']
const ALLOWED = [
  'scripts/backup.ts',
  // The backup door backs up the database its server opened, and the server's client asked the guard before it opened it.
  'src/server/api/backups.ts',
  // The door's backup thread takes the backup the door hands it, with the database the door's server opened as the source.
  'src/server/lib/backup-thread.ts',
  'src/server/lib/the-update.ts',
  // The bootstrap's verified-sanitized-backup step. The stable upgrade takes no sanitized backup, so it is not here.
  'tools/stable/stable-bootstrap-execution.mjs',
].sort()

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesIn(join(folder, entry.name))
    : [join(folder, entry.name)])
}

it('keeps every caller of the deliberately unguarded backup library known', () => {
  const callers = ['src', 'tools', 'scripts'].flatMap(folder => filesIn(join(ROOT, folder)))
    .filter(file => SOURCE_ENDINGS.some(ending => file.endsWith(ending)))
    .filter(file => /\btakeTheBackup\b/.test(readFileSync(file, 'utf8')))
    .map(file => relative(ROOT, file))
    .filter(file => file !== 'src/server/lib/backup.ts')
    .sort()
  const added = callers.filter(file => !ALLOWED.includes(file))
  expect(callers, `${added.join(', ') || 'The caller inventory changed'}: the database guard must be checked for each new caller of takeTheBackup. Read source endings: ${SOURCE_ENDINGS.join(', ')}.`).toEqual(ALLOWED)
})
