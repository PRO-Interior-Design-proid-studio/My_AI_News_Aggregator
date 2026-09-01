```markdown
# 📘 ИТОГОВЫЕ ИСТИНЫ ДЛЯ РАСШИРЕНИЙ CHROME И FIREFOX (v3.3)

> **Дата фиксации:** 31 августа 2026 г.  
> **Версия:** 3.3 (закреплён эталон `app.html` – внешние `app.css` и `app.js`, строгий запрет inline-кода, удалены все секреты).  
> **Назначение:** Передача новому ИИ полного контекста для разработки и поддержки расширений браузера проекта «Моя АнтиСоцсеть».  
> **Основа:** история ошибок, требования заказчика, эталонный код PWA (`pwa.html`), логи сервера, последние изменения по CSP и синхронизация версий.

---

## 1. БАЗОВЫЕ ПРИНЦИПЫ РАСШИРЕНИЙ

### 1.1. Поддерживаемые браузеры
- **Chromium:** Chrome, Edge, Opera, Яндекс.Браузер, Brave, Vivaldi, Arc.  
- **Firefox** (версия 140+).  
- **Safari не поддерживается.**

### 1.2. Структура папок (в проекте)
- `webapp/app/chrome-web-store-app/` – исходники для Chromium (основная папка разработки).  
- `webapp/app/mozilla-web-store-app/` – генерируется из Chromium-папки скриптом `app` (не редактировать вручную).  
- **Все изменения вносятся только в Chrome-папку**, затем запускается `app` для синхронизации и создания ZIP-архивов.

### 1.3. Скрипт сборки
- **Команда:** `app` (симлинк на `/root/digest/generate_extensions.sh`).  
- **Действия:** увеличивает патч-версию в манифесте, копирует файлы в Firefox-папку, адаптирует манифест, создаёт `chrome.zip` и `firefox.zip`.  
- **После сборки:** загружаем `chrome.zip` в Chrome Web Store, `firefox.zip` – в Firefox Add-ons.

---

## 2. МАНИФЕСТ (manifest.json) – КРИТИЧЕСКИЕ ПРАВИЛА

### 2.1. Минимальные разрешения (ОБЯЗАТЕЛЬНО)
```json
"permissions": ["activeTab"],
"host_permissions": ["https://news.proid.studio/*"]
```
**ЗАПРЕЩЕНО** добавлять `storage`, `alarms`, `contextMenus` – они не используются и ведут к отклонению в магазинах.

### 2.2. Эталонный манифест (Chromium)
```json
{
  "manifest_version": 3,
  "name": "Моя АнтиСоцсеть — Полноценный Агрегатор",
  "version": "1.3.174",
  "description": "Персонализированная AI-лента новостей в вашем браузере.",
  "permissions": ["activeTab"],
  "host_permissions": ["https://news.proid.studio/*"],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_icon": { "16": "icon16.png", "48": "icon48.png", "128": "icon128.png" },
    "default_title": "Моя АнтиСоцсеть — Полноценный Агрегатор"
  },
  "icons": { "16": "icon16.png", "48": "icon48.png", "128": "icon128.png" }
}
```

### 2.3. Firefox-адаптация (генерируется автоматически)
- `background.scripts` вместо `service_worker`.  
- Добавляется `browser_specific_settings` с `gecko.id` и `strict_min_version`.  
- **НЕ** добавлять `content_security_policy` – это вызывает ошибки.

### 2.4. Работа с JSON (ЗАПОМНИТЬ!)
- **Запрещено** использовать `sed` для правки манифеста – только `jq`.  
- После изменений проверять валидность: `jq empty manifest.json`.  
- Версию увеличивать только патч-часть (например, `1.3.22` → `1.3.23`).  
- **Версия автоматически синхронизируется с `sw.js`** при каждом `rest` (см. раздел 13).

---

## 3. BACKGROUND.JS – УНИВЕРСАЛЬНЫЙ ЭТАЛОН

```javascript
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

// Обработчик сообщений (опционально, для бейджа)
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

