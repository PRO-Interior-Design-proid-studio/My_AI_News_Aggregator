// app.js — основная логика для расширения Chrome
// Адаптировано из pwa.html с заменой localStorage на browser.storage

// ============================================================
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let authToken = null;
let currentSources = [];
let currentLimit = 5;
let currentSendTime = null;
let isPremium = false;
let defaultSendHour = 18;
let digestVisible = false;
let categoryHistory = [];
const CATEGORY_CACHE_TTL = 3600000;

// ============================================================
//  РАБОТА С ХРАНИЛИЩЕМ (browser.storage)
// ============================================================
function storageGet(keys) {
  return new Promise((resolve) => {
    browser.storage.sync.get(keys, resolve);
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    browser.storage.sync.set(items, resolve);
  });
}

function storageLocalGet(keys) {
  return new Promise((resolve) => {
    browser.storage.local.get(keys, resolve);
  });
}

function storageLocalSet(items) {
  return new Promise((resolve) => {
    browser.storage.local.set(items, resolve);
  });
}

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
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('appScreen').classList.add('hidden');
}

function showAppScreen() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').classList.remove('hidden');
}

async function apiRequest(url, options = {}) {
  try {
    const resp = await fetch(url, options);
    if (resp.status === 503) {
      alert('⚠️ Сервер временно недоступен. Пожалуйста, обновите страницу через несколько секунд.');
      return null;
    }
    return resp;
  } catch (err) {
    throw err;
  }
}

// ============================================================
//  ЗАГРУЗКА ДАННЫХ ПРИ СТАРТЕ
// ============================================================
async function loadStoredData() {
  const result = await storageGet(['authToken', 'sources', 'limit', 'premium', 'sendTime', 'defaultSendHour', 'digestCache']);
  authToken = result.authToken || null;
  currentSources = result.sources || [];
  currentLimit = result.limit || 5;
  isPremium = result.premium || false;
  currentSendTime = result.sendTime || null;
  defaultSendHour = result.defaultSendHour || 18;

  // Если есть кеш дайджеста – показываем его при загрузке (офлайн-режим)
  if (result.digestCache) {
    showDigestFromCache(result.digestCache);
  }
}

// ============================================================
//  ЗАГРУЗКА ИСТОЧНИКОВ (ОСНОВНАЯ) С ПРОВЕРКОЙ СОГЛАСИЯ
// ============================================================
async function loadSources() {
  if (!authToken) {
    showLoginScreen();
    return;
  }

  try {
    const resp = await apiRequest('/api/webapp/sources', { headers: getHeaders() });
    if (!resp) return;

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        // Токен просрочен
        authToken = null;
        await storageSet({ authToken: null });
        showLoginScreen();
        return;
      }
      const err = await resp.json();
      throw new Error(err.detail || 'Ошибка загрузки');
    }

    const data = await resp.json();
    currentSources = data.sources || [];
    currentLimit = data.limit || 5;
    isPremium = data.is_premium || false;
    currentSendTime = data.send_time || null;
    defaultSendHour = data.default_send_hour || 18;

    // Сохраняем в browser.storage
    await storageSet({
      sources: currentSources,
      limit: currentLimit,
      premium: isPremium,
      sendTime: currentSendTime,
      defaultSendHour: defaultSendHour
    });

    renderGroupedSources(currentSources);
    updateStatus(data);
    document.getElementById('counter').textContent = currentSources.length;
    showAppScreen();

    // ===== БЛОК СОГЛАСИЯ =====
    const consentBlock = document.getElementById('consentBlock');
    if (data.consent_given === false) {
      consentBlock.style.display = 'block';
    } else {
      consentBlock.style.display = 'none';
    }
    // ========================

  } catch (err) {
    console.error('Ошибка загрузки источников:', err);
    document.getElementById('sourceListContainer').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Ошибка загрузки</h3><p>${err.message}</p></div>`;
    showAppScreen();
  }
}

// ============================================================
//  АВТОРИЗАЦИЯ ЧЕРЕЗ TELEGRAM
// ============================================================
async function startBotAuth() {
  hapticFeedback();
  document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'none';
  const w = document.getElementById('widgetContainer');
  w.innerHTML = '<div class="loader"></div>';

  try {
    const resp = await apiRequest('/api/auth/bot-token');
    if (!resp) {
      document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
      w.innerHTML = '';
      return;
    }
    if (!resp.ok) throw new Error('Не удалось получить токен');

    const data = await resp.json();
    const token = data.token;
    const botUsername = data.bot_username || 'My_AI_News_Aggregator_bot';

    // Сохраняем токен для опроса
    await storageSet({ botAuthToken: token });

    // Открываем Telegram бота в новой вкладке
    browser.tabs.create({ url: `https://t.me/${botUsername}?start=${encodeURIComponent(token)}` });

    pollBotAuthStatus(token);
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
    document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
    w.innerHTML = '';
  }
}

