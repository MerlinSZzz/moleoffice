// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// If words/en.ts imports from kinds.ts, the cycle is en.ts -> kinds.ts -> participants.ts ->
// i18n.ts -> en.ts. Importing from restriction.ts would cycle through states.ts and words.ts to
// i18n.ts and back to en.ts. Keep this shared file free of imports.

export const INCOMPLETE_FIELD_SENTENCE = '{field} is not filled in, so this {kind} is incomplete.'
export const RESTRICTION_EMPTY_NOTE = 'No placeholder or fallback was found that limits this record.'
