// app.js — основная логика расширения (универсальная, с отладочными логами)

console.log('🔍 [app.js] СКРИПТ ЗАГРУЖЕН');

// ============================================================
//  БАЗОВЫЙ URL ДЛЯ API
// ============================================================
const API_BASE = 'https://news.proid.studio';
const TEST_TOKEN = 'vol7Js5SZnjPuaTfkk46zea3I-k_vsInqyqQPho_dF0';

// ============================================================
//  УНИВЕРСАЛЬНЫЙ ДОСТУП К API БРАУЗЕРА
// ============================================================
const isFirefox = typeof browser !== 'undefined' && browser.runtime;
const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
console.log('🌐 [app.js] isFirefox:', isFirefox, 'isChrome:', isChrome);

if (!isFirefox && !isChrome) {
  console.error('❌ [app.js] Не удалось определить API браузера.');
}

// Универсальные обёртки для storage
function storageGet(keys) {
  return new Promise((resolve) => {
    if (isFirefox) {
      browser.storage.sync.get(keys, resolve);
    } else {
      chrome.storage.sync.get(keys, resolve);
    }
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    if (isFirefox) {
      browser.storage.sync.set(items, resolve);
    } else {
      chrome.storage.sync.set(items, resolve);
    }
  });
}

function storageLocalGet(keys) {
  return new Promise((resolve) => {
    if (isFirefox) {
      browser.storage.local.get(keys, resolve);
    } else {
      chrome.storage.local.get(keys, resolve);
    }
  });
}

function storageLocalSet(items) {
  return new Promise((resolve) => {
    if (isFirefox) {
      browser.storage.local.set(items, resolve);
    } else {
      chrome.storage.local.set(items, resolve);
    }
  });
}

function createTab(url) {
  console.log('📂 [app.js] createTab:', url);
  if (isFirefox) {
    browser.tabs.create({ url });
  } else {
    chrome.tabs.create({ url });
  }
}

// ============================================================
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let authToken = null;
let currentSources = [];
let currentLimit = 5;
let currentAddType = 'rss';
let currentSendTime = null;
let isPremium = false;
let defaultSendHour = 18;
let digestVisible = false;
let categoryHistory = [];
const CATEGORY_CACHE_TTL = 3600000;
let isTestUser = false;
let consentGiven = false;

console.log('🔍 [app.js] Глобальные переменные инициализированы');

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function hapticFeedback() {
  if (navigator.vibrate) navigator.vibrate(10);
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { 'X-Auth-Token': authToken } : {})
  };
}

function showLoginScreen() {
  console.log('🔐 [app.js] showLoginScreen');
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  if (loginScreen) loginScreen.style.display = 'block';
  if (appScreen) appScreen.classList.add('hidden');
}

function showAppScreen() {
  console.log('🔐 [app.js] showAppScreen');
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  if (loginScreen) loginScreen.style.display = 'none';
  if (appScreen) appScreen.classList.remove('hidden');
}

async function apiRequest(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : API_BASE + url;
  console.log(`🌐 [app.js] apiRequest: ${options.method || 'GET'} ${fullUrl}`);
  try {
    const resp = await fetch(fullUrl, options);
    if (resp.status === 503) {
      alert('⚠️ Сервер временно недоступен. Пожалуйста, обновите страницу через несколько секунд.');
      return null;
    }
    console.log(`🌐 [app.js] apiRequest ответ: статус ${resp.status}`);
    return resp;
  } catch (err) {
    console.error('❌ [app.js] apiRequest ошибка:', err);
    throw err;
  }
}

// ===== ПРОВЕРКА СОГЛАСИЯ =====
function ensureConsent() {
  if (!consentGiven && !isTestUser) {
    alert('Сначала примите согласие на обработку данных.');
    return false;
  }
  return true;
}

// ============================================================
//  ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ
// ============================================================
async function loadStoredData() {
  console.log('💾 [app.js] loadStoredData');
  try {
    const result = await storageGet(['authToken', 'sources', 'limit', 'premium', 'sendTime', 'defaultSendHour', 'digestCache', 'consentGiven']);
    console.log('💾 [app.js] данные из storage:', Object.keys(result));
    if (authToken === null) {
      authToken = result.authToken || null;
    }
    currentSources = result.sources || [];
    currentLimit = result.limit || 5;
    isPremium = result.premium || false;
    currentSendTime = result.sendTime || null;
    defaultSendHour = result.defaultSendHour || 18;
    consentGiven = result.consentGiven || false;

    if (result.digestCache) {
      showDigestFromCache(result.digestCache);
    }
    console.log('💾 [app.js] loadStoredData завершён, authToken:', !!authToken);
  } catch (e) {
    console.error('❌ [app.js] loadStoredData ошибка:', e);
  }
}

// ============================================================
//  ЗАГРУЗКА ИСТОЧНИКОВ (ОСНОВНАЯ) С ПРОВЕРКОЙ СОГЛАСИЯ
// ============================================================
async function loadSources() {
  console.log('📡 [app.js] loadSources, authToken:', !!authToken);
  if (!authToken) {
    showLoginScreen();
    return;
  }

  try {
    const resp = await apiRequest('/api/webapp/sources', { headers: getHeaders() });
    if (!resp) return;

    if (!resp.ok) {
      if (resp.status === 403) {
        console.warn('🔒 [app.js] 403 Forbidden — требуется согласие');
        const consentBlock = document.getElementById('consentBlock');
        const appScreen = document.getElementById('appScreen');
        if (consentBlock) consentBlock.style.display = 'block';
        if (appScreen) appScreen.classList.add('consent-pending');
        consentGiven = false;
        isTestUser = (authToken === TEST_TOKEN);
        window.TEST_MODE = isTestUser;
        showAppScreen();
        const quickButtons = document.getElementById('quickButtons');
        const paymentToggleBtn = document.getElementById('paymentToggleBtn');
        if (quickButtons) quickButtons.style.display = 'none';
        if (paymentToggleBtn) paymentToggleBtn.style.display = 'none';
        await storageSet({ consentGiven: false });
        return;
      }
      if (resp.status === 401) {
        console.warn('🔒 [app.js] 401 Unauthorized — токен невалиден');
        authToken = null;
        await storageSet({ authToken: null });
        showLoginScreen();
        return;
      }
      const err = await resp.json();
      throw new Error(err.detail || 'Ошибка загрузки');
    }

    const data = await resp.json();
    console.log('📡 [app.js] данные источников загружены, согласие:', data.consent_given);
    currentSources = data.sources || [];
    currentLimit = data.limit || 5;
    isPremium = data.is_premium || false;
    currentSendTime = data.send_time || null;
    defaultSendHour = data.default_send_hour || 18;
    consentGiven = data.consent_given === true;
    isTestUser = (authToken === TEST_TOKEN);

    await storageSet({
      sources: currentSources,
      limit: currentLimit,
      premium: isPremium,
      sendTime: currentSendTime,
      defaultSendHour: defaultSendHour,
      consentGiven: consentGiven
    });

    renderGroupedSources(currentSources);
    updateStatus(data);
    const counter = document.getElementById('counter');
    if (counter) counter.textContent = currentSources.length;
    showAppScreen();

    const consentBlock = document.getElementById('consentBlock');
    const appScreen = document.getElementById('appScreen');
    if (!consentGiven || isTestUser) {
      if (consentBlock) consentBlock.style.display = 'block';
      if (appScreen) appScreen.classList.add('consent-pending');
      window.TEST_MODE = isTestUser;
    } else {
      if (consentBlock) consentBlock.style.display = 'none';
      if (appScreen) appScreen.classList.remove('consent-pending');
      window.TEST_MODE = false;
    }

    const quickButtons = document.getElementById('quickButtons');
    const paymentToggleBtn = document.getElementById('paymentToggleBtn');
    if (quickButtons) quickButtons.style.display = 'flex';
    if (paymentToggleBtn) paymentToggleBtn.style.display = 'block';

  } catch (err) {
    console.error('❌ [app.js] loadSources ошибка:', err);
    const container = document.getElementById('sourceListContainer');
    if (container) {
      container.innerHTML =
        `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Ошибка загрузки</h3><p>${err.message}</p></div>`;
    }
    showAppScreen();
  }
}

