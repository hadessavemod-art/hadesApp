import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const initData = tg.initData;

if (!initData) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error-text').textContent = 'Пожалуйста, открой это окно через бота в Telegram.';
} else {
    setTelegramInitData(initData);
    initApp();
}

const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const viewStats = document.getElementById('view-stats');
const viewChats = document.getElementById('view-chats');
const viewMessages = document.getElementById('view-messages');
const headerTitle = document.getElementById('header-title');
const btnBack = document.getElementById('btn-back');

let currentView = 'stats';
let currentChatId = null;

function showView(viewName) {
    viewStats.classList.add('hidden');
    viewChats.classList.add('hidden');
    viewMessages.classList.add('hidden');
    loadingEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    currentView = viewName;
    if (viewName === 'stats') {
        viewStats.classList.remove('hidden');
        headerTitle.textContent = 'Статистика';
        btnBack.textContent = 'Закрыть';
    } else if (viewName === 'chats') {
        viewChats.classList.remove('hidden');
        headerTitle.textContent = 'Мои чаты';
        btnBack.textContent = '‹ Назад';
    } else if (viewName === 'messages') {
        viewMessages.classList.remove('hidden');
        headerTitle.textContent = 'Сообщения';
        btnBack.textContent = '‹ Назад';
    }
}

function showError(msg) {
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    document.getElementById('error-text').textContent = msg;
}

btnBack.onclick = () => {
    if (currentView === 'stats') {
        tg.close();
    } else if (currentView === 'chats') {
        showView('stats');
    } else if (currentView === 'messages') {
        showView('chats');
    }
};

async function initApp() {
    try {
        const res = await miniAppClient.get('/api/miniapp/stats');
        document.getElementById('user-name').textContent = res.data.user || 'Друг';
        document.getElementById('total-messages').textContent = res.data.total_messages || 0;
        document.getElementById('deleted-messages').textContent = res.data.deleted_messages || 0;
        showView('stats');
    } catch (err) {
        const msg = err.response?.data?.error || 'Не удалось связаться с ботом.';
        showError(msg);
    }
}

document.getElementById('card-messages').onclick = async () => {
    showView('chats');
    loadingEl.classList.remove('hidden');
    const listEl = document.getElementById('chats-list');
    listEl.innerHTML = '';

    try {
        const res = await miniAppClient.get('/api/miniapp/chats');
        loadingEl.classList.add('hidden');
        const chats = res.data.chats || [];
        
        if (chats.length === 0) {
            listEl.innerHTML = '<p style="color:#8e8e93; text-align:center;">Архив пуст</p>';
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <div class="list-item-title">${chat.label || 'Чат ' + chat.chat_id}</div>
                <div class="list-item-sub">Всего: ${chat.total} • Удалено: ${chat.deleted_count} • Изменено: ${chat.edited_count}</div>
            `;
            div.onclick = () => loadMessages(chat.chat_id, chat.label);
            listEl.appendChild(div);
        });
    } catch (err) {
        let errorMsg = 'Ошибка загрузки чатов';
        if (err.response) {
            errorMsg = `Ошибка сервера (${err.response.status})`;
            if (err.response.status === 404) errorMsg = 'Сервер не обновлён (404). Перезапусти бота!';
        }
        showError(errorMsg);
    }
};

async function loadMessages(chatId, chatLabel) {
    currentChatId = chatId;
    showView('messages');
    headerTitle.textContent = chatLabel || 'Сообщения';
    loadingEl.classList.remove('hidden');
    
    const listEl = document.getElementById('messages-list');
    listEl.innerHTML = '';

    try {
        const res = await miniAppClient.get(`/api/miniapp/messages?chat_id=${chatId}`);
        loadingEl.classList.add('hidden');
        const messages = res.data.messages || [];

        if (messages.length === 0) {
            listEl.innerHTML = '<p style="color:#8e8e93; text-align:center;">Нет сообщений</p>';
            return;
        }

        messages.forEach(msg => {
            const div = document.createElement('div');
            let classes = 'message-item';
            if (msg.deleted) classes += ' deleted';
            else if (msg.edited) classes += ' edited';
            
            div.className = classes;
            
            let text = msg.text || `[${msg.content_type}]`;
            text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            div.innerHTML = `
                <div class="msg-author">${msg.sender_name || 'Пользователь'} ${msg.deleted ? '🗑' : msg.edited ? '✏️' : ''}</div>
                <div class="msg-text">${text}</div>
                <div class="msg-time">${msg.updated_at}</div>
            `;
            listEl.appendChild(div);
        });
    } catch (err) {
        showError('Ошибка загрузки сообщений');
    }
}
