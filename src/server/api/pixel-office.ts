// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { pixelAppearanceSchema, pixelMotionSettingSchema, pixelDefaultRefreshPlanSchema } from '@shared/pixel-office.ts'
import { pixelSettings, changePixelSettings, pixelAppearance, changePixelAppearance, previewDefaultPixelAppearances, applyDefaultPixelAppearances } from '../lib/pixel-office.ts'

export async function pixelOfficeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/office/appearance-defaults/preview', route('office.appearance.read', 'remote', 'Preview new C looks only for NULL appearances this caller may edit. No appearance, size, seat or work value is written.'), async req => {
    workspaceOf(req)
    parse(z.object({}).strict(), req.body ?? {}, 'The default preview')
    return previewDefaultPixelAppearances(actorFrom(req))
  })
  app.post('/office/appearance-defaults/save', route('office.appearance.change', 'remote', 'Save a previewed default refresh. Recheck each identity with the same permission as a single appearance edit. Retain and explain saved or unauthorized rows; write no scale, seat or work field.'), async req => {
    workspaceOf(req)
    const value = parse(z.object({ plan: pixelDefaultRefreshPlanSchema }).strict(), req.body, 'The default refresh')
    return applyDefaultPixelAppearances(value.plan, actorFrom(req))
  })
  app.get('/office/scene-settings', route('office.scene-settings.read', 'remote', 'Read whether the office map moves, who last changed it and whether this caller can change it.'), async req => {
    workspaceOf(req)
    return pixelSettings(actorFrom(req))
  })
  app.patch('/office/scene-settings', route('office.scene-settings.change', 'remote', 'Change whether the office map moves. This changes presentation only, never work or presence.'), async req => {
    workspaceOf(req)
    return changePixelSettings(parse(pixelMotionSettingSchema, req.body, 'Whether the office map moves'), actorFrom(req))
  })
  app.get('/office/appearance/:agentId', route('office.appearance.read', 'remote', 'Read a saved version-1 appearance, a version-2 C whole look, or the one supported version-3 sand-apron combination of fur tone, apron tone, independent body x and y and head accessory, including any recorded generation source. A NULL appearance keeps the original stable bare/scarf default. Reading never generates or saves another appearance.'), async req => {
    workspaceOf(req)
    const { agentId } = parse(z.object({ agentId: z.string().min(1) }), req.params, 'The agent')
    return pixelAppearance(agentId, actorFrom(req))
  })
  app.put('/office/appearance/:agentId', route('office.appearance.change', 'remote', 'Save a complete version-1 appearance, chosen C look, random C preview whose seed matches its catalogue, or a strict version-3 sand-apron combination whose values are all published. Version 3 refuses every other look. This route cannot claim a new registration generated the appearance. The person may edit an agent, and an agent may edit only itself. Null restores the original stable C default; saving does not change the stored map size.'), async req => {
    workspaceOf(req)
    const { agentId } = parse(z.object({ agentId: z.string().min(1) }), req.params, 'The agent')
    const value = parse(z.object({ appearance: pixelAppearanceSchema.nullable() }).strict(), req.body, 'The appearance')
    return changePixelAppearance(agentId, value.appearance, actorFrom(req))
  })
}
