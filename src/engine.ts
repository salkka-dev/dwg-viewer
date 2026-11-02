import {
  AcApDocManager,
  AcApI18n,
  AcApSettingManager,
  acedClearFollowingClickSink,
  AcEdOpenMode,
  LIBREDWG_PARSER_WORKER_FILE,
  MTEXT_RENDERER_WORKER_FILE
} from '@mlightcad/cad-simple-viewer'
import {
  AcDbDatabase,
  AcDbDatabaseConverterManager,
  AcDbDxfFiler,
  AcDbFileType,
  acdbHostApplicationServices
} from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'
import { AcTrMTextRenderer } from '@mlightcad/three-renderer'

import { KO_PROMPTS } from './ko-prompts'

export interface LayoutInfo {
  name: string
  btrId: string
  tabOrder: number
  isModel: boolean
}

const appBase = new URL('./', location.href)
const assetUrl = (path: string) => new URL(path, appBase).href

/**
 * Creates the CAD viewer inside `container`.
 *
 * Everything runs in the browser: DWG parsing (LibreDWG wasm) and text layout
 * happen in web workers, fonts come from the app's own `cad-data/fonts`.
 */
export async function initEngine(container: HTMLElement): Promise<AcApDocManager> {
  const dwgParser = assetUrl(`workers/${LIBREDWG_PARSER_WORKER_FILE}`)
  const mtextRender = assetUrl(`workers/${MTEXT_RENDERER_WORKER_FILE}`)

  // View-only app: hide the engine's command line, ribbon and edit shortcuts.
  AcApSettingManager.configure({ storageKey: 'dwg-viewer.settings' })
  AcApSettingManager.instance.apply(
    {
      isShowCommandLine: false,
      isShowShortCutToolbar: false,
      isShowToolbar: false,
      isShowRibbon: false,
      isShowCoordinate: false,
      isShowEntityInfo: false,
      isShowLanguageSelector: false,
      isShowStats: false
    },
    { persist: false }
  )

  AcDbDatabaseConverterManager.instance.register(
    AcDbFileType.DWG,
    new AcDbLibreDwgConverter({
      convertByEntityType: false,
      useWorker: true,
      parserWorkerUrl: dwgParser
    })
  )

  const manager = AcApDocManager.createInstance({
    container,
    autoResize: true,
    baseUrl: assetUrl('cad-data/'),
    webworkerFileUrls: { dwgParser, mtextRender },
    notificationCenter: false,
    builtinOpenFileDialog: false
  })
  if (!manager) throw new Error('뷰어를 시작하지 못했습니다')

  // Korean drawings: fall back to Noto Sans KR (aliases 맑은 고딕, 굴림, 돋움...)
  // and the whgtxt/whgdtxt Hangul big fonts instead of the Chinese default chain.
  await AcTrMTextRenderer.getInstance().setDefaultFonts('korean')
  AcApI18n.mergeLocaleMessage('en', KO_PROMPTS)
  keepButtonTapsAfterTouchPicks()
  return manager
}

/**
 * After each touch pick the engine eats the next click for one second, meant
 * for the ghost click a touch can leave on the canvas. The canvas blocks that
 * ghost click anyway, so the eaten click is the user's next button tap (✓,
 * a tool, 저장). Disarm the trap when the tap lands on a control; a ghost
 * click hits the drawing surface, never a button. Registered at startup, so
 * this capture listener runs before the engine adds its own, and removing it
 * there keeps it from firing for this click.
 */
function keepButtonTapsAfterTouchPicks() {
  window.addEventListener(
    'click',
    e => {
      const target = e.target
      if (target instanceof Element && target.closest('button, [role="button"], input, textarea, select, label')) {
        acedClearFollowingClickSink()
      }
    },
    true
  )
}

export async function openDrawing(fileName: string, content: ArrayBuffer): Promise<boolean> {
  return AcApDocManager.instance.openDocument(fileName, content, {
    mode: AcEdOpenMode.Review,
    progressiveRendering: true
  })
}

export function currentDatabase(): AcDbDatabase | undefined {
  return AcApDocManager.tryGetInstance()?.curDocument?.database
}

export function listLayouts(db: AcDbDatabase): LayoutInfo[] {
  const modelId = db.tables.blockTable.modelSpace.objectId
  const seen = new Set<string>()
  const layouts: LayoutInfo[] = []
  for (const layout of db.objects.layout.newIterator()) {
    const btrId = layout.blockTableRecordId
    if (!btrId || seen.has(btrId)) continue
    seen.add(btrId)
    layouts.push({
      name: layout.layoutName,
      btrId,
      tabOrder: layout.tabOrder,
      isModel: btrId === modelId
    })
  }
  layouts.sort((a, b) => a.tabOrder - b.tabOrder)
  return layouts
}

/**
 * Switches the layout tab. The engine frames a layout's first visit around its
 * viewports only, which cuts off title blocks drawn on the sheet around them,
 * so its own first zoom is skipped and the caller frames the whole sheet.
 */
export function switchLayout(btrId: string) {
  AcApDocManager.instance.curView.markLayoutAsInitialized(btrId)
  acdbHostApplicationServices().layoutManager.setCurrentLayoutBtrId(btrId)
}