console.log('✅ Моя АнтиСоцсеть: расширение загружено');
```
**Правила:**  
- Расширение открывается в **текущей вкладке** (проверка через `tabs.query`).  
- Не использовать `contextMenus`, `alarms`, `storage` – они не нужны.  
- Единый API через `browserAPI` – обеспечивает совместимость с Firefox.

---

## 4. APP.JS – ГЛАВНАЯ ЛОГИКА (ЭТАЛОН С УЧЁТОМ CSP)

### 4.1. Ключевые особенности последней версии
- **Полностью соответствует CSP** – все inline-обработчики удалены, все события назначаются через `addEventListener` внутри единого `DOMContentLoaded`.
- **Кнопки оплаты** используют `data-tariff` и слушатель `click`.
- **Блок "Сделано с любовью"** имеет `id="loveBlock"` и слушатель.
- **Ссылка "Доступно в Расширенном тарифе"** имеет `id="upgradeLink"` и `preventDefault()`.
- **Авторизация через VK, Яндекс, MAX** – работает через опрос сервера (`pollForToken` для VK и Яндекса; отдельный механизм для MAX).  
- **Запасной механизм** – слушатель `postMessage` для приёма токена от PWA.
- **Единая функция `renderGroupedSources`** – группировка источников, кнопка «Ещё», скрытие пустых групп.  
- **Погода** – загружается с `open-meteo.com` через прокси-эндпоинт `/api/weather/forecast`.

### 4.2. Полный код app.js (эталон)
> Полный код `app.js` приведён в документации к проекту (он же используется в последнем PWA).  
> В этом файле **нет** ни одного inline-обработчика – все события навешиваются через `addEventListener` внутри `DOMContentLoaded`.  
> **Ключевые функции:** `pollForToken`, `renderGroupedSources`, `toggleDigest`, `handlePayment`, `startVkAuth`, `startMaxAuth`, `startYandexAuth`, `logout`, `fetchWeather`.

---

## 5. APP.HTML – ЭТАЛОННАЯ СТРАНИЦА РАСШИРЕНИЯ

### 5.1. Жёсткое правило
**Эталонная версия `app.html` для расширения – подключает внешние `app.css` и `app.js`, использует `div`, не содержит лишнего inline-кода. Всегда делать только так.**

### 5.2. Принципы
- **В HTML нет атрибутов `onclick`, `onchange` и т.п.** – все события назначаются через JavaScript.  
- Все элементы, на которые ссылается `app.js`, имеют уникальные `id`.  
- Кнопки оплаты имеют `class="price-btn"` и `data-tariff="..."`.  
- Футер и навигация – с абсолютными ссылками.

### 5.3. Полный эталонный код app.html

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<link rel="icon" href="https://news.proid.studio/icons/favicon.ico">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Моя АнтиСоцсеть — персонализированная лента с искусственным интеллектом</title>
<meta name="description" content="Войдите в Моя АнтиСоцсеть, чтобы получать ежедневные персонализированные ленты новостей из ваших любимых источников. Авторизация через VK, MAX или Яндекс ID.">
<meta name="keywords" content="AI новости, лента, персонализированные новости, VK, MAX, Яндекс ID, агрегатор новостей">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://news.proid.studio/pwa">
<meta property="og:title" content="Вход в Моя АнтиСоцсеть">
<meta property="og:description" content="Персонализированная AI-лента новостей. Войдите через VK, MAX или Яндекс ID.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://news.proid.studio/pwa">
<meta property="og:image" content="https://news.proid.studio/picture/LOGO.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Моя АнтиСоцсеть">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Вход в Моя АнтиСоцсеть">
<meta name="twitter:description" content="Персонализированная AI-лента новостей. Войдите через VK, MAX или Яндекс ID.">
<meta name="twitter:image" content="https://news.proid.studio/picture/LOGO.jpg">
<script type="application/ld+json">
{
"@context": "https://schema.org",
"@type": "WebApplication",
"name": "Моя АнтиСоцсеть",
"url": "https://news.proid.studio/",
"description": "Персонализированная AI-лента новостей из выбранных источников.",
"applicationCategory": "NewsAggregator",
"operatingSystem": "All",
"browserRequirements": "Modern browser",
"offers": {"@type":"Offer","price":"0","priceCurrency":"RUB"}
}
</script>
<link rel="manifest" href="https://news.proid.studio/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="https://news.proid.studio/icons/apple-icon-180x180.png">
<link rel="apple-touch-icon" sizes="152x152" href="https://news.proid.studio/icons/apple-icon-152x152.png">
<link rel="apple-touch-icon" sizes="144x144" href="https://news.proid.studio/icons/apple-icon-144x144.png">
<link rel="apple-touch-icon" sizes="120x120" href="https://news.proid.studio/icons/apple-icon-120x120.png">
<link rel="apple-touch-icon" sizes="114x114" href="https://news.proid.studio/icons/apple-icon-114x114.png">
<meta name="theme-color" content="#010715">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div class="page-wrap">
<div class="container">
<div id="loginScreen">
<div class="header"><h1>Моя АнтиСоцсеть</h1></div>
<div class="auth-container">
   <button class="auth-btn max" id="maxLoginBtn"><span class="icon">🚀</span> Войти через MAX</button>
   <button class="auth-btn vk" id="vkLoginBtn"><span class="icon">🚀</span> Войти через VK</button>
   <button class="auth-btn yandex" id="yandexLoginBtn"><span class="icon">🚀</span> Войти через Яндекс</button>
</div>
<!-- ===== ВХОД ПО ПОЧТЕ ===== -->
<div id="emailAuthBlock" style="max-width: 340px; margin: 16px auto 0; text-align: center;">
    <div id="emailLoginForm">
        <input type="email" id="loginEmailField" placeholder="Email (только .ru, .рф)"
               style="width:300px; padding:16px 24px; margin:0 auto 8px; border-radius:26px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid var(--border); display:block;">
        <input type="password" id="loginPasswordField" placeholder="Пароль"
               style="width:300px; padding:16px 24px; margin:0 auto 8px; border-radius:26px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid var(--border); display:block;">
        <button id="emailLoginSubmitBtn" class="auth-btn" style="width:300px; margin:0 auto; --fill-colors:rgba(31,89,198,.26),rgba(31,89,198,.26); --border-colors:rgba(78,173,252,.61) 0%,#1F59C6 53%,#20397F 100%;">Войти</button>
        <div style="margin-top:8px; font-size:14px; color:var(--text-secondary);">
            Нет аккаунта? <a href="#" id="switchToRegister" style="color:var(--accent2);">Зарегистрироваться</a>
        </div>
    </div>
    <div id="emailRegisterForm" style="display:none;">
        <input type="email" id="regEmailField" placeholder="Email (только .ru, .рф)"
               style="width:300px; padding:16px 24px; margin:0 auto 8px; border-radius:26px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid var(--border); display:block;">
        <div id="regCodeContainer" style="display:none;">
            <input type="text" id="regCodeField" placeholder="Код из письма" maxlength="4"
                   style="width:300px; padding:16px 24px; margin:0 auto 8px; border-radius:26px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid var(--border); display:block;">
        </div>
        <button id="emailRegisterSubmitBtn" class="auth-btn" style="width:300px; margin:0 auto; --fill-colors:rgba(31,89,198,.26),rgba(31,89,198,.26); --border-colors:rgba(78,173,252,.61) 0%,#1F59C6 53%,#20397F 100%;">Получить код</button>
        <div style="margin-top:8px; font-size:14px; color:var(--text-secondary);">
            Уже есть аккаунт? <a href="#" id="switchToLogin" style="color:var(--accent2);">Войти</a>
        </div>
    </div>
</div>
<!-- ===== БЛОК "ВАЖНО" (ширина 340px) ===== -->
<div class="status-block" style="margin-top: 40px; max-width: 340px; margin-left: auto; margin-right: auto;">
    <div class="status-title" style="color: var(--text);">Важно</div>
    <div style="margin: 8px 0 10px; font-size: 13px; color: var(--text-secondary);">
        <div style="padding: 6px 0; border-bottom: 1px solid var(--border); text-align: center;">Telegram будет доступен после входа</div>
        <div style="padding: 6px 0; border-bottom: 1px solid var(--border); text-align: center;">Привязка аккаунта к одному методу входа</div>
        <div style="padding: 6px 0; border-bottom: 1px solid var(--border); text-align: center;">Зарубежный автовход запрещен в РФ</div>
        <div style="padding: 6px 0; border-bottom: 1px solid var(--border); text-align: center;">Иногда VPN может мешать авторизации</div>
        <div style="padding: 6px 0; text-align: center;">Подробнее в нашей <a href="https://news.proid.studio/support" target="_blank" style="color: var(--accent2); text-decoration: none;">Справке</a></div>
    </div>
</div>
<div class="widget-container" id="widgetContainer"></div>
</div>
<div id="appScreen" class="hidden">
<div class="header"><h1>Моя АнтиСоцсеть</h1></div>

<!-- ===== БЛОК СОГЛАСИЯ ===== -->
<div class="status-block" id="consentBlock" style="display: none;">
    <div class="status-title">Конфиденциальность</div>
    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 12px; line-height: 1.6;">
        Для работы приложения необходимо ваше согласие на обработку персональных данных.
        Мы собираем минимальный набор данных (идентификаторы в VK, MAX или Яндекс ID, IP-адрес, технические параметры) для предоставления сервиса.
        Ваши данные не передаются третьим лицам и не используются для рекламы.
    </p>
    <div style="display: flex; align-items: flex-start; gap: 12px; margin: 12px 0;">
        <input type="checkbox" id="consentCheck" style="width: 20px; height: 20px; margin-top: 2px; flex-shrink: 0; accent-color: var(--accent2); cursor: pointer;">
        <label for="consentCheck" style="color: var(--text-secondary); font-size: 14px; line-height: 1.5; cursor: pointer;">
            Я ознакомлен(а) с <a href="https://news.proid.studio/consent" target="_blank" style="color: var(--accent2);">Согласием на обработку персональных данных</a> и 
            <a href="https://news.proid.studio/privacy" target="_blank" style="color: var(--accent2);">Политикой конфиденциальности</a> и даю согласие на обработку моих персональных данных.
        </label>
    </div>
    <button id="consentAcceptBtn" disabled style="width: 100%; padding: 12px; background: linear-gradient(290deg, #d235ff 0%, #a062ff 30%, #3088ff 66%, #61d8ff 100%); border: none; border-radius: 12px; color: #fff; font-weight: 600; font-size: 16px; cursor: pointer; transition: opacity .2s; opacity: 0.5; pointer-events: none;">
        Соглашаюсь
    </button>
</div>

<!-- Остальной контент -->
<div id="appContent">
<div class="section-header">Добавить</div>
<div class="quick-buttons" id="quickButtons">
<button id="btn-dzen">Дзен</button>
<button id="btn-rb">RB.ru</button>
<button id="btn-habr">Хабр</button>
<button id="btn-lifehacker">Лайфхакер</button>
<button id="btn-forbes">Forbes</button>
<button id="btn-vc">VC.ru</button>
<button id="btn-add-rss">RSS/HTML</button>
<button id="btn-add-telegram">Telegram</button>
<button id="btn-add-vk">VK</button>
<button id="btn-github">GitHub</button>
<button id="btn-youtube">YouTube</button>
<button id="btn-reddit">Reddit</button>
<button id="btn-bbc">BBC</button>
<button id="btn-google-news">Google News</button>
<button id="btn-cnn">CNN</button>
</div>
<div class="add-form" id="addForm">
<div style="font-weight:600;margin-bottom:6px;" id="addFormTitle">Добавить RSS/HTML</div>
<input id="sourceValue" type="text" placeholder="Введите URL...">
<button class="btn-primary" id="addSourceSubmitBtn">Добавить</button>
<button class="btn-secondary" id="closeAddFormBtn">Отмена</button>
</div>
<div class="add-form" id="githubForm">
<div style="font-weight:600;margin-bottom:6px;">GitHub — генератор RSS</div>
<input id="githubInput" type="text" placeholder="owner/repo или username">
<div class="github-grid" id="githubGrid">
<button data-type="releases" id="github-releases">releases</button>
<button data-type="tags" id="github-tags">tags</button>
<button data-type="commits" id="github-commits">commits</button>
<button data-type="main" id="github-main">main</button>
<button data-type="master" id="github-master">master</button>
<button data-type="username" id="github-username">username</button>
</div>
<button class="btn-secondary" id="closeGitHubFormBtn">Отмена</button>
</div>
<div class="add-form" id="youtubeForm">
<div style="font-weight:600;margin-bottom:6px;">YouTube — генератор RSS</div>
<input id="youtubeInput" type="text" placeholder="логин канала или channelId">
<button class="btn-primary" id="generateYouTubeBtn">Сгенерировать</button>
<button class="btn-secondary" id="closeYouTubeFormBtn">Отмена</button>
</div>
<div class="add-form" id="redditForm">
<div style="font-weight:600;margin-bottom:6px;">Reddit — генератор RSS</div>
<input id="redditInput" type="text" placeholder="название сабреддита">
<button class="btn-primary" id="generateRedditBtn">Сгенерировать</button>
<button class="btn-secondary" id="closeRedditFormBtn">Отмена</button>
</div>
<div class="add-form" id="googleNewsForm">
<div style="font-weight:600;margin-bottom:6px;">Google News — генератор RSS</div>
<input id="googleNewsInput" type="text" placeholder="ключевое слово или фраза">
<div style="margin:8px 0 10px;font-size:13px;color:var(--text-secondary);">
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-weight:600;color:var(--text);"><span>пример</span><span>значение</span></div>
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-secondary);">Forbes технологии</span><span style="color:var(--text-secondary);">поиск нескольких слов</span></div>
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-secondary);">"точная фраза"</span><span style="color:var(--text-secondary);">точное совпадение</span></div>
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-secondary);">технологии OR роботы</span><span style="color:var(--text-secondary);">одно из слов</span></div>
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-secondary);">intitle:слово</span><span style="color:var(--text-secondary);">поиск в заголовке</span></div>
<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-secondary);">allintext:текст</span><span style="color:var(--text-secondary);">поиск в тексте</span></div>
</div>
<button class="btn-primary" id="generateGoogleNewsBtn">Сгенерировать</button>
<button class="btn-secondary" id="closeGoogleNewsFormBtn">Отмена</button>
</div>
<div class="category-form" id="bbcForm"><div style="font-weight:600;margin-bottom:8px;">BBC — выберите категорию</div><div class="category-grid" id="bbcGrid"></div></div>
<div class="category-form" id="cnnForm"><div style="font-weight:600;margin-bottom:8px;">CNN — выберите категорию</div><div class="category-grid" id="cnnGrid"></div></div>
<div class="category-form" id="dzenForm"><div style="font-weight:600;margin-bottom:8px;">Дзен — выберите категорию</div><div class="category-grid" id="dzenGrid"></div></div>
<div class="category-form" id="rbForm"><div style="font-weight:600;margin-bottom:8px;">Russian Business — выберите категорию</div><div class="category-grid" id="rbGrid"></div></div>
<div class="category-form" id="habrForm"><div style="font-weight:600;margin-bottom:8px;">Хабр — выберите хаб</div><div class="category-grid" id="habrGrid"></div></div>
<div class="category-form" id="lifehackerForm"><div style="font-weight:600;margin-bottom:8px;">Лайфхакер — выберите категорию</div><div class="category-grid" id="lifehackerGrid"></div></div>
<div class="category-form" id="vcForm"><div style="font-weight:600;margin-bottom:8px;">VC.ru — выберите категорию</div><div class="category-grid" id="vcGrid"></div></div>
<div style="display:flex;gap:8px;margin-bottom:8px;margin-top:0px;">
<button class="suggest-btn" style="flex:1;color:var(--text);" id="categoryBrowserBtn">Категории</button>
<button class="suggest-btn" style="flex:1;color:var(--text-secondary);" id="suggestSourceBtn">Предложить своё</button>
</div>
<div class="category-form" id="categoryBrowser" style="display:none;">
<div class="category-form-header" style="font-weight:600;margin-bottom:8px;color:var(--text-secondary);text-align:center;" id="categoryBrowserHeader">Выберите категорию</div>
<div class="category-grid" id="categoryGrid"></div>
<button class="btn-secondary" id="categoryBackBtn" style="display:none;margin-top:8px;width:100%;">← Назад</button>
</div>

<!-- Кнопка "Смотреть новости" -->
<button class="payment-toggle-btn" id="digestToggleBtn">📰 Смотреть новости</button>
<div id="digestContainer" style="display: none; margin-top: 0;">
    <div id="digestContent"></div>
</div>

<!-- ===== БЛОК ПОГОДЫ ===== -->
<div class="status-block" id="weatherBlock">
    <div class="status-title">Погода в Москве</div>
    <div id="weatherContent">
        <div style="text-align:center; padding:10px; color:var(--text-secondary);">⏳ Загрузка прогноза...</div>
    </div>
    <div style="text-align:center; margin-top:8px; font-size:12px; color:var(--text-secondary); opacity:0.6;">
        Данные обновляются каждый час · <span id="weatherUpdateTime">—</span>
    </div>
</div>

<div class="section-header">Мои источники (<span id="counter">0</span>)</div>
<div id="sourceListContainer"></div>
<button class="payment-toggle-btn" id="paymentToggleBtn">💰 Оплатить тариф</button>
<div class="tariff-block" id="tariffBlock">
<div class="tariff-grid">
<div class="tariff-card"><div class="title">Базовый</div>
<button class="price-btn" data-tariff="basic_month">190 ₽ <span class="label">/ мес</span></button>
<button class="price-btn" data-tariff="basic_year">1 900 ₽ <span class="label">/ год</span></button>
</div>
<div class="tariff-card"><div class="title">Расширенный</div>
<button class="price-btn" data-tariff="premium_month">490 ₽ <span class="label">/ мес</span></button>
<button class="price-btn" data-tariff="premium_year">4 900 ₽ <span class="label">/ год</span></button>
</div>
</div>
<div class="tariff-link"><a href="https://news.proid.studio/#pricing" target="_blank">Описание тарифов</a></div>
</div>
<div class="status-block" id="userStatus">
<div class="status-title">Текущий статус</div>
<div class="status-row"><span>Тариф:</span> <span id="statusTariff">—</span></div>
<div class="status-row"><span>Мои источники:</span> <span id="statusSources">0</span></div>
<div class="status-row"><span>Лимит источников:</span> <span id="statusLimit">5</span></div>
<div class="status-row"><span>Автополучение:</span> <span id="statusAutoSend">✅</span></div>
<div class="status-row"><span>Получили:</span> <span id="statusLastSent">—</span></div>
<div class="status-row"><span>Оплачено до:</span> <span id="statusExpires">—</span></div>
</div>
<div class="status-block" id="timeBlock">
<div class="status-title">Время получения</div>
<div class="status-row" style="border-bottom:none;padding-bottom:0;">
<span>Текущее время:</span>
<span id="currentTimeDisplay">—</span>
<button class="change-time-btn" id="changeTimeBtn">Изменить</button>
<span class="upgrade-hint" id="upgradeHint" style="display:none;">🔒 <a href="#" id="upgradeLink">Доступно в Расширенном тарифе</a></span>
</div>
<div id="timePicker" style="display:none;margin-top:10px;">
<div class="time-picker-grid" id="timePickerGrid"></div>
<button class="close-picker-btn" id="closeTimePickerBtn">Закрыть</button>
</div>
</div>

<div class="status-block" style="padding: 8px 8px; cursor: pointer;" id="loveBlock"><div class="status-row" style="border-bottom: none; justify-content: center; padding: 0;"><span style="color: var(--text-secondary); font-size: 14px;">❤️ Сделано с любовью к людям</span></div></div>
<!-- ===== ССЫЛКИ НА БОТОВ ===== -->
<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 12px 0;">
    <a href="https://max.ru/id772609477460_bot" target="_blank" class="change-time-btn" style="display: inline-block; text-decoration: none;">Открыть в MAX</a>
    <a href="https://t.me/My_AI_News_Aggregator_bot" target="_blank" class="change-time-btn" style="display: inline-block; text-decoration: none;">Открыть в Telegram</a>
    <a href="https://vk.ru/app54717257" target="_blank" class="change-time-btn" style="display: inline-block; text-decoration: none;">Открыть в VK</a>
</div>
<div style="display: flex; justify-content: center; margin-top: 8px;">
    <div id="logoutContainer" class="change-time-btn" style="cursor: pointer; text-decoration: none; padding: 4px 12px; display: inline-block;">Выход (сброс кэша)</div>
</div>
</div> <!-- /appContent -->
</div> <!-- /appScreen -->
</div>
</div>

<!-- ===== ПОДКЛЮЧАЕМ СКРИПТЫ (ЛОКАЛЬНЫЕ) ===== -->
<script src="categories.js"></script>
<script src="app.js"></script>

<!-- ===== ФУТЕР ===== -->
<div class="footer-wrapper">
    <div class="footer-inner">
        <a href="https://news.proid.studio/" style="text-decoration: none; color: inherit;">© 2026 «Моя АнтиСоцсеть»</a>
        <span class="sep">|</span>
        <a href="https://news.proid.studio/privacy" target="_blank">Политика</a>
        <span class="sep">|</span>
        <a href="https://news.proid.studio/offer" target="_blank">Оферта</a>
        <span class="sep">|</span>
        <a href="https://news.proid.studio/consent" target="_blank">Согласие</a>
        <span class="sep">|</span>
        <a href="https://news.proid.studio/offer#requisites" target="_blank">Реквизиты</a>
        <span class="sep">|</span>
        <a href="https://news.proid.studio/support" target="_blank">Помощь</a>
        <span class="sep">|</span>
        <span>Создано: <a href="https://proid.studio" target="_blank" class="studio-link">proid.studio</a></span>
    </div>
</div>

</body>
</html>
```

