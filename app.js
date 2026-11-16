import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';
const DEMO = !initData;
const LS = 'hadessave.ui.v2';

const state = {
  userId: 0, username: '', refLink: '', hasPermanentAccess: false, role: null,
  isAdmin: false, profilePrefix: null, prefixes: [], adminAction: '', editingPrefixId: 0,
  chats: [], chatSearch: '', activeChat: null, messageSearch: '',
  messageOffset: 0, loadingMessages: false, hasMoreMessages: false,
  currentMedia: null, selectedPremiumDays: 14, paymentMethod: 2,
  filter: 'all', sort: 'recent', activeViewId: 0,
  bulk: false, selected: new Set(), pinned: [], hidden: [], views: [],
  prefs: { theme: 'midnight', accent: 'sapphire', density: 'cozy', preview: true, counter: true },
  stats: null, dragId: null
};

const $ = (id) => document.getElementById(id);
const haptic = (k = 'light') => { try { tg?.HapticFeedback?.impactOccurred(k); } catch (_) {} };
const alertUser = (m) => { try { tg?.showAlert?.(String(m)); } catch (_) { window.alert(String(m)); } };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => Number(v || 0).toLocaleString('ru-RU');
const demoBlock = () => { if (DEMO) { toast('Демо в браузере', 'Действия с сервером работают в Telegram', 'info'); return true; } return false; };

const THEMES = { midnight: 'Midnight', obsidian: 'Obsidian', abyss: 'Abyss', plum: 'Plum', forest: 'Forest', dune: 'Dune' };
const ACCENTS = { sapphire: 'Сапфир', gold: 'Золото', cyan: 'Циан', magenta: 'Магента', lime: 'Лайм', violet: 'Фиолет' };
const THEME_COLORS = { midnight: '#070a12', obsidian: '#0a0a0d', abyss: '#04121a', plum: '#130a1e', forest: '#071410', dune: '#15100a' };

/* ── локальные настройки ───────────────────────────────────────────────── */
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || '{}');
    state.pinned = Array.isArray(raw.pinned) ? raw.pinned : [];
    state.hidden = Array.isArray(raw.hidden) ? raw.hidden : [];
    state.views = Array.isArray(raw.views) ? raw.views : [];
    state.prefs = { ...state.prefs, ...(raw.prefs || {}) };
    state.sort = raw.sort || 'recent';
  } catch (_) {}
}
function saveLocal() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      pinned: state.pinned, hidden: state.hidden, views: state.views,
      prefs: state.prefs, sort: state.sort
    }));
  } catch (_) {}
}
function applyAppearance() {
  document.body.dataset.theme = state.prefs.theme;
  document.body.dataset.accent = state.prefs.accent;
  document.body.dataset.density = state.prefs.density;
  document.body.classList.toggle('hide-preview', !state.prefs.preview);
  document.body.classList.toggle('hide-counter', !state.prefs.counter);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[state.prefs.theme] || '#070a12');
  document.querySelectorAll('.theme-tile').forEach(t => t.classList.toggle('active', t.dataset.theme === state.prefs.theme));
  document.querySelectorAll('.accent-dot').forEach(t => t.classList.toggle('active', t.dataset.accent === state.prefs.accent));
  if ($('density-select')) $('density-select').value = state.prefs.density;
  if ($('toggle-preview')) $('toggle-preview').checked = state.prefs.preview;
  if ($('toggle-counter')) $('toggle-counter').checked = state.prefs.counter;
}
window.setTheme = (v) => {
  if (!THEMES[v]) return;
  state.prefs.theme = v; applyAppearance(); saveLocal(); haptic('medium');
  toast('Тема применена', THEMES[v], 'gold');
};
window.setAccent = (v) => {
  if (!ACCENTS[v]) return;
  state.prefs.accent = v; applyAppearance(); saveLocal(); haptic();
  toast('Акцент обновлён', ACCENTS[v], 'gold');
};
window.setDensity = (v) => { state.prefs.density = v; applyAppearance(); saveLocal(); haptic(); };
window.setPreviewVisible = (v) => { state.prefs.preview = v; applyAppearance(); saveLocal(); };
window.setCounterVisible = (v) => { state.prefs.counter = v; applyAppearance(); saveLocal(); };
window.resetLocalPreferences = () => {
  state.pinned = []; state.hidden = []; state.views = []; state.activeViewId = 0;
  state.filter = 'all'; state.sort = 'recent';
  saveLocal(); renderViews(); syncToolbar(); renderChats();
  toast('Вид архива сброшен', 'Закрепления и пресеты очищены', 'green');
};

/* ── тосты ─────────────────────────────────────────────────────────────── */
function toast(title, sub, tone = 'info', action) {
  const stack = $('toast-stack'); if (!stack) return;
  const icons = { info: 'i-info', green: 'i-check-circle', rose: 'i-trash', gold: 'i-sparkles' };
  const el = document.createElement('div');
  el.className = `toast tone-${tone}`;
  el.innerHTML = `<span class="toast-icon"><svg class="icon"><use href="#${icons[tone] || 'i-info'}"></use></svg></span>
    <span class="toast-copy">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
  const dismiss = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 260); };
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action'; btn.textContent = action.label;
    btn.onclick = () => { action.run(); dismiss(); };
    el.appendChild(btn);
  }
  stack.appendChild(el);
  setTimeout(dismiss, action ? 6000 : 3000);
}

/* ── демо-данные ───────────────────────────────────────────────────────── */
const NOW = Date.now(), H = 3600000, D = 86400000;
function demoSvg(a, b, label) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><circle cx="360" cy="80" r="52" fill="#fff" opacity=".16"/><path d="M0 268 L120 196 L228 258 L330 176 L480 250 L480 360 L0 360Z" fill="#000" opacity=".22"/><path d="M0 300 L140 240 L260 296 L380 232 L480 288 L480 360 L0 360Z" fill="#000" opacity=".26"/><text x="24" y="336" font-family="Inter,sans-serif" font-size="17" fill="#fff" opacity=".72">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
const DEMO_STICKER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c451"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs><path d="M88 152C40 118 20 92 20 66a34 34 0 0 1 68-14 34 34 0 0 1 68 14c0 26-20 52-68 86z" fill="url(#s)"/><circle cx="62" cy="62" r="7" fill="#fff" opacity=".8"/></svg>`);
const DEMO_PROFILE = {
  user: 'FLEX', user_id: 7831720836, username: '', is_admin: true, role: 'owner',
  is_premium: true, has_permanent_access: false,
  premium_expires_at: new Date(NOW + 12 * D + 5 * H).toISOString(),
  premium_payment_ready: true, premium_crypto_enabled: false,
  profile_prefix: { name: 'VIP', color: '#f5c451' }, profile_status: 'архив с 2024',
  total_messages: 12480, deleted_messages: 342, chats_count: 12, media_count: 1204
};
const DEMO_CHATS = [
  { chat_id: 901, connection_id: 1, kind: 'private', label: 'Аня Соколова', chat_username: 'anya', last_message: 'Ну если в копилке лежат валяются 😄', last_at: new Date(NOW - 40 * 60000).toISOString(), first_at: new Date(NOW - 94 * D).toISOString(), total: 214, unread: 3, deleted: 6, edited: 4, media: 38 },
  { chat_id: 902, connection_id: 1, kind: 'private', label: 'Макс', last_message: 'Скинь трек, который вчера играл', last_at: new Date(NOW - 3 * H).toISOString(), first_at: new Date(NOW - 41 * D).toISOString(), total: 87, unread: 1, deleted: 2, edited: 1, media: 12 },
  { chat_id: 903, connection_id: 1, kind: 'group', label: 'Работа · продукт', last_message: '', last_content_type: 'photo', last_at: new Date(NOW - 5 * H).toISOString(), first_at: new Date(NOW - 210 * D).toISOString(), total: 1530, unread: 24, deleted: 41, edited: 18, media: 260 },
  { chat_id: 904, connection_id: 1, kind: 'private', label: 'Лена', last_message: 'Договорились, до пятницы!', last_at: new Date(NOW - 26 * H).toISOString(), first_at: new Date(NOW - 63 * D).toISOString(), total: 452, unread: 0, deleted: 9, edited: 6, media: 74 },
  { chat_id: 905, connection_id: 1, kind: 'group', label: 'Hades · команда', last_message: 'Релиз уехал в прод 🚀', last_at: new Date(NOW - 30 * H).toISOString(), first_at: new Date(NOW - 320 * D).toISOString(), total: 3820, unread: 0, deleted: 88, edited: 52, media: 410 },
  { chat_id: 906, connection_id: 1, kind: 'private', label: '+7 900 123-45-67', last_message: 'Ага', last_at: new Date(NOW - 3 * D).toISOString(), first_at: new Date(NOW - 11 * D).toISOString(), total: 12, unread: 0, deleted: 0, edited: 0, media: 0 },
  { chat_id: 907, connection_id: 1, kind: 'channel', label: 'Дизайн-дайджест', last_message: '', last_content_type: 'document', last_at: new Date(NOW - 4 * D).toISOString(), first_at: new Date(NOW - 150 * D).toISOString(), total: 640, unread: 12, deleted: 3, edited: 22, media: 180 },
  { chat_id: 908, connection_id: 1, kind: 'private', label: 'Илья (фитнес)', last_message: '', last_content_type: 'voice', last_at: new Date(NOW - 5 * D).toISOString(), first_at: new Date(NOW - 30 * D).toISOString(), total: 96, unread: 0, deleted: 1, edited: 0, media: 24 },
  { chat_id: 909, connection_id: 1, kind: 'group', label: 'Соседи · подъезд 2', last_message: 'Кто забрал коляску с площадки?', last_at: new Date(NOW - 7 * D).toISOString(), first_at: new Date(NOW - 400 * D).toISOString(), total: 2140, unread: 0, deleted: 63, edited: 9, media: 96 },
  { chat_id: 910, connection_id: 1, kind: 'private', label: 'Мама', last_message: 'Позвони как освободишься ❤️', last_at: new Date(NOW - 9 * D).toISOString(), first_at: new Date(NOW - 500 * D).toISOString(), total: 1820, unread: 0, deleted: 4, edited: 3, media: 210 },
  { chat_id: 911, connection_id: 1, kind: 'private', label: 'Кирилл', last_message: '', last_content_type: 'sticker', last_at: new Date(NOW - 12 * D).toISOString(), first_at: new Date(NOW - 70 * D).toISOString(), total: 340, unread: 0, deleted: 12, edited: 5, media: 66 },
  { chat_id: 912, connection_id: 1, kind: 'group', label: 'Настолки по четвергам', last_message: 'В этот четверг у меня, приносите колу', last_at: new Date(NOW - 16 * D).toISOString(), first_at: new Date(NOW - 260 * D).toISOString(), total: 780, unread: 0, deleted: 15, edited: 7, media: 48 }
];
const AV_COLORS = [['#3d6bd6', '#1e2f5c'], ['#8b5cf6', '#3b2470'], ['#0ea5c4', '#0d3b4a'], ['#f59e0b', '#5a3a08'], ['#ec4899', '#5c1f3c'], ['#22c55e', '#12401f'], ['#6366f1', '#252a63'], ['#14b8a6', '#0c3f3a']];
function avColors(id) { return AV_COLORS[Math.abs(Number(id)) % AV_COLORS.length]; }
function demoMessages(chat) {
  const t = chat.chat_id, base = NOW - 2 * D;
  const rows = [
    { id: t * 100 + 1, text: 'Слушай, ты видел что он удалил? 👀', out: false, at: base },
    { id: t * 100 + 2, text: 'Видел. У меня всё сохранено 😎', out: true, at: base + 4 * 60000, read: true },
    { id: t * 100 + 3, text: 'ой, не туда отправил', out: false, at: base + 9 * 60000, deleted: true },
    { id: t * 100 + 4, text: 'Вот так это и работает — архив помнит всё', out: true, at: base + 12 * 60000, read: true, reply: t * 100 + 3, replyName: chat.label, replyText: 'ой, не туда отправил' },
    { id: t * 100 + 5, type: 'photo', text: 'Смотри какой закат вчера был', out: false, at: base + 40 * 60000, media: demoSvg('#f59e0b', '#ec4899', 'sunset.jpg') },
    { id: t * 100 + 6, text: 'Огонь 🔥 где это?', out: true, at: base + 44 * 60000, read: true },
    { id: t * 100 + 7, text: 'На набережной, у моста', out: false, at: base + 47 * 60000 },
    { id: t * 100 + 8, type: 'sticker', out: false, at: base + 50 * 60000, media: DEMO_STICKER },
    { id: t * 100 + 9, text: 'Кстати, скинь фотки с выходных', out: true, at: NOW - 5 * H, edited: true, read: true },
    { id: t * 100 + 10, text: 'Сейчас найду, там их штук двести 📸', out: false, at: NOW - 4.6 * H, reply: t * 100 + 9, replyName: 'FLEX', replyText: 'Кстати, скинь фотки с выходных' },
    { id: t * 100 + 11, type: 'document', out: false, at: NOW - 4.2 * H, file: 'отчёт-встреча.pdf', ext: '.pdf' },
    { id: t * 100 + 12, type: 'voice', out: false, at: NOW - 3.4 * H },
    { id: t * 100 + 13, type: 'video_note', out: true, at: NOW - 2.2 * H, read: true, media: demoSvg('#4d84ff', '#22d3ee', 'video note') },
    { id: t * 100 + 14, text: chat.last_message || 'До связи!', out: false, at: NOW - 45 * 60000 }
  ];
  return rows.map(r => ({
    message_id: r.id, connection_id: chat.connection_id, text: r.text || '',
    sent_at: new Date(r.at).toISOString(), is_outgoing: r.out, is_read: !!r.read,
    deleted: !!r.deleted, edited: !!r.edited,
    reply_to_message_id: r.reply || 0, reply_to_sender_name: r.replyName || '', reply_to_text: r.replyText || '',
    content_type: r.type || 'text', has_media: !!r.media || ['document', 'voice', 'video_note'].includes(r.type),
    media_ext: r.ext || (r.type === 'sticker' ? '.webp' : r.type === 'video_note' ? '.mp4' : ''),
    file_name: r.file || '', demo_media: r.media || ''
  }));
}
const DEMO_ACTIVITY = [
  { icon: 'i-trash', tone: 'rose', title: 'Удалено сообщение', sub: 'Аня Соколова · «ой, не туда отправил»', at: NOW - 40 * 60000 },
  { icon: 'i-edit', tone: 'amber', title: 'Сообщение изменено', sub: 'Работа · продукт · правка текста', at: NOW - 3 * H },
  { icon: 'i-image', tone: 'cyan', title: 'Сохранено 6 фото', sub: 'Hades · команда', at: NOW - 5 * H },
  { icon: 'i-gem', tone: 'gold', title: 'Premium продлён', sub: 'ещё 12 дней архива', at: NOW - 26 * H }
];
const DEMO_ADMIN_STATS = { users: 4210, total_stars: 18750, premium: 316, week_premium: 42 };
const DEMO_ADMIN_FULL = {
  summary: { users: 4210, active_users: 2874, connections: 3560, active_connections: 2412, messages: 184520, chats: 9410, media: 23840, deleted: 5120, edited: 3480, premium: 316, referrals: 890, referrals_rewarded: 640, referrals_pending: 250, payments: 428, stars: 18750 },
  daily: Array.from({ length: 14 }, (_, i) => ({ date: new Date(NOW - (13 - i) * D).toISOString().slice(0, 10), messages: 60 + ((i * 37) % 130), users: 4 + ((i * 13) % 22) })),
  recent: [
    { action: 'Выдан Premium', details: 'ID 512… · 30 дней', created_at: new Date(NOW - H).toISOString() },
    { action: 'Новое подключение', details: 'Business-аккаунт · ID 78…', created_at: new Date(NOW - 2 * H).toISOString() },
    { action: 'Оплата получена', details: 'СБП · 120 ₽', created_at: new Date(NOW - 26 * H).toISOString() },
    { action: 'Реферал засчитан', details: 'Друг подключил бота · +1 день обоим', created_at: new Date(NOW - 50 * H).toISOString() }
  ],
  media_breakdown: [
    { type: 'photo', total: 14200 }, { type: 'video', total: 4100 }, { type: 'voice', total: 2800 },
    { type: 'sticker', total: 1600 }, { type: 'document', total: 900 }, { type: 'video_note', total: 240 }
  ],
  top_users: [
    { name: 'FLEX', chats: 12, messages: 12480 }, { name: 'Аня Соколова', chats: 9, messages: 8410 },
    { name: 'Макс', chats: 7, messages: 5120 }, { name: 'Лена', chats: 6, messages: 3900 }, { name: 'Кирилл', chats: 4, messages: 2100 }
  ]
};
const DEMO_PREFIXES = [{ id: 1, name: 'VIP', color: '#f5c451', assigned_count: 12 }, { id: 2, name: 'TEAM', color: '#4d84ff', assigned_count: 5 }, { id: 3, name: 'TESTER', color: '#34d399', assigned_count: 8 }];
const SWATCHES = ['#f5c451', '#4d84ff', '#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#ff5d73', '#a3e635'];

