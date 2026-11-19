// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read whether an entry that changes the queue's own code may ride a bus, through the same settings source as the queue's other gates. */
import { gatePosition } from './settings.mjs'
import { gateNamed } from './gates.mjs'

/**
 * The switch's id, its setting's name and its position, so the merge tool counts and names it as its row declares it.
 * With no environment, or this process's own, a choice saved on the Gates panel wins, then the environment, then .env.
 * Any other environment belongs to its caller and is read on its own.
 * @param {Record<string, string | undefined>} [env]
 */
export function queueCodeRidesABus(env) {
  const row = gateNamed('queue-code-rides-a-bus')
  return { id: row.id, setting: row.setting, position: gatePosition('queue-code-rides-a-bus', env) }
}
