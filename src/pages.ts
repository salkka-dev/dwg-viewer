import {
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbPolyline,
  AcDbViewport
} from '@mlightcad/data-model'

import { listLayouts } from './engine'

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type PageKind = 'model' | 'layout' | 'frame'

/** One PDF page candidate: a paper-space layout, model space, or a sheet frame found in model space. */
export interface ExportPage {
  id: string
  kind: PageKind
  name: string
  btrId: string
  /** WCS framing box (frames only). */
  box?: Box
  selected: boolean
}

// Block / layer names that usually mean "drawing sheet frame" (도곽, title block).
const FRAME_NAME = /도곽|도면틀|도면 틀|표제|양식|테두리|frame|border|title|tblock|sheet|form/i
const NUMBER_TAG = /도면\s*번호|도번|(dwg|drawing|sheet|sht)[\s._-]*(no|num)|^no\.?$/i
const TITLE_TAG = /도면\s*명|도명|도면\s*이름|title|(dwg|drawing|sheet)[\s._-]*name/i

const width = (b: Box) => b.maxX - b.minX
const height = (b: Box) => b.maxY - b.minY
const area = (b: Box) => width(b) * height(b)

function toBox(ext: { min: { x: number; y: number }; max: { x: number; y: number } }): Box | undefined {
  const b = { minX: ext.min.x, minY: ext.min.y, maxX: ext.max.x, maxY: ext.max.y }
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return undefined
  if (b.maxX <= b.minX || b.maxY <= b.minY) return undefined
  return b
}

function contains(outer: Box, inner: Box, tol: number) {
  return (
    inner.minX >= outer.minX - tol &&
    inner.minY >= outer.minY - tol &&
    inner.maxX <= outer.maxX + tol &&
    inner.maxY <= outer.maxY + tol
  )
}

/** Sheet frames are paper shaped: A-series is 1.414, ANSI/ARCH 1.29 to 1.55, long sheets up to ~2.2. */
function paperShaped(b: Box) {
  const r = Math.max(width(b), height(b)) / Math.min(width(b), height(b))
  return r >= 1.15 && r <= 2.25
}

function isAxisRectangle(pl: AcDbPolyline, box: Box): boolean {
  const n = pl.numberOfVertices
  if (n < 4 || n > 5) return false
  if (n === 4 && !pl.closed) return false
  const tol = Math.max(width(box), height(box)) * 1e-4
  for (let i = 0; i < n; i++) {
    const p = pl.getPoint2dAt(i)
    const onX = Math.abs(p.x - box.minX) <= tol || Math.abs(p.x - box.maxX) <= tol
    const onY = Math.abs(p.y - box.minY) <= tol || Math.abs(p.y - box.maxY) <= tol
    if (!onX || !onY) return false
  }
  // Rejects rounded/bulged outlines whose extents happen to be a rectangle.
  return Math.abs(Math.abs(pl.area) - area(box)) <= area(box) * 0.005
}

function isLayerVisible(db: AcDbDatabase, layerName: string) {
  const layer = db.tables.layerTable.getAt(layerName)
  return !layer || (!layer.isOff && !layer.isFrozen)
}

function blockLabel(ref: AcDbBlockReference): string | undefined {
  let number = ''
  let title = ''
  for (const attr of ref.attributeIterator()) {
    const tag = (attr.tag || '').trim()
    const value = (attr.textString || '').replace(/\\P/g, ' ').trim()
    if (!value) continue
    if (!number && NUMBER_TAG.test(tag)) number = value
    else if (!title && TITLE_TAG.test(tag)) title = value
  }
  const label = [number, title].filter(Boolean).join(' ')
  return label || undefined
}

interface Candidate {
  box: Box
  kind: 'insert' | 'rect'
  name: string
  layer: string
  label?: string
}

interface Point {
  x: number
  y: number
}

function overlapArea(a: Box, b: Box) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  return w > 0 && h > 0 ? w * h : 0
}

const inBox = (p: Point, b: Box) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY

