// background.js – фоновый сервис-воркер для расширения

// === 1. Открытие приложения по клику на иконку ===
browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('app.html'), active: true });
});

// === 2. (Опционально) Обработка сообщений из app.js ===
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DATA') {
    // Если нужно выполнить какие-то фоновые запросы – можно здесь.
    // Но в данной реализации все запросы делаются из app.js напрямую.
    sendResponse({ success: true });
    return true;
  }
});

console.log('✅ Мои AI Новости: расширение загружено');