---

## 6. APP.CSS – ЕДИНЫЙ СТИЛЬ (ЭТАЛОН)

- Использует те же переменные и классы, что и PWA.  
- Ключевые классы: `.hidden`, `.source-group`, `.change-time-btn`, `.status-block`, `.weather-day`.  
- Футер растягивается на всю ширину без горизонтальной прокрутки.  
- Блоки `#digestContent .status-block` имеют правильные отступы и ссылки с градиентом.  
- **Весь CSS взят из последней версии PWA** и не требует доработок.  
- Полный код `app.css` приведён в проекте (он идентичен стилям из PWA).

---

## 7. АВТОРИЗАЦИЯ – ПОШАГОВЫЕ ЭТАЛОНЫ

### 7.1. VK (pollForToken)
```javascript
async function startVkAuth() {
  const state = 'vk_' + Math.random().toString(36).substring(2);
  await apiRequest('/api/auth/vk/save-verifier', { ... });
  const authUrl = `https://id.vk.ru/authorize?...&from_extension=1`;
  authWindow = window.open(authUrl, '_blank');
  pollForToken(state, loadApp, 'vk');
}
```

### 7.2. Яндекс (pollForToken с абсолютным URL)
```javascript
function startYandexAuth() {
  const state = 'pwa_' + Math.random().toString(36).substring(2); // или 'telegram_'
  const authUrl = API_BASE + '/api/auth/yandex/login?state=' + encodeURIComponent(state) + '&from_extension=1';
  authWindow = window.open(authUrl, '_blank');
  pollForToken(state, loadApp, 'pwa');
}
```

### 7.3. MAX (опрос /api/auth/max-status)
```javascript
async function startMaxAuth() {
  const resp = await apiRequest('/api/auth/max-token?source=telegram');
  const token = data.token;
  localStorage.setItem('max_auth_token', token);
  startMaxWaiting(token);
  window.open('https://max.ru/' + botUsername + '?start=' + encodeURIComponent(token), '_blank');
}