const sameSize = (a: Box, b: Box) =>
  Math.abs(width(a) - width(b)) <= width(a) * 0.01 && Math.abs(height(a) - height(b)) <= height(a) * 0.01

/**
 * Finds drawing sheets laid out side by side in model space (도곽).
 *
 * Candidates are block references and closed axis-aligned rectangles with a
 * paper-like aspect ratio, grouped by identical size. Real sheet sets hold
 * most of the drawing, so a group is accepted by how many entities fall
 * inside its frames (coverage), not by repetition alone: repeated windows or
 * furniture blocks cover only a sliver of the drawing. Further groups of other
 * sizes are added greedily when they do not overlap and cover new content.
 */
export function detectFrames(db: AcDbDatabase): { box: Box; label?: string }[] {
  const model = db.tables.blockTable.modelSpace
  const candidates: Candidate[] = []
  const labeled: { box: Box; label: string }[] = []
  const centers: Point[] = []
  let total: Box | undefined

  for (const entity of model.newIterator() as Iterable<AcDbEntity>) {
    if (!entity.visibility || !isLayerVisible(db, entity.layer)) continue
    if (entity.dxfTypeName === 'XLINE' || entity.dxfTypeName === 'RAY') continue
    let box: Box | undefined
    try {
      box = toBox(entity.geometricExtents)
    } catch {
      box = undefined
    }
    if (!box) continue
    centers.push({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })
    total = total
      ? {
          minX: Math.min(total.minX, box.minX),
          minY: Math.min(total.minY, box.minY),
          maxX: Math.max(total.maxX, box.maxX),
          maxY: Math.max(total.maxY, box.maxY)
        }
      : { ...box }

    if (entity instanceof AcDbBlockReference) {
      if (entity.blockTableRecord?.isXref) continue
      const label = blockLabel(entity)
      if (label) labeled.push({ box, label })
      if (!paperShaped(box)) continue
      candidates.push({ box, kind: 'insert', name: entity.blockName, layer: entity.layer, label })
    } else if (entity instanceof AcDbPolyline && paperShaped(box) && isAxisRectangle(entity, box)) {
      candidates.push({ box, kind: 'rect', name: '', layer: entity.layer })
    }
  }
  if (!total || candidates.length === 0 || centers.length < 10) return []

  // Tiny paper-shaped things (furniture, legends) can never be sheets.
  const minArea = area(total) * 0.004
  const sized = candidates.filter(c => area(c.box) >= minArea)

  // Group by identical size; a rectangle drawn on top of a frame block is the same sheet.
  const groups: Candidate[][] = []
  for (const c of sized) {
    const group = groups.find(g => sameSize(g[0].box, c.box))
    if (!group) {
      groups.push([c])
      continue
    }
    const twin = group.find(o => overlapArea(o.box, c.box) >= area(c.box) * 0.9)
    if (!twin) group.push(c)
    else if (twin.kind === 'rect' && c.kind === 'insert') group[group.indexOf(twin)] = c
  }

  interface Scored {
    members: Candidate[]
    covered: Set<number>
    named: boolean
  }
  const scored: Scored[] = []
  for (const group of groups) {
    // Members of one sheet set never overlap each other.
    const overlapping = group.some((a, i) =>
      group.some((b, j) => j > i && overlapArea(a.box, b.box) > Math.min(area(a.box), area(b.box)) * 0.05)
    )
    if (overlapping) continue
    const members: Candidate[] = []
    const covered = new Set<number>()
    for (const m of group) {
      const inside: number[] = []
      centers.forEach((p, i) => inBox(p, m.box) && inside.push(i))
      if (inside.length < 5) continue
      members.push(m)
      inside.forEach(i => covered.add(i))
    }
    if (members.length === 0) continue
    const named = members.some(m => FRAME_NAME.test(m.name) || FRAME_NAME.test(m.layer))
    scored.push({ members, covered, named })
  }
  scored.sort(
    (a, b) => b.covered.size - a.covered.size || area(b.members[0].box) - area(a.members[0].box)
  )

  const n = centers.length
  const chosen: Candidate[] = []
  const covered = new Set<number>()
  for (const g of scored) {
    const share = g.covered.size / n
    if (chosen.length === 0) {
      const needed = g.members.length > 1 ? (g.named ? 0.35 : 0.5) : g.named ? 0.5 : 0.8
      if (share < needed) continue
    } else {
      const clashes = g.members.some(m => chosen.some(c => overlapArea(c.box, m.box) > 0))
      let gain = 0
      g.covered.forEach(i => !covered.has(i) && gain++)
      if (clashes || gain / n < 0.05) continue
    }
    chosen.push(...g.members)
    g.covered.forEach(i => covered.add(i))
  }
  if (chosen.length === 0) return []

  // Title block attributes inside a chosen frame (when the frame itself is a plain rectangle).
  for (const c of chosen) {
    if (c.label) continue
    const inner = labeled.find(o => contains(c.box, o.box, width(c.box) * 0.002))
    if (inner) c.label = inner.label
  }
  return sortReadingOrder(chosen).map(c => ({ box: c.box, label: c.label }))
}

