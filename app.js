import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const initData = tg.initData;

if (!initData) {
    document.body.innerHTML = '<h2 style="color:white;text-align:center;margin-top:50px;">Открой через бота в Telegram</h2>';
} else {
    setTelegramInitData(initData);
    initApp();
}

const encodedInitData = encodeURIComponent(initData);
let refLink = "";
let allChatsData = [];

// Экспорт удален
const FEATURE_DATA = {
    'archive': { title: 'Безлимитный архив', icon: '#icon-infinity', bg: 'bg-blue', desc: 'Срок хранения сообщений увеличивается с 3 дней до 30 дней. Бот будет хранить всю историю переписок и медиафайлы целый месяц.' },
    'priority': { title: 'Приоритетное сохранение', icon: '#icon-shield', bg: 'bg-purple', desc: 'При автоматической очистке старых данных файлы и медиа Premium-пользователей удаляются в самую последнюю очередь.' },
    'mirrors': { title: 'До 5 зеркал', icon: '#icon-bot', bg: 'bg-cyan', desc: 'Вы можете создать до 5 клонов бота (зеркал) на своих токенах от @BotFather.' },
    'spam': { title: 'Увеличенный .spam', icon: '#icon-zap', bg: 'bg-green', desc: 'Лимит команды `.spam` повышается с 20 до 50 сообщений за один раз.' },
    'badge': { title: 'Уникальный значок', icon: '#icon-crown', bg: 'bg-yellow', desc: 'В профиле Mini App и в уведомлениях рядом с вашим именем появляется эксклюзивная красная корона.' },
    'support': { title: 'Приоритетная поддержка', icon: '#icon-headphones', bg: 'bg-green', desc: 'Ваши тикеты в поддержку обрабатываются вне очереди. Среднее время ответа — до 15 минут.' },
    'media': { title: 'Увеличенный лимит медиа', icon: '#icon-upload', bg: 'bg-blue', desc: 'Бот сможет сохранять файлы размером до 50 МБ (вместо 20 МБ).' }
};

window.switchTab = function(tabName) {
    tg.HapticFeedback.impactOccurred('light');
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetPage = document.getElementById(`view-${tabName}`);
    if(targetPage) targetPage.classList.add('active');
    
    if (tabName !== 'messages' && tabName !== 'premium' && tabName !== 'referrals') {
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`);
        if (navBtn) navBtn.classList.add('active');
    } else {
        let activeNav = 'home';
        if(tabName === 'messages') activeNav = 'chats';
        if(tabName === 'premium' || tabName === 'referrals') activeNav = 'profile';
        
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${activeNav}')"]`);
        if (navBtn) navBtn.classList.add('active');
    }

    if (tabName === 'home') loadStats();
    if (tabName === 'chats') loadChats();
    if (tabName === 'premium') loadPremiumStatus();
    if (tabName === 'referrals') loadReferrals();
};

window.filterChats = function(type, btnElement) {
    tg.HapticFeedback.impactOccurred('light');
    
    document.querySelectorAll('.chat-tab').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    let filtered = [];
    if (type === 'all') {
        filtered = allChatsData;
    } else if (type === 'private') {
        filtered = allChatsData.filter(c => c.chat_id > 0);
    } else if (type === 'groups') {
        filtered = allChatsData.filter(c => c.chat_id < 0);
    }

    renderChatsList(filtered);
};

