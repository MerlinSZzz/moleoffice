// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW RUN'S FIELD HINTS SAY THAT THE OFFICE CAN NAME ITS FLOW FROM HOW THE RUN STARTED.
 *
 * On the record page in Normal mode, a field's hint is its person hint, `record.hint.<kind>.<key>` in the word lists
 * (`fieldHint` in src/web/pages/RecordPage.tsx). The field's description in src/shared/kinds/flow-run.ts is what an
 * agent reads. A run that names no flow is now given the one live flow of its project whose Starts on lists the run's
 * Started as. The description of `flow` says so, and the description of `noFlow` names the case of two or more such
 * flows.
 *
 * On main's words the two person hints still say only that the run named the flow, and tell the reader to leave the
 * flow empty when the run named none. So a person reading a flow run whose flow the office named is told that the run
 * chose it. The cases on the hints fail there, in English and in Chinese.
 *
 * The start is named by the words the record page draws as the two fields' headings, read from the word lists, so
 * this file spells no heading a second time.
 */

import { describe, expect, it } from 'vitest'
import { WORD_LISTS } from '../src/shared/i18n.ts'
import { flowRunKind } from '../src/shared/kinds/flow-run.ts'

const LISTS = [
  ['English', WORD_LISTS.en as Readonly<Record<string, unknown>>],
  ['Chinese', WORD_LISTS.zh as Readonly<Record<string, unknown>>],
] as const

/** The sentence a list holds under this key. A key with no sentence fails here and names the key. */
function word(list: Readonly<Record<string, unknown>>, key: string): string {
  const one = list[key]
  if (typeof one !== 'string') throw new Error(`The word list holds no sentence under ${key}.`)
  return one
}

/** The description an agent reads for one field of a flow run. */
function description(key: string): string {
  const field = flowRunKind.fields.find((one) => one.key === key)
  if (field === undefined) throw new Error(`A flow run has no field ${key}.`)
  return field.description
}

describe("what a flow run's hints tell a person about how its flow was named", () => {
  it("the descriptions an agent reads name the run's start, which is why the hints must too", () => {
    expect(description('flow')).toContain('`startedAs`')
    expect(description('noFlow')).toContain('`startedAs`')
  })

  for (const [language, list] of LISTS) {
    it(`the ${language} hint for the flow says the office names the flow that lists the run's start`, () => {
      const hint = word(list, 'record.hint.flow_run.flow')
      expect(hint).toContain(word(list, 'record.section.starts_on'))
      expect(hint).toContain(word(list, 'record.section.startedAs'))
    })

    it(`the ${language} hint for noFlow names the start when two or more flows list it`, () => {
      expect(word(list, 'record.hint.flow_run.noFlow')).toContain(word(list, 'record.section.startedAs'))
    })
  }

  it('the English hint for the flow no longer says to leave it empty whenever the run named no flow', () => {
    expect(word(WORD_LISTS.en as Readonly<Record<string, unknown>>, 'record.hint.flow_run.flow')).not.toContain(
      'Leave it empty when the run named no flow',
    )
  })
})
