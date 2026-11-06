import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';
const state = {
  userId: 0, role: null, username: '', refLink: '',
  chats: [], chatFilter: 'all', chatSearch: '',
  activeChat: null, messageFilter: 'all', messageSearch: '',
  messageOffset: 0, loadingMessages: false, hasMoreMessages: false,
  currentMedia: null, adminAction: ''
};

const $ = (id) => document.getElementById(id);
const haptic = (kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind); } catch (_) {} };
const alertUser = (message) => { try { tg?.showAlert?.(String(message)); } catch (_) { window.alert(String(message)); } };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate = (value) => {
  if (!value) return '';
  const raw = String(value).trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(raw + (hasTimezone ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return String(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})
    : date.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'});
};
const apiError = (error) => error?.response?.data?.error || error?.message || 'Ошибка сети';

function setPage(name) {
  document.body.classList.toggle('chat-open', name === 'messages');
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name || (['messages'].includes(name) && b.dataset.tab === 'chats') || (['settings','premium','referrals','admin'].includes(name) && b.dataset.tab === 'profile')));
  if (name === 'home') loadStats();
  if (name === 'chats') loadChats();
  if (name === 'settings') loadSettings();
  if (name === 'premium') loadPremium();
  if (name === 'referrals') loadReferrals();
  if (name === 'admin') loadAdminStats();
}
window.switchTab = (name) => {
  if (name === 'admin' && !state.role) return alertUser('У вас нет доступа к админ-панели');
  haptic(); setPage(name);
};

function showPreloader(show) { $('preloader')?.classList.toggle('hidden', !show); }

async function initApp() {
  if (!initData) {
    document.body.innerHTML = '<main class="launch-error">Открой Mini App через бота HadesSave в Telegram.</main>';
    return;
  }
  setTelegramInitData(initData);
  showPreloader(true);
  try {
    const {data} = await miniAppClient.get('/api/miniapp/stats');
    state.userId = Number(data.user_id || 0);
    state.username = data.username || '';
    state.role = data.role || null;
    const name = data.user || 'Пользователь';
    $('user-name').textContent = name;
    $('user-id').textContent = `ID: ${state.userId}`;
    $('profile-name').textContent = name;
    $('profile-id').textContent = `ID: ${state.userId}`;
    $('user-avatar-text').textContent = name.slice(0,1).toUpperCase();
    $('profile-avatar-text').textContent = name.slice(0,1).toUpperCase();
    if (state.username) {
      const url = `https://t.me/i/userpic/320/${encodeURIComponent(state.username)}.jpg`;
      ['user-avatar-img','profile-avatar-img'].forEach(id => {
        const img = $(id); if (!img) return;
        img.onload = () => { img.style.display = 'block'; $(id.replace('-img','-text')).style.display = 'none'; };
        img.onerror = () => { img.style.display = 'none'; };
        img.src = url;
      });
    }
    if (data.is_premium) {
      $('premium-badge')?.classList.remove('hidden');
      $('profile-premium-badge')?.classList.remove('hidden');
      $('premium-status-text').textContent = 'Подписка активна';
      $('premium-action-btn').textContent = 'Продлить подписку';
      if (data.premium_expires_at) startPremiumTimer(data.premium_expires_at);
    } else {
      $('premium-status-text').textContent = 'Подписка не активна';
    }
    if (state.role) {
      for (const id of ['role-badge','profile-role-badge']) {
        const el = $(id); el.textContent = state.role.toUpperCase(); el.className = `role-badge role-${state.role}`; el.classList.remove('hidden');
      }
      $('admin-tab-btn')?.classList.remove('hidden');
    }
    await loadStats();
    setPage('home');
  } catch (error) {
    console.error(error); alertUser(`Не удалось загрузить Mini App: ${apiError(error)}`);
  } finally { showPreloader(false); }
}

