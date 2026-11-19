// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13x's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
export const enWave13x = {
  // Round 22, problem 6yMD5gal_oXz: the comment box while a review is collecting what the comment is about (TalkBox.tsx).
  'talk.addToReview': 'Add to review',
  'talk.addToReview.title': 'Keep this comment in the review that is collecting here. Nothing is sent until you send the review.',
  'talk.sendNow': 'Send now, outside the review',
  'talk.sendNow.title': 'Send this comment now, on its own. It does not go into the review.',
  'talk.stillReadingTheReviews': 'Mole Office is still reading whether a review is collecting here.',
  'talk.reviewsNotRead': 'Mole Office could not say whether a review is collecting here, so Send sends at once',
  'talk.state.addedToTheReview': 'This comment is in your review. Nothing has been sent.',
  'talk.state.noReviewHoldsIt': 'This comment is kept and not sent. Mole Office says no review holds it.',
  'talk.state.holdingNotRead': 'This comment is kept and not sent, and Mole Office could not say which review holds it',
  // Round 23: the question asked on leaving a page, when the read made at that moment failed
  // (LeaveQuestion in ReviewBar.tsx).
  'review.leave.unread.title': "Mole Office could not read whether this page's review holds comments not sent",
  'review.leave.anyway': 'Leave anyway',
  // Round 24: a press of Send in the review column found the review changed since it was drawn,
  // so it sent nothing (YourReview in ReviewBar.tsx).
  'review.b.changedAtSend': 'Nothing was sent. This review changed somewhere else after it was shown here. It is shown again below as it is now.',
  // The office's own reason for a step somebody did by hand is drawn in the reader's language beside
  // the other fixed step sentences (FlowRunSteps.tsx).
  'flowRunSteps.doneByHandWhy': 'A person did this in the office themself, not a program.',
  // The first language round: the language panel's line about words still in English, and the word check's
  // waiting section, which now names the language it is about (LanguagePanel.tsx, WordCheckPanel.tsx).
  'settings.language.waiting': { one: '{n} word is still in English.', other: '{n} words are still in English.' },
  'settings.words.waiting.for': 'Waiting for {language}',
  'settings.words.waiting.countFor': { one: '{n} word waits for a translation in {language}.', other: '{n} words wait for a translation in {language}.' },
  'settings.words.waiting.noneFor': 'No word waits for a translation in {language}.',
  'settings.words.waiting.removedFor': { one: '{n} translated word was taken out. A test refuses that.', other: '{n} translated words were taken out. A test refuses that.' },
} as const