// ============================================================
//  ОБРАБОТЧИК КНОПКИ "ПРИНИМАЮ"
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ [app.js] DOMContentLoaded');

  const check = document.getElementById('consentCheck');
  const btn = document.getElementById('consentAcceptBtn');
  console.log('🔍 [app.js] consentCheck:', !!check, 'consentAcceptBtn:', !!btn);

  if (check && btn) {
    check.addEventListener('change', function() {
      console.log('🔄 [app.js] чекбокс изменён:', this.checked);
      if (this.checked) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
      }
    });
    btn.addEventListener('click', async function() {
      console.log('🖱️ [app.js] клик по кнопке "Принимаю"');
      if (!check.checked) {
        console.warn('⚠️ [app.js] чекбокс не отмечен');
        return;
      }
      const appScreen = document.getElementById('appScreen');
      const consentBlock = document.getElementById('consentBlock');
      if (window.TEST_MODE) {
        console.log('🧪 [app.js] тестовый режим, согласие не отправляется');
        if (consentBlock) consentBlock.style.display = 'none';
        if (appScreen) appScreen.classList.remove('consent-pending');
        return;
      }
      try {
        console.log('📤 [app.js] отправка согласия на сервер');
        const resp = await apiRequest('/api/webapp/consent', {
          method: 'POST',
          headers: getHeaders()
        });
        if (resp && resp.ok) {
          console.log('✅ [app.js] согласие принято сервером');
          if (consentBlock) consentBlock.style.display = 'none';
          if (appScreen) appScreen.classList.remove('consent-pending');
          consentGiven = true;
          await storageSet({ consentGiven: true });
          await loadSources();
        } else {
          const err = resp ? await resp.json() : { detail: 'Ошибка соединения' };
          console.error('❌ [app.js] ошибка сохранения согласия:', err);
          alert('❌ Ошибка: ' + (err.detail || 'Не удалось сохранить согласие'));
        }
      } catch (e) {
        console.error('❌ [app.js] исключение при сохранении согласия:', e);
        alert('❌ Ошибка: ' + e.message);
      }
    });
  } else {
    console.warn('⚠️ [app.js] элементы согласия не найдены');
  }

  // ===== ПРИВЯЗКА ОСНОВНЫХ КНОПОК =====
  console.log('🔧 [app.js] привязка обработчиков к кнопкам');
  try {
    const botBtn = document.getElementById('botLoginBtn');
    const maxBtn = document.getElementById('maxLoginBtn');
    console.log('🔍 [app.js] botLoginBtn:', !!botBtn, 'maxLoginBtn:', !!maxBtn);

    if (botBtn) {
      botBtn.addEventListener('click', startBotAuth);
      console.log('✅ [app.js] обработчик на botLoginBtn навешен');
    } else {
      console.warn('⚠️ [app.js] botLoginBtn не найден');
    }
    if (maxBtn) {
      maxBtn.addEventListener('click', startMaxAuth);
      console.log('✅ [app.js] обработчик на maxLoginBtn навешен');
    } else {
      console.warn('⚠️ [app.js] maxLoginBtn не найден');
    }

    // --- Добавление источников ---
    const btnDzen = document.getElementById('btn-dzen');
    if (btnDzen) btnDzen.addEventListener('click', function() { toggleCategoryForm('dzen'); });
    const btnRb = document.getElementById('btn-rb');
    if (btnRb) btnRb.addEventListener('click', function() { toggleCategoryForm('rb'); });
    const btnHabr = document.getElementById('btn-habr');
    if (btnHabr) btnHabr.addEventListener('click', function() { toggleCategoryForm('habr'); });
    const btnLifehacker = document.getElementById('btn-lifehacker');
    if (btnLifehacker) btnLifehacker.addEventListener('click', function() { toggleCategoryForm('lifehacker'); });
    const btnForbes = document.getElementById('btn-forbes');
    if (btnForbes) btnForbes.addEventListener('click', addForbesTelegram);
    const btnVc = document.getElementById('btn-vc');
    if (btnVc) btnVc.addEventListener('click', function() { toggleCategoryForm('vc'); });
    const btnAddRss = document.getElementById('btn-add-rss');
    if (btnAddRss) btnAddRss.addEventListener('click', function() { toggleAddForm('rss'); });
    const btnAddTelegram = document.getElementById('btn-add-telegram');
    if (btnAddTelegram) btnAddTelegram.addEventListener('click', function() { toggleAddForm('telegram'); });
    const btnAddVk = document.getElementById('btn-add-vk');
    if (btnAddVk) btnAddVk.addEventListener('click', function() { toggleAddForm('vk'); });
    const btnGithub = document.getElementById('btn-github');
    if (btnGithub) btnGithub.addEventListener('click', toggleGitHubForm);
    const btnYoutube = document.getElementById('btn-youtube');
    if (btnYoutube) btnYoutube.addEventListener('click', toggleYouTubeForm);
    const btnReddit = document.getElementById('btn-reddit');
    if (btnReddit) btnReddit.addEventListener('click', toggleRedditForm);
    const btnBbc = document.getElementById('btn-bbc');
    if (btnBbc) btnBbc.addEventListener('click', function() { toggleCategoryForm('bbc'); });
    const btnGoogleNews = document.getElementById('btn-google-news');
    if (btnGoogleNews) btnGoogleNews.addEventListener('click', toggleGoogleNewsForm);
    const btnCnn = document.getElementById('btn-cnn');
    if (btnCnn) btnCnn.addEventListener('click', function() { toggleCategoryForm('cnn'); });

    // --- Формы ---
    const addSourceSubmitBtn = document.getElementById('addSourceSubmitBtn');
    if (addSourceSubmitBtn) addSourceSubmitBtn.addEventListener('click', addSourceSubmit);
    const closeAddFormBtn = document.getElementById('closeAddFormBtn');
    if (closeAddFormBtn) closeAddFormBtn.addEventListener('click', closeAddForm);
    const closeGitHubFormBtn = document.getElementById('closeGitHubFormBtn');
    if (closeGitHubFormBtn) closeGitHubFormBtn.addEventListener('click', closeGitHubForm);
    const generateYouTubeBtn = document.getElementById('generateYouTubeBtn');
    if (generateYouTubeBtn) generateYouTubeBtn.addEventListener('click', generateYouTubeRSS);
    const closeYouTubeFormBtn = document.getElementById('closeYouTubeFormBtn');
    if (closeYouTubeFormBtn) closeYouTubeFormBtn.addEventListener('click', closeYouTubeForm);
    const generateRedditBtn = document.getElementById('generateRedditBtn');
    if (generateRedditBtn) generateRedditBtn.addEventListener('click', generateRedditRSS);
    const closeRedditFormBtn = document.getElementById('closeRedditFormBtn');
    if (closeRedditFormBtn) closeRedditFormBtn.addEventListener('click', closeRedditForm);
    const generateGoogleNewsBtn = document.getElementById('generateGoogleNewsBtn');
    if (generateGoogleNewsBtn) generateGoogleNewsBtn.addEventListener('click', generateGoogleNewsRSS);
    const closeGoogleNewsFormBtn = document.getElementById('closeGoogleNewsFormBtn');
    if (closeGoogleNewsFormBtn) closeGoogleNewsFormBtn.addEventListener('click', closeGoogleNewsForm);

    // --- GitHub кнопки ---
    const githubReleases = document.getElementById('github-releases');
    if (githubReleases) githubReleases.addEventListener('click', function() { generateGitHubRSS('releases'); });
    const githubTags = document.getElementById('github-tags');
    if (githubTags) githubTags.addEventListener('click', function() { generateGitHubRSS('tags'); });
    const githubCommits = document.getElementById('github-commits');
    if (githubCommits) githubCommits.addEventListener('click', function() { generateGitHubRSS('commits'); });
    const githubMain = document.getElementById('github-main');
    if (githubMain) githubMain.addEventListener('click', function() { generateGitHubRSS('main'); });
    const githubMaster = document.getElementById('github-master');
    if (githubMaster) githubMaster.addEventListener('click', function() { generateGitHubRSS('master'); });
    const githubUsername = document.getElementById('github-username');
    if (githubUsername) githubUsername.addEventListener('click', function() { generateGitHubRSS('username'); });

    // --- Категории ---
    const categoryBrowserBtn = document.getElementById('categoryBrowserBtn');
    if (categoryBrowserBtn) categoryBrowserBtn.addEventListener('click', toggleCategoryBrowser);
    const categoryBackBtn = document.getElementById('categoryBackBtn');
    if (categoryBackBtn) categoryBackBtn.addEventListener('click', goBackLevel);
    const suggestSourceBtn = document.getElementById('suggestSourceBtn');
    if (suggestSourceBtn) suggestSourceBtn.addEventListener('click', suggestSource);

    // --- Дайджест ---
    const digestToggleBtn = document.getElementById('digestToggleBtn');
    if (digestToggleBtn) digestToggleBtn.addEventListener('click', toggleDigest);

    // --- Тарифы и оплата ---
    const paymentToggleBtn = document.getElementById('paymentToggleBtn');
    if (paymentToggleBtn) paymentToggleBtn.addEventListener('click', toggleTariffs);
    const basicMonth = document.getElementById('basic_month');
    if (basicMonth) basicMonth.addEventListener('click', function() { handlePayment('basic_month'); });
    const basicYear = document.getElementById('basic_year');
    if (basicYear) basicYear.addEventListener('click', function() { handlePayment('basic_year'); });
    const premiumMonth = document.getElementById('premium_month');
    if (premiumMonth) premiumMonth.addEventListener('click', function() { handlePayment('premium_month'); });
    const premiumYear = document.getElementById('premium_year');
    if (premiumYear) premiumYear.addEventListener('click', function() { handlePayment('premium_year'); });

    // --- Время ---
    const changeTimeBtn = document.getElementById('changeTimeBtn');
    if (changeTimeBtn) changeTimeBtn.addEventListener('click', toggleTimePicker);
    const closeTimePickerBtn = document.getElementById('closeTimePickerBtn');
    if (closeTimePickerBtn) closeTimePickerBtn.addEventListener('click', closeTimePicker);
    const upgradeLink = document.getElementById('upgradeLink');
    if (upgradeLink) upgradeLink.addEventListener('click', function(e) { e.preventDefault(); toggleTariffs(); });

    // --- Выход ---
    const logoutContainer = document.getElementById('logoutContainer');
    if (logoutContainer) logoutContainer.addEventListener('click', logout);

    console.log('✅ [app.js] все обработчики навешены');
  } catch (e) {
    console.error('❌ [app.js] ошибка при привязке обработчиков:', e);
  }
});