let premiumTimer = null;
function startPremiumTimer(expiresAt) {
  clearInterval(premiumTimer);
  const tick = () => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) { $('premium-timer-text').textContent = 'Истёк'; clearInterval(premiumTimer); return; }
    const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    $('premium-timer-text').textContent = `${d}д ${h}ч ${m}м ${s}с`;
  };
  $('premium-timer')?.classList.remove('hidden'); tick(); premiumTimer = setInterval(tick, 1000);
}

async function loadStats() {
  try {
    const {data} = await miniAppClient.get('/api/miniapp/stats');
    $('stat-total').textContent = data.total_messages || 0;
    $('stat-deleted').textContent = data.deleted_messages || 0;
    $('stat-chats').textContent = data.chats_count || 0;
    $('stat-media').textContent = data.media_count || 0;
  } catch (error) { console.warn('stats', error); }
}

// CHAT LIST ---------------------------------------------------------------
window.filterChats = (filter, button) => {
  state.chatFilter = filter;
  document.querySelectorAll('#chat-filter-tabs .chat-tab').forEach(el => el.classList.toggle('active', el === button || el.dataset.filter === filter));
  renderChats();
};
function renderChats() {
  const list = $('chats-list');
  const q = state.chatSearch.trim().toLocaleLowerCase('ru');
  let rows = state.chats.filter(c => {
    if (state.chatFilter === 'deleted' && !Number(c.deleted_count)) return false;
    if (state.chatFilter === 'media' && !Number(c.media_count)) return false;
    // The API can match any historical message, not only the latest preview.
    const matchedByServer = Boolean(q && c.match_query === state.chatSearch.trim());
    return !q || matchedByServer || `${c.label || ''} ${c.last_message || ''} ${c.chat_username || ''}`.toLocaleLowerCase('ru').includes(q);
  });
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="empty-state">Чатов по этому запросу нет</div>'; return; }
  const fragment = document.createDocumentFragment();
  rows.forEach(chat => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'chat-row';
    const title = chat.label || `Чат ${chat.chat_id}`;
    const initials = esc(title.trim().slice(0,1).toUpperCase() || '?');
    const preview = chat.last_message || (chat.last_content_type ? `📎 ${chat.last_content_type}` : 'Нет сообщений');
    item.innerHTML = `<span class="chat-avatar-wrap"><span class="chat-avatar-fallback">${initials}</span><img class="chat-avatar-image" alt="" loading="lazy"></span><span class="chat-main"><strong>${esc(title)}</strong><small>${esc(preview)}</small></span><span class="chat-side"><time>${esc(fmtDate(chat.last_at))}</time><small>${Number(chat.total || 0)} сообщ.</small></span>`;
    const img = item.querySelector('.chat-avatar-image');
    const avatarParams = new URLSearchParams({chat_id:String(chat.chat_id), connection_id:String(chat.connection_id), initData});
    const apiBase = miniAppClient.defaults?.baseURL || '';
    img.addEventListener('load', () => item.querySelector('.chat-avatar-wrap')?.classList.add('has-image'), {once:true});
    img.addEventListener('error', () => {
      if (chat.chat_username && !img.dataset.fallbackTried) {
        img.dataset.fallbackTried = '1';
        img.src = `https://t.me/i/userpic/320/${encodeURIComponent(String(chat.chat_username).replace(/^@/,''))}.jpg`;
      } else {
        img.remove();
      }
    });
    img.src = `${apiBase}/api/miniapp/avatar?${avatarParams.toString()}`;
    item.addEventListener('click', () => openChat(chat)); fragment.appendChild(item);
  });
  list.appendChild(fragment);
}

async function loadChats() {
  $('chats-list').innerHTML = '<div class="empty-state">Загружаю переписки…</div>';
  try {
    const params = {filter:'all'};
    if (state.chatSearch.trim()) params.q = state.chatSearch.trim();
    const {data} = await miniAppClient.get('/api/miniapp/chats', {params});
    state.chats = data.chats || []; renderChats();
  } catch (error) { $('chats-list').innerHTML = `<div class="empty-state">${esc(apiError(error))}</div>`; }
}