/* ── даты ──────────────────────────────────────────────────────────────── */
function parseArchiveDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (/^\d{10}(?:\.\d+)?$/.test(raw)) { const d = new Date(Number(raw) * 1000); return Number.isNaN(d.getTime()) ? null : d; }
  if (/^\d{13}$/.test(raw)) { const d = new Date(Number(raw)); return Number.isNaN(d.getTime()) ? null : d; }
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const tz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const date = new Date(iso + (tz ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? null : date;
}
function localDateKey(v) {
  const d = parseArchiveDate(v); if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMessageTime(v) { const d = parseArchiveDate(v); return d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''; }
function fmtChatListTime(v) {
  const d = parseArchiveDate(v); if (!d) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ago = Math.round((today - day) / D);
  if (ago === 0) return fmtMessageTime(d);
  if (ago === 1) return 'вчера';
  if (ago > 1 && ago < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
  return d.getFullYear() === now.getFullYear()
    ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtConversationStart(v) { const d = parseArchiveDate(v); return d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : 'дата неизвестна'; }
function fmtDaySeparator(v) {
  const d = parseArchiveDate(v); if (!d) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ago = Math.round((today - day) / D);
  if (ago === 0) return 'Сегодня';
  if (ago === 1) return 'Вчера';
  const label = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}
const fmtDate = (v) => { const d = parseArchiveDate(v); if (!d) return v ? String(v) : ''; return d.toDateString() === new Date().toDateString() ? fmtMessageTime(d) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
const apiError = (e) => e?.response?.data?.error || e?.message || 'Ошибка сети';
function plural(n, one, few, many) { const c = Math.abs(n) % 100, o = c % 10; if (c > 10 && c < 20) return many; if (o > 1 && o < 5) return few; if (o === 1) return one; return many; }

/* ── навигация ─────────────────────────────────────────────────────────── */
function setPage(name) {
  if (['admin', 'statistics'].includes(name) && !state.isAdmin) return alertUser('Раздел недоступен.');
  document.body.classList.toggle('chat-open', name === 'messages');
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `view-${name}`));
  const hash = ['premium', 'premium-buy', 'premium-payment'].includes(name) ? `#${name}` : '';
  const next = `${location.pathname}${location.search}${hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) { try { history.replaceState(null, '', next); } catch (_) {} }
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active',
    b.dataset.tab === name ||
    (name === 'messages' && b.dataset.tab === 'chats') ||
    (['premium', 'premium-buy', 'premium-payment'].includes(name) && b.dataset.tab === 'premium-buy') ||
    (['settings', 'referrals', 'admin', 'statistics'].includes(name) && b.dataset.tab === 'profile')));
  if (name !== 'chats' && state.bulk) exitBulkMode();
  if (name === 'home') { loadStats(); revealHome(); }
  if (name === 'chats') loadChats();
  if (name === 'settings') { loadSettings(); applyAppearance(); }
  if (['premium', 'premium-buy', 'premium-payment'].includes(name)) loadPremium();
  if (name === 'referrals') loadReferrals();
  if (name === 'profile') renderProfileMetrics();
  if (name === 'admin') { loadAdminStats(); loadPrefixes(); loadConnectionGuide(); renderSwatches(); }
  if (name === 'statistics') loadAdminStatistics();
  try { name === 'messages' ? tg?.BackButton?.show?.() : tg?.BackButton?.hide?.(); } catch (_) {}
  window.scrollTo(0, 0);
}
window.switchTab = (n) => { haptic(); setPage(n); };
function showPreloader(v) { $('preloader')?.classList.toggle('hidden', !v); }
let appInitialized = false;
function initialPageFromHash() { const h = String(location.hash || '').slice(1).split('?')[0]; return ['premium', 'premium-buy', 'premium-payment'].includes(h) ? h : 'home'; }
function revealHome() {
  const items = document.querySelectorAll('#view-home [data-reveal]');
  if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('revealed')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); io.unobserve(e.target); } }), { threshold: .12 });
  items.forEach(i => io.observe(i));
  requestAnimationFrame(() => items.forEach((i, k) => { if (i.getBoundingClientRect().top < innerHeight) setTimeout(() => i.classList.add('revealed'), k * 70); }));
}
window.focusArchiveSearch = () => { setPage('chats'); setTimeout(() => $('chat-search')?.focus(), 260); };
window.openArchivePreset = (filter) => { state.filter = filter; state.activeViewId = 0; setPage('chats'); syncToolbar(); renderChats(); haptic(); };

/* ── инициализация ─────────────────────────────────────────────────────── */
async function initApp() {
  loadLocal();
  applyAppearance();
  if ($('chat-sort')) $('chat-sort').value = state.sort;
  if (!DEMO) setTelegramInitData(initData);
  showPreloader(true);
  try { tg?.ready?.(); tg?.expand?.(); } catch (_) {}
  try {
    const data = DEMO ? DEMO_PROFILE : (await miniAppClient.get('/api/miniapp/stats')).data;
    state.stats = data;
    state.userId = Number(data.user_id || 0);
    state.username = data.username || '';
    state.hasPermanentAccess = Boolean(data.has_permanent_access);
    state.role = data.role || null;
    state.isAdmin = Boolean(data.is_admin || data.role);
    state.profilePrefix = data.profile_prefix || null;
    $('profile-admin-pencil')?.classList.toggle('hidden', !state.isAdmin);
    $('home-prefix-pencil')?.classList.toggle('hidden', !state.isAdmin);
    const name = data.user || 'Пользователь';
    $('user-name').textContent = name;
    $('user-id').textContent = `ID: ${state.userId}`;
    $('profile-name').textContent = name;
    $('profile-id').textContent = `ID: ${state.userId}`;
    const ps = $('profile-custom-status');
    if (ps) { const t = String(data.profile_status || '').trim(); ps.textContent = t; ps.classList.toggle('hidden', !t); }
    $('user-avatar-text').textContent = name.slice(0, 1).toUpperCase();
    $('profile-avatar-text').textContent = name.slice(0, 1).toUpperCase();
    if (!DEMO) {
      const tu = tg?.initDataUnsafe?.user || {};
      const url = tu.photo_url || (state.username ? `https://t.me/i/userpic/320/${encodeURIComponent(state.username)}.jpg` : '');
      requestPersistentAvatarStorage();
      if (url) loadCachedProfileAvatar(url)
        .then(u => ['user-avatar-img', 'profile-avatar-img'].forEach(id => setProfileAvatarSource($(id), $(id.replace('-img', '-text')), u)))
        .catch(() => ['user-avatar-img', 'profile-avatar-img'].forEach(id => setProfileAvatarSource($(id), $(id.replace('-img', '-text')), url)));
    }
    const pb = $('profile-prefix-badge'), ppb = $('profile-premium-badge');
    if (pb) {
      if (state.profilePrefix?.name) { pb.textContent = state.profilePrefix.name; pb.style.setProperty('--prefix-color', state.profilePrefix.color || '#f5c451'); pb.classList.remove('hidden'); }
      else { pb.classList.add('hidden'); pb.textContent = ''; }
    }
    if (ppb) { ppb.classList.toggle('hidden', !data.is_premium || state.hasPermanentAccess || Boolean(state.profilePrefix)); ppb.textContent = 'PREMIUM'; }
    $('premium-badge')?.classList.toggle('hidden', !data.is_premium);
    if (data.is_premium || state.hasPermanentAccess) {
      if (state.hasPermanentAccess) { $('premium-status-text').textContent = 'Все функции открыты на этом аккаунте'; $('premium-timer')?.classList.add('hidden'); }
      else { $('premium-status-text').textContent = 'Premium активен'; if (data.premium_expires_at) startPremiumTimer(data.premium_expires_at); }
    } else $('premium-status-text').textContent = 'Premium пока не активен';
    $('admin-tab-btn')?.classList.toggle('hidden', !state.isAdmin);
    await loadStats();
    renderHomeActivity(); renderViews(); syncToolbar(); renderPlanRows(); initMethodTiles();
    appInitialized = true;
    setPage(initialPageFromHash());
    void loadChats();
    if (!DEMO) startSubscriptionPolling();
  } catch (error) {
    console.error(error);
    const payload = error?.response?.data || {};
    if (payload.subscription_required) renderSubscriptionGate(payload);
    else alertUser(`Не удалось загрузить Mini App: ${apiError(error)}`);
  } finally { showPreloader(false); }
}

/* ── подписки ──────────────────────────────────────────────────────────── */
let subscriptionGateBusy = false, subscriptionPollTimer = null;
async function pollSubscriptionStatus() {
  if (!initData || document.hidden || subscriptionGateBusy) return;
  try {
    const { data } = await miniAppClient.get('/api/miniapp/subscriptions', { params: { refresh: 1 } });
    if (!data.ok) renderSubscriptionGate(data);
    else if (!$('subscription-gate')?.classList.contains('hidden')) {
      $('subscription-gate')?.classList.add('hidden');
      document.querySelector('.hs-app')?.classList.remove('hidden');
      if (!appInitialized) await initApp(); else { await loadStats(); setPage(initialPageFromHash()); }
    }
  } catch (e) { const p = e?.response?.data || {}; if (p.subscription_required) renderSubscriptionGate(p); }
}
function startSubscriptionPolling() { clearInterval(subscriptionPollTimer); subscriptionPollTimer = setInterval(pollSubscriptionStatus, 20000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollSubscriptionStatus(); });
function russianChannelWord(v) { return plural(v, 'канал', 'канала', 'каналов'); }
function subscriptionGateCopy(c) {
  if (c < 1) return { title: '🔒 Не удалось проверить доступ', lead: 'Список каналов пока не получен. Попробуй проверить ещё раз чуть позже.' };
  if (c === 1) return { title: '🔒 Остался один шаг', lead: 'Подпишись на канал ниже и нажми кнопку проверки — доступ откроется сразу.' };
  if (c <= 4) return { title: '🔒 Осталось совсем немного', lead: `Подпишись на все ${c} ${russianChannelWord(c)} ниже, затем нажми кнопку проверки.` };
  return { title: '🔒 Подписка для доступа', lead: `Чтобы открыть HadesSave, подпишись на все ${c} ${russianChannelWord(c)} ниже и нажми кнопку проверки.` };
}
function renderSubscriptionGate(data = {}) {
  const gate = $('subscription-gate'), app = document.querySelector('.hs-app');
  if (!gate) return alertUser('Чтобы открыть HadesSave, подпишись на обязательные каналы.');
  const channels = Array.isArray(data.channels) ? data.channels : [];
  const rc = Number(data.required_count);
  const copy = subscriptionGateCopy(Number.isFinite(rc) && rc >= 0 ? rc : channels.length);
  $('subscription-gate-title').textContent = copy.title;
  $('subscription-gate-lead').textContent = copy.lead;
  $('subscription-gate-list').innerHTML = channels.map(ch => {
    const title = esc(ch.title || 'Сообщество'), member = Boolean(ch.member), err = Boolean(ch.error);
    const label = member ? 'Подписка подтверждена' : err ? 'Проверка недоступна' : 'Нужно подписаться';
    const action = ch.join_url
      ? `<a class="subscription-join-link" href="${esc(ch.join_url)}" target="_blank" rel="noopener noreferrer">${member ? 'Открыть' : 'Подписаться'}</a>`
      : '<span class="subscription-no-link">Ссылка не настроена</span>';
    return `<article class="subscription-channel ${member ? 'is-member' : err ? 'is-error' : 'is-missing'}"><div class="subscription-channel-copy"><b>${member ? '✓' : err ? '!' : '○'} ${title}</b><small>${label}</small></div>${action}</article>`;
  }).join('') || '<p class="subscription-empty">Список каналов пока не получен. Нажми «Проверить» ещё раз.</p>';
  const un = Number(data.unavailable?.length || 0);
  $('subscription-gate-status').textContent = un ? `Не удалось проверить ${un} сообществ. Доступ закрыт до восстановления проверки.` : `Подтверждено: ${channels.filter(x => x.member).length} из ${channels.length}.`;
  gate.classList.remove('hidden'); app?.classList.add('hidden'); tg?.BackButton?.hide?.();
}
async function refreshRequiredSubscriptions() {
  if (subscriptionGateBusy) return;
  subscriptionGateBusy = true;
  const btn = $('subscription-gate-refresh'), st = $('subscription-gate-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Проверяем…'; }
  if (st) st.textContent = 'Запрашиваем статус у Telegram…';
  try {
    const { data } = await miniAppClient.get('/api/miniapp/subscriptions', { params: { refresh: 1 } });
    if (data.ok) {
      $('subscription-gate')?.classList.add('hidden');
      document.querySelector('.hs-app')?.classList.remove('hidden');
      if (!appInitialized) await initApp(); else { await loadStats(); setPage(initialPageFromHash()); }
      return;
    }
    renderSubscriptionGate(data);
  } catch (e) {
    const p = e?.response?.data || {}; renderSubscriptionGate(p);
    if (st && !p.channels) st.textContent = 'Сервер проверки не отвечает. Попробуй позже.';
  } finally { subscriptionGateBusy = false; if (btn) { btn.disabled = false; btn.textContent = 'Я подписался — проверить'; } }
}
$('subscription-gate-refresh')?.addEventListener('click', refreshRequiredSubscriptions);

/* ── статистика ────────────────────────────────────────────────────────── */
let premiumTimer = null;
function startPremiumTimer(expiresAt) {
  clearInterval(premiumTimer);
  const tick = () => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) { $('premium-timer-text').textContent = 'Истёк'; clearInterval(premiumTimer); return; }
    const d = Math.floor(ms / D), h = Math.floor(ms % D / H), m = Math.floor(ms % H / 60000), s = Math.floor(ms % 60000 / 1000);
    $('premium-timer-text').textContent = `${d}д ${h}ч ${m}м ${s}с`;
  };
  $('premium-timer')?.classList.remove('hidden'); tick(); premiumTimer = setInterval(tick, 1000);
}
function animateNumber(el, to) {
  if (!el) return;
  const from = Number(String(el.textContent).replace(/\s/g, '')) || 0;
  if (from === to) { el.textContent = num(to); return; }
  const t0 = performance.now(), dur = 620;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = num(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
async function loadStats() {
  try {
    const data = DEMO ? DEMO_PROFILE : (await miniAppClient.get('/api/miniapp/stats')).data;
    state.stats = data;
    animateNumber($('stat-total'), Number(data.total_messages || 0));
    animateNumber($('stat-deleted'), Number(data.deleted_messages || 0));
    animateNumber($('stat-chats'), Number(data.chats_count || 0));
    animateNumber($('stat-media'), Number(data.media_count || 0));
    renderProfileMetrics();
  } catch (e) { console.warn('stats', e); }
}
function renderHomeActivity() {
  const box = $('home-activity'); if (!box) return;
  const rows = DEMO ? DEMO_ACTIVITY : state.chats.slice(0, 4).map(c => ({
    icon: c.deleted ? 'i-trash' : 'i-chat', tone: c.deleted ? 'rose' : 'sapphire',
    title: c.label || `Чат ${c.chat_id}`, sub: c.last_message || 'Вложение',
    at: parseArchiveDate(c.last_at)?.getTime() || NOW
  }));
  box.innerHTML = rows.map(r => `<div class="activity-item" style="--tone:var(--${r.tone});--tone-soft:var(--${r.tone}-soft)">
    <span class="activity-glyph"><svg class="icon"><use href="#${r.icon}"></use></svg></span>
    <span class="activity-copy"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span>
    <time>${esc(fmtChatListTime(new Date(r.at).toISOString()))}</time></div>`).join('');
}
function renderProfileMetrics() {
  const box = $('profile-metrics'); if (!box || !state.stats) return;
  const d = state.stats;
  box.innerHTML = [['Сообщений', d.total_messages], ['Чатов', d.chats_count], ['Медиа', d.media_count]]
    .map(([l, v]) => `<div class="profile-metric"><strong>${num(v)}</strong><span>${l}</span></div>`).join('');
}

/* ── кэш аватаров ──────────────────────────────────────────────────────── */
const AVATAR_DB_NAME = 'hadessave-avatar-cache', AVATAR_DB_VERSION = 1, AVATAR_DB_STORE = 'images';
let avatarDbPromise = null;
const chatAvatarCache = new Map(), chatAvatarPromises = new Map(), chatAvatarTargets = new WeakMap(), avatarPrefetchStarted = new Set();
function openAvatarDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (!avatarDbPromise) avatarDbPromise = new Promise(res => {
    try {
      const r = indexedDB.open(AVATAR_DB_NAME, AVATAR_DB_VERSION);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(AVATAR_DB_STORE)) db.createObjectStore(AVATAR_DB_STORE); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (_) { res(null); }
  });
  return avatarDbPromise;
}
async function avatarDbGet(key) {
  const db = await openAvatarDb(); if (!db) return null;
  return new Promise(res => { try { const q = db.transaction(AVATAR_DB_STORE, 'readonly').objectStore(AVATAR_DB_STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (_) { res(null); } });
}
async function avatarDbPut(key, blob) {
  const db = await openAvatarDb(); if (!db || !blob?.size) return false;
  return new Promise(res => { try { const tx = db.transaction(AVATAR_DB_STORE, 'readwrite'); tx.objectStore(AVATAR_DB_STORE).put({ blob, savedAt: Date.now(), type: blob.type || 'image/jpeg' }, key); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); } catch (_) { res(false); } });
}
async function requestPersistentAvatarStorage() { try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (_) {} }
function makeAvatarObjectUrl(key, blob) { let v = chatAvatarCache.get(key); if (v) return v; v = URL.createObjectURL(blob); chatAvatarCache.set(key, v); return v; }
function chatAvatarKey(c) { return `${state.userId}:chat:${String(c.chat_id)}`; }
function chatAvatarApiUrl(c) {
  const p = new URLSearchParams({ chat_id: String(c.chat_id), connection_id: String(c.avatar_connection_id || c.connection_id), owner_id: String(state.userId) });
  return `${miniAppClient.defaults?.baseURL || ''}/api/miniapp/avatar?${p.toString()}`;
}
async function ensureChatAvatar(chat) {
  if (!chat?.chat_id) return null;
  const key = chatAvatarKey(chat);
  if (chatAvatarCache.has(key)) return chatAvatarCache.get(key);
  if (chatAvatarPromises.has(key)) return chatAvatarPromises.get(key);
  const task = (async () => {
    const saved = await avatarDbGet(key);
    if (saved?.blob?.size) return makeAvatarObjectUrl(key, saved.blob);
    try {
      const r = await fetch(chatAvatarApiUrl(chat), { method: 'GET', cache: 'force-cache', headers: { 'X-Telegram-Init-Data': initData } });
      if (!r.ok) throw new Error(`Avatar HTTP ${r.status}`);
      const blob = await r.blob();
      if (!blob.size || !String(blob.type || '').startsWith('image/')) throw new Error('Invalid avatar');
      await avatarDbPut(key, blob);
      return makeAvatarObjectUrl(key, blob);
    } catch (_) {
      if (chat.chat_username) { const u = `https://t.me/i/userpic/320/${encodeURIComponent(String(chat.chat_username).replace(/^@/, ''))}.jpg`; chatAvatarCache.set(key, u); return u; }
      return null;
    }
  })();
  chatAvatarPromises.set(key, task); return task;
}
function applyChatAvatar(img, wrap, src) {
  if (!img || !wrap || !src) return;
  if (img.dataset.loadedSource !== src) {
    img.dataset.loadedSource = src;
    img.onload = () => wrap.classList.add('has-image');
    img.onerror = () => { wrap.classList.remove('has-image'); img.removeAttribute('src'); img.dataset.loadedSource = ''; };
    img.src = src;
  }
  if (img.complete && img.naturalWidth > 0) wrap.classList.add('has-image');
}
async function loadChatAvatar(img, wrap, chat) { if (DEMO || !img || !wrap || !chat) return; const s = await ensureChatAvatar(chat); if (s) applyChatAvatar(img, wrap, s); }
const chatAvatarObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const t = chatAvatarTargets.get(e.target); chatAvatarObserver.unobserve(e.target);
  if (t) loadChatAvatar(t.img, t.wrap, t.chat);
}), { rootMargin: '320px 0px' }) : null;
function queueChatAvatar(img, wrap, chat) {
  if (DEMO) return;
  if (chatAvatarCache.has(chatAvatarKey(chat)) || !chatAvatarObserver) return loadChatAvatar(img, wrap, chat);
  chatAvatarTargets.set(wrap, { img, wrap, chat }); chatAvatarObserver.observe(wrap);
}
function prefetchChatAvatars(chats) {
  if (DEMO) return;
  const k = String(state.userId); if (avatarPrefetchStarted.has(k)) return;
  const uniq = [...new Map((chats || []).filter(c => c?.chat_id).map(c => [String(c.chat_id), c])).values()];
  if (!uniq.length) return;
  avatarPrefetchStarted.add(k);
  let i = 0;
  const worker = async () => { while (i < uniq.length) { const c = uniq[i++]; try { await ensureChatAvatar(c); } catch (_) {} } };
  void Promise.all(Array.from({ length: Math.min(3, uniq.length) }, worker));
}
async function loadCachedProfileAvatar(url) {
  if (!url || !state.userId) return null;
  const key = `${state.userId}:profile:${url}`;
  if (chatAvatarCache.has(key)) return chatAvatarCache.get(key);
  const ex = await avatarDbGet(key); if (ex?.blob?.size) return makeAvatarObjectUrl(key, ex.blob);
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) throw new Error('avatar'); const b = await r.blob();
    if (!b.size || !String(b.type || '').startsWith('image/')) throw new Error('avatar');
    await avatarDbPut(key, b); return makeAvatarObjectUrl(key, b);
  } catch (_) { return url; }
}
function setProfileAvatarSource(img, fallback, src) {
  if (!img || !src) return;
  img.loading = 'eager'; img.decoding = 'async';
  img.onload = () => { img.style.display = 'block'; if (fallback) fallback.style.display = 'none'; };
  img.onerror = () => { img.style.display = 'none'; if (fallback) fallback.style.display = 'grid'; };
  if (img.dataset.sourceUrl !== src) { img.dataset.sourceUrl = src; img.src = src; }
}

