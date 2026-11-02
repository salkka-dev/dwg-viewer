// Edit mode: a touch tool bar over the engine's drawing and modify commands.
// The engine's own pad/phone panel shows each command's prompts with ✓ and ✕.

import { AcApDocManager, eventBus } from '@mlightcad/cad-simple-viewer'

import {
  cancelCommand,
  currentLayer,
  drawingToDxf,
  insertableBlocks,
  isCommandRunning,
  runCommand,
  runCommandScript,
  selectionCount,
  setCommandLineVisible,
  setCurrentLayer,
  setEditable,
  undoState
} from './engine'
import { $, ask, closeMenu, el, icon, menuOpenFor, openMenu, toast } from './ui'

export interface EditHost {
  /** Base name of the open drawing, without extension. */
  docName(): string
  /**
   * Runs before the DXF is built, while the tap or key press still counts as
   * a user action (the PC save dialog needs one). Resolves false to stop.
   */
  prepareSave(fileName: string): Promise<boolean>
  /** Stores the edited DXF; resolves false when it did not finish (cancelled or failed). */
  save(blob: Blob, fileName: string): Promise<boolean>
  /** Throws the edits away by reopening the drawing as it was opened. */
  revert(): Promise<void>
}

const CLI_INPUT = '.ml-cli-text'
// Commands not worth repeating with Enter / Space / right-click.
const NO_REPEAT = new Set(['undo', 'redo', 'select', 'zoom', 'pan', 'regen'])
const usesMouse = () => matchMedia('(pointer: fine)').matches

export interface Tool {
  cmd: string
  label: string
  icon: string
}

interface ToolGroup {
  label: string
  icon: string
  tools: Tool[]
}