function renderChatsList(chats) {
    const listEl = document.getElementById('chats-list');
    listEl.innerHTML = '';

    if (chats.length === 0) {
        listEl.innerHTML = '<div class="empty-state">В этой категории пока пусто</div>';
        return;
    }

    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        const initial = chat.label ? chat.label[0].toUpperCase() : '?';
        
        let avatarHtml = `<div class="list-avatar">${initial}</div>`;
        if (chat.chat_username && chat.chat_username.trim() !== '') {
            const imgUrl = `https://t.me/i/userpic/320/${chat.chat_username}.jpg`;
            avatarHtml = `<img src="${imgUrl}" class="list-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt=""><div class="list-avatar" style="display:none;">${initial}</div>`;
        }
        
        div.innerHTML = `
            ${avatarHtml}
            <div class="list-content">
                <div class="list-title">${chat.label || 'Чат ' + chat.chat_id}</div>
                <div class="list-sub">${chat.total} сообщ. • ${chat.deleted_count} удал.</div>
            </div>
            <div class="list-meta">${chat.last_at ? chat.last_at.split(' ')[0] : ''}</div>
        `;
        div.onclick = () => loadMessages(chat.chat_id, chat.label);
        listEl.appendChild(div);
    });
}

async function loadChats() {
    const listEl = document.getElementById('chats-list');
    if (allChatsData.length > 0) {
        renderChatsList(allChatsData);
        return;
    }

    listEl.innerHTML = '<div class="empty-state">Загрузка чатов...</div>';
    try {
        const res = await miniAppClient.get('/api/miniapp/chats');
        allChatsData = res.data.chats || [];
        
        const allTabBtn = document.querySelector('.chat-tab');
        if(allTabBtn) {
            document.querySelectorAll('.chat-tab').forEach(btn => btn.classList.remove('active'));
            allTabBtn.classList.add('active');
        }
        
        renderChatsList(allChatsData);
    } catch (err) { 
        listEl.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; 
    }
}

// Модалка без кнопки экспорта
window.openFeatureModal = function(id) {
    const data = FEATURE_DATA[id];
    if(!data) return;
    tg.HapticFeedback.impactOccurred('medium');
    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-desc').textContent = data.desc;
    const iconEl = document.getElementById('modal-icon');
    iconEl.innerHTML = `<use href="${data.icon}"></use>`;
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
        const res = await miniAppClient.get('/api/miniapp/stats');
        const user = res.data.user || 'Пользователь';
        const userId = res.data.user_id || 0;
        const username = res.data.username || '';
        const isPremium = res.data.is_premium || false; 
        
        document.getElementById('user-name').textContent = user;
        document.getElementById('user-id').textContent = 'ID: ' + userId;
        document.getElementById('stat-chats').textContent = res.data.total_messages || 0;
        document.getElementById('stat-deleted').textContent = res.data.deleted_messages || 0;
        document.getElementById('profile-name').textContent = user;
        document.getElementById('profile-id').textContent = 'ID: ' + userId;

        if (isPremium) {
            document.getElementById('premium-badge').classList.remove('hidden');
            document.getElementById('profile-premium-badge').classList.remove('hidden');
            document.getElementById('premium-status-text').innerHTML = 'Подписка активна';
            document.getElementById('premium-action-btn').textContent = 'Продлить подписку';
            document.getElementById('premium-action-btn').style.background = 'var(--accent-red)';
            document.getElementById('premium-action-btn').style.color = '#fff';
        } else {
            document.getElementById('premium-status-text').innerHTML = 'Подписка не активна';
            document.getElementById('premium-action-btn').textContent = 'Подключить Premium';
        }

        if (username.trim() !== '') {
            const myAvatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
            ['user', 'profile'].forEach(prefix => {
                const img = document.getElementById(`${prefix}-avatar-img`);
                const txt = document.getElementById(`${prefix}-avatar-text`);
                img.src = myAvatarUrl;
                img.style.display = 'block';
                txt.style.display = 'none';
                img.onerror = () => { img.style.display = 'none'; txt.style.display = 'block'; txt.textContent = user[0].toUpperCase(); };
            });
        } else {
            document.getElementById('user-avatar-text').textContent = user[0].toUpperCase();
            document.getElementById('profile-avatar-text').textContent = user[0].toUpperCase();
        }
        switchTab('home');
    } catch (err) { console.error(err); }
}

