// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FieldsOfALine } from '../kinds.ts'

/**
 * THE FIELDS THE LINE 13s ADDS TO THE DECISION KIND: the files part of what a decision governs, and what no page fits.
 * The head comment of src/shared/kinds.ts says how this file is joined to the kind's own fields. The records part stays
 * `governs`. The doors' checks on the three are in src/server/lib/what-a-record-names.ts.
 */
export const decisionWave13s: FieldsOfALine = {
  kind: 'decision',
  fields: [
    {
      key: 'governsFiles',
      type: 'string[]',
      required: false,
      half: 'notes',
      description:
        'WHAT THIS DECISION GOVERNS, THE FILES PART: repository paths, each a file, a folder or a pattern with * or **. ' +
        'GET /api/decisions/governing?path=<file> finds a decision by these as well as by the modules named in governs. ' +
        'Absent means the decision names no file.',
      example: ['src/web/pages/GovernancePage.tsx'],
    },
    {
      key: 'nothingFits',
      type: 'NothingFits[]',
      required: false,
      half: 'notes',
      description:
        'WHAT NO PAGE FITS: each entry names the kind of page that is missing, a few words, and the nearest live page ' +
        'where there is one. A decision that names no page and not the whole project sends one entry here. A new entry ' +
        'reminds the nearest page\'s owner at once, or the module reminder secretary.',
      example: [{ missing: 'module', what: 'the printer profiles', nearest: 'kYp1Ds8WmQ2z' }],
    },
  ],
}
