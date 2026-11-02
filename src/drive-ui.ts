// Google Drive browser sheet: connect, walk folders, open a DWG/DXF.

import { type Crumb, DriveAuthError, driveAccount, download, isFolder, listFolder, signedIn, signIn, signOut } from './drive'
import type { DocSource } from './recent'
import { $, el, formatDate, formatSize, icon, readPref, setBusy, toast, writePref } from './ui'

type OpenHandler = (blob: Blob, name: string, source: DocSource) => void

const ROOTS: Record<string, Crumb> = {
  root: { id: 'root', name: '내 드라이브' },
  shared: { id: 'shared', name: '공유 문서함' }
}
const PATH_PREF = 'drive-path'

const FOLDER_ICON = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
const FILE_ICON = '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 14h6M10 17h4"/>'

let onOpen: OpenHandler = () => undefined
let path: Crumb[] = [ROOTS.root]
let loadSerial = 0

export function initDriveUi(open: OpenHandler) {
  onOpen = open
  try {
    const saved = JSON.parse(readPref(PATH_PREF) ?? 'null') as Crumb[] | null
    if (Array.isArray(saved) && saved.length && saved[0].id in ROOTS) path = saved
  } catch {
    // keep the default path
  }
  $('drive-close').addEventListener('click', closeDriveSheet)
  $('drive-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDriveSheet()
  })
  $('drive-signin').addEventListener('click', () => signIn({ action: 'browse', path }))
  $('drive-signout').addEventListener('click', () => {
    signOut()
    showConnect('연결을 해제했어요. 다시 연결하면 드라이브 도면을 열 수 있어요.')
  })
  $('drive-tabs').addEventListener('click', e => {
    const root = (e.target as HTMLElement).closest('button')?.dataset.root
    if (root && root in ROOTS) void go([ROOTS[root]])
  })
}

export function openDriveSheet(at?: Crumb[]) {
  if (at?.length) path = at
  $('drive-sheet').hidden = false
  if (!signedIn()) {
    showConnect()
    return
  }
  void go(path)
}

export function closeDriveSheet() {
  $('drive-sheet').hidden = true
}

function showConnect(message?: string) {
  $('drive-connect').hidden = false
  $('drive-browser').hidden = true
  $('drive-foot').hidden = true
  $('drive-connect-msg').textContent =
    message ??
    '구글 계정을 연결하면 드라이브에 있는 DWG, DXF를 바로 열고, 고친 도면을 같은 폴더에 저장해요. 도면은 이 기기와 구글 드라이브 사이에서만 오가요.'
}

async function go(next: Crumb[]) {
  path = next
  writePref(PATH_PREF, JSON.stringify(path))
  $('drive-connect').hidden = true
  $('drive-browser').hidden = false
  $('drive-foot').hidden = false
  $('drive-account').textContent = driveAccount() ?? ''
  for (const b of $('drive-tabs').querySelectorAll<HTMLButtonElement>('button')) {
    b.classList.toggle('active', b.dataset.root === path[0].id)
  }
  renderCrumbs()
  const list = $('drive-list')
  list.replaceChildren(el('li', { className: 'drive-loading', textContent: '불러오는 중' }))
  $('drive-empty').hidden = true
  const serial = ++loadSerial
  try {
    const items = await listFolder(path[path.length - 1].id)
    if (serial !== loadSerial) return
    list.replaceChildren(...items.map(itemRow))
    $('drive-empty').hidden = items.length > 0
  } catch (err) {
    if (serial !== loadSerial) return
    if (err instanceof DriveAuthError) {
      showConnect('연결 시간이 지나서 다시 연결해야 해요.')
      return
    }
    console.error(err)
    list.replaceChildren()
    toast('드라이브 목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요', true)
  }
}

function renderCrumbs() {
  const nav = $('drive-crumbs')
  nav.replaceChildren()
  path.forEach((crumb, i) => {
    if (i > 0) nav.append(el('span', { className: 'crumb-sep', textContent: '›' }))
    const last = i === path.length - 1
    const b = el('button', { className: `crumb${last ? ' current' : ''}`, type: 'button', textContent: crumb.name })
    if (!last) b.addEventListener('click', () => void go(path.slice(0, i + 1)))
    nav.append(b)
  })
  nav.scrollLeft = nav.scrollWidth
}

function itemRow(item: Parameters<typeof isFolder>[0]) {
  const folder = isFolder(item)
  const meta = folder
    ? ''
    : [item.size ? formatSize(Number(item.size)) : '', item.modifiedTime ? formatDate(Date.parse(item.modifiedTime)) : '']
        .filter(Boolean)
        .join(' · ')
  const row = el('button', { className: `drive-row${folder ? ' folder' : ''}`, type: 'button' }, [
    icon(folder ? FOLDER_ICON : FILE_ICON),
    el('span', { className: 'drive-text' }, [
      el('span', { className: 'drive-name', textContent: item.name }),
      ...(meta ? [el('span', { className: 'drive-meta', textContent: meta })] : [])
    ])
  ])
  row.addEventListener('click', () => {
    if (folder) void go([...path, { id: item.id, name: item.name }])
    else void openFile(item)
  })
  return el('li', {}, [row])
}

async function openFile(item: Parameters<typeof isFolder>[0]) {
  const here = path[path.length - 1]
  // Files listed under 공유 문서함 have their own parent; save next to it when possible.
  const parentId = here.id === 'shared' ? (item.parents?.[0] ?? 'root') : here.id
  const folderName = here.id === 'shared' ? '공유 문서함' : here.name
  setBusy(`${item.name} 받는 중`)
  try {
    const blob = await download(item.id)
    closeDriveSheet()
    setBusy(null)
    onOpen(blob, item.name, { kind: 'drive', fileId: item.id, parentId, name: item.name, folderName })
  } catch (err) {
    setBusy(null)
    if (err instanceof DriveAuthError) {
      showConnect('연결 시간이 지나서 다시 연결해야 해요.')
      return
    }
    console.error(err)
    toast('파일을 받지 못했어요. 인터넷 연결을 확인해 주세요', true)
  }
}