// MESSAGES ----------------------------------------------------------------
function setMessageFilter(filter) {
  state.messageFilter = filter;
  const menu = $('message-filter-menu');
  menu?.querySelectorAll('[data-message-filter]').forEach(el => el.classList.toggle('selected', el.dataset.messageFilter === filter));
  menu?.classList.add('hidden');
  loadMessages(false);
}
window.setMessageFilter = setMessageFilter;
async function openChat(chat) {
  state.activeChat = chat; state.messageOffset = 0; state.hasMoreMessages = false; state.messageFilter = 'all'; state.messageSearch = '';
  const title = chat.label || `Чат ${chat.chat_id}`;
  $('chat-title').textContent = title;
  $('chat-subtitle').textContent = `${chat.total || 0} сообщений в архиве`;
  $('chat-header-initial').textContent = title.trim().slice(0, 1).toUpperCase() || '?';
  const avatar = $('chat-header-avatar-image');
  const avatarWrap = $('chat-header-avatar');
  if (avatar && avatarWrap) {
    avatarWrap.classList.remove('has-image');
    avatar.onerror = () => avatarWrap.classList.remove('has-image');
    avatar.onload = () => avatarWrap.classList.add('has-image');
    const avatarParams = new URLSearchParams({chat_id:String(chat.chat_id), connection_id:String(chat.connection_id), initData});
    const apiBase = miniAppClient.defaults?.baseURL || '';
    avatar.src = `${apiBase}/api/miniapp/avatar?${avatarParams.toString()}`;
  }
  $('message-search').value = '';
  $('message-search-wrap')?.classList.add('hidden');
  $('message-filter-menu')?.classList.add('hidden');
  $('message-filter-menu')?.querySelectorAll('[data-message-filter]').forEach(el => el.classList.toggle('selected', el.dataset.messageFilter === 'all'));
  setPage('messages');
  await loadMessages(false);
}
function messageHtml(msg) {
  const outgoing = Boolean(msg.is_outgoing || msg.direction === 'outgoing');
  const isSticker = msg.content_type === 'sticker';
  const cls = ['message-bubble', outgoing ? 'outgoing' : 'incoming', isSticker ? 'has-sticker' : '', msg.deleted ? 'is-deleted' : '', msg.edited ? 'is-edited' : ''].filter(Boolean).join(' ');
  const replyId = Number(msg.reply_to_message_id || 0);
  const replyHtml = replyId ? `<button class="reply-preview" type="button" data-reply-to="${replyId}"><strong>${esc(msg.reply_to_sender_name || 'Ответ на сообщение')}</strong><span>${esc(msg.reply_to_text || `Сообщение #${replyId}`)}</span></button>` : '';
  // Keep the actual archived content visible. Status is only a small icon
  // in the footer, never a separate 'deleted/edited' placeholder bubble.
  // Sticker messages are stored with a descriptive text fallback in SQLite.
  // Do not show that label on top of the actual sticker artwork.
  let body = isSticker ? '' : esc(msg.text || '');
  let media = '';
  let mediaUrl = '';
  if (msg.has_media) {
    const params = new URLSearchParams({chat_id: state.activeChat.chat_id, connection_id: state.activeChat.connection_id, message_id: msg.message_id, initData});
    const apiBase = miniAppClient.defaults?.baseURL || '';
    const url = `${apiBase}/api/miniapp/media?${params.toString()}`;
    mediaUrl = url;
    const type = msg.content_type;
    if (type === 'sticker') {
      const ext = String(msg.media_ext || '').toLowerCase();
      const format = ext === '.tgs' ? 'tgs' : (ext === '.webm' ? 'webm' : 'webp');
      if (format === 'tgs') {
        media = `<div class="message-sticker-tgs" data-sticker-url="${url}" role="img" aria-label="Анимированный стикер"></div>`;
      } else if (format === 'webm') {
        media = `<video class="message-sticker-video" src="${url}" autoplay loop muted playsinline preload="auto" aria-label="Анимированный стикер"></video>`;
      } else {
        media = `<img class="message-sticker-image" src="${url}" alt="Стикер" loading="lazy" decoding="async" draggable="false">`;
      }
    } else if (type === 'photo') {
      media = `<img class="message-media" src="${url}" alt="Фото" loading="lazy" data-media-url="${url}" data-media-type="${type}" data-mid="${msg.message_id}">`;
    } else if (type === 'video_note') {
      media = `<video class="message-media message-video-note" src="${url}" controls playsinline preload="metadata"></video>`;
    } else if (['video','animation'].includes(type)) {
      media = `<video class="message-media" src="${url}" controls playsinline preload="metadata"></video>`;
    } else if (['voice','audio'].includes(type)) {
      media = `<audio class="message-audio" src="${url}" controls preload="metadata"></audio>`;
    } else {
      media = `<div class="document-preview"><span class="document-preview-icon">▤</span><span class="document-preview-name">${esc(msg.file_name || 'Документ')}</span><span class="document-preview-type">${esc((msg.media_ext || '').replace('.', '').toUpperCase() || 'ФАЙЛ')}</span></div>`;
    }
  } else if (!body && msg.content_type && msg.content_type !== 'text') {
    const missingMediaLabels = {photo:'📷 Фото не сохранилось',video:'🎬 Видео не сохранилось',video_note:'⭕ Видеокружок не сохранился',voice:'🎤 Голосовое не сохранилось',audio:'🎵 Аудио не сохранилось',animation:'🎞 GIF не сохранился',document:'📎 Файл не сохранился',sticker:'🎭 Стикер не сохранился'};
    body = esc(missingMediaLabels[msg.content_type] || 'Вложение недоступно');
  }
  const archiveMarker = msg.deleted
    ? `<svg class="msg-state deleted-icon" viewBox="0 0 24 24" role="img" aria-label="Удалено"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>`
    : msg.edited
      ? `<button class="history-button" type="button" title="Показать историю изменений" aria-label="История изменений" data-history="${Number(msg.message_id)}"><svg class="msg-state edit-icon" viewBox="0 0 24 24" role="img" aria-label="Изменено"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : '';
  const sentTicks = outgoing ? `<svg class="telegram-ticks" viewBox="0 0 18 14" aria-label="Отправлено"><path d="m1 7 4 4L14 2M7 7l4 4 6-7"/></svg>` : '';
  return `<article class="${cls}" data-message-id="${Number(msg.message_id)}">${replyHtml}${body ? `<div class="message-text">${body.replace(/\n/g,'<br>')}</div>` : ''}${media ? `<div class="message-attachment">${media}</div>` : ''}<footer class="message-footer"><time>${esc(fmtDate(msg.sent_at || msg.updated_at))}</time>${archiveMarker}${sentTicks}</footer></article>`;
}

// Telegram animated stickers use .tgs (gzip-compressed Lottie JSON).
// Load the lightweight renderer only when a TGS sticker is actually present.
let lottieLoaderPromise;
let pakoLoaderPromise;
function loadExternalScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    // Always create a new tag: the second CDN is a real retry, not another
    // listener attached to the first failed script element.
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.hsLibrary = globalName;
    script.onload = () => {
      script.dataset.loaded = '1';
      window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} did not initialize`));
    };
    script.onerror = () => reject(new Error(`Unable to load ${globalName}`));
    document.head.appendChild(script);
  });
}
async function ensureLottie() {
  if (window.lottie) return window.lottie;
  if (!lottieLoaderPromise) {
    lottieLoaderPromise = loadExternalScript(
      'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js', 'lottie'
    ).catch(() => loadExternalScript(
      'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js', 'lottie'
    ));
  }
  return lottieLoaderPromise;
}
async function gunzipTgs(buffer) {
  if ('DecompressionStream' in window) {
    try {
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch (error) {
      console.warn('[HadesSave] Native TGS decompression failed, trying pako:', error);
    }
  }
  if (!pakoLoaderPromise) {
    pakoLoaderPromise = loadExternalScript(
      'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js', 'pako'
    ).catch(() => loadExternalScript(
      'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'pako'
    ));
  }
  const pako = await pakoLoaderPromise;
  return new TextDecoder().decode(pako.ungzip(new Uint8Array(buffer)));
}
async function hydrateTgsStickers(root = document) {
  const players = root.querySelectorAll('.message-sticker-tgs:not([data-player-state])');
  if (!players.length) return;
  for (const host of players) {
    host.dataset.playerState = 'loading';
    try {
      const lottie = await ensureLottie();
      const response = await fetch(host.dataset.stickerUrl, {cache: 'force-cache'});
      if (!response.ok) throw new Error(`Sticker request failed: HTTP ${response.status}`);
      const text = await gunzipTgs(await response.arrayBuffer());
      const animationData = JSON.parse(text);
      lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData,
        rendererSettings: {preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true}
      });
      host.dataset.playerState = 'ready';
    } catch (error) {
      console.warn('[HadesSave] Could not render animated sticker:', error);
      host.dataset.playerState = 'error';
      host.innerHTML = '<span class="sticker-unavailable">Стикер недоступен</span>';
      host.setAttribute('aria-label', 'Стикер недоступен');
    }
  }
}

