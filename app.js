import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const initData = tg.initData;

if (!initData) {
    document.body.innerHTML = '<h2 style="color:white;text-align:center;margin-top:50px;">Открой через бота в Telegram</h2>';
} else {
    setTelegramInitData(initData);
    setTimeout(() => { if (!document.getElementById('preloader').classList.contains('hidden')) hidePreloader(); }, 5000);
    initApp();
}

const encodedInitData = encodeURIComponent(initData);
let refLink = "";
let allChatsData = [];
let currentRole = null;
let adminActionType = '';
let premiumTimerInterval = null;

function hidePreloader() {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.remove(), 400);
    }
}

// --- ТАЙМЕР ПРЕМИУМА ---
function startPremiumTimer(expiresAtStr) {
    if (premiumTimerInterval) clearInterval(premiumTimerInterval);
    if (!expiresAtStr) return;
    
    const expiresAt = new Date(expiresAtStr).getTime();
    const timerEl = document.getElementById('premium-timer-text');
    const timerWrap = document.getElementById('premium-timer');
    timerWrap.classList.remove('hidden');
    
    premiumTimerInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = expiresAt - now;
        
        if (distance < 0) {
            clearInterval(premiumTimerInterval);
            timerEl.textContent = "Истек";
            timerWrap.classList.add('hidden');
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        timerEl.textContent = `${days}д ${hours}ч ${minutes}м ${seconds}с`;
    }, 1000);
}

const FEATURE_DATA = {
    'archive': { title: 'Безлимитный архив', icon: '#icon-infinity', bg: 'bg-blue', desc: 'Срок хранения сообщений увеличивается с 3 дней до 30 дней.' },
    'priority': { title: 'Приоритетное сохранение', icon: '#icon-shield', bg: 'bg-purple', desc: 'Твои файлы и медиа удаляются последними при очистке сервера.' },
    'mirrors': { title: 'До 5 зеркал', icon: '#icon-bot', bg: 'bg-cyan', desc: 'Возможность создать 5 клонов бота на своих токенах.' },
    'spam': { title: 'Увеличенный .spam', icon: '#icon-zap', bg: 'bg-green', desc: 'Лимит команды .spam повышается с 20 до 50 сообщений.' },
    'badge': { title: 'Уникальный значок', icon: '#icon-crown', bg: 'bg-yellow', desc: 'Эксклюзивная красная корона в профиле Mini App.' },
    'support': { title: 'Приоритетная поддержка', icon: '#icon-headphones', bg: 'bg-green', desc: 'Ответ администратора в течение 15 минут.' },
    'media': { title: 'Увеличенный лимит медиа', icon: '#icon-upload', bg: 'bg-blue', desc: 'Загрузка файлов до 50 МБ вместо стандартных 20 МБ.' }
};

window.switchTab = function(tabName) {
    if (tabName === 'admin' && !currentRole) {
        tg.HapticFeedback.notificationOccurred('error');
        tg.showAlert('У вас нет доступа к админ-панели');
        return;
    }
    tg.HapticFeedback.impactOccurred('light');
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetPage = document.getElementById(`view-${tabName}`);
    if(targetPage) targetPage.classList.add('active');
    
    if (tabName !== 'messages' && tabName !== 'premium' && tabName !== 'referrals' && tabName !== 'admin' && tabName !== 'settings') {
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`);
        if (navBtn) navBtn.classList.add('active');
    } else {
        let activeNav = 'home';
        if(tabName === 'messages') activeNav = 'chats';
        if(tabName === 'premium' || tabName === 'referrals' || tabName === 'admin' || tabName === 'settings') activeNav = 'profile';
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${activeNav}')"]`);
        if (navBtn) navBtn.classList.add('active');
    }

    if (tabName === 'home') loadStats();
    if (tabName === 'chats') loadChats();
    if (tabName === 'premium') loadPremiumStatus();
    if (tabName === 'referrals') loadReferrals();
    if (tabName === 'admin') loadAdminStats();
    if (tabName === 'settings') loadSettings();
};

