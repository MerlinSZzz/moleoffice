// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWNER: WHO IT IS, AND THE ONE ACT THAT NAMES THEM.
 *
 * A fresh office does not write its owner's identity; it leads its first
 * person through a guide that asks for their name. These two doors are
 * what the guide (#/welcome) and an agent that installed the office read and write.
 *
 * GET /api/office/owner answers anyone, from any machine, and needs no actor headers: the browser
 * asks it before it knows who it is (src/web/owner.ts), so it cannot send who it is.
 *
 * POST /api/office/owner names the owner, once, while nobody has given a name. The person may
 * do it as before. A secretary using its own key may also record it on the owner's written words for that name and
 * language. The grant alone never names the owner. The stored mark stays the person's naming for older servers,
 * while the change row names the secretary and keeps the words. Renaming later is not this door.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { nameTheOwner, theOwnerAsTheDoorSaysIt, theOwnersLanguage } from '../lib/owner.ts'
import { theOfficeOwner } from '../db/the-office-owner.ts'
import { theSecretaryActingForThePerson, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { warrantBody } from './records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { isLanguage, LANGUAGES, type Language } from '@shared/i18n.ts'
import { ONLY_THE_PERSON_NAMES_THEMSELVES, OWNER_NAME_LIMITS, THE_GUIDE_ADDRESS, type TheOfficeOwner } from '@shared/owner.ts'

const READ_NOTE =
  'Who owns this office. Read by anyone, with no actor headers. The reply is {id, name, named, placeholder, guide}: ' +
  'name is null and named is false while nobody has given the owner a name, and then every page of the office leads ' +
  `to the guide at ${THE_GUIDE_ADDRESS}. placeholder is the placeholder name in the reader's language: ?language=en or ` +
  "?language=zh, and without it the owner's chosen language, else English. An agent that installed the office opens the " +
  "guide for the person or hands them the link. A secretary may record the name on the owner's written words."

const NAME_NOTE =
  'Name the owner of this office. Body {"name": string, "language"?: "en" | "zh", "warrant"?: warrant}. Allowed only while the owner has no ' +
  "name. The person may press as themselves. A secretary using its own key may record the name with the owner's " +
  'written words for this exact trimmed name and language (null when omitted), bound to office.name-owner: plus JSON ' +
  '{name, language}. The grant alone never names the owner. The name is trimmed, must be ' +
  `${String(OWNER_NAME_LIMITS.shortest)} to ${String(OWNER_NAME_LIMITS.longest)} characters, and is stored exactly as ` +
  'typed; keeping the placeholder stores the placeholder. language is written as the person\'s language. The look ' +
  '(light or dark) is kept by the browser, not by the office, and a body that carries it is refused. Any other caller is ' +
  `refused: "${ONLY_THE_PERSON_NAMES_THEMSELVES}" The reply is the same as GET /api/office/owner.`

const nameBody = z.strictObject({
  name: z.string(),
  language: z.string().optional(),
  warrant: warrantBody.optional(),
})

/** The language a reply's placeholder is in: the one asked for, else the owner's own, else English. */
function theReadersLanguage(req: FastifyRequest): Language {
  const asked = (req.query as Record<string, unknown> | undefined)?.['language']
  if (asked !== undefined) {
    if (!isLanguage(asked)) {
      throw new PanelError(
        `language must be one of ${Object.keys(LANGUAGES).join(', ')}; it was ${JSON.stringify(asked)}. Nothing was read.`,
      )
    }
    return asked
  }
  return theOwnersLanguage() ?? 'en'
}

/** The person's own press, writing as the owner's id or proved by their own key. */
function thePersonNamesThemselves(actor: Actor): boolean {
  const owner = theOfficeOwner()
  const isThePerson = thePersonIsProved(actor) && (actor.provedBy === 'the-person-key' || actor.id === owner.id)
  return isThePerson
}

export async function officeOwnerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/owner',
    route('office.owner', 'remote', READ_NOTE),
    async (req): Promise<TheOfficeOwner> => theOwnerAsTheDoorSaysIt(theReadersLanguage(req)),
  )

  app.post(
    '/office/owner',
    // THE PERSON MAY NAME THEMSELVES FROM A PAIRED COMPUTER, with their own key over an encrypted door: it writes
    // one row, once, and nothing on this machine. The keyless window claim from there is refused.
    route('office.name-owner', 'local', { because: 'reserved-to-the-owner', act: 'Naming the owner of this office', thePersonMayFromAnotherComputer: true }, NAME_NOTE),
    async (req): Promise<TheOfficeOwner> => {
      // EVERY CHECK BEFORE THE ONE WRITE: who is asking, the body's shape, the name, the language.
      let actor = actorFrom(req)
      const person = thePersonNamesThemselves(actor)
      const warrant = theWordsInTheBody(req)
      if (!person && (warrant === undefined || !aSecretaryWithItsOwnKey(actor))) {
        throw new PanelError(ONLY_THE_PERSON_NAMES_THEMSELVES, 403)
      }
      const raw = (req.body ?? {}) as Record<string, unknown>
      if (typeof raw === 'object' && raw !== null && 'look' in raw) {
        throw new PanelError(
          'The look (light or dark) is kept by the browser, not by the office, so this door does not take it. Set it in ' +
            'the browser and send only name and language. Nothing was changed.',
        )
      }
      const body = parse(nameBody, raw, "The owner's name")
      const name = body.name.trim()
      if (name.length < OWNER_NAME_LIMITS.shortest || name.length > OWNER_NAME_LIMITS.longest) {
        throw new PanelError(
          `The owner's name must be ${String(OWNER_NAME_LIMITS.shortest)} to ${String(OWNER_NAME_LIMITS.longest)} ` +
            `characters after trimming; it was ${String(name.length)}. Nothing was changed.`,
        )
      }
      if (body.language !== undefined && !isLanguage(body.language)) {
        throw new PanelError(
          `language must be one of ${Object.keys(LANGUAGES).join(', ')}; it was ${JSON.stringify(body.language)}. Nothing was changed.`,
        )
      }
      const language: Language | null = body.language === undefined ? null : (body.language as Language)
      if (warrant !== undefined) {
        actor = actorWithTheWordsItActsOn(req, warrant, `office.name-owner:${JSON.stringify({ name, language })}`)
        if (actor.warrant === undefined || !theSecretaryActingForThePerson(actor)) throw new PanelError(ONLY_THE_PERSON_NAMES_THEMSELVES, 403)
      }
      const before = theOfficeOwner()
      if (before.name !== null) {
        throw new PanelError(
          `This office's owner already has a name, ${JSON.stringify(before.name)}, so there is nothing to name. Nothing was changed.`,
          409,
        )
      }
      const named = nameTheOwner(name, language, actor)
      sayItWasDoneFromAnotherComputer(req, "The office owner's name was given")
      writeDownASettingChange(actor, {
        setting: 'office-owner',
        field: "the office owner's name",
        before: null,
        after: named.name,
        workspaceId: workspaceOf(req),
      })
      return theOwnerAsTheDoorSaysIt(language ?? theOwnersLanguage() ?? 'en')
    },
  )
}
