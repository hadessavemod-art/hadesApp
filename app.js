import { setTelegramInitData, miniAppClient } from './miniAppClient.js';

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Кнопка "Назад" закрывает приложение
document.getElementById('btn-back').onclick = () => tg.close();

// Получаем строку авторизации от Telegram
const initData = tg.initData;

if (!initData) {
    // Если открыли не через Telegram
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error-text').textContent = 'Пожалуйста, открой это окно через бота в Telegram.';
} else {
    // Передаём подпись в клиент
    setTelegramInitData(initData);

    // Запрашиваем статистику у бота
    miniAppClient.get('/api/miniapp/stats')
        .then(res => {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('data').classList.remove('hidden');
            
            // Подставляем данные
            document.getElementById('user-name').textContent = res.data.user || 'Друг';
            document.getElementById('total-messages').textContent = res.data.total_messages || 0;
            document.getElementById('deleted-messages').textContent = res.data.deleted_messages || 0;
        })
        .catch(err => {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
            // Показываем ошибку от бота или общую
            const msg = err.response?.data?.error || 'Не удалось связаться с ботом. Проверь настройки API.';
            document.getElementById('error-text').textContent = msg;
        });
}
