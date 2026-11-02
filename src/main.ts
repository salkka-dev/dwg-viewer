import './style.css'

import { AcApDocManager, type AcApLayerInfo } from '@mlightcad/cad-simple-viewer'
import { AcGeBox2d, AcGePoint2d } from '@mlightcad/data-model'
import { registerSW } from 'virtual:pwa-register'

import { DriveAuthError, driveConfigured, saveFile, signedIn, signIn, takeSignInResult } from './drive'
import { closeDriveSheet, initDriveUi, openDriveSheet } from './drive-ui'
import {
  canUseFileHandles,
  ensureWritable,
  onLaunchFiles,
  pickDrawingHandle,
  pickSaveHandle,
  writeFile
} from './files'
import { enterEdit, hasUnsavedEdits, initEdit, isEditing, leaveEdit, resetEdit, saveEdits, start, type Tool } from './edit'
import {
  currentDatabase,
  initEngine,
  listLayouts,
  openDrawing,
  switchLayout,
  whenViewIdle,
  zoomExtents
} from './engine'
import { collectPages, type ExportPage, layoutHasContent } from './pages'
import type { PaperChoice, PdfFile, PdfResult } from './pdf'
import {
  type DocSource,
  listRecent,
  rememberFile,
  removeRecent,
  type RecentFile,
  stashPendingSave,
  takePendingSave,
  touchRecent
} from './recent'
import {
  $,
  ask,
  asBlobPart,
  closeIcon,
  closeMenu,
  menuOpenFor,
  openMenu,
  el,
  formatDate,
  formatSize,
  readPref,
  setBusy,
  shareOrDownload,
  toast,
  writePref
} from './ui'
import { safeFileName } from './util'

// Read the Google sign-in return before anything rewrites the URL.
const signInResult = takeSignInResult()

const app = $('app')
const fileInput = $<HTMLInputElement>('file-input')

const state = {
  ready: false,
  busy: false,
  docName: '',
  docSerial: 0,
  pages: [] as ExportPage[],
  pagesFor: -1,
  paper: 'A3' as PaperChoice,
  mono: true,
  result: undefined as PdfResult | undefined,
  darkBackground: true,
  layerFilter: '',
  // The drawing as it was opened, for "저장하지 않고 끝내기" and Drive saves.
  blob: undefined as Blob | undefined,
  fileName: '',
  source: { kind: 'device' } as DocSource,
  // PC only: the opened file on disk, and where 저장 writes without asking again.
  handle: undefined as FileSystemFileHandle | undefined,
  saveHandle: undefined as FileSystemFileHandle | undefined
}

const DARK_BG = 0x0e1016
const LIGHT_BG = 0xffffff

// Set right before leaving for Google sign-in with the edits already stashed.
let leavingForSignIn = false
// True from the start of an open until the engine has finished drawing it.
let opening = false

/* ---------- opening files ---------- */

interface OpenOptions {
  recent?: RecentFile
  source?: DocSource
  /** PC: the file on disk, so saving can start in its folder. */
  handle?: FileSystemFileHandle
  /** The caller already dealt with unsaved edits. */
  force?: boolean
}

/** Asks before unsaved edits would be lost. Resolves true when it is fine to go on. */
async function confirmDropEdits(action: string): Promise<boolean> {
  if (!hasUnsavedEdits()) return true
  const choice = await ask('저장하지 않은 수정이 있어요', `${action} 고친 내용이 사라져요. 먼저 DXF로 저장할까요?`, [
    { value: 'save', label: '저장하고 계속', strong: true },
    { value: 'discard', label: '저장하지 않고 계속' },
    { value: 'stay', label: '취소' }
  ])
  if (choice === 'save') return saveEdits()
  return choice === 'discard'
}

/** Checks the file header: DWG starts with "AC10", DXF is text with a SECTION header (or binary DXF). */
function sniffKind(buffer: ArrayBuffer, name: string): 'dwg' | 'dxf' | null {
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048)))
  if (head.startsWith('AC10') || head.startsWith('AC1.') || head.startsWith('AC2')) return 'dwg'
  if (head.startsWith('AutoCAD Binary DXF')) return 'dxf'
  if (/^\s*0\s*\r?\n\s*SECTION/i.test(head) || /\bSECTION\b[\s\S]*\bHEADER\b/i.test(head)) return 'dxf'
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'dwg' || ext === 'dxf' ? ext : null
}