const HISTORY: Tool[] = [
  { cmd: 'undo', label: '되돌리기', icon: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>' },
  { cmd: 'redo', label: '다시', icon: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>' }
]

const DRAW: Tool[] = [
  { cmd: 'line', label: '선', icon: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.8" class="fill"/><circle cx="19" cy="5" r="1.8" class="fill"/>' },
  { cmd: 'pline', label: '폴리선', icon: '<path d="M4 18 9 8l5 7 6-10"/>' },
  { cmd: 'rectang', label: '사각형', icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
  { cmd: 'circle', label: '원', icon: '<circle cx="12" cy="12" r="8"/>' },
  { cmd: 'arc', label: '호', icon: '<path d="M4 18a8 8 0 0 1 16 0"/>' },
  { cmd: 'mtext', label: '글자', icon: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>' }
]

const DIM_LINEAR = '<path d="M4 7v10M20 7v10M4 12h16"/><path d="m7 9-3 3 3 3M17 9l3 3-3 3"/>'

const MORE_DRAW: ToolGroup = {
  label: '더 그리기',
  icon: '<path d="M12 5v14M5 12h14"/>',
  tools: [
    { cmd: 'ellipse', label: '타원', icon: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>' },
    { cmd: 'spline', label: '스플라인', icon: '<path d="M3 16c2.5-7 5.5-7 8.5 0s6 7 9.5 0"/>' },
    { cmd: 'polygon', label: '다각형', icon: '<path d="m12 3 8.5 6.2-3.2 10H6.7L3.5 9.2z"/>' },
    { cmd: 'point', label: '점', icon: '<circle cx="12" cy="12" r="2.2" class="fill"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>' },
    { cmd: '-hatch', label: '해치', icon: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12 12 4M4 20 20 4M12 20l8-8"/>' },
    { cmd: 'xline', label: '무한선', icon: '<path d="M2 20 22 4"/><circle cx="12" cy="12" r="1.8" class="fill"/>' },
    { cmd: 'ray', label: '광선', icon: '<path d="M5 19 21 5"/><circle cx="5" cy="19" r="1.8" class="fill"/>' }
  ]
}

const DIMS: ToolGroup = {
  label: '치수',
  icon: DIM_LINEAR,
  tools: [
    { cmd: 'dimlinear', label: '선형 치수', icon: DIM_LINEAR },
    { cmd: 'dimaligned', label: '사선 치수', icon: '<path d="M5 17 17 5"/><path d="m3 15 4 4M15 3l4 4"/>' },
    { cmd: 'dimradius', label: '반지름', icon: '<circle cx="12" cy="12" r="8"/><path d="m12 12 6-5"/>' },
    { cmd: 'dimdiameter', label: '지름', icon: '<circle cx="12" cy="12" r="8"/><path d="M6.3 17.7 17.7 6.3"/>' },
    { cmd: 'dimangular', label: '각도', icon: '<path d="M4 20h16M4 20 16 6"/><path d="M11 20a7 7 0 0 0-2-4.8"/>' },
    { cmd: 'dimarc', label: '호 길이', icon: '<path d="M4 18a8 8 0 0 1 16 0"/><path d="M7 11a6 6 0 0 1 10 0"/>' },
    { cmd: 'dimordinate', label: '좌표 치수', icon: '<path d="M5 19V5M5 19h14"/><path d="M5 11h6M13 19v-6"/>' },
    { cmd: 'dimcontinue', label: '이어서 치수', icon: '<path d="M3 8v8M12 8v8M21 8v8M3 12h18"/>' },
    { cmd: 'dimbaseline', label: '기준선 치수', icon: '<path d="M3 6v12M12 9v9M21 12v6M3 10h9M3 14h18"/>' }
  ]
}

const NOTE: Tool[] = [
  { cmd: 'revcloud', label: '구름', icon: '<path d="M7 18a3 3 0 0 1-.6-5.9 4.5 4.5 0 0 1 8.5-2A3.8 3.8 0 1 1 17 18z"/>' }
]

const BLOCK_ICON = '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4a2 2 0 0 1 2 2v4"/>'

// Layer commands that act on the layer of a tapped object, AutoCAD's LAY* tools.
const LAYER_TOOLS: Tool[] = [
  { cmd: 'laycur', label: '고른 객체를 그릴 레이어로', icon: '' },
  { cmd: 'layoff', label: '객체 레이어 끄기', icon: '' },
  { cmd: 'layfrz', label: '객체 레이어 동결', icon: '' },
  { cmd: 'laylck', label: '객체 레이어 잠그기', icon: '' },
  { cmd: 'layulk', label: '객체 레이어 잠금 풀기', icon: '' },
  { cmd: 'layiso', label: '고른 레이어만 보기', icon: '' },
  { cmd: 'layuniso', label: '다시 모두 보기', icon: '' },
  { cmd: 'layon', label: '모든 레이어 켜기', icon: '' },
  { cmd: 'laythw', label: '동결 모두 풀기', icon: '' },
  { cmd: 'layerp', label: '직전 레이어 상태로', icon: '' }
]

const MODIFY: Tool[] = [
  { cmd: 'move', label: '이동', icon: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>' },
  { cmd: 'copy', label: '복사', icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>' },
  { cmd: 'rotate', label: '회전', icon: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>' },
  { cmd: 'offset', label: '간격', icon: '<path d="M4 14c4-7 12-7 16 0"/><path d="M4 20c4-7 12-7 16 0"/>' },
  { cmd: 'erase', label: '지우기', icon: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13M9 7V4h6v3"/>' }
]

const LAYER_ICON = '<path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>'

let host: EditHost
let editing = false
let dirty = false
let lastCommand: string | null = null

export const isEditing = () => editing
export const hasUnsavedEdits = () => editing && dirty

export function initEdit(h: EditHost) {
  host = h
  const tools = $('edit-tools')
  tools.append(
    ...HISTORY.map(toolButton),
    el('span', { className: 'edit-sep' }),
    ...DRAW.map(toolButton),
    groupButton(MORE_DRAW),
    el('span', { className: 'edit-sep' }),
    groupButton(DIMS),
    ...NOTE.map(toolButton),
    blockButton(),
    el('span', { className: 'edit-sep' }),
    ...MODIFY.map(toolButton)
  )
  // Layer and save stay in view while the tool row scrolls on narrow screens.
  $('edit-bar').insertBefore(layerButton(), $('edit-save'))
  $('edit-save').addEventListener('click', () => void saveEdits())

  eventBus.on('undo-stack-changed', () => {
    if (!editing) return
    dirty = true
    refreshState()
  })
  const editor = AcApDocManager.instance.curView.editor
  editor.events.commandWillStart.addEventListener(args => {
    const name = args.command.globalName.toLowerCase()
    if (!NO_REPEAT.has(name)) lastCommand = name
    markActive(args.command.globalName)
    // Grips of a preselected object stay on screen during MOVE/COPY/ROTATE and
    // swallow the base-point click; let picks go through to the drawing (they
    // still snap to the grip's point).
    document.body.classList.add('command-running')
  })
  editor.events.commandEnded.addEventListener(() => {
    document.body.classList.remove('command-running')
    markActive(null)
    refreshState()
  })

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('contextmenu', onContextMenu)
}

/**
 * AutoCAD habits with a keyboard: typing anywhere goes to the command line,
 * Space works as Enter there, and Enter or Space with nothing running repeats
 * the last command.
 */
function onKeyDown(e: KeyboardEvent) {
  if (!editing || e.isComposing) return
  const target = e.target instanceof Element ? e.target : null
  // The engine leaves focus in the command line after every command, where
  // Ctrl+Z and Delete would only edit the text. With the line empty they act
  // on the drawing, as in AutoCAD.
  if (target instanceof HTMLInputElement && target.matches(CLI_INPUT) && !target.value && !isCommandRunning()) {
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault()
      e.stopImmediatePropagation()
      void runCommand(e.code === 'KeyY' || e.shiftKey ? 'redo' : 'undo')
      return
    }
    if (!mod && e.key === 'Delete' && selectionCount() > 0) {
      e.preventDefault()
      e.stopImmediatePropagation()
      void runCommand('erase')
      return
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (target?.matches(CLI_INPUT)) {
    if (e.key === ' ') {
      e.preventDefault()
      e.stopImmediatePropagation()
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    }
    return
  }
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  if (isCommandRunning()) return
  if ((e.key === 'Enter' || e.key === ' ') && lastCommand) {
    e.preventDefault()
    void runCommand(lastCommand)
    return
  }
  if (e.key.length === 1 && e.key.trim()) typeIntoCommandLine(e)
}

function typeIntoCommandLine(e: KeyboardEvent) {
  const box = document.querySelector<HTMLInputElement>(CLI_INPUT)
  if (box && box.offsetParent !== null) {
    // Focus moves before the key is handled, so the letter lands in the box.
    box.focus()
    return
  }
  // Hidden (an iPad with a keyboard): show it, then put the first letter in.
  e.preventDefault()
  setCommandLineVisible(true)
  requestAnimationFrame(() => {
    const shown = document.querySelector<HTMLInputElement>(CLI_INPUT)
    if (!shown) return
    shown.focus()
    shown.value += e.key
    shown.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Right-click on the drawing with nothing running repeats the last command. */
function onContextMenu(e: MouseEvent) {
  if (!editing || isCommandRunning() || !lastCommand) return
  if (!(e.target instanceof HTMLCanvasElement)) return
  e.preventDefault()
  void runCommand(lastCommand)
}

export function start(cmd: string) {
  runCommand(cmd).catch(err => {
    console.error(err)
    toast('이 기능을 시작하지 못했어요', true)
  })
}

function toolButton(tool: Tool) {
  const b = el('button', { className: 'edit-tool', type: 'button', title: tool.label }, [
    icon(tool.icon),
    el('span', { textContent: tool.label })
  ])
  b.dataset.cmd = tool.cmd
  b.addEventListener('click', () => {
    if (b.classList.contains('active')) {
      cancelCommand()
      return
    }
    start(tool.cmd)
  })
  return b
}

/** One button for a family of tools (dimensions, more shapes); opens a list. */
function groupButton(group: ToolGroup) {
  const b = el('button', { className: 'edit-tool group-tool', type: 'button', title: group.label }, [
    icon(group.icon),
    el('span', { textContent: `${group.label} ▾` })
  ])
  b.dataset.cmds = group.tools.map(t => t.cmd).join(' ')
  b.addEventListener('click', () => {
    if (menuOpenFor(b)) {
      closeMenu()
      return
    }
    openMenu(
      b,
      group.tools.map(t => ({ label: t.label, icon: t.icon, run: () => start(t.cmd) }))
    )
  })
  return b
}

function blockButton() {
  const b = el('button', { className: 'edit-tool', type: 'button', title: '블록 넣기' }, [
    icon(BLOCK_ICON),
    el('span', { textContent: '블록' })
  ])
  b.dataset.cmd = '-insert'
  b.addEventListener('click', openBlockSheet)
  return b
}

/** Lists the drawing's blocks; the chosen one is placed with the engine's -INSERT. */
function openBlockSheet() {
  const blocks = insertableBlocks()
  const close = () => backdrop.remove()
  const rows = blocks.map(block => {
    const row = el('button', { className: 'layer-row pick', type: 'button' }, [
      icon(BLOCK_ICON),
      el('span', { className: 'layer-name', textContent: block.name }),
      el('span', { className: 'pick-mark muted', textContent: `객체 ${block.entities}개` })
    ])
    row.addEventListener('click', () => {
      close()
      runCommandScript(`-insert\n${block.name}`).catch(err => {
        console.error(err)
        toast('블록을 넣지 못했어요', true)
      })
    })
    return el('li', {}, [row])
  })
  const backdrop = el('div', { className: 'sheet-backdrop' }, [
    el('div', { className: 'sheet layer-pick' }, [
      el('header', { className: 'sheet-head' }, [el('h2', { textContent: '블록 넣기' })]),
      el('p', {
        className: 'hint pick-hint',
        textContent: blocks.length
          ? '넣을 블록을 고른 뒤 놓을 자리를 찍으세요. 축척과 회전은 확인을 누르면 원래대로 들어가요.'
          : '이 도면에는 넣을 수 있는 블록이 없어요.'
      }),
      el('ul', { className: 'layer-list' }, rows)
    ])
  ])
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close()
  })
  document.body.append(backdrop)
}

function layerButton() {
  const b = el('button', { className: 'edit-tool layer-tool', type: 'button', id: 'edit-layer' }, [
    icon(LAYER_ICON),
    el('span', { id: 'edit-layer-name', textContent: '0' })
  ])
  b.title = '새로 그리는 선이 들어갈 레이어'
  b.addEventListener('click', () => void pickLayer())
  return b
}

function markActive(globalName: string | null) {
  const name = globalName?.toLowerCase() ?? ''
  const show = name !== 'undo' && name !== 'redo' && name !== ''
  for (const b of $('edit-bar').querySelectorAll<HTMLButtonElement>('.edit-tool')) {
    const mine = b.dataset.cmd === name || (b.dataset.cmds?.split(' ').includes(name) ?? false)
    b.classList.toggle('active', show && mine)
  }
}

function refreshState() {
  const { undo, redo } = undoState()
  for (const b of $('edit-bar').querySelectorAll<HTMLButtonElement>('.edit-tool')) {
    if (b.dataset.cmd === 'undo') b.disabled = !undo
    if (b.dataset.cmd === 'redo') b.disabled = !redo
  }
  $('edit-layer-name').textContent = currentLayer()
  $('edit-save').classList.toggle('dirty', dirty)
}

/** Lets the user choose the layer new lines, text and dimensions go on. */
function pickLayer(): Promise<void> {
  const store = AcApDocManager.instance.curDocument.layerStore
  const layers = store
    .getLayers()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const current = currentLayer()
  return new Promise(resolve => {
    const close = () => {
      backdrop.remove()
      resolve()
    }
    const rows = layers.map(layer => {
      const swatch = el('span', { className: 'layer-swatch' })
      swatch.style.background = layer.cssColor
      const row = el('button', { className: `layer-row pick${layer.name === current ? ' current' : ''}`, type: 'button' }, [
        swatch,
        el('span', { className: 'layer-name', textContent: layer.name }),
        ...(layer.name === current ? [el('span', { className: 'pick-mark', textContent: '사용 중' })] : [])
      ])
      row.addEventListener('click', () => {
        setCurrentLayer(layer.name)
        if (!layer.isOn || layer.isFrozen) {
          if (layer.isFrozen) store.setLayerFrozen(layer.name, false)
          store.setLayerOn(layer.name, true)
        }
        refreshState()
        close()
      })
      return el('li', {}, [row])
    })
    const tools = LAYER_TOOLS.map(tool => {
      const b = el('button', { className: 'ghost-btn', type: 'button', textContent: tool.label })
      b.addEventListener('click', () => {
        close()
        start(tool.cmd)
      })
      return b
    })
    const backdrop = el('div', { className: 'sheet-backdrop' }, [
      el('div', { className: 'sheet layer-pick' }, [
        el('header', { className: 'sheet-head' }, [el('h2', { textContent: '레이어' })]),
        el('p', { className: 'sheet-section', textContent: '객체로 레이어 다루기' }),
        el('div', { className: 'layer-tools' }, tools),
        el('p', { className: 'sheet-section', textContent: '그릴 레이어' }),
        el('p', { className: 'hint pick-hint', textContent: '새로 그리는 선, 글자, 치수가 이 레이어에 들어가요.' }),
        el('ul', { className: 'layer-list' }, rows)
      ])
    ])
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) close()
    })
    document.body.append(backdrop)
  })
}

export function enterEdit() {
  if (editing) return
  setEditable(true)
  editing = true
  dirty = false
  if (usesMouse()) setCommandLineVisible(true)
  $('app').classList.add('editing')
  $('edit-bar').hidden = false
  $('btn-edit').classList.add('on')
  refreshState()
}

function finish() {
  setEditable(false)
  setCommandLineVisible(false)
  editing = false
  dirty = false
  markActive(null)
  $('app').classList.remove('editing')
  $('edit-bar').hidden = true
  $('btn-edit').classList.remove('on')
  $('edit-save').classList.remove('dirty')
}

/** Leaves edit mode, asking first when there are unsaved edits. Resolves false if the user stays. */
export async function leaveEdit(): Promise<boolean> {
  if (!editing) return true
  if (dirty) {
    const choice = await ask('저장하지 않은 수정이 있어요', '편집을 끝내기 전에 고친 도면을 DXF 파일로 저장할까요?', [
      { value: 'save', label: '저장하고 끝내기', strong: true },
      { value: 'discard', label: '저장하지 않고 끝내기' },
      { value: 'stay', label: '계속 편집' }
    ])
    if (choice === null || choice === 'stay') return false
    if (choice === 'save' && !(await saveEdits())) return false
    if (choice === 'discard') {
      finish()
      await host.revert()
      return true
    }
  }
  finish()
  return true
}

/** Another drawing replaced the current one: drop edit mode without asking. */
export function resetEdit() {
  if (editing) finish()
}

/** Name for the edited copy; the original DWG/DXF is never overwritten. */
export const editedBaseName = (base: string) => (/_수정$/.test(base) ? base : `${base}_수정`)

export async function saveEdits(): Promise<boolean> {
  if (!editing) return false
  cancelCommand()
  const fileName = `${editedBaseName(host.docName())}.dxf`
  if (!(await host.prepareSave(fileName))) return false
  let dxf: ReturnType<typeof drawingToDxf>
  try {
    dxf = drawingToDxf()
  } catch (err) {
    console.error(err)
    toast('도면을 DXF로 바꾸지 못했어요', true)
    return false
  }
  if (dxf.problems.length) {
    console.warn('[dwg-viewer] DXF check:', dxf.problems)
    const go = await ask(
      'AutoCAD에서 안 열릴 수 있어요',
      `DXF로 바꾼 파일에서 문제가 보였어요 (${dxf.problems.join(', ')}). 원본은 그대로 두고 저장은 할 수 있어요.`,
      [
        { value: 'save', label: '그래도 저장', strong: true },
        { value: 'cancel', label: '저장 안 함' }
      ]
    )
    if (go !== 'save') return false
  }
  const saved = await host.save(dxf.blob, fileName)
  if (saved) {
    dirty = false
    refreshState()
  }
  return saved
}
