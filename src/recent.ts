// Recently opened drawings, kept on this device only (IndexedDB) so they can
// be reopened without going through the Files picker again.

export interface RecentFile {
  id: string
  name: string
  size: number
  openedAt: number
  blob: Blob
}

const DB_NAME = 'dwg-viewer'
const STORE = 'recent'
const MAX_FILES = 12
const MAX_BYTES = 400 * 1024 * 1024

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
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
    const all = await run<RecentFile[]>('readonly', s => s.getAll() as IDBRequest<RecentFile[]>)
    return all.sort((a, b) => b.openedAt - a.openedAt)
  } catch {
    return []
  }
}

export async function rememberFile(name: string, blob: Blob): Promise<void> {
  try {
    const id = `${name}::${blob.size}`
    await run('readwrite', s => s.put({ id, name, size: blob.size, openedAt: Date.now(), blob }))
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
    await run('readwrite', s => s.put({ ...file, openedAt: Date.now() }))
  } catch {
    // ignore
  }
}

export async function removeRecent(id: string): Promise<void> {
  try {
    await run('readwrite', s => s.delete(id))
  } catch {
    // ignore
  }
}