async function openBlob(blob: Blob, name: string, opts: OpenOptions = {}) {
  if (!state.ready || state.busy) return
  if (!opts.force && !(await confirmDropEdits('다른 도면을 열면'))) return
  state.busy = true
  opening = true
  setBusy(`${name} 여는 중`)
  try {
    const buffer = await blob.arrayBuffer()
    const kind = sniffKind(buffer, name)
    if (!kind) {
      toast('DWG나 DXF 파일만 열 수 있어요', true)
      return
    }
    const fileName = name.toLowerCase().endsWith(`.${kind}`) ? name : `${name}.${kind}`
    closePanels()
    resetEdit()
    const started = performance.now()
    const ok = await openDrawing(fileName, buffer)
    console.info(`[dwg-viewer] open ${fileName}: ${ok ? 'ok' : 'failed'} in ${Math.round(performance.now() - started)}ms`)
    if (!ok) {
      toast('파일을 열지 못했어요. 손상된 파일이거나 아직 지원하지 않는 형식일 수 있어요', true)
      return
    }
    state.docName = fileName.replace(/\.(dwg|dxf)$/i, '')
    state.docSerial++
    state.result = undefined
    state.blob = blob
    state.fileName = fileName
    state.source = opts.source ?? opts.recent?.source ?? { kind: 'device' }
    state.handle = opts.handle
    // Reopening an edited copy (…_수정.dxf) keeps saving into that same file.
    state.saveHandle = opts.handle && /_수정\.dxf$/i.test(fileName) ? opts.handle : undefined
    app.classList.remove('no-doc')
    $('doc-title').textContent = state.docName
    document.title = `${state.docName} - 도면 뷰어`
    applyBackground()
    watchLayers()
    resetFitState()
    renderLayouts()
    if (opts.recent) void touchRecent(opts.recent)
    else void rememberFile(fileName, blob, state.source)
  } catch (err) {
    console.error(err)
    toast('파일을 여는 중 문제가 생겼어요', true)
  } finally {
    state.busy = false
    setBusy(null)
    settleAfterOpen()
  }
}

/**
 * The engine keeps drawing a big DWG in batches after `openDrawing` returns,
 * and framing the view in the middle of that stops the remaining batches.
 * Wait until it is idle, then frame once for the final stage size (the
 * layout tabs appear right after opening and make the stage shorter).
 */
function settleAfterOpen() {
  const serial = state.docSerial
  let quiet = 0
  const check = () => {
    if (serial !== state.docSerial || state.busy) return
    quiet = AcApDocManager.instance.curView.isProcessingEntities ? 0 : quiet + 1
    if (quiet < 3) {
      setTimeout(check, 150)
      return
    }
    opening = false
    if (currentDatabase()) fitView()
  }
  setTimeout(check, 150)
}

function pickFile() {
  if (!state.ready) return
  $('open-sheet').hidden = true
  if (canUseFileHandles()) {
    // PC: the native dialog also gives a handle, so edits can be saved next to the file.
    pickDrawingHandle()
      .then(async handle => {
        if (handle) await openBlob(await handle.getFile(), handle.name, { handle })
      })
      .catch(err => {
        console.error(err)
        toast('파일을 열지 못했어요', true)
      })
    return
  }
  fileInput.value = ''
  fileInput.click()
}

/** 열기: straight to the Files picker, or a choice when Google Drive is set up. */
function openFileMenu() {
  if (!state.ready) return
  if (driveConfigured()) $('open-sheet').hidden = false
  else pickFile()
}

async function browseDrive() {
  $('open-sheet').hidden = true
  if (!state.ready || !(await confirmDropEdits('드라이브에서 다른 도면을 열면'))) return
  openDriveSheet()
}

/* ---------- saving edits ---------- */

/**
 * PC: the first 저장 opens the save dialog in the original's folder; later
 * saves (and Ctrl+S) write to that file without asking. Runs before the DXF is
 * built because the dialog needs the click or key press that started it.
 */
