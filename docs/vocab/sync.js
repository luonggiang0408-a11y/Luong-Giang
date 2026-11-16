/* Đồng bộ danh sách từ lên GitHub (docs/vocab/data/words.json) và nhận bài đọc do routine tạo sẵn. */
const Sync = {
  DEFAULT_REPO: 'luonggiang0408-a11y/Luong-Giang',
  PATH: 'docs/vocab/data/words.json',
  timer: null, busy: false, again: false, status: '',

  cfg() { const s = Store.data.settings; return { token: s.ghToken || '', repo: s.ghRepo || this.DEFAULT_REPO }; },
  enabled() { return !!this.cfg().token; },
  headers(raw) {
    return { Authorization: 'Bearer ' + this.cfg().token, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' };
  },
  b64(str) { return btoa(unescape(encodeURIComponent(str))); },
  setStatus(s) { this.status = s; const el = document.getElementById('syncOut'); if (el) el.textContent = s; },

  // Gọi sau mỗi lần lưu: gộp nhiều thay đổi, đẩy sau 3 giây.
  schedule() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 3000);
  },

  async push() {
    if (!this.enabled()) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      const { repo } = this.cfg();
      const url = `https://api.github.com/repos/${repo}/contents/${this.PATH}`;
      const payload = JSON.stringify({ updatedAt: Store.data.updatedAt || Date.now(), words: Store.data.words });
      const g = await fetch(url + '?ref=main&t=' + Date.now(), { headers: this.headers() });
      const sha = g.ok ? (await g.json()).sha : undefined;
      if (!g.ok && g.status !== 404) throw new Error('GitHub ' + g.status + (g.status === 401 ? ' (token sai/hết hạn)' : g.status === 403 ? ' (token thiếu quyền)' : ''));
      const r = await fetch(url, {
        method: 'PUT', headers: this.headers(),
        body: JSON.stringify({ message: 'Sync words', content: this.b64(payload), branch: 'main', sha }),
      });
      if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + ((await r.json().catch(() => ({}))).message || ''));
      this.setStatus('✅ Đã đồng bộ lúc ' + new Date().toLocaleTimeString('vi-VN'));
    } catch (e) { this.setStatus('❌ ' + e.message); UI.toast('Đồng bộ thất bại: ' + e.message); }
    this.busy = false;
    if (this.again) { this.again = false; this.schedule(); }
  },

  // Nhận danh sách từ mới hơn từ GitHub (dùng khi mở trên thiết bị khác). Trả về true nếu có thay đổi.
  async pull() {
    try {
      let remote;
      if (this.enabled()) {
        const r = await fetch(`https://api.github.com/repos/${this.cfg().repo}/contents/${this.PATH}?ref=main&t=${Date.now()}`, { headers: this.headers(true) });
        if (!r.ok) return false;
        remote = await r.json();
      } else {
        const r = await fetch('data/words.json?t=' + Date.now());
        if (!r.ok) return false;
        remote = await r.json();
      }
      if (!remote || !Array.isArray(remote.words)) return false;
      const local = Store.data.updatedAt || 0;
      if ((remote.updatedAt || 0) > local || (!Store.data.words.length && remote.words.length)) {
        Store.data.words = remote.words.map((w) => SRS.migrate(w));
        Store.data.updatedAt = remote.updatedAt || Date.now();
        localStorage.setItem(Store.KEY, JSON.stringify(Store.data));
        return true;
      }
    } catch (e) { /* offline hoặc chưa có file: bỏ qua */ }
    return false;
  },

  // Bài đọc do routine tạo lúc 4:30 sáng: data/reading/YYYY-MM-DD.json
  async fetchReading(date) {
    try {
      const r = await fetch(`data/reading/${date}.json?t=${Date.now()}`);
      if (!r.ok) return null;
      const j = await r.json();
      return j && Array.isArray(j.passages) && j.passages.length ? j : null;
    } catch (e) { return null; }
  },
};
