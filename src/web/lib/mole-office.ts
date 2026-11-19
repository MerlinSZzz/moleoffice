// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ID THIS PAGE READS BEFORE IT DRAWS.
 * The existing participant door resolves its reserved handle to its live row and refuses an
 * ambiguous id/handle. main.tsx supplies that request alongside the page-word and sidebar reads.
 * Failure uses the existing startup failure. An open page keeps this answer until it reloads;
 * the running server's reader independently asks its database on every use.
 */
import { MOLE_OFFICE_HANDLE, readMoleOfficeIdWith } from '@shared/participants.ts'

/** Only the registry facts this bootstrap needs, from the existing participant reply. */
type OfficeReply = { participant: { id: string; handle: string; retired?: boolean } }

/** Read through the supplied transport, so the browser and its criterion execute the same code. */
export async function loadMoleOfficeId(request: () => Promise<OfficeReply>): Promise<void> {
  const { participant } = await request()
  if (participant === undefined || typeof participant.id !== 'string' || participant.id === '' ||
      participant.handle !== MOLE_OFFICE_HANDLE || participant.retired === true) {
    throw new Error('Mole Office could not read its own live registry row. The page cannot start without its id.')
  }
  readMoleOfficeIdWith(() => participant.id)
}
