// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGINS IN plugins/, AND A SWITCH FOR EACH. Wave 13x round 14, step 1 of the plugin pipeline udGnc-Bsr15R (block
 * N0TWpg5xe6mo).
 *
 *   GET  /api/plugins              every plugin, its manifest or why it was refused, and whether it is on
 *   POST /api/plugins/:id/switch   switch one plugin on or off
 *   GET  /api/plugins/:id/files/*  one file of a switched-on plugin's built pages (round 15, step 3, block 3nJsBlPlYhcl)
 *
 * Built like the inject switch (src/server/api/inject-setting.ts). Both halves are remote: the setting belongs to the
 * office. The read-only interface plugins read through is src/server/api/plugin-read.ts.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body, then that the
 * plugin is there and may be switched on, and only then is the one column written.
 */
import { createReadStream } from 'node:fs'

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { pluginFileAddress, type PluginReading, type PluginsReading } from '../../shared/plugins.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aPluginsBuiltFile, readThePlugins, switchAPlugin } from '../lib/plugins.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  "The plugins in this repository's plugins/ folder, one folder each, and whether each is switched on. Read again on " +
  'every request, so a plugin added or switched needs no restart. Read only, and no body is read. The reply is ' +
  '{folderFound, interface, plugins: [{id, state: "on" | "off" | "refused", nobodyChose, manifest, refusal, ' +
  'refusedBecause}]}. ' +
  'folderFound is false when the install has no plugins/ folder. A plugin whose plugin.json could not be accepted, is ' +
  'a link, a folder, a named pipe, a socket or a device, or could not be read for want of permission, or whose folder ' +
  'is a link to another place or to nothing or could not be opened for want of permission, is listed as refused with ' +
  'the reason, and cannot be switched on. ' +
  'refusedBecause is that same reason as data — one cause and its parts — and null for a plugin that was not refused; ' +
  'refusal is the office reader\'s own English sentence. The Settings panel and a plugin\'s own page draw it in ' +
  'Developer mode only, under the plain words, and only where it says more than they do: a plugin.json that is not ' +
  'JSON, fields of a plugin.json this office will not accept, or a reason this build cannot say in words. ' +
  'nobodyChose is true when nobody has switched the plugin, and then it is off.'

const SET_NOTE =
  'Switch one plugin on or off. Body {"on": true | false | null}; null takes the choice away again, which reads as ' +
  'off. Only the owner may, or a secretary the owner has raised. While the gate who-changes-the-owners-settings is off, any ' +
  'agent proved by its own key may too, and is counted. An unknown plugin is a 404 and switching on a refused one is ' +
  'a 409. Every change is kept with who and when (the newest is in GET /api/office/setting-changes, as ' +
  'plugin-switches). The reply is the plugin as it now stands. It takes effect with no restart.'

const FILES_NOTE =
  "One file of a switched-on plugin's built pages, from plugins/<id>/dist/. The office draws a plugin's page in a " +
  'sandboxed frame from GET /api/plugins/<id>/files/<page>.html, and the page loads its other files from here too. ' +
  'A plugin that is off, refused or unknown has no files served (403 or 404, with the reason). Each part of the path ' +
  'is a plain name, the file must be inside dist/ after every link is followed, and its type is set from the end of ' +
  'its name; any other kind of file is a 404. Every reply carries a content policy that keeps the page sandboxed, ' +
  'lets it load files only from this plugin, lets it connect to nothing, and lets it start a worker only from a blob: ' +
  'address it made itself. So its one way to the office is to ask the page that drew it. Nothing is written.'

/**
 * THE CONTENT POLICY EVERY PLUGIN FILE IS SERVED UNDER. `sandbox allow-scripts` keeps the page in an origin of its
 * own even if it is opened outside the office's frame. It may load scripts, styles, pictures and fonts from its own
 * files and nowhere else, and it may not connect, post a form or open a frame. The address is absolute because a
 * sandboxed page has no origin of its own for 'self' to name.
 *
 * ONE KIND OF WORKER: a dedicated worker from a blob: address the page made itself (wave 13x round 19, agreed with
 * the secretary in message BiJwUKVU-LBz, for the office map's layout). A worker from a blob: address takes this policy and
 * this origin with it, so it connects to nothing and has no storage either. A worker from any other address is refused.
 */
function aPluginFilesPolicy(req: FastifyRequest, id: string): string {
  const own = `${req.protocol}://${req.host}${pluginFileAddress(id)}`
  return [
    'sandbox allow-scripts',
    "default-src 'none'",
    `script-src ${own}`,
    `style-src ${own} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `font-src ${own}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    'worker-src blob:',
  ].join('; ')
}

/** What a caller may send: on, off or nobody's choice. */
const setBody = z.strictObject({
  on: z.boolean({ error: 'on is true, false or null.' }).nullable(),
})

/** ONLY THE OWNER, OR A SECRETARY THE OWNER HAS RAISED, SWITCHES A PLUGIN. A plugin's page shows what the office holds. */
function onlyTheOwnerSwitchesAPlugin(actor: Actor): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // A SECRETARY THE PERSON HAS RAISED holds the person's acts but a few. Asked last, so the
  // grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-owners-settings lets any agent its own
  // key proves switch a plugin too, and counts it, and the raise is not asked. At block the raise is asked as before,
  // and a switch it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-owners-settings', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', 'switch a plugin on or off')
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `A plugin is switched on or off by the owner, and this request was made by "${actor.id}". Nothing was changed. ` +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'Any agent may read GET /api/plugins.',
    403,
  )
}

export async function pluginsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plugins', route('plugins.list', 'remote', READ_NOTE), async (): Promise<PluginsReading> => readThePlugins())

  app.get<{ Params: { id: string; '*': string } }>(
    '/plugins/:id/files/*',
    route('plugins.files', 'remote', FILES_NOTE),
    async (req, reply) => {
      const id = req.params.id
      const file = aPluginsBuiltFile(id, req.params['*'])
      void reply
        .header('content-type', file.type)
        .header('content-security-policy', aPluginFilesPolicy(req, id))
        .header('x-content-type-options', 'nosniff')
        .header('referrer-policy', 'no-referrer')
        .header('cache-control', 'no-cache')
        // A SANDBOXED PAGE HAS THE ORIGIN "null", and a module script or a font is fetched with that origin. These
        // files are the plugin's own code from this repository and carry nothing of the office, so any origin may
        // read them, and no cookie is asked for.
        .header('access-control-allow-origin', '*')
      return reply.send(createReadStream(file.path))
    },
  )

  app.post<{ Params: { id: string } }>(
    '/plugins/:id/switch',
    route('plugins.switch', 'remote', SET_NOTE),
    async (req): Promise<PluginReading> => {
      const actor = actorFrom(req)
      onlyTheOwnerSwitchesAPlugin(actor)
      const body = parse(setBody, req.body ?? {}, 'A plugin switch')
      const id = req.params.id
      const before = readThePlugins().plugins.find((plugin) => plugin.id === id)
      const after = switchAPlugin(id, body.on)
      // WHAT WAS CHOSEN: null is nobody having chosen, which reads as off, so a press from nobody's choice to "off" is a
      // change and is written down.
      const chosen = (reading: PluginReading | undefined): boolean | null =>
        reading === undefined || reading.nobodyChose ? null : reading.state === 'on'
      writeDownASettingChange(actor, {
        setting: 'plugin-switches',
        field: `whether the plugin ${id} is switched on`,
        before: chosen(before),
        after: chosen(after),
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