function startMaxWaiting(token) {
  // опрос /api/auth/max-status/ с интервалом 3 сек
  // при успехе: сохраняем auth_token, закрываем окно, loadApp()
}
```

### 7.4. pollForToken – универсальная функция (приведена в app.js)

---

## 8. ОПЛАТА – ИСПРАВЛЕННАЯ ФУНКЦИЯ

```javascript
async function handlePayment(tariffKey) {
  if (!ensureConsent()) return;
  if (!authToken) { alert('❌ Вы не авторизованы.'); return; }
  try {
    const resp = await apiRequest('/api/payment/create-invoice', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tariff: tariffKey })
    });
    if (!resp.ok) {
      const err = await resp.json();
      alert('❌ Ошибка: ' + err.detail);
      return;
    }
    const data = await resp.json();
    if (data.payment_url) {
      window.open(data.payment_url, '_blank');
      alert('🔗 Переход к оплате...');
    } else {
      alert('❌ Не удалось получить ссылку на оплату');
    }
  } catch(err) {
    alert('❌ Ошибка: ' + err.message);
  }
}
```

---

## 9. СБОРКА И ПУБЛИКАЦИЯ (ЧЕК-ЛИСТ)

**Перед сборкой (`app`):**
- [ ] Удалены неиспользуемые разрешения из манифеста.
- [ ] `background.js` универсальный, открывает в текущей вкладке.
- [ ] В `app.js`:
  - [ ] Единый `DOMContentLoaded` со всеми обработчиками.
  - [ ] Все обработчики через `addEventListener`, нет `onclick` в HTML.
  - [ ] Кнопки оплаты используют `data-tariff`.
  - [ ] Есть `pollForToken` для VK и Яндекса.
  - [ ] `startYandexAuth` использует `API_BASE`.
  - [ ] `startVkAuth` передаёт `&from_extension=1`.
  - [ ] `startMaxWaiting` сохраняет токен напрямую.
  - [ ] `handlePayment` работает с `apiRequest` и `window.open`.
  - [ ] Добавлен слушатель `postMessage`.
- [ ] В `app.html`:
  - [ ] **Нет атрибутов `onclick`, `onchange` и т.п.** – только внешние скрипты.
  - [ ] Кнопки оплаты имеют `class="price-btn"` и `data-tariff`.
  - [ ] Есть `id="loveBlock"` для блока «Сделано с любовью».
  - [ ] Есть `id="upgradeLink"` для ссылки на тарифы.
  - [ ] Все элементы, используемые в `app.js`, имеют уникальные `id`.
- [ ] **Версия манифеста** – автоматически синхронизируется с `sw.js` при каждом `rest`. Ручное увеличение не требуется.
- [ ] Собранные ZIP-архивы проверены (`jq empty manifest.json`).
- [ ] Расширение загружено и протестировано в браузере:
  - [ ] Вход через VK, Яндекс, MAX.
  - [ ] Оплата тарифа.
  - [ ] Список источников с группировкой.
  - [ ] «Смотреть новости».
  - [ ] Погода.
  - [ ] Блок «Сделано с любовью» (клик).
  - [ ] Выход.
- [ ] Консоль браузера не содержит ошибок CSP.

---

## 10. ИЗВЕСТНЫЕ ОШИБКИ И ИХ РЕШЕНИЯ (ОБНОВЛЕНО)

| Проблема | Причина | Решение |
|----------|---------|---------|
| **Ошибки CSP: "Executing inline event handler violates ..."** | В HTML использовались inline-обработчики (`onclick`, `onchange`). | Удалить все inline-обработчики, заменить на `addEventListener` в `DOMContentLoaded`. |
| Страница расширения не обновляется после авторизации | Использовался `postMessage`, но `from_extension` не передан. | Перейти на `pollForToken` (опрос сервера) для VK и Яндекса. |
| Яндекс открывается по `chrome-extension://...` | Относительный путь без `API_BASE`. | Использовать `API_BASE + '/api/auth/yandex/login?...'`. |
| MAX-авторизация не работает после подтверждения | Делался редирект на `/pwa` с перезагрузкой. | Сохранять токен напрямую и вызывать `loadApp()`. |
| Кнопки оплаты не работают | Ошибка в `handlePayment` или неправильный `data-tariff`. | Исправить функцию, использовать `apiRequest` и `window.open`. |
| Расширение отклонено в Chrome Web Store | Лишние разрешения (`storage`, `alarms`). | Удалить все неиспользуемые разрешения. |
| Белый экран в MAX WebApp | Повреждённый HTML при обновлении. | Обновлять только целевые функции, а не весь файл. |
| Кнопка «Ещё» не работает | Отсутствует `.hidden` или неверная логика. | Добавить `.hidden { display: none !important; }`. |
| Горизонтальная прокрутка | Футер не растягивается. | Использовать `width: 100vw` и `overflow-x: hidden`. |
| Ошибка `chrome.extension.sendMessage is not a function` | Устаревший код в background.js. | Использовать `browserAPI.runtime.sendMessage`. |

