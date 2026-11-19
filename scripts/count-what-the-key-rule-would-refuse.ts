// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY STORED RECORDS THE KEY RULE WOULD REFUSE, BY KIND, FIELD AND SHAPE, ON A COPY OF A DATABASE (wave 13w round 4).
 *
 *   npx tsx scripts/count-what-the-key-rule-would-refuse.ts <a copy of the database>
 *
 * The message door refuses a message whose words hold something of a key's shape (src/shared/message-keys.ts). Before
 * the same rule could judge another kind, somebody has to know how often it would refuse words already stored there:
 * a report may hold a file's full hash, a test result a long code name. This counts that, and changes nothing.
 *
 * IT READS A COPY AND NEVER THE LIVE DATABASE. A path that resolves to the database this checkout's settings name
 * (`databasePathFrom` in src/config/settings.mjs) is refused, and the copy is opened read-only, so nothing is written to
 * it either.
 *
 * IT NEVER PRINTS A RECORD'S TEXT, TITLE OR ID. A line is a count, a kind, a field's name, a shape, the class of the
 * characters in the piece and a length band. A field is `title`, `summary` or `data.<the key a kind declares>`, and
 * every string inside that key is asked, at any depth.
 *
 * WHAT IT ASKS IS WHAT THE DOOR ASKS: `whatLooksLikeASecret`, with an existing record's id let through as the door lets
 * it through, read from the copy. For messages it also counts by the door's own list of a message's words
 * (`theWordsOfAMessage`), without its two exemptions that need more than the copy: a line the office's own code wrote,
 * and a quote of words stored in the record it quotes. So the message count is an upper bound.
 */

import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { realpathSync } from 'node:fs'
import Database from 'better-sqlite3'

import { databasePathFrom } from '../src/config/settings.mjs'
import { AN_ID_THAT_IS_NOT_A_KEY_SQL, theRecordIdAtTheFront, theWordsOfAMessage, whereAMessageHoldsAKey } from '../src/shared/message-keys.ts'
import { whatLooksLikeASecret, type ASecretSeen } from '../src/shared/terminals.ts'

const given = process.argv[2]
if (given === undefined) {
  console.error('Name a copy of the database: npx tsx scripts/count-what-the-key-rule-would-refuse.ts <copy>. Nothing was read.')
  process.exit(2)
}
const copy = realpathSync(given)
const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(copy)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
let live: string | null = null
try {
  live = realpathSync(databasePathFrom(process.env))
} catch {
  live = null
}
if (copy === live) {
  console.error('That is the live database. Give this a copy of it. Nothing was read.')
  process.exit(2)
}

const db = new Database(copy, { readonly: true, fileMustExist: true })
const anId = db.prepare(AN_ID_THAT_IS_NOT_A_KEY_SQL)
const isARecordId = (piece: string): boolean => {
  const id = theRecordIdAtTheFront(piece)
  return id !== undefined && anId.get({ id }) !== undefined
}

/** The class of a piece's characters, never the piece. */
const classOf = (p: string): string =>
  /^[0-9a-f]{64}$/.test(p) ? '64 hex'
    : /^[0-9a-f]+$/.test(p) ? 'hex'
      : p.includes('.') ? 'has a dot'
        : p.includes(':') ? 'has a colon'
          : /[^A-Za-z0-9_]/.test(p) ? 'other punctuation'
            : !/[0-9]/.test(p) ? 'letters only'
              : 'letters and digits'
const lengthOf = (n: number): string => (n < 32 ? 'under 32' : n < 40 ? '32 to 39' : n < 64 ? '40 to 63' : '64 or more')

/** The first key-shaped piece in any string at any depth of a value, or null. */
function firstSeenIn(value: unknown): ASecretSeen | null {
  if (typeof value === 'string') return whatLooksLikeASecret(value, isARecordId)
  if (Array.isArray(value)) {
    for (const one of value) {
      const seen = firstSeenIn(one)
      if (seen !== null) return seen
    }
    return null
  }
  if (typeof value === 'object' && value !== null) return firstSeenIn(Object.values(value))
  return null
}

const rows = new Map<string, number>()
const records = new Map<string, { all: number; refused: number }>()
const count = (line: string): void => {
  rows.set(line, (rows.get(line) ?? 0) + 1)
}
let messagesByTheDoor = 0
let unread = 0

for (const row of db.prepare('SELECT kind, title, summary, data FROM records WHERE deleted_at IS NULL').iterate() as Iterable<{ kind: string; title: string | null; summary: string | null; data: string | null }>) {
  const tally = records.get(row.kind) ?? { all: 0, refused: 0 }
  records.set(row.kind, tally)
  tally.all += 1
  let data: unknown
  try {
    data = JSON.parse(row.data ?? 'null')
  } catch {
    unread += 1
    continue
  }
  const fields: Array<[string, unknown]> = [['title', row.title], ['summary', row.summary]]
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) fields.push([`data.${key}`, value])
  }
  let any = false
  for (const [field, value] of fields) {
    const seen = firstSeenIn(value)
    if (seen === null) continue
    any = true
    count([row.kind, field, seen.shape, classOf(seen.piece), lengthOf(seen.piece.length)].join(' | '))
  }
  if (any) tally.refused += 1
  if (row.kind === 'message' && whereAMessageHoldsAKey(theWordsOfAMessage({ title: row.title, summary: row.summary, data }), isARecordId) !== null) {
    messagesByTheDoor += 1
  }
}

console.log('RECORDS, BY KIND: kind | stored | with at least one field the rule would refuse')
for (const [kind, tally] of [...records].sort((a, b) => b[1].refused - a[1].refused || a[0].localeCompare(b[0]))) {
  console.log(`${kind} | ${tally.all} | ${tally.refused}`)
}
console.log('')
console.log('FIELDS: count | kind | field | shape | character class | length')
for (const [line, n] of [...rows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`${n} | ${line}`)
console.log('')
console.log(`MESSAGES THE MESSAGE DOOR WOULD REFUSE, by its own list of a message's words (an upper bound): ${messagesByTheDoor}`)
if (unread > 0) console.error(`${unread} stored records had data that could not be read, and are in no count above.`)
db.close()
