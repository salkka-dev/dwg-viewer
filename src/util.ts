export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'drawing'
}
