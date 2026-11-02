import {
  AcApDocManager,
  AcApSettingManager,
  AcEdOpenMode,
  LIBREDWG_PARSER_WORKER_FILE,
  MTEXT_RENDERER_WORKER_FILE
} from '@mlightcad/cad-simple-viewer'
import {
  AcDbDatabase,
  AcDbDatabaseConverterManager,
  AcDbFileType,
  acdbHostApplicationServices
} from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'
import { AcTrMTextRenderer } from '@mlightcad/three-renderer'

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
  return manager
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

export function switchLayout(btrId: string) {
  acdbHostApplicationServices().layoutManager.setCurrentLayoutBtrId(btrId)
}

export function zoomExtents() {
  AcApDocManager.instance.curView.zoomToFitDrawing()
}
