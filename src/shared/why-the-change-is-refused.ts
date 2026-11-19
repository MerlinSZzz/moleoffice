// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyTheChangeIsRefused` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE, isMoleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { ParticipantChange } from '../server/lib/participants.ts'

/** Why this change is refused, in one plain sentence, or null because it is allowed. */
export function whyTheChangeIsRefused(
  what: ParticipantChange,
  who: ParticipantRef,
  by: ParticipantRef | null,
): string | null {
  if (by === null) {
    return (
      'Nothing here knows who is asking. Changing a name, a picture or a state means changing somebody\'s own, ' +
      'so whoever asks has to be in one of the registries. File a record of kind `agent` with a handle to be ' +
      'registered as one, and send that handle as the actor id.'
    )
  }
  // MOLE OFFICE'S OWN ROW IS NOBODY'S TO CHANGE, not even the owner's. It is the product writing
  // the lines that say a group was opened, a member was added or two claims are in conflict, and a
  // reader has to be able to tell those from an agent's words by the name and the picture. Criterion
  // M11 calls the picture fixed; this is what makes it fixed.
  if (isMoleOffice(who)) return MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE
  const itsOwn = by.kind === who.kind && by.id === who.id
  // A PERSON MAY SET AN AGENT'S LINE, SINCE DECISION `lUh6uis7oB6z`: the person keeps the power to set
  // it, and it is a mark like reporting or working, not offline or online. The line is a working mark, and marking
  // what an agent is doing is a thing the person running the work does. Criterion M21.
  //
  // WHAT DID NOT CHANGE: a person's own line is still theirs alone, and an agent still cannot write
  // on another agent. Both were the same sentence before this; they are two rules now, because they
  // are two rules, and the sentence each refuses with says which.
  if (what === 'state') {
    if (itsOwn) return null
    if (who.kind === 'person') return 'A person\'s own line is theirs to write, and nobody else\'s.'
    if (by.kind === 'person') return null
    return "An agent may write its own line and no other agent's."
  }
  // WHETHER SOMEBODY IS HERE IS THEIRS TO SAY AND NOBODY ELSE'S, and only a person has it to say.
  // An agent's presence is worked out from what is running (M4), so a word stored for an agent
  // would be a word nothing reads — refused here rather than accepted and ignored.
  if (what === 'presence') {
    if (who.kind !== 'person') {
      return (
        'Whether an agent can be reached is worked out from what is running on this machine, so there is nothing ' +
        'for it to set. Only a person says whether they are here.'
      )
    }
    return itsOwn ? null : 'Whether somebody is here is theirs to say, and nobody else\'s.'
  }
  // HOW THE CHAT CIRCLE DRAWS ITS NUMBER IS ONE PERSON'S OWN SETTING. Nothing draws a circle for an
  // agent, so a word stored for one would be a word nothing reads — refused here rather than
  // accepted and ignored, which is the argument presence makes just above. Criterion M32.
  if (what === 'circle') {
    if (who.kind !== 'person') {
      return 'Only a person has a chat circle, so there is nothing here for an agent to set.'
    }
    return itsOwn ? null : 'How somebody\'s own chat circle is drawn is theirs to set, and nobody else\'s.'
  }
  // AND HOW A LINK IN A MESSAGE IS DRAWN IS ONE PERSON'S OWN SETTING TOO, by the same argument the
  // circle makes above: nothing draws a messages panel for an agent, so a word stored for one would
  // be a word nothing reads. Criterion M47.
  if (what === 'messageLink') {
    if (who.kind !== 'person') {
      return 'Only a person reads the messages panel, so there is nothing here for an agent to set.'
    }
    return itsOwn ? null : 'How somebody reads their own messages is theirs to set, and nobody else\'s.'
  }
  // WHAT IS ON A PERSON'S OWN ROLE CARD — their occupation and which of their three portraits is on
  // it — is theirs to write, criteria P45 and P47.
  //
  // ONLY A PERSON, for the reason presence and the circle give above: an agent's card is in the
  // other list of the declaration and its own choice of portrait is not stored anywhere yet, so a
  // word written for one here would be a word nothing reads.
  //
  // WHICH CARD THEY HOLD IS NOT SET HERE AT ALL. This route writes what is ON a card; the card a
  // citizen holds is claimed when they are registered, and today the only thing that writes it is
  // tools/give-every-citizen-a-card.mjs, which asks first.
  if (what === 'card') {
    if (who.kind !== 'person') {
      return (
        'Only a person writes what is on their own role card. An agent holds a card from the other list in the ' +
        'declaration, and nothing stores an agent\'s own choice of portrait yet.'
      )
    }
    return itsOwn ? null : 'What is on somebody\'s own role card is theirs to write, and nobody else\'s.'
  }
  // A PERSON'S LOOK AND THE THEMES THEY MADE ARE THEIR OWN (migration 0347). Nobody else sets them:
  // not another person and not the agent that started the work. Only a person has one, because
  // nothing draws a page in an agent's look.
  //
  // THE OFFICE'S PERSON MAY HAVE THEIR SECRETARY SET IT, under their grant, at the look door
  // (src/server/api/the-persons-look.ts), and nowhere else. So the sentence for that person says
  // where, and this function still answers null only for the person themself: the grant is asked
  // by that door.
  if (what === 'look') {
    if (who.kind !== 'person') return 'Only a person has a look and own themes, so there is nothing here for an agent to set.'
    if (itsOwn) return null
    if (who.id === THE_PERSON) {
      return (
        "Only the person, or a secretary holding the person's grant, sets the person's look and own themes. " +
        `The secretary sets them at PUT /api/participants/person/${who.id}/look.`
      )
    }
    return 'A person\'s look and their own themes are theirs to set, and nobody else\'s.'
  }
  if (what === 'name') {
    // NOT HERE, NOT EVEN ITS OWN. At this door a person renames an agent at once. An agent's new name
    // is proposed at the renames door and takes effect when the agent's approver approves it
    // (src/server/lib/agent-renames.ts, item 42).
    if (by.kind !== 'person') {
      return who.kind === 'agent'
        ? `An agent may change its own picture here, and no name: at this door only a person gives one. An agent's new name is proposed at POST /api/participants/agent/${who.id}/renames, and it takes effect when the agent's approver approves it.`
        : 'An agent may change its own picture here, and no name: at this door only a person gives one.'
    }
    if (who.kind === 'person' && !itsOwn) return 'Only that person may change their own name.'
    return null
  }
  if (itsOwn) return null
  if (by.kind === 'person' && who.kind === 'agent') return null
  if (who.kind === 'person') return 'Only that person may change their own picture.'
  return "An agent may change its own picture and no other agent's."
}
