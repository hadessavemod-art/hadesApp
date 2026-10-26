import axios from 'https://cdn.skypack.dev/axios';

let telegramInitData = ''

// Твой реальный адрес сервера на Bothost
const miniAppApiUrl = 'https://bot-1792328368-8039-crom.bothost.tech';

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
