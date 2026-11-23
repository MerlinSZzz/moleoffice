// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave13n } from './en-wave-13n.ts'
import type { enWave14a } from './en-wave-14a.ts'

// The Chinese list's place for wave 14a, typed against src/shared/words/en-wave-14a.ts. It holds the new words of the two
// item styles, the checklist doors' three refusals of the owner's own words, and the Chinese for the checklist window and
// evidence picker words that had none (they live in src/shared/words/en-wave-13n.ts in English). The two refusal sentences
// the backend sent used 您; this project refuses 您 in a Chinese word, so they say 你 here and the meaning is unchanged.
//
// THE TYPE IS THE GUARD: every key of en-wave-14a.ts must be here, and a key of en-wave-13n.ts is allowed only as
// backfilled Chinese for a word that already existed.
export const zhWave14a = {
  // ---- the two item styles and the owner's own words ----
  'checklists.doneWithEvidenceOrWords': '用证据或文字标记完成：{words}',
  'checklists.doneWithEvidenceOrWordsTitle': '用证据或文字标记完成',
  'checklists.picker.yourWords': '你自己写的话（可不写）',
  'checklists.picker.chooseOrWrite': '请先选择证据，或写几句话。',
  'checklists.response': '书面回复：{words}',
  // ---- the checklist doors' refusals ----
  'server.checklistOwnWordsNotTheOwner': '只有清单的所有者才能写下自己的话，并且要在勾选完成的同一次操作里写。',
  'server.checklistOwnWordsNeedTheDonePress': '写下的回复要跟勾选完成一起提交。请在同一次修改里把它标记为完成。',
  'server.checklistOwnWordsNeedTheVersion': '写下的回复要跟读到的清单版本一起提交。请重新读取清单，并把版本号一起发送。',
  // ---- the checklist window and the evidence picker: the words that had no Chinese ----
  'checklists.fromMessage': '来自一条消息',
  'checklists.evidence.commit': '提交 {hash}',
  'checklists.evidence.report': '报告',
  'checklists.evidence.run': '运行',
  'checklists.evidence.manual': '手册章节',
  'checklists.mustBeInManual': '必须写入手册',
  'checklists.reminderOn': '提醒时间 {at}',
  'checklists.supersededBy': '已被后来的消息替换',
  'checklists.back': '全部清单',
  'checklists.none': '没有符合所选条件的清单。',
  'checklists.ownedBy': '{name}，{kind}',
  'checklists.window.press': '你的清单',
  'checklists.window.pressTitle': '你的清单：还有 {n} 项要做',
  'checklists.window.title': '我的清单',
  'checklists.window.titleOf': '{name} 的清单',
  'checklists.window.close': '关闭',
  'checklists.window.empty': '这些清单上没有事项。',
  'checklists.window.markDone': '标记完成',
  'checklists.window.save': '标记完成',
  'checklists.window.cancel': '取消',
  'checklists.window.openPage': '全部清单',
  'checklists.window.readOnly': '仅供阅读。事项只在你自己的清单上标记完成。',
  'checklists.window.showDone': '显示 {n} 项已完成',
  'checklists.window.showDoneAndReplaced': '显示 {n} 项已完成或已替换',
  'checklists.window.hideDone': '隐藏已完成的事项',
  'checklists.window.doneWith': '完成依据：',
  'checklists.windowSwitch': '在右上角显示清单窗口',
  'checklists.windowSwitchNotKept': '此浏览器不保存设置，所以右上角的清单窗口一直显示。',
  'checklists.picker.title': '选择证据，或者写下你自己的话',
  'checklists.picker.kind': '证据类型',
  'checklists.picker.commit': '已合入的提交',
  'checklists.picker.manualOnly': '这一项必须写入手册，所以只提供手册章节。',
  'checklists.picker.find': '按标题里的词搜索',
  'checklists.picker.loading': '可选项',
  'checklists.picker.none': '这个项目里还没有这种证据。',
  'checklists.picker.noneWithWords': '没有这种证据的标题包含这些词。',
  'checklists.picker.more': '显示更多（还剩 {n} 项）',
  'checklists.picker.chooseFirst': '请先从列表里选一项。',
  'checklists.window.showAll': '全部清单',
  'checklists.window.backToMine': '我的清单',
} as const satisfies {
  readonly [K in keyof typeof enWave14a]: (typeof enWave14a)[K] extends string ? string : { other: string }
} & Partial<{
  readonly [K in keyof typeof enWave13n]: (typeof enWave13n)[K] extends string ? string : { other: string }
}>
