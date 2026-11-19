// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave13x } from './en-wave-13x.ts'

export const zhWave13x = {
  "flowRunSteps.doneByHandWhy": "这一步是有人在办公室里亲手做的，不是程序做的。",
  "review.b.changedAtSend": "没有发送任何内容。这次评审在本页显示后已在别处更改。下面重新显示的是当前内容。",
  "review.leave.anyway": "仍然离开",
  "review.leave.unread.title": "Mole Office 无法读取本页评审中是否有未发送的评论",
  "talk.addToReview": "加入评审",
  "talk.addToReview.title": "把这条评论留在此处收集内容的评审中。发送评审前，不会发送任何内容。",
  "talk.reviewsNotRead": "Mole Office 无法确定此处是否有评审正在收集内容，因此按“发送”会立即发送",
  "talk.sendNow": "立即单独发送，不加入评审",
  "talk.sendNow.title": "现在单独发送这条评论，不加入评审。",
  "talk.state.addedToTheReview": "这条评论已加入你的评审，尚未发送任何内容。",
  "talk.state.holdingNotRead": "这条评论已保留、未发送，但 Mole Office 无法确定它属于哪次评审",
  "talk.state.noReviewHoldsIt": "这条评论已保留、未发送。Mole Office 表示没有评审收录它。",
  "talk.stillReadingTheReviews": "Mole Office 仍在读取此处是否有评审正在收集内容。",
  "settings.language.waiting": { other: "还有 {n} 个词仍是英文。" },
  "settings.words.waiting.countFor": { other: "有 {n} 个词在等待{language}的翻译。" },
  "settings.words.waiting.for": "等待{language}的翻译",
  "settings.words.waiting.noneFor": "{language}没有等待翻译的词。",
  "settings.words.waiting.removedFor": { other: "有 {n} 个已翻译的词被移除。测试会拒绝这种情况。" },
} as const satisfies { readonly [K in keyof typeof enWave13x]?: (typeof enWave13x)[K] extends string ? string : { other: string } }