async function prepareSave(fileName: string): Promise<boolean> {
  if (state.source.kind !== 'device' || !canUseFileHandles()) return true
  try {
    if (state.saveHandle) return await ensureWritable(state.saveHandle)
    const handle = await pickSaveHandle(fileName, state.handle)
    if (!handle) return false
    state.saveHandle = handle
    return true
  } catch (err) {
    console.error(err)
    state.saveHandle = undefined
    toast('저장 위치를 열지 못했어요', true)
    return false
  }
}

async function saveEdited(blob: Blob, fileName: string): Promise<boolean> {
  const source = state.source
  if (source.kind === 'drive') return saveEditedToDrive(blob, fileName, source)
  if (state.saveHandle) {
    try {
      await writeFile(state.saveHandle, blob)
      toast(`${state.saveHandle.name} 파일에 저장했어요`)
      return true
    } catch (err) {
      console.error(err)
      state.saveHandle = undefined
      toast('파일에 쓰지 못했어요. 저장을 다시 눌러 다른 위치를 골라 주세요', true)
      return false
    }
  }
  return shareOrDownload([new File([blob], fileName, { type: 'application/dxf' })])
}

async function saveEditedToDrive(
  blob: Blob,
  fileName: string,
  source: Extract<DocSource, { kind: 'drive' }>
): Promise<boolean> {
  const goSignIn = async () => {
    // Google sign-in reloads the app; keep the edits on this device until it is back.
    await stashPendingSave({ name: fileName, blob, parentId: source.parentId, folderName: source.folderName })
    leavingForSignIn = true
    signIn({ action: 'save' })
    return false
  }
  if (!signedIn()) return goSignIn()
  setBusy('구글 드라이브에 저장 중')
  try {
    const { item, inMyDrive } = await saveFile(fileName, source.parentId, blob)
    const folderName = inMyDrive ? '내 드라이브' : source.folderName
    state.source = { kind: 'drive', fileId: item.id, parentId: inMyDrive ? 'root' : source.parentId, name: item.name, folderName }
    toast(
      inMyDrive
        ? `원래 폴더에 쓸 권한이 없어서 내 드라이브에 ${item.name} 파일로 저장했어요`
        : `구글 드라이브 '${folderName}' 폴더에 ${item.name} 파일로 저장했어요`
    )
    return true
  } catch (err) {
    if (err instanceof DriveAuthError) return goSignIn()
    console.error(err)
    toast('드라이브에 저장하지 못했어요. 인터넷 연결을 확인해 주세요', true)
    return false
  } finally {
    setBusy(null)
  }
}

/** After the sign-in round trip: upload the stashed edits, then reopen them. */
async function resumePendingSave() {
  const pending = await takePendingSave()
  if (!pending) return
  setBusy('구글 드라이브에 저장 중')
  try {
    const { item, inMyDrive } = await saveFile(pending.name, pending.parentId, pending.blob)
    const folderName = inMyDrive ? '내 드라이브' : pending.folderName
    setBusy(null)
    await openBlob(pending.blob, item.name, {
      force: true,
      source: { kind: 'drive', fileId: item.id, parentId: inMyDrive ? 'root' : pending.parentId, name: item.name, folderName }
    })
    toast(`구글 드라이브 '${folderName}' 폴더에 ${item.name} 파일로 저장했어요`)
  } catch (err) {
    console.error(err)
    setBusy(null)
    // Keep the work: reopen it so 편집 > 저장 can try again.
    await openBlob(pending.blob, pending.name, {
      force: true,
      source: { kind: 'drive', fileId: '', parentId: pending.parentId, name: pending.name, folderName: pending.folderName }
    })
    toast('드라이브에 저장하지 못했어요. 편집을 누르고 저장을 다시 눌러 주세요', true)
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void openBlob(file, file.name)
})

/* ---------- recent files ---------- */

async function renderRecent() {
  const files = await listRecent()
  const list = $('recent-list')
  list.replaceChildren()
  $('recent-wrap').hidden = files.length === 0
  for (const f of files) {
    const open = el('button', { className: 'recent-open', type: 'button' }, [
      el('span', { className: 'recent-name', textContent: f.name }),
      el('span', { className: 'recent-meta', textContent: `${formatSize(f.size)} · ${formatDate(f.openedAt)}` })
    ])
    open.addEventListener('click', () => void openBlob(f.blob, f.name, { recent: f }))
    const del = el('button', { className: 'recent-del', type: 'button', title: '목록에서 지우기' })
    del.setAttribute('aria-label', `${f.name} 목록에서 지우기`)
    del.append(closeIcon())
    del.addEventListener('click', async () => {
      await removeRecent(f.id)
      void renderRecent()
    })
    list.append(el('li', {}, [open, del]))
  }
}

