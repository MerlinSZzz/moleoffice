// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PIXEL_DETAILS, PIXEL_STATES, type PixelDetail, type PixelState } from './plugin-read.ts'
import { howARunStands } from './releasing.ts'
import { readPause } from './work.ts'
/** Cosmetic choices and their probabilities. They never assign work, identity or authority. */
import { z } from 'zod'

export const PIXEL_SCENES = ['woodland', 'greenhouse', 'night-library', 'cavern', 'high-rise'] as const
export const PIXEL_SCOPES = ['workspace', 'office'] as const
export const PIXEL_LANGUAGES = ['en', 'zh'] as const
export const PIXEL_AGES = ['young', 'adult', 'elder'] as const
export const PIXEL_PRESENTATIONS = ['neutral', 'feminine', 'masculine'] as const
export const PIXEL_HEIGHTS = ['short', 'medium', 'tall'] as const
export const PIXEL_BUILDS = ['slim', 'round', 'broad'] as const
export const PIXEL_FURS = ['slate', 'cocoa', 'chestnut', 'sand', 'silver', 'cream'] as const
export const PIXEL_EXPRESSIONS = ['neutral', 'happy', 'curious', 'focused', 'sleepy', 'surprised'] as const
export const PIXEL_COLOURS = ['blue', 'green', 'ochre', 'rose', 'plum', 'cream', 'charcoal'] as const
export const PIXEL_SLOTS = ['top', 'trousers', 'shoes', 'head', 'face', 'badge', 'neck'] as const
export type PixelZone = 'visitor' | 'team' | 'leadership' | 'secretary' | 'inspector' | 'unassigned'
export type PixelSlot = typeof PIXEL_SLOTS[number]
export type PixelScene = typeof PIXEL_SCENES[number]
export type PixelLanguage = typeof PIXEL_LANGUAGES[number]
export type PixelScope = typeof PIXEL_SCOPES[number]
export type PixelRarity = 'common' | 'uncommon' | 'rare'
export interface PixelItem { id: string; slot: PixelSlot; en: string; zh: string; rarity: PixelRarity }
export const PIXEL_ITEMS: readonly PixelItem[] = [
  { id: 'shirt', slot: 'top', en: 'Shirt', zh: '衬衫', rarity: 'common' },
  { id: 'hoodie', slot: 'top', en: 'Hoodie', zh: '连帽衫', rarity: 'common' },
  { id: 'knit', slot: 'top', en: 'Knitted jumper', zh: '针织衫', rarity: 'common' },
  { id: 'vest', slot: 'top', en: 'Waistcoat', zh: '马甲', rarity: 'uncommon' },
  { id: 'apron', slot: 'top', en: 'Apron', zh: '围裙', rarity: 'uncommon' },
  { id: 'star-coat', slot: 'top', en: 'Star coat', zh: '星纹外套', rarity: 'rare' },
  { id: 'plain-trousers', slot: 'trousers', en: 'Trousers', zh: '长裤', rarity: 'common' },
  { id: 'shorts', slot: 'trousers', en: 'Shorts', zh: '短裤', rarity: 'common' },
  { id: 'overalls', slot: 'trousers', en: 'Overalls', zh: '背带裤', rarity: 'uncommon' },
  { id: 'patchwork', slot: 'trousers', en: 'Patchwork trousers', zh: '拼布裤', rarity: 'rare' },
  { id: 'boots', slot: 'shoes', en: 'Boots', zh: '靴子', rarity: 'common' },
  { id: 'trainers', slot: 'shoes', en: 'Trainers', zh: '运动鞋', rarity: 'common' },
  { id: 'slippers', slot: 'shoes', en: 'Slippers', zh: '拖鞋', rarity: 'uncommon' },
  { id: 'flower-boots', slot: 'shoes', en: 'Flower boots', zh: '花纹靴', rarity: 'rare' },
  { id: 'cap', slot: 'head', en: 'Cap', zh: '便帽', rarity: 'common' },
  { id: 'beanie', slot: 'head', en: 'Beanie', zh: '毛线帽', rarity: 'common' },
  { id: 'helmet', slot: 'head', en: 'Mining helmet', zh: '矿工帽', rarity: 'uncommon' },
  { id: 'flower', slot: 'head', en: 'Flower', zh: '小花', rarity: 'uncommon' },
  { id: 'moon-hat', slot: 'head', en: 'Moon hat', zh: '月亮帽', rarity: 'rare' },
  { id: 'round-glasses', slot: 'face', en: 'Round glasses', zh: '圆眼镜', rarity: 'common' },
  { id: 'square-glasses', slot: 'face', en: 'Square glasses', zh: '方眼镜', rarity: 'common' },
  { id: 'headphones', slot: 'face', en: 'Headphones', zh: '耳机', rarity: 'uncommon' },
  { id: 'star-glasses', slot: 'face', en: 'Star glasses', zh: '星形眼镜', rarity: 'rare' },
  { id: 'name-tag', slot: 'badge', en: 'Name tag', zh: '姓名牌', rarity: 'common' },
  { id: 'leaf-pin', slot: 'badge', en: 'Leaf pin', zh: '叶子别针', rarity: 'uncommon' },
  { id: 'moon-pin', slot: 'badge', en: 'Moon pin', zh: '月亮别针', rarity: 'rare' },
  { id: 'scarf', slot: 'neck', en: 'Scarf', zh: '围巾', rarity: 'common' },
  { id: 'bow', slot: 'neck', en: 'Bow', zh: '领结', rarity: 'uncommon' },
  { id: 'star-scarf', slot: 'neck', en: 'Star scarf', zh: '星纹围巾', rarity: 'rare' },
]
export const PIXEL_WEAR_CHANCE: Readonly<Record<PixelSlot, number>> = {
  top: .94, trousers: .9, shoes: .82, head: .28, face: .24, badge: .17, neck: .12,
}
export const PIXEL_RARITY_WEIGHT: Readonly<Record<PixelRarity, number>> = { common: 70, uncommon: 24, rare: 6 }
export const pixelSceneSettingsSchema = z.object({
  version: z.literal(1), scene: z.enum(PIXEL_SCENES), scope: z.enum(PIXEL_SCOPES),
  language: z.enum(PIXEL_LANGUAGES), motion: z.boolean(), decorations: z.enum(['sparse', 'normal', 'lush']),
  grouping: z.enum(['shared', 'workspace']).default('shared'),
  workspaceScenes: z.record(z.string().min(1), z.enum(PIXEL_SCENES)).default({}),
  rareItems: z.boolean(), seed: z.string().min(1).max(80),
}).strict()
export type PixelSceneSettings = z.infer<typeof pixelSceneSettingsSchema>
export const DEFAULT_PIXEL_SCENE: PixelSceneSettings = {
  version: 1, scene: 'woodland', scope: 'workspace', language: 'en', motion: true,
  grouping: 'shared', workspaceScenes: {},
  decorations: 'normal', rareItems: true, seed: 'mole-office-scene-1',
}
/**
 * WHETHER THE OFFICE MAP MOVES, the one setting a person changes of the stored scene (wave 13y round 119). The older
 * built-in map read the other six, and it is gone. The row keeps them as they were, because the default-look refresh
 * still reads rare items from it.
 */
