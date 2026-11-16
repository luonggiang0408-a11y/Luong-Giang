/* Đăng nhập bằng tài khoản Google (Firebase Auth) và đồng bộ dữ liệu học riêng của từng tài khoản (Firestore).
   Chỉ hoạt động khi đã điền firebase-config.js; nếu chưa, web chạy như cũ (không cần đăng nhập). */
const Cloud = {
  CHUNK: 200,
  user: null, db: null, auth: null,
  timer: null, busy: false, again: false, status: '',

  enabled() { return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey); },

  loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được thư viện đăng nhập (kiểm tra kết nối mạng).'));
      document.head.appendChild(s);
    });
  },

  async init() {
    if (!window.firebase) {
      const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
      await this.loadScript(base + 'firebase-app-compat.js');
      await this.loadScript(base + 'firebase-auth-compat.js');
      await this.loadScript(base + 'firebase-firestore-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    try { await this.auth.getRedirectResult(); } catch (e) { this.redirectError = e; }
    this.user = await new Promise((res) => { const off = this.auth.onAuthStateChanged((u) => { off(); res(u); }); });
    return this.user;
  },

  uref() { return this.db.collection('users').doc(this.user.uid); },

  errMsg(e) {
    const m = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/missing-password': 'Hãy nhập mật khẩu.',
      'auth/invalid-credential': 'Sai email hoặc mật khẩu.',
      'auth/wrong-password': 'Sai email hoặc mật khẩu.',
      'auth/user-not-found': 'Không có tài khoản với email này.',
      'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy đăng nhập.',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
      'auth/too-many-requests': 'Thử quá nhiều lần. Hãy đợi vài phút rồi thử lại.',
      'auth/network-request-failed': 'Mất kết nối mạng. Hãy thử lại.',
      'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập. Hãy thử lại.',
      'auth/cancelled-popup-request': 'Đang có một cửa sổ đăng nhập khác. Hãy thử lại.',
      'auth/unauthorized-domain': 'Tên miền này chưa được cho phép: thêm luonggiang0408-a11y.github.io vào Firebase → Authentication → Settings → Authorized domains.',
      'auth/operation-not-allowed': 'Tính năng này đang tắt trong Firebase (bật Google trong Authentication → Sign-in method).',
      'permission-denied': 'Không có quyền ghi dữ liệu: kiểm tra Firestore Rules.',
    };
    return m[e && e.code] || (e && e.message) || 'Có lỗi xảy ra.';
  },

  // Đăng nhập bằng tài khoản Google. Thử cửa sổ popup; nếu trình duyệt chặn thì chuyển hướng cả trang.
  async signInGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      this.user = (await this.auth.signInWithPopup(provider)).user;
      return true;
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await this.auth.signInWithRedirect(provider);   // trang sẽ tải lại sau khi đăng nhập
        return false;
      }
      throw e;
    }
  },
  async signOut() { await this.auth.signOut(); this.user = null; },

  // Dữ liệu lưu cục bộ theo từng tài khoản; lần đầu đăng nhập nhận luôn dữ liệu đang có trên máy này.
  bindStore(uid) {
    const legacy = 'vocabApp.v1', mine = legacy + '.' + uid;
    try {
      if (!localStorage.getItem(mine) && localStorage.getItem(legacy)) localStorage.setItem(mine, localStorage.getItem(legacy));
      localStorage.setItem('vocabApp.lastUid', uid);
    } catch (e) { /* bỏ qua */ }
    Store.KEY = mine;
    Store.load();
  },

  // Nhận dữ liệu từ đám mây nếu mới hơn bản trên máy này. Trả về true nếu có thay đổi.
  async pull() {
    if (!this.user) return false;
    try {
      const meta = await this.uref().get();
      if (!meta.exists) { this.setStatus('Chưa có dữ liệu trên đám mây — sẽ tải lên từ máy này.'); if (Store.data.words.length) this.schedule(); return false; }
      const m = meta.data();
      const local = Store.data.updatedAt || 0;
      if ((m.updatedAt || 0) <= local && Store.data.words.length) { this.setStatus('Dữ liệu trên máy này là bản mới nhất.'); return false; }
      const snap = await this.uref().collection('chunks').orderBy('i').get();
      let words = [];
      snap.forEach((d) => { words = words.concat(JSON.parse(d.data().json)); });
      Store.data.words = words.map((w) => SRS.migrate(w));
      try { const g = JSON.parse(m.gen || '{}'); if (g.speaking) Store.data.gen.speaking = g.speaking; if (g.writing) Store.data.gen.writing = g.writing; } catch (e) { /* bỏ qua */ }
      Store.data.updatedAt = m.updatedAt || Date.now();
      localStorage.setItem(Store.KEY, JSON.stringify(Store.data));
      this.setStatus('Đã tải dữ liệu từ đám mây (' + words.length + ' từ).');
      return true;
    } catch (e) { this.setStatus('Không tải được dữ liệu: ' + this.errMsg(e)); return false; }
  },

  schedule() {
    if (!this.user) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 2500);
  },

  async push() {
    if (!this.user) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      const words = Store.data.words;
      const chunks = [];
      for (let i = 0; i < words.length; i += this.CHUNK) chunks.push(words.slice(i, i + this.CHUNK));
      const col = this.uref().collection('chunks');
      const batch = this.db.batch();
      chunks.forEach((c, i) => batch.set(col.doc('c' + String(i).padStart(3, '0')), { i, json: JSON.stringify(c) }));
      for (let i = chunks.length; i < chunks.length + 10; i++) batch.delete(col.doc('c' + String(i).padStart(3, '0')));   // dọn phần thừa khi danh sách ngắn lại
      const gen = JSON.stringify({ speaking: Store.data.gen.speaking, writing: Store.data.gen.writing });
      batch.set(this.uref(), { updatedAt: Store.data.updatedAt || Date.now(), count: words.length, chunks: chunks.length, gen, email: this.user.email });
      await batch.commit();
      this.setStatus('Đã đồng bộ lúc ' + new Date().toLocaleTimeString('vi-VN'));
    } catch (e) { this.setStatus('Đồng bộ thất bại: ' + this.errMsg(e)); UI.toast('Đồng bộ thất bại: ' + this.errMsg(e)); }
    this.busy = false;
    if (this.again) { this.again = false; this.schedule(); }
  },

  setStatus(s) { this.status = s; const el = document.getElementById('cloudOut'); if (el) el.textContent = s; },
};