/* ---------- layouts ---------- */

function renderLayouts() {
  const db = currentDatabase()
  const bar = $('layout-bar')
  bar.replaceChildren()
  if (!db) {
    bar.hidden = true
    return
  }
  // Untouched "Layout1"-style tabs are blank pages; leave them out.
  const layouts = listLayouts(db).filter(
    l => l.isModel || l.btrId === db.currentSpaceId || layoutHasContent(db, l.btrId)
  )
  bar.hidden = layouts.length < 2
  for (const layout of layouts) {
    const chip = el('button', {
      className: `layout-chip${db.currentSpaceId === layout.btrId ? ' active' : ''}`,
      type: 'button',
      textContent: layout.isModel ? '모형' : layout.name,
      title: layout.name
    })
    chip.addEventListener('click', () => showLayout(layout.btrId))
    bar.append(chip)
  }
}

/** Switches tabs; a layout seen for the first time is framed as a whole sheet. */
function showLayout(btrId: string, fit = true) {
  const db = currentDatabase()
  if (!db) return
  const firstVisit = !visited.has(btrId)
  visited.add(btrId)
  if (db.currentSpaceId !== btrId) switchLayout(btrId)
  renderLayouts()
  if (!fit) return
  if (firstVisit) fitView()
  else refitIfStale()
}

/* ---------- view fitting ---------- */

// Tabs whose camera still shows the whole drawing, with the stage size it was
// framed for ('' = framed by the engine at open). Rotating the iPad or resizing
// a Split View re-frames them; after a pinch or pan the user's zoom is kept.
const fitted = new Map<string, string>()
const visited = new Set<string>()

const stageSize = () => {
  const host = $('cad-host')
  return `${host.clientWidth}x${host.clientHeight}`
}

function resetFitState() {
  fitted.clear()
  visited.clear()
  const id = currentDatabase()?.currentSpaceId
  if (id) visited.add(id)
}

function fitView() {
  zoomExtents()
  const id = currentDatabase()?.currentSpaceId
  if (id) fitted.set(id, stageSize())
}

function refitIfStale() {
  if (opening) return
  const id = currentDatabase()?.currentSpaceId
  const size = id ? fitted.get(id) : undefined
  if (size !== undefined && size !== stageSize()) fitView()
}

function watchViewSize() {
  const host = $('cad-host')
  const userMoved = () => {
    const id = currentDatabase()?.currentSpaceId
    if (id) fitted.delete(id)
  }
  let start: { x: number; y: number } | null = null
  host.addEventListener('pointerdown', e => (start = { x: e.clientX, y: e.clientY }), { capture: true })
  host.addEventListener(
    'pointermove',
    e => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) userMoved()
    },
    { capture: true }
  )
  for (const type of ['pointerup', 'pointercancel']) {
    host.addEventListener(type, () => (start = null), { capture: true })
  }
  host.addEventListener('wheel', userMoved, { capture: true, passive: true })

  // The engine resizes its canvas first; re-frame once the size settles.
  let timer = 0
  new ResizeObserver(() => {
    clearTimeout(timer)
    timer = window.setTimeout(refitIfStale, 150)
  }).observe(host)
}

/* ---------- background ---------- */

function applyBackground() {
  const mgr = AcApDocManager.tryGetInstance()
  if (!mgr) return
  mgr.curView.backgroundColor = state.darkBackground ? DARK_BG : LIGHT_BG
  $('btn-bg').classList.toggle('on', !state.darkBackground)
}

/* ---------- layers ---------- */

let unwatchLayers: (() => void) | undefined

function watchLayers() {
  unwatchLayers?.()
  const store = AcApDocManager.instance.curDocument.layerStore
  const listener = () => {
    if (!$('layer-panel').hidden) renderLayers()
  }
  store.events.changed.addEventListener(listener)
  unwatchLayers = () => store.events.changed.removeEventListener(listener)
}

