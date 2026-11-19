// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW RUN'S STEPS ARE DRAWN IN WORDS. Wave 13p round 26, on the secretary's answer drnyj23dzFpA: in normal mode a flow run's
 * steps are a short list, each step saying what it was, who did it, when, and how it ended, in the reader's language,
 * and never an object left to Inspect. The component is src/web/components/FlowRunSteps.tsx; the record page mounts it
 * with one line. Every record here is synthetic.
 *
 * WHAT IS HELD:
 *   · the office's own steps are drawn in the reader's language, English and Chinese, with who, how and how it ended;
 *   · a step written by hand is drawn as it was written, with its why;
 *   · a step with no actor says nobody recorded who, and one with no time says nobody recorded when;
 *   · the flow is named with its revision, and a flow run that named no flow says so;
 *   · a record that is not a flow run draws nothing, so the one mounting line costs other pages nothing;
 *   · every sentence the office writes for a step has its words, and the English words are those sentences.
 *
 * MUTATIONS (wave 13p round 26), each alone and put back:
 *   1. whatItWas draws every step as it was written (no translation) → the Chinese case red.
 *   2. whoDidIt draws the actor id instead of the name → the English case red.
 *   3. the "nobody recorded who" branch is dropped and an empty name drawn → the absent case red.
 *   4. the kind check is dropped → the other-kind case red.
 *   5. one office sentence loses its words → the every-sentence case red.
 *
 * ROUND 26c (the check LBdp2oKYuPTB found "sealed tip" and "The run finished." in English on the Chinese page):
 *   · how the office's own steps ended (a sealed tip, a landing's commit, the three ways a run ends) is drawn in the
 *     reader's language, with the commit as it was written, and a result written by hand stays as it was written.
 *   6. whatCameOfIt draws every result as it was written (no translation) → the Chinese results case red.
 *
 * ROUND 26d (the check Zkem7mjGR0Lw found the office's why for a landing by hand with no reason in English on the Chinese
 * page): that why is a fixed form, drawn in the reader's language, and a why somebody wrote stays as it was written.
 *   7. whyByHand draws every why as it was written (no translation) → the Chinese results case red.
 *
 * ROUND 27, PIECE 1b (the verdict door's English on the Chinese page): a step the verdict door refused carries a fixed
 * form with the door's status, drawn in the reader's language, and the door's own English words with its code are drawn
 * in Developer mode only.
 *   8. whatCameOfIt loses the verdict door's fixed form → both languages' refusal cases red.
 *   9. the Developer-mode test on the door's words is dropped → the normal-mode refusal case red.
 *
 * ROUND 27, PIECE 4: a run closed as superseded is a step of its own, with the later run as its result.
 *  10. whatCameOfIt loses the superseded form → the Chinese results case red (in English the raw form reads the same).
 *
 * ROUND 27, PIECE 2: no typed space after a Chinese 。 (the check found "仍未结束。 没有人记录时间。"). The two joins are
 * made by gapBetween, so English keeps its one space and Chinese has none.
 *  11. the step line's join is a typed space again → the spacing case red.
 *  12. the flow line's join is a typed space again → the spacing case red.
 *
 * WAVE 13X ROUND 1, problem 9ins56T_7GC5: the office's own why for a step somebody did by hand was written inline in
 * the server writer, so the page could not tell it from a person's words and drew it in English on a Chinese page.
 *  13. whyByHand draws the constant as it was written again → the by-hand-why case red in Chinese.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The page component asks for the office's id, and a page with no server behind it cannot read it: the
// test office's page module registers the test office's id.
import './a-page-of-a-test-office.ts'
import { FLOW_RUN_KIND, NO_FLOW_NAMED, OFFICE_STEP_DOES, OFFICE_STEP_DONE_BY_HAND_WHY, OFFICE_STEP_ENDED_RESULT, OFFICE_STEP_LANDED_COMMIT, OFFICE_STEP_LANDED_NO_REASON, OFFICE_STEP_SEALED_TIP, OFFICE_STEP_SUPERSEDED_BY, OFFICE_STEP_VERDICT_REFUSED_STATUS } from '../src/shared/flow-run.ts'
import { chineseWords, englishWords } from '../src/shared/words/joined.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { ParticipantsReply } from '../src/web/api.ts'

type StepsModule = typeof import('../src/web/components/FlowRunSteps.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Mode = typeof import('../src/web/lib/mode.ts')
let shown: StepsModule
let i18n: I18n
let mode: Mode
let en: Record<string, string>
let zh: Record<string, string>

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window ??= {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
  }
  shown = await import('../src/web/components/FlowRunSteps.tsx')
  i18n = await import('../src/shared/i18n.ts')
  mode = await import('../src/web/lib/mode.ts')
  en = (await import('../src/shared/words/en.ts')).en as unknown as Record<string, string>
  zh = (await import('../src/shared/words/zh.ts')).zh as unknown as Record<string, string>
})
afterAll(() => {
  i18n.setWordLanguage('en')
  mode.setMode('normal')
})

