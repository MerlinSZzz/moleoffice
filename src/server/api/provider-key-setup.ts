// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { aPageThatIsNotThisOfficesSentIt } from '../lib/an-origin-that-is-not-this-office.ts'
import { actorFrom } from '../lib/http.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { KeyExists, Refusal } from '../../config/provider-setup/private-key.mjs'
import { createProviderKeySetup } from '../lib/provider-key-setup.ts'

const bodyShape = z.strictObject({
  provider: z.string().min(1).max(100), value: z.string().min(1).max(4096), replace: z.boolean().optional(), lang: z.enum(['en', 'zh']).optional(),
  customName: z.string().max(100).optional(), prefix: z.string().max(100).optional(), min: z.number().int().min(1).max(4096).optional(),
})
const trialShape = z.strictObject({ provider: z.string().min(1).max(100) })
export function permitted(req: FastifyRequest): void {
  if (aPageThatIsNotThisOfficesSentIt(req)) throw new PanelError('This page cannot change keys from this origin.', 403)
  const actor = actorFrom(req)
  if (!thePersonIsProved(actor) || actor.signedItem !== undefined) throw new PanelError('Only the person may add or test a provider key.', 403)
}
export async function providerKeySetupRoutes(app: FastifyInstance): Promise<void> {
  const service = createProviderKeySetup()
  const here = { because: 'acts-on-this-machine' as const, act: 'Setting up a private provider key on this computer' }
  // THE LIST IS PUBLIC GUIDANCE, read by anyone on this computer, so it asks for no proof of the person. It carries no key
  // and does not say whether one is saved. Only the two POST doors below save or try a key, and both ask for the person.
  app.get('/settings/provider-keys', route('office.keys', 'local', here, 'The providers whose keys can be set up from Settings, each with its guide, and whether this computer can save a key.'), async () => ({ providers: service.list(), savingAvailable: service.savingAvailable() }))
  app.post('/settings/provider-keys', { ...route('office.set-key', 'local', here, 'Save a private provider key in its own file on this computer, refusing to replace a saved key unless asked.'), bodyLimit: 8192 }, async (req) => {
    permitted(req)
    const body = bodyShape.safeParse(req.body)
    if (!body.success) throw new PanelError('Enter the provider and a key of the expected shape.', 400)
    try { return service.save(body.data) }
    catch (error) {
      const generic = 'The key was not saved. Check its shape and file permissions.'
      const message = error instanceof Refusal && !error.message.includes(body.data.value) ? error.message : generic
      // 409 when a key is already saved: the page then offers to replace it, and draws no such offer before.
      throw new PanelError(message, error instanceof KeyExists ? 409 : 400)
    }
  })
  app.post('/settings/provider-keys/trial', { ...route('office.test-key', 'local', here, 'Try a private provider key with a read-only request.'), bodyLimit: 2048 }, async (req) => {
    permitted(req)
    const body = trialShape.safeParse(req.body)
    if (!body.success) throw new PanelError('Choose a provider to test.', 400)
    try { return await service.trial(body.data.provider) }
    catch (error) { throw new PanelError(error instanceof Refusal ? error.message : 'The read-only trial could not be completed. Check the key, its permissions and the provider.', 400) }
  })
}
