// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FieldsOfALine } from '../kinds.ts'

/**
 * THE FIELDS THE LINE 13s ADDS TO THE REPORT KIND: the files part of what a report is about, and what no page fits. The
 * head comment of src/shared/kinds.ts says how this file is joined to the kind's own fields. The records part stays the
 * report's `about` links. A run's finish holds a report it filed with no `about` link to a page and nothing in
 * nothingFits (src/server/lib/before-the-seal-rules.ts).
 */
export const reportWave13s: FieldsOfALine = {
  kind: 'report',
  fields: [
    {
      key: 'aboutFiles',
      type: 'string[]',
      required: false,
      description:
        'WHAT THIS REPORT IS ABOUT, THE FILES PART: repository paths, each a file, a folder or a pattern. The pages it ' +
        'is about are its about links. Absent means the report names no file.',
      example: ['src/server/lib/governs.ts'],
    },
    {
      key: 'nothingFits',
      type: 'NothingFits[]',
      required: false,
      description:
        'WHAT NO PAGE FITS: each entry names the kind of page that is missing, a few words, and the nearest live page ' +
        'where there is one. A report linked about no page sends one entry here.',
      example: [{ missing: 'module', what: 'the printer profiles', nearest: 'kYp1Ds8WmQ2z' }],
    },
  ],
}