---

## 11. ВЗАИМОДЕЙСТВИЕ С PWA (СТОРОНА САЙТА)

В `pwa.html` (и `index.html`, `max.html`, `vk.html`) должна быть поддержка `from_extension`:

- Переменная `const isFromExtension = new URLSearchParams(window.location.search).get('from_extension') === '1';`
- В функциях авторизации VK и Яндекс добавлять `&from_extension=1` в URL.
- В колбэках VK и Яндекс после получения токена:
  ```javascript
  if (isFromExtension && window.opener) {
      window.opener.postMessage({ type: 'auth_token', token: data.token }, '*');
      window.close();
  } else {
      // стандартное поведение
  }
  ```

**Это нужно для запасного канала `postMessage`.**

---

## 12. КЛЮЧЕВЫЕ ИСТИНЫ (ЗАПОМНИТЬ!)

1. **Параметр `from_extension=1` обязателен** для всех авторизаций из расширения.  
2. **VK и Яндекс используют `pollForToken`**, `postMessage` – запасной канал.  
3. **MAX – отдельный механизм** опроса `/api/auth/max-status/`, без редиректа.  
4. **Оплата** – через `/api/payment/create-invoice`, открытие ссылки в новой вкладке.  
5. **Никогда не использовать `sed` для манифеста** – только `jq`.  
6. **Не запрашивать лишние разрешения** – это гарантирует прохождение модерации.  
7. **Все пути в `app.html` должны быть абсолютными** (кроме локальных скриптов).  
8. **Firefox-версия генерируется автоматически** – не редактировать вручную.  
9. **При обновлении `app.js` всегда пересобирать оба расширения** (`app`).  
10. **Все изменения вносятся только в Chrome-папку**, Firefox копируется скриптом.  
11. **В HTML-разметке НЕТ inline-обработчиков** – все события через `addEventListener`.  
12. **Кнопки оплаты используют `data-tariff`**, а не `onclick`.  
13. **Единый `DOMContentLoaded`** для всех обработчиков – избегать дублирования.  
14. **Блок "Сделано с любовью"** – `id="loveBlock"`, обработчик в JavaScript.  
15. **Перед публикацией** – проверить консоль на ошибки CSP и убедиться, что все функции работают.  
16. **Эталон `app.html`** – строго внешние `app.css` и `app.js`, без inline-кода. **Всегда делать только так.**

