// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LINKING BY A TYPED NAME: `linkByTitle`. It was moved whole out of src/server/lib/records.ts, with
 * no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands this name on with `export *`, and every caller still imports
 * `linkByTitle` from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. `createLink` and `RevalidationWritten` are taken from
 * records.ts, which hands them on from records/links.ts; `liveRecordByTitle` and `Actor` come from
 * records.ts itself. All four are read only inside `linkByTitle`, so nothing of records.ts is read
 * while this file is being evaluated. `Actor` and `RevalidationWritten` are type-only imports,
 * which the compiler erases.
 */
import type { LinkType, PanelRecord } from '@shared/types.ts'
import type { Gate } from '@shared/work.ts'
import type { AMessageReader } from '../messages.ts'
import { createLink, liveRecordByTitle, type Actor, type RevalidationWritten } from '../records.ts'

/**
 * Link by typing a name. Creates nothing implicitly -- an unknown name is an error, not a guess.
 *
 * TWO REFUSALS, BECAUSE THERE ARE TWO WAYS A TYPED NAME CAN FAIL and they need different answers.
 *
 * 404 — nothing goes by that name. The caller misspelt it, or the record was never written.
 *
 * 409 — the name belongs to a record that has been soft-deleted. Until 2026-08-10 this was a 201:
 * `getRecordByTitle` returns deleted rows (see its comment for why it must), so the link was made,
 * stored, and drawn as broken the instant it existed. The caller was told it had worked. This
 * product never truly deletes, so a deleted title stays in the table for ever and that success
 * reply could be given for ever.
 *
 * The refusal names the record rather than pretending the name is unknown, because the two facts
 * lead somewhere different: a misspelling is fixed by typing again, and a deleted record is fixed
 * by restoring it or by deciding you really did mean the deleted one. The reader typed a name they
 * believed in, and "no such record" would be false — it is right there, deleted.
 *
 * LINKING BY ID TO A DELETED RECORD IS STILL ALLOWED, deliberately, and the message says so. A task
 * that consumes a claim which was later retracted is a real thing to record, `resolveLinks` draws
 * it as broken on both ends, and `unmetDependencies` exists to list exactly those. An id is exact:
 * whoever sends one has already seen which record it is. A name is a belief, and this is the only
 * place that can check the belief before acting on it.
 *
 * BOTH REFUSALS ARE `liveRecordByTitle` NOW, which is where they belong: the create that carries
 * its links needs the same two answers, and the second copy of a rule is how the two spellings of
 * it drift. All this passes is the one sentence that differs — the request that would name the
 * deleted record by id, which is different at every caller.
 */
export function linkByTitle(
  fromId: string,
  title: string,
  type: LinkType,
  actor: Actor,
  /**
   * The project the name is typed in. Required, and it is the whole of the "never infer a workspace
   * from a title" rule: this used to default, so a name typed inside one project resolved in
   * another. Measured — with a module called "Tray clamp" in two workspaces, linking from a
   * greenhouse record to "Tray clamp" reached the Mole Office one and replied "now relates to Tray
   * clamp".
   */
  workspaceId: string,
  gate?: Gate,
  /**
   * Who is asking, handed to `liveRecordByTitle`, which does not count a message this reader may not
   * read among the records of that name.
   */
  reader?: AMessageReader,
): { id: string; to: PanelRecord; revalidation?: RevalidationWritten; nothingWritten?: string } {
  const target = liveRecordByTitle(
    title,
    (deleted) => `POST /api/links {"fromId":"${fromId}","toId":"${deleted.id}","type":"${type}"}.`,
    workspaceId,
    reader,
  )
  const link = createLink({ fromId, toId: target.id, type, actor, ...(gate === undefined ? {} : { gate }) })
  // THE RECORD THE NAME REALLY MEANT COMES BACK WITH THE LINK, and that is not a convenience. Both
  // callers used to answer the request by resolving the SAME NAME A SECOND TIME, to say which
  // record had been linked — one fact worked out twice, in two functions, with nothing making them
  // agree. Now that titles may repeat there is a real answer to give and only this function has it.
  return { id: link.id, to: target, ...(link.revalidation === undefined ? {} : { revalidation: link.revalidation }), ...(link.nothingWritten === undefined ? {} : { nothingWritten: link.nothingWritten }) }
}