// --- НАСТРОЙКИ ---
async function loadSettings() {
    try {
        const res = await miniAppClient.get('/api/miniapp/settings');
        document.getElementById('toggle-edits').checked = res.data.edits;
        document.getElementById('toggle-deletions').checked = res.data.deletions;
        document.getElementById('toggle-media').checked = res.data.deleted_media;
    } catch(e) { console.error(e); }
}

window.updateSetting = async function(key, val) {
    tg.HapticFeedback.impactOccurred('light');
    try {
        await miniAppClient.post('/api/miniapp/settings', { [key]: val });
    } catch(e) { tg.showAlert("Ошибка сохранения"); }
};

window.clearArchive = function() {
    tg.showPopup({
        title: 'Очистить архив?',
        message: 'Все сообщения и медиа будут удалены навсегда. Это действие нельзя отменить.',
        buttons: [{id: 'cancel', type: 'cancel'}, {id: 'delete', type: 'destructive', text: 'Удалить'}]
    }, async (buttonId) => {
        if (buttonId === 'delete') {
            tg.HapticFeedback.notificationOccurred('success');
            try {
                const res = await miniAppClient.post('/api/miniapp/clear_archive');
                tg.showAlert(res.data.message);
                loadStats();
            } catch(e) { tg.showAlert("Ошибка очистки"); }
        }
    });
};

window.filterChats = function(type, btnElement) {
    tg.HapticFeedback.impactOccurred('light');
    document.querySelectorAll('.chat-tab').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    let filtered = [];
    if (type === 'all') filtered = allChatsData;
    else if (type === 'private') filtered = allChatsData.filter(c => c.chat_id > 0);
    else if (type === 'groups') filtered = allChatsData.filter(c => c.chat_id < 0);
    renderChatsList(filtered);
};

function renderChatsList(chats) {
    const listEl = document.getElementById('chats-list');
    listEl.innerHTML = '';
    if (chats.length === 0) { listEl.innerHTML = '<div class="empty-state">В этой категории пока пусто</div>'; return; }
    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const initial = chat.label ? chat.label[0].toUpperCase() : '?';
        let avatarHtml = `<div class="list-avatar">${initial}</div>`;
        if (chat.chat_username && chat.chat_username.trim() !== '') {
            const imgUrl = `https://t.me/i/userpic/320/${chat.chat_username}.jpg`;
            avatarHtml = `<img src="${imgUrl}" class="list-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt=""><div class="list-avatar" style="display:none;">${initial}</div>`;
        }
        div.innerHTML = `${avatarHtml}<div class="list-content"><div class="list-title">${chat.label || 'Чат ' + chat.chat_id}</div><div class="list-sub">${chat.total} сообщ. • ${chat.deleted_count} удал.</div></div><div class="list-meta">${chat.last_at ? chat.last_at.split(' ')[0] : ''}</div>`;
        div.onclick = () => loadMessages(chat.chat_id, chat.label);
        listEl.appendChild(div);
    });
}