// ============================================================
//  АВТОРИЗАЦИЯ ЧЕРЕЗ TELEGRAM
// ============================================================
async function startBotAuth() {
  console.log('🚀 [app.js] startBotAuth вызвана');
  hapticFeedback();
  const container = document.querySelector('#loginScreen .auth-container');
  if (container) container.style.display = 'none';
  const w = document.getElementById('widgetContainer');
  if (w) w.innerHTML = '<div class="loader"></div>';

  try {
    console.log('📡 [app.js] запрос /api/auth/bot-token');
    const resp = await apiRequest('/api/auth/bot-token');
    if (!resp) {
      if (container) container.style.display = 'block';
      if (w) w.innerHTML = '';
      return;
    }
    if (!resp.ok) throw new Error('Не удалось получить токен');

    const data = await resp.json();
    const token = data.token;
    const botUsername = data.bot_username || 'My_AI_News_Aggregator_bot';
    console.log('🔑 [app.js] токен получен, бот:', botUsername);

    await storageSet({ botAuthToken: token });
    createTab(`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`);

    pollBotAuthStatus(token);
  } catch (err) {
    console.error('❌ [app.js] startBotAuth ошибка:', err);
    alert('❌ Ошибка: ' + err.message);
    if (container) container.style.display = 'block';
    if (w) w.innerHTML = '';
  }
}

function pollBotAuthStatus(token) {
  console.log('⏳ [app.js] pollBotAuthStatus начат для токена:', token.substring(0, 8) + '...');
  let attempts = 0;
  const maxAttempts = 60;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const resp = await apiRequest(`/api/auth/bot-status?token=${encodeURIComponent(token)}`);
      if (!resp) return;
      const result = await resp.json();
      console.log(`🔍 [app.js] poll #${attempts}, статус:`, result.status);

      if (result.status === 'success') {
        clearInterval(interval);
        const id = result.telegram_id;
        console.log('✅ [app.js] авторизация успешна, telegram_id:', id);
        if (id) {
          const tr = await fetch(`${API_BASE}/api/auth/get-token?telegram_id=${encodeURIComponent(id)}`, { headers: getHeaders() });
          if (tr.ok) {
            const td = await tr.json();
            if (td.token) {
              authToken = td.token;
              await storageSet({ authToken });
              alert('✅ Аккаунт привязан');
              loadSources();
              return;
            }
          }
        }
        alert('❌ Не удалось получить сессионный токен. Попробуйте снова.');
        const container = document.querySelector('#loginScreen .auth-container');
        if (container) container.style.display = 'block';
        const w = document.getElementById('widgetContainer');
        if (w) w.innerHTML = '';
      } else if (result.status === 'expired') {
        clearInterval(interval);
        alert('⏰ Время истекло. Попробуйте снова.');
        const container = document.querySelector('#loginScreen .auth-container');
        if (container) container.style.display = 'block';
        const w = document.getElementById('widgetContainer');
        if (w) w.innerHTML = '';
      }
    } catch (e) {
      console.error('❌ [app.js] pollBotAuthStatus ошибка:', e);
    }
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      alert('⏰ Время истекло. Попробуйте снова.');
      const container = document.querySelector('#loginScreen .auth-container');
      if (container) container.style.display = 'block';
      const w = document.getElementById('widgetContainer');
      if (w) w.innerHTML = '';
    }
  }, 3000);
}

// ============================================================
//  АВТОРИЗАЦИЯ ЧЕРЕЗ MAX
// ============================================================
async function startMaxAuth() {
  console.log('🚀 [app.js] startMaxAuth вызвана');
  hapticFeedback();
  const container = document.querySelector('#loginScreen .auth-container');
  if (container) container.style.display = 'none';
  const w = document.getElementById('widgetContainer');
  if (w) w.innerHTML = '<div class="loader"></div>';

  try {
    console.log('📡 [app.js] запрос /api/auth/max-token');
    const resp = await apiRequest('/api/auth/max-token');
    if (!resp) {
      if (container) container.style.display = 'block';
      if (w) w.innerHTML = '';
      return;
    }
    if (!resp.ok) throw new Error('Не удалось получить токен');

    const data = await resp.json();
    const token = data.token;
    const botUsername = data.bot_username || 'id772609477460_bot';
    console.log('🔑 [app.js] MAX токен получен, бот:', botUsername);

    await storageSet({ maxAuthToken: token });
    startMaxWaiting(token);
    createTab(`https://max.ru/${botUsername}?start=${encodeURIComponent(token)}`);
    if (w) w.innerHTML = '<p style="color: var(--text-secondary);">Ожидаем подтверждения в MAX...</p>';
  } catch (err) {
    console.error('❌ [app.js] startMaxAuth ошибка:', err);
    alert('❌ Ошибка: ' + err.message);
    if (container) container.style.display = 'block';
    if (w) w.innerHTML = '';
  }
}