export const pixelMotionSettingSchema = z.object({ motion: z.boolean() }).strict()
export type PixelMotionSetting = z.infer<typeof pixelMotionSettingSchema>
const garment = z.object({ item: z.string().min(1).max(40), colour: z.enum(PIXEL_COLOURS) }).strict().nullable()
export const legacyPixelAppearanceSchema = z.object({
  version: z.literal(1), seed: z.string().min(1).max(80), age: z.enum(PIXEL_AGES),
  presentation: z.enum(PIXEL_PRESENTATIONS), height: z.enum(PIXEL_HEIGHTS), build: z.enum(PIXEL_BUILDS),
  fur: z.enum(PIXEL_FURS), expression: z.enum(PIXEL_EXPRESSIONS),
  top: garment, trousers: garment, shoes: garment, head: garment, face: garment, badge: garment, neck: garment,
}).strict().superRefine((appearance, context) => {
  for (const slot of PIXEL_SLOTS) {
    const value = appearance[slot]
    if (value !== null && !PIXEL_ITEMS.some(item => item.id === value.item && item.slot === slot)) {
      context.addIssue({ code: 'custom', path: [slot, 'item'], message: `This item does not belong in ${slot}.` })
    }
  }
})
export type LegacyPixelAppearance = z.infer<typeof legacyPixelAppearanceSchema>
// The v2 identity default is an existing appearance, even when no explicit choice was stored.
// Keep its original two-way draw fixed when more selectable looks join the catalog.
export const LEGACY_C_DEFAULT_LOOK_IDS = ['bare', 'scarf'] as const
export const C_FOREST_LOOK_IDS = [...LEGACY_C_DEFAULT_LOOK_IDS, 'sand-apron', 'cocoa-vest', 'silver-glasses'] as const
export type CForestLookId = typeof C_FOREST_LOOK_IDS[number]
export const C_LOOK_CATALOGUE_VERSION = 2 as const
/** Keep published versions unchanged when adding a new catalogue. Stored seeds name that version. */
const C_WHOLE_LOOK_CATALOGUES = {
  1: { bare: { weight: 60, rare: false }, scarf: { weight: 40, rare: false } },
  2: {
    bare: { weight: 20, rare: false }, scarf: { weight: 20, rare: false },
    'sand-apron': { weight: 30, rare: false }, 'cocoa-vest': { weight: 25, rare: false },
    'silver-glasses': { weight: 5, rare: true },
  },
} as const satisfies Record<number, Partial<Record<CForestLookId, { weight: number; rare: boolean }>>>
export const C_WHOLE_LOOK_WEIGHTS = C_WHOLE_LOOK_CATALOGUES[C_LOOK_CATALOGUE_VERSION]
const cGenerationSchema = z.object({
  source: z.enum(['registration', 'random-preview', 'default-refresh']), seed: z.string().min(1).max(80),
  // Retain every published version here when a new one becomes current.
  catalogueVersion: z.union([z.literal(1), z.literal(2)]), rareItems: z.boolean(), batchId: z.string().min(1).max(80).optional(),
}).strict()
function drawCWholeLook(seed: string, rareItems: boolean, catalogueVersion: keyof typeof C_WHOLE_LOOK_CATALOGUES): CForestLookId {
  const weights = C_WHOLE_LOOK_CATALOGUES[catalogueVersion]
  const choices = (Object.entries(weights) as [CForestLookId, { weight: number; rare: boolean }][]).filter(([, rule]) => rareItems || !rule.rare)
  let draw = pixelRandom(`c-whole-look:${catalogueVersion}:${seed}`)() * choices.reduce((sum, [, rule]) => sum + rule.weight, 0)
  for (const [id, rule] of choices) { draw -= rule.weight; if (draw < 0) return id }
  throw new Error('The C whole-look draw has no weighted choice.')
}
export const cForestAppearanceSchema = z.object({
  version: z.literal(2), style: z.literal('c-forest'), lookId: z.enum(C_FOREST_LOOK_IDS),
  generation: cGenerationSchema.optional(),
}).strict().superRefine((appearance, context) => {
  if (appearance.generation && drawCWholeLook(appearance.generation.seed, appearance.generation.rareItems, appearance.generation.catalogueVersion) !== appearance.lookId) {
    context.addIssue({ code: 'custom', path: ['lookId'], message: 'The look does not match its recorded generation seed and catalogue.' })
  }
  if (appearance.generation && (appearance.generation.source === 'default-refresh') !== (appearance.generation.batchId !== undefined)) {
    context.addIssue({ code: 'custom', path: ['generation', 'batchId'], message: 'Only a default refresh records a batch id, and every default refresh must record one.' })
  }
})
export type CForestAppearance = z.infer<typeof cForestAppearanceSchema>
// Version 3 is one supported look only: the sand-apron, whose whole action package is
// verified for these exact stored options. Every earlier version keeps its own shape and
// its generation rule untouched, and no version-2 object gains an optional key.
export const C_APRON_LOOK_ID = 'sand-apron' as const
export const C_APRON_FUR_OPTIONS = ['original', 'grey-brown'] as const
export const C_APRON_CLOTH_OPTIONS = ['original', 'blue-grey'] as const
export const C_APRON_ACCESSORY_OPTIONS = ['none', 'gold-halo'] as const
/** The recorded sample's outer candidates are x .90 to 1.10 and y .94 to 1.06. Only these
 *  discrete values are exposed, as bounded review values. No world measured the fixed-seat table
 *  contact, the hand-to-book contact or the feet-on-stool relation anywhere in this range, so these
 *  stay candidate schema options pending a combined-world product check, and the wider
 *  untested edges stay unavailable. */