async function loadChats() {
    const listEl = document.getElementById('chats-list');
    if (allChatsData.length > 0) { renderChatsList(allChatsData); return; }
    listEl.innerHTML = '<div class="empty-state">Загрузка чатов...</div>';
    try {
        const res = await miniAppClient.get('/api/miniapp/chats');
        allChatsData = res.data.chats || [];
        const allTabBtn = document.querySelector('.chat-tab');
        if(allTabBtn) { document.querySelectorAll('.chat-tab').forEach(btn => btn.classList.remove('active')); allTabBtn.classList.add('active'); }
        renderChatsList(allChatsData);
    } catch (err) { listEl.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
}

window.openFeatureModal = function(id) {
    const data = FEATURE_DATA[id];
    if(!data) return;
    tg.HapticFeedback.impactOccurred('medium');
    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-desc').textContent = data.desc;
    document.getElementById('modal-icon').innerHTML = `<use href="${data.icon}"></use>`;
    document.getElementById('modal-icon-container').className = `feature-icon ${data.bg}`;
    document.getElementById('feature-modal').classList.add('active');
};
window.closeFeatureModal = function(event) {
    const modal = document.getElementById('feature-modal');
    if (event && event.target !== modal && !event.target.closest('button')) return;
    tg.HapticFeedback.impactOccurred('light');
    modal.classList.remove('active');
};

async function loadReferrals() {
    try {
        const res = await miniAppClient.get('/api/miniapp/referrals');
        refLink = res.data.link;
        document.getElementById('ref-count').textContent = res.data.count;
    } catch(e) {}
}
window.copyRefLink = function() {
    if(refLink) { navigator.clipboard.writeText(refLink); tg.HapticFeedback.notificationOccurred('success'); tg.showAlert("Ссылка скопирована!"); }
};

async function initApp() {
    try {
        document.getElementById('user-name').textContent = 'Загрузка...';
        const res = await miniAppClient.get('/api/miniapp/stats');
        const user = res.data.user || 'Пользователь';
        const userId = res.data.user_id || 0;
        const username = res.data.username || '';
        const isPremium = res.data.is_premium || false; 
        const premiumExpiresAt = res.data.premium_expires_at || null;
        currentRole = res.data.role || null;
        
        document.getElementById('user-name').textContent = user;
        document.getElementById('user-id').textContent = 'ID: ' + userId;
        document.getElementById('stat-deleted').textContent = res.data.deleted_messages || 0;
        document.getElementById('stat-chats').textContent = res.data.chats_count || 0;
        document.getElementById('stat-media').textContent = res.data.media_count || 0;
        document.getElementById('profile-name').textContent = user;
        document.getElementById('profile-id').textContent = 'ID: ' + userId;

        if (isPremium) {
            document.getElementById('premium-badge').classList.remove('hidden');
            document.getElementById('profile-premium-badge').classList.remove('hidden');
            document.getElementById('premium-status-text').innerHTML = 'Подписка активна';
            document.getElementById('premium-action-btn').textContent = 'Продлить подписку';
            document.getElementById('premium-action-btn').style.background = 'var(--accent-red)';
            document.getElementById('premium-action-btn').style.color = '#fff';
            if (premiumExpiresAt) {
                startPremiumTimer(premiumExpiresAt);
            }
        } else {
            document.getElementById('premium-status-text').innerHTML = 'Подписка не активна';
            document.getElementById('premium-action-btn').textContent = 'Подключить Premium';
            document.getElementById('premium-timer').classList.add('hidden');
        }

        if (currentRole) {
            const roleBadge = document.getElementById('role-badge');
            const profRoleBadge = document.getElementById('profile-role-badge');
            const roleText = currentRole.toUpperCase();
            [roleBadge, profRoleBadge].forEach(el => { el.textContent = roleText; el.className = `role-badge role-${currentRole}`; el.classList.remove('hidden'); });
            document.getElementById('admin-tab-btn').classList.remove('hidden');
        } else {
            document.getElementById('role-badge').classList.add('hidden');
            document.getElementById('profile-role-badge').classList.add('hidden');
            document.getElementById('admin-tab-btn').classList.add('hidden');
        }

        if (username.trim() !== '') {
            const myAvatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
            const loadImage = (imgId, txtId) => new Promise((resolve) => {
                const img = document.getElementById(imgId); const txt = document.getElementById(txtId);
                if (!img || !txt) return resolve();
                img.onload = () => { img.style.display = 'block'; txt.style.display = 'none'; resolve(); };
                img.onerror = () => { img.style.display = 'none'; txt.style.display = 'block'; txt.textContent = user[0].toUpperCase(); resolve(); };
                img.src = myAvatarUrl;
            });
            await Promise.all([loadImage('user-avatar-img', 'user-avatar-text'), loadImage('profile-avatar-img', 'profile-avatar-text')]);
        } else {
            document.getElementById('user-avatar-text').textContent = user[0].toUpperCase();
            document.getElementById('profile-avatar-text').textContent = user[0].toUpperCase();
        }

        switchTab('home');
        hidePreloader();
    } catch (err) { console.error(err); hidePreloader(); }
}

async function loadStats() {
    try {
        const res = await miniAppClient.get('/api/miniapp/stats');
        document.getElementById('stat-deleted').textContent = res.data.deleted_messages || 0;
        document.getElementById('stat-chats').textContent = res.data.chats_count || 0;
        document.getElementById('stat-media').textContent = res.data.media_count || 0;
    } catch(e) {}
}
async function loadPremiumStatus() {
    try {
        const res = await miniAppClient.get('/api/miniapp/stats');
        const isPremium = res.data.is_premium || false;
        if (isPremium) {
            document.getElementById('premium-status-text').innerHTML = 'Подписка активна';
            document.getElementById('premium-action-btn').textContent = 'Продлить подписку';
            document.getElementById('premium-action-btn').style.background = 'var(--accent-red)';
            document.getElementById('premium-action-btn').style.color = '#fff';
        } else {
            document.getElementById('premium-status-text').innerHTML = 'Подписка не активна';
            document.getElementById('premium-action-btn').textContent = 'Подключить Premium';
            document.getElementById('premium-action-btn').style.background = 'var(--bg-card)';
            document.getElementById('premium-action-btn').style.color = '#fff';
        }
    } catch(e) {}
}

// --- ЛОГИКА АДМИНКИ ---

async function loadAdminStats() {
    if (!currentRole) return;
    try {
        const res = await miniAppClient.get('/api/miniapp/admin/stats');
        document.getElementById('adm-stat-users').textContent = res.data.users;
        document.getElementById('adm-stat-stars').textContent = res.data.total_stars;
        document.getElementById('adm-stat-prem').textContent = res.data.premium;
        document.getElementById('adm-stat-week').textContent = res.data.week_premium;
    } catch (err) { 
        tg.showAlert("Ошибка загрузки статистики. Возможно, у вас нет прав."); 
    }
}

window.openAdminModal = async function(type) {
    if (!currentRole) return;
    adminActionType = type;
    const modal = document.getElementById('admin-modal');
    modal.classList.add('active');
    
    document.getElementById('admin-input-fields').style.display = 'none';
    document.getElementById('admin-broadcast-fields').style.display = 'none';
    document.getElementById('admin-list-container').style.display = 'none';
    document.getElementById('admin-list-container').innerHTML = '';
    
    const title = document.getElementById('admin-modal-title');
    const execBtn = document.getElementById('admin-execute-btn');
    execBtn.style.display = 'block';

    if (type === 'grant') {
        title.textContent = 'Выдать Premium';
        document.getElementById('admin-input-fields').style.display = 'block';
        document.getElementById('admin-grant-fields').style.display = 'block';
        document.getElementById('admin-ban-fields').style.display = 'none';
        document.getElementById('admin-role-fields').style.display = 'none';
    } else if (type === 'ban') {
        title.textContent = 'Забанить';
        document.getElementById('admin-input-fields').style.display = 'block';
        document.getElementById('admin-grant-fields').style.display = 'none';
        document.getElementById('admin-ban-fields').style.display = 'block';
        document.getElementById('admin-role-fields').style.display = 'none';
    } else if (type === 'role') {
        title.textContent = 'Выдать админку';
        document.getElementById('admin-input-fields').style.display = 'block';
        document.getElementById('admin-grant-fields').style.display = 'none';
        document.getElementById('admin-ban-fields').style.display = 'none';
        document.getElementById('admin-role-fields').style.display = 'block';
    } else if (type === 'broadcast') {
        title.textContent = 'Рассылка';
        document.getElementById('admin-broadcast-fields').style.display = 'block';
    } else if (type === 'tickets') {
        title.textContent = 'Тикеты поддержки';
        document.getElementById('admin-list-container').style.display = 'block';
        execBtn.style.display = 'none';
        try {
            const res = await miniAppClient.get('/api/miniapp/admin/tickets');
            const tickets = res.data.tickets || [];
            const container = document.getElementById('admin-list-container');
            if (tickets.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);">Нет открытых тикетов</p>';
            } else {
                container.innerHTML = tickets.map(t => `
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">От: ${t.user_id} | ${t.created_at}</div>
                        <div style="font-size: 14px; color: #fff;">${t.body}</div>
                    </div>
                `).join('');
            }
        } catch(e) { container.innerHTML = '<p style="color:red;">Ошибка загрузки</p>'; }
    } else if (type === 'bans') {
        title.textContent = 'Бан-лист';
        document.getElementById('admin-list-container').style.display = 'block';
        execBtn.style.display = 'none';
        try {
            const res = await miniAppClient.get('/api/miniapp/admin/bans');
            const bans = res.data.bans || [];
            const container = document.getElementById('admin-list-container');
            if (bans.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);">Забаненных нет</p>';
            } else {
                container.innerHTML = bans.map(b => `
                    <div style="background: rgba(208, 0, 0, 0.1); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <div style="font-size: 12px; color: #ff4d4d; margin-bottom: 4px;">ID: ${b.user_id} ${b.username ? '@'+b.username : ''}</div>
                        <div style="font-size: 14px; color: #fff;">Причина: ${b.reason}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${b.banned_at}</div>
                    </div>
                `).join('');
            }
        } catch(e) { container.innerHTML = '<p style="color:red;">Ошибка загрузки</p>'; }
    }
    
    document.getElementById('admin-target').value = '';
    document.getElementById('admin-broadcast-text').value = '';
};