function startMaxWaiting(token) {
  console.log('⏳ [app.js] startMaxWaiting начат для токена:', token.substring(0, 8) + '...');
  let attempts = 0;
  const maxAttempts = 60;
  const timer = setInterval(async () => {
    attempts++;
    try {
      const resp = await apiRequest(`/api/auth/max-status/${token}`);
      if (!resp) return;
      const data = await resp.json();
      console.log(`🔍 [app.js] MAX poll #${attempts}, ready:`, data.ready);

      if (data.ready && data.auth_token) {
        clearInterval(timer);
        authToken = data.auth_token;
        await storageSet({ authToken });
        alert('✅ Аккаунт привязан, перенаправляем...');
        const url = isFirefox ? browser.runtime.getURL('app.html') : chrome.runtime.getURL('app.html');
        window.location.href = url + '?auth_token=' + encodeURIComponent(authToken);
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        alert('⏰ Время истекло. Попробуйте снова.');
        const container = document.querySelector('#loginScreen .auth-container');
        if (container) container.style.display = 'block';
        const w = document.getElementById('widgetContainer');
        if (w) w.innerHTML = '';
      }
    } catch (e) {
      console.error('❌ [app.js] startMaxWaiting ошибка:', e);
    }
  }, 3000);
}

// ============================================================
//  ОТОБРАЖЕНИЕ ИСТОЧНИКОВ
// ============================================================
function getTypeLabel(t) {
  const m = { 'rss': 'RSS/HTML', 'telegram': 'Telegram', 'vk': 'VK', 'max': 'MAX' };
  return m[t] || t;
}

function truncate(s, l) {
  l = l || 40;
  return s.length > l ? s.slice(0, l) + '…' : s;
}

function safeDecodeUrl(u) {
  try { return decodeURIComponent(u); } catch (e) { return u; }
}

function formatSourceValue(s) {
  let v = s.value;
  if (s.type === 'telegram' || s.type === 'vk') {
    if (!v.startsWith('http') && !v.startsWith('@')) v = '@' + v;
  }
  if (s.type === 'rss') {
    v = safeDecodeUrl(v).replace(/^https?:\/\//, '').replace(/^www\./, '');
  }
  return v;
}

function getSourceUrl(s) {
  let u = s.value;
  if (s.type === 'telegram') u = 'https://t.me/' + u.replace(/^@/, '');
  else if (s.type === 'vk') u = 'https://vk.com/' + u.replace(/^@/, '');
  return u;
}

function askOpenLink(u) {
  hapticFeedback();
  if (window.confirm('Открыть ссылку?\n\n' + u)) window.open(u, '_blank');
}

function getIconGradient(t) {
  switch (t) {
    case 'telegram': return 'linear-gradient(290deg,#d235ff 0%,#a062ff 30%,#3088ff 66%,#61d8ff 100%)';
    case 'vk': return 'linear-gradient(290deg,#0d47a1 0%,#1565c0 30%,#1e88e5 66%,#64b5f6 100%)';
    case 'rss': return 'linear-gradient(290deg,#d84315 0%,#f57c00 30%,#f9a825 66%,#ffee58 100%)';
    default: return 'linear-gradient(290deg,#d235ff 0%,#a062ff 30%,#3088ff 66%,#61d8ff 100%)';
  }
}

function renderGroupedSources(sources) {
  console.log('📋 [app.js] renderGroupedSources, count:', sources.length);
  const container = document.getElementById('sourceListContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!sources || sources.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Нет источников</h3><p>Добавьте свой первый источник</p></div>';
    return;
  }
  const sorted = [...sources].sort((a, b) => a.value.toLowerCase().localeCompare(b.value.toLowerCase()));
  const groups = { 'rss': [], 'telegram': [], 'vk': [], 'max': [] };
  sorted.forEach(s => { if (groups[s.type]) groups[s.type].push(s); else groups[s.type] = [s]; });
  const order = ['telegram', 'vk', 'max', 'rss'];
  order.forEach(type => {
    const items = groups[type];
    if (!items || items.length === 0) return;
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = getTypeLabel(type);
    container.appendChild(title);
    const list = document.createElement('div');
    list.className = 'source-list';
    items.forEach(s => {
      const f = formatSourceValue(s);
      const v = truncate(f, 50);
      const u = getSourceUrl(s);
      const g = getIconGradient(s.type);
      const item = document.createElement('div');
      item.className = 'source-item';
      item.addEventListener('click', function() { askOpenLink(u); });
      const info = document.createElement('div');
      info.className = 'source-info';
      const icon = document.createElement('div');
      icon.className = 'source-icon';
      icon.style.background = g;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'source-value';
      valueSpan.textContent = v;
      valueSpan.title = f;
      info.appendChild(icon);
      info.appendChild(valueSpan);
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', function(e) { e.stopPropagation(); hapticFeedback(); confirmDelete(s.id); });
      item.appendChild(info);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
    container.appendChild(list);
  });
}

function updateStatus(data) {
  console.log('📊 [app.js] updateStatus, данные:', data);
  const tariff = document.getElementById('statusTariff');
  const sources = document.getElementById('statusSources');
  const limit = document.getElementById('statusLimit');
  const autoSend = document.getElementById('statusAutoSend');
  const lastSent = document.getElementById('statusLastSent');
  const expires = document.getElementById('statusExpires');
  if (tariff) tariff.textContent = data.tariff_name || '—';
  if (sources) sources.textContent = data.used || 0;
  if (limit) limit.textContent = data.limit || 5;
  if (autoSend) autoSend.textContent = '✅';
  if (lastSent) lastSent.textContent = data.last_sent || '—';
  if (expires) expires.textContent = data.expires_at || '—';
  isPremium = data.is_premium || false;
  defaultSendHour = data.default_send_hour || 18;
  currentSendTime = data.send_time || null;
  const display = currentSendTime ? currentSendTime : (defaultSendHour.toString().padStart(2, '0') + ':00');
  const timeDisplay = document.getElementById('currentTimeDisplay');
  if (timeDisplay) timeDisplay.textContent = display + ' MSK';
  const btn = document.getElementById('changeTimeBtn');
  const hint = document.getElementById('upgradeHint');
  if (isPremium) {
    if (btn) { btn.style.display = 'inline-block'; btn.disabled = false; }
    if (hint) hint.style.display = 'none';
  } else {
    if (btn) btn.style.display = 'none';
    if (hint) hint.style.display = 'inline-block';
    if (document.getElementById('timePicker') && document.getElementById('timePicker').style.display !== 'none') closeTimePicker();
  }
}

// ============================================================
//  УДАЛЕНИЕ ИСТОЧНИКОВ
// ============================================================
function confirmDelete(id) {
  hapticFeedback();
  const s = currentSources.find(s => s.id === id);
  if (!s) { alert('Источник не найден'); return; }
  const f = formatSourceValue(s);
  if (window.confirm('Удалить источник?\n\n' + f + '\n\nЭто действие нельзя отменить.')) deleteSource(id);
}

async function deleteSource(id) {
  if (!ensureConsent()) return;
  console.log('🗑️ [app.js] deleteSource, id:', id);
  try {
    const resp = await apiRequest('/api/webapp/delete', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ source_id: id })
    });
    if (!resp) return;
    if (!resp.ok) {
      const err = await resp.json();
      alert('❌ Ошибка удаления: ' + err.detail);
      return;
    }
    await loadSources();
    alert('✅ Источник удалён');
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
  }
}

