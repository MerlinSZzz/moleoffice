// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t, type WordKey } from '@shared/i18n.ts'
import { Mark, inlineMark, type ConsequenceMarkProps } from '../ui.tsx'

const BEARERS = {
  "person": "home.bearer.person",
  "outside": "home.bearer.outside",
  "property": "home.bearer.property",
  "dependent": "home.bearer.dependent",
  "owner": "home.bearer.owner",
  "none": "home.bearer.none"
} as const satisfies Record<NonNullable<ConsequenceMarkProps['consequence']>['bearer'], WordKey>
const MEANINGS = {
  "person": "home.bearerMeaning.person",
  "outside": "home.bearerMeaning.outside",
  "property": "home.bearerMeaning.property",
  "dependent": "home.bearerMeaning.dependent",
  "owner": "home.bearerMeaning.owner",
  "none": "home.bearerMeaning.none"
} as const satisfies Record<NonNullable<ConsequenceMarkProps['consequence']>['bearer'], WordKey>
const TRIANGLE = <><path d="M8 2.2L14.6 13.4H1.4z" fill="none" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8 6.2v3.3" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="11.5" r="0.9" fill="currentColor" stroke="none" /></>

/** Home uses the shared mark drawing and the recorded bearer, with translated reading words. */
export function ConsequenceMark({ consequence, withSentence }: ConsequenceMarkProps) {
  const safety = consequence?.bearer === 'person'
  const mark = consequence === null
    ? <Mark glyph={<circle cx="8" cy="8" r="4" fill="none" />} word={t('home.noConsequence')} tone="todo" mark={inlineMark('hollow')} detail={t('home.noConsequenceDetail')} />
    : <Mark glyph={TRIANGLE} word={t(BEARERS[consequence.bearer])} tone={safety ? 'failed' : 'todo'} alarm={safety ? 'urgent' : 'plain'} mark={inlineMark('filled')} detail={t('home.consequenceDetail', { meaning: t(MEANINGS[consequence.bearer]), what: content(consequence.what) })} />
  return withSentence ? <span className="px-noteline">{mark}<span className="px-noteline-text">{consequence === null ? t('home.noConsequenceSaid') : content(consequence.what)}</span></span> : mark
}

export function SafetyFloorMark() {
  return <Mark glyph={TRIANGLE} word={t('home.bearer.person')} tone="failed" alarm="urgent" mark={inlineMark('filled')} detail={t('home.safetyDetail')} />
}
