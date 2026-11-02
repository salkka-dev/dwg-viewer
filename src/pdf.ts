import { AcApSettingManager } from '@mlightcad/cad-simple-viewer'
import { AcDbDatabase, AcDbRenderingCache, AcDbViewport } from '@mlightcad/data-model'
import {
  type AcPdfEntity,
  type AcPdfExportOptions,
  AcPdfRenderer,
  AcPdfStyleUtil,
  drawingUnitsToPdfPoints,
  mmToPdfPoints
} from '@mlightcad/pdf-renderer'
import { createViewerPdfGlyphProvider } from 'cad-pdf-plugin-lib/AcApPdfGlyphProvider.js'
import { PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib'
import { createPdfFormRegistry } from 'pdf-renderer-lib/pdf/AcPdfContentWriter.js'
import { AcPdfOcgManager } from 'pdf-renderer-lib/pdf/AcPdfOcgManager.js'
import { isDefaultPaperSpaceViewport } from 'pdf-renderer-lib/viewport/AcPdfPaperViewport.js'
import {
  buildViewportModelContent,
  collectBlockRoots,
  collectModelSpaceRoots,
  isPaperSpaceBlock
} from 'pdf-renderer-lib/viewport/AcPdfPaperSpaceExport.js'

import type { Box, ExportPage } from './pages'
import { safeFileName } from './util'

export type PaperChoice = 'original' | 'A4' | 'A3' | 'A2' | 'A1'

export interface PdfOptions {
  paper: PaperChoice
  monochrome: boolean
  lineWeights: boolean
}

export interface PdfFile {
  name: string
  bytes: Uint8Array
}

export interface PdfResult {
  combined: PdfFile
  pages: PdfFile[]
}

/** Landscape width x height in millimetres. */
const PAPER_MM: Record<Exclude<PaperChoice, 'original'>, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594]
}

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function unionBox(boxes: Box[]): Box | undefined {
  if (boxes.length === 0) return undefined
  return boxes.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY)
  }))
}

/** Box of a drawable including its children (async MTEXT groups keep an empty parent box). */
function drawableBox(entity: AcPdfEntity): Box | undefined {
  const boxes: Box[] = []
  const visit = (e: AcPdfEntity) => {
    if (!e.visible) return
    const b = e.box
    if (!b.isEmpty() && [b.min.x, b.min.y, b.max.x, b.max.y].every(Number.isFinite)) {
      boxes.push({ minX: b.min.x, minY: b.min.y, maxX: b.max.x, maxY: b.max.y })
    }
    for (let i = 0; i < e.childCount; i++) {
      const child = e.childAt(i)
      if (child) visit(child)
    }
  }
  visit(entity)
  return unionBox(boxes)
}

const MARGIN_MM = 5

function paperFor(choice: PaperChoice, box: Box | undefined): AcPdfExportOptions['paper'] {
  if (choice === 'original') return 'extents'
  const [long, short] = PAPER_MM[choice]
  const landscape = !box || box.maxX - box.minX >= box.maxY - box.minY
  return landscape ? { widthMm: long, heightMm: short } : { widthMm: short, heightMm: long }
}

/**
 * pdf-renderer never enlarges content on a fixed paper size (it plots 1:1 at
 * most), so an A4 sheet sent to A3 would sit small in the middle. True when the
 * content at its natural size is clearly smaller than the paper.
 */
function needsUpscale(box: Box | undefined, insunits: number, paper: AcPdfExportOptions['paper']) {
  if (!box || !paper || paper === 'extents') return false
  const ptPerUnit = drawingUnitsToPdfPoints(insunits)
  const availW = mmToPdfPoints(paper.widthMm - 2 * MARGIN_MM)
  const availH = mmToPdfPoints(paper.heightMm - 2 * MARGIN_MM)
  const w = (box.maxX - box.minX) * ptPerUnit
  const h = (box.maxY - box.minY) * ptPerUnit
  return w < availW * 0.97 && h < availH * 0.97
}

/** Scales the single page of `src` (vector, as a form XObject) to fit the paper. */
async function placeOnPaper(src: PDFDocument, title: string, paper: { widthMm: number; heightMm: number }) {
  const out = await newPdf(title)
  const embedded = await out.embedPage(src.getPage(0))
  const W = mmToPdfPoints(paper.widthMm)
  const H = mmToPdfPoints(paper.heightMm)
  const m = mmToPdfPoints(MARGIN_MM)
  const s = Math.min((W - 2 * m) / embedded.width, (H - 2 * m) / embedded.height)
  const page = out.addPage([W, H])
  page.drawPage(embedded, {
    x: (W - embedded.width * s) / 2,
    y: (H - embedded.height * s) / 2,
    xScale: s,
    yScale: s
  })
  return out
}

