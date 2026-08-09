 
// background.js – фоновый сервис-воркер для расширения

// === 1. При установке/обновлении создаём контекстное меню ===
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "addRSS",
    title: "Добавить эту страницу как RSS-источник",
    contexts: ["page", "link"]
  });

  browser.contextMenus.create({
    id: "addTelegram",
    title: "Добавить Telegram/VK канал по ссылке",
    contexts: ["link", "selection"]
  });

  browser.contextMenus.create({
    id: "saveToDigest",
    title: "Сохранить в дайджест",
    contexts: ["page", "link", "selection"]
  });
});

// === 2. Обработчик кликов по пунктам меню ===
browser.contextMenus.onClicked.addListener((info, tab) => {
  let url = browser.runtime.getURL('app.html');
  const params = new URLSearchParams();

  if (info.menuItemId === 'addRSS') {
    const pageUrl = info.pageUrl || info.linkUrl || '';
    if (pageUrl) {
      params.set('action', 'addRSS');
      params.set('url', pageUrl);
    }
  } else if (info.menuItemId === 'addTelegram') {
    const link = info.linkUrl || info.selectionText || '';
    if (link) {
      params.set('action', 'addTelegram');
      params.set('url', link);
    }
  } else if (info.menuItemId === 'saveToDigest') {
    // Можно передать URL страницы или выделенный текст
    const content = info.selectionText || info.pageUrl || '';
    params.set('action', 'saveToDigest');
    params.set('content', content);
  }

  if (params.toString()) {
    url += '?' + params.toString();
  }

  // Открываем страницу в новой вкладке
  browser.tabs.create({ url, active: true });
});

// === 3. Открытие приложения по клику на иконку ===
browser.action.onClicked.addListener((tab) => {
  browser.tabs.create({ url: browser.runtime.getURL('app.html'), active: true });
});

// === 4. (Опционально) Обработка сообщений из app.js ===
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DATA') {
    // Если нужно выполнить какие-то фоновые запросы – можно здесь.
    // Но в данной реализации все запросы делаются из app.js напрямую.
    sendResponse({ success: true });
    return true;
  }
});

console.log('✅ Мои AI Новости: расширение загружено');