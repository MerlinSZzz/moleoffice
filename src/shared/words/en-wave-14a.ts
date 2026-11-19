// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 14a's new words, in English only. Its Chinese is written in
// src/shared/words/zh-wave-14a.ts by this line's own round, because every page has both languages.
export const enWave14a = {
  // THE TWO ITEM STYLES AND THE OWNER'S OWN WORDS: the special
  // left box of an item that needs evidence or a passage, the picker's words box, and the written response drawn under
  // the item, from a message. ChecklistsPage.tsx, ChecklistParts.tsx
  // and ChecklistsWindow.tsx read them.
  'checklists.doneWithEvidenceOrWords': 'Mark done with evidence or words: {words}',
  'checklists.doneWithEvidenceOrWordsTitle': 'Mark done with evidence or words',
  'checklists.picker.yourWords': 'Your own words (optional)',
  'checklists.picker.chooseOrWrite': 'Choose evidence or write a few words first.',
  'checklists.response': 'Written response: {words}',
  // THE CHECKLIST DOORS' THREE REFUSALS OF THE OWNER'S OWN WORDS (backend run te3Mh6v0EUgl, codes declared in
  // src/shared/refusal-codes.ts). These are the page sentences for the doors' refusal codes.
  'server.checklistOwnWordsNotTheOwner':
    'Only the owner of this checklist writes their own words on an item, and only with the press that marks it done.',
  'server.checklistOwnWordsNeedTheDonePress':
    'The written response goes with the press that marks the item done. Mark it done in the same change.',
  'server.checklistOwnWordsNeedTheVersion':
    'The written response goes with the version of the checklist you read. Read it again and send that version with it.',
} as const