/* ── фильтры / виды ────────────────────────────────────────────────────── */
const ATTACH_NAMES = { photo: 'Фото', video: 'Видео', video_note: 'Видеосообщение', voice: 'Голосовое', audio: 'Аудио', animation: 'GIF', document: 'Файл', sticker: 'Стикер' };
const KIND_META = { private: { icon: 'i-user', tone: 'sapphire', label: 'Личный чат' }, group: { icon: 'i-users', tone: 'cyan', label: 'Группа' }, channel: { icon: 'i-send', tone: 'violet', label: 'Канал' } };
function chatKind(c) { return c.kind || (Number(c.chat_id) < 0 ? 'group' : 'private'); }
function highlight(text, q) {
  const s = esc(text); if (!q) return s;
  const i = s.toLocaleLowerCase('ru').indexOf(q.toLocaleLowerCase('ru'));
  if (i < 0) return s;
  return s.slice(0, i) + '<mark>' + s.slice(i, i + q.length) + '</mark>' + s.slice(i + q.length);
}
function visibleChats() {
  const q = state.chatSearch.trim().toLocaleLowerCase('ru');
  let rows = state.chats.filter(c => !state.hidden.includes(Number(c.chat_id)));
  if (q) rows = rows.filter(c => (c.match_query && c.match_query === state.chatSearch.trim()) || `${c.label || ''} ${c.last_message || ''} ${c.chat_username || ''}`.toLocaleLowerCase('ru').includes(q));
  const f = state.filter;
  if (f === 'private') rows = rows.filter(c => chatKind(c) === 'private');
  else if (f === 'groups') rows = rows.filter(c => chatKind(c) !== 'private');
  else if (f === 'unread') rows = rows.filter(c => Number(c.unread || 0) > 0);
  else if (f === 'media') rows = rows.filter(c => Number(c.media || 0) > 0 || ['photo', 'video', 'voice', 'document', 'video_note', 'audio', 'animation'].includes(c.last_content_type));
  else if (f === 'deleted') rows = rows.filter(c => Number(c.deleted || 0) > 0);
  else if (f === 'pinned') rows = rows.filter(c => state.pinned.includes(Number(c.chat_id)));
  const ts = (c) => parseArchiveDate(c.last_at)?.getTime() || 0;
  const cmp = {
    recent: (a, b) => ts(b) - ts(a),
    volume: (a, b) => Number(b.total || 0) - Number(a.total || 0),
    name: (a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ru'),
    unread: (a, b) => Number(b.unread || 0) - Number(a.unread || 0) || ts(b) - ts(a)
  }[state.sort] || ((a, b) => ts(b) - ts(a));
  rows.sort(cmp);
  const pinned = rows.filter(c => state.pinned.includes(Number(c.chat_id)));
  pinned.sort((a, b) => state.pinned.indexOf(Number(a.chat_id)) - state.pinned.indexOf(Number(b.chat_id)));
  return { pinned, rest: rows.filter(c => !state.pinned.includes(Number(c.chat_id))) };
}
function syncToolbar() {
  document.querySelectorAll('#archive-filters .chat-tab').forEach(b => b.classList.toggle('active', b.dataset.filter === state.filter));
  if ($('chat-sort')) $('chat-sort').value = state.sort;
  $('chat-search-clear')?.classList.toggle('hidden', !state.chatSearch);
  const hc = state.hidden.length;
  $('hidden-row')?.classList.toggle('hidden', hc === 0);
  if ($('hidden-count')) $('hidden-count').textContent = hc;
  const unreadTotal = state.chats.reduce((s, c) => s + Number(c.unread || 0), 0);
  if ($('home-unread-tag')) $('home-unread-tag').textContent = unreadTotal;
  $('nav-unread-dot')?.classList.toggle('hidden', unreadTotal === 0);
}
function renderViews() {
  const row = $('views-row'); if (!row) return;
  row.querySelectorAll('.view-chip:not(.view-chip-add)').forEach(n => n.remove());
  const add = $('save-view-btn');
  state.views.forEach(v => {
    const chip = document.createElement('div');
    chip.className = 'view-chip' + (state.activeViewId === v.id ? ' active' : '');
    chip.innerHTML = `<svg class="icon"><use href="#i-bookmark"></use></svg><span>${esc(v.name)}</span>`;
    chip.querySelector('span').onclick = () => applyView(v.id);
    const x = document.createElement('button');
    x.className = 'view-chip-x'; x.setAttribute('aria-label', 'Удалить вид');
    x.innerHTML = '<svg class="icon"><use href="#i-x"></use></svg>';
    x.onclick = (e) => { e.stopPropagation(); removeView(v.id); };
    chip.appendChild(x);
    row.insertBefore(chip, add);
  });
}
function applyView(id) {
  const v = state.views.find(x => x.id === id); if (!v) return;
  state.activeViewId = id; state.filter = v.filter; state.sort = v.sort; state.chatSearch = v.q || '';
  if ($('chat-search')) $('chat-search').value = state.chatSearch;
  syncToolbar(); renderViews(); loadChats(); haptic(); toast('Вид применён', v.name, 'info');
}
function removeView(id) {
  const v = state.views.find(x => x.id === id);
  state.views = state.views.filter(x => x.id !== id);
  if (state.activeViewId === id) state.activeViewId = 0;
  saveLocal(); renderViews();
  toast('Вид удалён', v?.name || '', 'rose', { label: 'Вернуть', run: () => { if (v) { state.views.push(v); saveLocal(); renderViews(); } } });
}
window.openSaveViewModal = () => {
  const fn = { all: 'Все', private: 'Личные', groups: 'Группы', unread: 'Новые', media: 'Медиа', deleted: 'Удалённые', pinned: 'Закреплённые' }[state.filter];
  const sn = { recent: 'Сначала свежие', volume: 'По объёму', name: 'По названию', unread: 'По непрочитанным' }[state.sort];
  const s = $('view-summary');
  if (s) s.innerHTML = `<span>${esc(fn)}</span><span>${esc(sn)}</span>${state.chatSearch ? `<span>«${esc(state.chatSearch)}»</span>` : ''}`;
  if ($('view-name-input')) $('view-name-input').value = '';
  $('view-modal')?.classList.add('active');
  setTimeout(() => $('view-name-input')?.focus(), 200);
};
window.closeSaveViewModal = (e) => { if (e && e.target !== $('view-modal') && !e.target.closest('button')) return; $('view-modal')?.classList.remove('active'); };
window.saveCurrentView = () => {
  const name = String($('view-name-input')?.value || '').trim();
  if (!name) { $('view-name-input')?.focus(); return alertUser('Дай виду понятное название.'); }
  const v = { id: Date.now(), name, filter: state.filter, sort: state.sort, q: state.chatSearch };
  state.views.push(v); state.activeViewId = v.id; saveLocal(); renderViews(); closeSaveViewModal();
  toast('Вид сохранён', name, 'green'); haptic('medium');
};

/* ── bulk / pin / hide ─────────────────────────────────────────────────── */
window.toggleBulkMode = () => { state.bulk ? exitBulkMode() : enterBulkMode(); };
function enterBulkMode() { state.bulk = true; state.selected.clear(); $('bulk-toggle')?.classList.add('is-on'); $('bulk-bar')?.classList.remove('hidden'); updateBulkBar(); renderChats(); haptic(); }
window.exitBulkMode = () => { state.bulk = false; state.selected.clear(); $('bulk-toggle')?.classList.remove('is-on'); $('bulk-bar')?.classList.add('hidden'); renderChats(); };
function updateBulkBar() { if ($('bulk-count')) $('bulk-count').textContent = state.selected.size; }
function toggleSelect(id) {
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  updateBulkBar();
  document.querySelector(`.chat-row[data-chat-id="${id}"]`)?.classList.toggle('is-selected', state.selected.has(id));
  haptic();
}
window.bulkPin = () => {
  if (!state.selected.size) return toast('Ничего не выбрано', 'Отметь чаты галочками', 'info');
  const ids = [...state.selected];
  ids.forEach(id => { if (!state.pinned.includes(id)) state.pinned.push(id); });
  saveLocal(); exitBulkMode(); toast(`Закреплено: ${ids.length}`, 'Показаны вверху списка', 'gold');
};
window.bulkHide = () => {
  if (!state.selected.size) return toast('Ничего не выбрано', 'Отметь чаты галочками', 'info');
  const ids = [...state.selected]; hideChats(ids); exitBulkMode();
};
function hideChats(ids) {
  const prevHidden = [...state.hidden], prevPinned = [...state.pinned];
  ids.forEach(id => { if (!state.hidden.includes(id)) state.hidden.push(id); });
  state.pinned = state.pinned.filter(id => !ids.includes(id));
  saveLocal(); syncToolbar(); renderChats(); haptic('medium');
  toast(`Скрыто чатов: ${ids.length}`, 'Их всегда можно вернуть', 'rose', {
    label: 'Отменить', run: () => { state.hidden = prevHidden; state.pinned = prevPinned; saveLocal(); syncToolbar(); renderChats(); toast('Возвращено', '', 'green'); }
  });
}
window.restoreAllHidden = () => { state.hidden = []; saveLocal(); syncToolbar(); renderChats(); toast('Все чаты возвращены', '', 'green'); };
function togglePin(id) {
  const on = state.pinned.includes(id);
  state.pinned = on ? state.pinned.filter(x => x !== id) : [id, ...state.pinned];
  saveLocal(); renderChats(); haptic();
  toast(on ? 'Откреплено' : 'Закреплено', '', on ? 'info' : 'gold');
}

/* ── рендер чатов ──────────────────────────────────────────────────────── */
function chatRowNode(chat) {
  const id = Number(chat.chat_id);
  const kind = chatKind(chat), meta = KIND_META[kind] || KIND_META.private;
  const [a, b] = avColors(id);
  const title = chat.label || `Чат ${chat.chat_id}`;
  const q = state.chatSearch.trim();
  const preview = chat.last_message || (chat.last_content_type ? ATTACH_NAMES[chat.last_content_type] || 'Вложение' : 'Нет сообщений');
  const total = Number(chat.total || 0);
  const unread = Number(chat.unread || 0);
  const item = document.createElement('div');
  item.className = 'chat-row' + (state.pinned.includes(id) ? ' is-pinned' : '') + (state.selected.has(id) ? ' is-selected' : '');
  item.dataset.chatId = String(id);
  item.setAttribute('role', 'button'); item.tabIndex = 0;
  item.innerHTML = `
    ${state.bulk ? `<span class="chat-check"><svg class="icon"><use href="#i-check"></use></svg></span>` : ''}
    ${state.pinned.includes(id) && !state.bulk ? `<span class="chat-drag" draggable="true" aria-label="Перетащить"><svg class="icon"><use href="#i-list"></use></svg></span>` : ''}
    <span class="chat-avatar-wrap" style="--av-a:${a};--av-b:${b}">
      <span class="chat-avatar-fallback">${esc(title.trim().slice(0, 1).toUpperCase() || '?')}</span>
      <img class="chat-avatar-image" alt="" decoding="async" loading="eager">
      <span class="chat-kind" style="--tone:var(--${meta.tone})"><svg class="icon"><use href="#${meta.icon}"></use></svg></span>
    </span>
    <span class="chat-main"><strong>${highlight(title, q)}</strong><small>${highlight(preview, q)}</small></span>
    <span class="chat-side">
      <time>${esc(fmtChatListTime(chat.last_at))}</time>
      <span class="chat-meta">
        ${Number(chat.deleted || 0) > 0 ? `<svg class="icon chat-flag" aria-label="Есть удалённые"><use href="#i-trash"></use></svg>` : ''}
        ${unread > 0 ? `<span class="chat-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
        <span class="chat-count"><b>${num(total)}</b><i>${plural(total, 'сообщ.', 'сообщ.', 'сообщ.')}</i></span>
      </span>
    </span>
    ${state.bulk ? '' : `<button class="chat-pin-btn" aria-label="Закрепить"><svg class="icon"><use href="#i-pin"></use></svg></button>`}`;
  queueChatAvatar(item.querySelector('.chat-avatar-image'), item.querySelector('.chat-avatar-wrap'), chat);
  item.addEventListener('click', (e) => {
    if (e.target.closest('.chat-pin-btn')) { e.stopPropagation(); togglePin(id); return; }
    if (e.target.closest('.chat-drag')) return;
    state.bulk ? toggleSelect(id) : openChat(chat);
  });
  item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.bulk ? toggleSelect(id) : openChat(chat); } });
  const drag = item.querySelector('.chat-drag');
  if (drag) {
    drag.addEventListener('dragstart', (e) => { state.dragId = id; item.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(id)); } catch (_) {} });
    drag.addEventListener('dragend', () => { item.classList.remove('is-dragging'); state.dragId = null; document.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over')); });
  }
  item.addEventListener('dragover', (e) => { if (state.dragId == null || state.dragId === id) return; e.preventDefault(); item.classList.add('drag-over'); });
  item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
  item.addEventListener('drop', (e) => {
    e.preventDefault(); item.classList.remove('drag-over');
    if (state.dragId == null || state.dragId === id) return;
    const from = state.pinned.indexOf(state.dragId), to = state.pinned.indexOf(id);
    if (from < 0 || to < 0) return;
    state.pinned.splice(to, 0, state.pinned.splice(from, 1)[0]);
    saveLocal(); renderChats(); haptic(); toast('Порядок обновлён', '', 'info');
  });
  return item;
}
function renderChats() {
  const list = $('chats-list'); if (!list) return;
  chatAvatarObserver?.disconnect();
  const { pinned, rest } = visibleChats();
  const total = pinned.length + rest.length;
  const counter = $('chats-counter');
  if (counter) counter.textContent = total
    ? `${num(total)} ${plural(total, 'переписка', 'переписки', 'переписок')} · ${num(state.chats.reduce((s, c) => s + Number(c.total || 0), 0))} сообщений`
    : 'Ничего не найдено';
  list.innerHTML = '';
  if (!total) {
    list.innerHTML = `<div class="empty-state"><span class="empty-mark"><svg class="icon"><use href="#i-search"></use></svg></span><b>Пусто по этому фильтру</b>Попробуй другой фильтр или сбрось поиск.<br><button onclick="resetArchiveFilters()">Сбросить фильтры</button></div>`;
    syncToolbar(); return;
  }
  const frag = document.createDocumentFragment();
  if (pinned.length) {
    const l = document.createElement('div'); l.className = 'chat-section-label';
    l.innerHTML = `<svg class="icon"><use href="#i-pin"></use></svg>ЗАКРЕПЛЁННЫЕ<i></i>`;
    frag.appendChild(l); pinned.forEach(c => frag.appendChild(chatRowNode(c)));
  }
  if (rest.length) {
    if (pinned.length) { const l = document.createElement('div'); l.className = 'chat-section-label'; l.innerHTML = `ВСЕ ЧАТЫ<i></i>`; frag.appendChild(l); }
    rest.forEach(c => frag.appendChild(chatRowNode(c)));
  }
  list.appendChild(frag);
  syncToolbar();
}
window.resetArchiveFilters = () => { state.filter = 'all'; state.chatSearch = ''; state.activeViewId = 0; if ($('chat-search')) $('chat-search').value = ''; renderViews(); loadChats(); };
window.clearChatSearch = () => { state.chatSearch = ''; if ($('chat-search')) $('chat-search').value = ''; loadChats(); $('chat-search')?.focus(); };
window.reloadChats = () => {
  const b = document.querySelector('.chats-title-actions .chats-title-icon:last-child');
  b?.classList.add('spinning');
  loadChats().finally(() => setTimeout(() => b?.classList.remove('spinning'), 500));
  toast('Архив обновлён', '', 'green');
};
function chatSkeletons() {
  const list = $('chats-list'); if (!list) return;
  list.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-row"><span class="sk sk-avatar"></span><span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span></div>`).join('');
}
async function loadChats() {
  if (!$('chats-list')) return;
  if (!state.chats.length) chatSkeletons();
  try {
    let data;
    if (DEMO) { await new Promise(r => setTimeout(r, 160)); data = { chats: DEMO_CHATS }; }
    else {
      const params = {}; if (state.chatSearch.trim()) params.q = state.chatSearch.trim();
      data = (await miniAppClient.get('/api/miniapp/chats', { params })).data;
    }
    state.chats = Array.isArray(data.chats) ? data.chats : [];
    renderChats(); renderHomeActivity(); prefetchChatAvatars(state.chats);
  } catch (e) {
    $('chats-list').innerHTML = `<div class="empty-state"><b>Не удалось загрузить</b>${esc(apiError(e))}<br><button onclick="reloadChats()">Повторить</button></div>`;
  }
}

