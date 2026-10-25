import axios from 'https://cdn.skypack.dev/axios';

let telegramInitData = ''
const configuredApiUrl = (window.HADES_API_URL || 'http://api.bot.local').replace(/\/$/, '')
const miniAppApiUrl = window.location.protocol === 'https:' && configuredApiUrl.startsWith('http://')
  ? window.location.origin
  : configuredApiUrl

export const miniAppClient = axios.create({
  baseURL: miniAppApiUrl,
  headers: { Accept: 'application/json' },
  timeout: 15000,
})

export function setTelegramInitData(value) {
  telegramInitData = value || ''
}

miniAppClient.interceptors.request.use((config) => {
  if (telegramInitData) config.headers['X-Telegram-Init-Data'] = telegramInitData
  return config
})
