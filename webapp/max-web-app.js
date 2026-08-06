//#region src/features/storages/DeviceStorage.ts
var e = class {
	saveKey;
	getKey;
	clearKeys;
	constructor({ saveKey: e, getKey: t, clearKeys: n }) {
		this.saveKey = e, this.getKey = t, this.clearKeys = n;
	}
	setItem(e, t) {
		return this.saveKey({
			key: e,
			value: t
		});
	}
	getItem(e) {
		return this.getKey({ key: e });
	}
	removeItem(e) {
		return this.saveKey({
			key: e,
			value: null
		});
	}
	clear() {
		return this.clearKeys();
	}
}, t = class {
	saveKey;
	getKey;
	clearKeys;
	constructor({ saveKey: e, getKey: t, clearKeys: n }) {
		this.saveKey = e, this.getKey = t, this.clearKeys = n;
	}
	setItem(e, t) {
		return this.saveKey({
			key: e,
			value: t
		});
	}
	getItem(e) {
		return this.getKey({ key: e });
	}
	removeItem(e) {
		return this.saveKey({
			key: e,
			value: null
		});
	}
	clear() {
		return this.clearKeys();
	}
}, n = class {
	visible = !1;
	postBackButtonEvent;
	onClick;
	offClick;
	get isVisible() {
		return this.visible;
	}
	constructor({ postBackButtonEvent: e, onClick: t, offClick: n }) {
		this.postBackButtonEvent = e, this.onClick = t, this.offClick = n;
	}
	show() {
		this.visible = !0, this.postBackButtonEvent(!0);
	}
	hide() {
		this.visible = !1, this.postBackButtonEvent(!1);
	}
}, r = class e {
	static WEB_APP_DATA_KEY = "WebAppData";
	static WEB_APP_PLATFORM_KEY = "WebAppPlatform";
	static WEB_APP_VERSION_KEY = "WebAppVersion";
	static WEB_APP_DEVICE_NAME = "WebAppDeviceName";
	static VALID_PLATFORMS = [
		"ios",
		"android",
		"desktop",
		"web"
	];
	rawInitData;
	rawPlatformData;
	rawVersionData;
	rawDeviceName;
	constructor() {
		this.rawInitData = this.getParamFromHashOrStorage(e.WEB_APP_DATA_KEY), this.rawPlatformData = this.getParamFromHashOrStorage(e.WEB_APP_PLATFORM_KEY), this.rawVersionData = this.getParamFromHashOrStorage(e.WEB_APP_VERSION_KEY), this.rawDeviceName = this.getParamFromHashOrStorage(e.WEB_APP_DEVICE_NAME);
	}
	getParamFromHashOrStorage(e) {
		let t = this.extractParamFromHashes(e);
		return t ? (sessionStorage.setItem(e, t), t) : sessionStorage.getItem(e);
	}
	extractParamFromHashes(e) {
		try {
			let t = this.getHashParam(location.hash, e);
			if (t) return t;
			let n = performance.getEntriesByType("navigation")[0], r = n && new URL(n.name).hash;
			return r && this.getHashParam(r, e) || null;
		} catch (t) {
			return console.warn(`Ошибка при извлечении параметра ${e}:`, t), null;
		}
	}
	getHashParam(e, t) {
		try {
			let n = e.replace(/^#/, "");
			return new URLSearchParams(n).get(t);
		} catch (e) {
			return console.warn(`Ошибка при извлечении параметра ${t}:`, e), null;
		}
	}
	get initData() {
		return this.rawInitData;
	}
	get platform() {
		return this.isValidPlatform(this.rawPlatformData) ? this.rawPlatformData : null;
	}
	get version() {
		return this.rawVersionData;
	}
	get deviceName() {
		return this.rawDeviceName;
	}
	isValidPlatform(t) {
		return t !== null && e.VALID_PLATFORMS.includes(t);
	}
	get initDataUnsafe() {
		return this.parseInitData(this.rawInitData);
	}
	parseInitData(e) {
		let t = {};
		if (!e) return t;
		try {
			new URLSearchParams(decodeURIComponent(e)).forEach((e, n) => {
				switch (n) {
					case "hash":
					case "ip":
					case "query_id":
					case "start_param":
						t[n] = e;
						break;
					case "auth_date":
						t[n] = Number(e);
						break;
					case "user":
						t[n] = this.getUserInitData(e);
						break;
					case "chat":
						t[n] = this.getChatInitData(e);
						break;
					default: console.warn(`Неизвестный параметр: ${n}`);
				}
			});
		} catch (e) {
			console.warn("Ошибка при парсинге init data:", e);
		}
		return t;
	}
	getUserInitData(e) {
		try {
			let t = JSON.parse(e);
			if (t && typeof t == "object") return {
				first_name: t.first_name,
				last_name: t.last_name,
				username: t.username,
				language_code: t.language_code,
				photo_url: t.photo_url,
				id: Number(t.id)
			};
		} catch (e) {
			console.warn("Ошибка при парсинге данных пользователя:", e);
		}
	}
	getChatInitData(e) {
		try {
			let t = JSON.parse(e);
			if (t && typeof t == "object") return {
				id: t.id,
				type: t.type
			};
		} catch (e) {
			console.warn("Ошибка при парсинге данных чата:", e);
		}
	}
}, i = (e) => typeof e.requestId == "string" && e.requestId.length > 0, a = (e, t) => {
	throw console.error(`[WebApp] ${t}`), { error: { code: e } };
}, o = (e) => {
	let t = e.split("WebApp")[1];
	return t ? t.match(/([A-Z][a-z]*)/g)?.map((e) => e.toLowerCase()).join("_") : "unknown_method";
}, s = 1e4, c = 3e4, l = 6e4, u = 6e5;
//#endregion
//#region src/shared/utils/uuid.ts
function d() {
	if (crypto && crypto?.randomUUID) return crypto.randomUUID();
	if (crypto && crypto?.getRandomValues) {
		let e = /* @__PURE__ */ new Uint8Array(16);
		crypto.getRandomValues(e);
		let t = "";
		for (let n = 0; n < e.length; n++) t += e[n].toString(16).padStart(2, "0");
		return t;
	}
	let e = Date.now().toString(36);
	for (; e.length < 32;) e += Math.random().toString(36).slice(2);
	return e.slice(0, 32);
}
//#endregion
//#region src/features/BiometricManager.ts
var f = class {
	getInfo;
	requestBiometryAccess;
	updateToken;
	requestAuth;
	_openSettings;
	inited = !1;
	biometryInfo = {
		available: !1,
		accessRequested: !1,
		accessGranted: !1,
		type: ["unknown"],
		tokenSaved: !1,
		deviceId: null
	};
	getBiometryInfo() {
		return { ...this.biometryInfo };
	}
	setBiometryInfo(e) {
		this.biometryInfo = {
			...this.biometryInfo,
			...e
		};
	}
	checkInit(e, t = "BiometricManager должен быть инициализирован перед использованием.") {
		return this.inited || a(e, t), !0;
	}
	checkAccessGranted(e, t = "Биометрический доступ не предоставлен пользователем.") {
		return this.biometryInfo.accessGranted || a(e, t), !0;
	}
	checkAvailable(e, t = "Биометрические данные недоступны на этом устройстве.") {
		return this.biometryInfo.available || a(e, t), !0;
	}
	constructor({ getInfo: e, requestBiometryAccess: t, updateToken: n, requestAuth: r, openSettings: i }) {
		this.getInfo = e, this.requestBiometryAccess = t, this.updateToken = n, this.requestAuth = r, this._openSettings = i;
	}
	get isInited() {
		return this.inited;
	}
	get isBiometricAvailable() {
		return this.biometryInfo.available;
	}
	get isAccessRequested() {
		return this.biometryInfo.accessRequested;
	}
	get isAccessGranted() {
		return this.biometryInfo.accessGranted;
	}
	get isBiometricTokenSaved() {
		return this.biometryInfo.tokenSaved;
	}
	get biometricType() {
		return this.biometryInfo.type;
	}
	get deviceId() {
		return this.biometryInfo.deviceId;
	}
	async init() {
		if (this.inited) return this.getBiometryInfo();
		let e = await this.getInfo();
		return this.setBiometryInfo(e), this.inited = !0, this.getBiometryInfo();
	}
	async requestAccess(e) {
		if (this.biometryInfo.accessRequested) return this.getBiometryInfo();
		this.checkInit("client.biometry_request_access.not_inited"), this.checkAvailable("client.biometry_request_access.not_supported");
		let t = await this.requestBiometryAccess({ reason: e });
		return this.setBiometryInfo(t), this.getBiometryInfo();
	}
	async authenticate(e) {
		return this.checkInit("client.biometry_request_auth.not_inited"), this.checkAvailable("client.biometry_request_auth.not_supported"), this.checkAccessGranted("client.biometry_request_auth.permission_denied"), this.biometryInfo.tokenSaved || a("client.biometry_request_auth.not_found", "Биометрический токен не найден."), this.requestAuth({ reason: e });
	}
	async updateBiometricToken(e, t) {
		this.checkInit("client.biometry_update_token.not_inited"), this.checkAvailable("client.biometry_update_token.not_supported"), this.checkAccessGranted("client.biometry_update_token.permission_denied");
		let n = await this.updateToken({
			token: e,
			reason: t
		});
		return this.biometryInfo.tokenSaved = n.status === "updated", n;
	}
	async openSettings() {
		return this.checkInit("client.biometry_open_settings.not_inited"), this.checkAvailable("client.biometry_open_settings.not_supported"), this.biometryInfo.accessGranted && a("client.biometry_open_settings.permission_denied", "Биометрический доступ уже предоставлен пользователем. Нет необходимости открывать настройки."), this._openSettings();
	}
}, p = class {
	_impactOccurred;
	_notificationOccurred;
	_selectionChanged;
	constructor({ impactOccurred: e, notificationOccurred: t, selectionChanged: n }) {
		this._impactOccurred = e, this._notificationOccurred = t, this._selectionChanged = n;
	}
	impactOccurred(e, t = !1) {
		return this._impactOccurred({
			impactStyle: e,
			disableVibrationFallback: t
		});
	}
	notificationOccurred(e, t = !1) {
		return this._notificationOccurred({
			notificationType: e,
			disableVibrationFallback: t
		});
	}
	selectionChanged(e = !1) {
		return this._selectionChanged({ disableVibrationFallback: e });
	}
}, m = class {
	enabled = !0;
	postSwipesBehaviorEvent;
	get isEnabled() {
		return this.enabled;
	}
	constructor({ postSwipesBehaviorEvent: e }) {
		this.postSwipesBehaviorEvent = e;
	}
	async enable() {
		let e = await this.postSwipesBehaviorEvent({ allowVerticalSwipes: !0 });
		return this.enabled = e.allowVerticalSwipes, e;
	}
	async disable() {
		let e = await this.postSwipesBehaviorEvent({ allowVerticalSwipes: !1 });
		return this.enabled = e.allowVerticalSwipes, e;
	}
}, h = class {
	enabled = !1;
	postScreenCaptureEvent;
	get isScreenCaptureEnabled() {
		return this.enabled;
	}
	constructor({ postScreenCaptureEvent: e }) {
		this.postScreenCaptureEvent = e;
	}
	async enableScreenCapture() {
		let e = await this.postScreenCaptureEvent({ isScreenCaptureEnabled: !0 });
		return this.enabled = e.isScreenCaptureEnabled, e;
	}
	async disableScreenCapture() {
		let e = await this.postScreenCaptureEvent({ isScreenCaptureEnabled: !1 });
		return this.enabled = e.isScreenCaptureEnabled, e;
	}
}, g = class {
	getInfo;
	_emulateNfcTag;
	_openSystemSettings;
	inited = !1;
	nfcInfo = {
		available: !1,
		enabled: !1,
		accessRevoked: !1
	};
	getNfcInfo() {
		return { ...this.nfcInfo };
	}
	setNfcInfo(e) {
		this.nfcInfo = {
			...this.nfcInfo,
			...e
		};
	}
	checkInit(e, t = "NfcManager должен быть инициализирован перед использованием.") {
		return this.inited || a(e, t), !0;
	}
	checkAccessIsNotRevoked(e, t = "Пользователь отозвал разрешение использовать NFC модуль для этого мини-приложения.") {
		return this.nfcInfo.accessRevoked && a(e, t), !0;
	}
	checkIsEnabled(e, t = "NFC модуль выключен в настройках системы.") {
		return this.nfcInfo.enabled || a(e, t), !0;
	}
	checkIsAvailable(e, t = "NFC модуль недоступен на этом устройстве.") {
		return this.nfcInfo.available || a(e, t), !0;
	}
	constructor({ getInfo: e, openSystemSettings: t, emulateNfcTag: n }) {
		this.getInfo = e, this._openSystemSettings = t, this._emulateNfcTag = n;
	}
	get isInited() {
		return this.inited;
	}
	async init() {
		let e = await this.getInfo();
		return this.setNfcInfo(e), this.inited = !0, this.getNfcInfo();
	}
	async emulateNfcTag(e) {
		return this.checkInit("client.nfc_emulate_nfc_tag.not_inited"), this.checkIsAvailable("client.nfc_emulate_nfc_tag.not_supported"), this.checkIsEnabled("client.nfc_emulate_nfc_tag.not_enabled"), this.checkAccessIsNotRevoked("client.nfc_emulate_nfc_tag.access_revoked"), this._emulateNfcTag({ nfctag: e });
	}
	async openSystemSettings() {
		return this.checkInit("client.nfc_open_system_settings.not_inited"), this.checkIsAvailable("client.nfc_open_system_settings.not_supported"), this.nfcInfo.enabled && a("client.nfc_open_system_settings.permission_denied", "Доступ к NFC модулю уже предоставлен пользователем. Нет необходимости открывать настройки."), this._openSystemSettings();
	}
}, _ = /^https:\/\/.*\.(?:max|oneme)\.ru$/, v = class {
	webviewBridge;
	messageCallback;
	isIframe() {
		return typeof window < "u" && window.self !== window.top;
	}
	sendEvent;
	constructor(e) {
		this.messageCallback = e, this.isIframe() ? (this.sendEvent = this.sendOverIframe, this.initializeIframeTransport()) : typeof window < "u" && window.WebViewHandler ? (this.webviewBridge = window.WebViewHandler, this.sendEvent = this.sendOverWebView) : this.sendEvent = this.sendFallback;
	}
	initializeIframeTransport() {
		window.addEventListener("message", async (e) => {
			if (!(!_.test(e.origin) || typeof e.data != "string")) try {
				let { type: t, ...n } = JSON.parse(e.data);
				t?.startsWith("WebApp") && this.messageCallback && this.messageCallback(t, n);
			} catch (e) {
				console.error("[WebApp] Ошибка при обработке сообщения: ", e);
			}
		});
	}
	sendOverIframe(e, t) {
		window.parent.postMessage(JSON.stringify({
			type: e,
			...t
		}), "*");
	}
	sendOverWebView(e, t) {
		this.webviewBridge?.postEvent(e, JSON.stringify(t));
	}
	sendFallback(e) {
		console.warn("[WebApp] Событие не отправлено - транспорт недоступен:", e);
	}
}, y = class {
	pendingRequests = /* @__PURE__ */ new Map();
	sendEvent;
	constructor(e) {
		this.sendEvent = e;
	}
	createRequest(e, t = {}, n = {}) {
		let { timeout: r = s } = n;
		return new Promise((n, i) => {
			let a = d(), s = setTimeout(() => {
				this.deletePendingRequest(a), i({ error: { code: `client.${o(e)}.request_timeout` } });
			}, r);
			this.pendingRequests.set(a, {
				resolve: n,
				reject: i,
				timeoutId: s
			}), this.sendEvent(e, {
				...t,
				requestId: a
			});
		});
	}
	handleResponse(e, t) {
		let { requestId: n, ...r } = t, i = this.pendingRequests.get(n);
		if (!i) {
			console.warn(`[WebApp] Получен ответ на неизвестный запрос: ${e}`);
			return;
		}
		"error" in r ? (console.error(`[WebApp] Получена ошибка: ${e}`, r), i.reject(r)) : (console.log(`[WebApp] Получено событие: ${e}`, r), i.resolve(r)), this.clearTimeout(n), this.deletePendingRequest(n);
	}
	clearTimeout(e) {
		let t = this.pendingRequests.get(e);
		t && clearTimeout(t.timeoutId);
	}
	deletePendingRequest(e) {
		this.pendingRequests.get(e) && this.pendingRequests.delete(e);
	}
}, b = new class {
	eventHandlers = /* @__PURE__ */ new Map();
	transport;
	requestController;
	initDataManager;
	swipesBehaviorManager;
	SecureStorage;
	DeviceStorage;
	BackButton;
	BiometricManager;
	NfcManager;
	HapticFeedback;
	ScreenCapture;
	get initData() {
		return this.initDataManager.initData;
	}
	get initDataUnsafe() {
		return this.initDataManager.initDataUnsafe;
	}
	get platform() {
		return this.initDataManager.platform;
	}
	get version() {
		return this.initDataManager.version;
	}
	get deviceName() {
		return this.initDataManager.deviceName;
	}
	get isVerticalSwipesEnabled() {
		return this.swipesBehaviorManager.isEnabled;
	}
	withQueryId = (e) => (t = {}) => {
		let n = this.initDataUnsafe?.query_id;
		return e({
			...t || {},
			queryId: n
		});
	};
	constructor() {
		this.transport = new v(async (e, t) => {
			await this.receiveEvent(e, t);
		}), this.requestController = new y((e, t) => {
			this.transport.sendEvent(e, t);
		}), this.BackButton = new n({
			postBackButtonEvent: (e) => this.postEvent("WebAppSetupBackButton", { isVisible: e }),
			onClick: (e) => this.onEvent("WebAppBackButtonPressed", e),
			offClick: (e) => this.offEvent("WebAppBackButtonPressed", e)
		}), this.initDataManager = new r(), this.SecureStorage = new t({
			saveKey: this.withQueryId((e) => this.requestController.createRequest("WebAppSecureStorageSaveKey", e)),
			getKey: this.withQueryId((e) => this.requestController.createRequest("WebAppSecureStorageGetKey", e)),
			clearKeys: this.withQueryId((e) => this.requestController.createRequest("WebAppSecureStorageClear", e))
		}), this.DeviceStorage = new e({
			saveKey: this.withQueryId((e) => this.requestController.createRequest("WebAppDeviceStorageSaveKey", e)),
			getKey: this.withQueryId((e) => this.requestController.createRequest("WebAppDeviceStorageGetKey", e)),
			clearKeys: this.withQueryId((e) => this.requestController.createRequest("WebAppDeviceStorageClear", e))
		}), this.NfcManager = new g({
			getInfo: this.withQueryId((e) => this.requestController.createRequest("WebAppNfcGetInfo", e)),
			openSystemSettings: this.withQueryId((e) => this.requestController.createRequest("WebAppNfcOpenSystemSettings", e)),
			emulateNfcTag: this.withQueryId((e) => this.requestController.createRequest("WebAppNfcEmulateNfcTag", e, { timeout: c }))
		}), this.BiometricManager = new f({
			getInfo: this.withQueryId((e) => this.requestController.createRequest("WebAppBiometryGetInfo", e)),
			requestBiometryAccess: this.withQueryId((e) => this.requestController.createRequest("WebAppBiometryRequestAccess", e, { timeout: l })),
			updateToken: this.withQueryId((e) => this.requestController.createRequest("WebAppBiometryUpdateToken", e, { timeout: l })),
			requestAuth: this.withQueryId((e) => this.requestController.createRequest("WebAppBiometryRequestAuth", e, { timeout: l })),
			openSettings: this.withQueryId((e) => this.requestController.createRequest("WebAppBiometryOpenSettings", e, { timeout: l }))
		}), this.HapticFeedback = new p({
			impactOccurred: (e) => this.requestController.createRequest("WebAppHapticFeedbackImpact", e),
			notificationOccurred: (e) => this.requestController.createRequest("WebAppHapticFeedbackNotification", e),
			selectionChanged: (e) => this.requestController.createRequest("WebAppHapticFeedbackSelectionChange", e)
		}), this.swipesBehaviorManager = new m({ postSwipesBehaviorEvent: (e) => this.requestController.createRequest("WebAppSetupSwipesBehavior", e) }), this.ScreenCapture = new h({ postScreenCaptureEvent: (e) => this.requestController.createRequest("WebAppSetupScreenCaptureBehavior", e) });
	}
	postEvent(e, t = {}, n) {
		this.transport.sendEvent(e, t), n?.();
	}
	async receiveEvent(e, t) {
		i(t) ? this.requestController.handleResponse(e, t) : this.eventHandlers.get(e)?.forEach((n) => {
			try {
				n(t);
			} catch (t) {
				console.error(`Ошибка в обработке события "${e}":`, t);
			}
		});
	}
	async sendEvent(e, t = "{}") {
		try {
			this.receiveEvent(e, JSON.parse(t));
		} catch (e) {
			console.warn(e);
		}
	}
	onEvent(e, t) {
		let n = this.eventHandlers.get(e);
		return n || (n = /* @__PURE__ */ new Set(), this.eventHandlers.set(e, n)), n.add(t), () => {
			this.offEvent(e, t);
		};
	}
	offEvent(e, t) {
		let n = this.eventHandlers.get(e);
		n && (n.delete(t), n.size === 0 && this.eventHandlers.delete(e));
	}
	requestScreenMaxBrightness() {
		return this.requestController.createRequest("WebAppChangeScreenBrightness", { maxBrightness: !0 });
	}
	restoreScreenBrightness() {
		return this.requestController.createRequest("WebAppChangeScreenBrightness", { maxBrightness: !1 });
	}
	close() {
		this.postEvent("WebAppClose", {}, () => {
			console.log("Приложение закрыто");
		});
	}
	ready() {
		this.postEvent("WebAppReady", {}, () => {
			console.log("WebApp готово к работе");
		});
	}
	requestContact() {
		return this.requestController.createRequest("WebAppRequestPhone", {}, { timeout: l });
	}
	enableClosingConfirmation() {
		this.postEvent("WebAppSetupClosingBehavior", { needConfirmation: !0 });
	}
	disableClosingConfirmation() {
		this.postEvent("WebAppSetupClosingBehavior", { needConfirmation: !1 });
	}
	openLink(e) {
		this.postEvent("WebAppOpenLink", { url: e });
	}
	openMaxLink(e) {
		this.postEvent("WebAppOpenMaxLink", { url: e });
	}
	getViewportSize() {
		return this.requestController.createRequest("WebAppGetViewportSize");
	}
	downloadFile(e, t) {
		return this.requestController.createRequest("WebAppDownloadFile", {
			url: e,
			file_name: t
		}, { timeout: l });
	}
	shareContent(e) {
		return this.requestController.createRequest("WebAppShare", e, { timeout: l });
	}
	async shareMaxContent(e) {
		try {
			let t;
			if ("mid" in e) {
				let n = e.mid.replace("mid.", ""), r = n.slice(0, 16), i = n.slice(16), a = BigInt("0x" + r), o = BigInt("0x" + i);
				e.chatType === "CHAT" && (a -= BigInt(2 ** 64)), t = {
					chatId: a.toString(),
					messageId: o.toString()
				};
			} else t = e;
			return this.requestController.createRequest("WebAppMaxShare", t, { timeout: l });
		} catch {
			return a("client.web_app_max_share.invalid_request", "Неверный формат переданных параметров");
		}
	}
	enableVerticalSwipes() {
		return this.swipesBehaviorManager.enable();
	}
	disableVerticalSwipes() {
		return this.swipesBehaviorManager.disable();
	}
	getLaunchContext() {
		return this.requestController.createRequest("WebAppGetLaunchContext");
	}
	openCodeReader(e = !0) {
		return this.requestController.createRequest("WebAppOpenCodeReader", { fileSelect: e }, { timeout: u });
	}
}();
window.WebApp = b;
//#endregion