window.closeAdminModal = function(event) {
    if (event && event.target !== document.getElementById('admin-modal') && !event.target.closest('button')) return;
    document.getElementById('admin-modal').classList.remove('active');
};

window.executeAdminAction = async function() {
    if (!currentRole) return;
    const execBtn = document.getElementById('admin-execute-btn');
    const originalText = execBtn.textContent;
    execBtn.textContent = 'Выполняется...';
    execBtn.disabled = true;

    try {
        if (adminActionType === 'grant') {
            const target = document.getElementById('admin-target').value.trim();
            const days = parseInt(document.getElementById('admin-days').value) || 30;
            if (!target) throw new Error('Введите ID или @username');
            const res = await miniAppClient.post('/api/miniapp/admin/grant', { target, days });
            tg.showAlert(res.data.message);
        } else if (adminActionType === 'ban') {
            const target = document.getElementById('admin-target').value.trim();
            const reason = document.getElementById('admin-reason').value || 'Без причины';
            if (!target) throw new Error('Введите ID или @username');
            const res = await miniAppClient.post('/api/miniapp/admin/ban', { target, reason });
            tg.showAlert(res.data.message);
        } else if (adminActionType === 'role') {
            const target = document.getElementById('admin-target').value.trim();
            const role = document.getElementById('admin-role-select').value;
            if (!target) throw new Error('Введите ID или @username');
            const res = await miniAppClient.post('/api/miniapp/admin/roles', { target, role });
            tg.showAlert(res.data.message);
        } else if (adminActionType === 'broadcast') {
            const text = document.getElementById('admin-broadcast-text').value.trim();
            if (!text) throw new Error('Введите текст рассылки');
            const res = await miniAppClient.post('/api/miniapp/admin/broadcast', { text });
            tg.showAlert(res.data.message);
        }
        closeAdminModal();
        loadAdminStats();
    } catch (err) {
        const errorMsg = err.response?.data?.error || err.message || "Ошибка выполнения";
        tg.showAlert(errorMsg);
    } finally {
        execBtn.textContent = originalText;
        execBtn.disabled = false;
    }
};

