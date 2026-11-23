// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SET UP PRESS: WHICH SECRETARY THE PERSON'S ASK TO SET UP AN AGENT TOOL GOES TO, AND THE ASK WRITTEN AS HIS OWN
 * MESSAGE. Wave 13u round 242.
 *
 * The person asked that setting up a tool take only his ask, then typing and confirming. Settings draws one line for each
 * agent tool with one Set up press (src/web/components/settings/CodingToolsPanel.tsx). The press asks
 * POST /api/harnesses/:id/set-up (src/server/api/terminal-harnesses.ts), which picks the secretary here and writes the
 * message here.
 *
 * WHICH SECRETARY, in this order. The person is never asked to pick.
 *   holdsTheDuty      exactly one secretary's recorded duties name the door harnesses.install. No free words in the
 *                     duties are matched.
 *   theOnlySecretary  there is one secretary, whatever its duties say.
 *   writtenToLast     the secretary of the person's newest message to that one secretary alone. A message to a group,
 *                     or to more than one, does not count.
 *   registeredFirst   the secretary registered first, as the usage notices pick theirs (src/server/lib/usage-notices.ts).
 * A secretary is an un-retired holder of the secretary card. With none, nothing is written and the door refuses.
 *
 * THE MESSAGE IS THE PERSON'S, in the language the page asked for, and names the tool as its declaration names it
 * (src/server/lib/harnesses.ts). So the install door's message check (`theFirstInstallAMessageOpens`,
 * src/server/lib/setting-up-an-agent-tool.ts) reads it as the person's ask for that tool, and the secretary's install
 * press may carry its id.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { createI18n, sayInEnglish, type Say } from '@shared/i18n.ts'
import type { Language } from '@shared/languages.ts'
import { THE_PERSON } from '@shared/person.ts'
import { db } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records } from '../db/schema.ts'
import { enoughOfIt } from './agents.ts'
import type { WhyThisSecretary } from '@shared/harnesses.ts'
import type { Harness } from './harnesses.ts'
import { createRecord, type Actor } from './records.ts'
import { theSecretariesInTheOrderAppointed } from './usage-notices.ts'

/** The secretary a press goes to, by registry id and name, and why. */
export interface TheSecretaryASetUpGoesTo {
  secretary: { id: string; name: string }
  why: WhyThisSecretary
}

/** The one door a recorded duty must name to cover the agent tools and their keys. */
export const THE_DOOR_OF_THE_DUTY = 'harnesses.install'

/**
 * THE SECRETARY A SET UP PRESS GOES TO, or null when there is no secretary. `holdingTheDuty` is the registry ids of the
 * secretaries whose recorded duties name THE_DOOR_OF_THE_DUTY.
 */
export function theSecretaryASetUpGoesTo(holdingTheDuty: readonly string[]): TheSecretaryASetUpGoesTo | null {
  const secretaries = theSecretariesInTheOrderAppointed()
  const [first] = secretaries
  if (first === undefined) return null
  // AN AGENT REGISTERED WITH NO NAME IS NAMED BY ITS HANDLE, as the usage notices name it.
  const named = (one: { id: string; handle: string; name: string }, why: WhyThisSecretary): TheSecretaryASetUpGoesTo => ({ secretary: { id: one.id, name: one.name || one.handle }, why })
  const holders = secretaries.filter((one) => holdingTheDuty.includes(one.id))
  const [holder] = holders
  if (holder !== undefined && holders.length === 1) return named(holder, 'holdsTheDuty')
  if (secretaries.length === 1) return named(first, 'theOnlySecretary')
  const last = theSecretaryThePersonWroteToLast(secretaries.map((one) => one.id))
  const writtenTo = secretaries.find((one) => one.id === last)
  if (writtenTo !== undefined) return named(writtenTo, 'writtenToLast')
  return named(first, 'registeredFirst')
}

/**
 * THE SECRETARY OF THE PERSON'S NEWEST MESSAGE TO ONE SECRETARY ALONE, or null when he wrote none. A message to a group,
 * or to more than one reader, is not counted. Every project's messages are read, because the tools are the machine's.
 */
function theSecretaryThePersonWroteToLast(secretaries: readonly string[]): string | null {
  const theOneReader = sql<string>`json_extract(${records.data}, '$.to[0].id')`
  const row = db
    .select({ id: theOneReader })
    .from(records)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.message,
        isNull(records.deletedAt),
        eq(STORED_FIELDS.messageSentById(records.data), THE_PERSON),
        eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, 'person'),
        isNull(STORED_FIELDS.messageToGroup(records.data)),
        eq(sql`json_array_length(${records.data}, '$.to')`, 1),
        eq(sql`json_extract(${records.data}, '$.to[0].kind')`, 'agent'),
        inArray(theOneReader, [...secretaries]),
      ),
    )
    .orderBy(desc(records.createdAt), desc(sql`rowid`))
    .limit(1)
    .get()
  return row?.id ?? null
}

/** The person's ask to set up one tool, in his language, naming the tool as its declaration names it. */
export function theWordsOfTheAsk(one: Harness, language: Language): string {
  const say: Say = language === 'en' ? sayInEnglish : createI18n(language).t
  return say('harnessSetUp.message', { tool: one.name })
}

/** WRITES THE ASK AS THE PERSON'S MESSAGE TO THE SECRETARY, and answers the message's id. */
export function writeTheAsk(one: Harness, to: TheSecretaryASetUpGoesTo, language: Language, actor: Actor, workspaceId: string): string {
  const body = theWordsOfTheAsk(one, language)
  const message = createRecord({
    kind: 'message',
    title: enoughOfIt(body),
    data: { body, to: [{ kind: 'agent', id: to.secretary.id }] },
    workspaceId,
    actor,
  })
  return message.id
}