/* ── переписка ─────────────────────────────────────────────────────────── */
async function openChat(chat) {
  state.activeChat = chat; state.messageOffset = 0; state.hasMoreMessages = false; state.messageSearch = '';
  const title = chat.label || `Чат ${chat.chat_id}`;
  const [a, b] = avColors(chat.chat_id);
  $('chat-title').textContent = title;
  $('chat-subtitle').textContent = chat.first_at ? `Переписка с ${fmtConversationStart(chat.first_at)}` : `${num(chat.total)} сообщений в архиве`;
  $('chat-header-initial').textContent = title.trim().slice(0, 1).toUpperCase() || '?';
  const wrap = $('chat-header-avatar');
  if (wrap) { wrap.style.setProperty('--av-a', a); wrap.style.setProperty('--av-b', b); }
  const img = $('chat-header-avatar-image');
  if (img && wrap) {
    const k = `${state.userId}:${chat.chat_id}`;
    if (img.dataset.chatKey !== k) { img.dataset.chatKey = k; wrap.classList.remove('has-image'); img.dataset.loadedSource = ''; img.removeAttribute('src'); }
    loadChatAvatar(img, wrap, chat);
  }
  if ($('message-search')) $('message-search').value = '';
  $('message-search-wrap')?.classList.add('hidden');
  if ($('message-search-hits')) $('message-search-hits').textContent = '';
  setPage('messages');
  await loadMessages(false);
}
function messageHtml(msg) {
  const outgoing = Boolean(msg.is_outgoing || msg.direction === 'outgoing');
  const isSticker = msg.content_type === 'sticker';
  const cls = ['message-bubble', outgoing ? 'outgoing' : 'incoming', isSticker ? 'has-sticker' : '', msg.deleted ? 'is-deleted' : '', msg.edited ? 'is-edited' : ''].filter(Boolean).join(' ');
  const replyId = Number(msg.reply_to_message_id || 0);
  const conn = String(msg.connection_id || state.activeChat.connection_id);
  const replyHtml = replyId ? `<button class="reply-preview" type="button" data-reply-to="${replyId}" data-reply-connection="${esc(conn)}"><strong>${esc(msg.reply_to_sender_name || 'Ответ на сообщение')}</strong><span>${esc(msg.reply_to_text || `Сообщение #${replyId}`)}</span></button>` : '';
  let body = isSticker ? '' : esc(msg.text || '');
  if (body && state.messageSearch.trim()) body = highlight(msg.text || '', state.messageSearch.trim());
  let media = '';
  if (msg.has_media) {
    const mc = String(msg.media_connection_id || conn);
    const p = new URLSearchParams({ chat_id: state.activeChat.chat_id, connection_id: mc, message_id: msg.message_id, initData });
    const url = msg.demo_media || `${miniAppClient.defaults?.baseURL || ''}/api/miniapp/media?${p.toString()}`;
    const type = msg.content_type;
    if (type === 'sticker') {
      const ext = String(msg.media_ext || '').toLowerCase();
      const fmt = ext === '.tgs' ? 'tgs' : ext === '.webm' ? 'webm' : 'webp';
      media = fmt === 'tgs'
        ? `<div class="message-sticker-tgs" data-sticker-url="${url}" role="img" aria-label="Анимированный стикер"></div>`
        : fmt === 'webm'
          ? `<video class="message-sticker-video" src="${url}" autoplay loop muted playsinline preload="auto" aria-label="Анимированный стикер"></video>`
          : `<img class="message-sticker-image" src="${url}" alt="Стикер" loading="lazy" decoding="async" draggable="false">`;
    } else if (type === 'photo') media = `<img class="message-media" src="${url}" alt="Фото" loading="lazy" data-media-url="${url}" data-media-type="${type}" data-mid="${msg.message_id}">`;
    else if (type === 'video_note') media = `<video class="message-media message-video-note" src="${url}" ${msg.demo_media ? `poster="${url}"` : ''} controls playsinline preload="metadata" data-media-url="${url}" data-media-type="${type}" data-mid="${msg.message_id}"></video>`;
    else if (['video', 'animation'].includes(type)) media = `<video class="message-media" src="${url}" controls playsinline preload="metadata"></video>`;
    else if (['voice', 'audio'].includes(type)) {
      media = msg.demo_media || DEMO
        ? `<div class="audio-card"><svg class="icon"><use href="#i-mic"></use></svg><span class="audio-wave">${Array.from({ length: 22 }, (_, i) => `<i style="height:${20 + Math.abs(Math.sin(i * 1.1)) * 70}%"></i>`).join('')}</span><span class="audio-dur">0:${String(8 + (msg.message_id % 40)).padStart(2, '0')}</span></div>`
        : `<audio class="message-audio" src="${url}" controls preload="metadata"></audio>`;
    } else media = `<div class="document-preview"><span class="document-preview-icon"><svg class="icon"><use href="#i-file"></use></svg></span><span class="document-preview-name">${esc(msg.file_name || 'Документ')}</span><span class="document-preview-type">${esc((msg.media_ext || '').replace('.', '').toUpperCase() || 'ФАЙЛ')}</span></div>`;
  } else if (!body && msg.content_type && msg.content_type !== 'text') {
    const miss = { photo: '📷 Фото не сохранилось', video: '🎬 Видео не сохранилось', video_note: '⭕ Видеокружок не сохранился', voice: '🎤 Голосовое не сохранилось', audio: '🎵 Аудио не сохранилось', animation: '🎞 GIF не сохранился', document: '📎 Файл не сохранился', sticker: '🎭 Стикер не сохранился' };
    body = esc(miss[msg.content_type] || 'Вложение недоступно');
  }
  const marker = msg.deleted
    ? `<svg class="msg-state deleted-icon" viewBox="0 0 24 24" role="img" aria-label="Удалено"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>`
    : msg.edited
      ? `<button class="history-button" type="button" title="История правок" aria-label="История правок" data-history="${Number(msg.message_id)}" data-history-connection="${esc(conn)}"><svg class="msg-state edit-icon" viewBox="0 0 24 24" role="img" aria-label="Изменено"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : '';
  const read = outgoing && (msg.is_read === true || msg.is_read === 1 || msg.is_read === '1');
  const ticks = outgoing ? (read
    ? `<svg class="telegram-ticks is-read" viewBox="0 0 18 14" role="img" aria-label="Прочитано"><path d="m1 7 4 4L14 2M7 7l4 4 6-7"/></svg>`
    : `<svg class="telegram-ticks is-sent" viewBox="0 0 18 14" role="img" aria-label="Отправлено"><path d="m2 7 4 4L16 1.5"/></svg>`) : '';
  const at = msg.sent_at || msg.updated_at;
  return `<article class="${cls}" data-message-id="${Number(msg.message_id)}" data-connection-id="${esc(conn)}" data-date-key="${esc(localDateKey(at))}">${replyHtml}${body ? `<div class="message-text">${body.replace(/\n/g, '<br>')}</div>` : ''}${media ? `<div class="message-attachment">${media}</div>` : ''}<footer class="message-footer"><time datetime="${esc(at || '')}">${esc(fmtMessageTime(at))}</time>${marker}${ticks}</footer></article>`;
}
let lottieLoaderPromise, pakoLoaderPromise;
function loadExternalScript(src, g) {
  if (window[g]) return Promise.resolve(window[g]);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => window[g] ? res(window[g]) : rej(new Error(`${g} init`));
    s.onerror = () => rej(new Error(`load ${g}`));
    document.head.appendChild(s);
  });
}
async function ensureLottie() {
  if (window.lottie) return window.lottie;
  if (!lottieLoaderPromise) lottieLoaderPromise = loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js', 'lottie').catch(() => loadExternalScript('https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js', 'lottie'));
  return lottieLoaderPromise;
}
async function gunzipTgs(buf) {
  if ('DecompressionStream' in window) { try { return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); } catch (_) {} }
  if (!pakoLoaderPromise) pakoLoaderPromise = loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js', 'pako').catch(() => loadExternalScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'pako'));
  const pako = await pakoLoaderPromise;
  return new TextDecoder().decode(pako.ungzip(new Uint8Array(buf)));
}
async function hydrateTgsStickers(root = document) {
  for (const host of root.querySelectorAll('.message-sticker-tgs:not([data-player-state])')) {
    host.dataset.playerState = 'loading';
    try {
      const lottie = await ensureLottie();
      const r = await fetch(host.dataset.stickerUrl, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const animationData = JSON.parse(await gunzipTgs(await r.arrayBuffer()));
      lottie.loadAnimation({ container: host, renderer: 'svg', loop: true, autoplay: true, animationData, rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
      host.dataset.playerState = 'ready';
    } catch (_) {
      host.dataset.playerState = 'error';
      host.innerHTML = '<span class="sticker-unavailable">Стикер недоступен</span>';
    }
  }
}
function renderMessageBatch(rows) {
  let prev = '';
  return rows.map(m => {
    const at = m.sent_at || m.updated_at, k = localDateKey(at);
    let div = '';
    if (k && k !== prev) div = `<div class="message-date-divider" data-date-key="${esc(k)}"><span>${esc(fmtDaySeparator(at))}</span></div>`;
    if (k) prev = k;
    return div + messageHtml(m);
  }).join('');
}
async function loadMessages(append = false) {
  if (!state.activeChat || state.loadingMessages) return;
  state.loadingMessages = true;
  const list = $('messages-list');
  if (!append) { list.innerHTML = '<div class="empty-state">Загружаем сообщения…</div>'; state.messageOffset = 0; }
  const oldH = list.scrollHeight;
  try {
    if (DEMO) {
      await new Promise(r => setTimeout(r, 130));
      const q = state.messageSearch.trim().toLowerCase();
      const rows = demoMessages(state.activeChat).filter(m => !q || String(m.text || '').toLowerCase().includes(q));
      list.innerHTML = renderMessageBatch(rows) || '<div class="empty-state"><b>Ничего не нашлось</b>Попробуй другое слово</div>';
      if ($('message-search-hits')) $('message-search-hits').textContent = q ? `${rows.length}` : '';
      state.hasMoreMessages = false;
      list.scrollTop = list.scrollHeight; updateJumpButton(); return;
    }
    const params = { chat_id: state.activeChat.chat_id, connection_id: state.activeChat.connection_id, offset: state.messageOffset, limit: 50 };
    if (state.messageSearch.trim()) params.q = state.messageSearch.trim();
    const { data } = await miniAppClient.get('/api/miniapp/messages', { params });
    const rows = (data.messages || []).slice().reverse();
    const html = renderMessageBatch(rows);
    if (!append) list.innerHTML = html || '<div class="empty-state"><b>Сообщений не найдено</b>Попробуй изменить запрос</div>';
    else if (html) {
      const first = list.querySelector('.message-bubble[data-date-key]');
      const last = rows[rows.length - 1];
      if (first?.dataset.dateKey && localDateKey(last?.sent_at || last?.updated_at) === first.dataset.dateKey) {
        const d = first.previousElementSibling;
        if (d?.classList.contains('message-date-divider')) d.remove();
      }
      list.insertAdjacentHTML('afterbegin', html);
    }
    if ($('message-search-hits')) $('message-search-hits').textContent = state.messageSearch.trim() ? `${rows.length}` : '';
    hydrateTgsStickers(list);
    state.messageOffset = data.next_offset ?? (state.messageOffset + (data.messages || []).length);
    state.hasMoreMessages = data.next_offset !== null && data.next_offset !== undefined;
    list.scrollTop = append ? list.scrollHeight - oldH : list.scrollHeight;
    updateJumpButton();
  } catch (e) { if (!append) list.innerHTML = `<div class="empty-state"><b>Ошибка загрузки</b>${esc(apiError(e))}</div>`; }
  finally { state.loadingMessages = false; }
}
function updateJumpButton() {
  const l = $('messages-list'), b = $('jump-bottom'); if (!l || !b) return;
  b.classList.toggle('hidden', l.scrollHeight - l.scrollTop - l.clientHeight < 420);
}
window.scrollMessagesToBottom = () => { const l = $('messages-list'); if (l) l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }); };
async function showEditHistory(id, conn = state.activeChat?.connection_id) {
  if (!state.activeChat || !conn) return;
  try {
    const data = DEMO
      ? { versions: [{ changed_at: new Date(NOW - 6 * H).toISOString(), old_text: 'Скинь фотки с праздника', new_text: 'Кстати, скинь фотки с выходных' }] }
      : (await miniAppClient.get('/api/miniapp/message_versions', { params: { chat_id: state.activeChat.chat_id, connection_id: conn, message_id: id } })).data;
    const vs = data.versions || [];
    $('history-body').innerHTML = vs.length
      ? vs.map((v, i) => `<section class="history-entry"><small>Правка ${i + 1} · ${esc(fmtDate(v.changed_at))}</small><div class="history-label old">Было</div><p>${esc(v.old_text || 'Пусто')}</p><div class="history-label new">Стало</div><p>${esc(v.new_text || 'Пусто')}</p></section>`).join('')
      : '<p class="empty-state">История правок не найдена.</p>';
    $('history-modal').classList.add('active');
  } catch (e) { alertUser(`Не удалось загрузить историю: ${apiError(e)}`); }
}
window.closeHistory = (e) => { if (e && e.target !== $('history-modal') && !e.target.closest('button')) return; $('history-modal').classList.remove('active'); };
$('messages-list')?.addEventListener('error', (ev) => {
  const t = ev.target;
  if ((t instanceof HTMLImageElement && t.classList.contains('message-sticker-image')) || (t instanceof HTMLVideoElement && t.classList.contains('message-sticker-video'))) {
    const f = document.createElement('div'); f.className = 'sticker-unavailable'; f.textContent = 'Стикер недоступен'; t.replaceWith(f);
  }
}, true);
$('messages-list')?.addEventListener('scroll', () => {
  const l = $('messages-list');
  if (l.scrollTop < 70 && state.hasMoreMessages && !state.loadingMessages) loadMessages(true);
  updateJumpButton();
}, { passive: true });
let chatSearchTimer;
$('chat-search')?.addEventListener('input', (e) => { state.chatSearch = e.target.value; state.activeViewId = 0; renderViews(); syncToolbar(); clearTimeout(chatSearchTimer); chatSearchTimer = setTimeout(loadChats, 280); });
$('chat-sort')?.addEventListener('change', (e) => { state.sort = e.target.value; saveLocal(); renderChats(); haptic(); });
$('archive-filters')?.addEventListener('click', (e) => { const b = e.target.closest('.chat-tab'); if (!b) return; state.filter = b.dataset.filter; state.activeViewId = 0; renderViews(); syncToolbar(); renderChats(); haptic(); });
$('toggle-message-search')?.addEventListener('click', () => {
  const w = $('message-search-wrap'); if (!w) return;
  w.classList.toggle('hidden');
  if (!w.classList.contains('hidden')) $('message-search')?.focus();
  else { if ($('message-search')) $('message-search').value = ''; state.messageSearch = ''; if ($('message-search-hits')) $('message-search-hits').textContent = ''; loadMessages(false); }
});
$('close-message-search')?.addEventListener('click', () => {
  $('message-search-wrap')?.classList.add('hidden');
  if ($('message-search')) $('message-search').value = '';
  state.messageSearch = '';
  if ($('message-search-hits')) $('message-search-hits').textContent = '';
  loadMessages(false);
});
let msgSearchTimer;
$('message-search')?.addEventListener('input', () => { clearTimeout(msgSearchTimer); msgSearchTimer = setTimeout(() => { state.messageSearch = $('message-search').value; loadMessages(false); }, 320); });
$('messages-list')?.addEventListener('click', async (ev) => {
  const reply = ev.target.closest('[data-reply-to]');
  if (reply) {
    const id = Number(reply.dataset.replyTo), conn = reply.dataset.replyConnection || state.activeChat?.connection_id || '';
    const find = () => [...$('messages-list').querySelectorAll('[data-message-id]')].find(n => Number(n.dataset.messageId) === id && n.dataset.connectionId === conn);
    const hl = (n) => { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('reply-highlight'); setTimeout(() => n.classList.remove('reply-highlight'), 1400); };
    const t = find();
    if (t) hl(t);
    else if (state.activeChat && !DEMO) {
      try {
        const { data } = await miniAppClient.get('/api/miniapp/messages', { params: { chat_id: state.activeChat.chat_id, connection_id: conn, filter: 'all', offset: 0, limit: 50, around_message_id: id, around_connection_id: conn } });
        const rows = (data.messages || []).slice().reverse();
        $('messages-list').innerHTML = renderMessageBatch(rows) || '<div class="empty-state">Сообщение не найдено</div>';
        hydrateTgsStickers($('messages-list'));
        state.messageOffset = data.next_offset ?? rows.length;
        state.hasMoreMessages = data.next_offset !== null && data.next_offset !== undefined;
        requestAnimationFrame(() => { const f = find(); if (f) hl(f); });
      } catch (e) { alertUser(`Не удалось открыть сообщение: ${apiError(e)}`); }
    }
    return;
  }
  const h = ev.target.closest('[data-history]');
  if (h) return showEditHistory(Number(h.dataset.history), h.dataset.historyConnection);
  const m = ev.target.closest('[data-media-url]');
  if (m && !ev.target.closest('audio')) openLightbox(m.dataset.mediaUrl, m.dataset.mediaType, Number(m.dataset.mid));
});

/* ── drawer ────────────────────────────────────────────────────────────── */
window.openChatDrawer = () => {
  const c = state.activeChat; if (!c) return;
  const id = Number(c.chat_id), [a, b] = avColors(id);
  const meta = KIND_META[chatKind(c)] || KIND_META.private;
  const av = $('drawer-avatar');
  av.style.setProperty('--av-a', a); av.style.setProperty('--av-b', b);
  av.textContent = (c.label || '?').trim().slice(0, 1).toUpperCase();
  $('drawer-title').textContent = c.label || `Чат ${id}`;
  $('drawer-sub').textContent = `${meta.label}${c.chat_username ? ' · @' + c.chat_username : ''}`;
  $('drawer-stats').innerHTML = [['Сообщений', num(c.total)], ['Медиа', num(c.media || 0)], ['Удалено', num(c.deleted || 0)]]
    .map(([l, v]) => `<div class="drawer-stat"><strong>${v}</strong><span>${l}</span></div>`).join('');
  const parts = [['Фото и видео', Number(c.media || 0), 'cyan'], ['Удалённые', Number(c.deleted || 0), 'rose'], ['Изменённые', Number(c.edited || 0), 'amber'], ['Непрочитанные', Number(c.unread || 0), 'sapphire']];
  const max = Math.max(1, ...parts.map(p => p[1]));
  $('drawer-bars').innerHTML = parts.map(([l, v, t]) => `<div class="breakdown-row" style="--tone:var(--${t})"><span><i></i>${l}</span><i><b style="width:${Math.max(2, v / max * 100)}%"></b></i><strong>${num(v)}</strong></div>`).join('');
  const pinned = state.pinned.includes(id);
  $('drawer-actions').innerHTML = `
    <button class="drawer-action is-gold" data-act="pin"><svg class="icon"><use href="#i-pin"></use></svg>${pinned ? 'Открепить чат' : 'Закрепить вверху списка'}</button>
    <button class="drawer-action" data-act="copy"><svg class="icon"><use href="#i-copy"></use></svg>Скопировать ID чата</button>
    <button class="drawer-action" data-act="search"><svg class="icon"><use href="#i-search"></use></svg>Искать в переписке</button>
    <button class="drawer-action is-danger" data-act="hide"><svg class="icon"><use href="#i-eye-off"></use></svg>Скрыть из архива</button>`;
  $('drawer-actions').onclick = (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'pin') { togglePin(id); closeChatDrawer(); }
    if (act === 'copy') navigator.clipboard?.writeText(String(id)).then(() => toast('ID скопирован', String(id), 'green')).catch(() => alertUser(String(id)));
    if (act === 'search') { closeChatDrawer(); $('message-search-wrap')?.classList.remove('hidden'); $('message-search')?.focus(); }
    if (act === 'hide') { closeChatDrawer(); hideChats([id]); setPage('chats'); }
  };
  $('chat-drawer')?.classList.add('active'); haptic();
};
window.closeChatDrawer = (e) => { if (e && e.target !== $('chat-drawer') && !e.target.closest('.drawer-close')) return; $('chat-drawer')?.classList.remove('active'); };

/* ── медиа ─────────────────────────────────────────────────────────────── */
function openLightbox(url, type, id) {
  state.currentMedia = { messageId: id, chat: state.activeChat };
  const box = $('lightbox-media-container'); box.innerHTML = '';
  let node;
  if (type === 'photo') { node = document.createElement('img'); node.src = url; }
  else if (['video', 'video_note', 'animation'].includes(type)) {
    node = document.createElement('video'); node.src = url; node.controls = true; node.autoplay = true; node.playsInline = true;
    if (url.startsWith('data:')) node.poster = url;
    if (type === 'video_note') node.className = 'lightbox-video-note';
  } else if (['voice', 'audio'].includes(type)) { node = document.createElement('audio'); node.src = url; node.controls = true; }
  else { node = document.createElement('div'); node.textContent = 'Предпросмотр недоступен'; }
  box.appendChild(node);
  const cap = $('lightbox-caption');
  if (cap) cap.textContent = type === 'video_note' ? 'Видеосообщение' : type === 'photo' ? 'Фото из архива' : 'Медиа из архива';
  $('media-lightbox').classList.add('active'); haptic();
}
window.closeLightbox = (e) => {
  if (e && e.target !== $('media-lightbox') && !e.target.closest('button')) return;
  $('lightbox-media-container').querySelectorAll('video,audio').forEach(m => { m.pause(); m.removeAttribute('src'); m.load(); });
  $('lightbox-media-container').innerHTML = '';
  $('media-lightbox').classList.remove('active'); state.currentMedia = null;
};

/* ── настройки / архив ─────────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const d = DEMO ? { edits: true, deletions: true, deleted_media: true } : (await miniAppClient.get('/api/miniapp/settings')).data;
    $('toggle-edits').checked = Boolean(d.edits);
    $('toggle-deletions').checked = Boolean(d.deletions);
    $('toggle-media').checked = Boolean(d.deleted_media);
  } catch (e) { console.warn(e); }
}
window.updateSetting = async (key, value) => {
  if (DEMO) { toast('Настройка сохранена', 'В демо — локально', 'green'); return; }
  try { await miniAppClient.post('/api/miniapp/settings', { [key]: value }); haptic(); toast('Сохранено', '', 'green'); }
  catch (e) { alertUser(apiError(e)); }
};
window.clearArchive = () => {
  if (demoBlock()) return;
  const run = async () => {
    try { const { data } = await miniAppClient.post('/api/miniapp/clear_archive'); alertUser(data.message || 'Архив очищен'); state.chats = []; renderChats(); await loadStats(); }
    catch (e) { alertUser(apiError(e)); }
  };
  if (tg?.showPopup) tg.showPopup({ title: 'Очистить архив?', message: 'Все сообщения и медиа будут удалены без возможности восстановления.', buttons: [{ id: 'cancel', type: 'cancel' }, { id: 'delete', type: 'destructive', text: 'Удалить' }] }, id => { if (id === 'delete') run(); });
  else if (confirm('Удалить весь архив без восстановления?')) run();
};

/* ── Premium / оплата ──────────────────────────────────────────────────── */
const PREMIUM_PLAN_VIEW = {
  7: { price: 45, regular: 100, discount: 55, saving: 55, note: 'Попробовать неделю' },
  14: { price: 69, regular: 150, discount: 54, saving: 81, note: 'Оптимальный срок' },
  30: { price: 120, regular: 300, discount: 60, saving: 180, note: 'Максимальная выгода' }
};
const payBtn = (p) => `Оплатить ${p} ₽<svg class="icon"><use href="#i-arrow-up-right"></use></svg>`;
function renderPlanRows() {
  const box = $('premium-plan-list'); if (!box) return;
  box.innerHTML = Object.entries(PREMIUM_PLAN_VIEW).map(([d, p]) => {
    const days = Number(d), sel = days === Number(state.selectedPremiumDays);
    return `<button type="button" class="premium-plan-row${sel ? ' is-selected' : ''}" data-days="${days}" aria-pressed="${sel}" onclick="selectPremiumPlan(${days})">
      ${days === 30 ? '<span class="premium-plan-badge">ВЫГОДНО</span>' : days === 14 ? '<span class="premium-plan-badge">ХИТ</span>' : ''}
      <span class="premium-plan-period"><b>${days} дней</b><small>${p.note}</small><em><svg class="icon"><use href="#i-zap"></use></svg>${Math.round(p.price / days)} ₽ в день</em></span>
      <span class="premium-plan-pricebox"><span class="premium-plan-old">${p.regular} ₽</span><strong>${p.price} ₽</strong><span class="premium-plan-saving">−${p.discount}%</span></span>
      <svg class="icon premium-plan-radio"><use href="#i-check-circle"></use></svg>
    </button>`;
  }).join('');
}
window.selectPremiumPlan = (days) => {
  days = Number(days); if (!PREMIUM_PLAN_VIEW[days]) return;
  state.selectedPremiumDays = days;
  updatePremiumPaymentSummary();
  renderPlanRows();
  haptic('light');
  setPage('premium-payment');
};
function updatePremiumPaymentSummary() {
  const d = Number(state.selectedPremiumDays || 14), p = PREMIUM_PLAN_VIEW[d] || PREMIUM_PLAN_VIEW[14];
  if ($('premium-payment-days')) $('premium-payment-days').textContent = `${d} дней`;
  if ($('premium-payment-old')) $('premium-payment-old').textContent = `${p.regular} ₽`;
  if ($('premium-payment-price')) $('premium-payment-price').textContent = `${p.price} ₽`;
  if ($('premium-payment-saving')) $('premium-payment-saving').textContent = `Экономия ${p.saving} ₽ · скидка ${p.discount}%`;
  const b = $('premium-action-btn'); if (b && !b.disabled) b.innerHTML = payBtn(p.price);
}
function initMethodTiles() {
  const wrap = $('method-tiles'), sel = $('premium-payment-method');
  if (!wrap || !sel) return;
  if (wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('click', (e) => {
    const tile = e.target.closest('.method-tile');
    if (!tile || tile.disabled) return;
    const method = Number(tile.dataset.method);
    state.paymentMethod = method;
    sel.value = String(method);
    wrap.querySelectorAll('.method-tile').forEach(t => t.classList.toggle('is-active', Number(t.dataset.method) === method));
    haptic(); updatePremiumPaymentSummary();
  });
  sel.value = String(state.paymentMethod);
  wrap.querySelectorAll('.method-tile').forEach(t => t.classList.toggle('is-active', Number(t.dataset.method) === state.paymentMethod));
}
async function loadPremium() {
  renderPlanRows(); initMethodTiles();
  try {
    const data = DEMO ? DEMO_PROFILE : (await miniAppClient.get('/api/miniapp/stats')).data;
    state.hasPermanentAccess = Boolean(data.has_permanent_access);
    if ($('premium-status-text')) $('premium-status-text').textContent = data.has_permanent_access ? 'Все функции открыты на этом аккаунте' : data.is_premium ? 'Premium активен' : 'Доступ включится после оплаты';
    if ($('premium-checkout-status')) $('premium-checkout-status').textContent = data.has_permanent_access ? 'Все функции уже открыты' : data.is_premium ? 'Новый срок добавится к текущему' : 'Разовый платёж · без автопродления';
    const cryptoTile = document.querySelector('.method-tile[data-method="13"]');
    const cryptoOpt = $('premium-payment-method')?.querySelector('option[value="13"]');
    const cryptoOn = Boolean(data.premium_crypto_enabled);
    if (cryptoOpt) cryptoOpt.disabled = !cryptoOn;
    if (cryptoTile) {
      cryptoTile.disabled = !cryptoOn;
      const small = cryptoTile.querySelector('small');
      if (small) small.textContent = cryptoOn ? 'USDT, TON, BTC' : 'Скоро появится';
      if (!cryptoOn && state.paymentMethod === 13) {
        state.paymentMethod = 2;
        if ($('premium-payment-method')) $('premium-payment-method').value = '2';
        document.querySelectorAll('.method-tile').forEach(t => t.classList.toggle('is-active', Number(t.dataset.method) === 2));
      }
    }
    const b = $('premium-action-btn');
    if (b) {
      const p = PREMIUM_PLAN_VIEW[state.selectedPremiumDays] || PREMIUM_PLAN_VIEW[14];
      if (data.has_permanent_access) { b.disabled = true; b.innerHTML = 'Все функции уже открыты<svg class="icon"><use href="#i-check-circle"></use></svg>'; }
      else { b.disabled = !data.premium_payment_ready; b.innerHTML = data.premium_payment_ready ? payBtn(p.price) : 'Оплата временно недоступна'; }
    }
    const t = $('premium-timer');
    if (t) { if (!data.has_permanent_access && data.premium_expires_at) { t.classList.remove('hidden'); startPremiumTimer(data.premium_expires_at); } else t.classList.add('hidden'); }
    updatePremiumPaymentSummary();
    if (b && data.has_permanent_access) { b.disabled = true; b.innerHTML = 'Все функции уже открыты<svg class="icon"><use href="#i-check-circle"></use></svg>'; }
  } catch (e) { console.warn('premium', e); }
}
window.startPremiumPayment = async () => {
  if (demoBlock()) return;
  const input = $('premium-email'), btn = $('premium-action-btn');
  const email = String(input?.value || '').trim();
  if (!input || !input.checkValidity() || !email) { input?.focus(); return alertUser('Укажи корректный email — на него придёт чек.'); }
  if (state.hasPermanentAccess) return alertUser('Все функции уже открыты на этом аккаунте.');
  const plan = PREMIUM_PLAN_VIEW[state.selectedPremiumDays] || PREMIUM_PLAN_VIEW[14];
  if (btn) { btn.disabled = true; btn.textContent = 'Создаём платёж…'; }
  try {
    const method = Number($('premium-payment-method')?.value || state.paymentMethod || 2);
    const { data } = await miniAppClient.post('/api/miniapp/premium/create', { email, payment_method: method, plan_days: state.selectedPremiumDays });
    if (!data.redirect || !/^https:\/\//i.test(data.redirect)) throw new Error('Platega не вернула ссылку на оплату.');
    tg?.openLink ? tg.openLink(data.redirect) : window.open(data.redirect, '_blank', 'noopener');
    toast('Платёж создан', `${plan.price} ₽ · ${state.selectedPremiumDays} дней`, 'gold');
  } catch (e) { alertUser(e?.response?.data?.error || e.message || 'Не удалось создать платёж. Попробуй позже.'); }
  finally { if (btn) { btn.disabled = false; await loadPremium(); } }
};

/* ── рефералы ──────────────────────────────────────────────────────────── */
async function loadReferrals() {
  try {
    const d = DEMO ? { link: 'https://t.me/HadesSaveBot?start=ref_demo', count: 3 } : (await miniAppClient.get('/api/miniapp/referrals')).data;
    state.refLink = d.link || '';
    const c = Number(d.count || 0);
    animateNumber($('ref-count'), c);
    const left = 5 - (c % 5);
    const bar = $('ref-progress-bar'), txt = $('ref-progress-text');
    if (bar) bar.style.width = `${Math.min(100, (c % 5) / 5 * 100)}%`;
    if (txt) txt.textContent = c === 0 ? 'До первого бонуса — 1 друг' : `До круглого бонуса — ${left} ${plural(left, 'друг', 'друга', 'друзей')}`;
  } catch (e) { console.warn(e); }
}
window.copyRefLink = async () => {
  if (!state.refLink) return;
  try { await navigator.clipboard.writeText(state.refLink); toast('Ссылка скопирована', 'Отправь её другу', 'green'); haptic('medium'); }
  catch (_) { alertUser(state.refLink); }
};
window.shareRefLink = () => {
  if (!state.refLink) return;
  const text = 'Подключай HadesSave — архив переписок, где сохраняется даже удалённое. Нам обоим дадут день Premium.';
  const url = `https://t.me/share/url?url=${encodeURIComponent(state.refLink)}&text=${encodeURIComponent(text)}`;
  tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank', 'noopener');
};
const FEATURE_INFO = {
  archive: ['Архив 30 дней', 'История хранится месяц вместо трёх дней. Удалённое и изменённое — тоже.'],
  media: ['Файлы до 50 МБ', 'Большие видео и документы сохраняются целиком, а не обрезаются.'],
  priority: ['Экспорт переписок', 'Скачивай любой чат в HTML или JSON — удобно хранить и пересылать.'],
  spam: ['.spam до 50 сообщений', 'Лимит команды поднят с 20 до 50 сообщений за раз.'],
  badge: ['Отметка в профиле', 'Цветной бейдж рядом с именем — видно сразу.'],
  support: ['Быстрая поддержка', 'Обращения Premium-аккаунтов разбираем вне очереди.']
};
window.openFeatureModal = (k) => { const r = FEATURE_INFO[k]; if (!r) return; $('feature-title').textContent = r[0]; $('feature-desc').textContent = r[1]; $('feature-modal').classList.add('active'); haptic(); };
window.closeFeatureModal = (e) => { if (e && e.target !== $('feature-modal') && !e.target.closest('button')) return; $('feature-modal').classList.remove('active'); };