// ============================================================
//  ФОРМЫ ДОБАВЛЕНИЯ (TOGGLE)
// ============================================================
function closeAddForm() { const el = document.getElementById('addForm'); if (el) el.style.display = 'none'; }
function closeGitHubForm() { const el = document.getElementById('githubForm'); if (el) el.style.display = 'none'; }
function closeYouTubeForm() { const el = document.getElementById('youtubeForm'); if (el) el.style.display = 'none'; }
function closeRedditForm() { const el = document.getElementById('redditForm'); if (el) el.style.display = 'none'; }
function closeGoogleNewsForm() { const el = document.getElementById('googleNewsForm'); if (el) el.style.display = 'none'; }

function toggleForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => {
    if (el.id !== formId) el.style.display = 'none';
  });
  if (isHidden) {
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

function toggleCategoryForm(type) {
  if (!ensureConsent()) return;
  hapticFeedback();
  const map = {
    'bbc': 'bbcForm', 'cnn': 'cnnForm', 'dzen': 'dzenForm',
    'rb': 'rbForm', 'habr': 'habrForm', 'lifehacker': 'lifehackerForm',
    'vc': 'vcForm'
  };
  const id = map[type];
  if (!id) return;
  const form = document.getElementById(id);
  if (form && window.getComputedStyle(form).display !== 'none') {
    form.style.display = 'none';
    return;
  }
  toggleForm(id);
  if (form && form.style.display === 'block') {
    const grid = document.getElementById(id.replace('Form', 'Grid'));
    if (grid && grid.children.length === 0) {
      let cats;
      if (type === 'bbc') cats = window.BBC_CATEGORIES;
      else if (type === 'cnn') cats = window.CNN_CATEGORIES;
      else if (type === 'dzen') cats = window.DZEN_CATEGORIES;
      else if (type === 'rb') cats = window.RB_CATEGORIES;
      else if (type === 'habr') cats = window.HABR_CATEGORIES;
      else if (type === 'lifehacker') cats = window.LIFEHACKER_CATEGORIES;
      else if (type === 'vc') cats = window.VC_CATEGORIES;
      if (cats) {
        Object.entries(cats).sort((a, b) => a[0].localeCompare(b[0], 'ru')).forEach(([name, url]) => {
          const btn = document.createElement('button');
          btn.textContent = name;
          btn.addEventListener('click', function() { addCategorySource('rss', url, name); });
          grid.appendChild(btn);
        });
      } else {
        grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Категории не загружены</div>';
      }
    }
  }
}

function toggleAddForm(type) {
  if (!ensureConsent()) return;
  hapticFeedback();
  const form = document.getElementById('addForm');
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    currentAddType = type;
    const title = document.getElementById('addFormTitle');
    const labels = { 'rss': 'RSS/HTML', 'telegram': 'Telegram', 'vk': 'VK' };
    if (title) title.textContent = 'Добавить ' + labels[type];
    const input = document.getElementById('sourceValue');
    if (input) {
      input.placeholder = type === 'rss' ? 'Введите URL...' : (type === 'telegram' ? 'Введите username (без @)...' : 'Введите username (без @)...');
      input.value = '';
    }
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

function toggleGitHubForm() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const form = document.getElementById('githubForm');
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    form.style.display = 'block';
    updateGitHubButtons('');
    const input = document.getElementById('githubInput');
    if (input) {
      input.removeEventListener('input', window._githubInputHandler);
      window._githubInputHandler = function() {
        updateGitHubButtons(this.value);
      };
      input.addEventListener('input', window._githubInputHandler);
    }
  } else {
    form.style.display = 'none';
  }
}

function toggleYouTubeForm() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const form = document.getElementById('youtubeForm');
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) form.style.display = 'block';
  else form.style.display = 'none';
}

function toggleRedditForm() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const form = document.getElementById('redditForm');
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) form.style.display = 'block';
  else form.style.display = 'none';
}

function toggleGoogleNewsForm() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const form = document.getElementById('googleNewsForm');
  if (!form) return;
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) form.style.display = 'block';
  else form.style.display = 'none';
}

// ============================================================
//  ДОБАВЛЕНИЕ ИСТОЧНИКОВ
// ============================================================
function addForbesTelegram() {
  if (!ensureConsent()) return;
  hapticFeedback();
  addCategorySource('telegram', 'forbesrussia', 'Forbes (Telegram)');
}

async function addSourceSubmit() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const val = document.getElementById('sourceValue');
  if (!val) return;
  const value = val.value.trim();
  if (!value) { alert('Введите значение'); return; }
  if (!window.confirm('Добавить источник?\n\n' + value)) return;
  console.log('📥 [app.js] addSourceSubmit, тип:', currentAddType, 'значение:', value);
  try {
    const resp = await apiRequest('/api/webapp/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ source_type: currentAddType, source_value: value })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка: ' + err.detail); return; }
    await loadSources();
    alert('✅ Источник добавлен');
    const form = document.getElementById('addForm');
    if (form) form.style.display = 'none';
    if (val) val.value = '';
  } catch (err) {
    alert('❌ Ошибка добавления: ' + err.message);
  }
}

async function addCategorySource(t, u, n) {
  if (!ensureConsent()) return;
  hapticFeedback();
  if (!u || !u.trim()) { alert('URL не может быть пустым'); return; }
  let final = u.trim();
  let type = t || 'rss';
  if (final.startsWith('https://t.me/')) {
    type = 'telegram';
    final = final.replace(/^https:\/\/t\.me\//, '').split('/')[0];
    if (final.startsWith('@')) final = final.slice(1);
  } else if (final.startsWith('https://vk.com/') || final.startsWith('https://vk.ru/')) {
    type = 'vk';
    final = final.replace(/^https:\/\/(vk\.com|vk\.ru)\//, '').split('/')[0];
    if (final.startsWith('@')) final = final.slice(1);
  } else if (!final.startsWith('http://') && !final.startsWith('https://')) {
    if (type !== 'telegram' && type !== 'vk') final = 'https://' + final;
  }
  if (!window.confirm('Добавить источник?\n\n' + n + '\n' + final)) return;
  console.log('📥 [app.js] addCategorySource, тип:', type, 'значение:', final);
  try {
    const resp = await apiRequest('/api/webapp/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ source_type: type, source_value: final })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка: ' + err.detail); return; }
    await loadSources();
    alert('✅ Добавлено: ' + n);
    document.querySelectorAll('.category-form').forEach(el => el.style.display = 'none');
  } catch (err) {
    alert('❌ Ошибка добавления: ' + err.message);
  }
}

function addRSSSource(u, n) {
  if (!ensureConsent()) return;
  hapticFeedback();
  if (!u || !u.trim()) { alert('URL не может быть пустым.'); return; }
  let final = u.trim();
  if (!final.startsWith('http://') && !final.startsWith('https://')) final = 'https://' + final;
  fetch(API_BASE + '/api/webapp/add', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ source_type: 'rss', source_value: final })
  })
  .then(async resp => {
    if (resp.status === 503) { alert('⚠️ Сервер временно недоступен.'); return; }
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка добавления: ' + err.detail); return; }
    await loadSources();
    alert('✅ Источник добавлен: ' + n);
    document.querySelectorAll('.category-form,.add-form').forEach(f => f.style.display = 'none');
  })
  .catch(err => { alert('❌ Ошибка: ' + err.message); });
}

