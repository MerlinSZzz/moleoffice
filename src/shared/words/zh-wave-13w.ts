// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave13w } from './en-wave-13w.ts'

export const zhWave13w = {
  "w13w.claimsPage.title": "认领的工作",
  "w13w.keyQuestion.changed.noPictures": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在没有图片。",
  "w13w.keyQuestion.changed.noPicturesAndWords": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在没有图片，文字也已更改。",
  "w13w.keyQuestion.changed.otherPictures": {"other": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在有 {n} 张不同的图片。"},
  "w13w.keyQuestion.changed.otherPicturesAndWords": {"other": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在有 {n} 张不同的图片，文字也已更改。"},
  "w13w.keyQuestion.changed.pictures": {"other": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在有 {n} 张图片。"},
  "w13w.keyQuestion.changed.picturesAndWords": {"other": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中现在有 {n} 张图片，文字也已更改。"},
  "w13w.keyQuestion.changed.words": "提出此问题后消息发生了变化，因此没有发送任何内容。输入框中的文字现已更改。",
} as const satisfies { readonly [K in keyof typeof enWave13w]?: (typeof enWave13w)[K] extends string ? string : { other: string } }
