// Recently opened drawings, kept on this device only (IndexedDB) so they can
// be reopened without going through the Files picker again.

/** Where an open drawing came from, so edits can be saved back to the same place. */
export type DocSource =
  | { kind: 'device' }
  | { kind: 'drive'; fileId: string; parentId: string; name: string; folderName: string }

export interface RecentFile {
  id: string
  name: string
  size: number
  openedAt: number
  blob: Blob
  source?: DocSource
}

/** An edited drawing waiting to be uploaded after the Google sign-in round trip. */
export interface PendingSave {
  id: 'save'
  name: string
  blob: Blob
  parentId: string
  folderName: string
}

const DB_NAME = 'dwg-viewer'
const STORE = 'recent'
const PENDING = 'pending'
const MAX_FILES = 12
const MAX_BYTES = 400 * 1024 * 1024

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const names = req.result.objectStoreNames
      if (!names.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!names.contains(PENDING)) req.result.createObjectStore(PENDING, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
  )
}

export async function listRecent(): Promise<RecentFile[]> {
  try {
    const all = await run<RecentFile[]>(STORE, 'readonly', s => s.getAll() as IDBRequest<RecentFile[]>)
    return all.sort((a, b) => b.openedAt - a.openedAt)
  } catch {
    return []
  }
}

export async function rememberFile(name: string, blob: Blob, source?: DocSource): Promise<void> {
  try {
    const id = source?.kind === 'drive' ? `drive::${source.fileId}` : `${name}::${blob.size}`
    await run(STORE, 'readwrite', s => s.put({ id, name, size: blob.size, openedAt: Date.now(), blob, source }))
    const all = await listRecent()
    let bytes = 0
    for (const [i, f] of all.entries()) {
      bytes += f.size
      if (i >= MAX_FILES || bytes > MAX_BYTES) await removeRecent(f.id)
    }
  } catch {
    // Private browsing or storage full: recent list is a convenience only.
  }
}

export async function touchRecent(file: RecentFile): Promise<void> {
  try {
    await run(STORE, 'readwrite', s => s.put({ ...file, openedAt: Date.now() }))
  } catch {
    // ignore
  }
}

export async function removeRecent(id: string): Promise<void> {
  try {
    await run(STORE, 'readwrite', s => s.delete(id))
  } catch {
    // ignore
  }
}

export async function stashPendingSave(save: Omit<PendingSave, 'id'>): Promise<void> {
  await run(PENDING, 'readwrite', s => s.put({ ...save, id: 'save' }))
}

export async function takePendingSave(): Promise<PendingSave | undefined> {
  try {
    const save = await run<PendingSave | undefined>(PENDING, 'readonly', s => s.get('save'))
    if (save) await run(PENDING, 'readwrite', s => s.delete('save'))
    return save
  } catch {
    return undefined
  }
}