function pollBotAuthStatus(token) {
  let attempts = 0;
  const maxAttempts = 60;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const resp = await apiRequest(`/api/auth/bot-status?token=${encodeURIComponent(token)}`);
      if (!resp) return;
      const result = await resp.json();

      if (result.status === 'success') {
        clearInterval(interval);
        const id = result.telegram_id;
        if (id) {
          const tr = await fetch(`/api/auth/get-token?telegram_id=${encodeURIComponent(id)}`, { headers: getHeaders() });
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
        document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
        document.getElementById('widgetContainer').innerHTML = '';
      } else if (result.status === 'expired') {
        clearInterval(interval);
        alert('⏰ Время истекло. Попробуйте снова.');
        document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
        document.getElementById('widgetContainer').innerHTML = '';
      }
    } catch (e) {}
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      alert('⏰ Время истекло. Попробуйте снова.');
      document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
      document.getElementById('widgetContainer').innerHTML = '';
    }
  }, 3000);
}

// ============================================================
//  АВТОРИЗАЦИЯ ЧЕРЕЗ MAX
// ============================================================
async function startMaxAuth() {
  hapticFeedback();
  document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'none';
  const w = document.getElementById('widgetContainer');
  w.innerHTML = '<div class="loader"></div>';

  try {
    const resp = await apiRequest('/api/auth/max-token');
    if (!resp) {
      document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
      w.innerHTML = '';
      return;
    }
    if (!resp.ok) throw new Error('Не удалось получить токен');

    const data = await resp.json();
    const token = data.token;
    const botUsername = data.bot_username || 'id772609477460_bot';

    await storageSet({ maxAuthToken: token });
    startMaxWaiting(token);
    browser.tabs.create({ url: `https://max.ru/${botUsername}?start=${encodeURIComponent(token)}` });
    w.innerHTML = '<p style="color: var(--text-secondary);">Ожидаем подтверждения в MAX...</p>';
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
    document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
    w.innerHTML = '';
  }
}

function startMaxWaiting(token) {
  let attempts = 0;
  const maxAttempts = 60;
  const timer = setInterval(async () => {
    attempts++;
    try {
      const resp = await apiRequest(`/api/auth/max-status/${token}`);
      if (!resp) return;
      const data = await resp.json();

      if (data.ready && data.auth_token) {
        clearInterval(timer);
        authToken = data.auth_token;
        await storageSet({ authToken });
        alert('✅ Аккаунт привязан, перенаправляем...');
        // Перезагружаем страницу, чтобы применить токен
        window.location.href = browser.runtime.getURL('app.html') + '?auth_token=' + encodeURIComponent(authToken);
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        alert('⏰ Время истекло. Попробуйте снова.');
        document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
        document.getElementById('widgetContainer').innerHTML = '';
      }
    } catch (e) {}
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
      item.onclick = function () { askOpenLink(u); };
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
      delBtn.onclick = function (e) { e.stopPropagation(); hapticFeedback(); confirmDelete(s.id); };
      item.appendChild(info);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
    container.appendChild(list);
  });
}

function updateStatus(data) {
  document.getElementById('statusTariff').textContent = data.tariff_name || '—';
  document.getElementById('statusSources').textContent = data.used || 0;
  document.getElementById('statusLimit').textContent = data.limit || 5;
  document.getElementById('statusAutoSend').textContent = '✅';
  document.getElementById('statusLastSent').textContent = data.last_sent || '—';
  document.getElementById('statusExpires').textContent = data.expires_at || '—';
  isPremium = data.is_premium || false;
  defaultSendHour = data.default_send_hour || 18;
  currentSendTime = data.send_time || null;
  const display = currentSendTime ? currentSendTime : (defaultSendHour.toString().padStart(2, '0') + ':00');
  document.getElementById('currentTimeDisplay').textContent = display + ' MSK';
  const btn = document.getElementById('changeTimeBtn');
  const hint = document.getElementById('upgradeHint');
  if (isPremium) {
    btn.style.display = 'inline-block';
    btn.disabled = false;
    hint.style.display = 'none';
  } else {
    btn.style.display = 'none';
    hint.style.display = 'inline-block';
    if (document.getElementById('timePicker').style.display !== 'none') closeTimePicker();
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
function closeAddForm() { document.getElementById('addForm').style.display = 'none'; }
function closeGitHubForm() { document.getElementById('githubForm').style.display = 'none'; }
function closeYouTubeForm() { document.getElementById('youtubeForm').style.display = 'none'; }
function closeRedditForm() { document.getElementById('redditForm').style.display = 'none'; }
function closeGoogleNewsForm() { document.getElementById('googleNewsForm').style.display = 'none'; }

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
          btn.onclick = function () { addCategorySource('rss', url, name); };
          grid.appendChild(btn);
        });
      } else {
        grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Категории не загружены</div>';
      }
    }
  }
}