/** Frames everything on the current layout once its entities finish loading. */
export function zoomExtents() {
  AcApDocManager.instance.curView.zoomToFitDrawing()
}

/** Runs `fn` once the current layout has no entities left to convert. */
export function whenViewIdle(fn: () => void) {
  const view = AcApDocManager.instance.curView
  const tick = () => (view.isProcessingEntities ? setTimeout(tick, 100) : fn())
  tick()
}

/* ---------- editing ---------- */

/**
 * Switches the open drawing between view-only (Review) and editable (Write).
 * The engine fixes the mode at open time, but command lookup and grips read
 * the field live, so flipping it keeps the current view, layout and zoom.
 */
export function setEditable(on: boolean) {
  const mgr = AcApDocManager.instance
  const doc = mgr.curDocument as unknown as { _openMode: AcEdOpenMode }
  doc._openMode = on ? AcEdOpenMode.Write : AcEdOpenMode.Review
  if (!on) {
    void mgr.commandManager.cancelActive()
    mgr.curView.selectionSet.clear()
  }
}

/** Starts an engine command (LINE, MOVE, ...), cancelling the one in progress. */
export async function runCommand(name: string) {
  const mgr = AcApDocManager.instance
  if (mgr.commandManager.activeCommand) await mgr.commandManager.cancelActive()
  mgr.sendStringToExecute(name)
}

export function cancelCommand() {
  void AcApDocManager.instance.commandManager.cancelActive()
}

export const isCommandRunning = () => !!AcApDocManager.instance.commandManager.activeCommand
export const selectionCount = () => AcApDocManager.instance.curView.selectionSet.count

/** The engine's AutoCAD-style command line, where L, C, M, CO... are typed. */
export function setCommandLineVisible(on: boolean) {
  AcApSettingManager.instance.apply({ isShowCommandLine: on }, { persist: false })
  document.body.classList.toggle('cli-on', on)
}

export function undoState() {
  const tm = currentDatabase()?.transactionManager
  return { undo: !!tm?.canUndo(), redo: !!tm?.canRedo() }
}

export function currentLayer() {
  return currentDatabase()?.clayer ?? '0'
}

export function setCurrentLayer(name: string) {
  const db = currentDatabase()
  if (db) db.clayer = name
}

type TypedValue = { code: number | string; value: unknown }

/**
 * The engine's DXF writer expands point values only for XData codes 1010-1013.
 * XRECORDs from AutoCAD 2008+ tables keep points under codes 10-18, which came
 * out as "[object Object]" and made the whole DXF unreadable. Split them into
 * the x / y / z groups DXF expects.
 */
function patchDxfPointGroups() {
  const proto = AcDbDxfFiler.prototype as unknown as {
    writeTypedValues(this: AcDbDxfFiler, data?: Iterable<TypedValue> | null): AcDbDxfFiler
  }
  const write = proto.writeTypedValues
  proto.writeTypedValues = function (data) {
    if (!data) return write.call(this, data)
    const items: TypedValue[] = []
    for (const item of data) {
      const code = Number(item.code)
      const v = item.value as { x?: unknown; y?: unknown; z?: unknown } | null
      const pointCode = (code >= 10 && code <= 18) || (code >= 110 && code <= 112)
      if (pointCode && v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
        items.push({ code, value: v.x }, { code: code + 10, value: v.y }, { code: code + 20, value: v.z ?? 0 })
      } else {
        items.push(item)
      }
    }
    return write.call(this, items)
  }
}
patchDxfPointGroups()

/**
 * DXF files from other programs can number their dictionaries differently from
 * AutoCAD, and the engine's reader then files objects such as the "Standard"
 * multiline style under the layout dictionary. Written back out, they become
 * LAYOUT objects that reuse another object's handle. Drop those strays.
 */
function dropStrayLayouts(db: AcDbDatabase) {
  const layouts = db.objects.layout
  for (const [key, obj] of [...layouts.entries()]) {
    if (!('layoutName' in obj)) layouts.remove(key)
  }
}

/** Problems that would stop AutoCAD from reading the file; empty when it looks sound. */
function dxfProblems(text: string): string[] {
  const problems: string[] = []
  if (text.includes('[object Object]')) problems.push('값이 빠진 좌표')
  const handles = new Set<string>()
  const lines = text.split(/\r?\n/)
  let entityStart = false
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim()
    if (code === '0') {
      entityStart = true
      continue
    }
    if (code === '5' && entityStart) {
      const h = lines[i + 1].trim().toUpperCase()
      if (handles.has(h)) {
        problems.push(`겹치는 핸들 ${h}`)
        break
      }
      handles.add(h)
    }
    entityStart = false
  }
  return problems
}

/**
 * Writes the drawing as DXF 2018. From 2007 on DXF text is UTF-8, so Hangul
 * stays readable in AutoCAD whatever code page the original DWG used.
 */
export function drawingToDxf(): { blob: Blob; problems: string[] } {
  const db = currentDatabase()
  if (!db) throw new Error('열린 도면이 없습니다')
  dropStrayLayouts(db)
  const out = db.dxfOut(undefined, 16, 'AC1032')
  const text = typeof out === 'string' ? out : new TextDecoder().decode(out)
  return { blob: new Blob([text], { type: 'application/dxf' }), problems: dxfProblems(text) }
}
