// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE GATE-COUNT SPOOL IS AND HOW IT IS HANDED TO A NEW WORLD, said in one place for the tools that move or
 * restore the database (wave 13q item 1h).
 *
 * The spool belongs to one world, and a world is the database file's path and creation time
 * (src/config/database-identity.mjs). A data-folder move changes the path, and the stable upgrade's recovery renames a
 * new file over the database, so the office then has a new world and counts nothing from the spool until the person
 * hands it over. A restore from a backup gives a new world only when it makes a new file, so its words say when.
 *
 * It only says. It never reads, makes or removes the spool or its `.world`: which world owns the spool is the office's
 * to read (src/server/lib/gate-count-spool.ts), and a tool that read it would be guessing for an office it is not. The
 * folder is worked out from the home the office runs with, which is not always this tool's.
 */
import { databaseIdentity } from '../../src/config/database-identity.mjs'
import { GATE_COUNT_SPOOL, theGateCountSpoolFolder } from '../../src/config/gate-count-spool.mjs'
import { UNKNOWN } from '../../src/config/world-header.mjs'
import { SURFACES } from '../../src/shared/surfaces.ts'
import { enWave13q as words } from '../../src/shared/words/en-wave-13q.ts'
import { enWave13r } from '../../src/shared/words/en-wave-13r.ts'

/** Each change's first sentence, its world, and its reason. A backup's words are read before any restore, so they give the world as it was. */
const CHANGES = Object.freeze({
  moved: ['w13q.spool.moved', 'w13q.spool.world', 'w13q.spool.movedWhy'],
  restored: ['w13q.spool.restored', 'w13q.spool.world', 'w13q.spool.restoredWhy'],
  'restore-later': ['w13q.spool.restoreLater', 'w13q.spool.worldWhenTaken', 'w13q.spool.restoreLaterWhy'],
})

/** One pass, so a value that holds a brace is never filled again; a name with no value is refused. */
function fill(word, values) {
  return words[word].replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`The words ${word} name {${name}}, and nothing fills it.`)
    return String(values[name])
  })
}

/**
 * What the person needs after `change` put the office's database at `database`: the spool's folder, and the words.
 * `home` is the home of the office that will read the spool.
 * @param {{database: string, home: string, change: keyof typeof CHANGES}} step
 * @returns {{folder: string, says: string}}
 */
export function theGateCountSpoolStep({ database, home, change }) {
  if (!Object.hasOwn(CHANGES, change)) throw new Error(`No words say how the gate-count spool is handed over after "${change}".`)
  const folder = theGateCountSpoolFolder(home)
  const world = databaseIdentity(database)
  if (world.id === UNKNOWN) return { folder, says: fill('w13q.spool.noWorld', { database, how: world.how }) }
  const [what, whichWorld, why] = CHANGES[change]
  const values = { database, folder, id: world.id, how: world.how, worldFile: GATE_COUNT_SPOOL.world, rejects: GATE_COUNT_SPOOL.rejects,
    press: enWave13r['gates.spool.give'], panel: enWave13r['gates.title'], page: SURFACES['rail.settings'] }
  return { folder, says: [what, whichWorld, why, 'w13q.spool.owner', 'w13q.spool.press', 'w13q.spool.byHand'].map(word => fill(word, values)).join(' ') }
}