export const C_APRON_X_FACTORS = [0.94, 1, 1.06] as const
export const C_APRON_Y_FACTORS = [0.97, 1, 1.03] as const
export type CApronFurOption = typeof C_APRON_FUR_OPTIONS[number]
export type CApronClothOption = typeof C_APRON_CLOTH_OPTIONS[number]
export type CApronAccessoryOption = typeof C_APRON_ACCESSORY_OPTIONS[number]
const cApronXSchema = z.union([z.literal(0.94), z.literal(1), z.literal(1.06)])
const cApronYSchema = z.union([z.literal(0.97), z.literal(1), z.literal(1.03)])
export const cApronAppearanceSchema = z.object({
  version: z.literal(3), style: z.literal('c-forest'), lookId: z.literal(C_APRON_LOOK_ID),
  fur: z.enum(C_APRON_FUR_OPTIONS), cloth: z.enum(C_APRON_CLOTH_OPTIONS),
  body: z.object({ x: cApronXSchema, y: cApronYSchema }).strict(),
  accessory: z.enum(C_APRON_ACCESSORY_OPTIONS),
}).strict()
export type CApronAppearance = z.infer<typeof cApronAppearanceSchema>
export const pixelAppearanceSchema = z.union([legacyPixelAppearanceSchema, cForestAppearanceSchema, cApronAppearanceSchema])
export type PixelAppearance = LegacyPixelAppearance | CForestAppearance | CApronAppearance
export type PixelAppearanceSource = 'saved-legacy' | 'saved-c' | 'identity-default-c' | 'registered-c' | 'saved-random-c' | 'updated-default-c'
export interface ResolvedPixelAppearance {
  appearance: PixelAppearance
  chosen: boolean
  source: PixelAppearanceSource
  cLook: CForestLookId | null
}

