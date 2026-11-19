// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read the queue's related-only position through the same settings source as its other gates. */
import { gatePosition } from './settings.mjs'
import { gateNamed, gateValueIsAllowed } from './gates.mjs'
import { enWave13u } from '../shared/words/en-wave-13u.ts'

/** An explicit environment is read on its own; the process environment uses the saved office choice.
 * @param {Record<string, string | undefined>} [env]
 */
export function relatedTestsOnlyPosition(env) {
  const position = gatePosition('related-tests-only', env)
  if (!gateValueIsAllowed(gateNamed('related-tests-only'), position)) {
    throw new Error(enWave13u['queueRelated.invalid'].replace('{value}', JSON.stringify(position)))
  }
  return position
}
