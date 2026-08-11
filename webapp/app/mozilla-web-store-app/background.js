// background.js – универсальный фоновый сервис-воркер

// === Определяем API браузера ===
const browserAPI = (() => {
  if (typeof browser !== 'undefined' && browser.runtime) return browser;
  if (typeof chrome !== 'undefined' && chrome.runtime) return chrome;
  throw new Error('Браузер не поддерживается');
})();

// === 1. Открытие приложения в новой вкладке по клику на иконку ===
browserAPI.action.onClicked.addListener(() => {
  browserAPI.tabs.create({ url: browserAPI.runtime.getURL('app.html'), active: true });
});

// === 2. Обработка сообщений из app.js ===
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Обновление бейджа (счётчика непрочитанных)
  if (message.type === 'UPDATE_BADGE') {
    const count = message.count || 0;
    const text = count > 0 ? String(count) : '';
    browserAPI.action.setBadgeText({ text });
    browserAPI.action.setBadgeBackgroundColor({ color: '#3088ff' });
    sendResponse({ success: true });
    return true;
  }

  // Если нужно что-то сделать в фоне (например, запрос к API)
  if (message.type === 'FETCH_DATA') {
    // Здесь можно выполнить фоновый запрос
    sendResponse({ success: true });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

// === 3. Контекстное меню (создаётся при установке) ===
browserAPI.runtime.onInstalled.addListener(() => {
  browserAPI.contextMenus.removeAll().then(() => {
    browserAPI.contextMenus.create({
      id: 'addToNews',
      title: 'Добавить в Мои AI Новости',
      contexts: ['selection', 'link']
    });
    browserAPI.contextMenus.create({
      id: 'openAI',
      title: 'Открыть Мои AI Новости',
      contexts: ['action']
    });
  });
});

// === 4. Обработка кликов по контекстному меню ===
browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'addToNews') {
    const text = info.selectionText || info.linkUrl || '';
    if (text) {
      browserAPI.tabs.create({
        url: `https://news.proid.studio/pwa?add=${encodeURIComponent(text)}`
      });
    }
  } else if (info.menuItemId === 'openAI') {
    browserAPI.tabs.create({ url: 'https://news.proid.studio/pwa' });
  }
});

// === 5. Периодическая фоновая проверка (раз в час) ===
browserAPI.alarms.create('fetchNews', { periodInMinutes: 60 });

browserAPI.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchNews') {
    console.log('🔄 Фоновая проверка новостей');
    // Здесь можно сделать запрос к API, обновить бейдж и т.п.
    // Пример:
    // browserAPI.storage.local.get(['auth_token']).then((result) => {
    //   const token = result.auth_token;
    //   if (token) {
    //     fetch('https://news.proid.studio/api/unread-count', {
    //       headers: { 'X-Auth-Token': token }
    //     })
    //     .then(r => r.json())
    //     .then(data => {
    //       const count = data.count || 0;
    //       browserAPI.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    //     })
    //     .catch(console.error);
    //   }
    // });
  }
});

console.log('✅ Мои AI Новости: расширение загружено (универсально, открывает вкладку)');