// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { sqlite } from '../db/client.ts'
import { mayChangeTheOfficesSettings } from './runtime-settings.ts'
import { destinationSettingsReading, saveDestinationSettings } from '../lib/storage/destinations.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { actorFrom } from '../lib/http.ts'
import { actorMayActAsSecretaryOrThePerson } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { readStorageCategories } from '../lib/storage/inventory.ts'

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/storage/categories', route('storage.categories', 'remote',
    'Installation-wide physical file sizes by stored category. Reads only fixed summary rows. ' +
    'Unmeasured and incomplete coverage are explicit; external changes require another checked snapshot. ' +
    'Only the person or a secretary may read these installation-wide totals. No paths or file details are returned.'), async req => {
    if (!actorMayActAsSecretaryOrThePerson(actorFrom(req))) {
      throw new PanelError('Installation-wide storage totals are available only to the person or a secretary.', 403,
        undefined, undefined, undefined, { code: 'storageTotalsForbidden', values: {} })
    }
    return readStorageCategories(sqlite)
  })
  app.get('/office/storage-destinations', route('office.storage-destinations', 'local', {
    because:'acts-on-this-machine',act:'Reading storage destination settings on this computer',
  }, 'Read nonsecret destination settings and fixed physical storage summary rows. The reading names where credentials are kept and the check that failed when the file is refused. Credentials are answered only as set or not set. No upload is run.'), async req => {
    const allowed=mayChangeTheOfficesSettings(actorFrom(req))
    if(!allowed)throw new PanelError('Only the person or an authorized secretary may change storage destinations.',403,undefined,undefined,undefined,{code:'storageDestinationForbidden',values:{}})
    return destinationSettingsReading(allowed)
  })
  app.post('/office/storage-destinations', route('office.set-storage-destinations', 'local', {
    because:'acts-on-this-machine',act:'Saving storage destination settings on this computer',
  }, 'Save one named destination with its nonsecret target, upload policy, total limit and enabled state. Body {destination, credentials:{action:retain|replace|remove, values?:known credentials}, because}. Credentials are kept only in the host secrets file and never returned. A refused secrets file is answered inside a 200 reading and refused 409 on a save. No transport runs.'), async req => {
    const actor=actorFrom(req)
    if(!mayChangeTheOfficesSettings(actor))throw new PanelError('Only the person or an authorized secretary may change storage destinations.',403,undefined,undefined,undefined,{code:'storageDestinationForbidden',values:{}})
    saveDestinationSettings(req.body,actor,workspaceOf(req))
    return destinationSettingsReading(true)
  })

}
