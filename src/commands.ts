// AutoCAD-style modify commands the engine lacks: MIRROR, SCALE, EXPLODE,
// TRIM, EXTEND, FILLET, TEXTEDIT and PROPERTIES, plus APPPROP behind the 속성 panel.
// They run on the engine's command stack, so they get its prompts (touch
// panel and command line), one undo mark per command and typed aliases.
// Geometry is handled in the XY plane, which is where 2D drafting lives.

import {
  type AcApContext,
  AcApDocManager,
  AcEdCommand,
  AcEdOpenMode,
  AcEdPromptDistanceOptions,
  AcEdPromptEntityOptions,
  AcEdPromptKeywordOptions,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  resolveSelectedEntities
} from '@mlightcad/cad-simple-viewer'
import {
  AcCmColor,
  AcDbArc,
  AcDbAttributeDefinition,
  AcDbBlockReference,
  AcDbCircle,
  type AcDbEntity,
  AcDbIntersect,
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcDbText,
  AcGeMatrix3d,
  AcGePoint2d,
  AcGePoint3d
} from '@mlightcad/data-model'

import { editTexts } from './ui'

/* ---------- small geometry ---------- */

interface Pt {
  x: number
  y: number
}

/** A path piece: a straight segment, or a circular arc from angle a0 sweeping by sweep (+ = CCW). */
type Seg = { kind: 'line'; a: Pt; b: Pt } | { kind: 'arc'; c: Pt; r: number; a0: number; sweep: number }

interface Path {
  segs: Seg[]
  closed: boolean
}

const TAU = Math.PI * 2
const EPS = 1e-7
const mod = (a: number, m: number) => ((a % m) + m) % m
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)

function segPoint(s: Seg, t: number): Pt {
  if (s.kind === 'line') return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }
  const ang = s.a0 + s.sweep * t
  return { x: s.c.x + s.r * Math.cos(ang), y: s.c.y + s.r * Math.sin(ang) }
}

/** Local parameter of `p` on the segment's own curve (lines unbounded, arcs measured along the sweep). */
function localParam(s: Seg, p: Pt): number {
  if (s.kind === 'line') {
    const dx = s.b.x - s.a.x
    const dy = s.b.y - s.a.y
    const len2 = dx * dx + dy * dy
    return len2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2 : 0
  }
  const dir = Math.sign(s.sweep) || 1
  const rel = mod(dir * (Math.atan2(p.y - s.c.y, p.x - s.c.x) - s.a0), TAU)
  return rel / Math.abs(s.sweep)
}

/** Distance from `p` to the drawn segment. */
function segDistance(s: Seg, p: Pt): number {
  const t = localParam(s, p)
  if (s.kind === 'line') return dist(p, segPoint(s, Math.min(1, Math.max(0, t))))
  if (t <= 1) return Math.abs(dist(p, s.c) - s.r)
  return Math.min(dist(p, segPoint(s, 0)), dist(p, segPoint(s, 1)))
}

/** Parameter of a point along the whole path: segment index + local t. */
function pathParam(path: Path, p: Pt): number {
  let best = { d: Infinity, param: 0 }
  path.segs.forEach((s, i) => {
    const d = segDistance(s, p)
    if (d < best.d) best = { d, param: i + Math.min(1, Math.max(0, localParam(s, p))) }
  })
  return best.param
}

/** The part of a path between two parameters (p0 < p1). */
function subPath(segs: Seg[], p0: number, p1: number): Seg[] {
  const out: Seg[] = []
  for (let i = Math.floor(p0); i < Math.ceil(p1) && i < segs.length; i++) {
    const t0 = Math.max(p0 - i, 0)
    const t1 = Math.min(p1 - i, 1)
    if (t1 - t0 < EPS) continue
    const s = segs[i]
    if (s.kind === 'line') out.push({ kind: 'line', a: segPoint(s, t0), b: segPoint(s, t1) })
    else out.push({ kind: 'arc', c: s.c, r: s.r, a0: s.a0 + s.sweep * t0, sweep: s.sweep * (t1 - t0) })
  }
  return out
}

/** Arc from angle `from` to angle `to` going the way that passes through angle `via`. */
const ccwSweep = (from: number, to: number) => mod(to - from, TAU) || TAU

/* ---------- entities <-> paths ---------- */

const pt = (p: { x: number; y: number }): Pt => ({ x: p.x, y: p.y })