function renderLayers() {
  const store = AcApDocManager.instance.curDocument.layerStore
  const layers = store.getLayers().slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const filter = state.layerFilter.trim().toLowerCase()
  const shown = filter ? layers.filter(l => l.name.toLowerCase().includes(filter)) : layers
  const visible = layers.filter(l => l.isOn && !l.isFrozen).length
  $('layer-count').textContent = `${visible}/${layers.length}`
  const list = $('layer-list')
  list.replaceChildren()
  for (const layer of shown) list.append(layerRow(layer))
}

function layerRow(layer: AcApLayerInfo) {
  const visible = layer.isOn && !layer.isFrozen
  const row = el('button', { className: `layer-row${visible ? ' on' : ' off'}`, type: 'button' })
  const swatch = el('span', { className: 'layer-swatch' })
  swatch.style.background = layer.cssColor
  row.append(swatch, el('span', { className: 'layer-name', textContent: layer.name }))
  if (layer.isFrozen) row.append(el('span', { className: 'frozen-tag', textContent: '동결' }))
  row.append(el('span', { className: 'switch' }))
  row.setAttribute('role', 'switch')
  row.setAttribute('aria-checked', String(visible))
  row.addEventListener('click', () => {
    const store = AcApDocManager.instance.curDocument.layerStore
    if (layer.isFrozen) store.setLayerFrozen(layer.name, false)
    if (!layer.isOn || layer.isFrozen) store.setLayerOn(layer.name, true)
    else store.setLayerOn(layer.name, false)
    renderLayers()
  })
  return row
}

function toggleLayerPanel(force?: boolean) {
  const panel = $('layer-panel')
  const show = force ?? panel.hidden
  panel.hidden = !show
  $('btn-layers').classList.toggle('on', show)
  if (show) renderLayers()
}

/* ---------- PDF ---------- */

function kindLabel(page: ExportPage) {
  return page.kind === 'layout' ? '배치' : page.kind === 'frame' ? '도곽' : '모형'
}

function openPdfSheet() {
  const db = currentDatabase()
  if (!db || !state.docName || state.busy) return
  if (state.pagesFor !== state.docSerial) {
    state.pages = collectPages(db)
    state.pagesFor = state.docSerial
    state.result = undefined
  }
  const layouts = state.pages.filter(p => p.kind === 'layout').length
  const frames = state.pages.filter(p => p.kind === 'frame').length
  const summary =
    layouts > 0
      ? `배치(시트) ${layouts}장을 찾았어요. 선택한 페이지마다 PDF가 한 장씩 만들어져요.`
      : frames > 0
        ? `모형 공간에서 도곽 ${frames}개를 찾았어요. 도곽마다 PDF가 한 장씩 만들어져요.`
        : '따로 나뉜 배치나 도곽이 없어서 도면 전체를 한 장으로 만들어요.'
  $('pdf-summary').textContent = summary
  renderPageList()
  renderOptions()
  renderResults()
  $('pdf-progress').hidden = true
  $('pdf-sheet').hidden = false
  toggleLayerPanel(false)
}

function closePdfSheet() {
  if (state.busy) return
  $('pdf-sheet').hidden = true
}

function renderPageList() {
  const list = $('page-list')
  list.replaceChildren()
  for (const page of state.pages) {
    const box = el('input', { type: 'checkbox', checked: page.selected })
    box.addEventListener('change', () => {
      page.selected = box.checked
      updateSelectionCount()
    })
    const label = el('label', { className: 'page-check' }, [
      box,
      el('span', { className: 'page-name', textContent: page.name, title: page.name }),
      el('span', { className: `kind kind-${page.kind}`, textContent: kindLabel(page) })
    ])
    const peek = el('button', { className: 'peek-btn', type: 'button', textContent: '보기' })
    peek.addEventListener('click', () => peekPage(page))
    list.append(el('li', { className: 'page-row' }, [label, peek]))
  }
  updateSelectionCount()
}

function updateSelectionCount() {
  const n = state.pages.filter(p => p.selected).length
  $('sel-count').textContent = `${state.pages.length}개 중 ${n}개 선택`
  $<HTMLButtonElement>('pdf-run').disabled = n === 0 || state.busy
}