/** Rows top to bottom, then left to right inside each row. */
function sortReadingOrder<T extends { box: Box }>(items: T[]): T[] {
  if (items.length < 2) return items
  const byTop = [...items].sort((a, b) => b.box.maxY - a.box.maxY)
  const rowTol = Math.min(...items.map(i => height(i.box))) * 0.5
  const rows: T[][] = []
  for (const item of byTop) {
    const cy = (item.box.minY + item.box.maxY) / 2
    const row = rows.find(r => {
      const first = r[0].box
      return Math.abs((first.minY + first.maxY) / 2 - cy) <= rowTol
    })
    if (row) row.push(item)
    else rows.push([item])
  }
  return rows.flatMap(r => r.sort((a, b) => a.box.minX - b.box.minX))
}

export function layoutHasContent(db: AcDbDatabase, btrId: string): boolean {
  const block = db.tables.blockTable.getIdAt(btrId)
  if (!block) return false
  let viewports = 0
  for (const entity of block.newIterator()) {
    if (entity instanceof AcDbViewport) {
      // Viewport #1 is the paper sheet itself; a second one shows model space.
      if (entity.number > 1 || ++viewports > 1) return true
      continue
    }
    return true
  }
  return false
}

function modelHasContent(db: AcDbDatabase) {
  for (const _ of db.tables.blockTable.modelSpace.newIterator()) return true
  return false
}

/**
 * Lists every page the drawing can be split into and pre-selects the ones
 * that look like real sheets: paper layouts when the drawing uses them,
 * otherwise the frames found in model space, otherwise model space itself.
 */
export function collectPages(db: AcDbDatabase): ExportPage[] {
  const pages: ExportPage[] = []
  const modelId = db.tables.blockTable.modelSpace.objectId

  for (const layout of listLayouts(db)) {
    if (layout.isModel) continue
    if (!layoutHasContent(db, layout.btrId)) continue
    pages.push({
      id: `layout-${layout.btrId}`,
      kind: 'layout',
      name: layout.name,
      btrId: layout.btrId,
      selected: true
    })
  }

  const hasModel = modelHasContent(db)
  const frames = hasModel ? detectFrames(db) : []
  frames.forEach((frame, i) => {
    const no = String(i + 1).padStart(2, '0')
    pages.push({
      id: `frame-${i}`,
      kind: 'frame',
      name: frame.label ? `도곽 ${no} ${frame.label}` : `도곽 ${no}`,
      btrId: modelId,
      box: frame.box,
      selected: false
    })
  })
  if (hasModel) {
    pages.push({ id: 'model', kind: 'model', name: '모형 전체', btrId: modelId, selected: false })
  }

  const layouts = pages.filter(p => p.kind === 'layout')
  const framePages = pages.filter(p => p.kind === 'frame')
  if (layouts.length === 0) {
    if (framePages.length > 0) framePages.forEach(p => (p.selected = true))
    else pages.forEach(p => (p.selected = p.kind === 'model'))
  }
  return pages
}