/**
 * Lists every layer (OCG) object in the catalog. Copied or embedded pages
 * bring their OCG dictionaries along but not the catalog entry that declares
 * them, and some viewers hide content whose layer is not declared.
 */
function declareOptionalContent(doc: PDFDocument) {
  const typeKey = PDFName.of('Type')
  const ocgType = PDFName.of('OCG')
  const refs: PDFRef[] = []
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(typeKey) === ocgType) refs.push(ref)
  }
  if (refs.length === 0) return
  const props = doc.context.obj({ OCGs: refs, D: { Order: refs, ON: refs } })
  doc.catalog.set(PDFName.of('OCProperties'), doc.context.register(props))
}

/**
 * Monochrome plot (like monochrome.ctb): lines, text and points go black,
 * solid fills keep their lightness as gray so hatched areas stay readable.
 * Returns a function that restores the original colour handling.
 */
function applyMonochrome(): () => void {
  type Ctx = { foregroundColor: number }
  type Traits = { isBackgroundFill?: boolean }
  const util = AcPdfStyleUtil as unknown as {
    contrastAgainstPaper: (packed: number, ctx: Ctx) => number
    fillStyle: (traits: Traits, ctx: Ctx) => { rgb: { r: number; g: number; b: number } }
    resolveRgb: (traits: Traits, ctx: Ctx, kind: string) => number
  }
  const original = { contrast: util.contrastAgainstPaper, fill: util.fillStyle }

  util.contrastAgainstPaper = (_packed, ctx) => ctx.foregroundColor
  util.fillStyle = function (traits, ctx) {
    const style = original.fill.call(this, traits, ctx)
    if (traits.isBackgroundFill) return style
    const packed = util.resolveRgb(traits, ctx, 'fill')
    const r = (packed >> 16) & 0xff
    const g = (packed >> 8) & 0xff
    const b = packed & 0xff
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    // Near-white fills are "foreground" on a dark CAD screen, so they print black.
    const v = gray > 235 ? 0 : gray / 255
    style.rgb = { r: v, g: v, b: v }
    return style
  }
  return () => {
    util.contrastAgainstPaper = original.contrast
    util.fillStyle = original.fill
  }
}

function createRenderer(db: AcDbDatabase, opts: PdfOptions, title: string) {
  const renderer = new AcPdfRenderer()
  renderer.insunits = db.insunits ?? 4
  renderer.ltscale = db.ltscale
  renderer.celtscale = db.celtscale
  renderer.configureExport({
    title,
    background: 'none',
    showLineWeight: opts.lineWeights,
    fontMapping: AcApSettingManager.instance.fontMapping,
    glyphProvider: createViewerPdfGlyphProvider(),
    marginMm: opts.paper === 'original' ? 0 : 5
  })
  renderer.currentBackgroundColor = 0xffffff
  renderer.changeForeground(0x000000)
  renderer.context.database = db
  return renderer
}

/** Same layering as pdf-renderer's paper-space export: viewport model content under paper geometry. */
async function collectLayoutRoots(
  db: AcDbDatabase,
  renderer: AcPdfRenderer,
  btrId: string,
  modelRoots: () => Promise<AcPdfEntity[]>
): Promise<{ roots: AcPdfEntity[]; sheet: AcPdfEntity[] }> {
  const block = db.tables.blockTable.getIdAt(btrId)
  if (!block) return { roots: [], sheet: [] }
  if (!isPaperSpaceBlock(db, block)) {
    const roots = await modelRoots()
    return { roots, sheet: roots }
  }
  const viewports: AcDbViewport[] = []
  for (const entity of block.newIterator()) {
    if (entity instanceof AcDbViewport) viewports.push(entity)
  }
  // Viewport #1 is the paper-space screen view saved with the file, often far
  // wider than the sheet; it must not decide the page frame.
  const screenViewports = new Set(
    viewports.filter(v => v.number === 1 || isDefaultPaperSpaceViewport(v)).map(v => v.objectId)
  )
  const paper = await collectBlockRoots(block, renderer)
  const contents: AcPdfEntity[] = []
  if (viewports.length > 0) {
    const model = await modelRoots()
    for (const viewport of viewports) {
      const built = buildViewportModelContent(viewport, () => model, renderer)
      if (!built) continue
      contents.push(built.content)
      if (built.border) paper.push(built.border)
    }
  }
  const sheet = paper.filter(root => !screenViewports.has(root.objectId))
  return { roots: [...contents, ...paper], sheet: sheet.length > 0 ? sheet : contents }
}

