// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SMALL WRITER, standing in for the live server while a landing migrates its database.
 *
 * It opens the file it is given in WAL mode with better-sqlite3's own busy timeout, as src/server/db/client.ts does,
 * and writes one note record every `everyMs` milliseconds until it is told to stop on stdin. It prints `ready` once
 * it has written its first row, and on stop prints `{"wrote":n,"failed":n}` and exits. A failed write is counted,
 * never retried, so a write the landing made fail is seen. It is one process at one row every few milliseconds:
 * no made load on the machine.
 */
import Database from 'better-sqlite3'

const [file, owner, everyMs] = process.argv.slice(2)
const db = new Database(file)
db.pragma('journal_mode = WAL')
const insert = db.prepare(
  'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
    "VALUES (?, 'default', ?, '2026-10-10 20:00:00', '2026-10-10 20:00:00', 'note', 'written while landing', null, '{}')",
)
let wrote = 0
let failed = 0
let stopped = false
process.stdin.on('data', () => {
  stopped = true
  process.stdout.write(`${JSON.stringify({ wrote, failed })}\n`, () => process.exit(0))
})
const tick = () => {
  if (stopped) return
  try {
    insert.run(`keptwriting${String(wrote).padStart(6, '0')}`, owner)
    wrote++
    if (wrote === 1) process.stdout.write('ready\n')
  } catch {
    failed++
  }
  setTimeout(tick, Number(everyMs))
}
tick()