/** A synthetic agent the participants list names, so a step's actor is drawn by name. */
const PARTICIPANTS = {
  agents: [{ id: 'synthetic-worker-id', handle: 'synthetic-worker', name: 'Synthetic Worker', kind: 'agent' }],
  people: [],
} as unknown as ParticipantsReply

function aRecord(data: Record<string, unknown>, kind = FLOW_RUN_KIND): PanelRecord {
  return { id: 'synthetic-flow-run', kind, workspaceId: 'default', ownerId: 'nobody', title: 'Flow run', data } as unknown as PanelRecord
}

const A_FLOW_RUN = {
  run: 'synthetic-run',
  flow: 'synthetic-flow',
  flowRevision: { seq: 3, contentHash: '98c195fdafae1388' },
  stepsTaken: [
    { does: OFFICE_STEP_DOES.started, actor: { kind: 'agent', id: 'synthetic-worker-id' }, startedAt: '2026-10-05 09:00:00', endedAt: '2026-10-05 09:00:00', how: 'by an agent', outcome: 'done' },
    { does: OFFICE_STEP_DOES.sealed, actor: { kind: 'agent', id: 'mole-office/the-api-server' }, endedAt: '2026-10-05 10:00:00', how: 'by the office', outcome: 'done' },
    { does: 'Merged the branch with git by hand.', how: 'by hand', why: 'The merge queue was down.', outcome: 'still open' },
  ],
}

/**
 * The office's own steps with the results it writes, a landing by hand with the why the office writes when none was
 * given, and one step written by hand with a why and a result of its own.
 */
const WITH_RESULTS = {
  run: 'synthetic-run',
  noFlow: NO_FLOW_NAMED,
  stepsTaken: [
    { does: OFFICE_STEP_DOES.sealed, endedAt: '2026-10-05 10:00:00', how: 'by the office', outcome: 'done', result: `${OFFICE_STEP_SEALED_TIP}0123abcd` },
    { does: OFFICE_STEP_DOES.landedByHand, endedAt: '2026-10-05 10:30:00', how: 'by hand', why: 'Synthetic.', outcome: 'done', result: `${OFFICE_STEP_LANDED_COMMIT}4567ef01` },
    { does: OFFICE_STEP_DOES.landedByHand, endedAt: '2026-10-05 10:40:00', how: 'by hand', why: OFFICE_STEP_LANDED_NO_REASON, outcome: 'done', result: `${OFFICE_STEP_LANDED_COMMIT}89ab2345` },
    { does: OFFICE_STEP_DOES.superseded, endedAt: '2026-10-05 10:50:00', how: 'by an agent', outcome: 'done', result: `${OFFICE_STEP_SUPERSEDED_BY}synthetic-later` },
    { does: OFFICE_STEP_DOES.ended, endedAt: '2026-10-05 11:00:00', how: 'by the office', outcome: 'done', result: OFFICE_STEP_ENDED_RESULT.finished },
    { does: OFFICE_STEP_DOES.ended, endedAt: '2026-10-05 11:10:00', how: 'by the office', outcome: 'failed', result: OFFICE_STEP_ENDED_RESULT.crashed },
    { does: OFFICE_STEP_DOES.ended, endedAt: '2026-10-05 11:20:00', how: 'by the office', outcome: 'failed', result: OFFICE_STEP_ENDED_RESULT.orphaned },
    { does: 'Synthetic step by hand.', how: 'by hand', why: 'Synthetic why as written.', outcome: 'done', result: 'Synthetic result as written.' },
  ],
}

/** A check's answer the verdict door refused, as the office writes the step: a fixed form, and the door's words beside it. */
const A_REFUSAL = {
  run: 'synthetic-run',
  noFlow: NO_FLOW_NAMED,
  stepsTaken: [
    {
      does: OFFICE_STEP_DOES.verdictRefused, actor: { kind: 'agent', id: 'synthetic-worker-id' }, endedAt: '2026-10-05 12:00:00', how: 'by an agent',
      outcome: 'refused by the verdict door', result: `${OFFICE_STEP_VERDICT_REFUSED_STATUS}409`,
      refusal: { said: 'Synthetic refusal in the words of the door. Nothing was written.', status: 409, code: 'synthetic.code' },
    },
  ],
}