async function loadMessages(append = false) {
  if (!state.activeChat || state.loadingMessages) return;
  state.loadingMessages = true;
  const list = $('messages-list');
  if (!append) { list.innerHTML = '<div class="empty-state">Загружаю сообщения…</div>'; state.messageOffset = 0; }
  const oldHeight = list.scrollHeight;
  try {
    const params = {
      chat_id: state.activeChat.chat_id,
      connection_id: state.activeChat.connection_id,
      filter: state.messageFilter,
      offset: state.messageOffset,
      limit: 50
    };
    if (state.messageSearch.trim()) params.q = state.messageSearch.trim();
    const {data} = await miniAppClient.get('/api/miniapp/messages', {params});
    const rows = (data.messages || []).slice().reverse();
    const html = rows.map(messageHtml).join('');
    if (!append) list.innerHTML = html || '<div class="empty-state">Сообщений не найдено</div>';
    else if (html) list.insertAdjacentHTML('afterbegin', html);
    hydrateTgsStickers(list);
    state.messageOffset = data.next_offset ?? (state.messageOffset + (data.messages || []).length);
    state.hasMoreMessages = data.next_offset !== null && data.next_offset !== undefined;
    if (!append) list.scrollTop = list.scrollHeight;
    else list.scrollTop = list.scrollHeight - oldHeight;
  } catch (error) {
    if (!append) list.innerHTML = `<div class="empty-state">${esc(apiError(error))}</div>`;
  } finally { state.loadingMessages = false; }
}