function polylineSegs(pl: AcDbPolyline): Seg[] {
  const segs: Seg[] = []
  let cursor = pt(pl.getPoint3dAt(0))
  for (const prim of pl.subGetIntersectCurves()) {
    if (prim.kind === 'line') {
      segs.push({ kind: 'line', a: pt(prim.line.startPoint), b: pt(prim.line.endPoint) })
    } else if (prim.kind === 'circArc') {
      const arc = prim.arc
      const c = pt(arc.center)
      let a0 = arc.startAngle
      let sweep = arc.clockwise ? -mod(arc.startAngle - arc.endAngle, TAU) : mod(arc.endAngle - arc.startAngle, TAU)
      const s: Seg = { kind: 'arc', c, r: arc.radius, a0, sweep }
      // Keep the vertex order: start each arc where the previous piece ended.
      if (dist(segPoint(s, 0), cursor) > dist(segPoint(s, 1), cursor)) {
        a0 = a0 + sweep
        sweep = -sweep
      }
      segs.push({ kind: 'arc', c, r: arc.radius, a0, sweep })
    } else {
      return []
    }
    cursor = segPoint(segs[segs.length - 1], 1)
  }
  return segs
}

function pathOf(entity: AcDbEntity): Path | null {
  if (entity instanceof AcDbLine) {
    return { segs: [{ kind: 'line', a: pt(entity.startPoint), b: pt(entity.endPoint) }], closed: false }
  }
  if (entity instanceof AcDbArc) {
    const sweep = ccwSweep(entity.startAngle, entity.endAngle)
    return { segs: [{ kind: 'arc', c: pt(entity.center), r: entity.radius, a0: entity.startAngle, sweep }], closed: false }
  }
  if (entity instanceof AcDbCircle) {
    return { segs: [{ kind: 'arc', c: pt(entity.center), r: entity.radius, a0: 0, sweep: TAU }], closed: true }
  }
  if (entity instanceof AcDbPolyline && entity.numberOfVertices > 1) {
    const segs = polylineSegs(entity)
    return segs.length ? { segs, closed: entity.closed } : null
  }
  return null
}

/** Copies layer, color, linetype and lineweight so a new piece looks like its source. */
function copyLook(from: AcDbEntity, to: AcDbEntity) {
  to.layer = from.layer
  to.color = from.color
  to.lineType = from.lineType
  to.linetypeScale = from.linetypeScale
  to.lineWeight = from.lineWeight
}

function arcFromSeg(s: Extract<Seg, { kind: 'arc' }>): { start: number; end: number } {
  return s.sweep >= 0 ? { start: mod(s.a0, TAU), end: mod(s.a0 + s.sweep, TAU) } : { start: mod(s.a0 + s.sweep, TAU), end: mod(s.a0, TAU) }
}

function writePolyline(pl: AcDbPolyline, segs: Seg[], closed: boolean) {
  pl.reset(false)
  segs.forEach((s, i) => {
    const start = segPoint(s, 0)
    const bulge = s.kind === 'arc' ? Math.tan(s.sweep / 4) : 0
    pl.addVertexAt(i, new AcGePoint2d(start.x, start.y), bulge)
  })
  if (!closed) {
    const end = segPoint(segs[segs.length - 1], 1)
    pl.addVertexAt(segs.length, new AcGePoint2d(end.x, end.y), 0)
  }
  pl.closed = closed
}

/** Writes `segs` into the entity it came from, or into a new copy of it. */
function shapeFrom(source: AcDbEntity, target: AcDbEntity | null, segs: Seg[]): AcDbEntity | null {
  if (!segs.length) return null
  if (source instanceof AcDbLine) {
    const line = (target as AcDbLine | null) ?? (source.clone() as AcDbLine)
    const s = segs[0] as Extract<Seg, { kind: 'line' }>
    line.startPoint = new AcGePoint3d(s.a.x, s.a.y, source.startPoint.z)
    line.endPoint = new AcGePoint3d(s.b.x, s.b.y, source.endPoint.z)
    return line
  }
  if (source instanceof AcDbArc || source instanceof AcDbCircle) {
    const s = segs[0] as Extract<Seg, { kind: 'arc' }>
    const { start, end } = arcFromSeg(s)
    if (source instanceof AcDbArc) {
      const arc = (target as AcDbArc | null) ?? (source.clone() as AcDbArc)
      arc.startAngle = start
      arc.endAngle = end
      return arc
    }
    const arc = new AcDbArc(source.center, source.radius, start, end)
    copyLook(source, arc)
    return arc
  }
  if (source instanceof AcDbPolyline) {
    const pl = (target as AcDbPolyline | null) ?? (source.clone() as AcDbPolyline)
    writePolyline(pl, segs, false)
    return pl
  }
  return null
}

