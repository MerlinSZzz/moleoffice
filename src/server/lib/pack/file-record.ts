// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PACK_KIND } from '../../../shared/kinds/pack.ts'
import { createRecord, listRecords, type Actor } from '../records.ts'
import { asThePackFiling } from './filing-mark.ts'
import type { MadePack } from './make.ts'
import type { PackLink } from './manifest.ts'

/** File the checked pack and connect any earlier records found by fingerprint. */
export function filePackRecord(pack: MadePack, workspaceId: string, actor: Actor) {
  const records = listRecords({ workspaceId, kind: PACK_KIND })
  const notes = [...pack.notes]
  function reference(link: PackLink | null): string | undefined {
    if (link === null) return undefined
    const found = records.find((record) => record.data['manifestSha256'] === link.manifestSha256)
    if (found !== undefined) return found.id
    notes.push(`No record of ${link.name} with manifest sha256 ${link.manifestSha256} is in this office. A command may have made it. Restore reads the chain from the packs.`)
    return undefined
  }
  const previousPack = reference(pack.previous)
  const basePack = reference(pack.base)
  return asThePackFiling(() => createRecord({
    workspaceId, actor, kind: PACK_KIND, title: pack.name,
    data: { packType: pack.pack, fileName: pack.name, folder: pack.folder, fileBytes: pack.bytes, fileSha256: pack.sha256, manifestSha256: pack.fingerprint, previous: pack.previous, base: pack.base, ...(previousPack === undefined ? {} : { previousPack }), ...(basePack === undefined ? {} : { basePack }), counts: pack.counts, madeAt: pack.madeAt, notes },
  }))
}
