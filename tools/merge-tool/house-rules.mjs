// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** House-rule observations from main, without loading the merger's process or its settings. */
import './a-library-is-not-a-program.mjs'
import { HOUSE_RULES_PATH, readMainHouseRuleList, readMainHouseRules } from '../../src/shared/merge-class.ts'

export function houseRulesAtMain(integrated, blamed, git) {
  return readMainHouseRules(integrated.M, blamed, args => git(integrated.clone, args))
}

/**
 * MAIN'S HOUSE-RULE LIST AS TEXT, with why it could not be read. `text` is null when main has no list, which the module
 * that names the plain privacy files refuses with its own sentence; `why` is written only when the read itself failed,
 * so absence and a failed read are not answered alike.
 */
export function houseRuleListAtMain(integrated, git) {
  const reading = readMainHouseRuleList(integrated.M, args => git(integrated.clone, args))
  return reading.state === 'unreadable'
    ? { mainAt: integrated.M, text: null, why: `main's ${HOUSE_RULES_PATH} at ${integrated.M} could not be read: ${reading.reason}` }
    : { mainAt: integrated.M, text: reading.state === 'read' ? reading.text : null, why: null }
}

/** One grep finds every class observation. The office decides whether this red entry may land. */
export function houseRulesLogLine(facts) {
  const files = facts.files.map(one => `${one.file}: ${one.class === undefined ? 'feature test' : `class ${one.class}`}, ${one.mark === undefined ? 'no mark' : `mark ${one.mark}`}`).join('; ')
  const expectation = facts.list.state === 'unreadable' ? `nothing (${facts.reason})` : facts.class === 1 ? 'class 1' : `not class 1 (${facts.reason})`
  return `HOUSE-RULES: ${files}; expects ${expectation}. The office decides by its own setting.`
}
