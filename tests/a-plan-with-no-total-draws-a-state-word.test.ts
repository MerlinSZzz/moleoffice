// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN WITH NO TOTAL SAYS SO IN WORDS, NOT WITH A LONE DASH. Problem ZPNVOJkn1oVp.
 *
 * One plan's totals line reads "<total> · <n> not sized as work · <m> not tracked as work". With no total
 * the first part was the short mark, so the line opened "— · 0 not sized as work": a stray dash. Before
 * round 11 it said which of two things was true: nobody has sized anything, or nothing tracked as work
 * is sized. It says so again, from the word lists, in English and Chinese. The same problem named a
 * trailing space in the Chinese word for the Review tab.
 *
 * MUTATION (wave 13k round 14): planTotalSaid returns t('absence.mark') again for no total; the first
 * case goes red.
 *
 * CRITERION CHANGE, as decided: the two sentences became two short state words, "nothing sized"
 * and "no total". The case still asks which of the two is drawn, and that it is never the dash. The
 * new words wait for their Chinese, so in Chinese they are read through the same word list.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { planTotalSaid } from '../src/web/components/plans/PlanTable.tsx'
import { setWordLanguage, t } from '../src/shared/i18n.ts'

const noTotal = { total: null, totalFrom: 0, roots: 3, atLeastTotal: null, ownHoursAdded: null, withoutOwn: 3 } as unknown as Parameters<typeof planTotalSaid>[0]

afterEach(() => setWordLanguage('en'))

describe('a plan with no total', () => {
  it('draws which of the two it is as a state word, in English and in Chinese', () => {
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      expect(planTotalSaid(noTotal, 0), language).toBe(t('planTable.total.nothingSized'))
      expect(planTotalSaid(noTotal, 2), language).toBe(t('planTable.total.none'))
      expect(planTotalSaid(noTotal, 2), language).not.toBe(t('absence.mark'))
    }
  })
})
