// Google Drive connection: sign-in, folder listing, download and upload.
//
// Sign-in uses Google's browser redirect flow (no popup), which also works in
// an iPad home-screen web app. The access token lives in localStorage for its
// one-hour lifetime; drawings travel only between this device and Drive.

import { GOOGLE_CLIENT_ID } from './config'

const SCOPE = 'https://www.googleapis.com/auth/drive'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_KEY = 'dwg-viewer.drive.token'
const AUTH_KEY = 'dwg-viewer.drive.auth'
const ACCOUNT_KEY = 'dwg-viewer.drive.account'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'
const DRAWING = /\.(dwg|dxf)$/i

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  parents?: string[]
}

export interface Crumb {
  id: string
  name: string
}

/** What the app should do when Google sends the user back after sign-in. */
export type AfterSignIn = { action: 'browse'; path?: Crumb[] } | { action: 'save' }

export class DriveAuthError extends Error {
  constructor() {
    super('구글 드라이브 연결이 필요합니다')
  }
}

export class DriveHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(`Drive ${status}: ${detail.slice(0, 200)}`)
  }
}

export const driveConfigured = () => GOOGLE_CLIENT_ID !== ''
export const isFolder = (item: DriveItem) => item.mimeType === FOLDER_MIME

function store(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode: sign-in lasts for this page only.
  }
}

function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function token(): string | undefined {
  const saved = load<{ token: string; expiresAt: number }>(TOKEN_KEY)
  return saved && saved.expiresAt > Date.now() ? saved.token : undefined
}

export const signedIn = () => token() !== undefined
export const driveAccount = () => load<string>(ACCOUNT_KEY)

/** Leaves the app for Google's sign-in page; Google sends the user back to the app's own URL. */
export function signIn(after: AfterSignIn) {
  const nonce = crypto.randomUUID()
  store(AUTH_KEY, { nonce, after })
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: new URL('./', location.href).href,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: nonce
  })
  const account = driveAccount()
  if (account) params.set('login_hint', account)
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/**
 * Picks up the token Google appends to the URL fragment after sign-in.
 * Returns null when this page load is not a sign-in return.
 */
export function takeSignInResult(): { after: AfterSignIn } | { error: string } | null {
  const hash = location.hash.slice(1)
  if (!/(^|&)(access_token|error)=/.test(hash)) return null
  const params = new URLSearchParams(hash)
  history.replaceState(null, '', location.pathname + location.search)
  const pending = load<{ nonce: string; after: AfterSignIn }>(AUTH_KEY)
  store(AUTH_KEY, undefined)
  if (!pending || params.get('state') !== pending.nonce) return { error: 'state_mismatch' }
  const error = params.get('error')
  if (error) return { error }
  const accessToken = params.get('access_token')
  if (!accessToken) return { error: 'no_token' }
  const lifetime = Number(params.get('expires_in') ?? 3600)
  store(TOKEN_KEY, { token: accessToken, expiresAt: Date.now() + (lifetime - 120) * 1000 })
  void rememberAccount()
  return { after: pending.after }
}

async function rememberAccount() {
  try {
    const res = await call(`${API}/about?fields=user(emailAddress)`)
    const about = (await res.json()) as { user?: { emailAddress?: string } }
    if (about.user?.emailAddress) store(ACCOUNT_KEY, about.user.emailAddress)
  } catch {
    // Only used as a sign-in hint.
  }
}

export function signOut() {
  const current = token()
  store(TOKEN_KEY, undefined)
  store(ACCOUNT_KEY, undefined)
  if (current) {
    void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(current)}`, {
      method: 'POST',
      mode: 'no-cors'
    }).catch(() => undefined)
  }
}

async function call(url: string, init: RequestInit = {}) {
  const current = token()
  if (!current) throw new DriveAuthError()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${current}`)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    store(TOKEN_KEY, undefined)
    throw new DriveAuthError()
  }
  if (!res.ok) throw new DriveHttpError(res.status, await res.text())
  return res
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

interface ListResponse {
  nextPageToken?: string
  files: (DriveItem & { shortcutDetails?: { targetId: string; targetMimeType: string } })[]
}

/** Folders and DWG/DXF files in a folder ('shared' = files others shared with this account). */
export async function listFolder(folderId: string): Promise<DriveItem[]> {
  const q = folderId === 'shared' ? 'sharedWithMe = true and trashed = false' : `${quote(folderId)} in parents and trashed = false`
  const items: DriveItem[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,shortcutDetails)',
      pageSize: '1000',
      orderBy: 'folder,name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = (await (await call(`${API}/files?${params}`)).json()) as ListResponse
    for (const f of page.files) {
      // Shortcuts behave like the folder or file they point to.
      const target = f.mimeType === SHORTCUT_MIME ? f.shortcutDetails : undefined
      const item = target ? { ...f, id: target.targetId, mimeType: target.targetMimeType } : f
      if (isFolder(item) || DRAWING.test(item.name)) items.push(item)
    }
    pageToken = page.nextPageToken
  } while (pageToken && items.length < 5000)
  return items.sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name, 'ko'))
}

export async function download(fileId: string): Promise<Blob> {
  const res = await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`)
  return res.blob()
}

async function findChild(parentId: string, name: string): Promise<DriveItem | undefined> {
  const params = new URLSearchParams({
    q: `name = ${quote(name)} and ${quote(parentId)} in parents and trashed = false`,
    fields: 'files(id,name,mimeType,parents)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  })
  const page = (await (await call(`${API}/files?${params}`)).json()) as ListResponse
  return page.files[0]
}

async function create(name: string, parentId: string, blob: Blob): Promise<DriveItem> {
  const boundary = `dwg-viewer-${crypto.randomUUID()}`
  const meta = JSON.stringify({ name, parents: [parentId], mimeType: blob.type || 'application/octet-stream' })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ])
  const res = await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  })
  return (await res.json()) as DriveItem
}

async function overwrite(fileId: string, blob: Blob): Promise<DriveItem> {
  const res = await call(
    `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,parents`,
    { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }
  )
  return (await res.json()) as DriveItem
}

/**
 * Saves `blob` as `name` in the folder, replacing a file of the same name
 * (Drive keeps the old one in its version history). When the folder cannot be
 * written (a folder someone else shared read-only), saves to My Drive instead.
 */
export async function saveFile(
  name: string,
  parentId: string,
  blob: Blob
): Promise<{ item: DriveItem; inMyDrive: boolean }> {
  try {
    const existing = await findChild(parentId, name)
    const item = existing ? await overwrite(existing.id, blob) : await create(name, parentId, blob)
    return { item, inMyDrive: false }
  } catch (err) {
    if (!(err instanceof DriveHttpError) || (err.status !== 403 && err.status !== 404) || parentId === 'root') throw err
    const existing = await findChild('root', name)
    const item = existing ? await overwrite(existing.id, blob) : await create(name, 'root', blob)
    return { item, inMyDrive: true }
  }
}