async function newPdf(title: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(title)
  doc.setProducer('도면 뷰어 (MLightCAD pdf-renderer)')
  doc.setCreator('도면 뷰어')
  return doc
}

/**
 * Renders each selected page into its own vector PDF and also merges them
 * into one combined PDF. Frame pages only paint model-space objects that
 * touch the frame, so every page file stays small.
 */
export async function exportPages(
  db: AcDbDatabase,
  baseName: string,
  pages: ExportPage[],
  opts: PdfOptions,
  onProgress: (done: number, total: number, page?: ExportPage) => void
): Promise<PdfResult> {
  const restoreColors = opts.monochrome ? applyMonochrome() : undefined
  AcPdfRenderer.prepareExport()
  try {
    const renderer = createRenderer(db, opts, baseName)
    let modelRootsPromise: Promise<AcPdfEntity[]> | undefined
    const modelRoots = () => (modelRootsPromise ??= collectModelSpaceRoots(db, renderer))
    const boxCache = new Map<AcPdfEntity, Box | undefined>()
    const boxOf = (e: AcPdfEntity) => {
      if (!boxCache.has(e)) boxCache.set(e, drawableBox(e))
      return boxCache.get(e)
    }

    const files: PdfFile[] = []
    const usedNames = new Set<string>()
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      onProgress(i, pages.length, page)
      await yieldToUi()

      let roots: AcPdfEntity[]
      let frameBox: Box | undefined
      if (page.kind === 'layout') {
        const layout = await collectLayoutRoots(db, renderer, page.btrId, modelRoots)
        roots = layout.roots
        frameBox = unionBox(layout.sheet.map(boxOf).filter((b): b is Box => !!b))
      } else if (page.kind === 'frame' && page.box) {
        const fb = page.box
        roots = (await modelRoots()).filter(root => {
          const b = boxOf(root)
          return !!b && b.maxX >= fb.minX && b.minX <= fb.maxX && b.maxY >= fb.minY && b.minY <= fb.maxY
        })
        frameBox = fb
      } else {
        roots = await modelRoots()
        frameBox = unionBox(roots.map(boxOf).filter((b): b is Box => !!b))
      }

      // Frames and paper sheets are framed exactly; model space keeps the
      // renderer's own extents (it ignores far-away stray objects).
      const fit = page.kind === 'model' ? undefined : frameBox
      const paper = paperFor(opts.paper, frameBox)
      const upscale = needsUpscale(frameBox, db.insunits ?? 4, paper)
      const title = `${baseName} ${page.name}`
      let doc = await newPdf(title)
      await renderer.renderToDocument(doc, roots, {
        ocg: new AcPdfOcgManager(doc),
        imageCache: new Map(),
        formRegistry: createPdfFormRegistry(),
        paper: upscale ? 'extents' : paper,
        fitBox: fit ? { min: { x: fit.minX, y: fit.minY }, max: { x: fit.maxX, y: fit.maxY } } : undefined
      })
      renderer.resetCollected()
      if (upscale && paper && paper !== 'extents') {
        doc = await placeOnPaper(doc, title, paper)
        declareOptionalContent(doc)
      }

      let name = safeFileName(`${baseName}_${String(i + 1).padStart(2, '0')}_${page.name}`)
      while (usedNames.has(name)) name += '_'
      usedNames.add(name)
      files.push({ name: `${name}.pdf`, bytes: await doc.save() })
    }

    onProgress(pages.length, pages.length)
    await yieldToUi()
    const merged = await newPdf(baseName)
    for (const file of files) {
      const src = await PDFDocument.load(file.bytes)
      const copied = await merged.copyPages(src, src.getPageIndices())
      copied.forEach(p => merged.addPage(p))
    }
    declareOptionalContent(merged)
    return {
      combined: { name: `${safeFileName(baseName)}_전체.pdf`, bytes: await merged.save() },
      pages: files
    }
  } finally {
    AcDbRenderingCache.instance.clear()
    restoreColors?.()
  }
}
