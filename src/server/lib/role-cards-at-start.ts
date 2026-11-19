// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The reset and the server read the same checked cards and copy provenance (wave 13y round 38). */
import { GOVERNANCE_GUARDS } from './records.ts'
import { readTheRoleCards } from './roles.ts'
import { Gaps, repository } from './runtime.ts'
import type { TheCommit } from './card-words.ts'
import type { RolesDeclaration } from '@shared/roles.ts'

/** Join both declared guard keys to the card reader before any card is used (wave 13y round 38). */
export function readTheRoleCardsAtStart(): RolesDeclaration {
  return readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}

/** The checkout the copied words come from, or the runtime reader's reason it cannot name one (wave 13y round 38). */
export function theCommitTheCardWordsComeFrom(): TheCommit {
  const gaps = new Gaps()
  const head = repository(gaps).head
  const why = gaps.list.map((gap) => `${gap.what}: ${gap.why}`).join('; ')
  return head === null ? { full: null, why: why === '' ? 'nothing said why' : why } : { full: head.full }
}
