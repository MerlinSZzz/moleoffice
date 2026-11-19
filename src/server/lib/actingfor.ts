// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS ACTING FOR THE PERSON, AS A SCREEN READS IT. Criterion P59, and P64 is why it is here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READING MOVED OUT OF THE ROLES ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * It was a function inside `src/server/api/roles.ts`, because the Role cards page was the only screen
 * that drew it. Criterion P64 moves the press to the agent's own profile: giving a role, and choosing
 * how long it lasts, belong on the agent's role profile in the embassy. So two replies now say who is
 * acting for the person, and two readings of one fact is the ninth invariant broken in the place where
 * drifting apart means a card and a profile disagreeing about whether an agent holds the person's acts.
 *
 * `lib/elevation.ts` cannot hold it: `lib/records.ts` imports that file, so a reading that needs
 * `getRecord` to name the piece of work a grant ends with would be a cycle. This file is below both.
 */

import { getRecord } from './records.ts'
import { listParticipants } from '../db/list-participants.ts'
import { theElevationHeldBy } from './elevation.ts'
import { whoIsActingForThePerson } from './elevations-that-end-with.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { Elevation, ElevationHeld } from '@shared/roles.ts'

/**
 * ONE GRANT, AS A CARD AND A PROFILE BOTH READ IT: who holds it, whose acts it hands over, and the
 * end in words.
 *
 * THE END IS BUILT HERE AND NOWHERE ELSE, and it is written to FOLLOW the word "until" rather than
 * to repeat it. A piece of work is named by its title where the record is there and by its id where
 * it is not: an id a reader cannot open is still better than an end nobody can name.
 */
export function asAScreenReadsIt(handle: string, elevation: Elevation): ElevationHeld {
  const named = elevation.until === null ? null : getRecord(elevation.until)
  return {
    ...elevation,
    agent: handle,
    // WHO THEY ARE, by the name the Office holds for them rather than by their id. The id is what a
    // request carries; a card is read by a person and reads their name.
    actingFor: listParticipants().people.find((one) => one.id === THE_PERSON)?.name ?? THE_PERSON,
    untilInWords:
      elevation.endsWhen === 'at a time'
        ? String(elevation.until)
        : elevation.endsWhen === 'when a piece of work ends'
          ? `${named === null ? String(elevation.until) : `"${named.title}"`} is finished`
          : 'you say so',
  }
}

/**
 * WHETHER THIS ONE AGENT IS ACTING FOR THE PERSON RIGHT NOW, as its profile reads it, or null.
 *
 * Null covers every reason at once — no grant was ever made, the grant ended, its time passed, or
 * the agent no longer holds a card that can hold one — because `theElevationHeldBy` already decides
 * all four and a second opinion here is a second answer to one question.
 */
export function whatThisAgentIsDoingForYou(handle: string): ElevationHeld | null {
  const held = theElevationHeldBy(handle)
  return held === null ? null : asAScreenReadsIt(handle, held)
}

/**
 * EVERYBODY ACTING FOR THE PERSON RIGHT NOW, oldest grant first. Empty is the ordinary answer.
 *
 * IT IS A LIST BECAUSE THERE MAY BE SEVERAL SECRETARIES. Criterion P67: the secretary is not unique.
 * This used to answer with the FIRST of them, on the reading that the product had one secretary;
 * several is now a state the person can make with
 * two presses, and answering with one of them would have been a screen quietly saying that one
 * agent held the person's acts while another one also did.
 */
export function everybodyActingForYou(): ElevationHeld[] {
  return whoIsActingForThePerson().map((one) => asAScreenReadsIt(one.handle, one.elevation))
}