function addSourceByType(t, u, n) {
  if (!ensureConsent()) return;
  hapticFeedback();
  let type = t;
  if (!['rss', 'telegram', 'vk', 'max'].includes(type)) type = 'rss';
  addCategorySource(type, u, n);
}

// ============================================================
//  GITHUB ГЕНЕРАТОР
// ============================================================
function updateGitHubButtons(v) {
  const grid = document.getElementById('githubGrid');
  if (!grid) return;
  const btns = grid.querySelectorAll('button');
  const hasSlash = v && v.includes('/');
  btns.forEach(btn => {
    const type = btn.dataset.type;
    if (type === 'username') btn.disabled = !v || !v.trim();
    else btn.disabled = !(hasSlash && v.trim());
  });
}

function generateGitHubRSS(t) {
  if (!ensureConsent()) return;
  hapticFeedback();
  const input = document.getElementById('githubInput');
  if (!input) return;
  let raw = input.value.trim();
  if (!raw) { alert('Введите owner/repo или username.'); return; }
  raw = raw.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  let url = '',
    display = 'GitHub';
  if (t === 'username') {
    const parts = raw.split('/');
    const username = parts[0];
    if (!username) { alert('Некорректный username.'); return; }
    url = 'https://github.com/' + username + '.atom';
    display = 'GitHub (' + username + ')';
  } else {
    if (!raw.includes('/')) { alert('Для этого типа нужен owner/repo.'); return; }
    const parts = raw.split('/');
    const owner = parts[0],
      repo = parts.slice(1).join('/');
    if (!owner || !repo) { alert('Некорректный owner/repo.'); return; }
    let path = '';
    switch (t) {
      case 'releases': path = 'releases.atom'; break;
      case 'tags': path = 'tags.atom'; break;
      case 'commits': path = 'commits.atom'; break;
      case 'main': path = 'commits/main.atom'; break;
      case 'master': path = 'commits/master.atom'; break;
      default: path = 'releases.atom';
    }
    url = 'https://github.com/' + owner + '/' + repo + '/' + path;
    display = 'GitHub (' + owner + '/' + repo + ')';
  }
  if (!window.confirm('Добавить источник?\n' + display + '\n' + url)) return;
  addRSSSource(url, display);
}

// ============================================================
//  YOUTUBE ГЕНЕРАТОР
// ============================================================
async function generateYouTubeRSS() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const input = document.getElementById('youtubeInput');
  if (!input) return;
  let val = input.value.trim();
  if (!val) { alert('Введите имя канала или channelId.'); return; }
  console.log('🎬 [app.js] generateYouTubeRSS, запрос:', val);
  try {
    const resp = await apiRequest('/api/youtube/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: val })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('Ошибка: ' + (err.detail || err.message || 'Канал не найден')); return; }
    const data = await resp.json();
    const id = data.channelId;
    if (!id) { alert('Канал не найден. Проверьте имя.'); return; }
    const url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(id);
    const name = data.title || 'YouTube канал';
    if (!window.confirm('Добавить источник?\n' + name)) return;
    addRSSSource(url, name);
    const form = document.getElementById('youtubeForm');
    if (form) form.style.display = 'none';
    if (input) input.value = '';
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

// ============================================================
//  REDDIT ГЕНЕРАТОР
// ============================================================
function generateRedditRSS() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const input = document.getElementById('redditInput');
  if (!input) return;
  let sub = input.value.trim();
  if (!sub) { alert('Введите название сабреддита.'); return; }
  sub = sub.replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//, '').split('/')[0];
  sub = sub.replace(/[^a-zA-Z0-9_]/g, '');
  if (!sub) { alert('Некорректное название сабреддита.'); return; }
  const url = 'https://www.reddit.com/r/' + sub + '/.rss';
  if (!window.confirm('Добавить источник?\nReddit (r/' + sub + ')\n' + url)) return;
  addRSSSource(url, 'Reddit (r/' + sub + ')');
}

// ============================================================
//  GOOGLE NEWS ГЕНЕРАТОР
// ============================================================
function generateGoogleNewsRSS() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const input = document.getElementById('googleNewsInput');
  if (!input) return;
  let q = input.value.trim();
  if (!q) { alert('Введите ключевое слово или фразу для поиска.'); return; }
  q = q.replace(/\s+/g, ' ').trim();
  const enc = q.replace(/ /g, '+');
  const url = 'https://news.google.com/rss/search?q=' + enc + '&hl=ru&gl=RU&ceid=RU:ru';
  if (!window.confirm('Добавить источник?\nGoogle News: ' + q + '\n' + url)) return;
  addRSSSource(url, 'Google News: ' + q);
}

// ============================================================
//  КАТЕГОРИИ (БРАУЗЕР)
// ============================================================
async function loadCategoryLevel(parentId = null) {
  const key = parentId === null ? 'categories_root' : 'categories_' + parentId;
  const cached = localStorage.getItem(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CATEGORY_CACHE_TTL) return parsed.data;
    } catch (e) {}
  }
  const url = parentId === null ? '/api/categories' : '/api/categories?parent_id=' + parentId;
  const resp = await apiRequest(url);
  if (!resp) return [];
  if (!resp.ok) throw new Error('Ошибка загрузки');
  const data = await resp.json();
  localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  return data;
}

function shortenCategoryName(n) {
  const map = {
    'DevOps и инфраструктура': 'DevOps',
    'IT и разработка': 'IT',
    'Информационная безопасность': 'Инфобез',
    'Искусственный интеллект': 'AI',
    'Машинное обучение': 'ML',
    'Глубокое обучение': 'Deep Learning',
    'Компьютерное зрение': 'CV',
    'Обработка естественного языка': 'NLP',
    'Кибербезопасность': 'Кибербез',
    'Разработка ПО': 'Разработка',
    'Архитектура ПО': 'Архитектура ПО',
    'Базы данных': 'БД',
    'Облачные технологии': 'Облака',
    'Веб-разработка': 'Веб',
    'Мобильная разработка': 'Мобильная',
    'Научные исследования': 'Наука',
    'Новости и общество': 'Новости',
    'Финансы и инвестиции': 'Финансы',
    'Экономика': 'Экономика',
    'Политика': 'Политика',
    'Медицина': 'Медицина',
    'Образование': 'Образование',
    'Экология': 'Экология',
    'Архитектура': 'Архитектура',
    'Дизайн': 'Дизайн',
    'Фотография': 'Фото',
    'Видеопроизводство': 'Видео',
    'Искусство': 'Искусство',
    'Музыка': 'Музыка',
    'Кино и ТВ': 'Кино',
    'Спорт': 'Спорт',
    'Путешествия': 'Путешествия',
    'Еда': 'Еда',
    'Дом': 'Дом',
    'Сад': 'Сад',
    'Семья': 'Семья',
    'Саморазвитие': 'Саморазвитие',
    'История': 'История',
    'Книги': 'Книги',
    'Хобби': 'Хобби',
    'Религия и философия': 'Религия',
    'HR': 'HR',
    'Отраслевые технологии': 'Отраслевые',
    'Маркетинг': 'Маркетинг',
    'Медиа': 'Медиа',
    'Мода': 'Мода',
    'Красота': 'Красота',
    'Игры': 'Игры',
    'Киберспорт': 'Киберспорт',
    'Автомобили': 'Автотехника',
    'Авиация': 'Авиация',
    'Морская отрасль': 'Морская',
    'Логистика': 'Логистика',
    'Сельское хозяйство': 'Сельхоз',
    'Энергетика': 'Энергетика',
    'Промышленность': 'Промышленность',
    'Инженерия': 'Инженерия',
    'Строительство': 'Строительство',
    'Недвижимость': 'Недвижимость',
    'Юриспруденция': 'Юриспруденция',
    'Законодательство': 'Законодательство',
    'Госуправление': 'Госуправление',
    'Международные отношения': 'Международные',
    'Геополитика': 'Геополитика',
    'Общество': 'Общество',
    'Региональные': 'Региональные',
    'Национальные': 'Национальные',
    'Мировые': 'Мировые',
    'Градостроительство': 'Градостр.'
  };
  return map[n] || n;
}

