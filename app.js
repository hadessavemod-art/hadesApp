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

window.switchTab = function(tabName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetPage = document.getElementById(`view-${tabName}`);
    if(targetPage) targetPage.classList.add('active');
    
    if (tabName !== 'messages' && tabName !== 'premium') {
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`);
        if (navBtn) navBtn.classList.add('active');
    } else {
        const activeNav = tabName === 'premium' ? 'home' : 'chats';
        const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${activeNav}')"]`);
        if (navBtn) navBtn.classList.add('active');
    }

    if (tabName === 'home') loadStats();
    if (tabName === 'chats') loadChats();
};

async function initApp() {
    try {
        const res = await miniAppClient.get('/api/miniapp/stats');
        const user = res.data.user || 'Пользователь';
        const userId = res.data.user_id || 0;
        const username = res.data.username || '';
        const isPremium = res.data.is_premium || false; 
        
        // Главная
        document.getElementById('user-name').textContent = user;
        document.getElementById('user-id').textContent = 'ID: ' + userId;
        document.getElementById('stat-chats').textContent = res.data.total_messages || 0;
        document.getElementById('stat-deleted').textContent = res.data.deleted_messages || 0;
        
        // Профиль
        document.getElementById('profile-name').textContent = user;
        document.getElementById('profile-id').textContent = 'ID: ' + userId;

        // Премиум бейджи
        if (isPremium) {
            document.getElementById('premium-badge').classList.remove('hidden');
            document.getElementById('profile-premium-badge').classList.remove('hidden');
        }

        // Аватарки
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