function peekPage(page: ExportPage) {
  if (!currentDatabase()) return
  $('pdf-sheet').hidden = true
  showLayout(page.btrId, false)
  const frame = page.box
  if (frame) {
    const box = new AcGeBox2d(new AcGePoint2d(frame.minX, frame.minY), new AcGePoint2d(frame.maxX, frame.maxY))
    whenViewIdle(() => {
      AcApDocManager.instance.curView.zoomTo(box, 1.05)
      fitted.delete(page.btrId)
    })
  } else {
    fitView()
  }
  toast('PDF 버튼을 누르면 변환 창으로 돌아가요')
}

function renderOptions() {
  for (const btn of $('opt-paper').querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', btn.dataset.v === state.paper)
    btn.setAttribute('aria-checked', String(btn.dataset.v === state.paper))
  }
  for (const btn of $('opt-color').querySelectorAll<HTMLButtonElement>('button')) {
    const active = (btn.dataset.v === 'mono') === state.mono
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-checked', String(active))
  }
}

async function runExport() {
  const db = currentDatabase()
  const selected = state.pages.filter(p => p.selected)
  if (!db || selected.length === 0 || state.busy) return
  state.busy = true
  state.result = undefined
  renderResults()
  const runBtn = $<HTMLButtonElement>('pdf-run')
  runBtn.disabled = true
  runBtn.textContent = '만드는 중'
  $('pdf-progress').hidden = false
  const bar = $('pdf-bar')
  const text = $('pdf-progress-text')
  const started = performance.now()
  try {
    // PDF engine (pdf-lib + renderer) loads only when first needed.
    const { exportPages } = await import('./pdf')
    state.result = await exportPages(
      db,
      state.docName,
      selected,
      {
        paper: state.paper,
        monochrome: state.mono,
        lineWeights: $<HTMLInputElement>('opt-lw').checked
      },
      (done, total, page) => {
        bar.style.width = `${Math.round((done / total) * 100)}%`
        text.textContent = page ? `${done + 1}/${total} ${page.name}` : '합치는 중'
      }
    )
    const secs = ((performance.now() - started) / 1000).toFixed(1)
    text.textContent = `완료 (${secs}초)`
    bar.style.width = '100%'
    renderResults()
  } catch (err) {
    console.error(err)
    $('pdf-progress').hidden = true
    toast('PDF를 만들지 못했어요. 페이지 수를 줄여서 다시 해 보세요', true)
  } finally {
    state.busy = false
    runBtn.textContent = state.result ? '다시 만들기' : 'PDF 만들기'
    updateSelectionCount()
  }
}

function renderResults() {
  const wrap = $('pdf-results')
  wrap.replaceChildren()
  const result = state.result
  wrap.hidden = !result
  if (!result) return

  const row = (file: PdfFile) => {
    const save = el('button', { className: 'save-btn', type: 'button', textContent: '저장' })
    save.addEventListener('click', () => void saveFiles([file]))
    return el('li', { className: 'result-row' }, [
      el('span', { className: 'result-name', textContent: file.name, title: file.name }),
      el('span', { className: 'result-size', textContent: formatSize(file.bytes.byteLength) }),
      save
    ])
  }

  if (result.pages.length > 1) {
    const all = el('button', { className: 'save-btn strong', type: 'button', textContent: '모두 저장' })
    all.addEventListener('click', () => void saveFiles(result.pages, `${safeFileName(state.docName)}_낱장.zip`))
    wrap.append(
      el('div', { className: 'result-group' }, [
        el('div', { className: 'result-head' }, [el('b', { textContent: `낱장 PDF ${result.pages.length}개` }), all]),
        el('ul', { className: 'result-list' }, result.pages.map(row))
      ]),
      el('div', { className: 'result-group' }, [
        el('div', { className: 'result-head' }, [el('b', { textContent: '한 파일로 합친 PDF' })]),
        el('ul', { className: 'result-list' }, [row(result.combined)])
      ])
    )
  } else {
    wrap.append(
      el('div', { className: 'result-group' }, [
        el('div', { className: 'result-head' }, [el('b', { textContent: 'PDF 1개' })]),
        el('ul', { className: 'result-list' }, result.pages.map(row))
      ])
    )
  }
}

async function saveFiles(files: PdfFile[], zipName?: string) {
  const asFiles = files.map(f => new File([asBlobPart(f.bytes)], f.name, { type: 'application/pdf' }))
  await shareOrDownload(asFiles, zipName ?? 'pdf.zip')
}