/* ---------- prompts ---------- */

const editor = () => AcApDocManager.instance.editor

type Keyword = [display: string, global: string]

function addKeywords(options: { keywords: { add(display: string, global: string, local: string): unknown } }, list: Keyword[]) {
  for (const [display, global] of list) options.keywords.add(display, global, global)
}

async function getPoint(message: string, base?: Pt): Promise<Pt | null> {
  const options = new AcEdPromptPointOptions(message)
  if (base) {
    options.useBasePoint = true
    options.useDashedLine = true
    options.basePoint = new AcGePoint3d(base.x, base.y, 0)
  }
  const result = await editor().getPoint(options)
  return result.status === AcEdPromptStatus.OK && result.value ? pt(result.value) : null
}

type Picked = { entity: AcDbEntity; point: Pt } | { keyword: string } | { done: true } | null

async function pickEntity(message: string, keywords: Keyword[] = []): Promise<Picked> {
  const options = new AcEdPromptEntityOptions(message)
  addKeywords(options, keywords)
  options.allowNone = true
  const result = await editor().getEntity(options)
  if (result.status === AcEdPromptStatus.Keyword && result.stringResult) return { keyword: result.stringResult }
  if (result.status === AcEdPromptStatus.None) return { done: true }
  if (result.status !== AcEdPromptStatus.OK || !result.objectId) return null
  const entity = AcApDocManager.instance.curDocument.database.tables.blockTable.getEntityById(result.objectId)
  if (!entity) return null
  return { entity, point: pt(result.pickedPoint ?? { x: 0, y: 0 }) }
}

async function getDistance(
  message: string,
  opts: { base?: Pt; value?: number; keywords?: Keyword[]; allowZero?: boolean } = {}
): Promise<{ value: number } | { keyword: string } | null> {
  const options = new AcEdPromptDistanceOptions(message)
  if (opts.base) {
    options.useBasePoint = true
    options.useDashedLine = true
    options.basePoint = new AcGePoint3d(opts.base.x, opts.base.y, 0)
  }
  options.allowNegative = false
  options.allowZero = opts.allowZero ?? false
  if (opts.value !== undefined) {
    options.useDefaultValue = true
    options.defaultValue = opts.value
  }
  addKeywords(options, opts.keywords ?? [])
  const result = await editor().getDistance(options)
  if (result.status === AcEdPromptStatus.Keyword && result.stringResult) return { keyword: result.stringResult }
  if (result.status !== AcEdPromptStatus.OK || result.value === undefined) return null
  return { value: result.value }
}

async function askYesNo(message: string, defaultYes: boolean): Promise<boolean | null> {
  const options = new AcEdPromptKeywordOptions(message)
  addKeywords(options, [
    ['예(Y)', 'Yes'],
    ['아니요(N)', 'No']
  ])
  options.allowNone = true
  const result = await editor().getKeywords(options)
  if (result.status === AcEdPromptStatus.None) return defaultYes
  if (result.status !== AcEdPromptStatus.OK && result.status !== AcEdPromptStatus.Keyword) return null
  return result.stringResult === 'Yes'
}

/* ---------- drawing helpers ---------- */

function currentSpace(context: AcApContext) {
  const db = context.doc.database
  return db.tables.blockTable.getIdAt(db.currentSpaceId) ?? db.tables.blockTable.modelSpace
}

function addToDrawing(context: AcApContext, entities: AcDbEntity[]) {
  if (!entities.length) return
  currentSpace(context).appendEntity(entities)
  context.view.addEntity(entities)
}

function eraseFromDrawing(context: AcApContext, entities: AcDbEntity[]) {
  if (!entities.length) return
  context.doc.entityService.eraseEntities(entities.map(e => e.objectId))
  context.view.removeEntity(entities)
}

function writable<T extends AcDbEntity>(context: AcApContext, entity: T): T {
  return (context.doc.database.openEntityForWrite(entity) as T | undefined) ?? entity
}