async function showEditHistory(messageId) {
  if (!state.activeChat) return;
  try {
    const {data} = await miniAppClient.get('/api/miniapp/message_versions', {params:{
      chat_id:state.activeChat.chat_id, connection_id:state.activeChat.connection_id, message_id:messageId
    }});
    const versions = data.versions || [];
    const body = versions.length ? versions.map((v,i) => `<section class="history-entry"><small>Изменение ${i+1} · ${esc(fmtDate(v.changed_at))}</small><div class="history-label">Было</div><p>${esc(v.old_text || 'Пусто')}</p><div class="history-label">Стало</div><p>${esc(v.new_text || 'Пусто')}</p></section>`).join('') : '<p class="empty-state">История изменений не найдена.</p>';
    $('history-body').innerHTML = body; $('history-modal').classList.add('active');
  } catch (error) { alertUser(`Не удалось загрузить историю: ${apiError(error)}`); }
}
window.closeHistory = () => $('history-modal').classList.remove('active');

$('messages-list')?.addEventListener('error', (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.classList.contains('message-sticker-image')) {
    const fallback = document.createElement('div');
    fallback.className = 'sticker-unavailable';
    fallback.textContent = 'Стикер недоступен';
    target.replaceWith(fallback);
  } else if (target instanceof HTMLVideoElement && target.classList.contains('message-sticker-video')) {
    const fallback = document.createElement('div');
    fallback.className = 'sticker-unavailable';
    fallback.textContent = 'Стикер недоступен';
    target.replaceWith(fallback);
  }
}, true);