/* ---------- panels + wiring ---------- */

function closePanels() {
  toggleLayerPanel(false)
  $('pdf-sheet').hidden = true
  $('open-sheet').hidden = true
  closeDriveSheet()
}

// Measuring works while only viewing too; the marks stay on screen, not in the file.
const MEASURE_TOOLS: Tool[] = [
  { cmd: 'measuredistance', label: '거리', icon: '<path d="M4 18 20 6"/><path d="M4 14v8M20 2v8"/>' },
  { cmd: 'measurecontinuous', label: '이어서 재기', icon: '<path d="M3 18l6-8 5 5 7-9"/>' },
  { cmd: 'measurearea', label: '면적', icon: '<path d="M4 18 8 5l12 4-3 11z"/><path d="M8 12h6M9 15h6" opacity=".6"/>' },
  { cmd: 'measureangle', label: '각도', icon: '<path d="M4 20h16M4 20 16 6"/><path d="M11 20a7 7 0 0 0-2-4.8"/>' },
  { cmd: 'measurearc', label: '호 길이', icon: '<path d="M4 18a8 8 0 0 1 16 0"/>' },
  { cmd: 'measurepoint', label: '좌표', icon: '<path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>' },
  { cmd: 'clearmeasurements', label: '재기 표시 모두 지우기', icon: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13M9 7V4h6v3"/>' }
]

function openMeasureMenu() {
  const btn = $('btn-measure')
  if (menuOpenFor(btn)) {
    closeMenu()
    return
  }
  if (!currentDatabase() || state.busy) return
  openMenu(
    btn,
    MEASURE_TOOLS.map(t => ({ label: t.label, icon: t.icon, run: () => start(t.cmd) })),
    '재기 표시는 화면에만 남고 파일에는 저장되지 않아요.'
  )
}

async function toggleEdit() {
  if (!currentDatabase() || state.busy) return
  if (isEditing()) {
    await leaveEdit()
    return
  }
  closePanels()
  enterEdit()
}

function bindUi() {
  $('btn-open').addEventListener('click', openFileMenu)
  $('btn-open-home').addEventListener('click', pickFile)
  $('btn-drive-home').addEventListener('click', () => void browseDrive())
  $('open-device').addEventListener('click', pickFile)
  $('open-drive').addEventListener('click', () => void browseDrive())
  $('open-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) $('open-sheet').hidden = true
  })
  $('btn-edit').addEventListener('click', () => void toggleEdit())
  $('btn-measure').addEventListener('click', openMeasureMenu)
  $('btn-fit').addEventListener('click', fitView)
  $('btn-layers').addEventListener('click', () => toggleLayerPanel())
  $('layer-close').addEventListener('click', () => toggleLayerPanel(false))
  $('btn-bg').addEventListener('click', () => {
    state.darkBackground = !state.darkBackground
    writePref('bg', state.darkBackground ? 'dark' : 'light')
    applyBackground()
  })
  $('btn-pdf').addEventListener('click', openPdfSheet)
  $('pdf-close').addEventListener('click', closePdfSheet)
  $('pdf-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePdfSheet()
  })
  $('pdf-run').addEventListener('click', () => void runExport())
  $('sel-all').addEventListener('click', () => {
    state.pages.forEach(p => (p.selected = true))
    renderPageList()
  })
  $('sel-none').addEventListener('click', () => {
    state.pages.forEach(p => (p.selected = false))
    renderPageList()
  })
  $('opt-paper').addEventListener('click', e => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v as PaperChoice | undefined
    if (v) {
      state.paper = v
      writePref('paper', v)
      renderOptions()
    }
  })
  $('opt-color').addEventListener('click', e => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v
    if (v) {
      state.mono = v === 'mono'
      writePref('color', v)
      renderOptions()
    }
  })
  $<HTMLInputElement>('layer-search').addEventListener('input', e => {
    state.layerFilter = (e.target as HTMLInputElement).value
    renderLayers()
  })
  $('layer-all-on').addEventListener('click', () => {
    const store = AcApDocManager.instance.curDocument.layerStore
    for (const layer of store.getLayers()) {
      if (layer.isFrozen) store.setLayerFrozen(layer.name, false)
    }
    store.setAllLayersOn()
    renderLayers()
  })

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      pickFile()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      // Never the browser's "save page" dialog.
      e.preventDefault()
      if (isEditing()) void saveEdits()
      else if (currentDatabase()) toast('편집을 켠 다음 저장할 수 있어요')
    } else if (e.key === 'Escape') {
      closePdfSheet()
      toggleLayerPanel(false)
      $('open-sheet').hidden = true
      closeDriveSheet()
    }
  })

  // Desktop browsers can still warn before a tab with unsaved edits closes.
  window.addEventListener('beforeunload', e => {
    if (hasUnsavedEdits() && !leavingForSignIn) e.preventDefault()
  })

  // Stop Safari from zooming the whole page; pinch belongs to the drawing.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault(), { passive: false })
  }

  // Drag and drop (desktop / iPad Split View).
  let dragDepth = 0
  window.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types.includes('Files')) return
    dragDepth++
    $('drop-hint').hidden = false
  })
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) $('drop-hint').hidden = true
  })
  window.addEventListener('dragover', e => e.preventDefault())
  window.addEventListener('drop', e => {
    e.preventDefault()
    dragDepth = 0
    $('drop-hint').hidden = true
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    // Chrome / Edge also hand over the file on disk; it must be asked for during the drop.
    const item = [...(e.dataTransfer?.items ?? [])].find(i => i.kind === 'file') as
      | (DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> })
      | undefined
    const pending = item?.getAsFileSystemHandle?.().catch(() => null)
    void (async () => {
      const handle = await pending
      await openBlob(file, file.name, { handle: handle?.kind === 'file' ? (handle as FileSystemFileHandle) : undefined })
    })()
  })
}

