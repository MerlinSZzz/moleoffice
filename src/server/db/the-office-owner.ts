// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theOfficeOwner` was moved byte for byte out of src/server/lib/owner.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { readTheOfficeOwner, type OfficeOwnerRow } from './owner-setting.ts'
import { theOwnerIsKnown } from '@shared/person.ts'

/**
 * The owner, read from the database now. Throws a sentence when no row carries the mark, which only
 * a database that was never migrated by this version can be in.
 */
export function theOfficeOwner(): OfficeOwnerRow {
  const owner = readTheOfficeOwner(sqlite)
  if (owner === null) {
    throw new Error(
      `This office's database (${sqlite.name}) says nobody owns it: no person carries people.office_owner. ` +
        'The migrate writes it; run `npm run db:migrate`. Nothing was read as the owner.',
    )
  }
  theOwnerIsKnown(owner.id)
  return owner
}
