// Small DOM helpers shared by the app modules.

import { zipSync } from 'fflate'

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

let toastTimer = 0
export function toast(message: string, isError = false) {
  const el = $('toast')
  el.textContent = message
  el.classList.toggle('error', isError)
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), isError ? 5200 : 3200)
}

export function setBusy(text: string | null) {
  $('busy').hidden = text === null
  if (text) $('busy-text').textContent = text
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function formatDate(ms: number) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = []
) {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

/** Builds an inline SVG icon from path markup (24x24 viewBox). */
export function icon(paths: string) {
  const span = document.createElement('span')
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`
  return span.firstElementChild as SVGElement
}

export const closeIcon = () => icon('<path d="M6 6l12 12M18 6 6 18"/>')

export function readPref(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function asBlobPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = el('a', { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * iPad: hands the files to the share sheet ("파일에 저장" saves them all at once).
 * Desktop: downloads one file, or a ZIP when several are saved together.
 * Resolves false when the user closed the share sheet without saving.
 */
export async function shareOrDownload(files: File[], zipName?: string): Promise<boolean> {
  const touchDevice = navigator.maxTouchPoints > 1
  if (touchDevice && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files })
      return true
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return false
    }
  }
  if (files.length === 1) {
    downloadBlob(files[0], files[0].name)
    return true
  }
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[f.name] = new Uint8Array(await f.arrayBuffer())
  const zipped = zipSync(entries, { level: 0 })
  downloadBlob(new Blob([asBlobPart(zipped)], { type: 'application/zip' }), zipName ?? 'files.zip')
  return true
}

export interface MenuItem {
  label: string
  icon?: string
  run: () => void
}

let openPopup: { anchor: HTMLElement; cleanup: () => void } | undefined

export function closeMenu() {
  openPopup?.cleanup()
  openPopup = undefined
}

/** Drop-down list under a button. Closes on a choice, a tap elsewhere or Escape. */
export function openMenu(anchor: HTMLElement, items: MenuItem[], note?: string) {
  closeMenu()
  const menu = el('div', { className: 'pop-menu' })
  menu.setAttribute('role', 'menu')
  for (const item of items) {
    const b = el('button', { className: 'pop-item', type: 'button' }, [
      ...(item.icon ? [icon(item.icon)] : []),
      el('span', { textContent: item.label })
    ])
    b.setAttribute('role', 'menuitem')
    b.addEventListener('click', () => {
      closeMenu()
      item.run()
    })
    menu.append(b)
  }
  if (note) menu.append(el('p', { className: 'pop-note', textContent: note }))
  document.body.append(menu)

  const r = anchor.getBoundingClientRect()
  const left = Math.min(Math.max(8, r.left), innerWidth - menu.offsetWidth - 8)
  let top = r.bottom + 6
  if (top + menu.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - menu.offsetHeight - 6)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  const onOutside = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeMenu()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMenu()
  }
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('keydown', onKey)
  anchor.classList.add('menu-open')
  openPopup = {
    anchor,
    cleanup: () => {
      menu.remove()
      anchor.classList.remove('menu-open')
      document.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('keydown', onKey)
    }
  }
}

/** True while the given button's menu is showing (a second tap closes it). */
export const menuOpenFor = (anchor: HTMLElement) => openPopup?.anchor === anchor

export interface TextField {
  label: string
  value: string
  multiline?: boolean
}

/** Modal with text boxes for editing drawing text. Resolves the new values, or null when cancelled. */
export function editTexts(title: string, fields: TextField[]): Promise<string[] | null> {
  return new Promise(resolve => {
    const inputs = fields.map(f =>
      f.multiline
        ? el('textarea', { className: 'text-field', value: f.value, rows: Math.min(8, Math.max(3, f.value.split('\n').length + 1)) })
        : el('input', { className: 'text-field', type: 'text', value: f.value })
    )
    const done = (values: string[] | null) => {
      backdrop.remove()
      window.removeEventListener('keydown', onKey)
      resolve(values)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(null)
    }
    const save = el('button', { className: 'big-btn', type: 'button', textContent: '바꾸기' })
    save.addEventListener('click', () => done(inputs.map(i => i.value)))
    const cancel = el('button', { className: 'ghost-btn wide', type: 'button', textContent: '취소' })
    cancel.addEventListener('click', () => done(null))
    const backdrop = el('div', { className: 'sheet-backdrop ask' }, [
      el('div', { className: 'sheet ask-sheet text-sheet' }, [
        el('header', { className: 'sheet-head' }, [el('h2', { textContent: title })]),
        el(
          'div',
          { className: 'sheet-body text-fields' },
          fields.map((f, i) => el('label', { className: 'text-label' }, [el('span', { textContent: f.label }), inputs[i]]))
        ),
        el('footer', { className: 'ask-foot' }, [save, cancel])
      ])
    ])
    window.addEventListener('keydown', onKey)
    document.body.append(backdrop)
    inputs[0]?.focus()
  })
}

export interface Choice<T extends string> {
  value: T
  label: string
  strong?: boolean
}

/** Modal question with a few buttons. Resolves with the chosen value, or null when dismissed. */
export function ask<T extends string>(title: string, message: string, choices: Choice<T>[]): Promise<T | null> {
  return new Promise(resolve => {
    const done = (value: T | null) => {
      backdrop.remove()
      window.removeEventListener('keydown', onKey)
      resolve(value)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(null)
    }
    const buttons = choices.map(c => {
      const b = el('button', { className: c.strong ? 'big-btn' : 'ghost-btn wide', type: 'button', textContent: c.label })
      b.addEventListener('click', () => done(c.value))
      return b
    })
    const backdrop = el('div', { className: 'sheet-backdrop ask' }, [
      el('div', { className: 'sheet ask-sheet' }, [
        el('header', { className: 'sheet-head' }, [el('h2', { textContent: title })]),
        el('p', { className: 'hint ask-text', textContent: message }),
        el('footer', { className: 'ask-foot' }, buttons)
      ])
    ])
    backdrop.setAttribute('role', 'dialog')
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) done(null)
    })
    window.addEventListener('keydown', onKey)
    document.body.append(backdrop)
  })
}