/** Visible entities of the current space other than `except`, near `near` when given. */
function otherEntities(context: AcApContext, except: AcDbEntity, near?: { min: Pt; max: Pt }): AcDbEntity[] {
  const db = context.doc.database
  const layers = db.tables.layerTable
  const out: AcDbEntity[] = []
  for (const e of currentSpace(context).newIterator()) {
    if (e.objectId === except.objectId) continue
    const layer = layers.getAt(e.layer)
    if (layer && (layer.isOff || layer.isFrozen)) continue
    if (near) {
      const box = e.geometricExtents
      if (box && (box.max.x < near.min.x || box.min.x > near.max.x || box.max.y < near.min.y || box.min.y > near.max.y)) continue
    }
    out.push(e)
  }
  return out
}

function extentsOf(entity: AcDbEntity): { min: Pt; max: Pt } | undefined {
  const box = entity.geometricExtents
  if (!box) return undefined
  const pad = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 1e-6 + 1e-6
  return { min: { x: box.min.x - pad, y: box.min.y - pad }, max: { x: box.max.x + pad, y: box.max.y + pad } }
}

abstract class AppCommand extends AcEdCommand {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  protected say(message: string) {
    this.notify(message)
  }
}

/* ---------- MIRROR / SCALE ---------- */

function mirrorMatrix(p1: Pt, p2: Pt): AcGeMatrix3d {
  const a = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  const c = Math.cos(2 * a)
  const s = Math.sin(2 * a)
  const tx = p1.x - c * p1.x - s * p1.y
  const ty = p1.y - s * p1.x + c * p1.y
  return new AcGeMatrix3d().set(c, s, 0, tx, s, -c, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1)
}

function scaleMatrix(base: Pt, k: number): AcGeMatrix3d {
  return new AcGeMatrix3d().set(k, 0, 0, base.x * (1 - k), 0, k, 0, base.y * (1 - k), 0, 0, k, 0, 0, 0, 0, 1)
}

class MirrorCmd extends AppCommand {
  async execute(context: AcApContext) {
    const picked = await resolveSelectedEntities(context, { promptKey: 'mirror' })
    if (!picked?.entities.length) return
    const p1 = await getPoint('대칭선의 첫 점을 찍으세요')
    if (!p1) return
    const p2 = await getPoint('대칭선의 두 번째 점을 찍으세요', p1)
    if (!p2 || dist(p1, p2) < EPS) return
    const eraseSource = await askYesNo('원본 객체를 지울까요? 아니면 확인', false)
    if (eraseSource === null) return
    const copies = picked.entities.map(e => e.clone()).filter((e): e is AcDbEntity => !!e)
    const matrix = mirrorMatrix(p1, p2)
    copies.forEach(e => e.transformBy(matrix))
    addToDrawing(context, copies)
    if (eraseSource) eraseFromDrawing(context, picked.entities)
    context.view.selectionSet.clear()
  }
}

class ScaleCmd extends AppCommand {
  async execute(context: AcApContext) {
    const picked = await resolveSelectedEntities(context, { promptKey: 'scale' })
    if (!picked?.entities.length) return
    const base = await getPoint('기준점을 찍으세요')
    if (!base) return
    let factor: number | null = null
    const first = await getDistance('축척 비율을 입력하거나 옵션을 고르세요', { base, keywords: [['기준 길이(R)', 'Reference']] })
    if (!first) return
    if ('keyword' in first) {
      const ref = await getDistance('기준 길이를 입력하거나 두 점을 찍으세요', { value: 1 })
      if (!ref || !('value' in ref) || ref.value <= 0) return
      const next = await getDistance('새 길이를 입력하세요', { base })
      if (!next || !('value' in next)) return
      factor = next.value / ref.value
    } else {
      factor = first.value
    }
    if (!factor || factor <= 0) return
    const matrix = scaleMatrix(base, factor)
    picked.entities.forEach(e => {
      const w = writable(context, e)
      w.transformBy(matrix)
      context.view.updateEntity(w)
    })
    context.view.selectionSet.clear()
  }
}

/* ---------- EXPLODE ---------- */

