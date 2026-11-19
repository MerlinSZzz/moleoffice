// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { string } from 'zod/mini'
import { onFirstUse } from './startup.ts'
import { identityRecipe } from './look-identity.ts'
import { lookCount, lookOrder } from './look-order.ts'

const lookIds = ['bare', 'scarf', 'sand-apron', 'cocoa-vest', 'silver-glasses'] as const
export type LookId = typeof lookIds[number]
const items = {
  top: ['shirt', 'hoodie', 'knit', 'vest', 'apron', 'star-coat'],
  trousers: ['plain-trousers', 'shorts', 'overalls', 'patchwork'],
  shoes: ['boots', 'trainers', 'slippers', 'flower-boots'], head: ['cap', 'beanie', 'helmet', 'flower', 'moon-hat'],
  face: ['round-glasses', 'square-glasses', 'headphones', 'star-glasses'],
  badge: ['name-tag', 'leaf-pin', 'moon-pin'], neck: ['scarf', 'bow', 'star-scarf'],
} as const
// Plain strings use the same core parser without bundling unused classic format methods.
// Built on first use, not while the module evaluates (startup.ts).
const schemas = onFirstUse(() => {
  const seed = string().check(z.minLength(1), z.maxLength(80))
  const colours = z.enum(['blue', 'green', 'ochre', 'rose', 'plum', 'cream', 'charcoal'])
  const garment = (choices: readonly string[]) => z.strictObject({ item: string().check(z.refine((value: string) => choices.includes(value))), colour: colours }).nullable()
  const legacy = z.strictObject({
    version: z.literal(1), seed,
    age: z.enum(['young', 'adult', 'elder']), presentation: z.enum(['neutral', 'feminine', 'masculine']),
    height: z.enum(['short', 'medium', 'tall']), build: z.enum(['slim', 'round', 'broad']),
    fur: z.enum(['slate', 'cocoa', 'chestnut', 'sand', 'silver', 'cream']),
    expression: z.enum(['neutral', 'happy', 'curious', 'focused', 'sleepy', 'surprised']),
    top: garment(items.top), trousers: garment(items.trousers), shoes: garment(items.shoes), head: garment(items.head),
    face: garment(items.face), badge: garment(items.badge), neck: garment(items.neck),
  })
  const whole = z.strictObject({
    version: z.literal(2), style: z.literal('c-forest'), lookId: z.enum(lookIds),
    generation: z.strictObject({
      source: z.enum(['registration', 'random-preview', 'default-refresh']), seed,
      catalogueVersion: z.union([z.literal(1), z.literal(2)]), rareItems: z.boolean(), batchId: z.optional(seed),
    }).optional(),
  }).refine(value => !value.generation || (value.generation.source === 'default-refresh') === (value.generation.batchId !== undefined))
  const apron = z.strictObject({
    version: z.literal(3), style: z.literal('c-forest'), lookId: z.literal('sand-apron'),
    fur: z.enum(['original', 'grey-brown']), cloth: z.enum(['original', 'blue-grey']),
    body: z.strictObject({ x: z.union([z.literal(.94), z.literal(1), z.literal(1.06)]), y: z.union([z.literal(.97), z.literal(1), z.literal(1.03)]) }),
    accessory: z.enum(['none', 'gold-halo']),
  })
  return { 1: legacy, 2: whole, 3: apron }
})

export interface Portrait {
  stored: unknown
  version: number | null
  look: LookId | null
  unavailable: 'legacy' | 'variant' | 'unsupported' | null
}

/** Validate drawing shapes, preserve the host value, and never generate or repair an appearance. */
export function portraitOf(stored: unknown): Portrait {
  const version = stored !== null && typeof stored === 'object' ? (stored as { version?: unknown }).version : null
  const schema = version === 1 || version === 2 || version === 3 ? schemas()[version] : null
  if (!schema) return { stored, version: null, look: null, unavailable: 'unsupported' }
  const checked = schema.safeParse(stored)
  if (!checked.success) return { stored, version: null, look: null, unavailable: 'unsupported' }
  const appearance = checked.data
  if (appearance.version === 1) return { stored, version: 1, look: null, unavailable: 'legacy' }
  if (appearance.version === 3 && (appearance.fur !== 'original' || appearance.cloth !== 'original' ||
      appearance.body.x !== 1 || appearance.body.y !== 1 || appearance.accessory !== 'none')) {
    return { stored, version: 3, look: null, unavailable: 'variant' }
  }
  return { stored, version: appearance.version, look: appearance.lookId, unavailable: null }
}

export const standingLooks = ['tuft', 'fringe', 'bun', 'fan', 'crest', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower', 'gardener', 'mapmaker', 'runner'] as const
export type StandingLook = typeof standingLooks[number]
const savedStanding: Record<LookId, StandingLook> = { bare: 'crest', scarf: 'bun', 'sand-apron': 'apron', 'cocoa-vest': 'part', 'silver-glasses': 'waves' }
export interface Standing { look: StandingLook; source: 'saved-catalogue' | 'stable-fallback'; recipe?: number }
export const standingClothes = (standing: Standing): number => standing.recipe === undefined ? 0 : lookOrder[standing.recipe]! % 3
/** A display catalogue translation, never a saved appearance replacement. Repeats are expected. */
export function standingOf(portrait: Portrait, identity: string, createdAt: string): Standing {
  if (portrait.look !== null) return { look: savedStanding[portrait.look], source: 'saved-catalogue' }
  const recipe = identityRecipe(identity, lookCount(createdAt, lookOrder.length))
  return { look: standingLooks[Math.floor(lookOrder[recipe]! / 3)]!, source: 'stable-fallback', recipe }
}
/** The host's published v1 scale display conversion, ported without changing the saved number. */
export const standingScale = (saved: number): number => .80 + (saved - .3) / (1.6 - .3) * .12