async function boot() {
  state.darkBackground = readPref('bg') !== 'light'
  const paper = readPref('paper') as PaperChoice | null
  if (paper && ['original', 'A4', 'A3', 'A2', 'A1'].includes(paper)) state.paper = paper
  state.mono = readPref('color') !== 'color'

  bindUi()
  $('btn-drive-home').hidden = !driveConfigured()
  initDriveUi((blob, name, source) => void openBlob(blob, name, { source, force: true }))
  void renderRecent()
  setBusy('준비 중')
  try {
    await initEngine($('cad-host'))
    state.ready = true
    applyBackground()
    watchViewSize()
    initEdit({
      docName: () => state.docName,
      prepareSave,
      save: saveEdited,
      revert: async () => {
        if (state.blob) {
          await openBlob(state.blob, state.fileName, { force: true, source: state.source, handle: state.handle })
        }
      }
    })
    // Installed on Windows: DWG / DXF opened from Explorer arrive here.
    onLaunchFiles(handle => {
      void handle.getFile().then(file => openBlob(file, handle.name, { handle }))
    })
  } catch (err) {
    console.error(err)
    toast('뷰어를 시작하지 못했어요. 새로고침해 주세요', true)
  } finally {
    setBusy(null)
  }

  if (signInResult && state.ready) {
    if ('error' in signInResult) {
      // A save that was waiting on sign-in comes back as an open drawing, so nothing is lost.
      const pending = await takePendingSave()
      if (pending) await openBlob(pending.blob, pending.name, { force: true })
      const cancelled = signInResult.error === 'access_denied'
      toast(
        cancelled ? '구글 계정 연결을 취소했어요' : '구글 계정을 연결하지 못했어요. 다시 시도해 주세요',
        !cancelled
      )
    } else if (signInResult.after.action === 'browse') {
      openDriveSheet(signInResult.after.path)
    } else {
      await resumePendingSave()
    }
  }

  void navigator.storage?.persist?.()
  registerSW({
    immediate: true,
    onOfflineReady() {
      toast('이제 인터넷 없이도 열려요')
    },
    onRegisterError(err) {
      console.warn('[dwg-viewer] service worker registration failed', err)
    }
  })

  // Dev only: ?open=/test-samples/x.dwg opens a file from the dev server.
  if (import.meta.env.DEV) {
    Object.assign(window, { __dwg: { AcApDocManager, currentDatabase, collectPages } })
    const src = new URLSearchParams(location.search).get('open')
    if (src) {
      const res = await fetch(src)
      if (res.ok) await openBlob(await res.blob(), src.split('/').pop() || 'drawing.dwg')
    }
  }
}

void boot()
