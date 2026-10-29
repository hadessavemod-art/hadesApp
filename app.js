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

// Данные для модального окна Premium
const FEATURE_DATA = {
    'archive': {
        title: 'Безлимитный архив',
        icon: '#icon-infinity',
        bg: 'bg-blue',
        desc: 'Срок хранения сообщений увеличивается с 3 дней (бесплатный тариф) до 30 дней. Бот будет хранить всю историю переписок, медиафайлы и даже удаленные сообщения целый месяц.'
    },
    'priority': {
        title: 'Приоритетное сохранение',
        icon: '#icon-shield',
        bg: 'bg-purple',
        desc: 'Сервер имеет ограниченное место. При автоматической очистке старых данных файлы и медиа Premium-пользователей удаляются в самую последнюю очередь. Ваш архив всегда в безопасности.'
    },
    'mirrors': {
        title: 'До 5 зеркал',
        icon: '#icon-bot',
        bg: 'bg-cyan',
        desc: 'Вы можете создать до 5 клонов бота (зеркал) на своих токенах от @BotFather. Они будут работать полностью автономно с вашим брендом и кнопками.'
    },
    'spam': {
        title: 'Увеличенный .spam',
        icon: '#icon-zap',
        bg: 'bg-green',
        desc: 'Лимит команды `.spam` повышается с 20 до 50 сообщений за один раз. Идеально для важных объявлений или быстрых ответов в бизнес-чатах.'
    },
    'badge': {
        title: 'Уникальный значок',
        icon: '#icon-crown',
        bg: 'bg-yellow',
        desc: 'В профиле Mini App и в уведомлениях рядом с вашим именем появляется эксклюзивная красная корона. Ваш статус видят все пользователи.'
    },
    'export': {
        title: 'Экспорт архива',
        icon: '#icon-download',
        bg: 'bg-gray',
        desc: 'Вы можете выгрузить всю историю переписок, включая текст и медиа, в один удобный HTML или JSON файл и сохранить его на свое устройство.'
    },
    'support': {
        title: 'Приоритетная поддержка',
        icon: '#icon-headphones',
        bg: 'bg-green',
        desc: 'Ваши тикеты в поддержку обрабатываются вне очереди. Среднее время ответа администратора — до 15 минут (вместо 24 часов).'
    },
    'media': {
        title: 'Увеличенный лимит медиа',
        icon: '#icon-upload',
        bg: 'bg-blue',
        desc: 'Бот сможет сохранять файлы размером до 50 МБ. Для бесплатных пользователей лимит ограничен стандартными 20 МБ из-за ограничений Telegram Bot API.'
    }
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

// --- МОДАЛЬНОЕ ОКНО PREMIUM ---
window.openFeatureModal = function(id) {
    const data = FEATURE_DATA[id];
    if(!data) return;
    
    tg.HapticFeedback.impactOccurred('medium');
    
    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-desc').textContent = data.desc;
    
    const iconEl = document.getElementById('modal-icon');
    iconEl.innerHTML = `<use href="${data.icon}"></use>`;
    
    const iconContainer = document.getElementById('modal-icon-container');
    iconContainer.className = `feature-icon ${data.bg}`;
    
    const modal = document.getElementById('feature-modal');
    modal.classList.add('active');
};

window.closeFeatureModal = function(event) {
    const modal = document.getElementById('feature-modal');
    if (event && event.target !== modal && !event.target.closest('button')) return;
    
    tg.HapticFeedback.impactOccurred('light');
    modal.classList.remove('active');
};

// --- РЕФЕРАЛЫ ---
async function loadReferrals() {
    try {
        const res = await miniAppClient.get('/api/miniapp/referrals');
        refLink = res.data.link;
        document.getElementById('ref-count').textContent = res.data.count;
    } catch(e) {
        console.error("Ошибка загрузки рефералов", e);
    }
}

window.copyRefLink = function() {
    if(refLink) {
        navigator.clipboard.writeText(refLink);
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert("Ссылка скопирована!");
    }
}

// --- ОСТАЛЬНАЯ ЛОГИКА ---
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
            document.getElementById('premium-status-text').innerHTML = '✅ Подписка <b>активна</b>';
        } else {
            document.getElementById('premium-status-text').innerHTML = '❌ Подписка <b>не активна</b>';
        }

        if (username.trim() !== '') {
            const myAvatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
            
            const homeImg = document.getElementById('user-avatar-img');
            const homeText = document.getElementById('user-avatar-text');
            homeImg.src = myAvatarUrl;
            homeImg.style.display = 'block';
            homeText.style.display = 'none';
            homeImg.onerror = () => {
                homeImg.style.display = 'none';
                homeText.style.display = 'block';
                homeText.textContent = user[0].toUpperCase();
            };

            const profImg = document.getElementById('profile-avatar-img');
            const profText = document.getElementById('profile-avatar-text');
            profImg.src = myAvatarUrl;
            profImg.style.display = 'block';
            profText.style.display = 'none';
            profImg.onerror = () => {
                profImg.style.display = 'none';
                profText.style.display = 'block';
                profText.textContent = user[0].toUpperCase();
            };
        } else {
            document.getElementById('user-avatar-text').textContent = user[0].toUpperCase();
            document.getElementById('profile-avatar-text').textContent = user[0].toUpperCase();
        }
        
        switchTab('home');
    } catch (err) {
        console.error(err);
    }
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
        const statusText = document.getElementById('premium-status-text');
        if (isPremium) statusText.innerHTML = '✅ Подписка <b>активна</b>';
        else statusText.innerHTML = '❌ Подписка <b>не активна</b>';
    } catch(e) {}
}