/** Only the absence of a saved choice allows a C default. Saved v1 objects stay intact. */
export function resolvePixelAppearance(agentId: string, stored: PixelAppearance | null): ResolvedPixelAppearance {
  if (stored?.version === 2 && stored.generation) return {
    appearance: stored, chosen: stored.generation.source === 'random-preview',
    source: stored.generation.source === 'registration' ? 'registered-c' : stored.generation.source === 'default-refresh' ? 'updated-default-c' : 'saved-random-c', cLook: stored.lookId,
  }
  if (stored !== null) return {
    appearance: stored, chosen: true,
    source: stored.version === 1 ? 'saved-legacy' : 'saved-c',
    cLook: stored.version === 2 || stored.version === 3 ? stored.lookId : null,
  }
  const lookId = LEGACY_C_DEFAULT_LOOK_IDS[Math.floor(pixelRandom('c-forest-v2:' + agentId)() * LEGACY_C_DEFAULT_LOOK_IDS.length)]!
  return { appearance: { version: 2, style: 'c-forest', lookId }, chosen: false, source: 'identity-default-c', cLook: lookId }
}

/** The original wire flag means chosen, not stored. A birth-generated appearance is stored too. */
export function storedPixelAppearance(appearance: PixelAppearance, chosen: boolean): PixelAppearance | null {
  return chosen || (appearance.version === 2 && appearance.generation !== undefined) ? appearance : null
}
export function generateCWholeAppearance(seed: string, source: 'registration' | 'random-preview' | 'default-refresh', rareItems = true, batchId?: string): CForestAppearance {
  if ((source === 'default-refresh') !== (batchId !== undefined)) throw new Error('A default refresh requires its batch id; other draws do not use one.')
  return { version: 2, style: 'c-forest', lookId: drawCWholeLook(seed, rareItems, C_LOOK_CATALOGUE_VERSION), generation: { source, seed, catalogueVersion: C_LOOK_CATALOGUE_VERSION, rareItems, ...(batchId === undefined ? {} : { batchId }) } }
}

export const pixelDefaultRefreshPlanSchema = z.object({
  version: z.literal(1), batchId: z.string().min(1).max(80), catalogueVersion: z.literal(C_LOOK_CATALOGUE_VERSION),
  rareItems: z.boolean(), agentIds: z.array(z.string().min(1)),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.agentIds).size !== plan.agentIds.length) context.addIssue({ code: 'custom', path: ['agentIds'], message: 'A default refresh cannot name one identity twice.' })
})
export type PixelDefaultRefreshPlan = z.infer<typeof pixelDefaultRefreshPlanSchema>