async function loadStats() {
    try {
        const res = await miniAppClient.get('/api/miniapp/stats');
        document.getElementById('stat-chats').textContent = res.data.total_messages || 0;
        document.getElementById('stat-deleted').textContent = res.data.deleted_messages || 0;
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

async function loadMessages(chatId, chatLabel) {
    switchTab('messages');
    document.getElementById('chat-title').textContent = chatLabel || 'Сообщения';
    const listEl = document.getElementById('messages-list');
    listEl.innerHTML = '<div class="empty-state">Загрузка...</div>';

    try {
        const res = await miniAppClient.get(`/api/miniapp/messages?chat_id=${chatId}`);
        const messages = res.data.messages || [];
        listEl.innerHTML = '';
        
        if (messages.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Нет сообщений</div>';
            return;
        }

        messages.forEach(msg => {
            const div = document.createElement('div');
            let classes = 'message-item';
            if (msg.deleted) classes += ' deleted';
            else if (msg.edited) classes += ' edited';
            div.className = classes;
            
            let text = msg.text || '';
            if (text) text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            let statusIcons = '';
            if (msg.deleted) {
                statusIcons = '<svg class="text-svg" style="stroke: var(--accent-red);"><use href="#icon-trash"></use></svg>';
            } else if (msg.edited) {
                statusIcons = '<svg class="text-svg" style="stroke: var(--accent-yellow);"><use href="#icon-edit"></use></svg>';
            }

            let mediaHtml = '';
            if (msg.has_media) {
                const mediaUrl = `${miniAppClient.defaults.baseURL}/api/miniapp/media?chat_id=${chatId}&message_id=${msg.message_id}&initData=${encodedInitData}`;
                const type = msg.content_type;
                const ext = msg.media_ext || '';

                if (type === 'sticker') {
                    if (ext === '.tgs') {
                        mediaHtml = `<div class="sticker-placeholder"><svg class="icon" style="width:48px;height:48px;color:var(--text-muted);"><use href="#icon-star"></use></svg></div>`;
                    } else if (ext === '.webm') {
                        mediaHtml = `<video src="${mediaUrl}" autoplay loop muted playsinline class="msg-sticker-video"></video>`;
                    } else {
                        mediaHtml = `<img src="${mediaUrl}" class="msg-sticker" loading="lazy" onerror="this.style.display='none'" alt="Стикер">`;
                    }
                } else if (type === 'photo') {
                    mediaHtml = `<img src="${mediaUrl}" class="msg-media" loading="lazy" onerror="this.style.display='none'" alt="Фото">`;
                } else if (type === 'video') {
                    mediaHtml = `<video src="${mediaUrl}" controls playsinline class="msg-media" preload="metadata"></video>`;
                } else if (type === 'video_note') {
                    mediaHtml = `<video src="${mediaUrl}" controls playsinline class="msg-video-note" preload="metadata"></video>`;
                } else if (type === 'voice' || type === 'audio') {
                    mediaHtml = `<audio src="${mediaUrl}" controls class="msg-audio" preload="metadata"></audio>`;
                } else if (type === 'animation') {
                    mediaHtml = `<video src="${mediaUrl}" autoplay loop muted playsinline class="msg-media"></video>`;
                } else if (type === 'document') {
                    mediaHtml = `<a href="${mediaUrl}" target="_blank" class="msg-doc"><svg class="text-svg"><use href="#icon-export"></use></svg> Скачать файл</a>`;
                }
            } else if (!text && msg.content_type !== 'text') {
                text = `[${msg.content_type}]`;
            }
            
            div.innerHTML = `
                <div class="msg-author">
                    ${msg.sender_name || 'Пользователь'} 
                    ${statusIcons}
                </div>
                ${text ? `<div class="msg-text">${text}</div>` : ''}
                ${mediaHtml ? `<div class="media-container">${mediaHtml}</div>` : ''}
                <div class="msg-time">${msg.updated_at}</div>
            `;
            listEl.appendChild(div);
        });
    } catch (err) { 
        listEl.innerHTML = '<div class="empty-state">Ошибка загрузки сообщений</div>'; 
    }
}
