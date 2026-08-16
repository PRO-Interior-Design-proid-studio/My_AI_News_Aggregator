const browserAPI = (() => {
  if (typeof browser !== 'undefined' && browser.runtime) return browser;
  if (typeof chrome !== 'undefined' && chrome.runtime) return chrome;
  throw new Error('Браузер не поддерживается');
})();

browserAPI.action.onClicked.addListener(() => {
  const url = browserAPI.runtime.getURL('app.html');
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      browserAPI.tabs.update(tabs[0].id, { url });
    } else {
      browserAPI.tabs.create({ url, active: true });
    }
  });
});

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    const count = message.count || 0;
    browserAPI.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    browserAPI.action.setBadgeBackgroundColor({ color: '#3088ff' });
    sendResponse({ success: true });
    return true;
  }
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

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

browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'addToNews') {
    const text = info.selectionText || info.linkUrl || '';
    if (text) {
      browserAPI.tabs.create({
        url: `https://news.proid.studio/pwa?add=${encodeURIComponent(text)}`
      });
    }
  } else if (info.menuItemId === 'openAI') {
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        browserAPI.tabs.update(tabs[0].id, { url: 'https://news.proid.studio/pwa' });
      } else {
        browserAPI.tabs.create({ url: 'https://news.proid.studio/pwa', active: true });
      }
    });
  }
});

browserAPI.alarms.create('fetchNews', { periodInMinutes: 60 });
browserAPI.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchNews') {
    console.log('🔄 Фоновая проверка новостей');
  }
});

console.log('✅ Мои AI Новости: расширение загружено (открывает в текущей вкладке)');