---

## 13. АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ ВЕРСИИ С SERVICE WORKER

### 13.1. Механизм
В скрипт `graceful_restart.sh` добавлен блок, который при каждом перезапуске API (`rest`) выполняет:

1. Извлекает текущую версию из `sw.js` (например, `v180`).
2. Увеличивает номер (например, до `v181`).
3. Обновляет `CACHE_VERSION` в `sw.js`.
4. Обновляет поле `"version"` в манифестах расширений до вида `"1.3.181"` (используя `jq`).

### 13.2. Что это даёт
- **Единая точка управления** – версия расширений всегда соответствует версии Service Worker.
- **Автоматическое обновление** – больше не нужно вручную править манифесты перед каждой сборкой.
- **Согласованность** – PWA и расширения имеют одинаковую версию, что упрощает поддержку.

### 13.3. Как использовать
1. Запустите `rest` – это увеличит версию в `sw.js` и манифестах.
2. Запустите `app` – создаются ZIP-архивы с актуальной версией.
3. Загрузите архивы в магазины.

### 13.4. Важно
- Если вы вносите изменения в `app.js` или `app.html`, **обязательно** сначала выполните `rest`, затем `app`.
- Ручное редактирование версии в манифестах **не требуется** – оно будет перезаписано при следующем `rest`.
- Проверьте, что `jq` установлен на сервере (уже используется в `app`).

---

**Документ утверждён и зафиксирован для передачи другому ИИ.**  
Дата фиксации: 31 августа 2026 г.  
Версия: 3.3 (без секретов, закреплён эталон `app.html` – внешние `app.css` и `app.js`, строгий запрет inline-кода).
```