function toggleAddForm(type) {
  hapticFeedback();
  const form = document.getElementById('addForm');
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    currentAddType = type;
    const title = document.getElementById('addFormTitle');
    const labels = { 'rss': 'RSS/HTML', 'telegram': 'Telegram', 'vk': 'VK' };
    title.textContent = 'Добавить ' + labels[type];
    const input = document.getElementById('sourceValue');
    input.placeholder = type === 'rss' ? 'Введите URL...' : (type === 'telegram' ? 'Введите username (без @)...' : 'Введите username (без @)...');
    input.value = '';
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

function toggleGitHubForm() {
  hapticFeedback();
  const form = document.getElementById('githubForm');
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    form.style.display = 'block';
    updateGitHubButtons('');
    const input = document.getElementById('githubInput');
    input.removeEventListener('input', window._githubInputHandler);
    window._githubInputHandler = function () {
      updateGitHubButtons(this.value);
    };
    input.addEventListener('input', window._githubInputHandler);
  } else {
    form.style.display = 'none';
  }
}

function toggleYouTubeForm() {
  hapticFeedback();
  const form = document.getElementById('youtubeForm');
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

function toggleRedditForm() {
  hapticFeedback();
  const form = document.getElementById('redditForm');
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

function toggleGoogleNewsForm() {
  hapticFeedback();
  const form = document.getElementById('googleNewsForm');
  const isHidden = window.getComputedStyle(form).display === 'none';
  document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
  if (isHidden) {
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
}

// ============================================================
//  ДОБАВЛЕНИЕ ИСТОЧНИКОВ
// ============================================================
function addForbesTelegram() {
  hapticFeedback();
  addCategorySource('telegram', 'forbesrussia', 'Forbes (Telegram)');
}

let currentAddType = 'rss';

async function addSourceSubmit() {
  hapticFeedback();
  const val = document.getElementById('sourceValue').value.trim();
  if (!val) { alert('Введите значение'); return; }
  if (!window.confirm('Добавить источник?\n\n' + val)) return;
  try {
    const resp = await apiRequest('/api/webapp/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ source_type: currentAddType, source_value: val })
    });
    if (!resp) return;
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка: ' + err.detail); return; }
    await loadSources();
    alert('✅ Источник добавлен');
    document.getElementById('addForm').style.display = 'none';
    document.getElementById('sourceValue').value = '';
  } catch (err) {
    alert('❌ Ошибка добавления: ' + err.message);
  }
}

async function addCategorySource(t, u, n) {
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
  hapticFeedback();
  if (!u || !u.trim()) { alert('URL не может быть пустым.'); return; }
  let final = u.trim();
  if (!final.startsWith('http://') && !final.startsWith('https://')) final = 'https://' + final;
  fetch('/api/webapp/add', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ source_type: 'rss', source_value: final })
  })
  .then(async resp => {
    if (resp.status === 503) { alert('⚠️ Сервер временно недоступен. Пожалуйста, обновите страницу через несколько секунд.'); return; }
    if (!resp.ok) { const err = await resp.json(); alert('❌ Ошибка добавления: ' + err.detail); return; }
    await loadSources();
    alert('✅ Источник добавлен: ' + n);
    document.querySelectorAll('.category-form,.add-form').forEach(f => f.style.display = 'none');
  })
  .catch(err => { alert('❌ Ошибка: ' + err.message); });
}

function addSourceByType(t, u, n) {
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
  const btns = grid.querySelectorAll('button');
  const hasSlash = v && v.includes('/');
  btns.forEach(btn => {
    const type = btn.dataset.type;
    if (type === 'username') btn.disabled = !v || !v.trim();
    else btn.disabled = !(hasSlash && v.trim());
  });
}