async function loadMessages(chatId, chatLabel) {
    switchTab('messages');
    document.getElementById('chat-title').textContent = chatLabel || 'Сообщения';
    const listEl = document.getElementById('messages-list');
    listEl.innerHTML = '<div class="empty-state">Загрузка...</div>';
    try {
        const res = await miniAppClient.get(`/api/miniapp/messages?chat_id=${chatId}`);
        const messages = res.data.messages || [];
        listEl.innerHTML = '';
        if (messages.length === 0) { listEl.innerHTML = '<div class="empty-state">Нет сообщений</div>'; return; }
        messages.forEach(msg => {
            const div = document.createElement('div');
            let classes = 'message-item';
            if (msg.deleted) classes += ' deleted'; else if (msg.edited) classes += ' edited';
            div.className = classes;
            let text = msg.text || '';
            if (text) text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            let statusIcons = '';
            if (msg.deleted) statusIcons = '<svg class="text-svg" style="stroke: var(--accent-red);"><use href="#icon-trash"></use></svg>';
            else if (msg.edited) statusIcons = '<svg class="text-svg" style="stroke: var(--accent-yellow);"><use href="#icon-edit"></use></svg>';
            let mediaHtml = '';
            if (msg.has_media) {
                const mediaUrl = `${miniAppClient.defaults.baseURL}/api/miniapp/media?chat_id=${chatId}&message_id=${msg.message_id}&initData=${encodedInitData}`;
                const type = msg.content_type; const ext = msg.media_ext || '';
                if (type === 'sticker') {
                    if (ext === '.tgs') mediaHtml = `<div class="sticker-placeholder"><svg class="icon" style="width:48px;height:48px;color:var(--text-muted);"><use href="#icon-star"></use></svg></div>`;
                    else if (ext === '.webm') mediaHtml = `<video src="${mediaUrl}" autoplay loop muted playsinline class="msg-sticker-video"></video>`;
                    else mediaHtml = `<img src="${mediaUrl}" class="msg-sticker" loading="lazy" onerror="this.style.display='none'" alt="Стикер">`;
                } else if (type === 'photo') mediaHtml = `<img src="${mediaUrl}" class="msg-media" loading="lazy" onerror="this.style.display='none'" alt="Фото">`;
                else if (type === 'video') mediaHtml = `<video src="${mediaUrl}" controls playsinline class="msg-media" preload="metadata"></video>`;
                else if (type === 'video_note') mediaHtml = `<video src="${mediaUrl}" controls playsinline class="msg-video-note" preload="metadata"></video>`;
                else if (type === 'voice' || type === 'audio') mediaHtml = `<audio src="${mediaUrl}" controls class="msg-audio" preload="metadata"></audio>`;
                else if (type === 'animation') mediaHtml = `<video src="${mediaUrl}" autoplay loop muted playsinline class="msg-media"></video>`;
                else if (type === 'document') mediaHtml = `<a href="${mediaUrl}" target="_blank" class="msg-doc"><svg class="text-svg"><use href="#icon-export"></use></svg> Скачать файл</a>`;
            } else if (!text && msg.content_type !== 'text') text = `[${msg.content_type}]`;
            div.innerHTML = `<div class="msg-author">${msg.sender_name || 'Пользователь'} ${statusIcons}</div>${text ? `<div class="msg-text">${text}</div>` : ''}${mediaHtml ? `<div class="media-container">${mediaHtml}</div>` : ''}<div class="msg-time">${msg.updated_at}</div>`;
            listEl.appendChild(div);
        });
    } catch (err) { listEl.innerHTML = '<div class="empty-state">Ошибка загрузки сообщений</div>'; }
}
