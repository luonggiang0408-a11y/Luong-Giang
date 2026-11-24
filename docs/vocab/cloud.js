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

  /* ---------- Gộp dữ liệu giữa các thiết bị (theo từng từ, không ghi đè cả danh sách) ---------- */
  key(w) { return (w.word || '').trim().toLowerCase(); },
  canon(words) {
    const sorted = words.slice().sort((x, y) => (this.key(x) < this.key(y) ? -1 : this.key(x) > this.key(y) ? 1 : 0));
    return JSON.stringify(sorted, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, kk) => { o[kk] = v[kk]; return o; }, {}) : v));
  },
  // Bản a có "mới hơn" bản b không: ngày ôn gần nhất, rồi thời điểm sửa, rồi số lần chấm.
  better(a, b) {
    const la = a.lastReviewed || '', lb = b.lastReviewed || '';
    if (la !== lb) return la > lb;
    const ma = a.mod || 0, mb = b.mod || 0;
    if (ma !== mb) return ma > mb;
    return (a.history || []).length >= (b.history || []).length;
  },
  mergeWord(a, b) {
    const pickA = this.better(a, b), p = pickA ? a : b, o = pickA ? b : a;
    const r = Object.assign({}, p);
    const seen = new Set(), hist = [];
    [].concat(a.history || [], b.history || []).forEach((h) => { const k = h.date + '|' + h.level; if (!seen.has(k)) { seen.add(k); hist.push(h); } });
    hist.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    r.history = hist;
    if (a.reviews !== undefined || b.reviews !== undefined) r.reviews = Math.max(a.reviews || 0, b.reviews || 0);
    if (a.lapses !== undefined || b.lapses !== undefined) r.lapses = Math.max(a.lapses || 0, b.lapses || 0);
    ['example', 'ipa', 'pos', 'audio', 'meaning'].forEach((f) => { if (!r[f] && o[f]) r[f] = o[f]; });
    if (hist.length !== (p.history || []).length) delete r.undo;
    const mod = Math.max(a.mod || 0, b.mod || 0);
    if (mod) r.mod = mod;
    return r;
  },
  // Hai từ cùng id nhưng khác tên = một từ đã bị đổi tên trên một thiết bị: giữ bản mới hơn, bỏ bản còn lại.
  dedupeById(words) {
    const byId = new Map();
    words.forEach((w) => { const o = byId.get(w.id); byId.set(w.id, !o || !w.id ? w : (this.better(w, o) ? w : o)); });
    return words.filter((w) => !w.id || byId.get(w.id) === w);
  },
  merge(localWords, remoteWords, deleted) {
    const map = new Map();
    localWords.forEach((w) => map.set(this.key(w), w));
    remoteWords.forEach((rw) => { const k = this.key(rw); const lw = map.get(k); map.set(k, lw ? this.mergeWord(lw, rw) : rw); });
    Object.keys(deleted || {}).forEach((k) => { const w = map.get(k); if (w && deleted[k] > (w.mod || 0)) map.delete(k); });
    return Array.from(map.values());
  },
  mergeArr(a, b) {
    const seen = new Set();
    return [].concat(a || [], b || []).filter((x) => { const k = JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => ((x.date || '') < (y.date || '') ? -1 : 1)).slice(-30);
  },

  async fetchRemote() {
    const meta = await this.uref().get();
    if (!meta.exists) return null;
    const snap = await this.uref().collection('chunks').orderBy('i').get();
    let words = [];
    snap.forEach((d) => { words = words.concat(JSON.parse(d.data().json)); });
    const m = meta.data();
    let deleted = {}, gen = {};
    try { deleted = JSON.parse(m.deleted || '{}'); } catch (e) { /* bỏ qua */ }
    try { gen = JSON.parse(m.gen || '{}'); } catch (e) { /* bỏ qua */ }
    return { words: words.map((w) => SRS.migrate(w)), meta: m, deleted, gen };
  },

  // Gộp bản trên đám mây vào bản trên máy này. Trả về { changed: máy này có thay đổi, needPush: đám mây cần cập nhật }.
  async sync() {
    const r = await this.fetchRemote();
    if (!r) return { changed: false, needPush: Store.data.words.length > 0, empty: true };
    const del = Object.assign({}, r.deleted, Store.data.deleted || {});
    const merged = this.merge(Store.data.words, r.words, del);
    const changed = this.canon(merged) !== this.canon(Store.data.words);
    const needPush = this.canon(merged) !== this.canon(r.words) || JSON.stringify(del) !== JSON.stringify(r.deleted);
    Store.data.deleted = del;
    Store.data.gen.speaking = this.mergeArr(Store.data.gen.speaking, r.gen.speaking);
    Store.data.gen.writing = this.mergeArr(Store.data.gen.writing, r.gen.writing);
    if (changed) {
      if (typeof Sync !== 'undefined') Sync.schedule();
      Store.data.words = merged;
      Store.data.updatedAt = Math.max(Store.data.updatedAt || 0, r.meta.updatedAt || 0);
    }
    try { localStorage.setItem(Store.KEY, JSON.stringify(Store.data)); } catch (e) { /* bỏ qua */ }
    return { changed, needPush, count: merged.length };
  },

  // Nhận và gộp dữ liệu từ đám mây. Trả về true nếu máy này có thay đổi.
  async pull() {
    if (!this.user) return false;
    try {
      const r = await this.sync();
      if (r.empty) this.setStatus('Chưa có dữ liệu trên đám mây — sẽ tải lên từ máy này.');
      else this.setStatus(r.changed ? 'Đã gộp dữ liệu từ thiết bị khác (' + r.count + ' từ).' : 'Dữ liệu đã khớp với đám mây.');
      if (r.needPush) this.schedule();
      return r.changed;
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
      // Gộp bản mới nhất trên đám mây trước khi ghi, để không đè lên việc ôn của thiết bị khác.
      const r = await this.sync();
      if (r.changed && typeof App !== 'undefined' && App.booted) { App.autoStart(); App.refresh(); }
      const words = Store.data.words;
      const chunks = [];
      for (let i = 0; i < words.length; i += this.CHUNK) chunks.push(words.slice(i, i + this.CHUNK));
      const col = this.uref().collection('chunks');
      const batch = this.db.batch();
      chunks.forEach((c, i) => batch.set(col.doc('c' + String(i).padStart(3, '0')), { i, json: JSON.stringify(c) }));
      for (let i = chunks.length; i < chunks.length + 10; i++) batch.delete(col.doc('c' + String(i).padStart(3, '0')));   // dọn phần thừa khi danh sách ngắn lại
      const gen = JSON.stringify({ speaking: Store.data.gen.speaking, writing: Store.data.gen.writing });
      batch.set(this.uref(), { updatedAt: Store.data.updatedAt || Date.now(), count: words.length, chunks: chunks.length, gen, deleted: JSON.stringify(Store.data.deleted || {}), email: this.user.email });
      await batch.commit();
      this.setStatus('Đã đồng bộ lúc ' + new Date().toLocaleTimeString('vi-VN'));
    } catch (e) { this.setStatus('Đồng bộ thất bại: ' + this.errMsg(e)); UI.toast('Đồng bộ thất bại: ' + this.errMsg(e)); }
    this.busy = false;
    if (this.again) { this.again = false; this.schedule(); }
  },

  setStatus(s) { this.status = s; const el = document.getElementById('cloudOut'); if (el) el.textContent = s; if (typeof App !== 'undefined' && App.booted) App.updateBadge(); },
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