async function loadChats() {
    const listEl = document.getElementById('chats-list');
    if (listEl.children.length > 0 && !listEl.querySelector('.empty-state')) return;

    listEl.innerHTML = '<div class="empty-state">Загрузка чатов...</div>';
    
    try {
        const res = await miniAppClient.get('/api/miniapp/chats');
        const chats = res.data.chats || [];
        listEl.innerHTML = '';

        if (chats.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Архив пуст</div>';
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'list-item';
            
            const initial = chat.label ? chat.label[0].toUpperCase() : '?';
            
            let avatarHtml = `<div class="list-avatar">${initial}</div>`;
            if (chat.chat_username && chat.chat_username.trim() !== '') {
                const imgUrl = `https://t.me/i/userpic/320/${chat.chat_username}.jpg`;
                avatarHtml = `
                    <img src="${imgUrl}" class="list-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="">
                    <div class="list-avatar" style="display:none;">${initial}</div>
                `;
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
    } catch (err) {
        listEl.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
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
            
            let mediaHtml = '';
            if (msg.has_media) {
                const mediaUrl = `${miniAppClient.defaults.baseURL}/api/miniapp/media?chat_id=${chatId}&message_id=${msg.message_id}&initData=${encodedInitData}`;
                const type = msg.content_type;
                const ext = msg.media_ext || '';

                if (type === 'sticker') {
                    if (ext === '.tgs') {
                        mediaHtml = `<div style="padding:10px; background:#2c2c2e; border-radius:8px; display:inline-block; font-size:12px; color:#8e8e93; margin-top:5px;">🎭 Анимированный стикер</div>`;
                    } else if (ext === '.webm') {
                        mediaHtml = `<video src="${mediaUrl}" autoplay loop muted playsinline class="msg-sticker"></video>`;
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
                    mediaHtml = `<a href="${mediaUrl}" target="_blank" class="msg-doc">📎 Скачать файл</a>`;
                }
            } else if (!text && msg.content_type !== 'text') {
                text = `[${msg.content_type}]`;
            }
            
            div.innerHTML = `
                <div class="msg-author">${msg.sender_name || 'Пользователь'} ${msg.deleted ? '🗑' : msg.edited ? '✏️' : ''}</div>
                ${text ? `<div class="msg-text">${text}</div>` : ''}
                ${mediaHtml}
                <div class="msg-time">${msg.updated_at}</div>
            `;
            listEl.appendChild(div);
        });
    } catch (err) {
        listEl.innerHTML = '<div class="empty-state">Ошибка загрузки сообщений</div>';
    }
}