function generateGitHubRSS(t) {
  hapticFeedback();
  const input = document.getElementById('githubInput');
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
      case 'releases':
        path = 'releases.atom';
        break;
      case 'tags':
        path = 'tags.atom';
        break;
      case 'commits':
        path = 'commits.atom';
        break;
      case 'main':
        path = 'commits/main.atom';
        break;
      case 'master':
        path = 'commits/master.atom';
        break;
      default:
        path = 'releases.atom';
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
  hapticFeedback();
  const input = document.getElementById('youtubeInput');
  let val = input.value.trim();
  if (!val) { alert('Введите имя канала или channelId.'); return; }
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
    document.getElementById('youtubeForm').style.display = 'none';
    document.getElementById('youtubeInput').value = '';
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

// ============================================================
//  REDDIT ГЕНЕРАТОР
// ============================================================
function generateRedditRSS() {
  hapticFeedback();
  const input = document.getElementById('redditInput');
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
  hapticFeedback();
  const input = document.getElementById('googleNewsInput');
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
  hapticFeedback();
  const b = document.getElementById('categoryBrowser');
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
  grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Загрузка...</div>';
  loadCategoryLevel(parentId).then(items => {
    if (!items || items.length === 0) { grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Нет элементов</div>'; return; }
    const sorted = sortItems(items);
    const hasSources = sorted.some(i => i.url && i.url.trim() !== '');
    let hText = parentId === null ? 'Выберите категорию' : (categoryHistory[categoryHistory.length - 1]?.name || 'Категория') + (hasSources ? ' — выберите источник' : ' — выберите подкатегорию');
    header.textContent = hText;
    grid.innerHTML = '';
    sorted.forEach(i => {
      const name = shortenCategoryName(i.name);
      const btn = document.createElement('button');
      btn.textContent = name;
      if (i.url) {
        btn.onclick = function () { addSourceByType(i.source_type || 'rss', i.url, name); };
      } else {
        btn.onclick = function () { openLevel(i.id, name); };
      }
      grid.appendChild(btn);
    });
    back.style.display = categoryHistory.length > 0 ? 'block' : 'none';
  }).catch(err => { grid.innerHTML = '<div style="text-align:center;padding:10px;color:red;">Ошибка: ' + err.message + '</div>'; });
}

function openLevel(id, name) { hapticFeedback(); categoryHistory.push({ id: id, name: name }); showLevel(id); }

function goBackLevel() {
  hapticFeedback();
  if (categoryHistory.length === 0) { document.getElementById('categoryBrowser').style.display = 'none'; return; }
  categoryHistory.pop();
  if (categoryHistory.length === 0) showLevel(null);
  else showLevel(categoryHistory[categoryHistory.length - 1].id);
}

// ============================================================
//  ВРЕМЯ ПОЛУЧЕНИЯ
// ============================================================
function toggleTimePicker() {
  hapticFeedback();
  if (!isPremium) { alert('⛔ Доступно только для Расширенного тарифа. Оформите подписку.'); return; }
  const p = document.getElementById('timePicker');
  if (p.style.display === 'none') openTimePicker();
  else closeTimePicker();
}

function openTimePicker() { if (!isPremium) return; document.getElementById('timePicker').style.display = 'block'; renderTimePicker(); }

function closeTimePicker() { document.getElementById('timePicker').style.display = 'none'; }

function renderTimePicker() {
  const grid = document.getElementById('timePickerGrid');
  grid.innerHTML = '';
  const cur = currentSendTime ? parseInt(currentSendTime.split(':')[0]) : -1;
  for (let h = 0; h < 24; h++) {
    const btn = document.createElement('button');
    btn.textContent = h.toString().padStart(2, '0') + ':00';
    if (h === cur) btn.classList.add('selected');
    btn.onclick = function () { setTime(h); };
    grid.appendChild(btn);
  }
}

async function setTime(hour) {
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
    document.getElementById('currentTimeDisplay').textContent = currentSendTime + ' MSK';
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
function toggleTariffs() { hapticFeedback(); document.getElementById('tariffBlock').classList.toggle('visible'); }

async function handlePayment(tariffKey) {
  hapticFeedback();
  if (!authToken) { alert('❌ Вы не авторизованы. Пожалуйста, войдите через Telegram.'); return; }
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
//  КНОПКА "СМОТРЕТЬ НОВОСТИ" (ОБНОВЛЕНА С УДАЛЕНИЕМ ПУСТЫХ СТРОК)
// ============================================================
async function toggleDigest() {
  const container = document.getElementById('digestContainer');
  const content = document.getElementById('digestContent');
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

    // Сохраняем в кеш (browser.storage.local)
    await storageLocalSet({ digestCache: digestHtml });

    // Удаляем управляющие символы
    digestHtml = digestHtml.replace(/[\x00-\x1F\x7F-\x9F\u200B\u200C\u200D\uFEFF\u2028\u2029\r]/g, '');

    // Разбиение на блоки
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

      // Принудительные переносы
      if (cleanedBlock.includes('</b>')) {
        cleanedBlock = cleanedBlock.replace(/(<\/b>)(?!\n)/, '$1\n');
      }
      if (cleanedBlock.includes('<a href')) {
        cleanedBlock = cleanedBlock.replace(/(?!\n)(<a href)/, '\n$1');
      }
      cleanedBlock = cleanedBlock.replace(/\n{3,}/g, '\n\n');

      // Обработка суммаризаций
      let summaryStart = cleanedBlock.indexOf('<b>Обсуждения в ');
      if (summaryStart !== -1) {
        let closeBpos = cleanedBlock.indexOf('</b>', summaryStart);
        if (closeBpos !== -1) {
          let linkStart = cleanedBlock.indexOf('<a href', closeBpos);
          if (linkStart === -1) linkStart = cleanedBlock.length;
          let before = cleanedBlock.slice(0, closeBpos + 4);
          let body = cleanedBlock.slice(closeBpos + 4, linkStart);
          let after = cleanedBlock.slice(linkStart);
          let parts = body.split(/\s*-\s*/).filter(p => p.trim() !== '');
          if (parts.length > 1) {
            let first = parts[0].trim();
            let rest = parts.slice(1).map(p => '- ' + p.trim()).join('\n\n- ');
            let newBody = first + '\n\n' + rest;
            cleanedBlock = before + newBody + after;
          }
        }
      }

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
  // Отображаем кеш, если нет других данных (используется при офлайн-загрузке)
  const container = document.getElementById('digestContainer');
  const content = document.getElementById('digestContent');
  // Если контейнер скрыт, не показываем кеш принудительно
}

// ============================================================
//  ПРЕДЛОЖИТЬ ИСТОЧНИК
// ============================================================
function suggestSource() {
  hapticFeedback();
  const url = 'https://t.me/professional_interior_design';
  const text = 'Добрый день. Хочу предложить источник:';
  window.open(url + '?text=' + encodeURIComponent(text), '_blank');
}

// ============================================================
//  ОБРАБОТЧИКИ БЛОКА КОНФИДЕНЦИАЛЬНОСТИ
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  const check = document.getElementById('consentCheck');
  const btn = document.getElementById('consentAcceptBtn');

  if (check && btn) {
    check.addEventListener('change', function() {
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
      if (!check.checked) return;
      try {
        const resp = await fetch('/api/webapp/consent', {
          method: 'POST',
          headers: getHeaders()
        });
        if (resp.ok) {
          document.getElementById('consentBlock').style.display = 'none';
          // Обновляем данные, чтобы зафиксировать согласие
          await loadSources();
        } else {
          const err = await resp.json();
          alert('❌ Ошибка: ' + (err.detail || 'Не удалось сохранить согласие'));
        }
      } catch (e) {
        alert('❌ Ошибка: ' + e.message);
      }
    });
  }
});

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
(async function init() {
  // Загружаем сохранённые данные
  await loadStoredData();

  // Если есть токен – загружаем приложение
  if (authToken) {
    try {
      await loadSources();
    } catch (e) {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }

  // Обработка параметров URL (например, ?action=addRSS&url=...)
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action === 'addRSS') {
    const url = params.get('url');
    if (url && authToken) {
      setTimeout(() => {
        document.getElementById('sourceValue').value = url;
        toggleAddForm('rss');
      }, 500);
    }
  } else if (action === 'addTelegram') {
    const url = params.get('url');
    if (url && authToken) {
      // Извлекаем username из ссылки
      let username = url;
      if (url.includes('t.me/')) {
        username = url.split('t.me/')[1].split('/')[0];
      }
      setTimeout(() => {
        document.getElementById('sourceValue').value = username;
        toggleAddForm('telegram');
      }, 500);
    }
  } else if (action === 'saveToDigest') {
    // Просто открываем приложение
  }

  // Если в URL есть auth_token (после редиректа от MAX), сохраняем и удаляем параметр
  const authParam = params.get('auth_token');
  if (authParam) {
    authToken = authParam;
    await storageSet({ authToken });
    // Удаляем параметр из URL
    const newUrl = window.location.pathname + window.location.search.replace(/[?&]auth_token=[^&]+/, '');
    window.history.replaceState({}, '', newUrl);
    loadSources();
  }
})();

// Экспортируем функции в глобальную область для вызова из HTML
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