function explodeBlock(ref: AcDbBlockReference): AcDbEntity[] {
  const record = ref.blockTableRecord
  if (!record) return []
  const matrix = ref.blockTransform
  const parts: AcDbEntity[] = []
  for (const e of record.newIterator()) {
    if (e instanceof AcDbAttributeDefinition) continue
    const part = e.clone()
    if (!part) continue
    part.transformBy(matrix)
    // Pieces drawn on layer 0 or "by block" take the block's look, so nothing changes on screen.
    if (part.layer === '0') part.layer = ref.layer
    if (part.color.isByBlock) part.color = ref.color
    parts.push(part)
  }
  for (const attrib of ref.attributeIterator()) {
    if (!attrib.textString) continue
    const text = new AcDbText()
    text.textString = attrib.textString
    text.position = attrib.position
    text.height = attrib.height
    text.rotation = attrib.rotation
    text.styleName = attrib.styleName
    text.horizontalMode = attrib.horizontalMode
    text.verticalMode = attrib.verticalMode
    text.alignmentPoint = attrib.alignmentPoint
    copyLook(attrib, text)
    parts.push(text)
  }
  return parts
}

function explodePolyline(pl: AcDbPolyline): AcDbEntity[] {
  const path = pathOf(pl)
  if (!path) return []
  return path.segs.map(s => {
    let piece: AcDbEntity
    if (s.kind === 'line') {
      piece = new AcDbLine(new AcGePoint3d(s.a.x, s.a.y, pl.elevation), new AcGePoint3d(s.b.x, s.b.y, pl.elevation))
    } else {
      const { start, end } = arcFromSeg(s)
      piece = new AcDbArc(new AcGePoint3d(s.c.x, s.c.y, pl.elevation), s.r, start, end)
    }
    copyLook(pl, piece)
    return piece
  })
}

class ExplodeCmd extends AppCommand {
  async execute(context: AcApContext) {
    const picked = await resolveSelectedEntities(context, { promptKey: 'explode' })
    if (!picked?.entities.length) return
    const parts: AcDbEntity[] = []
    const exploded: AcDbEntity[] = []
    for (const e of picked.entities) {
      const pieces = e instanceof AcDbBlockReference ? explodeBlock(e) : e instanceof AcDbPolyline ? explodePolyline(e) : []
      if (!pieces.length) continue
      parts.push(...pieces)
      exploded.push(e)
    }
    addToDrawing(context, parts)
    eraseFromDrawing(context, exploded)
    context.view.selectionSet.clear()
    const skipped = picked.entities.length - exploded.length
    this.say(
      skipped > 0
        ? `객체 ${exploded.length}개를 분해했어요. 블록과 폴리선이 아닌 ${skipped}개는 그대로 뒀어요.`
        : `객체 ${exploded.length}개를 분해했어요.`
    )
  }
}

/* ---------- TRIM / EXTEND ---------- */

function intersectionParams(path: Path, entity: AcDbEntity, others: AcDbEntity[], mode: AcDbIntersect): number[] {
  const params: number[] = []
  for (const other of others) {
    for (const p of entity.intersectWith(other, mode)) params.push(pathParam(path, pt(p)))
  }
  return params.sort((a, b) => a - b).filter((p, i, all) => i === 0 || p - all[i - 1] > EPS)
}

/** Removes the piece of `entity` around `at` that lies between its nearest cutting edges. */
function trimAt(context: AcApContext, entity: AcDbEntity, at: Pt): string | null {
  const path = pathOf(entity)
  if (!path) return '선, 호, 원, 폴리선만 자를 수 있어요.'
  const n = path.segs.length
  const others = otherEntities(context, entity, extentsOf(entity))
  const cuts = intersectionParams(path, entity, others, AcDbIntersect.OnBothOperands).filter(
    p => path.closed || (p > EPS && p < n - EPS)
  )
  const s = pathParam(path, at)

  if (path.closed) {
    if (cuts.length < 2) return '닫힌 도형은 자르는 선이 두 군데 이상 걸쳐야 해요.'
    const after = cuts.find(p => p > s + EPS) ?? cuts[0]
    const before = [...cuts].reverse().find(p => p < s - EPS) ?? cuts[cuts.length - 1]
    // Keep the way round from `after` to `before`, which skips the picked piece.
    const segs = after < before ? subPath(path.segs, after, before) : [...subPath(path.segs, after, n), ...subPath(path.segs, 0, before)]
    const piece = shapeFrom(entity, entity instanceof AcDbCircle ? null : writable(context, entity), segs)
    if (!piece) return null
    if (entity instanceof AcDbCircle) {
      addToDrawing(context, [piece])
      eraseFromDrawing(context, [entity])
    } else {
      writePolyline(piece as AcDbPolyline, segs, false)
      context.view.updateEntity(piece)
    }
    return null
  }

  const lower = [...cuts].reverse().find(p => p < s - EPS)
  const upper = cuts.find(p => p > s + EPS)
  if (lower === undefined && upper === undefined) {
    eraseFromDrawing(context, [entity])
    return '자르는 선이 걸치지 않아서 객체를 통째로 지웠어요.'
  }
  const keepStart = lower !== undefined ? subPath(path.segs, 0, lower) : []
  const keepEnd = upper !== undefined ? subPath(path.segs, upper, n) : []
  const w = writable(context, entity)
  if (keepStart.length) {
    shapeFrom(entity, w, keepStart)
    context.view.updateEntity(w)
    if (keepEnd.length) {
      const extra = shapeFrom(entity, null, keepEnd)
      if (extra) addToDrawing(context, [extra])
    }
  } else {
    shapeFrom(entity, w, keepEnd)
    context.view.updateEntity(w)
  }
  return null
}

