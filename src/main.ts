import './style.css'

import { AcApDocManager, type AcApLayerInfo } from '@mlightcad/cad-simple-viewer'
import { AcGeBox2d, AcGePoint2d } from '@mlightcad/data-model'
import { zipSync } from 'fflate'
import { registerSW } from 'virtual:pwa-register'

import {
  currentDatabase,
  initEngine,
  listLayouts,
  openDrawing,
  switchLayout,
  zoomExtents
} from './engine'
import { collectPages, type ExportPage, layoutHasContent } from './pages'
import type { PaperChoice, PdfFile, PdfResult } from './pdf'
import { listRecent, rememberFile, removeRecent, type RecentFile, touchRecent } from './recent'
import { safeFileName } from './util'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

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
  layerFilter: ''
}

const DARK_BG = 0x0e1016
const LIGHT_BG = 0xffffff

/* ---------- small helpers ---------- */

let toastTimer = 0
function toast(message: string, isError = false) {
  const el = $('toast')
  el.textContent = message
  el.classList.toggle('error', isError)
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), isError ? 5200 : 3200)
}

function setBusy(text: string | null) {
  $('busy').hidden = text === null
  if (text) $('busy-text').textContent = text
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function formatDate(ms: number) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = []
) {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

const closeIcon = () => {
  const span = document.createElement('span')
  span.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  return span.firstElementChild as SVGElement
}

function readPref(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

/* ---------- opening files ---------- */

/** Checks the file header: DWG starts with "AC10", DXF is text with a SECTION header (or binary DXF). */
function sniffKind(buffer: ArrayBuffer, name: string): 'dwg' | 'dxf' | null {
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048)))
  if (head.startsWith('AC10') || head.startsWith('AC1.') || head.startsWith('AC2')) return 'dwg'
  if (head.startsWith('AutoCAD Binary DXF')) return 'dxf'
  if (/^\s*0\s*\r?\n\s*SECTION/i.test(head) || /\bSECTION\b[\s\S]*\bHEADER\b/i.test(head)) return 'dxf'
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'dwg' || ext === 'dxf' ? ext : null
}

async function openBlob(blob: Blob, name: string, recent?: RecentFile) {
  if (!state.ready || state.busy) return
  state.busy = true
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
    app.classList.remove('no-doc')
    $('doc-title').textContent = state.docName
    document.title = `${state.docName} - 도면 뷰어`
    applyBackground()
    watchLayers()
    renderLayouts()
    if (recent) void touchRecent(recent)
    else void rememberFile(fileName, blob)
  } catch (err) {
    console.error(err)
    toast('파일을 여는 중 문제가 생겼어요', true)
  } finally {
    state.busy = false
    setBusy(null)
  }
}

function pickFile() {
  if (!state.ready) return
  fileInput.value = ''
  fileInput.click()
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
    open.addEventListener('click', () => void openBlob(f.blob, f.name, f))
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
    chip.addEventListener('click', () => {
      switchLayout(layout.btrId)
      renderLayouts()
    })
    bar.append(chip)
  }
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
  const db = currentDatabase()
  if (!db) return
  $('pdf-sheet').hidden = true
  if (db.currentSpaceId !== page.btrId) switchLayout(page.btrId)
  renderLayouts()
  const view = AcApDocManager.instance.curView
  if (page.box) {
    const box = new AcGeBox2d(new AcGePoint2d(page.box.minX, page.box.minY), new AcGePoint2d(page.box.maxX, page.box.maxY))
    setTimeout(() => view.zoomTo(box, 1.05), 60)
  } else {
    setTimeout(() => zoomExtents(), 60)
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

function asBlobPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = el('a', { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * iPad: hands the PDFs to the share sheet ("파일에 저장" saves all of them at once).
 * Desktop: downloads one PDF, or a ZIP when several are saved together.
 */
async function saveFiles(files: PdfFile[], zipName?: string) {
  const asFiles = files.map(f => new File([asBlobPart(f.bytes)], f.name, { type: 'application/pdf' }))
  const touchDevice = navigator.maxTouchPoints > 1
  if (touchDevice && navigator.canShare?.({ files: asFiles })) {
    try {
      await navigator.share({ files: asFiles })
      return
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
    }
  }
  if (asFiles.length === 1) {
    downloadBlob(asFiles[0], asFiles[0].name)
    return
  }
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[f.name] = f.bytes
  const zipped = zipSync(entries, { level: 0 })
  downloadBlob(new Blob([asBlobPart(zipped)], { type: 'application/zip' }), zipName ?? 'pdf.zip')
}

/* ---------- panels + wiring ---------- */

function closePanels() {
  toggleLayerPanel(false)
  $('pdf-sheet').hidden = true
}

function bindUi() {
  $('btn-open').addEventListener('click', pickFile)
  $('btn-open-home').addEventListener('click', pickFile)
  $('btn-fit').addEventListener('click', () => zoomExtents())
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
    } else if (e.key === 'Escape') {
      closePdfSheet()
      toggleLayerPanel(false)
    }
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
    if (file) void openBlob(file, file.name)
  })
}

async function boot() {
  state.darkBackground = readPref('bg') !== 'light'
  const paper = readPref('paper') as PaperChoice | null
  if (paper && ['original', 'A4', 'A3', 'A2', 'A1'].includes(paper)) state.paper = paper
  state.mono = readPref('color') !== 'color'

  bindUi()
  void renderRecent()
  setBusy('준비 중')
  try {
    await initEngine($('cad-host'))
    state.ready = true
    applyBackground()
  } catch (err) {
    console.error(err)
    toast('뷰어를 시작하지 못했어요. 새로고침해 주세요', true)
  } finally {
    setBusy(null)
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
