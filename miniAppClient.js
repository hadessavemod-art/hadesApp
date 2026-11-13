// Lightweight Telegram Mini App API client.
// Uses native fetch: no Axios bundle or build step is required.

const API_BASE_URL = 'https://bot-1792328368-8039-crom.bothost.tech';
let telegramInitData = '';

export function setTelegramInitData(value) {
  telegramInitData = value || '';
}

function appendParams(url, params) {
  if (!params || typeof params !== 'object') return;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
}

async function request(method, path, options = {}) {
  const url = new URL(path, API_BASE_URL);
  appendParams(url, options.params);

  const controller = new AbortController();
  const timeoutMs = Number(options.timeout || 15000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers({ Accept: 'application/json' });
  if (telegramInitData) headers.set('X-Telegram-Init-Data', telegramInitData);

  let body;
  if (options.formData !== undefined) {
    // Let fetch set multipart boundary automatically.
    body = options.formData;
  } else if (options.data !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.data);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { error: text } : {};
    }
    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.response = { status: response.status, data };
      throw error;
    }
    return { data, status: response.status, headers: response.headers };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Превышено время ожидания ответа сервера');
      timeoutError.code = 'ECONNABORTED';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const miniAppClient = {
  defaults: { baseURL: API_BASE_URL, timeout: 15000 },
  get(path, options = {}) {
    return request('GET', path, options);
  },
  post(path, data, options = {}) {
    return request('POST', path, { ...options, data });
  },
  upload(path, formData, options = {}) {
    return request('POST', path, { ...options, formData, timeout: options.timeout || 30000 });
  },
};
