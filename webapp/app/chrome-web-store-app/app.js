const API_BASE = 'https://news.proid.studio';

// ===== КОНСТАНТЫ =====
const TEST_TOKEN = 'vol7Js5SZnjPuaTfkk46zea3I-k_vsInqyqQPho_dF0';
const VK_APP_ID = '54718264';

// ===== PKCE ДЛЯ VK ID OAuth 2.1 =====
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

function base64UrlEncode(buffer) {
    return btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return hash;
}

async function generateCodeChallenge(verifier) {
    const hash = await sha256(verifier);
    return base64UrlEncode(new Uint8Array(hash));
}

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentSources = [];
let currentLimit = 5;
let currentAddType = 'rss';
let currentSendTime = null;
let isPremium = false;
let defaultSendHour = 18;
let authToken = localStorage.getItem('auth_token') || null;
let isTestUser = false;
let consentGiven = false;
let authWindow = null;
let maxPollingTimer = null;

// ===== ПОЛЛИНГ ТОКЕНА ПО STATE (ДЛЯ ЯНДЕКСА И VK) =====
let yandexPollingState = null;

function pollForToken(state, onSuccess, source) {
    console.log('🔍 pollForToken запущен для state:', state, 'source:', source);

    if (yandexPollingState === state) {
        console.warn('⏭️ pollForToken уже выполняется для state:', state);
        return;
    }
    yandexPollingState = state;

    let attempts = 0;
    const maxAttempts = 120;

    const poll = async () => {
        attempts++;
        console.log(`🔄 Попытка ${attempts}/${maxAttempts} для state ${state}`);

        try {
            const resp = await apiRequest(
                `/api/auth/get-token-by-state?state=${encodeURIComponent(state)}`
            );

            if (resp && resp.ok) {
                const data = await resp.json();
                console.log('📦 Ответ от сервера:', data);

                if (data.token) {
                    yandexPollingState = null;
                    authToken = data.token;
                    localStorage.setItem('auth_token', authToken);

                    console.log('✅ Токен получен! Источник:', source);

                    setTimeout(() => {
                        if (source === 'telegram') {
                            alert('✅ Нажмите ОК для входа! Чтобы привязать Telegram-бота вернитесь в приложение Telegram.');
                        } else {
                            alert('✅ Вы успешно вошли! Чтобы получать уведомления необходимо открыть бота в Telegram, VK или MAX.');
                        }
                        if (onSuccess) onSuccess();
                    }, 100);

                    return;
                }
            }
        } catch (e) {
            console.error('❌ Ошибка в pollForToken:', e);
        }

        if (attempts >= maxAttempts) {
            yandexPollingState = null;
            console.error('⏰ Время истекло для state', state);
            alert('⏰ Время истекло. Попробуйте снова.');

            const container = document.querySelector('#loginScreen .auth-container');
            if (container) container.style.display = 'block';

            const w = document.getElementById('widgetContainer');
            if (w) w.innerHTML = '';

            return;
        }

        setTimeout(poll, 3000);
    };

    poll();
}

// ===== СЛУШАТЕЛЬ POSTMESSAGE ОТ САЙТА (ЗАПАСНОЙ МЕХАНИЗМ) =====
window.addEventListener('message', function(event) {
    if (event.origin !== 'https://news.proid.studio') return;
    const data = event.data;
    if (data && data.type === 'auth_token' && data.token) {
        console.log('📩 Токен получен через postMessage (запасной)');
        localStorage.setItem('auth_token', data.token);
        authToken = data.token;
        if (authWindow && !authWindow.closed) {
            authWindow.close();
            authWindow = null;
        }
        alert('✅ Аккаунт привязан!');
        loadApp();
    }
});

function hapticFeedback(){if(navigator.vibrate)navigator.vibrate(10);}
(function(){
    const p = new URLSearchParams(window.location.search);
    const t = p.get('auth_token');
    if (t) {
        try {
            localStorage.setItem('auth_token', t);
        } catch(e) {
            sessionStorage.setItem('auth_token', t);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        authToken = t;
        if (document.readyState === 'complete') {
            loadApp();
        } else {
            window.addEventListener('load', function onLoad(){
                loadApp();
                window.removeEventListener('load', onLoad);
            });
        }
    }
})();

function getHeaders(){
    return {
        'Content-Type': 'application/json',
        ...(authToken ? {'X-Auth-Token': authToken} : {})
    };
}

function showLoginScreen(){
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('appScreen').classList.add('hidden');
}

// ===== УПРАВЛЕНИЕ СОГЛАСИЕМ =====
function showConsentBlock() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('consentBlock').style.display = 'block';
    document.getElementById('appContent').style.display = 'none';
    document.getElementById('appScreen').classList.add('consent-pending');
}

function showAppContent() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('consentBlock').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    document.getElementById('appScreen').classList.remove('consent-pending');
}

// ===== ИСПРАВЛЕННАЯ APIREQUEST =====
async function apiRequest(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : API_BASE + url;
    try {
        const resp = await fetch(fullUrl, options);
        if (resp.status === 503) {
            alert('⚠️ Сервер временно недоступен. Обновите страницу через несколько секунд.');
            return null;
        }
        return resp;
    } catch (err) {
        console.error('apiRequest error:', err);
        throw err;
    }
}

function ensureConsent() {
    if (!consentGiven && !isTestUser) {
        alert('Сначала примите согласие на обработку данных.');
        return false;
    }
    return true;
}

// ===== ЗАГРУЗКА ПРИЛОЖЕНИЯ =====
async function loadApp(){
    if (!authToken) {
        showLoginScreen();
        return;
    }
    const headers = getHeaders();
    try {
        const resp = await apiRequest('/api/webapp/sources', {headers});
        if (!resp) return;
        if (!resp.ok) {
            if (resp.status === 403) {
                isTestUser = (authToken === TEST_TOKEN);
                window.TEST_MODE = isTestUser;
                consentGiven = false;
                showConsentBlock();
                document.getElementById('quickButtons').style.display = 'none';
                document.getElementById('paymentToggleBtn').style.display = 'none';
                return;
            }
            if (resp.status === 401) {
                document.getElementById('sourceListContainer').innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><h3>Ошибка авторизации</h3><p>Попробуйте обновить страницу или перелогиниться.</p></div>';
                showAppContent();
                return;
            }
            const err = await resp.json();
            throw new Error(err.detail || 'Ошибка загрузки');
        }
        const data = await resp.json();
        currentSources = data.sources || [];
        currentLimit = data.limit || 5;
        renderGroupedSources(currentSources);
        document.getElementById('counter').textContent = currentSources.length;
        updateStatus(data);

        isTestUser = (authToken === TEST_TOKEN);
        consentGiven = data.consent_given === true;
        window.TEST_MODE = isTestUser;

        if (!consentGiven || isTestUser) {
            showConsentBlock();
            document.getElementById('quickButtons').style.display = 'none';
            document.getElementById('paymentToggleBtn').style.display = 'none';
        } else {
            showAppContent();
            document.getElementById('quickButtons').style.display = 'flex';
            document.getElementById('paymentToggleBtn').style.display = 'block';
        }
    } catch(err) {
        document.getElementById('sourceListContainer').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Ошибка загрузки</h3><p>'+err.message+'</p></div>';
        showAppContent();
    }
}

