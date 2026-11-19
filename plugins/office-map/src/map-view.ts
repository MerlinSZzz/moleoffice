// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { screenTestHooks } from './screen-test-hooks.ts'
import { screenAgents } from './screen-selection.ts'
import { words } from './words.ts'
import { SceneryIndex } from './compact-scenery.ts'
import type { FacilityPlace, Layout, Point } from './geometry.ts'
import { cameraFor, overlapsCamera, type Camera, type Rect } from './viewport.ts'
import { VisibleIndex, surfaceSize, CanvasPool, copySurfaceSteps, sortSteps } from './render-plan.ts'
import { currentFacts, projectMatch, roomWords, type OfficeModel, type Occupant } from './model.ts'
import { ATLAS_BYTES, SelectedPack, packTouchSteps, drawAnchoredSprite, drawSprite, type ArtPack } from './pack.ts'
import { portraitOf, standingOf, standingClothes } from './appearance.ts'
import { LookFrames } from './look-frames.ts'
import { facilityPose } from './facility-pose.ts'
import { facilityPlaces, whereabouts, whereaboutsPoint, type Whereabouts } from './ownership.ts'
import { depthSortedTree, sceneOrder, type Actor } from './scene-order.ts'
import { boundsOf, isTree, stableHash, type Piece } from './village.ts'
import { DEFAULT_MOLE_SCALE, paperArcBlockers, paperArcClear, PAPER_ARC_SHIFT, type MovingContact } from './walks.ts'
import { translateBody, visualBodyBounds } from './visual-body.ts'
import wallAlpha from './wall-alpha-data.json'
import { badges, moleGroup, moleSprite, playPose, paperExchange } from './mole-state.ts'
import { overviewPlan } from './overview.ts'
import { Nameplates, shortName } from './nameplates.ts'
import { houseSign, ownershipAreaLabelsOrSkips, type AreaLabelHeader } from './ownership-area-labels.ts'
import { actorRect, layoutIndexes, seatRect, SlicedBuild, type LayoutIndexes } from './layout-index.ts'
import { atDesk, standsOn } from './desk-things.ts'
import { SceneryTiles, SCENERY_TILE_BYTES } from './scenery-tiles.ts'
import { woodlandSteps, type Woodland } from './woodland.ts'
import { walkRings } from './village-dressing.ts'
import { VILLAGE, villageOverview, type VillageOverview } from './village-layout.ts'
import { populationLabel, populationLabelsSteps, type PopulationLabel } from './population-labels.ts'
import { OwnedBuild } from './owned-build.ts'
import { ActionRuntime, type ActionClock, type ActionCandidate } from './action-runtime.ts'
import { bindActions, bindingSignature, nativeTuft, actorScale, type ActionBinding, type ContactPiece } from './action-binding.ts'
import { NativeContacts } from './action-contacts.ts'
import { pageCompositions } from './action-resources.ts'
import { workIntent } from './action-intent.ts'
import { onlineAtWork, onlineIdleEligible } from './idle-eligibility.ts'

export interface MapOptions { project: string | null; search: string; language: 'en' | 'zh'; theme: 'light' | 'dark'; selected: string | null; workAvailable: boolean; still: boolean; wave: string | null; online?: Map<string, boolean> | null; asleep?: ReadonlySet<string>; asleepMadeUp?: boolean }
const surfaces = new CanvasPool()
const materialize = (ctx: CanvasRenderingContext2D): void => { ctx.getImageData(0, 0, 1, 1) }
export const releaseMapSurfaces = (): void => surfaces.dispose()
/** How far above its feet, in frame px, the middle of a mole is drawn. Every mole frame is solid there. */
export const moleMiddle = { awake: 44, asleep: 18 } as const
/** A desk piece stands at its desk's corner and a desk thing's base lies inside the desk's area, so
 * the desk is looked for within this distance of the piece's picture; the exact test decides. */
const DESK_REACH = 32
const PLATE_GLIDE_MS = 300
const covers = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height
/** One entry per area still to draw: a request already covered adds nothing, a wider one replaces the narrower it covers. */
const unionRegions = (held: Rect[], added: Rect[]): Rect[] => {
  const regions = held.slice()
  for (const region of added) {
    if (regions.some(other => covers(other, region))) continue
    for (let at = regions.length - 1; at >= 0; at--) if (covers(region, regions[at]!)) regions.splice(at, 1)
    regions.push(region)
  }
  return regions
}
/** Keep only the part of a requested rectangle that a completed draw did not cover. */
const uncovered = (region: Rect, drawn: Rect): Rect[] => {
  const left = Math.max(region.x, drawn.x), top = Math.max(region.y, drawn.y)
  const right = Math.min(region.x + region.width, drawn.x + drawn.width), bottom = Math.min(region.y + region.height, drawn.y + drawn.height)
  if (left >= right || top >= bottom) return [region]
  return [
    { x: region.x, y: region.y, width: region.width, height: top - region.y },
    { x: region.x, y: bottom, width: region.width, height: region.y + region.height - bottom },
    { x: region.x, y: top, width: left - region.x, height: bottom - top },
    { x: right, y: top, width: region.x + region.width - right, height: bottom - top },
  ].filter(part => part.width > 0 && part.height > 0)
}
interface DynamicRequest { regions: { area: Rect; added: number }[]; targets: number }

/** Where a key is drawn from its current presence and its layout. */
function whereaboutsAt(found: Map<string, Whereabouts> | undefined, occupants: Map<string, Occupant>, key: string): Whereabouts {
  const known = found?.get(key)
  if (known) return known
  const occupant = occupants.get(key)
  if (!occupant) return { where: 'desk' }
  const alone = whereabouts([{ id: occupant.agent.id, retired: occupant.agent.retired }], null, new Set(), { play: 0, sleep: 0 })
  return alone.get(occupant.agent.id) ?? { where: 'desk' }
}
/** An idle agent at a facility place of its room is there; every other agent is at its whereabouts. */
function pointAt(layout: Layout | null, found: Map<string, Whereabouts> | undefined, occupants: Map<string, Occupant>, facility: ReadonlyMap<string, FacilityPlace>, key: string): Point | null {
  if (!layout) return null
  const at = whereaboutsAt(found, occupants, key)
  return at.where === 'desk' && facility.has(key) ? facility.get(key)!.foot : whereaboutsPoint(layout, key, at)
}
/** Where a mole that is not walking is drawn, and its depth: a mole at work at its desk behind the
 * desk, at atDesk(seat), and any other mole at its point. A mole bound to an action stands at its
 * foot, where the action draws its working desk and plays. A mole free to walk stands at its foot
 * too, or at its facility place when it has one, because its idle outing and its walk to a desk-talk
 * point start and end there, so it never jumps between behind its desk and its foot. The drawing,
 * the opening view and locate read it. */