$('messages-list')?.addEventListener('scroll', () => {
  if ($('messages-list').scrollTop < 70 && state.hasMoreMessages && !state.loadingMessages) loadMessages(true);
});
let chatSearchTimer;
$('chat-search')?.addEventListener('input', (e) => {
  state.chatSearch = e.target.value;
  clearTimeout(chatSearchTimer);
  chatSearchTimer = setTimeout(loadChats, 300);
});
$('toggle-message-search')?.addEventListener('click', () => {
  const wrap = $('message-search-wrap');
  if (!wrap) return;
  $('message-filter-menu')?.classList.add('hidden');
  wrap.classList.toggle('hidden');
  if (!wrap.classList.contains('hidden')) $('message-search')?.focus();
  else {
    $('message-search').value = '';
    state.messageSearch = '';
    loadMessages(false);
  }
});
$('close-message-search')?.addEventListener('click', () => {
  $('message-search-wrap')?.classList.add('hidden');
  $('message-search').value = '';
  state.messageSearch = '';
  loadMessages(false);
});
$('toggle-message-menu')?.addEventListener('click', (event) => {
  event.stopPropagation();
  $('message-filter-menu')?.classList.toggle('hidden');
  $('message-search-wrap')?.classList.add('hidden');
});
$('message-filter-menu')?.addEventListener('click', (event) => {
  const option = event.target.closest('[data-message-filter]');
  if (option) setMessageFilter(option.dataset.messageFilter);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.telegram-chat-header')) $('message-filter-menu')?.classList.add('hidden');
});

let messageSearchTimer;
$('message-search')?.addEventListener('input', () => {
  clearTimeout(messageSearchTimer); messageSearchTimer = setTimeout(() => { state.messageSearch = $('message-search').value; loadMessages(false); }, 350);
});
$('messages-list')?.addEventListener('click', async (event) => {
  const reply = event.target.closest('[data-reply-to]');
  if (reply) {
    const targetId = Number(reply.dataset.replyTo);
    const target = $('messages-list').querySelector(`[data-message-id="${targetId}"]`);
    if (target) {
      target.scrollIntoView({behavior:'smooth', block:'center'});
      target.classList.add('reply-highlight');
      setTimeout(() => target.classList.remove('reply-highlight'), 1300);
    } else if (state.activeChat) {
      try {
        const params = {chat_id:state.activeChat.chat_id, connection_id:state.activeChat.connection_id,
          filter:'all', offset:0, limit:50, around_message_id:targetId};
        const {data} = await miniAppClient.get('/api/miniapp/messages', {params});
        const rows = (data.messages || []).slice().reverse();
        $('messages-list').innerHTML = rows.map(messageHtml).join('') || '<div class="empty-state">Сообщение не найдено</div>';
        hydrateTgsStickers($('messages-list'));
        state.messageOffset = data.next_offset ?? rows.length;
        state.hasMoreMessages = data.next_offset !== null && data.next_offset !== undefined;
        requestAnimationFrame(() => {
          const found = $('messages-list').querySelector(`[data-message-id="${targetId}"]`);
          if (found) { found.scrollIntoView({behavior:'smooth',block:'center'}); found.classList.add('reply-highlight'); setTimeout(() => found.classList.remove('reply-highlight'),1300); }
        });
      } catch (error) { alertUser(`Не удалось открыть сообщение: ${apiError(error)}`); }
    }
    return;
  }
  const history = event.target.closest('[data-history]');
  if (history) { showEditHistory(Number(history.dataset.history)); return; }
  const mediaTarget = event.target.closest('[data-media-url]');
  if (mediaTarget && !event.target.closest('audio')) openLightbox(mediaTarget.dataset.mediaUrl, mediaTarget.dataset.mediaType, Number(mediaTarget.dataset.mid));
});

