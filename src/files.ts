// Desktop Chrome / Edge file access: native open and save dialogs that hand
// back file handles, so edits can be written straight to disk, plus files
// opened from Windows Explorer once the app is installed. Safari on iPad has
// none of this and keeps the file input and share sheet.

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

type FsWindow = Window & {
  showOpenFilePicker?: (options: { types?: PickerType[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options: {
    suggestedName?: string
    startIn?: FileSystemHandle | string
    types?: PickerType[]
  }) => Promise<FileSystemFileHandle>
  launchQueue?: { setConsumer(consumer: (params: { files?: readonly FileSystemFileHandle[] }) => void): void }
}

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

const fsw = window as FsWindow
const DRAWINGS: PickerType[] = [{ description: 'CAD 도면 (DWG, DXF)', accept: { 'image/vnd.dwg': ['.dwg'], 'image/vnd.dxf': ['.dxf'] } }]
const DXF: PickerType[] = [{ description: 'DXF 도면', accept: { 'image/vnd.dxf': ['.dxf'] } }]

const aborted = (err: unknown) => (err as DOMException)?.name === 'AbortError'

/** True on a PC browser with the native file dialogs (mouse as the main pointer). */
export const canUseFileHandles = () =>
  typeof fsw.showOpenFilePicker === 'function' &&
  typeof fsw.showSaveFilePicker === 'function' &&
  matchMedia('(pointer: fine)').matches

/** Resolves null when the user closes the dialog. */
export async function pickDrawingHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await fsw.showOpenFilePicker!({ types: DRAWINGS })
    return handle ?? null
  } catch (err) {
    if (aborted(err)) return null
    throw err
  }
}

/** Save dialog opened in the folder of `near` (the original drawing). Null when closed. */
export async function pickSaveHandle(name: string, near?: FileSystemFileHandle): Promise<FileSystemFileHandle | null> {
  try {
    return await fsw.showSaveFilePicker!({ suggestedName: name, startIn: near ?? 'documents', types: DXF })
  } catch (err) {
    if (aborted(err)) return null
    throw err
  }
}

/** Asks for write access if the browser has not granted it yet (needs a user action). */
export async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as PermissionHandle
  if (!h.queryPermission) return true
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

export async function writeFile(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

/** DWG / DXF files opened with the installed app from Windows Explorer. */
export function onLaunchFiles(open: (handle: FileSystemFileHandle) => void) {
  fsw.launchQueue?.setConsumer(params => {
    const handle = params.files?.[0]
    if (handle) open(handle)
  })
}