function drawnAt(layout: Layout | null, found: Map<string, Whereabouts> | undefined, occupants: Map<string, Occupant>, facility: ReadonlyMap<string, FacilityPlace>, bound: ReadonlyMap<string, ActionBinding>, free: ReadonlySet<string>, key: string): { point: Point; depth?: number } | null {
  const foot = pointAt(layout, found, occupants, facility, key), seat = layout?.seats[key]
  if (!foot) return null
  if (whereaboutsAt(found, occupants, key).where === 'desk' && seat?.desk && seat.desk.width > 0 && !bound.has(key) && !free.has(key)) return { point: atDesk(seat), depth: seat.desk.y + seat.desk.height - .1 }
  return { point: foot }
}
/** Include agents whose away point is visible even when their seat is outside the camera. */
function onScreen(camera: Camera | null, awayEntries: { key: string; point: Point }[] | undefined, keys: string[]): string[] {
  if (!camera || !awayEntries?.length) return keys
  const away = new Map(awayEntries.map(entry => [entry.key, entry.point])), shown: string[] = [], seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) continue
    const point = away.get(key)
    if (point && !overlapsCamera(actorRect(point), camera)) continue
    shown.push(key); seen.add(key)
  }
  for (const { key, point } of awayEntries) {
    if (!seen.has(key) && overlapsCamera(actorRect(point), camera)) { shown.push(key); seen.add(key) }
  }
  return shown
}
/** Budgeted background, composed frame and visible canvas. No idle scheduler. */
export class OfficeMap {
  private plane = document.createElement('div')
  private canvas = surfaces.take()
  private background = surfaces.take()
  private frame: HTMLCanvasElement | null = null
  private targets = document.createElement('div')
  private layout: Layout | null = null
  private indexBuild = new OwnedBuild<LayoutIndexes>()
  private painting = new OwnedBuild<void>()
  private repainting = false
  private pendingDynamic: DynamicRequest | null = null
  private dynamicRevision = 0
  private drawingDynamic = false
  private dynamics = new OwnedBuild<boolean>()
  private zoomTimer: ReturnType<typeof setTimeout> | null = null
  private scrollTimer: ReturnType<typeof setTimeout> | null = null
  private shown: { left: number; top: number; width: number; height: number; scrollLeft: number; scrollTop: number; viewWidth: number; viewHeight: number } | null = null
  private holdingView = false
  private pendingZoom: number | null = null
  private zooms: number[] = []
  private firstPaint: ReturnType<typeof setTimeout> | null = null
  private preparingPreview = false
  private indexedLayout: Layout | null = null
  private indexes: LayoutIndexes | null = null
  private pending: { layout: Layout; model: OfficeModel; options: MapOptions; pack: ArtPack | null } | null = null
  /** A new layout that came while a mole was out on a trip. It is drawn when no mole is. */
  private waiting: { layout: Layout; model: OfficeModel; options: MapOptions; pack: ArtPack | null } | null = null
  private model: OfficeModel | null = null
  private occupants = new Map<string, Occupant>()
  private whereaboutsByKey = new Map<string, Whereabouts>()
  private away: { key: string; point: Point }[] = []
  private presenceSignature: string | null = null
  private bufferedSeats: string[] = []
  private selectionLayout: Layout | null = null
  private selectionSignature = ''
  private seats = new VisibleIndex<string>([])
  private scenery = new SceneryIndex()
  private roads = new VisibleIndex<{ ring: Float64Array; order: number }>([])
  private tiles = new Map<string, HTMLCanvasElement>()
  private dressingTiles = new SceneryTiles()
  private forestTiles = new SceneryTiles()
  private forest: Woodland | null = null
  private forestKey = ''
  private patterns = new WeakMap<CanvasRenderingContext2D, Map<string, { version: number; tile: HTMLCanvasElement; pattern: CanvasPattern }>>()
  private tileVersion = 0
  private options: MapOptions = { project: null, search: '', language: 'en', theme: 'light', selected: null, workAvailable: false, still: true, wave: null }
  private nameplates: Nameplates | null = null
  private plates = new Map<string, Rect>()
  private plateStates = new Map<string, { mode: 'seat' | 'feet' | undefined; rect?: Rect }>()
  private plateGlides = new Map<string, { started: number; from: Rect }>()
  private plateFrame: number | null = null
  /** The visible map the plates were last drawn for, and where the middle of each plate's mole is drawn. */
  private platesView: Camera | null = null
  private moleMiddles = new Map<string, Point[]>()
  private pack: ArtPack | null = null
  private lookFrames = new LookFrames(undefined,undefined,undefined,undefined,pageCompositions)
  private contacts = new NativeContacts()
  readonly actions: ActionRuntime
  private actionBindings = new Map<string, ActionBinding>()
  /** The moles whose work is settled, which the page may send walking from their foot. */
  private freeToWalk: ReadonlySet<string> = new Set()
  /** The moles at work behind their desks at the last update: their facts say their work is not
   * settled, they are not away, and their seat has a desk. */
  private atWork: ReadonlySet<string> = new Set()
  /** The moles whose work became settled while they were at work behind their desks. Each stays
   * drawn there, and with motion leaves its desk by walking from there across its own station. */
  private heldAtDesk: ReadonlySet<string> = new Set()
  /** The facility place of each idle agent that has one, from facilityPlaces. */
  private atFacility: ReadonlyMap<string, FacilityPlace> = new Map()
  private bindingInput: Layout | null = null
  private bindingLayout: Layout | null = null
  private bindingSignature = ''
  private bindingTransition = false
  private actionAppearance = ''
  private actionSource: ArtPack | null = null
  private lookPack: ArtPack | null = null
  private sleepCast = new SelectedPack(async () => {
    const assets = await import('./sleep-cast-assets.ts')
    return { scenery: {}, portraits: {}, atlases: assets.atlases, dimensions: assets.dimensions }
  })
  private sleepPack: ArtPack | null = null
  private sleepGeneration = 0
  private sleepDemand = false
  private sleepAttempted = false
  private sleepPrepared = false
  private sleepPainted = false
  private sleepFrameHasReady = false
  private sleepRecipes = ''
  private furnitureBuild = new SlicedBuild<Rect[] | null>()
  private furnitureLayout: Layout | null = null
  private furniturePack: ArtPack | null = null
  private furnitureValue: Rect[] | null = null
  private furniturePending = false
  private furnitureReady = false
  private idleLookRequest = ''
  private idleLookReady = ''
  private idleLookVersion = 0
  private lookEpoch = 0
  private frameLookEpoch = -1
  private lookState = 'unloaded'
  private moving: MovingContact[] = []
  private camera: Camera | null = null
  private signature = ''
  private ratio = 1
  private zoom = 1
  private padding = { x: 0, y: 0 }
  private opening = true
  private dpr = 0
  private individuals = false
  private villagePlan: VillageOverview | null = null
  private populationLabels = new Map<string, PopulationLabel>()
  private closed = false
  private namesLeftOut = false
  /** The visible left edge of the map the house signs were last placed for, and the area names they stop short of. */
  private signsLeft = -Infinity
  private signHeaders: AreaLabelHeader[] = []
  private namesChanged: (leftOut: boolean) => void
  private layoutDrawn: () => void
  private follow: string | null = null
  private pointers = new Map<number, Point>()
  private pinch = 0
  private dragged = false
  private press: Point | null = null
  private resize: ResizeObserver
  private releases: (() => void)[] = []
  constructor(private view: HTMLElement, private pin: (key: string) => void, private inspect: (key: string | null) => void,
    private viewportChanged: () => void, private manual: () => void, private factsChanged: (ids: string[]) => void = () => {}, dependencies: { actionClock?: ActionClock; namesChanged?: (leftOut: boolean) => void; layoutDrawn?: () => void } = {}) {
    this.namesChanged = dependencies.namesChanged ?? (() => {})
    this.layoutDrawn = dependencies.layoutDrawn ?? (() => {})
    this.actions = new ActionRuntime(() => { if (this.camera && !this.closed) this.dynamic([{ x:this.camera.left,y:this.camera.top,width:this.camera.width,height:this.camera.height }]) }, () => this.lookFrames.original('stand-tuft'), dependencies.actionClock)
    this.actions.onSettled(() => setTimeout(() => {
      if (!this.closed && this.bindingInput && this.model) this.update(this.bindingInput, this.model, this.options, this.pack)
    }, 0))
    this.canvas.dataset['lookReady'] = 'false'; this.canvas.dataset['lookState'] = 'unloaded'
    const hooks = screenTestHooks()
    if (hooks) hooks.actions = { snapshot: () => this.actions.snapshot(), evidence: key => this.actions.evidence(key) }
    if (hooks) hooks.drawnAt = key => {
      const drawn = drawnAt(this.layout, this.whereaboutsByKey, this.occupants, this.atFacility, this.actionBindings, this.freeToWalk, key)
      const place = this.atFacility.get(key), seat = this.layout?.seats[key]
      const desk = seat && this.layout?.pieces.find(piece => piece.sprite === 'worker-desk' && piece.x === seat.desk.x && piece.y === seat.desk.y && piece.width === seat.desk.width && piece.height === seat.desk.height)
      return drawn ? { point: { x: drawn.point.x, y: drawn.point.y }, depth: drawn.depth ?? null, action: this.actionBindings.get(key)?.action ?? null, desk: desk ? { x: desk.x, y: desk.y, width: desk.width, height: desk.height, depth: desk.depth } : null, ...place ? { facility: { room: place.room, index: place.index, activity: place.activity, pose: place.pose } } : {} } : null
    }
    if (hooks) hooks.setCamera = zoom => {
      this.clearZooms(); this.setZoom(zoom)
      const key = this.model?.occupants[0]?.key, seat = key && this.layout?.seats[key]
      if (seat) this.center(seat.foot)
    }
    this.plane.className = 'map-plane'; this.targets.className = 'map-targets'; this.targets.style.zIndex = '1'
    for (const key of Object.keys(this.canvas.dataset)) delete this.canvas.dataset[key]
    this.canvas.setAttribute('aria-hidden', 'true'); this.plane.append(this.canvas, this.targets); view.append(this.plane)
    this.listen(view, 'scroll', () => {
      this.holdView()
      // A burst only queues one turn. Layout reads, the full repaint and walk
      // visibility checks belong to that later turn, never the input event.
      if (this.closed || this.scrollTimer !== null) return
      this.scrollTimer = setTimeout(() => {
        this.scrollTimer = null
        this.paint(); this.followSigns(); this.followPlates(); this.viewportChanged()
      }, 0)
    })
    this.listen(view, 'keydown', event => this.key(event as KeyboardEvent))
    this.listen(view, 'pointerdown', event => this.down(event as PointerEvent))
    this.listen(view, 'pointermove', event => this.move(event as PointerEvent))
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(view, name, event => {
      const id = (event as PointerEvent).pointerId
      if (name === 'lostpointercapture' && this.view.hasPointerCapture(id)) return
      this.pointers.delete(id); this.pinch = 0
    })
    this.listen(view, 'click', event => { if (this.dragged && (event as MouseEvent).detail) { event.preventDefault(); event.stopImmediatePropagation() } }, { capture: true })
    this.listen(view, 'wheel', event => {
      const wheel = event as WheelEvent
      this.cancelFollow()
      if (!Number.isFinite(wheel.deltaY) || !wheel.deltaY) return
      event.preventDefault()
      this.scale(Math.exp(-wheel.deltaY * (wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? view.clientHeight : 1) * .002))
    }, { passive: false })
    this.resize = new ResizeObserver(() => { this.paint(); this.followPlates() }); this.resize.observe(view)
  }
  update(layout: Layout, model: OfficeModel, options: MapOptions, pack: ArtPack | null): void {
    if (this.closed) return
    if (layout === this.bindingLayout && this.bindingInput) layout = this.bindingInput
    // A roster change never cuts across a walk: while a mole is out, a new layout waits, and the
    // trips underway finish in the layout they began in. Under reduced motion nobody is out.
    const drawn = this.bindingInput
    if (drawn && !drawn.preview && layout !== drawn && !layout.preview && this.moving.length && !options.still) {
      this.waiting = { layout, model, options, pack }; this.canvas.dataset['layoutWaiting'] = 'true'
      return
    }
    if (layout !== drawn) this.waiting = null
    this.canvas.dataset['layoutWaiting'] = String(this.waiting !== null)
    const layoutChanged = this.bindingInput !== layout
    const appearance = bindingSignature(model)
    const places = layout.places ? { play: layout.places.play.length, sleep: layout.places.sleep.length } : { play: 0, sleep: 0 }
    const found = whereabouts(model.occupants.map(occupant => ({ id: occupant.agent.id, retired: occupant.agent.retired })), options.online ?? null, options.asleep ?? new Set(), places)
    this.whereaboutsByKey = new Map(model.occupants.map(occupant => [occupant.key, found.get(occupant.agent.id) ?? { where: 'desk' }]))
    const awayKeys = new Set(model.occupants.filter(occupant => (this.whereaboutsByKey.get(occupant.key)?.where ?? 'desk') !== 'desk').map(occupant => occupant.key))
    const available = (actor: Occupant) => actor.facts ? true : options.workAvailable
    const eligible = model.occupants.filter(actor => onlineIdleEligible(actor, available(actor))).map(actor => actor.key)
    // A mole drawn at work behind its desk that turns idle is still drawn there: giving it its foot
    // or a facility place would make it jump. A preview has no seats and changes neither set.
    if (!layout.preview) {
      const seated = (key: string) => !awayKeys.has(key) && (layout.seats?.[key]?.desk?.width ?? 0) > 0
      this.heldAtDesk = new Set(eligible.filter(key => seated(key) && (this.heldAtDesk.has(key) || this.atWork.has(key))))
      this.atWork = new Set(model.occupants.filter(actor => seated(actor.key) && onlineAtWork(actor, available(actor))).map(actor => actor.key))
    }
    this.freeToWalk = new Set(eligible.filter(key => !this.heldAtDesk.has(key)))
    const idle = new Set(model.occupants.filter(actor => {
      if (!this.freeToWalk.has(actor.key)) return false
      const group = moleGroup(actor.work, true)
      if (group !== 'handoff' && group !== 'completed') return true
      const token = workIntent(actor.work)
      return token === null || this.actions.settled(actor.key, token)
    }).map(actor => actor.key))
    // Working actors stay at their assigned full-size desks. Idle actors may finish an
    // already admitted action before leaving; actors at play or asleep are away.
    const excluded = new Set([...awayKeys, ...model.occupants.filter(actor => !this.freeToWalk.has(actor.key)).map(actor => actor.key)])
    const binding = appearance + ':' + JSON.stringify([...idle].sort()) + ':' + JSON.stringify([...excluded].sort())
    if (this.bindingInput !== layout || this.bindingSignature !== binding) {
      const bound = bindActions(layout,model,idle,excluded)
      if (this.bindingInput && this.bindingLayout !== bound.layout) this.bindingTransition = true
      this.bindingInput = layout; this.bindingSignature = binding; this.bindingLayout = bound.layout; this.actionBindings = bound.bindings
      this.canvas.dataset['actionBindingsRejected'] = JSON.stringify(bound.rejected)
    }
    // An actor without a bound action cannot wait for an action to settle. Reduced
    // motion also has no action to wait for; those idle actors may use a place as a still.
    const facilityIdle = new Set([...this.freeToWalk].filter(key => !awayKeys.has(key) && (options.still || idle.has(key) || !this.actionBindings.has(key))))
    this.atFacility = layout.preview ? new Map() : facilityPlaces(layout, facilityIdle)
    layout = this.bindingLayout ?? layout
    if (layoutChanged || this.actionSource !== pack || this.actionAppearance !== appearance) { this.actions.invalidate(this.actionSource !== pack,this.actionAppearance !== appearance); this.actionSource = pack; this.actionAppearance = appearance }
    if (layout.preview) { this.selectionSignature = ''; this.factsChanged([]) }
    if (!layout.preview && this.preparingPreview) { if (this.firstPaint !== null) clearTimeout(this.firstPaint); this.firstPaint = null; this.preparingPreview = false }
    if (layout.preview && this.pending) { this.indexBuild.cancel(); this.pending = null; this.indexedLayout = null; this.indexes = null }
    if (!layout.preview && this.indexedLayout !== layout) {
      const building = this.pending?.layout === layout && this.pending.pack === pack
      this.canvas.dataset['indexReady'] = 'false'
      this.pending = { layout, model, options, pack }
      if (!building) this.indexBuild.start((function* (map: OfficeMap) {
        const indexes = yield* layoutIndexes(layout)
        if (map.pack !== pack) {
          for (const tile of map.tiles.values()) surfaces.release(tile)
          map.tiles.clear(); map.tileVersion++; map.pack = pack
        }
        // First-use bitmap copies get their own slices before the first complete paint.
        yield; map.pattern(map.background.getContext('2d', { willReadFrequently: true })!, 'grass-0'); yield
        map.pattern(map.background.getContext('2d', { willReadFrequently: true })!, 'earth-0'); yield
        return indexes
      })(this), indexes => {
        const pending = this.pending; this.pending = null
        if (this.closed || !pending || pending.layout !== layout) return
        this.indexedLayout = layout; this.indexes = indexes
        this.update(pending.layout, pending.model, pending.options, pending.pack)
        this.layoutDrawn()
      })
      return
    }
    if (this.layout !== layout || this.pack !== pack) { this.dressingTiles.clear(); this.forestTiles.clear(); this.forest = null; this.forestKey = '' }
    const firstPreview = layout.preview && this.layout !== layout
    const presence = JSON.stringify([
      options.online === undefined || options.online === null ? null : [...options.online].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      [...(options.asleep ?? [])].sort(),
    ])
    const presenceChanged = this.presenceSignature != null && presence !== this.presenceSignature
    this.presenceSignature = presence
    const changed = this.layout !== layout || this.model !== model || JSON.stringify(options) !== JSON.stringify(this.options) || this.pack !== pack || presenceChanged
    const staticChanged = this.layout !== layout || this.pack !== pack || this.options.theme !== options.theme || this.options.language !== options.language ||
      JSON.stringify(this.model?.rooms.map(room => [room.id, room.leader])) !== JSON.stringify(model.rooms.map(room => [room.id, room.leader]))
    if (this.model !== model) this.occupants = new Map(model.occupants.map(occupant => [occupant.key, occupant]))
    const away: { key: string; point: Point }[] = []
    for (const occupant of model.occupants) {
      const where = this.whereaboutsByKey.get(occupant.key)
      if (where?.where !== 'play' && where?.where !== 'sleep') continue
      const point = whereaboutsPoint(layout, occupant.key, where)
      if (point) away.push({ key: occupant.key, point })
    }
    this.away = away
    if (this.layout !== layout) {
      this.seats = this.indexes?.seats ?? new VisibleIndex([])
      this.scenery = this.indexes?.scenery ?? new SceneryIndex()
      this.roads = this.indexes?.roads ?? new VisibleIndex([])
      this.nameplates = this.indexes?.nameplates ?? null
      this.canvas.dataset['indexReady'] = 'false'
    }
    if (this.pack !== pack) {
      for (const tile of this.tiles.values()) surfaces.release(tile); this.tiles.clear(); this.tileVersion++
    }
    if (this.lookPack !== pack) {
      this.clearSleepingLooks()
      this.lookPack = pack
      const epoch = ++this.lookEpoch
      this.frameLookEpoch = -1; this.lookState = pack ? 'loading' : 'unloaded'
      this.canvas.dataset['lookReady'] = 'false'; this.canvas.dataset['lookState'] = this.lookState
      this.lookFrames.release()
      this.contacts.release()
      if (pack) void this.contacts.select(pack).then(ready => { if (ready && !this.closed && this.lookEpoch === epoch) { this.signature = ''; this.paint() } })
      if (pack) void this.lookFrames.select(pack).then(ready => {
        if (this.closed || this.lookEpoch !== epoch || this.lookPack !== pack) return
        this.lookState = ready ? 'prepared' : 'failed'; this.canvas.dataset['lookState'] = this.lookState
        if (ready) { this.prepareSleepingLooks?.(); this.viewportChanged?.() }
        if (ready && this.camera) this.dynamic([{ x: this.camera.left, y: this.camera.top, width: this.camera.width, height: this.camera.height }], true)
      })
    }
    const untouchedOpening = this.opening && this.zoom === 1 && this.pendingZoom === null && this.view.scrollLeft === 0 && this.view.scrollTop === 0
    const anchor = this.layout && this.layout !== layout && !untouchedOpening ? this.actualCamera() : null
    if (this.furnitureLayout && (this.furnitureLayout !== layout || this.furniturePack !== pack)) this.clearMotionFurniture()
    this.layout = layout; this.model = model; this.options = options; this.pack = pack
    const hooks = screenTestHooks(); if (hooks) hooks.layout = layout
    this.prepareSleepingLooks?.()
    this.refreshActionNeeds()
    this.sizePlane()
    if (anchor) {
      this.view.scrollLeft = (anchor.left - layout.bounds.x) * this.zoom + this.padding.x
      this.view.scrollTop = (anchor.top - layout.bounds.y) * this.zoom + this.padding.y
    }
    if (staticChanged) this.signature = ''
    // The loading overview has no seats. Choose an occupied place once the real
    // layout is indexed; later reads and paints retain the reader's camera.
    if (this.opening && !layout.preview) {
      const first = model.occupants[0], seat = first && layout.seats[first.key]
      if (seat) {
        this.opening = false
        // A camera already moved or zoomed during loading belongs to the reader.
        // Keep this check here, with no new work in the pan or frame handlers.
        // The view opens on the mole where it is drawn, which at its desk is not its foot.
        const drawn = drawnAt(layout, this.whereaboutsByKey, this.occupants, this.atFacility, this.actionBindings, this.freeToWalk, first.key)
        if (drawn && this.zoom === 1 && this.pendingZoom === null && this.view.scrollLeft === 0 && this.view.scrollTop === 0) this.center(drawn.point)
      }
    }
    if (firstPreview) {
      if (this.firstPaint !== null) clearTimeout(this.firstPaint)
      this.preparingPreview = true
      // Allocate the surfaces separately from rasterizing the first overview.
      this.firstPaint = setTimeout(() => {
        const size = surfaceSize(this.bufferCamera(), this.zoom, window.devicePixelRatio || 1, 3)
        for (const canvas of [this.frame ??= surfaces.take(), this.background]) { canvas.width = size.width; canvas.height = size.height }
        this.firstPaint = setTimeout(() => { this.firstPaint = null; this.preparingPreview = false; this.paint() }, 0)
      }, 0)
      return
    }
    if (this.preparingPreview) return
    this.paint()
    if (changed && !staticChanged && this.camera) {
      this.dynamic([{ x: this.camera.left, y: this.camera.top, width: this.camera.width, height: this.camera.height }], true)
    }
  }
  isVisible(key: string): boolean {
    const seat = this.layout?.seats[key]
    return whereaboutsAt(this.whereaboutsByKey, this.occupants, key).where === 'desk' && this.individuals && !!seat && !!this.camera && overlapsCamera(seatRect(seat), this.actualCamera())
  }
  pointVisible(point: Point): boolean { return this.individuals && !!this.layout && overlapsCamera(actorRect(point), this.actualCamera()) }
  drawnScale(key: string): number {
    const occupant = this.occupants.get(key)
    if (!occupant || (!!this.layout?.ownership && !this.individuals)) return DEFAULT_MOLE_SCALE
    return actorScale(occupant)
  }
  /** What stands in the paper's arc at this play place, or null when the frame cannot be judged. */
  paperBlockers(point: Point, blockers: readonly Rect[]): Rect[] | null {
    const frame = this.pack?.sources.sprites?.['paper-stack']
    if (!frame || !this.pack?.images.has(frame.atlas)) return null
    return paperArcBlockers(point, frame, blockers, PAPER_ARC_SHIFT)
  }
  paperClear(point: Point, blockers: readonly Rect[]): boolean {
    const blocked = this.paperBlockers(point, blockers)
    return blocked !== null && blocked.length === 0
  }
  /** Where a key is drawn: its desk, its play place or its sleep place. A hidden agent has none.
   * A mole held at its desk is drawn behind it, and its walks start and end there. */
  drawnPoint(key: string): Point | null { return this.heldAtDesk.has(key) ? this.drawnFigure(key) : pointAt(this.layout, this.whereaboutsByKey, this.occupants, this.atFacility, key) }
  /** The station a mole leaves as it walks: its own, for a mole held at its desk, which goes round
   * the desk from behind it. Any other mole has none. */
  ownStation(key: string): string | undefined { return this.heldAtDesk.has(key) ? key : undefined }
  /** Where a figure that is not walking is drawn: behind its desk for one at work, otherwise at drawnPoint. A walk keeps clear of it there. */
  drawnFigure(key: string): Point | null { return drawnAt(this.layout, this.whereaboutsByKey, this.occupants, this.atFacility, this.actionBindings, this.freeToWalk, key)?.point ?? null }
  whereaboutsOf(key: string): Whereabouts { return whereaboutsAt(this.whereaboutsByKey, this.occupants, key) }
  /** Movement waits for the participating recoloured poses; stale asynchronous
   * completions cannot restart it after the scene or motion is disabled. */
  readyIdleLooks(ids: readonly string[], changed: () => void): boolean {
    const recipes: number[] = []
    for (const id of ids) {
      const occupant = this.occupants.get(id); if (!occupant) return false
      if (standingClothes(occupant.standing)) recipes.push(occupant.standing.recipe!)
    }
    if (!recipes.length) { if (this.idleLookRequest || this.idleLookReady) this.clearIdleLooks(); return true }
    if (!this.pack || !this.lookFrames.ready || this.frameLookEpoch !== this.lookEpoch || this.canvas.dataset['lookReady'] !== 'true') return false
    const key = JSON.stringify([this.lookEpoch, [...new Set(recipes)].sort((a, b) => a - b)])
    if (this.idleLookReady === key) return true
    if (this.idleLookRequest !== key) {
      this.idleLookRequest = key; this.idleLookReady = ''
      const version = this.idleLookVersion = (this.idleLookVersion ?? 0) + 1, pack = this.pack
      void this.lookFrames.prepareMotion(pack, recipes).then(ready => {
        if (this.closed || this.idleLookVersion !== version || this.idleLookRequest !== key || this.pack !== pack) return
        if (ready) this.idleLookReady = key
        changed()
      })
    }
    return false
  }
  clearIdleLooks(): void {
    this.idleLookVersion = (this.idleLookVersion ?? 0) + 1; this.idleLookRequest = ''; this.idleLookReady = ''
    this.lookFrames.clearMotion()
  }
  /** Full conservative extents of drawn solid artwork, including its trim,
   * scale and cropped tiles. Unknown artwork prevents a route. */
  *motionFurnitureSteps(walls: Readonly<Record<string, { pixelHash: string; rects: number[][] }>> = wallAlpha.sprites): Generator<void, Rect[] | null> {
    const layout = this.layout, pack = this.pack
    if (!layout || !pack) return null
    const result: { x: number; y: number; width: number; height: number; station?: string }[] = []
    // A desk and the things on it name the station whose desk it is: a mole that leaves that
    // desk from where it worked may overlap them only on its sitting line.
    const desks = yield* VisibleIndex.build(Object.entries(layout.seats ?? {}).filter(([, seat]) => (seat?.desk?.width ?? 0) > 0).map(([key, seat]) => ({ value: key, rect: seat.desk })))
    for (const item of layout.pieces) {
      yield
      if (item.layer === 'floor') continue
      if ((item as ContactPiece).contactSize) { result.push({ x: item.x, y: item.y, width: item.width, height: item.height }); continue }
      const near = { left: item.x - DESK_REACH, top: item.y - DESK_REACH, width: item.width + 2 * DESK_REACH, height: item.height + 2 * DESK_REACH }
      const station = desks.query(near).find(key => { const desk = layout.seats[key]!.desk; return item.sprite === 'worker-desk' ? item.x === desk.x && item.y === desk.y : standsOn(item, desk) })
      const tag = station === undefined ? {} : { station }
      const frame = pack.sources.sprites?.[item.sprite]
      if (!frame || !frame.rect || !frame.trim || !frame.size || !pack.images.has(frame.atlas)) return null
      const scale = item.scale ?? 1, [tx, ty] = frame.trim, [, , width, height] = frame.rect
      if (![item.x, item.y, scale, tx, ty, width, height].every(Number.isFinite) || scale <= 0 || width! <= 0 || height! <= 0) return null
      const mask = walls[item.sprite], pixelHash = (frame as typeof frame & { pixelHash?: string }).pixelHash
      let matches = (item.layer === 'back' || item.layer === 'front') && !!mask && mask.pixelHash === pixelHash
      if (matches && mask) for (const rect of mask.rects) {
        yield
        if (!(rect.length === 4 && rect.every(Number.isFinite) && rect[0]! >= 0 && rect[1]! >= 0 && rect[2]! > 0 && rect[3]! > 0 && rect[0]! + rect[2]! <= frame.size[0]! && rect[1]! + rect[3]! <= frame.size[1]!)) { matches = false; break }
      }
      const regions = matches && mask ? mask.rects : [[tx!, ty!, width!, height!]]
      // The fragment shape is supplied by the layout interface. Every crop
      // uses the same native origin, destination offset and scale as drawing.
      const fragments = (item as Piece & { fragments?: readonly { x: number; y: number; crop: Rect }[] }).fragments
      if (fragments !== undefined) {
        if (!Array.isArray(fragments) || !fragments.length || item.crop || ![frame.size[0], frame.size[1], item.width, item.height].every(Number.isFinite)) return null
        for (const fragment of fragments) {
          yield
          const crop = fragment?.crop
          if (!crop || ![fragment.x, fragment.y, crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || fragment.x < 0 || fragment.y < 0 || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > frame.size[0]! || crop.y + crop.height > frame.size[1]! || (fragment.x + crop.width) * scale > item.width || (fragment.y + crop.height) * scale > item.height) return null
          for (const [left, top, regionWidth, regionHeight] of regions) {
            yield
            const x = Math.max(left!, crop.x), y = Math.max(top!, crop.y)
            const right = Math.min(left! + regionWidth!, crop.x + crop.width), bottom = Math.min(top! + regionHeight!, crop.y + crop.height)
            if (right <= x || bottom <= y) continue
            result.push({ x: item.x + (fragment.x + x - crop.x) * scale, y: item.y + (fragment.y + y - crop.y) * scale, width: (right - x) * scale, height: (bottom - y) * scale, ...tag })
          }
        }
        continue
      }
      for (const [left, top, regionWidth, regionHeight] of regions) {
        yield
        let x = left!, y = top!, right = x + regionWidth!, bottom = y + regionHeight!
        if (item.crop) {
          x = Math.max(x, item.crop.x); y = Math.max(y, item.crop.y)
          right = Math.min(right, item.crop.x + item.crop.width); bottom = Math.min(bottom, item.crop.y + item.crop.height)
          if (right <= x || bottom <= y) continue
        }
        result.push({ x: item.x + (x - (item.crop?.x ?? 0)) * scale, y: item.y + (y - (item.crop?.y ?? 0)) * scale, width: (right - x) * scale, height: (bottom - y) * scale, ...tag })
      }
    }
    return result
  }
  /** Synchronous convenience for small studies; the page uses the sliced owner. */
  motionFurniture(walls: Readonly<Record<string, { pixelHash: string; rects: number[][] }>> = wallAlpha.sprites): Rect[] | null {
    const work = OfficeMap.prototype.motionFurnitureSteps.call(this, walls)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  readyMotionFurniture(changed: () => void): boolean {
    const layout = this.layout, pack = this.pack
    if (!layout || !pack) { this.clearMotionFurniture(); return false }
    if (this.furnitureLayout !== layout || this.furniturePack !== pack) this.clearMotionFurniture()
    if (this.furnitureReady) return this.furnitureValue !== null
    if (!this.furniturePending) {
      this.furnitureLayout = layout; this.furniturePack = pack; this.furniturePending = true
      this.furnitureBuild.start(this.motionFurnitureSteps(), value => {
        if (this.closed || this.layout !== layout || this.pack !== pack) return
        this.furniturePending = false; this.furnitureReady = true; this.furnitureValue = value; changed()
      })
    }
    return false
  }
  motionFurnitureSnapshot(): Rect[] | null { return !this.pending && !this.bindingTransition && this.furnitureReady ? this.furnitureValue : null }
  clearMotionFurniture(): void {
    this.furnitureBuild.cancel(); this.furnitureLayout = null; this.furniturePack = null
    this.furnitureValue = null; this.furniturePending = false; this.furnitureReady = false
  }
  /** Relative visible bounds for the current appearance and all moving poses. */
  motionBounds(key: string): { x: number; y: number; width: number; height: number } | null {
    if (this.pending || this.bindingTransition) return null
    const occupant = this.occupants.get(key), sprites = this.pack?.sources.sprites
    if (!occupant || !sprites || !this.individuals) return null
    const scale = actorScale(occupant)
    const body = visualBodyBounds(occupant.standing.look, scale, sprites)
    if (!body) return null
    for (const name of [`stand-${occupant.standing.look}`, `walk-${occupant.standing.look}-A`, `walk-${occupant.standing.look}-pass`, `walk-${occupant.standing.look}-B`, `wave-${occupant.standing.look}`, `cheer-${occupant.standing.look}`, `carry-${occupant.standing.look}`]) if (!this.pack?.images.has(sprites[name]!.atlas)) return null
    if (whereaboutsAt(this.whereaboutsByKey, this.occupants, key).where === 'sleep') {
      const frame = sprites[`sleep-${occupant.standing.look}`]
      if (frame) {
        if (!frame.trim || !frame.rect || !frame.anchor) return null
        const [x, y] = frame.trim, [, , width, height] = frame.rect, [ax, ay] = frame.anchor
        if (![x, y, width, height, ax, ay].every(Number.isFinite) || width! <= 0 || height! <= 0) return null
        const left = Math.min(body.x, (x! - ax!) * scale - 1e-6), top = Math.min(body.y, (y! - ay!) * scale - 1e-6)
        const right = Math.max(body.x + body.width, (x! - ax! + width!) * scale + 1e-6), bottom = Math.max(body.y + body.height, (y! - ay! + height!) * scale + 1e-6)
        return { x: left, y: top, width: right - left, height: bottom - top }
      }
    }
    if (this.actionBindings.has(key)) {
      const action = this.actions.collisionBounds(); if (!action) return null
      const left = Math.min(body.x, action.x * scale), top = Math.min(body.y, action.y * scale)
      const right = Math.max(body.x + body.width, (action.x + action.width) * scale), bottom = Math.max(body.y + body.height, (action.y + action.height) * scale)
      return { x: left, y: top, width: right - left, height: bottom - top }
    }
    return body
  }

  locate(key: string): void {
    const point = drawnAt(this.layout, this.whereaboutsByKey, this.occupants, this.atFacility, this.actionBindings, this.freeToWalk, key)?.point
    if (!point) return
    if (this.layout?.villages?.length && this.zoom < .25) this.setZoom(1)
    this.center(point)
  }
  showRoom(id: string): void {
    const room = this.layout?.rooms.find(room => room.id === id); if (!room) return
    this.cancelFollow(); this.clearZooms()
    this.setZoom(Math.min(1, this.view.clientWidth / (room.width + 64), this.view.clientHeight / (room.height + 64)))
    this.center({ x: room.x + room.width / 2, y: room.y + room.height / 2 })
  }
  setFollow(key: string | null): void { this.follow = key }
  cancelFollow(): void { if (this.follow) { this.follow = null; this.manual() } }
  scale(factor: number): void { this.cancelFollow(); this.queueZoom((this.pendingZoom ?? this.zoom) * factor) }
  fit(): void {
    if (!this.layout) return
    const gutter = this.layout.ownership ? 48 : 0
    this.cancelFollow(); this.clearZooms(); this.setZoom(Math.min((this.view.clientWidth - gutter) / this.layout.bounds.width, (this.view.clientHeight - gutter) / this.layout.bounds.height))
    this.view.scrollLeft = 0; this.view.scrollTop = 0; this.paint()
  }
  animate(points: MovingContact[]): void {
    if (this.closed) return
    this.moving = this.options.still ? [] : points
    // The last trip has ended: draw the waiting layout in one step, after the walker that ended it
    // has finished its own turn.
    if (this.waiting && !this.moving.length) queueMicrotask(() => this.drawWaiting())
    this.refreshActionNeeds()
    if (this.camera && this.layout && this.model) this.selectFacts(this.bufferedSeats)
    const following = points.find(walk => walk.from === this.follow)
    if (following) this.center(following.point)
    if (this.camera) {
      // Restore the complete composed area so neither an earlier body nor a displaced
      // label leaves pixels behind, including after a repaint cancels a partial draw.
      this.dynamic([{ x: this.camera.left, y: this.camera.top, width: this.camera.width, height: this.camera.height }], true)
    }
  }

  /** True while the map has not drawn the newest layout it was given: it waits for the trips
   * underway, or its indexes are still being built. No new trip may start in either. */
  layoutChanging(): boolean { return this.waiting !== null || (this.layout !== null && this.pending !== null) }
  /** True while a mole is drawn out on a trip, an idle outing or a contact walk. */
  inMotion(): boolean { return this.moving.length > 0 }
  /** The key of the layout drawn now, which is not the newest one while a layout waits. */
  drawnLayoutKey(): string | null { return this.layout?.key ?? null }
  private drawWaiting(): void {
    const waiting = this.waiting
    if (this.closed || !waiting || this.moving.length) return
    this.update(waiting.layout, waiting.model, waiting.options, waiting.pack)
    this.layoutDrawn()
  }

  dispose(): void {
    if (this.closed) return
    this.clearSleepingLooks(); this.clearMotionFurniture(); this.actions.dispose(); this.contacts.release()
    const hooks = screenTestHooks(); if (hooks) { delete hooks.actions; delete hooks.drawnAt; delete hooks.layout; delete hooks.paintedActors }
    this.lookFrames.release()
    this.lookPack = null
    this.lookEpoch++; this.frameLookEpoch = -1; this.lookState = 'unloaded'
    this.canvas.dataset['lookReady'] = 'false'; this.canvas.dataset['lookState'] = 'unloaded'
    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer)
    this.scrollTimer = null
    if (this.plateFrame !== null) cancelAnimationFrame(this.plateFrame)
    this.plateFrame = null; this.plateGlides.clear(); this.plateStates.clear()
    this.closed = true; this.painting.cancel(); this.dynamics.cancel(); this.drawingDynamic = false; this.repainting = false; this.pendingDynamic = null; if (this.zoomTimer !== null) clearTimeout(this.zoomTimer); this.zoomTimer = null; this.pendingZoom = null; this.zooms = []; if (this.firstPaint !== null) clearTimeout(this.firstPaint); this.firstPaint = null; this.preparingPreview = false; this.indexBuild.cancel(); this.pending = null; this.waiting = null; this.indexes = null; this.indexedLayout = null; this.resize.disconnect(); for (const release of this.releases) release()
    this.releases = []; surfaces.release(this.canvas); surfaces.release(this.background); if (this.frame) surfaces.release(this.frame); this.frame = null
    this.plane.remove(); this.pack = null; this.layout = null; this.model = null; this.occupants.clear(); this.moving = []; this.bufferedSeats = []; this.selectionLayout = null; this.selectionSignature = ''; this.away = []
    this.seats = new VisibleIndex([]); this.scenery = new SceneryIndex(); this.pointers.clear()
    this.roads = new VisibleIndex([])
    for (const tile of this.tiles.values()) surfaces.release(tile)
    this.tiles.clear(); this.tileVersion++
    this.nameplates = null; this.plates.clear(); this.villagePlan = null; this.populationLabels.clear()
    this.dressingTiles.clear(); this.forestTiles.clear(); this.forest = null; this.forestKey = ''
  }
  private listen(target: EventTarget, name: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(name, handler, options); this.releases.push(() => target.removeEventListener(name, handler, options))
  }
  private sizePlane(): void {
    const bounds = this.layout!.bounds
    const padding = { x: Math.max(0, (this.view.clientWidth - bounds.width * this.zoom) / 2), y: Math.max(0, (this.view.clientHeight - bounds.height * this.zoom) / 2) }
    if (padding.x !== this.padding.x || padding.y !== this.padding.y) this.signature = ''
    this.padding = padding
    this.plane.style.width = `${bounds.width * this.zoom + 2 * this.padding.x}px`
    this.plane.style.height = `${bounds.height * this.zoom + 2 * this.padding.y}px`
    Object.assign(this.plane.dataset, { zoom: String(this.zoom), paddingX: String(this.padding.x), paddingY: String(this.padding.y) })
  }
  private bufferCamera(): Camera {
    return cameraFor(this.layout!.bounds, { scrollLeft: this.view.scrollLeft - this.padding.x, scrollTop: this.view.scrollTop - this.padding.y,
      clientWidth: this.view.clientWidth, clientHeight: this.view.clientHeight }, this.zoom)
  }
  private actualCamera(): Camera {
    const bounds = this.layout!.bounds
    return { left: bounds.x + (this.view.scrollLeft - this.padding.x) / this.zoom, top: bounds.y + (this.view.scrollTop - this.padding.y) / this.zoom,
      width: this.view.clientWidth / this.zoom, height: this.view.clientHeight / this.zoom }
  }
  private center(point: Point): void {
    const bounds = this.layout!.bounds
    this.view.scrollLeft = (point.x - bounds.x) * this.zoom + this.padding.x - this.view.clientWidth / 2
    this.view.scrollTop = (point.y - bounds.y) * this.zoom + this.padding.y - this.view.clientHeight / 2
    this.holdView()
    this.paint()
  }
  /** Keep the last complete view on screen if scrolling outruns its painted surface. */
  private holdView(force = false): void {
    const shown = this.shown; if (!shown) return
    const left = this.view.scrollLeft, top = this.view.scrollTop
    if (!force && !this.holdingView && left >= shown.left && top >= shown.top &&
      left + shown.viewWidth <= shown.left + shown.width && top + shown.viewHeight <= shown.top + shown.height) {
      shown.scrollLeft = left; shown.scrollTop = top; return
    }
    if (!this.holdingView) { this.dynamics.cancel(); this.drawingDynamic = false }
    this.holdingView = true
    this.canvas.style.left = `${shown.left + left - shown.scrollLeft}px`
    this.canvas.style.top = `${shown.top + top - shown.scrollTop}px`
    this.targets.style.visibility = 'hidden'
  }
  private clearZooms(): void {
    if (this.zoomTimer !== null) clearTimeout(this.zoomTimer)
    this.zoomTimer = null; this.pendingZoom = null; this.zooms = []
  }
  private queueZoom(value: number): void {
    if (!this.layout || this.closed) return
    const minimum = Math.min(.04, this.view.clientWidth / this.layout.bounds.width, this.view.clientHeight / this.layout.bounds.height)
    const next = Math.max(minimum, Math.min(2, value))
    if (next === (this.pendingZoom ?? this.zoom)) return
    this.pendingZoom = next; this.zooms.push(next)
    this.canvas.dataset['paintReady'] = 'false'
    if (!this.repainting) this.nextZoom()
  }
  private nextZoom(): void {
    if (this.zoomTimer !== null || this.closed) return
    if (!this.zooms.length) { this.pendingZoom = null; this.canvas.dataset['paintReady'] = 'true'; return }
    this.zoomTimer = setTimeout(() => {
      this.zoomTimer = null
      const next = this.zooms.shift()
      if (next !== undefined && !this.closed) this.setZoom(next)
      if (!this.repainting) this.nextZoom()
    }, 0)
  }
  private setZoom(value: number): void {
    if (!this.layout) return
    const center = this.actualCamera(), minimum = Math.min(.04, this.view.clientWidth / this.layout.bounds.width, this.view.clientHeight / this.layout.bounds.height)
    const next = Math.max(minimum, Math.min(2, value))
    if (next === this.zoom) { if (!this.repainting) this.canvas.dataset['paintReady'] = 'true'; return }
    this.holdView(true)
    this.zoom = next; if (next < .25) { this.selectionSignature = ''; this.factsChanged([]) }; this.sizePlane()
    this.signature = ''; this.center({ x: center.left + center.width / 2, y: center.top + center.height / 2 }); this.viewportChanged()
  }
  private paint(): void {
    if (this.closed || this.preparingPreview || !this.layout || !this.model) return
    this.refreshActionNeeds()
    this.sizePlane()
    // Keep the complete composed surface while its overscan still contains the viewport.
    // Scrolling moves the existing canvas; unchanged terrain, sprites and labels do no work.
    const actual = this.actualCamera(), bounds = this.layout.bounds, cached = this.camera
    if (this.signature && this.dpr === window.devicePixelRatio && cached && Math.max(bounds.x, actual.left) >= cached.left && Math.max(bounds.y, actual.top) >= cached.top &&
      Math.min(bounds.x + bounds.width, actual.left + actual.width) <= cached.left + cached.width &&
      Math.min(bounds.y + bounds.height, actual.top + actual.height) <= cached.top + cached.height) return
    const camera = this.bufferCamera()
    const signature = JSON.stringify([camera, this.zoom, window.devicePixelRatio])
    if (signature === this.signature) return
    this.signature = signature; this.camera = camera
    this.dynamics.cancel(); this.drawingDynamic = false; this.repainting = true
    if (!this.layout.preview) this.dynamic([{ x: camera.left, y: camera.top, width: camera.width, height: camera.height }], true)
    this.canvas.dataset['paintReady'] = 'false'
    this.painting.start(this.paintSteps(camera), () => {
      const actual = this.actualCamera(), bounds = this.layout!.bounds
      if (Math.max(bounds.x, actual.left) < camera.left || Math.max(bounds.y, actual.top) < camera.top ||
        Math.min(bounds.x + bounds.width, actual.left + actual.width) > camera.left + camera.width ||
        Math.min(bounds.y + bounds.height, actual.top + actual.height) > camera.top + camera.height) {
        this.signature = ''; this.repainting = false; this.paint(); return
      }
      this.present()
      this.repainting = false
      this.drawPendingDynamic()
      this.nextZoom()
    })
  }
  private present(): void {
    if (!this.frame || !this.camera || !this.layout) return
    const next = this.frame, previous = this.canvas, camera = this.camera
    for (const key of Object.keys(next.dataset)) delete next.dataset[key]
    Object.assign(next.dataset, previous.dataset)
    const previouslyReady = previous.dataset['lookReady'] === 'true'
    this.sleepPainted ||= this.sleepFrameHasReady; this.sleepFrameHasReady = false
    next.dataset['lookReady'] = String(this.lookFrames.ready && this.frameLookEpoch === this.lookEpoch)
    next.dataset['sleepState'] = this.sleepPainted ? 'ready' : this.sleepAttempted ? 'loading' : 'idle'
    next.dataset['lookState'] = this.lookState
    next.setAttribute('aria-hidden', 'true')
    const left = (camera.left - this.layout.bounds.x) * this.zoom + this.padding.x, top = (camera.top - this.layout.bounds.y) * this.zoom + this.padding.y
    const width = camera.width * this.zoom, height = camera.height * this.zoom
    Object.assign(next.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
    // One DOM turn presents only a complete frame. All raster copies stay sliced.
    this.plane.append(next); previous.remove()
    this.canvas = next; this.frame = previous
    this.shown = { left, top, width, height, scrollLeft: this.view.scrollLeft, scrollTop: this.view.scrollTop, viewWidth: this.view.clientWidth, viewHeight: this.view.clientHeight }
    this.holdingView = false; this.targets.style.visibility = ''
    const bindingReady = this.bindingTransition && !this.pending && this.layout === this.bindingLayout
    if (bindingReady) this.bindingTransition = false
    if (bindingReady || (!previouslyReady && next.dataset['lookReady'] === 'true')) this.viewportChanged?.()
    this.refreshActionNeeds()
    if (!this.layout.preview && this.lookFrames.ready && this.contacts.ready && this.frameLookEpoch === this.lookEpoch) this.actions.commitStatic()
  }
  private clearSleepingLooks(): void {
    this.sleepGeneration++; this.sleepDemand = false; this.sleepAttempted = false; this.sleepPrepared = false; this.sleepPainted = false; this.sleepFrameHasReady = false; this.sleepRecipes = ''
    this.sleepPack = null; this.sleepCast.release(); this.lookFrames.clearSleep()
  }
  private startSleepingLooks(): void {
    if (this.sleepDemand) return
    this.sleepDemand = true; this.prepareSleepingLooks()
  }
  private async touchSleepPack(pack: ArtPack, generation: number): Promise<boolean> {
    const steps = packTouchSteps(pack)
    while (generation === this.sleepGeneration && !this.closed) {
      if (steps.next().done) return true
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    return generation === this.sleepGeneration && !this.closed
  }
  private prepareSleepingLooks(): void {
    const pack = this.pack, epoch = this.lookEpoch
    const sleepers = [...this.whereaboutsByKey].filter(([, at]) => at.where === 'sleep')
    if (!sleepers.length) { this.clearSleepingLooks(); return }
    if (!pack || !this.sleepDemand) return
    if (!this.sleepPack) {
      if (this.sleepAttempted) return
      this.sleepAttempted = true
      const generation = this.sleepGeneration
      void this.sleepCast.select('woodland').then(async extra => {
        if (!extra || generation !== this.sleepGeneration || this.closed || this.pack !== pack) return
        if (pack.bytes + extra.bytes > ATLAS_BYTES) { this.sleepCast.release(); return }
        if (!await this.touchSleepPack(extra, generation) || this.pack !== pack) return
        this.sleepPack = { ...pack, images: new Map([...pack.images, ...extra.images]), bytes: pack.bytes + extra.bytes }
        this.prepareSleepingLooks()
      }).catch(() => { if (generation === this.sleepGeneration) this.sleepCast.release() })
      return
    }
    if (!this.lookFrames.ready) return
    const recipes: number[] = []
    for (const [key] of sleepers) {
      const occupant = this.occupants.get(key)
      if (occupant && standingClothes(occupant.standing)) recipes.push(occupant.standing.recipe!)
    }
    const recipeKey = JSON.stringify([...new Set(recipes)].sort((a, b) => a - b))
    if (this.sleepRecipes !== recipeKey) { this.sleepRecipes = recipeKey; this.sleepPrepared = false; this.sleepPainted = false; this.sleepFrameHasReady = false; this.lookFrames.clearSleep() }
    const generation = this.sleepGeneration, sleepPack = this.sleepPack
    const work = recipes.length ? this.lookFrames.prepareSleep(sleepPack, recipes) : Promise.resolve(true)
    void work.then(ready => {
      if (!ready || this.closed || this.sleepGeneration !== generation || this.lookEpoch !== epoch || this.lookPack !== pack || this.sleepPack !== sleepPack || this.sleepRecipes !== recipeKey) return
      this.sleepPrepared = true
      if (this.camera) this.dynamic([{ x: this.camera.left, y: this.camera.top, width: this.camera.width, height: this.camera.height }], true)
    })
  }
  setMotionActive(active: boolean): void { this.actions.setActive(active); this.refreshActionNeeds() }
  private refreshActionNeeds(): void {
    const candidates: ActionCandidate[] = []
    if (this.layout && this.model && !this.layout.preview && this.individuals && !this.options.still) {
      const camera = this.actualCamera()
      for (const actor of this.actors(this.bufferedSeats)) {
        const occupant = this.occupants.get(actor.key), binding = this.actionBindings.get(actor.key)
        if (!occupant || !binding || !nativeTuft(occupant) || actor.walk || whereaboutsAt(this.whereaboutsByKey, this.occupants, actor.key).where !== 'desk' || this.options.wave === actor.key || !overlapsCamera(actorRect(actor.point),camera) || projectMatch(occupant,null) === 'absent') continue
        const group = moleGroup(occupant.work,currentFacts(occupant) && (occupant.facts ? true : this.options.workAvailable))
        if (group !== 'handoff' && group !== 'completed') continue
        const token=workIntent(occupant.work);if(token===null)continue
        candidates.push({ key:actor.key,token,binding,foot:{...(this.layout.seats[actor.key]?.foot ?? actor.point)},scale:actorScale(occupant) })
      }
    }
    this.actions.setCandidates(candidates)
  }
  private *paintSteps(camera: Camera): Generator<void> {
    const region = { x: camera.left, y: camera.top, width: camera.width, height: camera.height }
    this.dpr = window.devicePixelRatio
    this.signsLeft = this.actualCamera().left; this.platesView = this.actualCamera()
    const size = surfaceSize(camera, this.zoom, window.devicePixelRatio || 1, 3); this.ratio = size.ratio
    for (const canvas of [this.frame ??= surfaces.take(), this.background]) { if (canvas.width !== size.width) canvas.width = size.width; if (canvas.height !== size.height) canvas.height = size.height }
    this.canvas.dataset['surfaceBytes'] = String(size.bytes)
    yield
    const ctx = this.background.getContext('2d', { willReadFrequently: true }); if (!ctx) return
    this.canvas.dataset['staticPaints'] = String(Number(this.canvas.dataset['staticPaints'] ?? 0) + 1)
    if (this.layout!.preview) {
      const actual = this.actualCamera(), left = Math.max(0, (actual.left - camera.left) * this.zoom * this.ratio), top = Math.max(0, (actual.top - camera.top) * this.zoom * this.ratio)
      const width = Math.max(1, Math.min(this.view.clientWidth * this.ratio, size.width - left)), height = Math.max(1, Math.min(this.view.clientHeight * this.ratio, size.height - top))
      const plan = overviewPlan(this.layout!, width, height, 16 * this.ratio), dark = this.options.theme === 'dark'
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = dark ? '#243d2b' : '#d8e5bf'; ctx.fillRect(0, 0, size.width, size.height)
      ctx.setTransform(1, 0, 0, 1, left, top)
      ctx.fillStyle = dark ? '#796344' : '#e6c182'; ctx.fillRect(plan.square.x, plan.square.y, plan.square.width, plan.square.height)
      ctx.fillStyle = dark ? '#a8885f' : '#b9925f'; ctx.strokeStyle = dark ? '#e3eadc' : '#293c32'; ctx.lineWidth = Math.max(1, this.ratio)
      materialize(ctx); yield
      let painted = 0
      for (const room of plan.rooms) {
        ctx.fillRect(room.x, room.y, room.width, room.height); ctx.strokeRect(room.x, room.y, room.width, room.height)
        if (++painted % 8 === 0) { materialize(ctx); yield }
      }
      materialize(ctx); yield
      const visible = this.frame!.getContext('2d', { willReadFrequently: true }); if (!visible) return
      visible.setTransform(1, 0, 0, 1, 0, 0); yield* copySurfaceSteps(visible, this.background)
      this.individuals = false; this.targetsFor([])
      this.selectFacts([])
      this.canvas.dataset['mode'] = 'overview'; this.canvas.dataset['overviewRooms'] = String(plan.rooms.length)
      // The static overview clears the targets but does not draw requested dynamic regions.
      this.completeDynamic([], 0, this.dynamicRevision)
      return
    }
    this.transform(ctx)
    const dark = this.options.theme === 'dark'
    this.villagePlan = !this.layout!.ownership && this.layout!.villages?.length ? villageOverview({ villages: this.layout!.villages }, this.zoom) : null
    this.populationLabels.clear()
    if (this.villagePlan && this.villagePlan.level !== 'homes') {
      ctx.fillStyle = dark ? '#243d2b' : '#d8e5bf'; ctx.fillRect(camera.left, camera.top, camera.width, camera.height)
      materialize(ctx); yield
      yield* this.placePopulationLabels(ctx, this.villagePlan.blocks)
      const key = `${this.villagePlan.level}:${this.villagePlan.side}:${this.zoom}:${this.options.theme}:${this.options.language}`
      if (key !== this.forestKey) {
        this.forestTiles.clear(); this.forest = yield* woodlandSteps(this.layout!,this.villagePlan,this.zoom,this.villagePlan.blocks.map(b=>this.blockLabelArea(ctx,b))); this.forestKey = key
      }
      yield* this.forestTiles.draw(ctx,this.forest!.pieces,camera,this.pack,512/Math.max(.001,this.zoom*this.ratio),undefined,(drawing,area)=>this.woodlandGround(drawing,area))
      this.canvas.dataset['forestTiles'] = String(this.forestTiles.rasterized)
      this.canvas.dataset['forestTileBytes'] = String(this.forestTiles.bytes)
      for (const block of this.villagePlan.blocks) {
        if (!overlapsCamera(this.blockLabelArea(ctx,block),camera)) continue
        this.blockLabel(ctx,block);materialize(ctx);yield
      }
      this.individuals = false; this.canvas.dataset['mode'] = this.villagePlan.level; this.selectFacts([])
      this.canvas.dataset['visiblePieces'] = '0'; this.canvas.dataset['visibleSeats'] = '0'
      yield* this.targetSteps([])
      const through = this.dynamicRevision
      if (yield* this.dynamicSteps([region])) this.completeDynamic([region], through, through)
      this.canvas.dataset['indexReady'] = 'true'
      return
    }
    // First-use pattern creation is a large native call of its own, never folded into
    // the terrain fill and its materializing readback.
    this.pattern(ctx, 'grass-0'); yield
    this.pattern(ctx, 'earth-0'); yield
    ctx.fillStyle = dark ? '#243d2b' : '#d8e5bf'; ctx.fillRect(camera.left, camera.top, camera.width, camera.height)
    this.texture(ctx, 'grass-0', dark ? '#507f3f' : '#70a745', camera.left, camera.top, camera.width, camera.height)
    ctx.fillStyle = this.pattern(ctx, 'earth-0') ?? (dark ? '#796344' : '#e6c182')
    // A small read materializes earlier drawing commands. Otherwise Chromium can defer
    // a whole terrain paint until the first later background copy, even a tiny tile.
    materialize(ctx); yield
    for (const { ring: packed } of yield* sortSteps(yield* this.roads.querySteps(camera), (a, b) => a.order - b.order)) {
      for (let at = 0; at < packed.length;) {
        yield
        const count = packed[at++]!; ctx.beginPath()
        for (let i = 0; i < count; i++) { const x = packed[at++]!, y = packed[at++]!; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); if (i % 128 === 127) yield }
        ctx.closePath(); ctx.fill()
        // Materialize one road fill per readback. A batch of large contours used to
        // rasterize together in a single long step.
        materialize(ctx); yield
      }
    }
    // Whole-village road rings used to fill in one turn and materialize together. Fill a
    // few, then read back and yield, so a large village cannot become one long turn.
    let ringBudget = performance.now()
    for (let ringAt = 0; ringAt < this.layout!.road.rings.length; ringAt++) {
      const ring = this.layout!.road.rings[ringAt]!
      ctx.beginPath(); ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill()
      if (ringAt % 4 === 3 || performance.now() - ringBudget >= 4) { materialize(ctx); ringBudget = performance.now(); yield }
      else yield
    }
    for (const square of this.villagePlan || this.layout!.ownership ? [] : this.layout!.squares?.length ? this.layout!.squares : [this.layout!.square]) {
      if (!overlapsCamera(square, camera)) continue
      this.texture(ctx, 'earth-0', dark ? '#796344' : '#e6c182', square.x, square.y, square.width, square.height)
      materialize(ctx); yield
    }
    const visiblePieces = yield* this.scenery.querySteps(camera)
    yield* this.dressingTiles.draw(ctx,[],camera,this.pack,512/Math.min(1,this.zoom*this.ratio),{ querySteps: camera => this.groundPieces(camera) })
    this.canvas.dataset['dressingTiles'] = String(this.dressingTiles.rasterized)
    this.canvas.dataset['dressingTileBytes'] = String(this.dressingTiles.bytes)
    const staticOrder = (item: Piece): number => item.sprite.endsWith('-floor') ? 0 : item.layer === 'floor' ? 1 : item.sprite.endsWith('-back') ? 2 : 3
    for (const item of yield* sortSteps(visiblePieces, (a, b) => staticOrder(a) - staticOrder(b) || a.depth - b.depth, item => item.group === null && !isTree(item) && !item.decoration && !item.cached && (item.layer === 'floor' || item.layer === 'back'))) {
      this.drawPiece(ctx, item)
      // One sprite draw per readback. The previous pair-of-sprites flush could make a
      // single turn hold two large draws; the readback itself is the native step.
      materialize(ctx)
      yield
    }
    if (!this.villagePlan && !this.layout!.ownership) for (const room of this.layout!.rooms) {
      yield
      const house = this.layout!.houses.find(house => house.group === room.id && house.module === 0)
      if (!house || !overlapsCamera(house, camera) || this.zoom < .25) continue
      const source = this.model!.rooms.find(source => source.id === room.id)!
      ctx.fillStyle = dark ? '#25372b' : '#fffdf5'; ctx.fillRect(house.x + 8, house.y - 32, Math.min(house.width - 16, 280), 28)
      ctx.fillStyle = dark ? '#e4edda' : '#293c32'; ctx.font = '14px system-ui'
      ctx.fillText(roomWords(source, this.options.language), house.x + 14, house.y - 12, Math.min(house.width - 28, 268))
      materialize(ctx); yield
    }
    materialize(ctx); yield
    const visible = this.villagePlan && this.villagePlan.level !== 'homes' ? [] : yield* this.seats.querySteps(camera)
    this.individuals = this.zoom >= .25 && visible.length <= 160
    this.canvas.dataset['mode'] = this.villagePlan?.level === 'villages' ? 'villages' : this.individuals ? 'people' : this.villagePlan?.level === 'homes' ? 'homes' : 'counts'
    this.selectFacts(visible)
    this.canvas.dataset['visiblePieces'] = String(visiblePieces.length)
    this.canvas.dataset['visibleSeats'] = String(visible.length)
    const targetsThrough = this.dynamicRevision
    yield* this.targetSteps(visible)
    if (this.firstPaint !== null) { clearTimeout(this.firstPaint); this.firstPaint = null }
    yield
    const regionsThrough = this.dynamicRevision
    if (yield* this.dynamicSteps([region])) this.completeDynamic([region], regionsThrough, targetsThrough)
    this.canvas.dataset['indexReady'] = 'true'
  }
  private selectFacts(keys: string[]): void {
    this.bufferedSeats = keys
    const allowed = !this.layout?.preview && this.individuals && this.zoom >= .25
    // actors() is also the drawing's union: a walker may enter this camera from an offscreen seat.
    const candidates = allowed ? this.actors(keys).map(actor => actor.key) : []
    const signature = JSON.stringify(candidates)
    const hooks = screenTestHooks()
    if (hooks) { hooks.candidates = candidates; hooks.camera = { zoom: this.zoom, buffer: this.camera, actual: this.actualCamera(), scrollLeft: this.view.scrollLeft, scrollTop: this.view.scrollTop, width: this.view.clientWidth, height: this.view.clientHeight }; hooks.mode = this.canvas.dataset['mode'] }
    // Motion keeps the static camera. Rebuild the roster margin only when its drawn union changes.
    if (this.selectionLayout === this.layout && this.selectionSignature === signature) return
    this.selectionLayout = this.layout; this.selectionSignature = signature
    this.factsChanged(screenAgents(this.model!, candidates, allowed))
  }
  private transform(ctx: CanvasRenderingContext2D): void {
    const scale = this.zoom * this.ratio, camera = this.camera!
    ctx.setTransform(scale, 0, 0, scale, -camera.left * scale, -camera.top * scale)
    ctx.imageSmoothingEnabled = false
  }
  private dynamic(regions: Rect[], targets = false): void {
    if (this.closed) return
    const added = ++this.dynamicRevision, areas = unionRegions([], regions), held = this.pendingDynamic
    // One pending request survives scheduling and cancellation. Keep the ages of contained
    // newer regions too: an older draw must not acknowledge a later request for the same area.
    this.pendingDynamic = {
      regions: [...(held?.regions ?? []).filter(entry => !areas.some(area => covers(area, entry.area))), ...areas.map(area => ({ area, added }))],
      targets: targets ? added : held?.targets ?? 0,
    }
    this.drawPendingDynamic()
  }
  private completeDynamic(regions: Rect[], regionsThrough: number, targetsThrough = 0): void {
    const held = this.pendingDynamic; if (!held) return
    held.regions = held.regions.flatMap(entry => entry.added > regionsThrough ? [entry] :
      regions.reduce((parts, region) => parts.flatMap(part => uncovered(part, region)), [entry.area]).map(area => ({ area, added: entry.added })))
    if (held.targets <= targetsThrough) held.targets = 0
    if (!held.regions.length && !held.targets) this.pendingDynamic = null
  }
  private drawPendingDynamic(): void {
    if (this.closed || this.holdingView || this.repainting || this.drawingDynamic || !this.pendingDynamic) return
    this.drawingDynamic = true
    this.dynamics.start((function* (map: OfficeMap) {
      // Read the pending request when the scheduled draw actually starts, after coalescing calls.
      const held = map.pendingDynamic!, through = map.dynamicRevision, regions = unionRegions([], held.regions.map(entry => entry.area)), targets = !!held.targets
      // A cancelled draw may have left the spare incomplete. Start from the
      // last presented frame, using the same bounded copies as the background.
      const frame = map.frame ??= surfaces.take()
      frame.width = map.canvas.width; frame.height = map.canvas.height
      yield* copySurfaceSteps(frame.getContext('2d', { willReadFrequently: true })!, map.canvas)
      const completed = yield* map.dynamicSteps(regions, targets)
      if (completed) map.completeDynamic(regions, through, targets ? through : 0)
      return completed
    })(this), completed => {
      this.drawingDynamic = false
      if (completed) { this.present(); this.drawPendingDynamic() }
    })
  }
  /** Every area's name that has room at ten pixels or more. An area too narrow for its shortest
   *  form is left out by itself, the page says some names are left out, and every other area still
   *  gets its name. */
  private areaNames(ctx: CanvasRenderingContext2D): ReturnType<typeof ownershipAreaLabelsOrSkips>['headers'] {
    const { headers, skipped } = ownershipAreaLabelsOrSkips(this.layout!, this.zoom, this.options.language, text => { ctx.font = `${12 / this.zoom}px system-ui`; return ctx.measureText(text).width }, true)
    const leftOut = skipped.length > 0
    if (leftOut !== this.namesLeftOut) { this.namesLeftOut = leftOut; this.namesChanged(leftOut) }
    return headers
  }
  private *dynamicSteps(regions: Rect[], targets = false): Generator<void, boolean> {
    if (this.closed || !this.layout || !this.camera || (!regions.length && !targets)) return false
    this.sleepFrameHasReady = false
    const lookEpoch = this.lookFrames.ready ? this.lookEpoch : -1
    // A camera owns only its logical rectangle. The rounded backing bitmap's last
    // pixel is not an extra world strip for an off-camera request to blend into.
    const camera = this.camera
    const visibleRegions = regions.flatMap(region => {
      const left = Math.max(region.x, camera.left), top = Math.max(region.y, camera.top)
      const right = Math.min(region.x + region.width, camera.left + camera.width), bottom = Math.min(region.y + region.height, camera.top + camera.height)
      return right > left && bottom > top ? [{ x: left, y: top, width: right - left, height: bottom - top }] : []
    })
    if (!visibleRegions.length && !targets) return true
    const ctx = this.frame!.getContext('2d', { willReadFrequently: true }); if (!ctx) return false
    this.canvas.dataset['dynamicPaints'] = String(Number(this.canvas.dataset['dynamicPaints'] ?? 0) + 1)
    const whole = this.villagePlan && this.villagePlan.level !== 'homes' ? [] : yield* this.seats.querySteps(camera), aggregate = !this.individuals
    this.selectFacts(whole)
    if (targets) yield* this.targetSteps(whole)
    if (!visibleRegions.length) return true
    const actors = aggregate && !this.layout.ownership ? [] : this.actors(whole)
    const labelAtSeat = (actor: Actor): boolean => {
      if (actor.walk?.labelAtSeat) return true
      const seat = this.layout!.seats[actor.key]
      if (actor.walk?.phase !== 'wait' || !seat?.desk || seat.desk.width <= 0) return false
      const home = atDesk(seat)
      return Math.hypot(actor.point.x - home.x, actor.point.y - home.y) <= 1
    }
    const mode = (actor: Actor): 'seat' | 'feet' | undefined => {
      if (actor.walk) return labelAtSeat(actor) ? 'seat' : 'feet'
      const seat = this.layout!.seats[actor.key]
      if (!seat?.desk || seat.desk.width <= 0) return undefined
      const home = atDesk(seat)
      return actor.point.x === home.x && actor.point.y === home.y ? 'seat' : undefined
    }
    if (this.nameplates && !aggregate) {
      const now = performance.now()
      const placement = actors.map(actor => {
        const seat = this.layout!.seats[actor.key]
        return labelAtSeat(actor) && seat ? { key: actor.key, point: atDesk(seat) } : actor
      })
      const normal = yield* this.nameplates.placeSteps(placement)
      const prepared = placement.map((actor, index) => {
        const previous = this.plateStates.get(actor.key), current = mode(actors[index]!), end = normal.get(actor.key)
        if (previous?.rect && end && previous.mode && current && previous.mode !== current) this.plateGlides.set(actor.key, { started: now, from: previous.rect })
        if (!current) this.plateGlides.delete(actor.key)
        const glide = this.plateGlides.get(actor.key)
        if (!glide) return actor
        if (!end) { this.plateGlides.delete(actor.key); return actor }
        const progress = Math.min(1, (now - glide.started) / PLATE_GLIDE_MS)
        if (progress >= 1) { this.plateGlides.delete(actor.key); return actor }
        const from = glide.from
        const plate = { ...end, x: from.x + (end.x - from.x) * progress, y: from.y + (end.y - from.y) * progress }
        return { ...actor, plate }
      })
      this.plates = this.plateGlides.size ? yield* this.nameplates.placeSteps(prepared) : normal
      this.plateStates = new Map(actors.map(actor => [actor.key, { mode: mode(actor), rect: this.plates.get(actor.key) }]))
      const visible = new Set(actors.map(actor => actor.key))
      for (const key of this.plateGlides.keys()) if (!visible.has(key)) this.plateGlides.delete(key)
      if (this.plateGlides.size && this.plateFrame === null) this.plateFrame = requestAnimationFrame(() => {
        this.plateFrame = null
        if (!this.closed && this.camera) this.dynamic([{ x: this.camera.left, y: this.camera.top, width: this.camera.width, height: this.camera.height }])
      })
    } else this.plates = new Map()
    // A mole bound to an action may instead be drawn by it, at its seat's foot.
    this.moleMiddles = new Map(actors.map(a => {
      const lift = moleMiddle[whereaboutsAt(this.whereaboutsByKey, this.occupants, a.key).where === 'sleep' ? 'asleep' : 'awake'] * this.drawnScale(a.key), foot = this.actionBindings.has(a.key) && !a.walk && this.layout!.seats[a.key]?.foot
      return [a.key, (foot ? [a.point, foot] : [a.point]).map(p => ({ x: p.x, y: p.y - lift }))]
    }))
    const labelled = this.villagePlan?.level === 'homes' && !this.individuals ? villageOverview({ villages: this.layout.villages! }, 299 / VILLAGE.width).blocks : []
    if (labelled.length) yield* this.placePopulationLabels(ctx, labelled, true)
    // The area names are placed once for the whole pass: the house signs stop short of them.
    const headers = this.layout.ownership && !(this.villagePlan && this.villagePlan.level !== 'homes') ? this.areaNames(ctx) : []
    this.signHeaders = headers
    for (const region of visibleRegions) {
      ctx.save()
      try {
        // Clear whole device pixels, so each pass starts from transparency rather than blending an
        // old edge, and draw every one of them again whole, up to the camera's own edges. A pixel at
        // the region's edge drawn again only in part let the floor show through, as a faint outline.
        const scale = this.zoom * this.ratio
        const left = Math.floor((region.x - camera.left) * scale), top = Math.floor((region.y - camera.top) * scale)
        const right = Math.ceil((region.x + region.width - camera.left) * scale), bottom = Math.ceil((region.y + region.height - camera.top) * scale)
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(left, top, right - left, bottom - top)
        const x = camera.left + left / scale, y = camera.top + top / scale
        const area = { left: x, top: y, width: (right < camera.width * scale ? camera.left + right / scale : camera.left + camera.width) - x, height: (bottom < camera.height * scale ? camera.top + bottom / scale : camera.top + camera.height) - y }
        this.transform(ctx); ctx.beginPath(); ctx.rect(x, y, area.width, area.height); ctx.clip()
        ctx.setTransform(1, 0, 0, 1, 0, 0); yield* copySurfaceSteps(ctx, this.background); this.transform(ctx)
        if (this.villagePlan && this.villagePlan.level !== 'homes') continue
        const visiblePieces = yield* this.scenery.querySteps(area)
        let painted = 0
        for (const entry of sceneOrder(visiblePieces, actors, this.layout.houses.filter(h => overlapsCamera(h, camera)))) {
          if (entry?.piece) this.drawPiece(ctx, entry.piece)
          if (entry?.actor) {
            const a = entry.actor; this.actor(ctx, a.key, a.point, a.walk)
            const rect = this.plates.get(a.key)
            if (mode(a) === 'feet' && rect && this.plateShown(a.key)) this.nameplate(ctx, a.key, rect)
          }
          if (entry && ++painted % 4 === 0) materialize(ctx)
          yield
        }
        if (this.villagePlan?.level === 'homes' || this.layout.ownership && this.zoom >= .18) yield* this.homeLabels(ctx, camera)
        if (this.layout.ownership) {
          for (const header of headers) {
            if (!overlapsCamera(header.area, camera)) { yield; continue }
            const { x, y, width, height } = header
            ctx.font = `${header.fontSize / this.zoom}px system-ui`
            ctx.fillStyle = this.options.theme === 'dark' ? '#25372b' : '#fffdf5'; ctx.fillRect(x, y, width, height)
            ctx.fillStyle = this.options.theme === 'dark' ? '#e4edda' : '#293c32'
            for (const text of header.lines) ctx.fillText(text, x + 6 / this.zoom, y + (header.fontSize + 3) / this.zoom, width - 12 / this.zoom)
            materialize(ctx); yield
          }
        }
        for (const actor of actors) { const rect = this.plates.get(actor.key); if (mode(actor) !== 'feet' && rect && this.plateShown(actor.key)) this.nameplate(ctx, actor.key, rect); if (++painted % 4 === 0) materialize(ctx); yield }
        for (const block of labelled) {
          if (!overlapsCamera(this.blockLabelArea(ctx, block), { left: region.x, top: region.y, width: region.width, height: region.height })) continue
          this.blockLabel(ctx, block); materialize(ctx); yield
        }
        if (aggregate && !this.villagePlan && !this.layout.ownership) {
          const bins = new Map<string, { x: number; y: number; count: number }>()
          let counted = 0
          for (const key of whole) {
            if (++counted % 64 === 0) yield
            const p = this.layout.seats[key]!.foot, x = Math.floor((p.x - camera.left) * this.zoom / 64), y = Math.floor((p.y - camera.top) * this.zoom / 64), id = `${x},${y}`
            const bin = bins.get(id) ?? { x: camera.left + (x * 64 + 32) / this.zoom, y: camera.top + (y * 64 + 32) / this.zoom, count: 0 }
            bin.count++; bins.set(id, bin)
          }
          // Materialize the sprites and labels before the first text draw, so font and
          // glyph work is not folded into the same native step as the layer raster.
          materialize(ctx); yield
          ctx.fillStyle = this.options.theme === 'dark' ? '#eef1dc' : '#293c32'; ctx.font = `${14 / this.zoom}px system-ui`
          for (const bin of bins.values()) { ctx.fillText(String(bin.count), bin.x, bin.y); if (++painted % 4 === 0) materialize(ctx); yield }
        }
        materialize(ctx); yield
      } finally { ctx.restore() }
    }
    // Every mole painted in this frame: where, whether walking, the box the motion worker checks for it
    // there, and the plate drawn for it, or null when none is drawn.
    const hooks = screenTestHooks()
    if (hooks) hooks.paintedActors = actors.map(actor => {
      const body = this.motionBounds(actor.key), plate = this.plates.get(actor.key)
      return { key: actor.key, point: { x: actor.point.x, y: actor.point.y }, walking: !!actor.walk, body: body ? translateBody(body, actor.point) : null, plate: plate && this.plateShown(actor.key) ? { ...plate } : null }
    })
    this.canvas.dataset['moving'] = String(this.moving.length)
    // Only a full-camera draw that began with this prepared pack can remove
    // the loading-placeholder state. A partial or superseded draw cannot.
    if (lookEpoch >= 0 && lookEpoch === this.lookEpoch && visibleRegions.some(region => covers(region, { x: camera.left, y: camera.top, width: camera.width, height: camera.height }))) this.frameLookEpoch = lookEpoch
    return true
  }
  private actors(keys: string[]): Actor[] {
    keys = onScreen(this.camera, this.away, keys)
    const shown = (key: string) => whereaboutsAt(this.whereaboutsByKey, this.occupants, key).where !== 'hidden'
    const moving = new Map((this.options.still || this.layout?.ownership && !this.individuals ? [] : this.moving).filter(w => {
      const occupant = this.occupants.get(w.from)
      return w.phase ? whereaboutsAt(this.whereaboutsByKey, this.occupants, w.from).where !== 'hidden' : whereaboutsAt(this.whereaboutsByKey, this.occupants, w.from).where === 'desk' && (!occupant || !standingClothes(occupant.standing))
    }).map(walk => [walk.from, walk]))
    const actors: Actor[] = keys.filter(key => shown(key) && !moving.has(key)).flatMap(key => {
      const drawn = drawnAt(this.layout, this.whereaboutsByKey, this.occupants, this.atFacility, this.actionBindings, this.freeToWalk, key)
      return drawn ? [{ key, point: drawn.point, walk: undefined as MovingContact | undefined, depth: drawn.depth }] : []
    })
    for (const walk of moving.values()) if (this.camera && overlapsCamera(actorRect(walk.point), this.camera)) actors.push({ key: walk.from, point: walk.point, walk })
    return actors
  }
  private actor(ctx: CanvasRenderingContext2D, key: string, point: Point, walk?: MovingContact): void {
    const occupant = this.occupants.get(key); if (!occupant) return
    const at = whereaboutsAt(this.whereaboutsByKey, this.occupants, key); if (at.where === 'hidden') return
    const desk = at.where === 'desk'
    const distant = !!this.layout?.ownership && !this.individuals
    if (!distant && projectMatch(occupant, null) === 'absent') return
    const standing = distant && at.where !== 'sleep' ? standingOf(portraitOf(null), key, occupant.agent.createdAt) : occupant.standing, look = standing.look
    const recoloured = !!standingClothes(standing)
    if (!distant && desk && !walk && this.options.wave !== key && !this.options.still && this.actions.draw(ctx,key)) return
    let sprite = distant || recoloured ? `stand-${look}` : walk?.phase === 'play' ? playPose(standing, Math.floor(walk.elapsed / 1200) + (walk.facing < 0 ? 1 : 0)).sprite : moleSprite(look, occupant.work, this.options.still, walk?.phase === 'wait' ? undefined : walk, this.options.wave === key, currentFacts(occupant) && (occupant.facts ? true : this.options.workAvailable), at.where)
    if (at.where === 'sleep') { this.startSleepingLooks(); const art = this.sleepPack ?? this.pack, frame = art?.sources.sprites?.[`sleep-${look}`]; sprite = moleSprite(look, occupant.work, this.options.still, undefined, false, true, 'sleep', !!frame && !!art?.images.has(frame.atlas)) }
    // An idle mole at a facility place takes the place's pose there, as a still picture, and stands under reduced motion.
    const place = desk && !walk && this.options.wave !== key && !distant ? this.atFacility.get(key) : undefined
    if (place) sprite = recoloured || this.options.still ? `stand-${look}` : `${place.pose}-${look}`
    else if (look === 'tuft' && at.where !== 'sleep' && !walk && this.options.wave !== key) sprite = `stand-${look}`
    else if (!recoloured && !walk && !this.options.still && desk && this.layout?.ownership && sprite === `stand-${look}`) sprite = `${facilityPose(this.layout.seats[key])}-${look}`
    const scale = this.drawnScale(key)
    const facing: 1 | -1 = walk && !this.options.still ? walk.facing : 1
    const pose = at.where === 'sleep' ? 'sleep' : walk?.phase === 'play' ? 'play' : walk?.phase === 'walk' ? 'walk' : 'stand'
    let drawn: boolean | undefined
    if (recoloured && pose === 'stand' && facing === -1) {
      ctx.save(); ctx.translate(point.x * 2, 0); ctx.scale(-1, 1)
      drawn = this.lookFrames?.draw(ctx, standing.recipe!, point, scale, pose, walk?.elapsed ?? 0, facing)
      ctx.restore()
    } else if (recoloured && pose === 'stand') drawn = this.lookFrames?.draw(ctx, standing.recipe!, point, scale)
    else drawn = recoloured ? this.lookFrames?.draw(ctx, standing.recipe!, point, scale, pose, walk?.elapsed ?? 0, facing) : drawAnchoredSprite(ctx, at.where === 'sleep' ? this.sleepPack ?? this.pack : this.pack, sprite, point, scale, facing)
    if (at.where === 'sleep' && drawn && this.sleepPrepared) this.sleepFrameHasReady = true
    // One small paper bundle travels between the two partners as they gesture.
    if (walk?.phase === 'play' && walk.facing === 1 && walk.paper) {
      const prop = paperExchange(walk.elapsed, PAPER_ARC_SHIFT)
      drawSprite(ctx, this.pack, 'paper-stack', point.x + prop.x - 14, point.y + prop.y, 1.2)
    }
    if (!drawn) {
      ctx.fillStyle = '#8b8174'; ctx.beginPath(); ctx.moveTo(point.x, point.y - 24); ctx.lineTo(point.x + 12, point.y - 12); ctx.lineTo(point.x, point.y); ctx.lineTo(point.x - 12, point.y - 12); ctx.closePath(); ctx.fill()
    }
  }
  private nameplate(ctx: CanvasRenderingContext2D, key: string, rect: Rect): void {
    const occupant = this.occupants.get(key); if (!occupant) return
    const matching = projectMatch(occupant, this.options.project), searched = !!this.options.search && `${occupant.agent.name} ${occupant.agent.handle}`.toLocaleLowerCase().includes(this.options.search.toLocaleLowerCase()), selected = key === this.options.selected
    // Filters change the nameplate only. Bodies and homes retain their size, colour and place.
    ctx.globalAlpha = matching === 'other' ? .45 : 1
    ctx.fillStyle = selected || searched ? '#f1d891' : this.options.theme === 'dark' ? '#25372b' : '#f5f0dc'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    ctx.fillStyle = this.options.theme === 'dark' && !selected && !searched ? '#e3eadc' : '#293c32'
    ctx.font = '11px system-ui'; ctx.fillText(shortName(occupant.agent.name || occupant.agent.handle), rect.x + 5, rect.y + 11, rect.width - 10)
    const badge = badges[moleGroup(occupant.work, currentFacts(occupant) && (occupant.facts ? true : this.options.workAvailable))]
    const asleep = whereaboutsAt(this.whereaboutsByKey, this.occupants, key).where === 'sleep'
    ctx.font = '10px system-ui'; ctx.fillText(asleep ? words[this.options.language][this.options.asleepMadeUp === true ? 'madeUpSleep' : 'asleepPlate'] : matching === 'unknown' ? words[this.options.language].projectUnloaded : matching === 'absent' ? words[this.options.language].agentAbsent : occupant.facts && !currentFacts(occupant) ? (occupant.facts.people.status === 'unloaded' || occupant.facts.work.status === 'unloaded' ? words[this.options.language].factsUnloaded : words[this.options.language].priorFacts) : `${badge.symbol} ${badge[this.options.language]}`, rect.x + 5, rect.y + 24, rect.width - 10)
    ctx.fillStyle = badge.colour; ctx.fillRect(rect.x, rect.y, 2, rect.height)
    ctx.globalAlpha = 1
  }
  private pattern(ctx: CanvasRenderingContext2D, id: string): CanvasPattern | null {
    if (!this.pack) return null
    let tile = this.tiles.get(id)
    if (!tile) {
      const frame = this.pack.sources.sprites?.[id]; if (!frame) return null
      tile = surfaces.take(); tile.width = frame.size[0]!; tile.height = frame.size[1]!
      const drawing = tile.getContext('2d'); if (!drawing || !drawSprite(drawing, this.pack, id, 0, 0)) return null
      this.tiles.set(id, tile)
    }
    const held = this.patterns.get(ctx) ?? new Map()
    this.patterns.set(ctx, held)
    const cached = held.get(id)
    if (cached && cached.version === this.tileVersion && cached.tile === tile) return cached.pattern
    const pattern = ctx.createPattern(tile, 'repeat'); if (!pattern) return null
    held.set(id, { version: this.tileVersion, tile, pattern })
    return pattern
  }
  private texture(ctx: CanvasRenderingContext2D, id: string, fallback: string, x: number, y: number, width: number, height: number): void {
    ctx.fillStyle = this.pattern(ctx, id) ?? fallback; ctx.fillRect(x, y, width, height)
  }
  private *groundPieces(camera: Camera): Generator<void, Piece[]> {
    const result: Piece[] = []
    for (const p of yield* this.scenery.querySteps(camera)) {
      if (p.group === null && !depthSortedTree(p, this.layout!.houses)) result.push(p)
      yield
    }
    return result
  }
  private drawPiece(ctx: CanvasRenderingContext2D, item: Piece): void {
    if ((item as ContactPiece).contactSize) { this.contacts.draw(ctx,item); return }
    const frame = this.pack?.sources.sprites?.[item.sprite]
    if (isTree(item) && !item.crop && frame && this.pack?.images.has(frame.atlas)) {
      const key = `tree:${item.sprite}`
      let tile = this.tiles.get(key)
      if (!tile) {
        const bytes = frame.size[0]! * frame.size[1]! * 4
        let held = 0
        for (const [id, canvas] of this.tiles) if (id.startsWith('tree:')) held += canvas.width * canvas.height * 4
        if (held + bytes <= SCENERY_TILE_BYTES) {
          const next = surfaces.take(); next.width = frame.size[0]!; next.height = frame.size[1]!
          const drawing = next.getContext('2d', { willReadFrequently: true })
          if (drawing && drawSprite(drawing, this.pack, item.sprite, 0, 0)) {
            materialize(drawing); this.tiles.set(key, next); tile = next
          } else surfaces.release(next)
        }
      }
      if (tile) { ctx.drawImage(tile, item.x, item.y, item.width, item.height); return }
    }
    if (item.fragments) {
      const scale = item.scale ?? 1
      if (item.fragments.every(part => drawSprite(ctx, this.pack, item.sprite, item.x + part.x * scale, item.y + part.y * scale, scale, part.crop))) return
    } else if (drawSprite(ctx, this.pack, item.sprite, item.x, item.y, item.scale ?? 1, item.crop)) return
    if (item.sprite.endsWith('-floor') || item.sprite === 'worker-desk') {
      ctx.fillStyle = item.layer === 'floor' ? '#b9925f' : '#997343'; ctx.fillRect(item.x, item.y, item.width, item.height)
    } else if (item.group === null || item.layer === 'front' || item.layer === 'back') {
      ctx.strokeStyle = '#6e7958'; ctx.lineWidth = 2; ctx.strokeRect(item.x, item.y, item.width, item.height)
    }
  }
  private *placePopulationLabels(ctx: CanvasRenderingContext2D, blocks: VillageOverview['blocks'], homes = false): Generator<void> {
    const obstacles: Rect[] = []
    if (homes) for (const house of this.layout!.houses) {
      const height = 20 / this.zoom, y = this.layout!.ownership ? Math.max(this.layout!.bounds.y, house.y - height) : house.y - height
      obstacles.push({ x: house.x, y, width: Math.min(house.width, 160 / this.zoom), height })
      yield
    }
    ctx.font = `${11 / this.zoom}px system-ui`
    this.populationLabels = yield* populationLabelsSteps(blocks, this.layout!.bounds, this.zoom, text => ctx.measureText(text).width, words[this.options.language].population, obstacles)
  }
  private populationLabel(ctx: CanvasRenderingContext2D, block: VillageOverview['blocks'][number]): PopulationLabel {
    ctx.font = `${11 / this.zoom}px system-ui`
    return this.populationLabels.get(block.id) ?? populationLabel(block, this.layout!.bounds, this.zoom, text => ctx.measureText(text).width, words[this.options.language].population)
  }
  private blockLabelArea(ctx: CanvasRenderingContext2D, block: VillageOverview['blocks'][number]): Rect {
    return this.populationLabel(ctx, block).area
  }
  private blockLabel(ctx: CanvasRenderingContext2D, block: VillageOverview['blocks'][number]): void {
    const label = this.populationLabel(ctx, block), {x,y,width} = label.area, dark=this.options.theme==='dark'
    ctx.fillStyle = dark ? '#25372b' : '#fffdf5'; ctx.fillRect(x, y, width, 32 / this.zoom)
    ctx.fillStyle = dark ? '#e4edda' : '#293c32'; ctx.font = `${11 / this.zoom}px system-ui`
    ctx.fillText(label.population, x + 4 / this.zoom, y + 12 / this.zoom)
    const sign = block.signs[0]
    if (sign) {
      const flags = (block.villages.length === 1 ? block.signs : [sign]).slice(0,Math.max(0,Math.floor((width*this.zoom-8)/6)))
      for (let i=0;i<flags.length;i++) {
        ctx.fillStyle = `hsl(${flags[i]!.token % 360} 45% 48%)`; ctx.fillRect(x+(4+i*6)/this.zoom,y+30/this.zoom,4/this.zoom,2/this.zoom)
      }
      ctx.fillStyle = dark ? '#e4edda' : '#293c32'
      const suffix = block.signs.length > 1 ? ` +${block.signs.length-1}` : ''
      const label = this.labelWords(ctx,sign.label,width-8/this.zoom-ctx.measureText(suffix).width)
      if(label) ctx.fillText(label+suffix,x+4/this.zoom,y+26/this.zoom)
    }
  }
  private labelWords(ctx: CanvasRenderingContext2D, text: string, width: number): string {
    const words = text.trim().split(/\s+/)
    while (words.length && ctx.measureText(words.join(' ')).width > width) words.pop()
    return words.join(' ')
  }
  private *woodlandGround(ctx:CanvasRenderingContext2D,area:Rect):Generator<void> {
    this.texture(ctx,'grass-0',this.options.theme==='dark'?'#507f3f':'#70a745',area.x,area.y,area.width,area.height)
    ctx.fillStyle=this.pattern(ctx,'earth-0')??'#e6c182';materialize(ctx);yield
    for(const walk of this.forest!.walks) {
      const box=boundsOf(walk.points),r=walk.width/2
      if(!overlapsCamera({x:box.x-r,y:box.y-r,width:box.width+2*r,height:box.height+2*r},{left:area.x,top:area.y,width:area.width,height:area.height})){yield;continue}
      for(const ring of walkRings(walk)) {
        ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill()
        materialize(ctx);yield
      }
    }
  }
  private *homeLabels(ctx: CanvasRenderingContext2D, camera: Camera): Generator<void> {
    const dark = this.options.theme === 'dark'
    for (const house of this.layout!.houses) {
      if (!overlapsCamera(house, camera)) continue
      const sign = this.layout!.ownership ? { label: (this.options.language === 'zh' ? house.zh : house.label) ?? house.group, token: stableHash(house.group) } : this.layout!.villages![house.village!]!.signs.find(s => s.id === house.group)
      if (!sign) continue
      const box = this.signBox(house), { x, y, width, height } = box
      if (!this.signShown(box)) continue
      ctx.fillStyle = dark ? '#25372b' : '#fffdf5'; ctx.fillRect(x, y, width, height)
      ctx.fillStyle = `hsl(${sign.token % 360} 45% 48%)`; ctx.fillRect(x, y, 5 / this.zoom, height)
      ctx.fillStyle = dark ? '#e4edda' : '#293c32'; ctx.font = `${11 / this.zoom}px system-ui`
      ctx.fillText(this.layout!.ownership ? (house.type === 'sleeping-house' ? sign.label : `${sign.label} · ${house.occupants.length}`) : shortName(sign.label), this.signNameLeft(box), y + 14 / this.zoom, width - 12 / this.zoom)
      materialize(ctx); yield
    }
  }
  /** A house's sign, moved right with the visible left edge of the map when that edge is inside the
   *  house, so the whole sign stays in view. It stays above its own house and short of any area name. */
  private signBox(house: Rect): Rect {
    const sign = houseSign(this.layout!, house, this.zoom)
    const stop = Math.min(house.x + house.width - sign.width, ...this.signHeaders.filter(h => h.x + h.width > house.x && h.y < sign.y + sign.height && sign.y < h.y + h.height).map(h => h.x - sign.width))
    return { ...sign, x: Math.max(house.x, Math.min(stop, this.signsLeft)) }
  }
  private signNameLeft(box: Rect): number { return box.x + 8 / this.zoom }
  /** A sign is drawn only while its name starts inside the visible map. When less of the house is
   *  in view than the sign is wide, the name would start outside the view and leave a blank plate. */
  private signShown(box: Rect): boolean { return this.signNameLeft(box) >= this.signsLeft }
  /** After a scroll the drawn surface still holds, only the signs that move, appear or go are drawn
   *  again, over where they stood and where they now stand. */
  private followSigns(): void {
    if (this.closed || !this.layout || !this.camera || this.layout.preview || !(this.villagePlan?.level === 'homes' || this.layout.ownership && this.zoom >= .18)) return
    const left = this.actualCamera().left
    if (left === this.signsLeft) return
    const before = this.layout.houses.map(house => this.signBox(house)), shown = before.map(box => this.signShown(box))
    this.signsLeft = left
    const moved = this.layout.houses.flatMap((house, i) => { const after = this.signBox(house); return after.x === before[i]!.x && this.signShown(after) === shown[i] ? [] : [before[i]!, after] })
    if (moved.length) this.dynamic(moved)
  }
  /** A plate is drawn only while the middle of its mole is in the visible map, so no part of a plate shows without its mole. */
  private plateShown(key: string, view = this.platesView): boolean {
    const middles = this.moleMiddles.get(key)
    return !!middles && !!view && middles.every(p => p.x >= view.left && p.x < view.left + view.width && p.y >= view.top && p.y < view.top + view.height)
  }
  /** After a scroll or a resize the drawn surface still holds, only the plates whose moles came into view or left it are drawn again. */
  private followPlates(): void {
    if (this.closed || !this.layout || !this.camera) return
    const view = this.actualCamera(), changed = [...this.plates].filter(([key]) => this.plateShown(key) !== this.plateShown(key, view)).map(([, rect]) => rect)
    this.platesView = view
    if (changed.length) this.dynamic(changed)
  }
  private blockArea(block: Rect): Rect {
    const bounds = this.layout!.bounds, x = Math.max(block.x, bounds.x), y = Math.max(block.y, bounds.y)
    return { x, y, width: Math.min(block.x + block.width, bounds.x + bounds.width) - x, height: Math.min(block.y + block.height, bounds.y + bounds.height) - y }
  }
  private targetsFor(keys: string[]): void {
    const work = this.targetSteps(keys)
    while (!work.next().done) { /* Only empty/unchanged-model targets use this immediate path. */ }
  }
  private *targetSteps(keys: string[]): Generator<void> {
    keys = onScreen(this.camera, this.away, keys)
    const focused = this.targets.querySelector<HTMLElement>(':focus'), nodes: HTMLElement[] = []
    const existing = new Map([...this.targets.children].flatMap(node => {
      const button = node as HTMLElement, key = button.dataset['key']
      return button.className === 'map-person' && key ? [[key, button] as const] : []
    }))
    const existingBlocks = new Map([...this.targets.children].flatMap(node => {
      const button = node as HTMLElement, id = button.dataset['block']
      return button.className === 'map-block' && id ? [[id, button] as const] : []
    }))
    if (this.villagePlan && this.villagePlan.level !== 'homes') for (const block of this.villagePlan.blocks) {
      if (!this.camera || !overlapsCamera(block, this.camera)) continue
      const button = existingBlocks.get(block.id) as HTMLButtonElement | undefined ?? document.createElement('button')
      if (!existingBlocks.has(block.id)) {
        button.type = 'button'; button.className = 'map-block'; button.dataset['block'] = block.id
        button.addEventListener('click', () => {
          const current = this.villagePlan?.blocks.find(one => one.id === block.id); if (!current) return
          this.cancelFollow(); this.clearZooms()
          this.setZoom(Math.max(this.zoom * 2, 320 / VILLAGE.width))
          this.center({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
        })
      }
      button.setAttribute('aria-label', `${block.total} people. ${block.signs.map(s => s.label).join(', ')}`)
      const area = this.blockArea(block)
      Object.assign(button.style, { left: `${(area.x - this.layout!.bounds.x) * this.zoom + this.padding.x}px`, top: `${(area.y - this.layout!.bounds.y) * this.zoom + this.padding.y}px`, width: `${area.width * this.zoom}px`, height: `${area.height * this.zoom}px` })
      nodes.push(button); yield
    }
    const actors = this.individuals ? this.actors(keys) : [], byKey = new Map(actors.map(actor => [actor.key, actor]))
    const keySet = new Set(keys), ordered = [...keys.flatMap(key => byKey.has(key) ? [byKey.get(key)!] : []), ...actors.filter(actor => !keySet.has(actor.key))]
    for (const { key, point } of ordered) {
      const occupant = this.occupants.get(key), seat = this.layout!.seats[key]
      if (!occupant || whereaboutsAt(this.whereaboutsByKey, this.occupants, key).where === 'hidden' || !seat || !point) { yield; continue }
      const button = existing.get(key) as HTMLButtonElement | undefined ?? document.createElement('button')
      if (!existing.has(key)) {
        button.type = 'button'; button.className = 'map-person'; button.dataset['key'] = key
        button.addEventListener('click', () => this.pin(key)); button.addEventListener('focus', () => this.inspect(key)); button.addEventListener('pointerenter', () => this.inspect(key)); button.addEventListener('pointerleave', () => this.inspect(null))
      }
      button.setAttribute('aria-label', `${occupant.agent.name || occupant.agent.handle}${projectMatch(occupant, null) === 'absent' ? ' · ' + words[this.options.language].agentAbsent : ''}`); button.setAttribute('aria-pressed', String(key === this.options.selected))
      button.style.left = `${(point.x - this.layout!.bounds.x) * this.zoom + this.padding.x - 44}px`; button.style.top = `${(point.y - this.layout!.bounds.y) * this.zoom + this.padding.y - 44}px`
      yield
      nodes.push(button)
    }
    // Updating positions in place keeps keyboard focus and avoids rebuilding the roster every frame.
    const current = [...this.targets.children]
    if (nodes.length === current.length && nodes.every((node, index) => current[index] === node)) return
    this.targets.replaceChildren(...nodes)
    if (focused && nodes.includes(focused)) focused.focus({ preventScroll: true })
  }
  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') { this.cancelFollow(); return }
    if (event.target !== this.view) return
    const offsets: Record<string, Point> = { ArrowLeft: { x: -80, y: 0 }, ArrowRight: { x: 80, y: 0 }, ArrowUp: { x: 0, y: -80 }, ArrowDown: { x: 0, y: 80 } }, offset = offsets[event.key]
    if (offset) { event.preventDefault(); this.cancelFollow(); this.view.scrollLeft += offset.x; this.view.scrollTop += offset.y }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); this.scale(1.25) }
    else if (event.key === '-') { event.preventDefault(); this.scale(.8) }
    else if (event.key === 'Home') { event.preventDefault(); this.fit() }
  }
  private down(event: PointerEvent): void {
    const button = (event.target as HTMLElement).closest('button')
    if (event.button !== 0 || button && !button.matches('.map-person, .map-block')) return
    this.dragged = false; this.press = { x: event.clientX, y: event.clientY }
    this.cancelFollow(); this.pointers.set(event.pointerId, this.press); (button ?? this.view).setPointerCapture(event.pointerId)
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y) }
  }
  private move(event: PointerEvent): void {
    const before = this.pointers.get(event.pointerId); if (!before) return
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()], distance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      if (this.pinch > 0) this.queueZoom((this.pendingZoom ?? this.zoom) * distance / this.pinch)
      this.pinch = distance
    } else {
      if (!this.dragged && this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) < 4) return
      this.dragged = true; this.view.setPointerCapture(event.pointerId); event.preventDefault()
      this.view.scrollLeft -= event.clientX - before.x; this.view.scrollTop -= event.clientY - before.y
    }
  }
}