// ===== ЕДИНЫЙ ОБРАБОТЧИК DOMContentLoaded =====
document.addEventListener('DOMContentLoaded', function() {
    // ---- Кнопка согласия ----
    const check = document.getElementById('consentCheck');
    const btn = document.getElementById('consentAcceptBtn');
    if (check && btn) {
        check.addEventListener('change', function() {
            btn.disabled = !this.checked;
            btn.style.opacity = this.checked ? '1' : '0.5';
            btn.style.pointerEvents = this.checked ? 'auto' : 'none';
        });
        btn.addEventListener('click', async function() {
            if (!check.checked) return;
            if (window.TEST_MODE) {
                showAppContent();
                document.getElementById('quickButtons').style.display = 'flex';
                document.getElementById('paymentToggleBtn').style.display = 'block';
                return;
            }
            try {
                const resp = await apiRequest('/api/webapp/consent', {
                    method: 'POST',
                    headers: getHeaders()
                });
                if (resp && resp.ok) {
                    consentGiven = true;
                    showAppContent();
                    document.getElementById('quickButtons').style.display = 'flex';
                    document.getElementById('paymentToggleBtn').style.display = 'block';
                    await loadApp();
                } else {
                    const err = resp ? await resp.json() : { detail: 'Ошибка' };
                    alert('❌ Ошибка: ' + (err.detail || 'Не удалось сохранить согласие'));
                }
            } catch (e) {
                alert('❌ Ошибка: ' + e.message);
            }
        });
    }

    // ---- Кнопки оплаты (data-tariff) ----
    document.querySelectorAll('.price-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tariff = this.dataset.tariff;
            if (tariff) handlePayment(tariff);
        });
    });

    // ---- Основные кнопки ----
    const vkBtn = document.getElementById('vkLoginBtn');
    if (vkBtn) vkBtn.addEventListener('click', startVkAuth);

    const maxBtn = document.getElementById('maxLoginBtn');
    if (maxBtn) maxBtn.addEventListener('click', startMaxAuth);

    const yandexBtn = document.getElementById('yandexLoginBtn');
    if (yandexBtn) yandexBtn.addEventListener('click', startYandexAuth);

    const digestBtn = document.getElementById('digestToggleBtn');
    if (digestBtn) digestBtn.addEventListener('click', toggleDigest);

    const logoutEl = document.getElementById('logoutContainer');
    if (logoutEl) logoutEl.addEventListener('click', logout);

    // ---- Быстрое меню ----
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

    // ---- Формы ----
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

    // ---- GitHub grid ----
    const githubGrid = document.getElementById('githubGrid');
    if (githubGrid) {
        githubGrid.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                const type = this.dataset.type;
                if (type) generateGitHubRSS(type);
            });
        });
    }

    // ---- Категории ----
    const categoryBrowserBtn = document.getElementById('categoryBrowserBtn');
    if (categoryBrowserBtn) categoryBrowserBtn.addEventListener('click', toggleCategoryBrowser);
    const categoryBackBtn = document.getElementById('categoryBackBtn');
    if (categoryBackBtn) categoryBackBtn.addEventListener('click', goBackLevel);
    const suggestSourceBtn = document.getElementById('suggestSourceBtn');
    if (suggestSourceBtn) suggestSourceBtn.addEventListener('click', suggestSource);

    // ---- Тарифы ----
    const paymentToggleBtn = document.getElementById('paymentToggleBtn');
    if (paymentToggleBtn) paymentToggleBtn.addEventListener('click', toggleTariffs);

    // ---- Время ----
    const changeTimeBtn = document.getElementById('changeTimeBtn');
    if (changeTimeBtn) changeTimeBtn.addEventListener('click', toggleTimePicker);
    const closeTimePickerBtn = document.getElementById('closeTimePickerBtn');
    if (closeTimePickerBtn) closeTimePickerBtn.addEventListener('click', closeTimePicker);
    const upgradeLink = document.getElementById('upgradeLink');
    if (upgradeLink) upgradeLink.addEventListener('click', function(e) {
        e.preventDefault();
        toggleTariffs();
    });

    // ---- Блок "Сделано с любовью" ----
    const loveBlock = document.getElementById('loveBlock');
    if (loveBlock) {
        loveBlock.addEventListener('click', function() {
            alert('❤️ Спасибо! Расскажите про нас друзьям.');
        });
    }

    // ===== EMAIL АВТОРИЗАЦИЯ =====
    (function() {
        const loginForm = document.getElementById('emailLoginForm');
        const registerForm = document.getElementById('emailRegisterForm');
        const switchToRegister = document.getElementById('switchToRegister');
        const switchToLogin = document.getElementById('switchToLogin');

        const loginEmail = document.getElementById('loginEmailField');
        const loginPassword = document.getElementById('loginPasswordField');
        const loginSubmit = document.getElementById('emailLoginSubmitBtn');

        const regEmail = document.getElementById('regEmailField');
        const regCodeContainer = document.getElementById('regCodeContainer');
        const regCode = document.getElementById('regCodeField');
        const regSubmit = document.getElementById('emailRegisterSubmitBtn');

        let regStep = 'request'; // 'request' | 'verify'

        // Переключение между формами
        switchToRegister.addEventListener('click', function(e) {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            regStep = 'request';
            regSubmit.textContent = 'Получить код';
            regCodeContainer.style.display = 'none';
            regCode.value = '';
        });

        switchToLogin.addEventListener('click', function(e) {
            e.preventDefault();
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
        });

        // Вход по email+пароль
        loginSubmit.addEventListener('click', async function() {
            const email = loginEmail.value.trim();
            const password = loginPassword.value.trim();
            if (!email || !password) { alert('Заполните email и пароль'); return; }
            try {
                const resp = await apiRequest('/api/auth/email/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (resp && resp.ok) {
                    const data = await resp.json();
                    localStorage.setItem('auth_token', data.token);
                    authToken = data.token;
                    loadApp();
                } else {
                    const err = resp ? await resp.json() : { detail: 'Ошибка' };
                    alert('Ошибка входа: ' + (err.detail || err.message));
                }
            } catch(e) {
                alert('Ошибка: ' + e.message);
            }
        });

        // Регистрация (запрос кода / подтверждение)
        regSubmit.addEventListener('click', async function() {
            const email = regEmail.value.trim();
            if (!email) { alert('Введите email'); return; }

            if (regStep === 'request') {
                // Запрос кода
                try {
                    const resp = await apiRequest('/api/auth/email/request-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    if (resp && resp.ok) {
                        regStep = 'verify';
                        regSubmit.textContent = 'Подтвердить';
                        regCodeContainer.style.display = 'block';
                        regCode.value = '';
                        alert('Код отправлен на почту');
                    } else {
                        const err = resp ? await resp.json() : { detail: 'Ошибка' };
                        alert('Ошибка: ' + (err.detail || err.message));
                    }
                } catch(e) {
                    alert('Ошибка: ' + e.message);
                }
            } else {
                // Подтверждение кода и регистрация
                const code = regCode.value.trim();
                if (!code) { alert('Введите код из письма'); return; }
                try {
                    const resp = await apiRequest('/api/auth/email/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, code })
                    });
                    if (resp && resp.ok) {
                        const data = await resp.json();
                        localStorage.setItem('auth_token', data.token);
                        authToken = data.token;
                        alert('Регистрация успешна! Пароль отправлен на почту.');
                        loadApp();
                    } else {
                        const err = resp ? await resp.json() : { detail: 'Ошибка' };
                        // Если пользователь уже существует, предложим войти
                        if (resp && resp.status === 409) {
                            alert('Пользователь с таким email уже зарегистрирован. Используйте вход по паролю.');
                            switchToLogin.click();
                        } else {
                            alert('Ошибка: ' + (err.detail || err.message));
                        }
                    }
                } catch(e) {
                    alert('Ошибка: ' + e.message);
                }
            }
        });
    })();
});

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function getTypeLabel(t){const m={'rss':'RSS/HTML','telegram':'Telegram','vk':'VK','max':'MAX'};return m[t]||t;}
function truncate(s,l){l=l||40;return s.length>l?s.slice(0,l)+'…':s;}
function safeDecodeUrl(u){try{return decodeURIComponent(u);}catch(e){return u;}}
function formatSourceValue(s){let v=s.value;if(s.type==='telegram'||s.type==='vk'){if(!v.startsWith('http')&&!v.startsWith('@'))v='@'+v;}
if(s.type==='rss'){v=safeDecodeUrl(v).replace(/^https?:\/\//,'').replace(/^www\./,'');}
return v;}
function getSourceUrl(s){let u=s.value;if(s.type==='telegram')u='https://t.me/'+u.replace(/^@/,'');else if(s.type==='vk')u='https://vk.com/'+u.replace(/^@/,'');return u;}
function askOpenLink(u){hapticFeedback();if(window.confirm('Открыть ссылку?\n\n'+u))window.open(u,'_blank');}

function renderGroupedSources(sources) {
    const container = document.getElementById('sourceListContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!sources || sources.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Нет источников</h3><p>Добавьте свой первый источник</p></div>';
        return;
    }
    const sorted = [...sources].sort((a,b) => a.value.toLowerCase().localeCompare(b.value.toLowerCase()));
    const groups = {'rss':[], 'telegram':[], 'vk':[], 'max':[]};
    sorted.forEach(s => { if (groups[s.type]) groups[s.type].push(s); else groups[s.type] = [s]; });
    const order = ['telegram','vk','max','rss'];
    let totalIndex = 0;
    order.forEach(type => {
        const items = groups[type];
        if (!items || items.length === 0) return;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'source-group';
        const title = document.createElement('div');
        title.className = 'group-title';
        title.textContent = getTypeLabel(type);
        groupDiv.appendChild(title);
        const list = document.createElement('div');
        list.className = 'source-list';
        items.forEach(s => {
            const f = formatSourceValue(s);
            const v = truncate(f, 50);
            const u = getSourceUrl(s);
            const g = getIconGradient(s.type);
            const item = document.createElement('div');
            item.className = 'source-item';
            item.dataset.index = totalIndex++;
            item.onclick = function() { askOpenLink(u); };
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
            delBtn.onclick = function(e) { e.stopPropagation(); hapticFeedback(); confirmDelete(s.id); };
            item.appendChild(info);
            item.appendChild(delBtn);
            list.appendChild(item);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    });

    if (sources.length > 5) {
        const btn = document.createElement('button');
        btn.className = 'change-time-btn';
        btn.textContent = 'Ещё';
        btn.style.marginTop = '12px';
        btn.style.width = '100%';
        btn.onclick = function() {
            const groups = container.querySelectorAll('.source-group');
            const hiddenItems = container.querySelectorAll('.source-item.hidden');
            if (hiddenItems.length) {
                groups.forEach(g => g.style.display = '');
                container.querySelectorAll('.source-item.hidden').forEach(el => el.classList.remove('hidden'));
                btn.textContent = 'Скрыть';
            } else {
                const allItems = container.querySelectorAll('.source-item');
                allItems.forEach((el, idx) => {
                    if (idx >= 5) el.classList.add('hidden');
                });
                groups.forEach(g => {
                    const visibleItems = g.querySelectorAll('.source-item:not(.hidden)');
                    if (visibleItems.length === 0) {
                        g.style.display = 'none';
                    }
                });
                btn.textContent = 'Ещё';
            }
        };
        container.appendChild(btn);
        const allItems = container.querySelectorAll('.source-item');
        allItems.forEach((el, idx) => {
            if (idx >= 5) el.classList.add('hidden');
        });
        const groups = container.querySelectorAll('.source-group');
        groups.forEach(g => {
            const visibleItems = g.querySelectorAll('.source-item:not(.hidden)');
            if (visibleItems.length === 0) {
                g.style.display = 'none';
            }
        });
    }
}

function getIconGradient(t){switch(t){case'telegram':return'linear-gradient(290deg,#d235ff 0%,#a062ff 30%,#3088ff 66%,#61d8ff 100%)';case'vk':return'linear-gradient(290deg,#0d47a1 0%,#1565c0 30%,#1e88e5 66%,#64b5f6 100%)';case'rss':return'linear-gradient(290deg,#d84315 0%,#f57c00 30%,#f9a825 66%,#ffee58 100%)';default:return'linear-gradient(290deg,#d235ff 0%,#a062ff 30%,#3088ff 66%,#61d8ff 100%)';}}

function updateStatus(d){document.getElementById('statusTariff').textContent=d.tariff_name||'—';document.getElementById('statusSources').textContent=d.used||0;document.getElementById('statusLimit').textContent=d.limit||5;document.getElementById('statusAutoSend').textContent='✅';document.getElementById('statusLastSent').textContent=d.last_sent||'—';document.getElementById('statusExpires').textContent=d.expires_at||'—';isPremium=d.is_premium||false;defaultSendHour=d.default_send_hour||18;currentSendTime=d.send_time||null;const display=currentSendTime?currentSendTime:(defaultSendHour.toString().padStart(2,'0')+':00');document.getElementById('currentTimeDisplay').textContent=display+' MSK';const btn=document.getElementById('changeTimeBtn');const hint=document.getElementById('upgradeHint');if(isPremium){btn.style.display='inline-block';btn.disabled=false;hint.style.display='none';}else{btn.style.display='none';hint.style.display='inline-block';if(document.getElementById('timePicker').style.display!=='none')closeTimePicker();}}

function confirmDelete(id){hapticFeedback();const s=currentSources.find(s=>s.id===id);if(!s){alert('Источник не найден');return;}
const f=formatSourceValue(s);if(window.confirm('Удалить источник?\n\n'+f+'\n\nЭто действие нельзя отменить.'))deleteSource(id);}

async function deleteSource(id){if(!ensureConsent())return; try{const resp=await apiRequest('/api/webapp/delete',{method:'POST',headers:getHeaders(),body:JSON.stringify({source_id:id})});if(!resp)return;if(!resp.ok){const err=await resp.json();alert('❌ Ошибка удаления: '+err.detail);return;}
await loadApp();alert('✅ Источник удалён');}catch(err){alert('❌ Ошибка: '+err.message);}}

function closeAddForm(){document.getElementById('addForm').style.display='none';}
function closeGitHubForm(){document.getElementById('githubForm').style.display='none';}
function closeYouTubeForm(){document.getElementById('youtubeForm').style.display='none';}
function closeRedditForm(){document.getElementById('redditForm').style.display='none';}
function closeGoogleNewsForm(){document.getElementById('googleNewsForm').style.display='none';}

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

function toggleCategoryForm(type) { if(!ensureConsent())return; hapticFeedback();
    const map = {
        'bbc':'bbcForm','cnn':'cnnForm','dzen':'dzenForm',
        'rb':'rbForm','habr':'habrForm','lifehacker':'lifehackerForm',
        'vc':'vcForm'
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
                Object.entries(cats).sort((a,b)=>a[0].localeCompare(b[0],'ru')).forEach(([name,url])=>{
                    const btn = document.createElement('button');
                    btn.textContent = name;
                    btn.onclick = function() { addCategorySource('rss', url, name); };
                    grid.appendChild(btn);
                });
            } else {
                grid.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);">Категории не загружены</div>';
            }
        }
    }
}

function toggleAddForm(type) { if(!ensureConsent())return; hapticFeedback();
    const form = document.getElementById('addForm');
    const isHidden = window.getComputedStyle(form).display === 'none';
    document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
    if (isHidden) {
        currentAddType = type;
        const title = document.getElementById('addFormTitle');
        const labels = {'rss':'RSS/HTML','telegram':'Telegram','vk':'VK'};
        title.textContent = 'Добавить '+labels[type];
        const input = document.getElementById('sourceValue');
        input.placeholder = type==='rss'?'Введите URL...':(type==='telegram'?'Введите username (без @)...':'Введите username (без @)...');
        input.value = '';
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

function toggleGitHubForm() { if(!ensureConsent())return; hapticFeedback();
    const form = document.getElementById('githubForm');
    const isHidden = window.getComputedStyle(form).display === 'none';
    document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
    if (isHidden) {
        form.style.display = 'block';
        updateGitHubButtons('');
        const input = document.getElementById('githubInput');
        input.removeEventListener('input', window._githubInputHandler);
        window._githubInputHandler = function() {
            updateGitHubButtons(this.value);
        };
        input.addEventListener('input', window._githubInputHandler);
    } else {
        form.style.display = 'none';
    }
}

function toggleYouTubeForm() { if(!ensureConsent())return; hapticFeedback();
    const form = document.getElementById('youtubeForm');
    const isHidden = window.getComputedStyle(form).display === 'none';
    document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
    if (isHidden) {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

function toggleRedditForm() { if(!ensureConsent())return; hapticFeedback();
    const form = document.getElementById('redditForm');
    const isHidden = window.getComputedStyle(form).display === 'none';
    document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
    if (isHidden) {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

function toggleGoogleNewsForm() { if(!ensureConsent())return; hapticFeedback();
    const form = document.getElementById('googleNewsForm');
    const isHidden = window.getComputedStyle(form).display === 'none';
    document.querySelectorAll('.category-form, .add-form').forEach(el => el.style.display = 'none');
    if (isHidden) {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

function addForbesTelegram() { if(!ensureConsent())return; hapticFeedback();
    addCategorySource('telegram','forbesrussia','Forbes (Telegram)');
}

async function addSourceSubmit(){ if(!ensureConsent())return; hapticFeedback();
    const val=document.getElementById('sourceValue').value.trim();
    if(!val){alert('Введите значение');return;}
    if(!window.confirm('Добавить источник?\n\n'+val))return;
    try{
        const resp=await apiRequest('/api/webapp/add',{
            method:'POST',
            headers:getHeaders(),
            body:JSON.stringify({source_type:currentAddType,source_value:val})
        });
        if(!resp)return;
        if(!resp.ok){const err=await resp.json();alert('❌ Ошибка: '+err.detail);return;}
        await loadApp();
        alert('✅ Источник добавлен');
        document.getElementById('addForm').style.display='none';
        document.getElementById('sourceValue').value='';
    }catch(err){alert('❌ Ошибка добавления: '+err.message);}
}

async function addCategorySource(t,u,n){ if(!ensureConsent())return; hapticFeedback();
    if(!u||!u.trim()){alert('URL не может быть пустым');return;}
    let final=u.trim();
    let type=t||'rss';
    if(final.startsWith('https://t.me/')){type='telegram';final=final.replace(/^https:\/\/t\.me\//,'').split('/')[0];if(final.startsWith('@'))final=final.slice(1);}
    else if(final.startsWith('https://vk.com/')||final.startsWith('https://vk.ru/')){type='vk';final=final.replace(/^https:\/\/(vk\.com|vk\.ru)\//,'').split('/')[0];if(final.startsWith('@'))final=final.slice(1);}
    else if(!final.startsWith('http://')&&!final.startsWith('https://')){if(type!=='telegram'&&type!=='vk')final='https://'+final;}
    if(!window.confirm('Добавить источник?\n\n'+n+'\n'+final))return;
    try{
        const resp=await apiRequest('/api/webapp/add',{
            method:'POST',
            headers:getHeaders(),
            body:JSON.stringify({source_type:type,source_value:final})
        });
        if(!resp)return;
        if(!resp.ok){const err=await resp.json();alert('❌ Ошибка: '+err.detail);return;}
        await loadApp();
        alert('✅ Добавлено: '+n);
        document.querySelectorAll('.category-form').forEach(el=>el.style.display='none');
    }catch(err){alert('❌ Ошибка добавления: '+err.message);}
}

function addRSSSource(u,n){ if(!ensureConsent())return; hapticFeedback();
    if(!u||!u.trim()){alert('URL не может быть пустым.');return;}
    let final=u.trim();
    if(!final.startsWith('http://')&&!final.startsWith('https://'))final='https://'+final;
    fetch(API_BASE+'/api/webapp/add',{
        method:'POST',
        headers:getHeaders(),
        body:JSON.stringify({source_type:'rss',source_value:final})
    })
    .then(async resp=>{
        if(resp.status===503){alert('⚠️ Сервер временно недоступен. Пожалуйста, обновите страницу через несколько секунд.');return;}
        if(!resp.ok){const err=await resp.json();alert('❌ Ошибка добавления: '+err.detail);return;}
        await loadApp();
        alert('✅ Источник добавлен: '+n);
        document.querySelectorAll('.category-form,.add-form').forEach(f=>f.style.display='none');
    })
    .catch(err=>{alert('❌ Ошибка: '+err.message);});
}

function addSourceByType(t,u,n){ if(!ensureConsent())return; hapticFeedback();
    let type=t;
    if(!['rss','telegram','vk','max'].includes(type))type='rss';
    addCategorySource(type,u,n);
}

function updateGitHubButtons(v){
    const grid=document.getElementById('githubGrid');
    const btns=grid.querySelectorAll('button');
    const hasSlash=v&&v.includes('/');
    btns.forEach(btn=>{
        const type=btn.dataset.type;
        if(type==='username')btn.disabled=!v||!v.trim();
        else btn.disabled=!(hasSlash&&v.trim());
    });
}

function generateGitHubRSS(t){ if(!ensureConsent())return; hapticFeedback();
    const input=document.getElementById('githubInput');
    let raw=input.value.trim();
    if(!raw){alert('Введите owner/repo или username.');return;}
    raw=raw.replace(/^https?:\/\/github\.com\//,'').replace(/\/+$/,'');
    let url='',display='GitHub';
    if(t==='username'){
        const parts=raw.split('/');
        const username=parts[0];
        if(!username){alert('Некорректный username.');return;}
        url='https://github.com/'+username+'.atom';
        display='GitHub ('+username+')';
    }else{
        if(!raw.includes('/')){alert('Для этого типа нужен owner/repo.');return;}
        const parts=raw.split('/');
        const owner=parts[0],repo=parts.slice(1).join('/');
        if(!owner||!repo){alert('Некорректный owner/repo.');return;}
        let path='';
        switch(t){
            case'releases':path='releases.atom';break;
            case'tags':path='tags.atom';break;
            case'commits':path='commits.atom';break;
            case'main':path='commits/main.atom';break;
            case'master':path='commits/master.atom';break;
            default:path='releases.atom';
        }
        url='https://github.com/'+owner+'/'+repo+'/'+path;
        display='GitHub ('+owner+'/'+repo+')';
    }
    if(!window.confirm('Добавить источник?\n'+display+'\n'+url))return;
    addRSSSource(url,display);
}

async function generateYouTubeRSS(){ if(!ensureConsent())return; hapticFeedback();
    const input=document.getElementById('youtubeInput');
    let val=input.value.trim();
    if(!val){alert('Введите имя канала или channelId.');return;}
    try{
        const resp=await apiRequest('/api/youtube/resolve',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({input:val})
        });
        if(!resp)return;
        if(!resp.ok){const err=await resp.json();alert('Ошибка: '+(err.detail||err.message||'Канал не найден'));return;}
        const data=await resp.json();
        const id=data.channelId;
        if(!id){alert('Канал не найден. Проверьте имя.');return;}
        const url='https://www.youtube.com/feeds/videos.xml?channel_id='+encodeURIComponent(id);
        const name=data.title||'YouTube канал';
        if(!window.confirm('Добавить источник?\n'+name))return;
        addRSSSource(url,name);
        document.getElementById('youtubeForm').style.display='none';
        document.getElementById('youtubeInput').value='';
    }catch(err){alert('Ошибка: '+err.message);}
}

function generateRedditRSS(){ if(!ensureConsent())return; hapticFeedback();
    const input=document.getElementById('redditInput');
    let sub=input.value.trim();
    if(!sub){alert('Введите название сабреддита.');return;}
    sub=sub.replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//,'').split('/')[0];
    sub=sub.replace(/[^a-zA-Z0-9_]/g,'');
    if(!sub){alert('Некорректное название сабреддита.');return;}
    const url='https://www.reddit.com/r/'+sub+'/.rss';
    if(!window.confirm('Добавить источник?\nReddit (r/'+sub+')\n'+url))return;
    addRSSSource(url,'Reddit (r/'+sub+')');
}

function generateGoogleNewsRSS(){ if(!ensureConsent())return; hapticFeedback();
    const input=document.getElementById('googleNewsInput');
    let q=input.value.trim();
    if(!q){alert('Введите ключевое слово или фразу для поиска.');return;}
    q=q.replace(/\s+/g,' ').trim();
    const enc=q.replace(/ /g,'+');
    const url='https://news.google.com/rss/search?q='+enc+'&hl=ru&gl=RU&ceid=RU:ru';
    if(!window.confirm('Добавить источник?\nGoogle News: '+q+'\n'+url))return;
    addRSSSource(url,'Google News: '+q);
}

let categoryHistory=[];
const CATEGORY_CACHE_TTL=3600000;
async function loadCategoryLevel(parentId=null){
    const key=parentId===null?'categories_root':'categories_'+parentId;
    const cached=localStorage.getItem(key);
    if(cached){
        try{const parsed=JSON.parse(cached);if(Date.now()-parsed.timestamp<CATEGORY_CACHE_TTL)return parsed.data;}catch(e){}
    }
    const url=parentId===null?'/api/categories':'/api/categories?parent_id='+parentId;
    const resp=await apiRequest(url);
    if(!resp)return[];
    if(!resp.ok)throw new Error('Ошибка загрузки');
    const data=await resp.json();
    localStorage.setItem(key,JSON.stringify({timestamp:Date.now(),data}));
    return data;
}

function shortenCategoryName(n){
    const map={
        'DevOps и инфраструктура':'DevOps','IT и разработка':'IT','Информационная безопасность':'Инфобез',
        'Искусственный интеллект':'AI','Машинное обучение':'ML','Глубокое обучение':'Deep Learning',
        'Компьютерное зрение':'CV','Обработка естественного языка':'NLP','Кибербезопасность':'Кибербез',
        'Разработка ПО':'Разработка','Архитектура ПО':'Архитектура ПО','Базы данных':'БД',
        'Облачные технологии':'Облака','Веб-разработка':'Веб','Мобильная разработка':'Мобильная',
        'Научные исследования':'Наука','Новости и общество':'Новости','Финансы и инвестиции':'Финансы',
        'Экономика':'Экономика','Политика':'Политика','Медицина':'Медицина','Образование':'Образование',
        'Экология':'Экология','Архитектура':'Архитектура','Дизайн':'Дизайн','Фотография':'Фото',
        'Видеопроизводство':'Видео','Искусство':'Искусство','Музыка':'Музыка','Кино и ТВ':'Кино',
        'Спорт':'Спорт','Путешествия':'Путешествия','Еда':'Еда','Дом':'Дом','Сад':'Сад',
        'Семья':'Семья','Саморазвитие':'Саморазвитие','История':'История','Книги':'Книги',
        'Хобби':'Хобби','Религия и философия':'Религия','HR':'HR','Отраслевые технологии':'Отраслевые',
        'Маркетинг':'Маркетинг','Медиа':'Медиа','Мода':'Мода','Красота':'Красота','Игры':'Игры',
        'Киберспорт':'Киберспорт','Автомобили':'Автотехника','Авиация':'Авиация','Морская отрасль':'Морская',
        'Логистика':'Логистика','Сельское хозяйство':'Сельхоз','Энергетика':'Энергетика',
        'Промышленность':'Промышленность','Инженерия':'Инженерия','Строительство':'Строительство',
        'Недвижимость':'Недвижимость','Юриспруденция':'Юриспруденция','Законодательство':'Законодательство',
        'Госуправление':'Госуправление','Международные отношения':'Международные','Геополитика':'Геополитика',
        'Общество':'Общество','Региональные':'Региональные','Национальные':'Национальные','Мировые':'Мировые',
        'Градостроительство':'Градостр.'
    };
    return map[n]||n;
}

function sortItems(items){
    const late=['IT и разработка','DevOps и инфраструктура'];
    const normal=items.filter(i=>!late.includes(i.name));
    const lateItems=items.filter(i=>late.includes(i.name));
    const rus=normal.filter(i=>/[а-яё]/i.test(i.name));
    const eng=normal.filter(i=>!/[а-яё]/i.test(i.name));
    rus.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    eng.sort((a,b)=>a.name.localeCompare(b.name,'en'));
    lateItems.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    return[...rus,...eng,...lateItems];
}

function toggleCategoryBrowser(){ if(!ensureConsent())return; hapticFeedback();
    const b=document.getElementById('categoryBrowser');
    if(b.style.display==='block'){b.style.display='none';return;}
    document.querySelectorAll('.add-form,.category-form').forEach(f=>f.style.display='none');
    b.style.display='block';
    categoryHistory=[];
    showLevel(null);
}

function showLevel(parentId){
    const header=document.getElementById('categoryBrowserHeader');
    const grid=document.getElementById('categoryGrid');
    const back=document.getElementById('categoryBackBtn');
    grid.innerHTML='<div style="text-align:center;padding:10px;color:var(--text-secondary);">Загрузка...</div>';
    loadCategoryLevel(parentId).then(items=>{
        if(!items||items.length===0){grid.innerHTML='<div style="text-align:center;padding:10px;color:var(--text-secondary);">Нет элементов</div>';return;}
        const sorted=sortItems(items);
        const hasSources=sorted.some(i=>i.url&&i.url.trim()!=='');
        let hText=parentId===null?'Выберите категорию':(categoryHistory[categoryHistory.length-1]?.name||'Категория')+(hasSources?' — выберите источник':' — выберите подкатегорию');
        header.textContent=hText;
        grid.innerHTML = '';
        sorted.forEach(i => {
            const name = shortenCategoryName(i.name);
            const btn = document.createElement('button');
            btn.textContent = name;
            if (i.url) {
                btn.onclick = function() { addSourceByType(i.source_type || 'rss', i.url, name); };
            } else {
                btn.onclick = function() { openLevel(i.id, name); };
            }
            grid.appendChild(btn);
        });
        back.style.display = categoryHistory.length > 0 ? 'block' : 'none';
    }).catch(err=>{grid.innerHTML='<div style="text-align:center;padding:10px;color:red;">Ошибка: '+err.message+'</div>';});
}

function openLevel(id,name){hapticFeedback();categoryHistory.push({id:id,name:name});showLevel(id);}
function goBackLevel(){ if(!ensureConsent())return; hapticFeedback();
    if(categoryHistory.length===0){document.getElementById('categoryBrowser').style.display='none';return;}
    categoryHistory.pop();
    if(categoryHistory.length===0)showLevel(null);
    else showLevel(categoryHistory[categoryHistory.length-1].id);
}

function toggleTimePicker(){ if(!ensureConsent())return; hapticFeedback();
    if(!isPremium){alert('⛔ Доступно только для Расширенного тарифа. Оформите подписку.');return;}
    const p=document.getElementById('timePicker');
    if(p.style.display==='none')openTimePicker();
    else closeTimePicker();
}

function openTimePicker(){if(!isPremium)return;document.getElementById('timePicker').style.display='block';renderTimePicker();}
function closeTimePicker(){document.getElementById('timePicker').style.display='none';}

function renderTimePicker(){
    const grid=document.getElementById('timePickerGrid');
    grid.innerHTML='';
    const cur=currentSendTime?parseInt(currentSendTime.split(':')[0]):-1;
    for(let h=0;h<24;h++){
        const btn=document.createElement('button');
        btn.textContent=h.toString().padStart(2,'0')+':00';
        if(h===cur)btn.classList.add('selected');
        btn.onclick=function() { setTime(h); };
        grid.appendChild(btn);
    }
}

async function setTime(hour){ if(!ensureConsent())return; hapticFeedback();
    try{
        const resp=await apiRequest('/api/webapp/set_time',{
            method:'POST',
            headers:getHeaders(),
            body:JSON.stringify({hour:hour})
        });
        if(!resp)return;
        if(!resp.ok){const err=await resp.json();alert('❌ Ошибка: '+err.detail);return;}
        const data=await resp.json();
        currentSendTime=data.send_time;
        document.getElementById('currentTimeDisplay').textContent=currentSendTime+' MSK';
        document.querySelectorAll('#timePickerGrid button').forEach((btn,idx)=>{btn.classList.toggle('selected',idx===hour);});
        alert('✅ Время установлено на '+currentSendTime);
        closeTimePicker();
        await loadApp();
    }catch(err){alert('❌ Ошибка: '+err.message);}
}

function toggleTariffs(){ if(!ensureConsent())return; hapticFeedback();document.getElementById('tariffBlock').classList.toggle('visible');}

// ===== ИСПРАВЛЕННАЯ ОПЛАТА =====
async function handlePayment(tariffKey){ 
    if(!ensureConsent()) return; 
    hapticFeedback();
    if(!authToken){
        alert('❌ Вы не авторизованы. Пожалуйста, войдите.');
        return;
    }
    try {
        const resp = await apiRequest('/api/payment/create-invoice', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tariff: tariffKey })
        });
        if (!resp) return;
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

// ===== ФУНКЦИИ ВХОДА =====

// ----- VK OAuth с pollForToken (как Яндекс) -----
async function startVkAuth(){
    hapticFeedback();
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = 'vk_' + Math.random().toString(36).substring(2);

    try {
        const resp = await apiRequest('/api/auth/vk/save-verifier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, code_verifier: verifier })
        });
        if (!resp.ok) throw new Error('Не удалось сохранить verifier на сервере');
    } catch (e) {
        alert('Ошибка: ' + e.message);
        return;
    }

    const redirectUri = 'https://news.proid.studio/pwa';
    const scope = 'vkid.personal_info';
    const authUrl = `https://id.vk.ru/authorize?client_id=${VK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256&v=5.199&from_extension=1`;

    const container = document.getElementById('loginScreen').querySelector('.auth-container');
    if (container) container.style.display = 'none';
    const w = document.getElementById('widgetContainer');
    if (w) w.innerHTML = '<p style="color: var(--text-secondary);">Перенаправление на авторизацию VK...</p>';

    authWindow = window.open(authUrl, '_blank');

    pollForToken(state, loadApp, 'vk');
}

// ----- MAX AUTH с опросом /api/auth/max-status -----
async function startMaxAuth(){
    hapticFeedback();
    const container = document.getElementById('loginScreen').querySelector('.auth-container');
    if (container) container.style.display = 'none';
    const w = document.getElementById('widgetContainer');
    w.innerHTML = '<div class="loader"></div>';
    try{
        const resp = await apiRequest('/api/auth/max-token?source=telegram');
        if(!resp){ container.style.display='block'; w.innerHTML=''; return; }
        if(!resp.ok) throw new Error('Не удалось получить токен');
        const data = await resp.json();
        const token = data.token;
        const botUsername = data.bot_username || 'id772609477460_bot';
        localStorage.setItem('max_auth_token', token);
        startMaxWaiting(token);
        window.open('https://max.ru/' + botUsername + '?start=' + encodeURIComponent(token), '_blank');
        w.innerHTML = '<p style="color: var(--text-secondary);">Ожидаем подтверждения в MAX...</p>';
    } catch(err){
        alert('❌ Ошибка: ' + err.message);
        container.style.display = 'block';
        w.innerHTML = '';
    }
}

function startMaxWaiting(token){
    if (maxPollingTimer) clearInterval(maxPollingTimer);
    let attempts = 0;
    const maxAttempts = 60;
    maxPollingTimer = setInterval(async () => {
        attempts++;
        try{
            const resp = await apiRequest('/api/auth/max-status/' + token);
            if (!resp) return;
            if (!resp.ok) {
                if (resp.status === 404) {
                    // ещё не готово
                } else {
                    console.warn('MAX status error:', resp.status);
                }
                if (attempts >= maxAttempts) {
                    clearInterval(maxPollingTimer);
                    maxPollingTimer = null;
                    alert('⏰ Время истекло. Попробуйте снова.');
                    document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
                    document.getElementById('widgetContainer').innerHTML = '';
                }
                return;
            }
            const data = await resp.json();
            if (data.ready && data.auth_token) {
                clearInterval(maxPollingTimer);
                maxPollingTimer = null;
                authToken = data.auth_token;
                localStorage.setItem('auth_token', authToken);
                alert('✅ Аккаунт привязан!');
                loadApp();
                if (authWindow && !authWindow.closed) {
                    authWindow.close();
                    authWindow = null;
                }
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(maxPollingTimer);
                maxPollingTimer = null;
                alert('⏰ Время истекло. Попробуйте снова.');
                document.getElementById('loginScreen').querySelector('.auth-container').style.display = 'block';
                document.getElementById('widgetContainer').innerHTML = '';
            }
        } catch(e) {
            console.error('MAX polling error:', e);
        }
    }, 3000);
}

// ----- Яндекс ID (с абсолютным URL) -----
function startYandexAuth() {
    hapticFeedback();
    console.log('🔹 startYandexAuth() вызвана');

    const isTelegram = window.Telegram && window.Telegram.WebApp;
    const prefix = isTelegram ? 'telegram_' : 'pwa_';
    const state = prefix + Math.random().toString(36).substring(2);
    console.log('🔑 Сгенерирован state:', state);
    console.log('📤 source для pollForToken:', prefix === 'telegram_' ? 'telegram' : 'pwa');

    const container = document.querySelector('#loginScreen .auth-container');
    if (container) container.style.display = 'none';
    const w = document.getElementById('widgetContainer');
    if (w) w.innerHTML = '<p style="color: var(--text-secondary);">Перенаправление на авторизацию Яндекс...</p>';

    let authUrl = API_BASE + '/api/auth/yandex/login?state=' + encodeURIComponent(state);
    authUrl += '&from_extension=1';
    console.log('🌐 Открываем URL:', authUrl);
    authWindow = window.open(authUrl, '_blank');

    console.log('⏳ Запускаем pollForToken с state:', state);
    pollForToken(state, loadApp, prefix === 'telegram_' ? 'telegram' : 'pwa');
}

// ===== КНОПКА "СМОТРЕТЬ НОВОСТИ" =====
let digestVisible = false;
async function toggleDigest() {
    console.log('🟢 toggleDigest() вызвана');
    if (!ensureConsent()) {
        console.warn('⛔ ensureConsent() вернул false, прерываем выполнение');
        return;
    }
    console.log('✅ ensureConsent() пройден');

    const container = document.getElementById('digestContainer');
    const content = document.getElementById('digestContent');
    console.log('📦 container:', container, 'content:', content);

    if (digestVisible) {
        console.log('🔄 digestVisible = true, скрываем контейнер');
        container.style.display = 'none';
        digestVisible = false;
        return;
    }
    console.log('🔄 digestVisible = false, показываем контейнер');
    container.style.display = 'block';
    digestVisible = true;

    content.innerHTML = '<div style="text-align:center; padding:20px; color: var(--text-secondary);">⏳ Загрузка...</div>';
    console.log('📝 Установлен текст загрузки');

    try {
        console.log('📡 Вызов apiRequest("/api/webapp/digest")...');
        const resp = await apiRequest('/api/webapp/digest', { headers: getHeaders() });
        console.log('📡 Ответ получен, статус:', resp ? resp.status : 'null');

        if (!resp) {
            console.warn('⚠️ resp = null, прерываем');
            return;
        }
        if (!resp.ok) {
            const err = await resp.json();
            console.error('❌ Ошибка ответа:', err);
            content.innerHTML = `<div style="color: #ff6b6b; text-align:center; padding:20px;">❌ Ошибка: ${err.detail || 'Не удалось загрузить ленту'}</div>`;
            return;
        }
        const data = await resp.json();
        console.log('📄 Получены данные:', data);

        let digestHtml = data.digest;
        console.log('📄 digestHtml длина:', digestHtml ? digestHtml.length : 0);

        if (!digestHtml || digestHtml.trim() === '' || digestHtml.includes('Лента ещё не формировалась')) {
            console.log('📭 Лента пуста или ещё не формировалась');
            content.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-secondary);">📭 Добавьте источники и дождитесь автоматического сбора новостей.</div>`;
            return;
        }

        digestHtml = digestHtml.replace(/[\x00-\x1F\x7F-\x9F\u200B\u200C\u200D\uFEFF\u2028\u2029\r]/g, '');
        console.log('🧹 После очистки длина:', digestHtml.length);

        let blocks = digestHtml.split(/(?=\n- <b>)/).filter(b => b.trim().length > 0);
        if (blocks.length <= 1) {
            blocks = digestHtml.split(/(?=\n-)/).filter(b => b.trim().length > 0);
        }
        if (blocks.length <= 1) {
            blocks = digestHtml.split(/(?=- <b>)/).filter(b => b.trim().length > 0);
            if (blocks[0] && blocks[0].trim() === '') blocks.shift();
        }
        console.log('🧩 Количество блоков:', blocks.length);

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
            console.log('✅ Готово, вставляем HTML, длина:', html.length);
            content.innerHTML = html;
            content.querySelectorAll('a').forEach(link => link.target = '_blank');
        } else {
            console.log('📭 После обработки блоков ничего не осталось');
            content.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-secondary);">📭 Новости не найдены.</div>`;
        }

    } catch (e) {
        console.error('❌ Исключение в toggleDigest:', e);
        content.innerHTML = `<div style="color: #ff6b6b; text-align:center; padding:20px;">❌ Ошибка: ${e.message}</div>`;
    }
}

// ===== ВЫХОД =====
function logout() {
    const confirmLogout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('bot_auth_token');
        localStorage.removeItem('max_auth_token');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('bot_auth_token');
        sessionStorage.removeItem('max_auth_token');
        sessionStorage.removeItem('vk_auth_state');
        sessionStorage.removeItem('vk_code_verifier');
        authToken = null;
        currentSources = [];
        window.location.reload();
    };

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: 'Выход',
            message: 'Вы уверены, что хотите выйти?',
            buttons: [
                { id: 'cancel', type: 'cancel', text: 'Отмена' },
                { id: 'logout', type: 'destructive', text: 'Выйти' }
            ]
        }, function (btnId) {
            if (btnId === 'logout') confirmLogout();
        });
    } else if (window.WebApp && window.WebApp.showPopup) {
        window.WebApp.showPopup({
            title: 'Выход',
            message: 'Вы уверены, что хотите выйти?',
            buttons: [
                { id: 'cancel', type: 'cancel', text: 'Отмена' },
                { id: 'logout', type: 'destructive', text: 'Выйти' }
            ]
        }, function (btnId) {
            if (btnId === 'logout') confirmLogout();
        });
    } else {
        if (confirm('Вы уверены, что хотите выйти?')) {
            confirmLogout();
        }
    }
}

function suggestSource() {
    if (!ensureConsent()) return;
    hapticFeedback();
    const url = 'https://t.me/professional_interior_design';
    const text = 'Добрый день. Хочу предложить источник:';
    window.open(url + '?text=' + encodeURIComponent(text), '_blank');
}

// ---- ИНИЦИАЛИЗАЦИЯ ----
(function init(){
    if (authToken) {
        if (document.getElementById('sourceListContainer').children.length === 0) loadApp();
    } else {
        showLoginScreen();
        const container = document.getElementById('loginScreen').querySelector('.auth-container');
        if (container) container.style.display = 'block';
        const w = document.getElementById('widgetContainer');
        if (w) w.innerHTML = '';
    }
})();

// ---- ЭКСПОРТЫ ----
window.startVkAuth = startVkAuth;
window.startMaxAuth = startMaxAuth;
window.startYandexAuth = startYandexAuth;
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
window.ensureConsent = ensureConsent;
window.logout = logout;
window.pollForToken = pollForToken;

// ===== ПОГОДА =====
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_LAT = 55.7558;
const WEATHER_LON = 37.6173;

const WEATHER_CODES = {
    0: { icon: '☀️', desc: 'Ясно' },
    1: { icon: '🌤️', desc: 'Малооблачно' },
    2: { icon: '⛅', desc: 'Переменная облачность' },
    3: { icon: '☁️', desc: 'Пасмурно' },
    45: { icon: '🌫️', desc: 'Туман' },
    48: { icon: '🌫️', desc: 'Туман с изморозью' },
    51: { icon: '🌦️', desc: 'Морось слабая' },
    53: { icon: '🌦️', desc: 'Морось умеренная' },
    55: { icon: '🌧️', desc: 'Морось сильная' },
    56: { icon: '🌨️', desc: 'Ледяная морось слабая' },
    57: { icon: '🌨️', desc: 'Ледяная морось сильная' },
    61: { icon: '🌧️', desc: 'Дождь слабый' },
    63: { icon: '🌧️', desc: 'Дождь умеренный' },
    65: { icon: '🌧️', desc: 'Дождь сильный' },
    66: { icon: '🌨️', desc: 'Ледяной дождь слабый' },
    67: { icon: '🌨️', desc: 'Ледяной дождь сильный' },
    71: { icon: '🌨️', desc: 'Снег слабый' },
    73: { icon: '🌨️', desc: 'Снег умеренный' },
    75: { icon: '❄️', desc: 'Снег сильный' },
    77: { icon: '🌨️', desc: 'Снежная крупа' },
    80: { icon: '🌧️', desc: 'Ливень слабый' },
    81: { icon: '🌧️', desc: 'Ливень умеренный' },
    82: { icon: '⛈️', desc: 'Ливень сильный' },
    85: { icon: '🌨️', desc: 'Снегопад слабый' },
    86: { icon: '❄️', desc: 'Снегопад сильный' },
    95: { icon: '⛈️', desc: 'Гроза слабая' },
    96: { icon: '⛈️', desc: 'Гроза с градом слабая' },
    99: { icon: '⛈️', desc: 'Гроза с градом сильная' },
};

function getWeatherDescription(code) {
    return WEATHER_CODES[code] || { icon: '🌡️', desc: '—' };
}

function formatDay(dateStr) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const d = new Date(dateStr + 'T00:00:00');
    return days[d.getDay()];
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function fetchWeather() {
    const container = document.getElementById('weatherContent');
    const timeEl = document.getElementById('weatherUpdateTime');

    const windDirections = [
        { from: 0, to: 22.5, dir: 'С' },
        { from: 22.5, to: 67.5, dir: 'СВ' },
        { from: 67.5, to: 112.5, dir: 'В' },
        { from: 112.5, to: 157.5, dir: 'ЮВ' },
        { from: 157.5, to: 202.5, dir: 'Ю' },
        { from: 202.5, to: 247.5, dir: 'ЮЗ' },
        { from: 247.5, to: 292.5, dir: 'З' },
        { from: 292.5, to: 337.5, dir: 'СЗ' },
        { from: 337.5, to: 360, dir: 'С' }
    ];

    function getWindDirection(deg) {
        if (deg == null) return '—';
        for (let d of windDirections) {
            if (deg >= d.from && deg < d.to) return d.dir;
        }
        return 'С';
    }

    try {
        const params = new URLSearchParams({
            latitude: WEATHER_LAT,
            longitude: WEATHER_LON,
            daily: [
                'weather_code',
                'temperature_2m_max',
                'temperature_2m_min',
                'apparent_temperature_max',
                'wind_speed_10m_max',
                'wind_direction_10m_dominant',
                'relative_humidity_2m_max'
            ].join(','),
            timezone: 'Europe/Moscow',
            forecast_days: 7
        });

        const resp = await fetch(`${WEATHER_API_URL}?${params}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (!data.daily || !data.daily.time) {
            throw new Error('Некорректный ответ API');
        }

        const { time, weather_code, temperature_2m_max, temperature_2m_min, apparent_temperature_max, wind_speed_10m_max, wind_direction_10m_dominant, relative_humidity_2m_max } = data.daily;

        let html = '';
        for (let i = 0; i < time.length; i++) {
            const dayName = i === 0 ? 'Сегодня' : formatDay(time[i]);
            const dateStr = i === 0 ? '' : ' ' + formatDate(time[i]);
            const code = weather_code[i];
            const weather = getWeatherDescription(code);
            const tMax = Math.round(temperature_2m_max[i]);
            const tMin = Math.round(temperature_2m_min[i]);
            const feelsLike = Math.round(apparent_temperature_max[i]);
            const windSpeed = Math.round(wind_speed_10m_max[i]);
            const windDir = getWindDirection(wind_direction_10m_dominant[i]);
            const humidity = Math.round(relative_humidity_2m_max[i]);

            html += `
                <div class="weather-day">
                    <span class="day-name">${dayName}${dateStr}</span>
                    <span class="weather-icon">${weather.icon}</span>
                    <span class="weather-temp">
                        ${tMax}°${feelsLike ? ` (${feelsLike}°)` : ''} 
                        <span class="min">${tMin}°</span>
                    </span>
                    <span class="weather-wind-dir">${windDir}</span>
                    <span class="weather-wind-speed">${windSpeed} км/ч</span>
                    <span class="weather-humidity">${humidity}%</span>
                </div>
            `;
        }

        container.innerHTML = html;
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }

    } catch (err) {
        console.error('Weather fetch error:', err);
        container.innerHTML = `<div class="weather-error">❌ Не удалось загрузить прогноз: ${err.message}</div>`;
        if (timeEl) timeEl.textContent = '—';
    }
}

// Загружаем погоду при загрузке страницы и каждые 60 минут
if (document.getElementById('weatherBlock')) {
    fetchWeather();
    setInterval(fetchWeather, 60 * 60 * 1000);
}