/* ── админка ───────────────────────────────────────────────────────────── */
async function loadAdminStats() {
  if (!state.isAdmin) return;
  try {
    const d = DEMO ? DEMO_ADMIN_STATS : (await miniAppClient.get('/api/miniapp/admin/stats')).data;
    animateNumber($('adm-stat-users'), Number(d.users || 0));
    animateNumber($('adm-stat-stars'), Number(d.total_stars || 0));
    animateNumber($('adm-stat-prem'), Number(d.premium || 0));
    animateNumber($('adm-stat-week'), Number(d.week_premium || 0));
  } catch (e) { alertUser(apiError(e)); }
}
const MEDIA_TONES = { photo: 'cyan', video: 'sapphire', video_note: 'violet', voice: 'green', audio: 'lime', animation: 'magenta', document: 'amber', sticker: 'gold' };
async function loadAdminStatistics() {
  if (!state.isAdmin) return;
  const chart = $('admin-daily-chart'), recent = $('admin-recent-activity');
  if (chart) chart.innerHTML = '<div class="empty-state">Загружаем статистику…</div>';
  if (recent) recent.innerHTML = '<div class="empty-state">Загружаем…</div>';
  try {
    const data = DEMO ? DEMO_ADMIN_FULL : (await miniAppClient.get('/api/miniapp/admin/statistics')).data;
    const v = data.summary || {};
    const map = { 'full-users': 'users', 'full-active-users': 'active_users', 'full-connections': 'connections', 'full-active-connections': 'active_connections', 'full-messages': 'messages', 'full-chats': 'chats', 'full-media': 'media', 'full-deleted': 'deleted', 'full-edited': 'edited', 'full-premium': 'premium', 'full-referrals': 'referrals', 'full-referrals-rewarded': 'referrals_rewarded', 'full-referrals-pending': 'referrals_pending', 'full-payments': 'payments', 'full-stars': 'stars' };
    Object.entries(map).forEach(([id, k]) => animateNumber($(id), Number(v[k] || 0)));
    const days = Array.isArray(data.daily) ? data.daily : [];
    if (chart) {
      const max = Math.max(1, ...days.map(d => Math.max(Number(d.messages || 0), Number(d.users || 0))));
      chart.innerHTML = days.map(d => {
        const m = Number(d.messages || 0), u = Number(d.users || 0);
        return `<div class="daily-column" title="${esc(d.date)} · сообщений: ${m} · новых: ${u}"><div class="daily-bars"><i class="daily-users" style="height:${Math.max(u ? 4 : 2, Math.round(u / max * 78))}px"></i><i class="daily-messages" style="height:${Math.max(m ? 4 : 2, Math.round(m / max * 78))}px"></i></div><small>${esc(String(d.date || '').slice(5))}</small></div>`;
      }).join('') || '<div class="empty-state">Пока нет данных</div>';
    }
    if (recent) {
      const rows = Array.isArray(data.recent) ? data.recent : [];
      recent.innerHTML = rows.map(r => `<article class="recent-activity-row"><span class="recent-activity-dot"></span><div><b>${esc(r.action || 'Действие')}</b><small>${esc(r.details || '')}</small></div><time>${esc(fmtDate(r.created_at))}</time></article>`).join('') || '<div class="empty-state">Действий пока нет</div>';
    }
    const media = $('admin-media-breakdown');
    if (media) {
      const rows = Array.isArray(data.media_breakdown) ? data.media_breakdown : [];
      const names = { photo: 'Фото', video: 'Видео', video_note: 'Видеосообщения', voice: 'Голосовые', audio: 'Аудио', animation: 'GIF', document: 'Документы', sticker: 'Стикеры' };
      const max = Math.max(1, ...rows.map(r => Number(r.total || 0)));
      media.innerHTML = rows.map(r => `<div class="breakdown-row" style="--tone:var(--${MEDIA_TONES[r.type] || 'sapphire'})"><span><i></i>${esc(names[r.type] || r.type || 'Другое')}</span><i><b style="width:${Math.max(2, Number(r.total || 0) / max * 100)}%"></b></i><strong>${num(r.total)}</strong></div>`).join('') || '<div class="empty-state">Медиа пока нет</div>';
    }
    const top = $('admin-top-users');
    if (top) {
      const rows = Array.isArray(data.top_users) ? data.top_users : [];
      top.innerHTML = rows.map((r, i) => `<div class="top-user-row"><em>${i + 1}</em><span><b>${esc(r.name || 'Пользователь')}</b><small>${num(r.chats)} чатов</small></span><strong>${num(r.messages)}</strong></div>`).join('') || '<div class="empty-state">Пока нет активности</div>';
    }
    if ($('statistics-updated-at')) $('statistics-updated-at').textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;
  } catch (e) {
    if (chart) chart.innerHTML = `<div class="empty-state">${esc(apiError(e))}</div>`;
    if (recent) recent.innerHTML = '';
  }
}
$('stats-refresh')?.addEventListener('click', () => { const b = $('stats-refresh'); b?.classList.add('spinning'); loadAdminStatistics().finally(() => setTimeout(() => b?.classList.remove('spinning'), 550)); });
window.openAdminModal = async (action) => {
  if (!state.isAdmin) return;
  state.adminAction = action;
  $('admin-modal')?.classList.add('active');
  ['admin-input-fields', 'admin-broadcast-fields', 'admin-list-container', 'admin-grant-fields', 'admin-ban-fields', 'admin-role-fields'].forEach(id => { const e = $(id); if (e) e.style.display = 'none'; });
  $('admin-execute-btn').style.display = 'block';
  $('admin-modal-title').textContent = ({ grant: 'Выдать Premium', ban: 'Заблокировать', role: 'Роли', broadcast: 'Рассылка', bans: 'Блокировки' })[action] || 'Действие';
  if (['grant', 'ban', 'role'].includes(action)) $('admin-input-fields').style.display = 'block';
  if (action === 'grant') $('admin-grant-fields').style.display = 'block';
  if (action === 'ban') $('admin-ban-fields').style.display = 'block';
  if (action === 'role') $('admin-role-fields').style.display = 'block';
  if (action === 'broadcast') $('admin-broadcast-fields').style.display = 'block';
  if (action === 'bans') {
    $('admin-list-container').style.display = 'block'; $('admin-execute-btn').style.display = 'none';
    try {
      const d = DEMO ? { bans: [{ user_id: 123456, username: 'spammer', reason: 'Спам в чатах', banned_at: new Date(NOW - D).toISOString() }] } : (await miniAppClient.get('/api/miniapp/admin/bans')).data;
      $('admin-list-container').innerHTML = (d.bans || []).map(b => `<div class="ban-row"><b>${esc(b.user_id)} ${b.username ? '@' + esc(b.username) : ''}</b><p>${esc(b.reason)}</p><small>${esc(b.banned_at || '')}</small></div>`).join('') || '<p class="empty-state">Список пуст</p>';
    } catch (e) { $('admin-list-container').textContent = apiError(e); }
  }
};
window.closeAdminModal = (e) => { if (e && e.target !== $('admin-modal') && !e.target.closest('button')) return; $('admin-modal')?.classList.remove('active'); };
window.executeAdminAction = async () => {
  if (!state.isAdmin || demoBlock()) return;
  const btn = $('admin-execute-btn'), old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Выполняем…';
  try {
    let r;
    if (state.adminAction === 'grant') r = await miniAppClient.post('/api/miniapp/admin/grant', { target: $('admin-target').value.trim(), days: Number($('admin-days').value || 30) });
    else if (state.adminAction === 'ban') r = await miniAppClient.post('/api/miniapp/admin/ban', { target: $('admin-target').value.trim(), reason: $('admin-reason').value.trim() || 'Без причины' });
    else if (state.adminAction === 'role') r = await miniAppClient.post('/api/miniapp/admin/roles', { target: $('admin-target').value.trim(), role: $('admin-role-select').value });
    else if (state.adminAction === 'broadcast') r = await miniAppClient.post('/api/miniapp/admin/broadcast', { text: $('admin-broadcast-text').value.trim() });
    if (r) toast(r.data.message || 'Готово', '', 'green');
    closeAdminModal(); loadAdminStats();
  } catch (e) { alertUser(apiError(e)); }
  finally { btn.disabled = false; btn.textContent = old; }
};
async function loadConnectionGuide() {
  if (!state.isAdmin) return;
  const img = $('connection-guide-preview'), empty = $('connection-guide-empty'), st = $('connection-guide-status');
  if (DEMO) {
    if (img) { img.hidden = true; img.removeAttribute('src'); }
    if (empty) { empty.style.display = 'block'; empty.textContent = 'Фото ещё не загружено'; }
    if (st) st.textContent = 'Показывается на экране подключения.';
    return;
  }
  if (st) st.textContent = 'Загружаем текущее фото…';
  try {
    const { data } = await miniAppClient.get('/api/miniapp/admin/connection-guide');
    if (data.exists && data.image_data_url && img) {
      img.src = data.image_data_url; img.hidden = false;
      if (empty) empty.style.display = 'none';
      if (st) st.textContent = `Сейчас: ${data.filename} · ${(Number(data.size_bytes || 0) / 1048576).toFixed(2)} МБ`;
    } else {
      if (img) { img.hidden = true; img.removeAttribute('src'); }
      if (empty) { empty.style.display = 'block'; empty.textContent = 'Фото ещё не загружено'; }
      if (st) st.textContent = 'Загрузи PNG или JPG — он будет на экране подключения.';
    }
  } catch (e) {
    if (st) st.textContent = apiError(e);
    if (empty) { empty.style.display = 'block'; empty.textContent = 'Не удалось загрузить фото'; }
  }
}
window.uploadConnectionGuide = async () => {
  if (!state.isAdmin || demoBlock()) return;
  const input = $('connection-guide-file'), file = input?.files?.[0];
  if (!file) return alertUser('Сначала выбери фото.');
  if (!['image/png', 'image/jpeg'].includes(file.type)) return alertUser('Только PNG или JPG.');
  if (file.size > 8 * 1024 * 1024) return alertUser('Максимум 8 МБ.');
  const btn = document.querySelector('.connection-guide-admin-card .primary-button'), old = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Загружаем…'; }
  try {
    const form = new FormData(); form.append('image', file, file.name);
    const { data } = await miniAppClient.upload('/api/miniapp/admin/connection-guide', form);
    toast(data.message || 'Фото обновлено', '', 'green');
    input.value = ''; await loadConnectionGuide();
  } catch (e) { alertUser(apiError(e)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old || 'Загрузить фото'; } }
};
function renderSwatches() {
  const row = $('swatch-row'); if (!row || row.childElementCount) return;
  row.innerHTML = SWATCHES.map(c => `<button class="swatch" style="--sw:${c}" data-color="${c}" aria-label="Цвет ${c}"></button>`).join('');
  row.onclick = (e) => {
    const b = e.target.closest('.swatch'); if (!b) return;
    $('prefix-color').value = b.dataset.color; updatePrefixPreview();
    row.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s === b));
    haptic();
  };
}
async function loadPrefixes() {
  if (!state.isAdmin) return;
  try {
    const d = DEMO ? { prefixes: DEMO_PREFIXES } : (await miniAppClient.get('/api/miniapp/admin/prefixes')).data;
    state.prefixes = Array.isArray(d.prefixes) ? d.prefixes : [];
    const sel = $('prefix-select');
    if (sel) sel.innerHTML = '<option value="">Выбери бейдж</option>' + state.prefixes.map(p => `<option value="${Number(p.id)}">${esc(p.name)} · ${num(p.assigned_count)} польз.</option>`).join('');
    const list = $('prefix-list');
    if (list) list.innerHTML = state.prefixes.length
      ? state.prefixes.map(p => `<button type="button" class="prefix-list-row" data-prefix-edit="${Number(p.id)}"><span class="prefix-color-dot" style="--prefix-color:${esc(p.color)}"></span><span class="prefix-list-name">${esc(p.name)}</span><small>${num(p.assigned_count)} назнач.</small><span class="prefix-edit-label">Изменить</span></button>`).join('')
      : '<div class="empty-state">Бейджей пока нет. Создай первый выше.</div>';
  } catch (e) { if ($('prefix-list')) $('prefix-list').textContent = apiError(e); }
}
function updatePrefixPreview() {
  const name = ($('prefix-name')?.value || 'БЕЙДЖ').trim() || 'БЕЙДЖ';
  const color = $('prefix-color')?.value || '#f5c451';
  const p = $('prefix-preview');
  if (p) { p.textContent = name; p.style.setProperty('--prefix-color', color); }
}
window.editPrefix = (id) => {
  if (!state.isAdmin) return;
  const p = state.prefixes.find(x => Number(x.id) === Number(id)); if (!p) return;
  state.editingPrefixId = Number(p.id);
  $('prefix-name').value = p.name;
  $('prefix-color').value = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#f5c451';
  $('prefix-save-btn').textContent = 'Сохранить';
  updatePrefixPreview(); $('prefix-name')?.focus();
};
$('prefix-name')?.addEventListener('input', updatePrefixPreview);
$('prefix-color')?.addEventListener('input', updatePrefixPreview);
$('prefix-list')?.addEventListener('click', (e) => { const r = e.target.closest('[data-prefix-edit]'); if (r) editPrefix(r.dataset.prefixEdit); });
window.savePrefix = async () => {
  if (!state.isAdmin) return;
  const name = $('prefix-name').value.trim(), color = $('prefix-color').value;
  if (!name) return alertUser('Введи название бейджа.');
  if (DEMO) {
    const id = state.editingPrefixId || Date.now();
    const ex = state.prefixes.find(p => p.id === id);
    if (ex) { ex.name = name; ex.color = color; } else state.prefixes.push({ id, name, color, assigned_count: 0 });
    state.editingPrefixId = 0; $('prefix-name').value = ''; $('prefix-save-btn').textContent = 'Создать';
    updatePrefixPreview(); loadPrefixes(); toast('Бейдж сохранён', name, 'green'); return;
  }
  try {
    const { data } = await miniAppClient.post('/api/miniapp/admin/prefixes', { action: 'save', id: state.editingPrefixId || 0, name, color });
    toast(data.message || 'Бейдж сохранён', '', 'green');
    state.editingPrefixId = 0; $('prefix-name').value = ''; $('prefix-save-btn').textContent = 'Создать';
    updatePrefixPreview(); await loadPrefixes();
  } catch (e) { alertUser(apiError(e)); }
};
window.deletePrefix = async () => {
  if (!state.isAdmin) return;
  const id = Number($('prefix-select').value || state.editingPrefixId || 0);
  if (!id) return alertUser('Сначала выбери бейдж.');
  if (DEMO) {
    const removed = state.prefixes.find(p => p.id === id);
    state.prefixes = state.prefixes.filter(p => p.id !== id);
    loadPrefixes();
    toast('Бейдж удалён', removed?.name || '', 'rose', { label: 'Вернуть', run: () => { if (removed) { state.prefixes.push(removed); loadPrefixes(); } } });
    return;
  }
  if (!confirm('Удалить бейдж? Он снимется у всех пользователей.')) return;
  try {
    const { data } = await miniAppClient.post('/api/miniapp/admin/prefixes', { action: 'delete', id });
    toast(data.message || 'Бейдж удалён', '', 'green');
    state.editingPrefixId = 0; $('prefix-name').value = ''; $('prefix-save-btn').textContent = 'Создать';
    await loadPrefixes();
  } catch (e) { alertUser(apiError(e)); }
};
window.assignPrefix = async () => {
  if (!state.isAdmin || demoBlock()) return;
  const userId = Number($('prefix-target').value.trim()), prefixId = Number($('prefix-select').value || 0);
  if (!Number.isSafeInteger(userId) || userId < 1) return alertUser('Введи корректный Telegram ID.');
  if (!prefixId) return alertUser('Выбери бейдж из списка.');
  try { const { data } = await miniAppClient.post('/api/miniapp/admin/prefixes', { action: 'assign', user_id: userId, prefix_id: prefixId }); toast(data.message || 'Бейдж назначен', '', 'green'); await loadPrefixes(); }
  catch (e) { alertUser(apiError(e)); }
};
window.removeUserPrefix = async () => {
  if (!state.isAdmin || demoBlock()) return;
  const userId = Number($('prefix-target').value.trim());
  if (!Number.isSafeInteger(userId) || userId < 1) return alertUser('Введи корректный Telegram ID.');
  try { const { data } = await miniAppClient.post('/api/miniapp/admin/prefixes', { action: 'assign', user_id: userId, prefix_id: 0 }); toast(data.message || 'Бейдж снят', '', 'green'); await loadPrefixes(); }
  catch (e) { alertUser(apiError(e)); }
};