const drawn = (record: PanelRecord): string =>
  renderToStaticMarkup(h(shown.FlowRunSteps, { record, participants: PARTICIPANTS })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe("a flow run's steps on its page", () => {
  it('draws each step in English: what it was, who did it, how, how it ended and when', () => {
    i18n.setWordLanguage('en')
    const text = drawn(aRecord(A_FLOW_RUN))
    expect(text).toContain('This run followed a flow, as the flow stood at its revision 3. Open the flow')
    expect(text).toContain('The run was filed. Synthetic Worker, as an agent. Done. Ended')
    expect(text).toContain('The run said it was finished, and the office sealed its work. Mole Office, by itself. Done. Ended')
    expect(text).toContain('Merged the branch with git by hand. Nobody recorded who, by hand. Still open. Nobody recorded when. Why by hand: The merge queue was down.')
    expect(text, 'an actor id was drawn where a name was there to draw').not.toContain('synthetic-worker-id')
    expect(text).not.toContain('mole-office/the-api-server')
    expect(text).not.toContain('[object Object]')
  })

  it('draws the same in Chinese, and leaves what a person wrote as it was written', () => {
    i18n.setWordLanguage('zh')
    const text = drawn(aRecord(A_FLOW_RUN))
    expect(text).toContain('这次运行遵循一个流程，用的是该流程的第 3 版。')
    expect(text).toContain('运行已登记。 Synthetic Worker，以智能体身份完成。已完成。')
    expect(text).toContain('运行说已完成，办公室封存了它的工作。')
    expect(text).toContain('Merged the branch with git by hand. 没有人记录是谁，手动完成。仍未结束。没有人记录时间。')
    expect(text).toContain('为什么手动做：The merge queue was down.')
    expect(text, 'an office step was left in English').not.toContain('The run was filed.')
  })

  it('draws how the office\'s own steps ended and its own why in English, with the commit as it was written', () => {
    i18n.setWordLanguage('en')
    const text = drawn(aRecord(WITH_RESULTS))
    for (const line of ['Result: sealed tip 0123abcd', 'Result: commit 4567ef01', 'Result: superseded by run synthetic-later', 'The run was closed as superseded by a later run.', 'Result: The run finished.', 'Result: The run crashed.',
      'Result: The run was left with nothing running it.', 'Result: Synthetic result as written.',
      'Why by hand: Whoever recorded the landing by hand gave no reason.', 'Why by hand: Synthetic why as written.']) expect(text).toContain(line)
  })

  it('draws how the office\'s own steps ended and its own why in Chinese, and leaves a why and a result written by hand as written', () => {
    i18n.setWordLanguage('zh')
    const text = drawn(aRecord(WITH_RESULTS))
    for (const line of ['结果：封存点 0123abcd', '结果：提交 4567ef01', '结果：被运行 synthetic-later 取代', '这次运行被后来的一次运行取代而关闭。', '结果：运行完成了。', '结果：运行崩溃了。',
      '结果：运行被留下，已经没有任何程序在运行它。', '结果：Synthetic result as written.',
      '为什么手动做：手工合入的记录人没有写原因。', '为什么手动做：Synthetic why as written.']) expect(text).toContain(line)
    for (const english of ['sealed tip', 'commit 4567ef01', 'superseded', 'The run finished.', 'The run crashed.', 'nothing running it', 'gave no reason']) {
      expect(text, 'a result the office wrote was left in English').not.toContain(english)
    }
  })

  it('draws the office\'s own why for a step done by hand in the reader\'s language', () => {
    const record = aRecord({
      run: 'synthetic-run',
      noFlow: NO_FLOW_NAMED,
      stepsTaken: [{ does: 'A synthetic step somebody did in the office.', how: 'by hand', why: OFFICE_STEP_DONE_BY_HAND_WHY, outcome: 'done' }],
    })
    i18n.setWordLanguage('en')
    expect(drawn(record)).toContain(`Why by hand: ${OFFICE_STEP_DONE_BY_HAND_WHY}`)
    i18n.setWordLanguage('zh')
    const text = drawn(record)
    expect(text).toContain('为什么手动做：这一步是有人在办公室里亲手做的，不是程序做的。')
    expect(text, 'the office\'s own why was left in English').not.toContain('A person did this in the office')
    expect((englishWords() as unknown as Record<string, string>)['flowRunSteps.doneByHandWhy']).toBe(OFFICE_STEP_DONE_BY_HAND_WHY)
    expect((chineseWords() as unknown as Record<string, string>)['flowRunSteps.doneByHandWhy']).toEqual(expect.any(String))
    i18n.setWordLanguage('en')
  })

  it('draws a refusal of the verdict door in English as its status, and the door\'s own words only in Developer mode', () => {
    i18n.setWordLanguage('en')
    mode.setMode('normal')
    const normal = drawn(aRecord(A_REFUSAL))
    expect(normal).toContain('Result: the verdict door answered with status 409')
    expect(normal, 'the door\'s words were drawn outside Developer mode').not.toContain('Synthetic refusal')
    expect(normal).not.toContain('refused with status')
    mode.setMode('inspect')
    const developer = drawn(aRecord(A_REFUSAL))
    mode.setMode('normal')
    expect(developer).toContain("own words: Synthetic refusal in the words of the door. Nothing was written. Code: synthetic.code")
  })

  it('draws a refusal of the verdict door in Chinese as its status, with no English outside Developer mode', () => {
    i18n.setWordLanguage('zh')
    mode.setMode('normal')
    const normal = drawn(aRecord(A_REFUSAL))
    expect(normal).toContain('结果：裁定入口以状态码 409 回答')
    for (const english of ['refused with status', 'Synthetic refusal', 'synthetic.code']) expect(normal, 'English was left on the Chinese page').not.toContain(english)
    mode.setMode('inspect')
    const developer = drawn(aRecord(A_REFUSAL))
    mode.setMode('normal')
    expect(developer).toContain("入口的原话：Synthetic refusal in the words of the door. Nothing was written. 代码：synthetic.code")
  })

  it('says a flow run named no flow, and that it holds no step yet', () => {
    i18n.setWordLanguage('en')
    const text = drawn(aRecord({ run: 'synthetic-run', noFlow: NO_FLOW_NAMED, stepsTaken: [] }))
    expect(text).toContain('This run named no flow.')
    expect(text).toContain('No step has been recorded yet.')
    expect(text).not.toContain('Open the flow')
  })

  it('puts no space after a Chinese 。 and one after an English full stop, where a line meets the next part', () => {
    // THE TAGS ARE TAKEN OUT WITH NOTHING IN THEIR PLACE, so a space in the text is a space the page draws.
    const raw = (record: PanelRecord): string => renderToStaticMarkup(h(shown.FlowRunSteps, { record, participants: PARTICIPANTS })).replace(/<[^>]+>/g, '')
    i18n.setWordLanguage('zh')
    const zhText = raw(aRecord(A_FLOW_RUN))
    expect(zhText).toContain('用的是该流程的第 3 版。打开流程')
    expect(zhText).toContain('手动完成。仍未结束。没有人记录时间。')
    expect(zhText).toContain('已完成。结束于')
    expect(zhText, 'a typed space was drawn after a Chinese full stop').not.toMatch(/。 /u)
    i18n.setWordLanguage('en')
    const enText = raw(aRecord(A_FLOW_RUN))
    expect(enText).toContain('as the flow stood at its revision 3. Open the flow')
    expect(enText).toContain('by hand. Still open. Nobody recorded when.')
    expect(enText).toContain('Mole Office, by itself. Done. Ended')
  })

  // WAVE 13K ROUND 43, problem oQdFG3cyRWI_ item 22: at 390 the panel's overflow-wrap cut 打开流程 after 打. The link's
  // words sit in a span that does not wrap, and overflow-wrap does nothing where white-space forbids a wrap.
  // Mutation: draw the RouteLink without its span; this case goes red in both languages.
  it('keeps the words of the open-the-flow link on one line, in both languages', () => {
    for (const language of ['en', 'zh'] as const) {
      i18n.setWordLanguage(language)
      const markup = renderToStaticMarkup(h(shown.FlowRunSteps, { record: aRecord(A_FLOW_RUN), participants: PARTICIPANTS }))
      const open = i18n.t('flowRunSteps.openTheFlow')
      expect(markup, language).toMatch(new RegExp(`<span style="white-space:nowrap"><a [^>]*>${open}</a></span>`))
    }
    i18n.setWordLanguage('en')
  })

  it('draws nothing on a record that is not a flow run', () => {
    expect(drawn(aRecord(A_FLOW_RUN, 'session' as PanelRecord['kind']))).toBe('')
  })

  it('has words in both languages for every sentence the office writes, and the English words are those sentences', () => {
    for (const [key, sentence] of Object.entries(OFFICE_STEP_DOES)) {
      expect(en[`flowRunSteps.does.${key}`], key).toBe(sentence)
      expect(zh[`flowRunSteps.does.${key}`], key).toEqual(expect.any(String))
    }
    for (const [key, sentence] of Object.entries(OFFICE_STEP_ENDED_RESULT)) {
      expect(en[`flowRunSteps.endedAs.${key}`], key).toBe(sentence)
      expect(zh[`flowRunSteps.endedAs.${key}`], key).toEqual(expect.any(String))
    }
    expect(en['flowRunSteps.landedNoReason']).toBe(OFFICE_STEP_LANDED_NO_REASON)
    expect(zh['flowRunSteps.landedNoReason']).toEqual(expect.any(String))
  })
})
