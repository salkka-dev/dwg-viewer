// "앱으로 설치" on the home screen. Edge and Chrome hand over their install
// prompt so the button can open it; Safari on iPad has no prompt, so there
// the button explains Add to Home Screen.

import { $, ask, toast } from './ui'

type InstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let promptEvent: InstallPromptEvent | null = null

const installed = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const appleTouch = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function refresh() {
  $('btn-install').hidden = installed() || (!promptEvent && !appleTouch())
}

export function initInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    // Keep the browser's prompt for our own button.
    e.preventDefault()
    promptEvent = e as InstallPromptEvent
    refresh()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = null
    refresh()
    toast('앱으로 설치했어요. 시작 메뉴나 바탕화면의 도면 뷰어로 열 수 있어요')
  })
  $('btn-install').addEventListener('click', () => void install())
  refresh()
}

async function install() {
  if (promptEvent) {
    const event = promptEvent
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') promptEvent = null
    refresh()
    return
  }
  await ask(
    '아이패드에 설치하기',
    'Safari 위쪽의 공유 버튼(네모에 위쪽 화살표)을 누르고 "홈 화면에 추가"를 고른 뒤 "추가"를 누르세요. 홈 화면에 생긴 도면 뷰어 아이콘으로 열면 앱처럼 전체 화면으로 열려요.',
    [{ value: 'ok', label: '알겠어요', strong: true }]
  )
}