// MEDIA VIEWER ------------------------------------------------------------
function openLightbox(url, type, messageId) {
  state.currentMedia = {messageId, chat:state.activeChat};
  const box = $('lightbox-media-container'); box.innerHTML = '';
  let node;
  if (type === 'photo') { node = document.createElement('img'); node.src = url; node.className = 'lightbox-photo'; }
  else if (['video','video_note','animation'].includes(type)) { node = document.createElement('video'); node.src = url; node.controls = true; node.autoplay = true; node.playsInline = true; if (type === 'video_note') node.className = 'lightbox-video-note'; }
  else if (['voice','audio'].includes(type)) { node = document.createElement('audio'); node.src = url; node.controls = true; node.autoplay = true; }
  else { node = document.createElement('div'); node.textContent = 'Предпросмотр недоступен'; }
  box.appendChild(node); $('media-lightbox').classList.add('active'); haptic();
}
window.closeLightbox = (event) => {
  if (event && event.target !== $('media-lightbox') && !event.target.closest('button')) return;
  $('lightbox-media-container').querySelectorAll('video,audio').forEach(m => {m.pause();m.removeAttribute('src');m.load();});
  $('lightbox-media-container').innerHTML = ''; $('media-lightbox').classList.remove('active'); state.currentMedia = null;
};
// SETTINGS / ARCHIVE ------------------------------------------------------
async function loadSettings() {
  try {
    const {data} = await miniAppClient.get('/api/miniapp/settings');
    $('toggle-edits').checked = Boolean(data.edits); $('toggle-deletions').checked = Boolean(data.deletions); $('toggle-media').checked = Boolean(data.deleted_media);
  } catch (error) { console.warn(error); }
}
window.updateSetting = async (key, value) => {
  try { await miniAppClient.post('/api/miniapp/settings', {[key]:value}); haptic(); }
  catch (error) { alertUser(apiError(error)); }
};
window.clearArchive = () => {
  const confirmClear = async () => {
    try { const {data} = await miniAppClient.post('/api/miniapp/clear_archive'); alertUser(data.message || 'Архив очищен'); await loadStats(); await loadChats(); }
    catch (error) { alertUser(apiError(error)); }
  };
  if (tg?.showPopup) tg.showPopup({title:'Очистить архив?',message:'Все сообщения и сохранённые медиа будут удалены без возможности восстановления.',buttons:[{id:'cancel',type:'cancel'},{id:'delete',type:'destructive',text:'Удалить'}]}, id => {if(id==='delete') confirmClear();});
  else if (window.confirm('Удалить весь архив без возможности восстановления?')) confirmClear();
};

// PREMIUM / REFERRALS -----------------------------------------------------
async function loadPremium() {
  try { const {data} = await miniAppClient.get('/api/miniapp/stats'); $('premium-status-text').textContent = data.is_premium ? 'Подписка активна' : 'Подписка не активна'; }
  catch (_) {}
}
async function loadReferrals() {
  try { const {data} = await miniAppClient.get('/api/miniapp/referrals'); state.refLink = data.link || ''; $('ref-count').textContent = data.count || 0; }
  catch (error) { console.warn(error); }
}
window.copyRefLink = async () => {
  if (!state.refLink) return;
  try { await navigator.clipboard.writeText(state.refLink); alertUser('Ссылка скопирована'); }
  catch (_) { alertUser(state.refLink); }
};
const FEATURE_INFO = {
  archive:['Безлимитный архив','Срок хранения сообщений увеличивается с 3 до 30 дней.'],
  priority:['Приоритетное сохранение','Твои файлы и медиа удаляются последними при очистке сервера.'],
  mirrors:['До 5 зеркал','Возможность создать несколько зеркал бота.'],
  spam:['Увеличенный .spam','Повышенный лимит команды рассылки.'],
  badge:['Уникальный значок','Эксклюзивная корона в профиле Mini App.'],
  support:['Приоритетная поддержка','Приоритетная обработка обращения.'],
  media:['Увеличенный лимит медиа','Увеличенный лимит сохранения файлов.']
};
window.openFeatureModal = (key) => { const row=FEATURE_INFO[key]; if(!row)return; $('feature-title').textContent=row[0]; $('feature-desc').textContent=row[1]; $('feature-modal').classList.add('active'); };
window.closeFeatureModal = (event) => { if(event && event.target!==$('feature-modal') && !event.target.closest('button')) return; $('feature-modal').classList.remove('active'); };