function sortItems(items) {
  const late = ['IT и разработка', 'DevOps и инфраструктура'];
  const normal = items.filter(i => !late.includes(i.name));
  const lateItems = items.filter(i => late.includes(i.name));
  const rus = normal.filter(i => /[а-яё]/i.test(i.name));
  const eng = normal.filter(i => !/[а-яё]/i.test(i.name));
  rus.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  eng.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  lateItems.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return [...rus, ...eng, ...lateItems];
}

function toggleCategoryBrowser() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const b = document.getElementById('categoryBrowser');
  if (!b) return;
  if (b.style.display === 'block') { b.style.display = 'none'; return; }
  document.querySelectorAll('.add-form,.category-form').forEach(f => f.style.display = 'none');
  b.style.display = 'block';
  categoryHistory = [];
  showLevel(null);
}

function showLevel(parentId) {
  const header = document.getElementById('categoryBrowserHeader');
  const grid = document.getElementById('categoryGrid');
  const back = document.getElementById('categoryBackBtn');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Загрузка...</div>';
  loadCategoryLevel(parentId).then(items => {
    if (!items || items.length === 0) { grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Нет элементов</div>'; return; }
    const sorted = sortItems(items);
    const hasSources = sorted.some(i => i.url && i.url.trim() !== '');
    let hText = parentId === null ? 'Выберите категорию' : (categoryHistory[categoryHistory.length - 1]?.name || 'Категория') + (hasSources ? ' — выберите источник' : ' — выберите подкатегорию');
    if (header) header.textContent = hText;
    grid.innerHTML = '';
    sorted.forEach(i => {
      const name = shortenCategoryName(i.name);
      const btn = document.createElement('button');
      btn.textContent = name;
      if (i.url) {
        btn.addEventListener('click', function() { addSourceByType(i.source_type || 'rss', i.url, name); });
      } else {
        btn.addEventListener('click', function() { openLevel(i.id, name); });
      }
      grid.appendChild(btn);
    });
    if (back) back.style.display = categoryHistory.length > 0 ? 'block' : 'none';
  }).catch(err => { grid.innerHTML = '<div style="text-align:center;padding:10px;color:red;">Ошибка: ' + err.message + '</div>'; });
}

function openLevel(id, name) { hapticFeedback(); categoryHistory.push({ id: id, name: name }); showLevel(id); }

function goBackLevel() {
  if (!ensureConsent()) return;
  hapticFeedback();
  if (categoryHistory.length === 0) { const b = document.getElementById('categoryBrowser'); if (b) b.style.display = 'none'; return; }
  categoryHistory.pop();
  if (categoryHistory.length === 0) showLevel(null);
  else showLevel(categoryHistory[categoryHistory.length - 1].id);
}

// ============================================================
//  ВРЕМЯ ПОЛУЧЕНИЯ
// ============================================================
function toggleTimePicker() {
  if (!ensureConsent()) return;
  hapticFeedback();
  if (!isPremium) { alert('⛔ Доступно только для Расширенного тарифа. Оформите подписку.'); return; }
  const p = document.getElementById('timePicker');
  if (!p) return;
  if (p.style.display === 'none') openTimePicker();
  else closeTimePicker();
}

function openTimePicker() { if (!isPremium) return; const p = document.getElementById('timePicker'); if (p) p.style.display = 'block'; renderTimePicker(); }

function closeTimePicker() { const p = document.getElementById('timePicker'); if (p) p.style.display = 'none'; }

function renderTimePicker() {
  const grid = document.getElementById('timePickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const cur = currentSendTime ? parseInt(currentSendTime.split(':')[0]) : -1;
  for (let h = 0; h < 24; h++) {
    const btn = document.createElement('button');
    btn.textContent = h.toString().padStart(2, '0') + ':00';
    if (h === cur) btn.classList.add('selected');
    btn.addEventListener('click', function() { setTime(h); });
    grid.appendChild(btn);
  }
}

async function setTime(hour) {
  if (!ensureConsent()) return;
  hapticFeedback();
  try {
    const resp = await apiRequest('/api/webapp/set_time', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ hour: hour })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка: ' + err.detail); return; }
    const data = await resp.json();
    currentSendTime = data.send_time;
    const timeDisplay = document.getElementById('currentTimeDisplay');
    if (timeDisplay) timeDisplay.textContent = currentSendTime + ' MSK';
    document.querySelectorAll('#timePickerGrid button').forEach((btn, idx) => { btn.classList.toggle('selected', idx === hour); });
    alert('✅ Время установлено на ' + currentSendTime);
    closeTimePicker();
    await loadSources();
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
  }
}

// ============================================================
//  ТАРИФЫ И ОПЛАТА
// ============================================================
function toggleTariffs() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const block = document.getElementById('tariffBlock');
  if (block) block.classList.toggle('visible');
}

async function handlePayment(tariffKey) {
  if (!ensureConsent()) return;
  hapticFeedback();
  if (!authToken) { alert('❌ Вы не авторизованы. Пожалуйста, войдите через Telegram.'); return; }
  console.log('💳 [app.js] handlePayment, тариф:', tariffKey);
  try {
    const resp = await apiRequest('/api/payment/create-invoice', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tariff: tariffKey })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка: ' + err.detail); return; }
    const data = await resp.json();
    if (data.payment_url) { window.open(data.payment_url, '_blank'); alert('🔗 Переход к оплате...'); } else { alert('❌ Не удалось получить ссылку на оплату'); }
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
  }
}

