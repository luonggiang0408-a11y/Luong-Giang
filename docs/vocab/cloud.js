/* Đăng nhập bằng email + mật khẩu (Firebase Auth) và đồng bộ dữ liệu học riêng của từng tài khoản (Firestore).
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
      'auth/operation-not-allowed': 'Tính năng này đang tắt trong Firebase (kiểm tra Authentication → Sign-in method).',
      'permission-denied': 'Không có quyền ghi dữ liệu: kiểm tra Firestore Rules.',
    };
    return m[e && e.code] || (e && e.message) || 'Có lỗi xảy ra.';
  },

  async signIn(email, pw) { this.user = (await this.auth.signInWithEmailAndPassword(email, pw)).user; },
  async signUp(email, pw) { this.user = (await this.auth.createUserWithEmailAndPassword(email, pw)).user; },
  async reset(email) { await this.auth.sendPasswordResetEmail(email); },
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
  mode: 'in',
  show(onDone) {
    this.onDone = onDone;
    this.mode = 'in';
    let el = document.getElementById('loginView');
    if (!el) { el = document.createElement('div'); el.id = 'loginView'; el.className = 'login'; document.body.appendChild(el); }
    el.hidden = false;
    this.render();
  },
  hide() { const el = document.getElementById('loginView'); if (el) el.remove(); },
  message(text, kind) { const m = document.getElementById('loginMsg'); if (m) { m.textContent = text || ''; m.className = 'login-msg ' + (kind || ''); } },
  render() {
    const up = this.mode === 'up';
    const el = document.getElementById('loginView');
    el.innerHTML = `<form class="login-card" id="loginForm" novalidate>
      <div class="logo big">${I('book', 28)}</div>
      <h1>Vocab<b>IELTS</b></h1>
      <p class="muted">${up ? 'Tạo tài khoản để lưu tiến độ học riêng của bạn.' : 'Đăng nhập để tiếp tục việc học của bạn.'}</p>
      <label>Email<input type="email" id="lgEmail" autocomplete="username" required placeholder="ban@email.com"></label>
      <label>Mật khẩu<input type="password" id="lgPass" autocomplete="${up ? 'new-password' : 'current-password'}" required placeholder="${up ? 'Tối thiểu 6 ký tự' : 'Mật khẩu'}"></label>
      <div id="loginMsg" class="login-msg"></div>
      <button class="btn primary wide" type="submit">${up ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
      <div class="login-links">
        ${up ? '<a href="#" data-m="in">Đã có tài khoản? Đăng nhập</a>' : '<a href="#" data-m="reset">Quên mật khẩu?</a><a href="#" data-m="up">Tạo tài khoản</a>'}
      </div></form>`;
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    form.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-m]'); if (!a) return;
      e.preventDefault();
      if (a.dataset.m === 'reset') this.forgot(); else { this.mode = a.dataset.m; this.render(); }
    });
    document.getElementById('lgEmail').focus();
  },
  async submit() {
    const email = document.getElementById('lgEmail').value.trim(), pw = document.getElementById('lgPass').value;
    if (!email || !pw) { this.message('Hãy nhập email và mật khẩu.', 'bad'); return; }
    const btn = document.querySelector('#loginForm button[type=submit]'); btn.disabled = true; this.message('Đang xử lý...');
    try {
      if (this.mode === 'up') await Cloud.signUp(email, pw); else await Cloud.signIn(email, pw);
      this.hide();
      this.onDone();
    } catch (e) { this.message(Cloud.errMsg(e), 'bad'); btn.disabled = false; }
  },
  async forgot() {
    const email = document.getElementById('lgEmail').value.trim();
    if (!email) { this.message('Nhập email của bạn ở ô trên, rồi bấm “Quên mật khẩu?” lần nữa.', 'bad'); return; }
    try { await Cloud.reset(email); this.message('Đã gửi email đặt lại mật khẩu (kiểm tra cả thư rác).', 'ok'); }
    catch (e) { this.message(Cloud.errMsg(e), 'bad'); }
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