// ADMIN -------------------------------------------------------------------
async function loadAdminStats() {
  if (!state.role) return;
  try {
    const {data} = await miniAppClient.get('/api/miniapp/admin/stats');
    $('adm-stat-users').textContent=data.users||0; $('adm-stat-stars').textContent=data.total_stars||0;
    $('adm-stat-prem').textContent=data.premium||0; $('adm-stat-week').textContent=data.week_premium||0;
  } catch(error) { alertUser(apiError(error)); }
}
window.openAdminModal = async (action) => {
  if (!state.role) return;
  state.adminAction=action; $('admin-modal').classList.add('active');
  ['admin-input-fields','admin-broadcast-fields','admin-list-container','admin-grant-fields','admin-ban-fields','admin-role-fields'].forEach(id => { const el=$(id); if(el)el.style.display='none'; });
  $('admin-execute-btn').style.display='block';
  const titles={grant:'Выдать Premium',ban:'Забанить',role:'Управление ролью',broadcast:'Рассылка',bans:'Бан-лист'};
  $('admin-modal-title').textContent=titles[action]||'Администрирование';
  if (['grant','ban','role'].includes(action)) $('admin-input-fields').style.display='block';
  if (action==='grant') $('admin-grant-fields').style.display='block';
  if (action==='ban') $('admin-ban-fields').style.display='block';
  if (action==='role') $('admin-role-fields').style.display='block';
  if (action==='broadcast') $('admin-broadcast-fields').style.display='block';
  if (action==='bans') {
    $('admin-list-container').style.display='block'; $('admin-execute-btn').style.display='none';
    try {
      const {data}=await miniAppClient.get('/api/miniapp/admin/bans');
      $('admin-list-container').innerHTML=(data.bans||[]).map(b=>`<div class="ban-row"><b>${esc(b.user_id)} ${b.username?'@'+esc(b.username):''}</b><p>${esc(b.reason)}</p><small>${esc(b.banned_at||'')}</small></div>`).join('')||'<p class="empty-state">Бан-лист пуст</p>';
    } catch(error) { $('admin-list-container').textContent=apiError(error); }
  }
};
window.closeAdminModal = (event) => { if(event && event.target!==$('admin-modal') && !event.target.closest('button'))return; $('admin-modal').classList.remove('active'); };
window.executeAdminAction = async () => {
  if (!state.role) return;
  const btn=$('admin-execute-btn'), old=btn.textContent; btn.disabled=true; btn.textContent='Выполняется…';
  try {
    let result;
    if (state.adminAction==='grant') result=await miniAppClient.post('/api/miniapp/admin/grant',{target:$('admin-target').value.trim(),days:Number($('admin-days').value||30)});
    else if(state.adminAction==='ban') result=await miniAppClient.post('/api/miniapp/admin/ban',{target:$('admin-target').value.trim(),reason:$('admin-reason').value.trim()||'Без причины'});
    else if(state.adminAction==='role') result=await miniAppClient.post('/api/miniapp/admin/roles',{target:$('admin-target').value.trim(),role:$('admin-role-select').value});
    else if(state.adminAction==='broadcast') result=await miniAppClient.post('/api/miniapp/admin/broadcast',{text:$('admin-broadcast-text').value.trim()});
    if(result) alertUser(result.data.message||'Готово'); closeAdminModal(); loadAdminStats();
  } catch(error) { alertUser(apiError(error)); }
  finally {btn.disabled=false;btn.textContent=old;}
};

// Global browser Back button in Telegram
try { tg?.BackButton?.onClick(() => { if ($('history-modal').classList.contains('active')) closeHistory(); else if ($('media-lightbox').classList.contains('active')) closeLightbox(); else if ($('view-messages').classList.contains('active')) setPage('chats'); else setPage('home'); }); } catch (_) {}
initApp();