/* ── назад / клавиши ───────────────────────────────────────────────────── */
function goBack() {
  if ($('chat-drawer')?.classList.contains('active')) return closeChatDrawer();
  if ($('history-modal')?.classList.contains('active')) return closeHistory();
  if ($('media-lightbox')?.classList.contains('active')) return closeLightbox();
  if ($('feature-modal')?.classList.contains('active')) return closeFeatureModal();
  if ($('view-modal')?.classList.contains('active')) return closeSaveViewModal();
  if ($('admin-modal')?.classList.contains('active')) return closeAdminModal();
  if (state.bulk) return exitBulkMode();
  if ($('view-messages')?.classList.contains('active')) return setPage('chats');
  if ($('view-premium-payment')?.classList.contains('active')) return setPage('premium-buy');
  if ($('view-premium-buy')?.classList.contains('active')) return setPage('premium');
  if ($('view-premium')?.classList.contains('active')) return setPage('home');
  if ($('view-chats')?.classList.contains('active')) return setPage('home');
  if ($('view-statistics')?.classList.contains('active')) return setPage('admin');
  if ($('view-admin')?.classList.contains('active')) return setPage('profile');
  if ($('view-settings')?.classList.contains('active')) return setPage('profile');
  if ($('view-referrals')?.classList.contains('active')) return setPage('home');
  setPage('home');
}
try { tg?.BackButton?.onClick(goBack); } catch (_) {}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') goBack();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusArchiveSearch(); }
});

renderSwatches();
updatePrefixPreview();
initApp();
