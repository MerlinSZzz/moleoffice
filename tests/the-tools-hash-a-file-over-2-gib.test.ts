// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Node will not read a file over 2 GiB whole: readFileSync throws ERR_FS_FILE_TOO_LARGE. An office database and its
 * backup can be larger than that, and the move, the bootstrap and the upgrade hashed them whole. Each file here is
 * sparse: its size is past 2^31 bytes, only a few bytes in it are written, and it costs no disk. Each digest is
 * compared with the digest a stream reads, the way the bootstrap already hashed a file.
 * A pass over 2 GiB of unwritten bytes took about 0.65 s on this machine on 20 October 2026, so each test over 2 GiB
 * names its own budget instead of the runner's five seconds.
 */
import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, ftruncateSync, mkdtempSync, openSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { hashFile } from '../tools/stable/data-folder-move-files.mjs'
import { theExclusiveLockGuard } from '../tools/database-holders.mjs'

const PAST_2_GIB = 2 ** 31 + 4096
const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

/** Writes a few bytes past 2^31 and makes the file PAST_2_GIB long, writing nothing between. */
function makeItSparse(file: string) {
  const fd = openSync(file, 'r+')
  try { writeSync(fd, 'bytes written past 2 GiB', 2 ** 31 + 100); ftruncateSync(fd, PAST_2_GIB) } finally { closeSync(fd) }
  const stat = statSync(file)
  expect(stat.size).toBe(PAST_2_GIB)
  expect(stat.blocks * 512, 'the file must be sparse, so the test costs no disk').toBeLessThan(1024 * 1024)
}
async function streamedHash(file: string, encoding: 'base64' | 'hex') {
  const digest = createHash('sha256')
  for await (const piece of createReadStream(file)) digest.update(piece)
  return digest.digest(encoding)
}

it('hashes a file over 2 GiB to the base64 digest a stream reads', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'hash-past-2-gib-')); folders.push(folder)
  const file = join(folder, 'sparse.bin')
  writeFileSync(file, 'bytes written at the start'); makeItSparse(file)
  expect(hashFile(file)).toBe(await streamedHash(file, 'base64'))
}, 60_000)

// The move also hashes its env file, a small one, with 'hex'. A small file shows that hashFile passes the encoding on;
// a hex digest past 2 GiB is the lock guard's case below.
it("hashes a small file to the hex digest a stream reads when it is asked for 'hex'", async () => {
  const folder = mkdtempSync(join(tmpdir(), 'hash-hex-')); folders.push(folder)
  const file = join(folder, 'small.bin')
  writeFileSync(file, 'bytes written for the hex digest')
  expect(hashFile(file, 'hex')).toBe(await streamedHash(file, 'hex'))
})

// The lock guard observes the database before and after the lock. The move, the bootstrap and the upgrade call it
// after the office has stopped, so a throw there leaves the office down.
it('takes the lock on a database over 2 GiB and observes the whole file before and after', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'lock-past-2-gib-')); folders.push(folder)
  const database = join(folder, 'made-up.db'), db = new Database(database)
  db.exec("CREATE TABLE made_up (value TEXT); INSERT INTO made_up VALUES ('made up for this test')"); db.close()
  makeItSparse(database)
  const guard = await theExclusiveLockGuard(database), digest = await streamedHash(database, 'hex')
  expect(guard.taken, JSON.stringify(guard)).toBe(true)
  expect(guard.before).toMatchObject({ sha256: digest, size: PAST_2_GIB })
  expect(guard.after).toMatchObject({ sha256: digest, size: PAST_2_GIB })
}, 60_000)