/** Stretches the end of `entity` nearest to `at` to the closest edge it would meet. */
function extendAt(context: AcApContext, entity: AcDbEntity, at: Pt): string | null {
  const path = pathOf(entity)
  if (!path || path.closed) return '열린 선, 호, 폴리선만 늘일 수 있어요.'
  const n = path.segs.length
  const fromEnd = pathParam(path, at) >= n / 2
  const index = fromEnd ? n - 1 : 0
  const seg = path.segs[index]
  const others = otherEntities(context, entity)
  let best: number | undefined
  for (const other of others) {
    for (const hit of entity.intersectWith(other, AcDbIntersect.ExtendThis)) {
      const t = localParam(seg, pt(hit))
      if (seg.kind === 'line') {
        const beyond = fromEnd ? t - 1 : -t
        if (beyond > EPS && (best === undefined || beyond < best)) best = beyond
      } else {
        const span = Math.abs(seg.sweep)
        // Angle travelled past the end (or back past the start) along the circle.
        const rel = fromEnd ? t * span - span : mod(-t * span, TAU)
        const beyond = fromEnd ? mod(rel, TAU) : rel
        if (beyond > EPS && beyond < TAU - span - EPS && (best === undefined || beyond < best)) best = beyond
      }
    }
  }
  if (best === undefined) return '늘여서 닿을 경계가 없어요.'
  let grown: Seg
  if (seg.kind === 'line') {
    grown = fromEnd
      ? { kind: 'line', a: seg.a, b: segPoint(seg, 1 + best) }
      : { kind: 'line', a: segPoint(seg, -best), b: seg.b }
  } else {
    const dir = Math.sign(seg.sweep) || 1
    grown = fromEnd
      ? { ...seg, sweep: seg.sweep + dir * best }
      : { ...seg, a0: seg.a0 - dir * best, sweep: seg.sweep + dir * best }
  }
  const segs = [...path.segs]
  segs[index] = grown
  const w = writable(context, entity)
  if (entity instanceof AcDbPolyline) writePolyline(w as unknown as AcDbPolyline, segs, false)
  else shapeFrom(entity, w, segs)
  context.view.updateEntity(w)
  return null
}

class TrimCmd extends AppCommand {
  async execute(context: AcApContext) {
    for (;;) {
      const picked = await pickEntity('잘라 낼 부분을 고르세요. 끝내려면 확인')
      if (!picked || 'done' in picked || 'keyword' in picked) return
      const message = trimAt(context, picked.entity, picked.point)
      if (message) this.say(message)
    }
  }
}

class ExtendCmd extends AppCommand {
  async execute(context: AcApContext) {
    for (;;) {
      const picked = await pickEntity('늘일 객체의 끝 쪽을 고르세요. 끝내려면 확인')
      if (!picked || 'done' in picked || 'keyword' in picked) return
      const message = extendAt(context, picked.entity, picked.point)
      if (message) this.say(message)
    }
  }
}

/* ---------- FILLET ---------- */

let filletRadius = 0

