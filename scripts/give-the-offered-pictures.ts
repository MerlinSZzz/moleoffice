// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GIVE EVERY REGISTERED AGENT STILL ON THE DRAWING THE PICTURE IT IS OFFERED. Run once.
 *
 *   npx tsx scripts/give-the-offered-pictures.ts            # say what it would do
 *   npx tsx scripts/give-the-offered-pictures.ts --do-it    # do it
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A SCRIPT AND NOT A MIGRATION
 * ---------------------------------------------------------------------------------------
 *
 * The owner settled on 4 September 2026 (decision `HnoPsajfgR0A` on proposal `1V9UWM8nrBTD`) that an
 * agent which chose no picture when it registered takes the one it is offered, nobody asked. The
 * door does that from now on, at the moment a registry row is written. This is the same act for the
 * rows that were written before it — the agents already in this installation that are still drawing
 * the pattern Mole Office makes from their id.
 *
 * A MIGRATION MAY NOT DO IT. Storing a picture writes a file beside the database as well as a row,
 * and a migration that wrote files could not be replayed onto a restored copy without writing them
 * again. `drizzle/` is schema; this is one act on the rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It touches only rows whose `avatar_asset_id` is still exactly the id Mole Office draws from the
 * participant. That was the original test this command used for "nobody has ever chosen one".
 * The picker also recognises a proved drawing made from an earlier id, because a decision re-mints ids and carries
 * their pictures over. This command keeps its original filter.
 * An agent somebody gave a picture is left alone, running it twice changes nothing the second time,
 * and what Mole Office drew is never deleted.
 *
 * IT SAYS WHAT IT DID, one line per agent, and it says nothing was found rather than printing
 * nothing at all.
 */

import { sqlite } from '../src/server/db/client.ts'
import { avatarsOnOffer, avatarOfferedTo, giveTheOfferedPicture } from '../src/server/lib/avatars.ts'
import { defaultAvatarAssetId, moleOffice, theMoleOfficeTest, type ParticipantRef } from '../src/shared/participants.ts'

const doIt = process.argv.includes('--do-it')

const rows = sqlite.prepare('SELECT id, name, avatar_asset_id FROM agents ORDER BY id').all() as {
  id: string
  name: string
  avatar_asset_id: string
}[]

const onOffer = avatarsOnOffer()
if (onOffer.length === 0) {
  console.log('This checkout offers no pictures at all, so there is nothing to give. Nothing was written.')
  process.exit(0)
}

function giveThePicturesInThisPass(): number {
  let given = 0
  const officeTest = theMoleOfficeTest()
  for (const row of rows) {
    const who: ParticipantRef = { kind: 'agent', id: row.id }
    if (row.avatar_asset_id !== defaultAvatarAssetId(who)) continue
    const offered = avatarOfferedTo(who, row.avatar_asset_id, onOffer, officeTest)
    if (offered === null) continue
    given += 1
    if (!doIt) {
      console.log(`would give ${row.id} (${row.name}) the picture ${offered.set}/${offered.name}`)
      continue
    }
    const stored = giveTheOfferedPicture(who, row.avatar_asset_id, moleOffice())
    if (stored === null) {
      console.log(`nothing was offered to ${row.id}, so nothing was written for it`)
      continue
    }
    sqlite.prepare('UPDATE agents SET avatar_asset_id = ? WHERE id = ?').run(stored, row.id)
    console.log(`gave ${row.id} (${row.name}) the picture ${offered.set}/${offered.name}, asset ${stored}`)
  }
  return given
}
const given = giveThePicturesInThisPass()

if (given === 0) {
  console.log('Every registered agent has a picture somebody chose. Nothing was written.')
} else if (!doIt) {
  console.log(`\n${String(given)} agents are still drawing the pattern. Run again with --do-it to give them theirs.`)
} else {
  console.log(`\n${String(given)} agents were given the picture they were offered.`)
}