/* Màn hình đăng nhập */
const Login = {
  show(onDone) {
    this.onDone = onDone;
    let el = document.getElementById('loginView');
    if (!el) { el = document.createElement('div'); el.id = 'loginView'; el.className = 'login'; document.body.appendChild(el); }
    el.hidden = false;
    this.render();
    if (Cloud.redirectError) { this.message(Cloud.errMsg(Cloud.redirectError), 'bad'); Cloud.redirectError = null; }
  },
  hide() { const el = document.getElementById('loginView'); if (el) el.remove(); },
  message(text, kind) { const m = document.getElementById('loginMsg'); if (m) { m.textContent = text || ''; m.className = 'login-msg ' + (kind || ''); } },
  render() {
    const el = document.getElementById('loginView');
    el.innerHTML = `<div class="login-card">
      <div class="logo big">${I('book', 28)}</div>
      <h1>Vocab<b>IELTS</b></h1>
      <p class="muted">Đăng nhập để lưu tiến độ học riêng của bạn và dùng trên mọi thiết bị.</p>
      <button class="btn google wide" id="lgGoogle" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        Đăng nhập với Google</button>
      <div id="loginMsg" class="login-msg"></div>
    </div>`;
    document.getElementById('lgGoogle').onclick = () => this.go();
  },
  async go() {
    const btn = document.getElementById('lgGoogle'); btn.disabled = true; this.message('Đang mở cửa sổ đăng nhập Google...');
    try {
      const done = await Cloud.signInGoogle();
      if (done) { this.hide(); this.onDone(); }
    } catch (e) { this.message(Cloud.errMsg(e), 'bad'); btn.disabled = false; }
  },
  // Không kết nối được máy chủ đăng nhập
  failed(msg, retry, offline) {
    let el = document.getElementById('loginView');
    if (!el) { el = document.createElement('div'); el.id = 'loginView'; el.className = 'login'; document.body.appendChild(el); }
    el.innerHTML = `<div class="login-card"><h1>Không kết nối được</h1><p class="muted">${UI.esc(msg)}</p>
      <button class="btn primary wide" id="lgRetry">Thử lại</button>${offline ? '<button class="btn wide" id="lgOffline">Dùng tạm dữ liệu trên máy (ngoại tuyến)</button>' : ''}</div>`;
    document.getElementById('lgRetry').onclick = () => { el.remove(); retry(); };
    const o = document.getElementById('lgOffline'); if (o) o.onclick = () => { el.remove(); offline(); };
  },
};