/** Corner of two lines: trims or extends both to meet, rounding with an arc when r > 0. */
function filletLines(context: AcApContext, l1: AcDbLine, p1: Pt, l2: AcDbLine, p2: Pt, r: number): string | null {
  const s1 = { kind: 'line' as const, a: pt(l1.startPoint), b: pt(l1.endPoint) }
  const s2 = { kind: 'line' as const, a: pt(l2.startPoint), b: pt(l2.endPoint) }
  const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y }
  const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y }
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-12) return '두 선이 평행해서 모서리를 만들 수 없어요.'
  const k = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / cross
  const corner = { x: s1.a.x + d1.x * k, y: s1.a.y + d1.y * k }
  const t1 = localParam(s1, corner)
  const t2 = localParam(s2, corner)
  // Each line keeps the side the user tapped; that side's far end stays put.
  const keep1 = localParam(s1, p1) < t1 ? s1.a : s1.b
  const keep2 = localParam(s2, p2) < t2 ? s2.a : s2.b
  const len1 = dist(keep1, corner)
  const len2 = dist(keep2, corner)
  if (len1 < EPS || len2 < EPS) return '고른 쪽이 모서리와 겹쳐요. 선의 다른 부분을 골라 주세요.'
  const u1 = { x: (keep1.x - corner.x) / len1, y: (keep1.y - corner.y) / len1 }
  const u2 = { x: (keep2.x - corner.x) / len2, y: (keep2.y - corner.y) / len2 }
  let end1 = corner
  let end2 = corner
  let arc: AcDbArc | null = null
  if (r > 0) {
    const half = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))) / 2
    const reach = r / Math.tan(half)
    if (reach > len1 + EPS || reach > len2 + EPS) return '반지름이 너무 커서 선 안에 들어가지 않아요.'
    end1 = { x: corner.x + u1.x * reach, y: corner.y + u1.y * reach }
    end2 = { x: corner.x + u2.x * reach, y: corner.y + u2.y * reach }
    const bis = { x: u1.x + u2.x, y: u1.y + u2.y }
    const bl = Math.hypot(bis.x, bis.y)
    const center = { x: corner.x + (bis.x / bl) * (r / Math.sin(half)), y: corner.y + (bis.y / bl) * (r / Math.sin(half)) }
    const a1 = Math.atan2(end1.y - center.y, end1.x - center.x)
    const a2 = Math.atan2(end2.y - center.y, end2.x - center.x)
    const turn = (end1.x - center.x) * (end2.y - center.y) - (end1.y - center.y) * (end2.x - center.x)
    arc = turn > 0 ? new AcDbArc(new AcGePoint3d(center.x, center.y, 0), r, a1, a2) : new AcDbArc(new AcGePoint3d(center.x, center.y, 0), r, a2, a1)
    copyLook(l1, arc)
  }
  const w1 = writable(context, l1)
  const w2 = writable(context, l2)
  w1.startPoint = new AcGePoint3d(keep1.x, keep1.y, l1.startPoint.z)
  w1.endPoint = new AcGePoint3d(end1.x, end1.y, l1.endPoint.z)
  w2.startPoint = new AcGePoint3d(keep2.x, keep2.y, l2.startPoint.z)
  w2.endPoint = new AcGePoint3d(end2.x, end2.y, l2.endPoint.z)
  context.view.updateEntity([w1, w2])
  if (arc) addToDrawing(context, [arc])
  return null
}

class FilletCmd extends AppCommand {
  async execute(context: AcApContext) {
    let first: { entity: AcDbEntity; point: Pt } | null = null
    while (!first) {
      const picked = await pickEntity(`첫 번째 선을 고르거나 옵션을 고르세요 (반지름 ${filletRadius})`, [['반지름(R)', 'Radius']])
      if (!picked || 'done' in picked) return
      if ('keyword' in picked) {
        const r = await getDistance('모깎기 반지름을 입력하세요', { value: filletRadius, allowZero: true })
        if (r && 'value' in r) filletRadius = r.value
        continue
      }
      if (!(picked.entity instanceof AcDbLine)) {
        this.say('지금은 선끼리만 모깎기 할 수 있어요.')
        continue
      }
      first = picked
    }
    for (;;) {
      const second = await pickEntity('두 번째 선을 고르세요')
      if (!second || 'done' in second || 'keyword' in second) return
      if (!(second.entity instanceof AcDbLine) || second.entity.objectId === first.entity.objectId) {
        this.say('첫 번째와 다른 선을 골라 주세요.')
        continue
      }
      const message = filletLines(context, first.entity as AcDbLine, first.point, second.entity, second.point, filletRadius)
      if (message) this.say(message)
      return
    }
  }
}

/* ---------- TEXTEDIT ---------- */

