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

console.log('✅ Мои AI Новости: расширение загружено (открывает в текущей вкладке)');