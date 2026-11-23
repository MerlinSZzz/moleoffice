// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { commonFields, type FieldSpec, type KindSpec } from './kind-common.ts'

export const PACK_KIND = 'pack'

function field(key: string, type: string, required: boolean, description: string, example: unknown): FieldSpec {
  return { key, type, required, description, example }
}

export const packKind: KindSpec = {
  kind: PACK_KIND,
  purpose: 'One checked pack file, with its fingerprint and the records of the packs it follows.',
  whenToRecord: 'The office files this record after it has made and checked a pack.',
  humanOnly: false,
  fields: [
    field('packType', "'whole' | 'changes'", true, 'Whether this pack is whole or holds changes.', 'whole'),
    field('fileName', 'string', true, 'The name of the pack file.', 'mole-office-pack-20260101-010000-whole.zip'),
    field('folder', 'string', true, 'The folder holding the pack.', 'backups'),
    field('fileBytes', 'number', true, 'The number of bytes in the pack.', 12),
    field('fileSha256', 'string', true, 'The sha256 of the pack file.', 'a'.repeat(64)),
    field('manifestSha256', 'string', true, 'The sha256 of the manifest bytes.', 'b'.repeat(64)),
    field('previous', 'Record<string, unknown> | null', true, 'The name and fingerprint of the previous pack, or null.', null),
    field('base', 'Record<string, unknown> | null', true, 'The name and fingerprint of the whole pack, or null.', null),
    field('previousPack', 'string', false, 'The record of the pack immediately before this one.', 'example'),
    field('basePack', 'string', false, 'The record of the whole pack this chain starts with.', 'example'),
    field('counts', 'Record<string, unknown>', true, 'The counts reported when the pack was made.', { exportFiles: 1 }),
    field('madeAt', 'string', true, 'When the pack was made, in local time.', '2026-01-01 01:00:00'),
    field('notes', 'string[]', true, 'The notes reported when the pack was made.', []),
    ...commonFields(PACK_KIND),
  ],
  rules: ['Only the pack filing function writes this kind.'],
  example: { packType: 'whole', fileName: 'mole-office-pack-20260101-010000-whole.zip', folder: 'backups', fileBytes: 12, fileSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), previous: null, base: null, counts: { exportFiles: 1 }, madeAt: '2026-01-01 01:00:00', notes: [] },
}