class TextEditCmd extends AppCommand {
  async execute(context: AcApContext) {
    for (;;) {
      const picked = await pickEntity('고칠 글자를 고르세요. 끝내려면 확인')
      if (!picked || 'done' in picked || 'keyword' in picked) return
      const e = picked.entity
      if (e instanceof AcDbMText) {
        const values = await editTexts('글자 고치기', [{ label: '내용', value: e.contents.replace(/\\P/g, '\n'), multiline: true }])
        if (!values) continue
        const w = writable(context, e)
        w.contents = values[0].replace(/\r?\n/g, '\\P')
        context.view.updateEntity(w)
      } else if (e instanceof AcDbText && !(e instanceof AcDbAttributeDefinition)) {
        const values = await editTexts('글자 고치기', [{ label: '내용', value: e.textString }])
        if (!values) continue
        const w = writable(context, e)
        w.textString = values[0]
        context.view.updateEntity(w)
      } else if (e instanceof AcDbBlockReference) {
        const attribs = [...e.attributeIterator()]
        if (!attribs.length) {
          this.say('이 블록에는 고칠 속성 글자가 없어요.')
          continue
        }
        const values = await editTexts(
          `블록 속성 고치기 (${e.blockName})`,
          attribs.map(a => ({ label: a.tag, value: a.textString }))
        )
        if (!values) continue
        attribs.forEach((a, i) => {
          if (values[i] === a.textString) return
          const w = writable(context, a)
          w.textString = values[i]
        })
        context.view.updateEntity(writable(context, e))
      } else {
        this.say('글자나 속성 글자가 있는 블록을 골라 주세요.')
      }
    }
  }
}

/* ---------- property changes from the 속성 panel ---------- */

export interface PropChange {
  ids: string[]
  layer?: string
  color?: { method: 'layer' | 'block' | 'index'; index?: number }
  lineType?: string
  lineWeight?: number
}

let pendingProps: PropChange | null = null

/** Queues a change for APPPROP, which applies it inside one undoable command. */
export function queuePropChange(change: PropChange) {
  pendingProps = change
}

class PropCmd extends AppCommand {
  async execute(context: AcApContext) {
    const change = pendingProps
    pendingProps = null
    if (!change) return
    const table = context.doc.database.tables.blockTable
    for (const id of change.ids) {
      const e = table.getEntityById(id)
      if (!e) continue
      const w = writable(context, e)
      if (change.layer) w.layer = change.layer
      if (change.color) {
        const color = new AcCmColor()
        if (change.color.method === 'layer') color.setByLayer()
        else if (change.color.method === 'block') color.setByBlock()
        else color.colorIndex = change.color.index
        w.color = color
      }
      if (change.lineType) w.lineType = change.lineType
      if (change.lineWeight !== undefined) w.lineWeight = change.lineWeight
      context.view.updateEntity(w)
    }
  }
}

let openProperties: ((ids: string[]) => void) | null = null

/** Lets PROPERTIES (PR, CH, MO) open the 속성 panel, which lives in the edit UI. */
export function onPropertiesCommand(open: (ids: string[]) => void) {
  openProperties = open
}

class PropertiesCmd extends AppCommand {
  constructor() {
    super()
    // Only opens the panel; APPPROP records the change.
    this.recordsUndoStack = false
  }

  async execute(context: AcApContext) {
    const picked = await resolveSelectedEntities(context, { promptKey: 'properties' })
    if (picked?.entities.length) openProperties?.(picked.entities.map(e => e.objectId))
  }
}

/* ---------- registration ---------- */

/** Command name, its implementation and AutoCAD's usual aliases. */
const COMMANDS: [string, () => AcEdCommand, string[]][] = [
  ['mirror', () => new MirrorCmd(), ['MI']],
  ['scale', () => new ScaleCmd(), ['SC']],
  ['explode', () => new ExplodeCmd(), ['X']],
  ['trim', () => new TrimCmd(), ['TR']],
  ['extend', () => new ExtendCmd(), ['EX']],
  ['fillet', () => new FilletCmd(), ['F']],
  ['textedit', () => new TextEditCmd(), ['ED', 'DDEDIT']],
  ['properties', () => new PropertiesCmd(), ['PR', 'PROPS', 'CH', 'MO']],
  ['appprop', () => new PropCmd(), []]
]

export function registerAppCommands() {
  const stack = AcApDocManager.instance.commandManager
  for (const [name, make, aliases] of COMMANDS) {
    stack.addCommand('USER', name, name, make(), aliases)
  }
}