// ============================================================
//  КНОПКА "СМОТРЕТЬ НОВОСТИ" (ДАЙДЖЕСТ)
// ============================================================
async function toggleDigest() {
  if (!ensureConsent()) return;
  const container = document.getElementById('digestContainer');
  const content = document.getElementById('digestContent');
  if (!container || !content) return;
  if (digestVisible) {
    container.style.display = 'none';
    digestVisible = false;
    return;
  }
  container.style.display = 'block';
  digestVisible = true;
  content.innerHTML = '<div style="text-align:center; padding:20px; color: var(--text-secondary);">⏳ Загрузка...</div>';

  try {
    const resp = await apiRequest('/api/webapp/digest', { headers: getHeaders() });
    if (!resp) return;
    if (!resp.ok) {
      const err = await resp.json();
      content.innerHTML = `<div style="color: #ff6b6b; text-align:center; padding:20px;">❌ Ошибка: ${err.detail || 'Не удалось загрузить дайджест'}</div>`;
      return;
    }
    const data = await resp.json();
    let digestHtml = data.digest;

    if (!digestHtml || digestHtml.trim() === '' || digestHtml.includes('Дайджест ещё не формировался')) {
      content.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-secondary);">📭 Дайджест ещё не формировался. Запустите сбор вручную или дождитесь автоматического.</div>`;
      return;
    }

    await storageLocalSet({ digestCache: digestHtml });

    digestHtml = digestHtml.replace(/[\x00-\x1F\x7F-\x9F\u200B\u200C\u200D\uFEFF\u2028\u2029\r]/g, '');

    let blocks = digestHtml.split(/(?=\n- <b>)/).filter(b => b.trim().length > 0);
    if (blocks.length <= 1) {
      blocks = digestHtml.split(/(?=\n-)/).filter(b => b.trim().length > 0);
    }
    if (blocks.length <= 1) {
      blocks = digestHtml.split(/(?=- <b>)/).filter(b => b.trim().length > 0);
      if (blocks[0] && blocks[0].trim() === '') blocks.shift();
    }
    blocks = blocks.map(b => b.startsWith('\n') ? b.slice(1) : b);

    let html = '';
    for (let block of blocks) {
      let lines = block.split('\n');
      lines = lines.map(line => line.replace(/^[\s\u00A0]+/, ''));
      while (lines.length > 0 && lines[0].trim() === '') lines.shift();
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      let cleanedBlock = lines.join('\n');

      let isSummary = cleanedBlock.indexOf('<b>Обсуждения в ') !== -1;
      if (isSummary) {
        let summaryStart = cleanedBlock.indexOf('<b>Обсуждения в ');
        if (summaryStart !== -1) {
          let closeBpos = cleanedBlock.indexOf('</b>', summaryStart);
          if (closeBpos !== -1) {
            let linkStart = cleanedBlock.indexOf('<a href', closeBpos);
            if (linkStart === -1) linkStart = cleanedBlock.length;
            let before = cleanedBlock.slice(0, closeBpos + 4);
            let body = cleanedBlock.slice(closeBpos + 4, linkStart);
            let after = cleanedBlock.slice(linkStart);
            body = body.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
            after = after.replace(/^\s*\n+/, '');
            let parts = body.split(/\s*-\s*/).filter(p => p.trim() !== '');
            let newBody;
            if (parts.length > 1) {
              newBody = parts.map(p => '- ' + p.trim()).join('\n\n');
            } else {
              newBody = body.trim();
            }
            cleanedBlock = before + '\n\n' + newBody + '\n' + after;
          }
        }
      }

      if (cleanedBlock.includes('</b>')) {
        cleanedBlock = cleanedBlock.replace(/(<\/b>)(?!\n)/, '$1\n');
      }
      if (cleanedBlock.includes('<a href')) {
        cleanedBlock = cleanedBlock.replace(/(?!\n)(<a href)/, '\n$1');
      }
      cleanedBlock = cleanedBlock.replace(/\n{3,}/g, '\n\n');

      if (cleanedBlock) {
        html += `<div class="status-block">${cleanedBlock}</div>`;
      }
    }

    if (html) {
      content.innerHTML = html;
      content.querySelectorAll('a').forEach(link => link.target = '_blank');
    } else {
      content.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-secondary);">📭 Новости не найдены.</div>`;
    }

  } catch (e) {
    console.error('Ошибка в toggleDigest:', e);
    content.innerHTML = `<div style="color: #ff6b6b; text-align:center; padding:20px;">❌ Ошибка: ${e.message}</div>`;
  }
}

function showDigestFromCache(cachedHtml) {
  // можно использовать для офлайн-отображения
}

// ============================================================
//  ПРЕДЛОЖИТЬ ИСТОЧНИК
// ============================================================
function suggestSource() {
  if (!ensureConsent()) return;
  hapticFeedback();
  const url = 'https://t.me/professional_interior_design';
  const text = 'Добрый день. Хочу предложить источник:';
  window.open(url + '?text=' + encodeURIComponent(text), '_blank');
}

// ============================================================
//  ВЫХОД ИЗ АККАУНТА
// ============================================================
function logout() {
  const confirmLogout = () => {
    storageSet({ authToken: null, botAuthToken: null, maxAuthToken: null });
    storageLocalSet({ digestCache: null });
    authToken = null;
    currentSources = [];
    window.location.reload();
  };

  if (window.confirm('Вы уверены, что хотите выйти?')) {
    confirmLogout();
  }
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
(async function init() {
  console.log('🚀 [app.js] init() запущена');
  try {
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth_token');

    if (authParam) {
      console.log('🔑 [app.js] найден auth_token в URL');
      authToken = authParam;
      await storageSet({ authToken: authParam });
      const newUrl = window.location.pathname + window.location.search.replace(/[?&]auth_token=[^&]+/, '');
      window.history.replaceState({}, '', newUrl);
      await loadSources();
      return;
    }

    await loadStoredData();

    if (authToken) {
      console.log('🔑 [app.js] токен из хранилища:', !!authToken);
      try {
        await loadSources();
      } catch (e) {
        console.error('❌ [app.js] loadSources из init ошибка:', e);
        showLoginScreen();
      }
    } else {
      console.log('🔑 [app.js] токен отсутствует, показываем экран входа');
      showLoginScreen();
    }

    const action = params.get('action');
    if (action === 'addRSS') {
      const url = params.get('url');
      if (url && authToken) {
        setTimeout(() => {
          const input = document.getElementById('sourceValue');
          if (input) input.value = url;
          toggleAddForm('rss');
        }, 500);
      }
    } else if (action === 'addTelegram') {
      const url = params.get('url');
      if (url && authToken) {
        let username = url;
        if (url.includes('t.me/')) {
          username = url.split('t.me/')[1].split('/')[0];
        }
        setTimeout(() => {
          const input = document.getElementById('sourceValue');
          if (input) input.value = username;
          toggleAddForm('telegram');
        }, 500);
      }
    }
  } catch (e) {
    console.error('❌ [app.js] Критическая ошибка в init():', e);
    alert('Ошибка загрузки расширения. Пожалуйста, перезагрузите страницу.');
  }
  console.log('🏁 [app.js] init() завершена');
})();

// ============================================================
//  ЭКСПОРТЫ
// ============================================================
window.toggleTariffs = toggleTariffs;
window.handlePayment = handlePayment;
window.startPayment = handlePayment;
window.toggleCategoryForm = toggleCategoryForm;
window.toggleAddForm = toggleAddForm;
window.toggleGitHubForm = toggleGitHubForm;
window.toggleYouTubeForm = toggleYouTubeForm;
window.toggleRedditForm = toggleRedditForm;
window.toggleGoogleNewsForm = toggleGoogleNewsForm;
window.addSourceSubmit = addSourceSubmit;
window.addCategorySource = addCategorySource;
window.addForbesTelegram = addForbesTelegram;
window.closeAddForm = closeAddForm;
window.closeGitHubForm = closeGitHubForm;
window.closeYouTubeForm = closeYouTubeForm;
window.closeRedditForm = closeRedditForm;
window.closeGoogleNewsForm = closeGoogleNewsForm;
window.confirmDelete = confirmDelete;
window.askOpenLink = askOpenLink;
window.updateStatus = updateStatus;
window.toggleTimePicker = toggleTimePicker;
window.closeTimePicker = closeTimePicker;
window.setTime = setTime;
window.toggleCategoryBrowser = toggleCategoryBrowser;
window.goBackLevel = goBackLevel;
window.openLevel = openLevel;
window.showLevel = showLevel;
window.addSourceByType = addSourceByType;
window.loadCategoryLevel = loadCategoryLevel;
window.shortenCategoryName = shortenCategoryName;
window.sortItems = sortItems;
window.generateGitHubRSS = generateGitHubRSS;
window.generateYouTubeRSS = generateYouTubeRSS;
window.generateRedditRSS = generateRedditRSS;
window.generateGoogleNewsRSS = generateGoogleNewsRSS;
window.addRSSSource = addRSSSource;
window.toggleDigest = toggleDigest;
window.suggestSource = suggestSource;
window.startBotAuth = startBotAuth;
window.startMaxAuth = startMaxAuth;
window.logout = logout;