/** Stable cosmetic seed. Neither time, activity, role nor gender affects clothing probabilities. */
export function pixelRandom(seed: string): () => number {
  let value = 2166136261
  for (const character of seed) { value ^= character.codePointAt(0)!; value = Math.imul(value, 16777619) }
  return () => { value += 0x6D2B79F5; let n = value; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296 }
}
export function generatePixelAppearance(seed: string, rareItems = true): LegacyPixelAppearance {
  const random = pixelRandom(seed)
  const choose = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!
  const wear = (slot: PixelSlot): LegacyPixelAppearance[PixelSlot] => {
    if (random() >= PIXEL_WEAR_CHANCE[slot]) return null
    // We choose the rarity first, then uniformly within that rarity. Adding a shirt does not change tier odds.
    const rarities: readonly PixelRarity[] = rareItems ? ['common', 'uncommon', 'rare'] : ['common', 'uncommon']
    const total = rarities.reduce((sum, rarity) => sum + PIXEL_RARITY_WEIGHT[rarity], 0)
    let draw = random() * total
    let rarity: PixelRarity = 'common'
    for (const candidate of rarities) { draw -= PIXEL_RARITY_WEIGHT[candidate]; if (draw < 0) { rarity = candidate; break } }
    const item = choose(PIXEL_ITEMS.filter(item => item.slot === slot && item.rarity === rarity))
    return { item: item.id, colour: choose(PIXEL_COLOURS) }
  }
  return {
    version: 1, seed, age: choose(PIXEL_AGES), presentation: choose(PIXEL_PRESENTATIONS),
    height: choose(PIXEL_HEIGHTS), build: choose(PIXEL_BUILDS), fur: choose(PIXEL_FURS),
    expression: 'neutral', top: wear('top'), trousers: wear('trousers'), shoes: wear('shoes'),
    head: wear('head'), face: wear('face'), badge: wear('badge'), neck: wear('neck'),
  }
}

export const PIXEL_PROPS = [
  { id: 'desk', en: 'Desk', zh: '书桌', interaction: 'type' },
  { id: 'bookshelf', en: 'Bookshelf', zh: '书架', interaction: 'read' },
  { id: 'tea', en: 'Tea table', zh: '茶桌', interaction: 'tea' },
  { id: 'noticeboard', en: 'Noticeboard', zh: '告示板', interaction: 'look' },
  { id: 'mailbox', en: 'Mailbox', zh: '信箱', interaction: 'wave' },
] as const
export const PIXEL_DECORATIONS = ['fern', 'flowers', 'lamp', 'window', 'rug', 'clock', 'fireflies'] as const

export const PIXEL_SCENE_WORDS: Record<PixelScene, { en: string; zh: string }> = {
  cavern: { en: 'Underground office', zh: '地下洞穴办公室' },
  'high-rise': { en: 'City office', zh: '高层办公室' },
  woodland: { en: 'Woodland office', zh: '森林办公室' },
  greenhouse: { en: 'Greenhouse studio', zh: '温室工作室' },
  'night-library': { en: 'Moonlit library', zh: '月夜图书馆' },
}

// THE SEVEN GROUPS AND SIXTEEN DETAILS ARE PUBLISHED IN src/shared/plugin-read.ts, the one file a plugin may import,
// and are read here from there. The groups are presentation groups, never new stored workflow states.
export { PIXEL_DETAILS, PIXEL_STATES, type PixelDetail, type PixelState }

/** Process evidence is explicit input. A workflow default of working never proves execution. */
export function classifyPixelWork(data: Record<string, unknown>, executing: boolean, checking = false, waitingForMessage = false): PixelDetail {
  const standing = howARunStands(data)
  if (standing.standing === 'closed' || standing.standing === 'closed unchecked') return 'completed'
  if (standing.standing === 'reporting') return 'reporting'
  if (standing.standing === 'rebuttal') return 'rebuttal'
  if (standing.standing === 'inspecting') return 'waiting_check'
  if (waitingForMessage) return 'waiting_message'
  if (executing) return checking ? 'checking' : 'executing'
  switch (data['state']) {
    case 'crashed': case 'failed': return 'failed'
    case 'blocked': return 'blocked'
    case 'paused': return 'paused'
    case 'queued': case 'todo': return 'queued'
    case 'idle': return 'idle'
    default: return 'work_open'
  }
}

/** Only explicitly claimed task/block records use this reader. A task state is not process evidence. */
export function classifyPixelTask(data: Record<string, unknown>): PixelDetail {
  if (data['state'] === 'done') return 'task_completed'
  if (readPause(data) !== null) return 'paused'
  switch (data['state']) {
    case 'todo': return 'queued'
    case 'doing': return 'recorded_work'
    case 'blocked': return 'blocked'
    case 'failed': return 'failed'
    default: return 'unknown'
  }
}

export const PIXEL_ART_IDS = ['woodland', 'greenhouse', 'night-library', 'states', 'clothes', 'accessories'] as const
export type PixelArtId = typeof PIXEL_ART_IDS[number]
export const pixelArtPath = (id: PixelArtId): string => '/pixel-office/art/' + id + '.webp'
