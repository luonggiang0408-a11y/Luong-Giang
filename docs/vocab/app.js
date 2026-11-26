/* Giao diện chính: Từ vựng, Ôn hôm nay, Bài đọc, Cài đặt */
const App = {
  tab: 'review',
  hideMeaning: false,
  editing: null,

  // Khởi động: nếu đã bật đăng nhập (firebase-config.js) thì yêu cầu đăng nhập trước.
  async init() {
    if (!Cloud.enabled()) { this.boot(); return; }
    UI.$('#view').innerHTML = '<div class="empty">Đang kiểm tra đăng nhập...</div>';
    try {
      const u = await Cloud.init();
      if (u) this.boot(); else Login.show(() => this.boot());
    } catch (e) {
      const uid = (() => { try { return localStorage.getItem('vocabApp.lastUid'); } catch (x) { return null; } })();
      Login.failed(e.message || 'Lỗi kết nối.', () => this.init(), uid ? () => { Cloud.bindStore(uid); this.boot(true); } : null);
    }
  },

  booted: false,

  // So sánh phiên bản đang chạy với index.html mới nhất trên máy chủ; khác thì tự tải lại.
  async checkUpdate() {
    if (location.protocol === 'file:' || Date.now() - (this.lastCheck || 0) < 60000) return;
    this.lastCheck = Date.now();
    try {
      const r = await fetch('index.html?t=' + Date.now(), { cache: 'no-store' });
      const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(await r.text());
      if (m && m[1] !== window.APP_VERSION) {
        const b = document.createElement('div'); b.className = 'upd'; b.textContent = 'Có phiên bản mới — đang cập nhật...';
        document.body.appendChild(b);
        try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { /* bỏ qua */ }
        setTimeout(() => location.reload(), 900);
      }
    } catch (e) { /* ngoại tuyến */ }
  },

  boot(offline) {
    if (Cloud.user && !offline) Cloud.bindStore(Cloud.user.uid); else if (!offline) Store.load();
    if (this.booted) { this.autoStart(); this.go(this.tab); return; }
    this.booted = true;
    this.autoStart();
    TTS.init();
    UI.$('#logo').innerHTML = I('book', 22);
    UI.$('#searchIc').innerHTML = I('search', 16);
    UI.$('#globalSearch').addEventListener('input', (ev) => { this.wordQuery = ev.target.value; this.wordPage = 0; if (this.tab !== 'words') this.go('words'); else this.render(); const n = UI.$('#globalSearch'); n.focus(); });
    UI.$$('#tabs button').forEach((b) => { b.insertAdjacentHTML('afterbegin', I(b.dataset.icon, 20)); b.addEventListener('click', () => this.go(b.dataset.tab)); });
    document.addEventListener('click', (e) => this.onClick(e));
    this.go(location.hash.slice(1) || 'review');
    this.checkUpdate();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.checkUpdate(); });
    if (Cloud.user && !offline) {
      Cloud.pull().then((changed) => { if (changed) { this.autoStart(); this.render(); } if (Sync.enabled()) Sync.schedule(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Cloud.user) Cloud.pull().then((c) => { if (c) { this.autoStart(); this.render(); } }); });
    } else {
      Sync.pull().then((changed) => { if (changed) { this.autoStart(); this.render(); } });
    }
  },

  // Từ thêm từ hôm trước mà chưa đánh dấu mức nhớ → mặc định "Chưa nhớ", tính lịch từ ngày thêm.
  autoStart() {
    const t = SRS.today();
    let n = 0;
    Store.data.words.forEach((w) => {
      if (SRS.isNew(w) && w.added && w.added < t) { SRS.rate(w, 0, w.added); w.lapses = 0; n++; }
    });
    if (n) Store.save();
  },

  go(tab) {
    TTS.stop(); this.reader.state = 'idle'; this.reader.idx = 0;
    if (!this.views[tab]) tab = 'review';
    this.tab = tab;
    location.hash = tab;
    const titles = { review: 'Ôn tập hôm nay', words: 'Kho từ vựng', reading: 'Bài đọc B1+/B2', settings: 'Cài đặt & đồng bộ' };
    UI.$('#pageTitle').textContent = titles[tab] || '';
    UI.$$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.render();
  },

  closeTip() { const tp = UI.$('#wtip'); if (tp) tp.remove(); this.tipFor = null; },

  render() {
    this.closeTip();
    const v = this.views[this.tab].call(this);
    UI.$('#view').innerHTML = v.html;
    if (v.after) v.after.call(this);
    this.updateBadge();
  },

  updateBadge() {
    const t = SRS.today();
    const due = this.dueWords().length;
    const b = UI.$('#tabs [data-tab="review"] .badge');
    if (b) { b.textContent = due; b.style.display = due ? '' : 'none'; }
    const dn = SRS.dayName ? SRS.dayName(t) : '';
    UI.$('#todayLabel').textContent = dn + ' ' + SRS.fmt(t);
    const doneToday = this.words().filter((w) => w.lastReviewed === t && !SRS.isNew(w)).length;
    const total = doneToday + due;
    const pct = total ? Math.round(doneToday / total * 100) : 100;
    const tp = UI.$('#topProg');
    if (tp) tp.innerHTML = `<span class="pill ok">${I('check', 14)} ${this.words().length} từ</span><div class="tp"><small>Đã ôn: ${doneToday} / ${total} (${pct}%)</small><div class="track"><i style="width:${pct}%"></i></div></div>`;
    const su = UI.$('#sideUser');
    if (su) {
      const email = Cloud.user ? (Cloud.user.email || '') : '';
      const st = Cloud.user ? (Cloud.status || 'Đã đăng nhập') : 'Chế độ ngoại tuyến';
      su.innerHTML = `<div class="su-id"><span class="av">${UI.esc((email[0] || '?').toUpperCase())}</span><div><b>${UI.esc(email || 'Chưa đăng nhập')}</b><small><i class="sdot ${Cloud.user ? 'on' : ''}"></i>${UI.esc(st.length > 38 ? st.slice(0, 36) + '…' : st)}</small></div></div>
        <button class="btn sbtn" data-act="gotoSync">${I('cloud', 15)} Kiểm tra đồng bộ</button>
        <button class="btn sbtn" data-act="refreshApp">${I('repeat', 15)} Làm mới ứng dụng</button>
        <div class="verline">Phiên bản ${UI.esc(window.APP_VERSION || '')}</div>`;
    }
  },

  words() { return Store.data.words; },
  byId(id) { return this.words().find((w) => w.id === id); },
  newWords() { return this.words().filter(SRS.isNew); },
  dueWords() {
    const t = SRS.today();
    return this.words().filter((w) => SRS.isDue(w, t)).sort((a, b) => a.schedule[0].localeCompare(b.schedule[0]) || a.level - b.level);
  },

  /* ---------- Thành phần dùng chung ---------- */
  wordCard(w, { rating = true, due = false } = {}) {
    const t = SRS.today();
    const over = due && w.schedule.length ? SRS.diffDays(t, w.schedule[0]) : 0;
    const lv = SRS.isNew(w) ? null : SRS.LEVELS[w.level];
    return `<div class="wcard" data-id="${w.id}">
      <div class="whead">
        <button class="spk" data-act="speak" title="Nghe phát âm" aria-label="Nghe phát âm">${I('volume', 16)}</button>
        <span class="wterm">${UI.esc(w.word)}</span>
        ${w.ipa ? `<span class="ipa">${UI.esc(w.ipa)}</span>` : ''}
        ${w.pos ? `<span class="pos">${UI.esc(UI.posAbbr(w.pos))}</span>` : ''}
        ${lv ? `<span class="tag ${lv.cls}">${lv.short}</span>` : '<span class="tag new">Mới</span>'}
        ${over > 0 ? `<span class="tag late">quá hạn ${over} ngày</span>` : ''}
        ${w.lapses ? `<span class="tag lap" title="Số lần quên">quên ${w.lapses}×</span>` : ''}
      </div>
      <div class="mean ${this.hideMeaning && due ? 'blur' : ''}" data-act="reveal">${UI.esc(w.meaning)}</div>
      ${w.example ? `<div class="ex">“${UI.esc(w.example)}”</div>` : ''}
      ${rating ? `<div class="rate">${this.rateButtons(w)}</div><div class="rate2" hidden></div>` : ''}
    </div>`;
  },

  rateButtons(w) {
    return SRS.GROUPS.map((g, i) => `<button class="lv ${g.cls}" data-act="rateGroup" data-g="${i}" title="${g.name}: nhắc lại sau ${SRS.DAYS[i * 2]} hoặc ${SRS.DAYS[i * 2 + 1]} ngày">
        <b>${g.short}</b><small>${SRS.DAYS[i * 2]}d · ${SRS.DAYS[i * 2 + 1]}d</small></button>`).join('');
  },

  onClick(e) {
    if (!e.target.closest('#wtip') && !e.target.closest('mark[data-act]')) this.closeTip();
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const card = el.closest('.wcard');
    const w = card ? this.byId(card.dataset.id) : null;
    if (act === 'speak' && w) TTS.speakWord(w);
    else if (act === 'reveal') el.classList.remove('blur');
    else if (act === 'rate' && w) this.doRate(w, +el.dataset.lv, card);
    else if (this.actions[act]) this.actions[act].call(this, el, e);
  },

  doRate(w, lv, card) {
    const sched = SRS.rate(w, lv, SRS.today());
    Store.save();
    const l = SRS.LEVELS[lv];
    const next = w.mastered ? 'Đã hoàn thành chu kỳ ôn' : 'Nhắc lại: ' + sched.map(SRS.fmtFull).join(' và ');
    card.classList.add('done');
    { const r2 = UI.$('.rate2', card); if (r2) r2.remove(); }
    UI.$('.rate', card).outerHTML = `<div class="rated"><span class="tag ${l.cls}">${l.short}</span> ✓ ${next} <button class="btn ghost sm" data-act="unrate">Chấm lại</button></div>`;
    UI.$('.mean', card).classList.remove('blur');
    this.updateBadge();
    const left = UI.$$('.wcard:not(.done)', UI.$('#dueList') || document.createElement('div')).length;
    const c = UI.$('#dueCount'); if (c) c.textContent = left;
  },

  /* ---------- Các màn hình ---------- */
  views: {},
  actions: {},
};

/* ======================= TỪ VỰNG ======================= */
App.views.words = function () {
  const nw = this.newWords().slice().reverse();
  const all = this.words();
  const q = (this.wordQuery || '').toLowerCase();
  // Từ thêm gần nhất xếp trước; cùng ngày thì từ nhập sau xếp trước.
  const filtered = all.map((w, i) => ({ w, i })).filter(({ w }) => !q || (w.word + ' ' + w.meaning + ' ' + (w.example || '')).toLowerCase().includes(q))
    .sort((x, y) => (y.w.added || '').localeCompare(x.w.added || '') || y.i - x.i).map(({ w }) => w);
  const size = this.pageSize === 20 ? 20 : 10;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.max(0, Math.min(pages - 1, this.wordPage || 0));
  this.wordPage = page;
  const pageRows = filtered.slice(page * size, page * size + size);
  const e = this.editing ? this.byId(this.editing) : null;
  const html = `
  <section class="panel">
    <h2>${I('book')} Từ vựng cần học hôm nay <span class="count">${nw.length}</span></h2>
    <p class="muted">Học từ → tự nhớ nghĩa → bấm mức nhớ. Lịch ôn bắt đầu tính từ hôm nay.</p>
    ${nw.length ? nw.map((w) => this.wordCard(w)).join('') : `<div class="empty">Chưa có từ mới. Thêm từ ở bên dưới${all.length ? '' : ' hoặc <button class="btn" data-act="sample">nạp 10 từ mẫu</button>'}.</div>`}
  </section>

  <section class="panel">
    <h2>${e ? `${I('pen')} Sửa từ` : `${I('plus')} Thêm từ mới`}</h2>
    <form id="wordForm" class="grid2">
      <label>Từ vựng<input name="word" required value="${UI.esc(e ? e.word : '')}"></label>
      <label>Phiên âm<input name="ipa" placeholder="/ˈsæmpl/" value="${UI.esc(e ? e.ipa : '')}"></label>
      <label>Từ loại<input name="pos" placeholder="n / v / adj / adv / phr" value="${UI.esc(e ? e.pos : '')}"></label>
      <label>Nghĩa tiếng Việt<input name="meaning" required value="${UI.esc(e ? e.meaning : '')}"></label>
      <label class="span2">Ví dụ (không bắt buộc)<input name="example" value="${UI.esc(e ? e.example : '')}"></label>
      <input type="hidden" name="audio" value="${UI.esc(e ? e.audio : '')}">
      <div class="row span2">
        <button type="button" class="btn" data-act="lookup">Tự điền phiên âm + phát âm</button>
        <button class="btn primary">${e ? 'Lưu' : 'Thêm từ'}</button>
        ${e ? '<button type="button" class="btn ghost" data-act="cancelEdit">Huỷ</button>' : ''}
      </div>
    </form>
    <details class="import">
      <summary>Nhập nhiều từ cùng lúc (dán từ Google Sheet / Excel)</summary>
      <p class="muted">Mỗi dòng một từ, cột cách nhau bằng Tab hoặc dấu <code>|</code>: <b>từ | phiên âm | từ loại | nghĩa | ví dụ</b> (cột ví dụ không bắt buộc; nếu từ đã có mà chưa có ví dụ thì chỉ bổ sung ví dụ).
      Có thể dán thẳng các cột A–H của tab “Vocabulary” (Mức nhớ, Ngày bắt đầu, Từ, Phiên âm, Từ loại, Định nghĩa, Ví dụ, Ngày đánh dấu) — mức nhớ và lịch ôn sẽ được giữ lại.</p>
      <textarea id="importBox" rows="6" class="mono"></textarea>
      <div class="row"><label class="btn">Chọn file .txt / .csv<input type="file" id="importFile2" accept=".txt,.tsv,.csv" hidden></label><span class="muted" id="importInfo"></span></div>
      <button class="btn" data-act="import">Nhập</button>
    </details>
  </section>

  <section class="panel">
    <h2>${I('folder')} Tất cả từ <span class="count">${all.length}</span></h2>
    <input id="wordSearch" class="search" placeholder="Tìm từ hoặc nghĩa..." value="${UI.esc(this.wordQuery || '')}">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Từ</th><th>Phiên âm</th><th>Loại</th><th>Nghĩa</th><th>Ví dụ</th><th>Ngày thêm</th><th></th></tr></thead>
      <tbody>${pageRows.map((w) => {
        return `<tr class="wcard-row" data-id="${w.id}"><td><button class="spk sm" data-act="speakRow">${I('volume', 16)}</button> <b>${UI.esc(w.word)}</b></td><td>${UI.esc(w.ipa)}</td><td>${UI.esc(UI.posAbbr(w.pos))}</td><td>${UI.esc(w.meaning)}</td>
        <td class="excell">${w.example ? `<button class="spk sm" data-act="speakEx" aria-label="Nghe câu ví dụ">${I('volume', 16)}</button> <span class="exs">${UI.esc(w.example)}</span>` : '<a href="#" class="muted" data-act="editRow">+ thêm ví dụ</a>'}</td>
        <td class="nowrap">${w.added ? SRS.fmtFull(w.added) : '—'}</td>
        <td class="nowrap"><button class="icon" data-act="editRow" title="Sửa">${I('pen', 16)}</button><button class="icon" data-act="delRow" title="Xoá">${I('trash', 16)}</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">Không có từ nào.</td></tr>'}</tbody>
    </table></div>
    <div class="row pager">
      <button class="btn sm" data-act="pagePrev" ${page === 0 ? 'disabled' : ''}>◀ Quay lại</button>
      <span class="muted">Trang ${page + 1}/${pages} · ${filtered.length} từ</span>
      <button class="btn sm" data-act="pageNext" ${page >= pages - 1 ? 'disabled' : ''}>Trang sau ▶</button>
      <label class="muted">Hiển thị <select id="pageSize"><option value="10" ${size === 10 ? 'selected' : ''}>10</option><option value="20" ${size === 20 ? 'selected' : ''}>20</option></select> từ/trang</label>
    </div>
  </section>`;
  return {
    html,
    after() {
      UI.$('#pageSize').addEventListener('change', (ev) => { this.pageSize = +ev.target.value; this.wordPage = 0; this.render(); });
      const s = UI.$('#wordSearch');
      s.addEventListener('input', () => { this.wordQuery = s.value; this.wordPage = 0; const pos = s.selectionStart; this.render(); const n = UI.$('#wordSearch'); n.focus(); n.setSelectionRange(pos, pos); });
      UI.$('#importFile2').addEventListener('change', (ev) => {
        const f = ev.target.files[0]; if (!f) return;
        f.text().then((txt) => { UI.$('#importBox').value = txt; UI.$('#importInfo').textContent = f.name + ': ' + txt.split(/\r?\n/).filter((l) => l.trim()).length + ' dòng. Bấm “Nhập” để hoàn tất.'; });
      });
      UI.$('#wordForm').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.target).entries());
        if (this.editing) {
          const cur = this.byId(this.editing), oldKey = (cur.word || '').trim().toLowerCase();
          Object.assign(cur, f, { mod: Date.now() });
          if (oldKey && oldKey !== cur.word.trim().toLowerCase()) Store.data.deleted[oldKey] = Date.now();
          this.editing = null; UI.toast('Đã lưu');
        }
        else if (!Store.addWord(f)) { UI.toast('Từ này đã có trong danh sách'); return; }
        else UI.toast('Đã thêm “' + f.word + '”');
        Store.save(); this.render();
      });
    },
  };
};

const SAMPLE = [
  ['mitigate', '/ˈmɪtɪɡeɪt/', 'v', 'làm giảm nhẹ, giảm thiểu', 'Trees help mitigate the effects of air pollution.'],
  ['reluctant', '/rɪˈlʌktənt/', 'adj', 'miễn cưỡng, ngần ngại', 'She was reluctant to speak in front of the class.'],
  ['sustainable', '/səˈsteɪnəbl/', 'adj', 'bền vững', ''],
  ['inevitable', '/ɪnˈevɪtəbl/', 'adj', 'không thể tránh khỏi', ''],
  ['contribute to', '/kənˈtrɪbjuːt tuː/', 'phr v', 'góp phần vào, dẫn đến', ''],
  ['overwhelming', '/ˌəʊvəˈwelmɪŋ/', 'adj', 'áp đảo, quá sức', ''],
  ['constantly', '/ˈkɒnstəntli/', 'adv', 'liên tục', ''],
  ['face up to', '/feɪs ʌp tuː/', 'phr v', 'đối mặt, chấp nhận (sự thật khó chịu)', ''],
  ['tackle', '/ˈtækl/', 'v', 'giải quyết (vấn đề), xử lý', ''],
  ['crucial', '/ˈkruːʃl/', 'adj', 'then chốt, cực kỳ quan trọng', ''],
];

App.syncBanner = function () {
  if (Sync.enabled() || Cloud.user) return '';
  return `<div class="banner warn">${I('cloud')}<div><b>Chưa kết nối GitHub.</b> Danh sách từ chưa được lưu lên GitHub nên bài đọc tự động lúc 5:00 sáng sẽ không có dữ liệu, và bạn sẽ không thấy từ khi mở trên máy khác.</div><button class="btn primary sm" data-act="gotoSettings">Kết nối ngay</button></div>`;
};
App.actions.gotoSync = function () { this.go('settings'); };
App.actions.gotoSettings = function () { this.go('settings'); setTimeout(() => { const el = UI.$('#ghToken'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); } }, 50); };
App.levelSelect = function (w) {
  return `<select class="lvsel ${SRS.LEVELS[w.level].cls}" data-change="rerate" aria-label="Đổi mức đã chấm">${SRS.LEVELS.map((l, i) => `<option value="${i}" ${i === w.level ? 'selected' : ''}>${l.short}</option>`).join('')}</select>`;
};
App.ratedRow = function (w) {
  const l = SRS.LEVELS[w.level];
  return `<div class="wcard done rrow" data-id="${w.id}"><div class="whead">
    <button class="spk" data-act="speak" aria-label="Nghe phát âm">${I('volume', 16)}</button>
    <span class="wterm">${UI.esc(w.word)}</span>${this.levelSelect(w)}
    <span class="muted nxt" data-prefix="nhắc lại ">${w.mastered ? 'xong chu kỳ' : 'nhắc lại ' + SRS.fmtFull(w.schedule[0] || SRS.today())}</span>
    ${w.undo && w.undo.on === SRS.today() ? '<button class="btn ghost sm" data-act="unrate">Chấm lại</button>' : ''}</div></div>`;
};
App.actions.unrate = function (el) {
  const card = el.closest('[data-id]'); const w = card && this.byId(card.dataset.id);
  if (!w) return;
  if (!SRS.unrate(w, SRS.today())) { UI.toast('Không hoàn tác được lần chấm này.'); return; }
  Store.save();
  const y = window.scrollY;
  this.render();
  window.scrollTo(0, y);
  UI.toast('Đã hoàn tác. Hãy chọn lại mức nhớ cho “' + w.word + '”.');
};

App.listModal = function (title, hint, head, rows, extra) {
  const old = UI.$('#listModal'); if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'listModal'; el.className = 'modal'; el.dataset.act = 'closeModal';
  el.innerHTML = `<div class="modal-box wide">
    <div class="fc-top"><h3 style="margin:0">${title}</h3><button class="icon" data-act="closeModal" title="Đóng (Esc)">${I('x', 16)}</button></div>
    <p class="muted">${hint}</p>
    ${extra || ''}
    <input class="search" placeholder="Lọc theo từ hoặc nghĩa..." data-filter>
    <div class="table-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="muted">Không có từ nào.</td></tr>`}</tbody></table></div>
  </div>`;
  document.body.appendChild(el);
  const inp = UI.$('[data-filter]', el);
  inp.addEventListener('input', () => { const q = inp.value.toLowerCase(); UI.$$('tbody tr', el).forEach((tr) => { tr.hidden = !!q && !tr.textContent.toLowerCase().includes(q); }); });
};
App.actions.closeModal = function (el, e) { if (el.id === 'listModal' && e && e.target !== el) return; const m = UI.$('#listModal'); if (m) m.remove(); if (this.dirty) this.refresh(); };
App.actions.showDue = function () {
  const t = SRS.today();
  const rows = this.dueWords().map((w) => {
    const l = SRS.LEVELS[w.level], d = SRS.diffDays(t, w.schedule[0]);
    return `<tr><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(w.meaning)}</td><td><span class="tag ${l.cls}">${l.short}</span></td><td>${SRS.fmtFull(w.schedule[0])}</td><td>${d > 0 ? `<span class="tag late">quá hạn ${d} ngày</span>` : 'hôm nay'}</td></tr>`;
  }).join('');
  this.listModal('Từ cần ôn hôm nay (' + this.dueWords().length + ')', 'Sắp xếp theo ngày hẹn. Ôn xong ở danh sách bên dưới hoặc bằng flashcard.', ['Từ', 'Nghĩa', 'Mức hiện tại', 'Ngày hẹn', 'Trạng thái'], rows);
};
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-change="rerate"]');
  if (!el) return;
  const holder = el.closest('[data-id]'); const w = holder && App.byId(holder.dataset.id);
  if (!w) return;
  SRS.rerate(w, +el.value);
  Store.save();
  el.className = 'lvsel ' + SRS.LEVELS[w.level].cls;
  const nx = UI.$('.nxt', holder);
  if (nx) nx.textContent = (nx.dataset.prefix || '') + (w.schedule[0] ? SRS.fmtFull(w.schedule[0]) : '—');
  UI.toast('Đã đổi “' + w.word + '” sang ' + SRS.LEVELS[w.level].short + ' — nhắc lại ' + SRS.fmtFull(w.schedule[0]));
  App.dirty = true;
  App.updateBadge();
  if (!UI.$('#listModal')) App.refresh();
});
App.refresh = function () { const y = window.scrollY; this.dirty = false; this.render(); window.scrollTo(0, y); };
App.actions.histDay = function (el) { this.actions.showHistory.call(this, el.dataset.d); };
App.actions.showHistory = function (arg) {
  const d = typeof arg === 'string' ? arg : SRS.today();
  const perDay = {};
  this.words().forEach((w) => (w.history || []).forEach((h) => { perDay[h.date] = (perDay[h.date] || 0) + 1; }));
  const days = Object.keys(perDay).sort().reverse().slice(0, 21);
  if (!days.includes(d)) days.unshift(d);
  const chips = `<div class="chips">${days.map((x) => `<button class="chip dayc ${x === d ? 'on' : ''}" data-act="histDay" data-d="${x}">${SRS.fmt(x)} · ${perDay[x] || 0}</button>`).join('')}</div>`;
  const items = [];
  this.words().forEach((w) => {
    const hs = (w.history || []).filter((h) => h.date === d);
    if (hs.length) items.push({ w, lv: hs[hs.length - 1].level });
  });
  const rows = items.map(({ w, lv }) => {
    const l = SRS.LEVELS[Math.max(0, Math.min(SRS.LEVELS.length - 1, lv))];
    const next = w.lastReviewed === d && w.schedule[0] ? SRS.fmtFull(w.schedule[0]) : (w.mastered && w.lastReviewed === d ? 'xong chu kỳ' : '—');
    const editable = w.lastReviewed === d && !SRS.isNew(w);
    return `<tr data-id="${w.id}"><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(w.meaning)}</td><td>${editable ? this.levelSelect(w) : `<span class="tag ${l.cls}">${l.short}</span>`}</td><td class="nxt">${next}</td></tr>`;
  }).join('');
  this.listModal('Từ đã ôn ngày ' + SRS.fmtFull(d) + ' (' + items.length + ')', 'Chọn ngày để xem lại. Muốn đổi mức đã chấm, chọn mức khác ở cột “Mức đã chọn” — lịch ôn tiếp theo được tính lại từ ngày chấm đó. (Chỉ sửa được lần chấm gần nhất của từ.)', ['Từ', 'Nghĩa', 'Mức đã chọn', 'Ôn tiếp'], rows, chips);
};
App.actions.showNew = function () {
  const ws = this.newWords();
  const rows = ws.map((w) => `<tr><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(UI.posAbbr(w.pos))}</td><td>${UI.esc(w.meaning)}</td><td>${w.added ? SRS.fmtFull(w.added) : '—'}</td></tr>`).join('');
  this.listModal('Từ mới chưa học (' + ws.length + ')', 'Các từ đã thêm nhưng chưa đánh dấu mức nhớ. Vào tab “Từ vựng” để học và đánh dấu; từ thêm từ hôm trước mà chưa đánh dấu sẽ tự vào danh sách ôn.', ['Từ', 'Loại', 'Nghĩa', 'Ngày thêm'], rows);
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = UI.$('#listModal'); if (m) { m.remove(); if (App.dirty) App.refresh(); } } });
App.actions.gotoTrack = function () { const p = UI.$('#trackPanel'); if (p) { p.scrollIntoView({ behavior: 'smooth' }); UI.$$('details.trk', p).forEach((d) => { d.open = true; }); } };
App.actions.rateGroup = function (el) {
  const card = el.closest('.wcard'), g = +el.dataset.g, t = SRS.today();
  UI.$$('.rate .lv', card).forEach((b) => b.classList.toggle('sel', b === el));
  const box = UI.$('.rate2', card);
  box.hidden = false;
  box.innerHTML = [g * 2, g * 2 + 1].map((i) => {
    const l = SRS.LEVELS[i];
    return `<button class="lv2 ${l.cls}" data-act="rate" data-lv="${i}"><b>Sau ${l.days} ngày</b><small>${SRS.fmtFull(SRS.addDays(t, l.days))}</small></button>`;
  }).join('');
};
App.actions.sample = function () {
  SAMPLE.forEach(([word, ipa, pos, meaning, example]) => Store.addWord({ word, ipa, pos, meaning, example }));
  Store.save(); this.render();
};
App.actions.pagePrev = function () { this.wordPage = (this.wordPage || 0) - 1; this.render(); const p = UI.$('.pager'); if (p) p.scrollIntoView({ block: 'center' }); };
App.actions.pageNext = function () { this.wordPage = (this.wordPage || 0) + 1; this.render(); const p = UI.$('.pager'); if (p) p.scrollIntoView({ block: 'center' }); };
App.actions.speakRow = function (el) { const w = this.byId(el.closest('tr').dataset.id); if (w) TTS.speakWord(w); };
App.actions.speakEx = function (el) { const w = this.byId(el.closest('tr').dataset.id); if (w && w.example) TTS.speakExample(w.example); };
App.actions.editRow = function (el, e) { if (e) e.preventDefault(); this.editing = el.closest('tr').dataset.id; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
App.actions.cancelEdit = function () { this.editing = null; this.render(); };
App.actions.delRow = function (el) {
  const w = this.byId(el.closest('tr').dataset.id);
  if (w && confirm('Xoá từ “' + w.word + '” và toàn bộ lịch ôn của nó?')) { Store.data.words = this.words().filter((x) => x !== w); Store.data.deleted[w.word.trim().toLowerCase()] = Date.now(); Store.save(); this.render(); }
};

App.actions.lookup = async function () {
  const f = UI.$('#wordForm');
  const word = f.word.value.trim();
  if (!word) { UI.toast('Nhập từ trước đã'); return; }
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    if (!r.ok) throw new Error('not found');
    const en = (await r.json())[0];
    const ph = en.phonetics || [];
    const ipa = en.phonetic || (ph.find((p) => p.text) || {}).text || '';
    const au = (ph.find((p) => p.audio && /-us/.test(p.audio)) || ph.find((p) => p.audio) || {}).audio || '';
    if (ipa && !f.ipa.value) f.ipa.value = ipa;
    if (au) f.audio.value = au;
    if (en.meanings && en.meanings[0] && !f.pos.value) f.pos.value = UI.posAbbr(en.meanings[0].partOfSpeech);
    UI.toast(au ? 'Đã điền phiên âm và phát âm' : 'Đã điền phiên âm (dùng giọng đọc của trình duyệt)');
  } catch (e) { UI.toast('Không tra được (cụm từ hoặc không có mạng). Tự nhập phiên âm nhé.'); }
};

App.actions.import = function () {
  // Không trim dòng: ô "mức nhớ" để trống ở đầu dòng là hợp lệ (từ chưa đánh dấu).
  const lines = UI.$('#importBox').value.split(/\r?\n/).filter((l) => l.trim());
  const levelNames = SRS.GROUPS.map((g) => g.name.toLowerCase());
  const dmy = (x) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec((x || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const t = SRS.today();
  let added = 0, skipped = 0, fresh = 0, filled = 0;
  lines.forEach((line) => {
    const p = line.split(/\t/).length >= 4 ? line.split(/\t/).map((x) => x.trim()) : line.split(/\s\|\s|\|/).map((x) => x.trim());
    if (p[2] === 'Từ mới' || p[1] === 'Ngày bắt đầu' || /^(từ|word|từ mới)$/i.test(p[0])) return; // dòng tiêu đề
    const g = levelNames.indexOf((p[0] || '').toLowerCase());
    const sheetRow = p.length >= 6 && (g >= 0 || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(p[1] || ''));
    // Từ đã có mà chưa có ví dụ: chỉ bổ sung ví dụ (không đụng vào lịch ôn).
    const wordKey = ((sheetRow ? p[2] : p[0]) || '').toLowerCase(), exNew = (sheetRow ? p[6] : p[4]) || '';
    const existing = wordKey && this.words().find((x) => x.word.toLowerCase() === wordKey);
    if (existing) { if (exNew && !existing.example) { existing.example = exNew; existing.mod = Date.now(); filled++; } else skipped++; return; }
    let w = null;
    if (sheetRow) {
      if (!p[2]) { skipped++; return; }
      const start = dmy(p[1]), marked = dmy(p[7]), next = dmy(p[9]);
      const base = { word: p[2], ipa: p[3], pos: p[4], meaning: p[5], example: p[6] || '', added: start || marked || t };
      if (g < 0) { w = Store.addWord(base); if (w) fresh++; }               // chưa đánh dấu: từ mới
      else {
        // Mốc = bước gần nhất với khoảng cách (ngày đánh dấu → ngày ôn kế tiếp) trong 2 mốc của nhóm.
        const gap = marked && next ? SRS.diffDays(next, marked) : null;
        const cand = [g * 2, g * 2 + 1];
        const li = gap === null ? cand[0] : cand.reduce((x, y) => (Math.abs(SRS.DAYS[y] - gap) < Math.abs(SRS.DAYS[x] - gap) ? y : x));
        const last = marked || t;
        w = Store.addWord(Object.assign(base, { level: li, lastReviewed: last, history: [{ date: last, level: li }], schedule: next ? [next] : SRS.plan(li, last) }));
      }
    } else if (p[0] && p.length >= 2) {
      const [word, ipa, pos, meaning] = p.length >= 4 ? p : [p[0], '', '', p[1]];
      w = Store.addWord({ word, ipa, pos, meaning, example: p[4] || '' });
      if (w) fresh++;
    }
    if (w) added++; else skipped++;
  });
  Store.save();
  UI.toast(`Đã nhập ${added} từ (${added - fresh} có lịch ôn, ${fresh} từ mới)` + (filled ? `, bổ sung ví dụ cho ${filled} từ` : '') + `. Bỏ qua ${skipped} dòng (trùng hoặc sai định dạng).`);
  this.render();
};

/* ======================= ÔN HÔM NAY ======================= */
App.dueFilter = 'all';
App.duePage = 0;
App.dueSize = 10;
App.selLevel = null;

App.levelCounts = function () {
  const active = this.words().filter((w) => !SRS.isNew(w) && !w.mastered);
  return SRS.LEVELS.map((l, i) => active.filter((w) => w.level === i));
};

// Biểu đồ đường: số từ ở từng mốc 1d … 120d
App.levelChart = function (counts, sel) {
  const W = 520, H = 170, px = 28, top = 18, bot = 26;
  const max = Math.max(1, ...counts);
  const x = (i) => px + i * ((W - 2 * px) / (counts.length - 1));
  const y = (n) => top + (H - top - bot) * (1 - n / max);
  const pts = counts.map((n, i) => [x(i), y(n)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${x(counts.length - 1)} ${H - bot} L${x(0)} ${H - bot} Z`;
  return `<svg class="lchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Số từ ở từng mốc ôn">
    <path d="${area}" class="la"/><path d="${line}" class="ll"/>
    ${pts.map((p, i) => `<g class="${i === sel ? 'on' : ''}"><circle cx="${p[0]}" cy="${p[1]}" r="${i === sel ? 6 : 4}"/><text x="${p[0]}" y="${H - 8}" text-anchor="middle">${SRS.DAYS[i]}d</text></g>`).join('')}
    <line x1="${pts[sel][0]}" x2="${pts[sel][0]}" y1="${pts[sel][1]}" y2="${H - bot}" class="lsel"/>
    <text x="${pts[sel][0]}" y="${Math.max(12, pts[sel][1] - 10)}" text-anchor="middle" class="lval">${counts[sel]}</text>
  </svg>`;
};

App.duePager = function (total) {
  const size = this.dueSize === 20 ? 20 : 10;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(pages - 1, this.duePage || 0));
  this.duePage = page;
  return { size, pages, page, html: `<div class="row pager">
      <button class="btn sm" data-act="duePrev" ${page === 0 ? 'disabled' : ''}>◀ Quay lại</button>
      <span class="muted">Trang ${page + 1}/${pages} · ${total} từ</span>
      <button class="btn sm" data-act="dueNext" ${page >= pages - 1 ? 'disabled' : ''}>Trang sau ▶</button>
      <label class="muted">Hiển thị <select id="dueSize"><option value="10" ${size === 10 ? 'selected' : ''}>10</option><option value="20" ${size === 20 ? 'selected' : ''}>20</option></select> từ/trang</label></div>` };
};

App.views.review = function () {
  const t = SRS.today();
  const due = this.dueWords();
  const words = this.words();
  const byLevel = this.levelCounts();
  const counts = byLevel.map((a) => a.length);
  const active = byLevel.reduce((n, a) => n + a.length, 0);
  const overdue = due.filter((w) => w.schedule[0] < t).length;
  const ratedToday = words.filter((w) => w.lastReviewed === t && !SRS.isNew(w));
  const doneToday = ratedToday.length;
  const totalToday = doneToday + due.length;
  const pct = totalToday ? Math.round(doneToday / totalToday * 100) : 100;
  const newCount = this.newWords().length;
  if (this.selLevel == null) { const mx = Math.max(...counts); this.selLevel = Math.max(0, counts.indexOf(mx)); }
  const sel = this.selLevel;
  const done = words.filter((w) => w.mastered).length;

  const flt = this.dueFilter;
  const list = flt === 'todo' ? due : flt === 'done' ? ratedToday : due.concat(ratedToday);
  const pg = this.duePager(list.length);
  const rows = list.slice(pg.page * pg.size, pg.page * pg.size + pg.size).map((w) => {
    const isDue = SRS.isDue(w, t);
    const lv = SRS.LEVELS[w.level];
    const over = isDue ? SRS.diffDays(t, w.schedule[0]) : 0;
    const quick = `<select class="quick" data-change="quick" aria-label="Chấm nhanh"><option value="">${isDue ? 'Chấm nhanh' : 'Đổi mức'}</option>${SRS.LEVELS.map((l, i) => `<option value="${i}">${l.short}</option>`).join('')}</select>`;
    return `<tr class="${isDue ? '' : 'rated'}" data-id="${w.id}">
      <td><button class="spk sm" data-act="speakRow">${I('volume', 14)}</button> <b>${UI.esc(w.word)}</b></td>
      <td class="ipa">${UI.esc(w.ipa)}</td><td>${UI.esc(UI.posAbbr(w.pos))}</td>
      <td class="${this.hideMeaning && isDue ? 'blur' : ''}" data-act="reveal">${UI.esc(w.meaning)}</td>
      <td><span class="tag ${lv.cls}">${lv.short}</span></td>
      <td class="nowrap">${w.mastered ? '✔ xong' : w.schedule[0] ? SRS.fmtFull(w.schedule[0]) : '—'}${over > 0 ? ` <span class="tag late">quá ${over}n</span>` : ''}</td>
      <td class="nowrap act">${quick}${!isDue && w.undo && w.undo.on === t ? '<button class="btn ghost sm" data-act="unrate">Chấm lại</button>' : ''}</td></tr>`;
  }).join('');
  const tab = (k, label, n) => `<button class="seg ${flt === k ? 'on' : ''}" data-act="dueFilter" data-f="${k}">${label} <small>${n}</small></button>`;

  const html = `
  ${this.syncBanner()}
  <section class="kpis">
    <div class="kpi" data-act="showDue"><span class="kic">${I('repeat', 20)}</span><div><small>Cần ôn hôm nay</small><b>${due.length} <em>từ</em></b><small>${overdue} từ cũ đến mốc · ${due.length - overdue} đến hạn hôm nay</small></div></div>
    <div class="kpi" data-act="showNew"><span class="kic b">${I('sparkles', 20)}</span><div><small>Từ mới chưa chấm</small><b>${newCount} <em>từ</em></b><small>Thêm từ hôm trước mà chưa chấm sẽ tự coi là “Chưa nhớ”</small></div></div>
    <div class="kpi" data-act="showHistory"><span class="kic g">${I('check', 20)}</span><div><small>Đã ôn hôm nay</small><b>${doneToday} / ${totalToday}</b><small>Đạt ${pct}% mục tiêu hôm nay</small></div><div class="ring sm" style="--p:${pct}"><span>${pct}%</span></div></div>
    <div class="kpi" data-act="gotoTrack"><span class="kic p">${I('list', 20)}</span><div><small>Đang theo dõi</small><b>${active} <em>từ</em></b><small>Phân bổ qua 10 mốc lặp lại${done ? ` · ${done} đã xong chu kỳ` : ''}</small></div></div>
  </section>

  <section class="cols">
    <div class="panel fcpanel"><div class="ph">${I('cards', 16)} <b>Flashcard ôn tập</b> <span class="muted" id="fcInfo"></span></div><div id="fcHost"></div></div>
    <div class="panel">
      <div class="ph">${I('repeat', 16)} <b>Tiến độ 10 mốc lặp lại (Spaced Repetition)</b></div>
      <div class="lchips">${counts.map((n, i) => `<button class="lchip ${i === sel ? 'on' : ''}" data-act="selLevel" data-i="${i}"><b>${SRS.DAYS[i]}d</b><small>${n} từ</small></button>`).join('')}</div>
      ${this.levelChart(counts, sel)}
      <div class="segs"><button class="seg" data-act="showDue">Từ cần ôn <small>${due.length}</small></button><button class="seg" data-act="showNew">Từ mới <small>${newCount}</small></button><button class="seg" data-act="gotoTrack">Đang theo dõi <small>${active}</small></button></div>
      <p class="muted lvnote">Mốc ${SRS.DAYS[sel]} ngày: <b>${counts[sel]}</b> từ. ${counts[sel] ? '<a href="#" data-act="showLevel">Xem danh sách</a>' : ''}</p>
    </div>
  </section>

  <section class="panel">
    <div class="ph spread">${I('list', 16)} <b>Danh sách từ cần ôn hôm nay</b>
      <div class="segs end">${tab('all', 'Tất cả', due.length + doneToday)}${tab('todo', 'Chưa chấm', due.length)}${tab('done', 'Đã ôn', doneToday)}</div></div>
    <label class="check small"><input type="checkbox" id="hideMean" ${this.hideMeaning ? 'checked' : ''}> Ẩn nghĩa để tự kiểm tra (bấm vào ô nghĩa để hiện)</label>
    <div class="table-wrap"><table class="tbl dtbl">
      <thead><tr><th>Từ vựng</th><th>Phiên âm</th><th>Từ loại</th><th>Nghĩa tiếng Việt</th><th>Nhóm chấm</th><th>Ngày ôn tiếp</th><th>Thao tác</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">${flt === 'done' ? 'Hôm nay chưa ôn từ nào.' : 'Hôm nay không còn từ nào đến hạn. ' + (newCount ? 'Hãy sang “Kho từ vựng” học các từ mới.' : '')}</td></tr>`}</tbody>
    </table></div>
    ${pg.html}
  </section>

  <section class="panel" id="trackPanel">
    <div class="ph">${I('chart', 16)} <b>Từ đang theo dõi (${active})</b></div>
    <p class="muted">Chia theo 10 mốc ôn. Bấm vào từng mốc để xem danh sách từ, ngày ôn tiếp theo, số lần ôn và số lần quên. <b>Xong chu kỳ</b>: từ đang ở mốc cuối “Thành thạo · 120d” mà đến hạn ôn lần nữa và bạn lại chọn “Thành thạo · 120d” thì từ được đánh dấu xong, không còn xuất hiện trong lịch ôn.</p>
    ${this.trackHTML(byLevel)}
  </section>`;
  return {
    html,
    after() {
      UI.$('#hideMean').addEventListener('change', (e) => { this.hideMeaning = e.target.checked; this.refresh(); });
      UI.$('#dueSize').addEventListener('change', (e) => { this.dueSize = +e.target.value; this.duePage = 0; this.refresh(); });
      this.fcRender(true);
    },
  };
};

App.trackHTML = function (byLevel) {
  const t = SRS.today();
  const learned = this.words().filter((w) => !SRS.isNew(w));
  const waitDays = (w) => { const d = SRS.diffDays(w.schedule[0], t); return d < 0 ? `quá hạn ${-d} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`; };
  const rows = (ws) => ws.map((w) => `<tr><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(w.meaning)}</td>
    <td>${w.mastered ? '✔ xong' : w.schedule[0] ? SRS.fmtFull(w.schedule[0]) + ` <small class="muted">(${waitDays(w)})</small>` : '—'}</td>
    <td>${w.added ? SRS.fmtFull(w.added) : '—'}</td><td>${w.lastReviewed ? SRS.fmtFull(w.lastReviewed) : '—'}</td><td>${w.reviews || 0}</td><td>${w.lapses || 0}</td></tr>`).join('');
  const table = (ws) => `<div class="table-wrap"><table class="tbl"><thead><tr><th>Từ</th><th>Nghĩa</th><th>Ôn tiếp</th><th>Ngày học</th><th>Ôn gần nhất</th><th>Lần ôn</th><th>Lần quên</th></tr></thead><tbody>${rows(ws)}</tbody></table></div>`;
  const mastered = learned.filter((w) => w.mastered);
  return SRS.LEVELS.map((l, i) => {
    const ws = byLevel[i].slice().sort((a, b) => (a.schedule[0] || '').localeCompare(b.schedule[0] || ''));
    return ws.length ? `<details class="trk"><summary><span class="tag ${l.cls}">${l.short}</span> <b>${ws.length}</b> từ — nhắc lại sau ${l.days} ngày</summary>${table(ws)}</details>` : '';
  }).join('') + (mastered.length ? `<details class="trk"><summary><span class="tag l4">Đã xong chu kỳ</span> <b>${mastered.length}</b> từ</summary>${table(mastered)}</details>` : '') || '<div class="empty">Chưa có từ nào đang theo dõi.</div>';
};

App.actions.dueFilter = function (el) { this.dueFilter = el.dataset.f; this.duePage = 0; this.refresh(); };
App.actions.duePrev = function () { this.duePage = Math.max(0, (this.duePage || 0) - 1); this.refresh(); };
App.actions.dueNext = function () { this.duePage = (this.duePage || 0) + 1; this.refresh(); };
App.actions.selLevel = function (el) { this.selLevel = +el.dataset.i; this.refresh(); };
App.actions.showLevel = function (el, e) {
  if (e) e.preventDefault();
  const i = this.selLevel, ws = this.levelCounts()[i].slice().sort((a, b) => a.schedule[0].localeCompare(b.schedule[0]));
  const rows = ws.map((w) => `<tr><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(w.meaning)}</td><td>${SRS.fmtFull(w.schedule[0])}</td><td>${w.lastReviewed ? SRS.fmtFull(w.lastReviewed) : '—'}</td></tr>`).join('');
  this.listModal('Mốc ' + SRS.DAYS[i] + ' ngày (' + ws.length + ' từ)', SRS.LEVELS[i].name + ' — nhắc lại sau ' + SRS.DAYS[i] + ' ngày kể từ lần chấm.', ['Từ', 'Nghĩa', 'Ôn tiếp', 'Ôn gần nhất'], rows);
};
// Chấm nhanh một từ ngay trong bảng (chọn thẳng mốc ôn).
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-change="quick"]');
  if (!el || el.value === '') return;
  const tr = el.closest('[data-id]'); const w = tr && App.byId(tr.dataset.id);
  if (!w) return;
  if (SRS.isDue(w, SRS.today())) SRS.rate(w, +el.value, SRS.today()); else SRS.rerate(w, +el.value);
  Store.save();
  UI.toast('“' + w.word + '” → ' + SRS.LEVELS[w.level].short + ', nhắc lại ' + (w.schedule[0] ? SRS.fmtFull(w.schedule[0]) : '—'));
  App.refresh();
});

/* ======================= BÀI ĐỌC ======================= */
App.targetWords = function () {
  const due = this.todayWords();
  if (due.length) return { words: due, fallback: false };
  const learned = this.words().filter((w) => !SRS.isNew(w)).slice(-10);
  return { words: learned.length ? learned : this.words().slice(-10), fallback: true };
};

/* Từ cần ôn hôm nay = từ đang đến hạn + từ đã ôn hôm nay (danh sách này đổi theo từng lần chấm) */
App.todayWords = function () {
  const t = SRS.today();
  return this.words().filter((w) => SRS.isDue(w, t) || (w.lastReviewed === t && !SRS.isNew(w)));
};
App.normWord = function (s) {
  return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b(sb|sth|st|something|someone|somewhere|place)\b/g, ' ').replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
};
// Các dạng của một từ trong kho: "have a good/bad accent" → hai dạng good / bad.
App.wordForms = function (name) {
  const raw = String(name || '').toLowerCase();
  const m = /(\w+)\/(\w+)/.exec(raw);
  const list = m ? [raw.replace(m[0], m[1]), raw.replace(m[0], m[2])] : [raw];
  return list.map((x) => this.normWord(x)).filter(Boolean);
};
App.markMatches = function (mark, name) {
  const k = this.normWord(mark), kt = k.split(' ');
  return this.wordForms(name).some((n) => {
    if (n === k || n.startsWith(k + ' ') || k.startsWith(n + ' ')) return true;
    const nt = n.split(' ');
    let j = 0;
    kt.forEach((t) => { if (j < nt.length && t === nt[j]) j++; });
    return j === nt.length && kt.length <= nt.length + 4;   // các từ của cụm xuất hiện theo thứ tự, chen thêm tối đa vài từ
  });
};
// Đối chiếu từng bài đọc với danh sách hôm nay: bài nào chứa từ cần ôn thì xếp trước; từ chưa có trong bài nào thì báo thiếu.
App.readingPlan = function (saved) {
  const today = this.todayWords();
  const lookup = (m) => today.find((w) => this.wordForms(w.word).includes(this.normWord(m))) || today.find((w) => this.markMatches(m, w.word)) || null;
  const covered = new Set();
  const info = saved.passages.map((p, i) => {
    const hit = new Set();
    (p.text.match(/\*\*(.+?)\*\*/g) || []).forEach((m) => {
      const t2 = m.slice(2, -2);
      today.forEach((w) => { if (this.markMatches(t2, w.word)) { hit.add(w.id); covered.add(w.id); } });   // mọi từ hôm nay xuất hiện trong cụm này
    });
    return { i, n: hit.size };
  });
  const rel = info.filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
  const other = info.filter((x) => x.n === 0);
  return { today, rel, other, order: rel.concat(other).map((x) => x.i), nOf: (i) => info[i].n, lookup, missing: today.filter((w) => !covered.has(w.id)), covered: covered.size };
};

App.readIdx = 0;
App.views.reading = function () {
  const t = SRS.today();
  const saved = Store.data.gen.reading[t];
  const plan = saved ? this.readingPlan(saved) : null;
  const today = plan ? plan.today : this.todayWords();
  if (this.readDate !== t) { this.readDate = t; this.readIdx = null; }
  const n = saved ? saved.passages.length : 0;
  if (plan && !plan.order.includes(this.readIdx)) this.readIdx = plan.order[0];
  const pi = this.readIdx || 0;
  const pos = plan ? plan.order.indexOf(pi) : 0;
  const p = saved && saved.passages[pi];
  const pill = (x) => `<button class="pill2 ${x.i === pi ? 'on' : ''}" data-act="selPassage" data-i="${x.i}"><b>${x.i + 1}</b> ${UI.esc(saved.passages[x.i].title)} ${x.n ? `<small>· ${x.n} từ</small>` : ''}</button>`;
  const html = `
  ${this.syncBanner()}
  <section class="panel rhead">
    <div class="ph spread">${I('reading', 16)} <b>Bài đọc theo từ cần ôn hôm nay</b>
      <span class="muted">${plan ? `${plan.rel.length} bài phù hợp · phủ ${plan.covered}/${today.length} từ cần ôn` : today.length ? `${today.length} từ cần ôn hôm nay` : 'Hôm nay chưa có từ đến hạn — dùng các từ học gần nhất.'}</span>
      <span class="grow"></span>
      <button class="btn ${saved ? '' : 'primary'} sm" data-act="genReading" ${(today.length || this.words().length) ? '' : 'disabled'}>${saved ? 'Tạo lại bài đọc' : 'Tạo bài đọc'}</button>
      <span class="muted" id="genStatus"></span></div>
    ${plan ? `<div class="pills">${plan.rel.map(pill).join('')}</div>` : ''}
    ${plan && plan.other.length ? `<details class="wl"><summary>Bài khác (${plan.other.length}) — không chứa từ cần ôn hôm nay</summary><div class="pills">${plan.other.map(pill).join('')}</div></details>` : ''}
    ${plan && plan.missing.length ? `<p class="note">Có <b>${plan.missing.length}/${today.length}</b> từ cần ôn hôm nay chưa xuất hiện trong bài đọc nào: ${plan.missing.slice(0, 12).map((w) => UI.esc(w.word)).join(', ')}${plan.missing.length > 12 ? '…' : ''}.<br><button class="btn primary sm" data-act="genMissing">Tạo thêm bài cho ${plan.missing.length} từ còn thiếu</button></p>` : ''}
    ${AI.hasKey() ? '' : '<p class="note">Chưa có API key: nút “Tạo bài đọc” sẽ hướng dẫn bạn sao chép prompt sang Claude và dán kết quả về (xem tab Cài đặt để tự động hoá).</p>'}
    ${today.length ? `<details class="wl"><summary>Từ cần ôn hôm nay (${today.length})</summary><div class="chips">${today.map((w) => `<span class="chip">${UI.esc(w.word)}</span>`).join('')}</div></details>` : '<p class="muted">Chưa có từ nào. Hãy thêm từ trước.</p>'}
  </section>
  <div id="passages">${p ? this.passageHTML(p, pi, pos, n, plan) : ''}</div>`;
  return {
    html,
    after() {
      this.readUI();
      if ((saved && saved.manual) || this.readingChecked === t) return;   // bài tự tạo thì giữ nguyên; bài tải sẵn thì luôn đối chiếu với bản mới nhất
      this.readingChecked = t;
      if (!saved) UI.$('#genStatus').textContent = 'Đang kiểm tra bài đọc tạo sẵn...';
      Sync.fetchReading(t).then((j) => {
        if (j) {
          const sig = j.passages.length + '|' + j.passages.map((q) => q.title).join('|');
          if (!saved || saved.sig !== sig) { Store.data.gen.reading[t] = { words: j.words || [], passages: j.passages, sig }; Store.prune(); Store.save(); if (this.tab === 'reading') this.render(); }
        } else if (!saved) { const s = UI.$('#genStatus'); if (s) s.textContent = 'Chưa có bài đọc tạo sẵn cho hôm nay.'; }
      });
    },
  };
};

App.actions.genMissing = function (btn) { return this.actions.genReading.call(this, btn, true); };
App.actions.genReading = async function (btn, onlyMissing) {
  const t = SRS.today();
  const saved = Store.data.gen.reading[t];
  let words = saved ? saved.words : this.targetWords().words;
  if (onlyMissing === true && saved) {
    words = this.readingPlan(saved).missing;
  }
  if (!words.length) return;
  const snap = words.map((w) => ({ id: w.id, word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning }));
  const n = Math.min(snap.length, snap.length <= 12 ? 3 : snap.length <= 20 ? 4 : 5);
  const subsets = Array.from({ length: n }, () => []);
  snap.forEach((w, i) => subsets[i % n].push(w));
  btn.disabled = true;
  const status = UI.$('#genStatus');
  const box = UI.$('#passages');
  if (onlyMissing !== true) box.innerHTML = '';
  const passages = [];
  try {
    if (AI.hasKey()) {
      status.textContent = `Đang viết ${n} bài đọc...`;
      let done = 0;
      const results = await Promise.all(subsets.map(async (s) => {
        const pr = AI.readingPrompt([s]);
        const r = await AI.askJSON({ system: pr.system, user: pr.user, maxTokens: 5000 });
        done++; status.textContent = `Đã xong ${done}/${n} bài...`;
        return r.passages[0];
      }));
      passages.push(...results);
    } else {
      const pr = AI.readingPrompt(subsets);
      const r = await AI.askJSON({ system: pr.system, user: pr.user });
      passages.push(...r.passages);
    }
    if (onlyMissing === true && saved) Store.data.gen.reading[t] = { words: saved.words.concat(snap), passages: saved.passages.concat(passages), manual: true };
    else Store.data.gen.reading[t] = { words: snap, passages, manual: true };
    Store.prune(); Store.save();
    status.textContent = '';
    this.render();
  } catch (e) {
    status.textContent = '';
    btn.disabled = false;
    UI.toast(e.message || 'Tạo bài đọc thất bại');
  }
};

App.splitSentences = function (para) {
  return para.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [para];
};

App.passageHTML = function (p, pi, pos, n, plan) {
  const paras = p.text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  let si = 0, marks = 0;
  const body = paras.map((para) => '<p>' + this.splitSentences(para).map((s) => {
    const html = UI.esc(s.trim()).replace(/\*\*(.+?)\*\*/g, (m, k) => { marks++; return `<mark class="${plan && !plan.lookup(k) ? 'mk-off' : ''}" data-act="wordTip" data-k="${k}">${k}</mark>`; });
    return `<span class="sent" data-i="${si++}">${html}</span> `;
  }).join('') + '</p>').join('');
  const wc = p.text.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;
  const tabs = ['Nối từ', 'Điền từ', 'Trắc nghiệm', 'True/False/NG'];
  const exs = (p.exercises || []);
  return `<div class="pbar" data-n="${si}">
      <div class="pb-title">${I('volume', 16)} Bài đọc ${pos + 1}/${plan ? plan.order.length : n}: ${UI.esc(p.title)} <small>(B1+ → B2)</small></div>
      <div class="pb-row">
        <button class="pplay" data-act="play" aria-label="Nghe / Tạm dừng"></button>
        <div class="pprog"><i id="pbFill"></i></div><span class="pbtime" id="pbTime">0/${si} câu</span>
        <div class="speeds">${[[0.75, '0.8x'], [0.95, '1.0x'], [1.15, '1.2x']].map(([r, l]) => `<button data-act="setRate" data-r="${r}" class="${this.reader.rate === r ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn light sm" data-act="stopRead">Dừng</button>
        <button class="btn light" data-act="play">${I('volume', 15)} Nghe toàn bài</button>
      </div></div>
    <div class="rcols">
      <article class="panel passage" data-p="${pi}">
        <h2 class="ptitle">${UI.esc(p.title)}</h2>
        <div class="meta">B1+ / B2 · ${wc} từ · ${plan ? plan.nOf(pi) : marks} từ cần ôn hôm nay <span class="muted">— bấm vào từ tô sáng để xem nghĩa</span></div>
        <div class="text" id="readText">${body}</div>
        ${p.summary_vi ? `<details><summary>Tóm tắt tiếng Việt</summary><p>${UI.esc(p.summary_vi)}</p></details>` : ''}
      </article>
      <aside class="panel qpanel">
        <div class="ph spread">${I('check', 16)} <b>Bài tập &amp; đáp án</b></div>
        <div class="segs">${exs.map((ex, ei) => `<button class="seg ${ei === 0 ? 'on' : ''}" data-act="exTab" data-e="${ei}">${String.fromCharCode(65 + ei)}. ${tabs[['match', 'gapfill', 'mcq', 'tfng'].indexOf(ex.type)] || ''}</button>`).join('')}</div>
        ${exs.map((ex, ei) => `<div class="exwrap" data-e="${ei}" ${ei ? 'hidden' : ''}>${this.exerciseHTML(ex, pi, ei)}</div>`).join('')}
        <div class="row spread"><button class="btn" data-act="readPrev" ${pos <= 0 ? 'disabled' : ''}>◀ Bài trước</button><button class="btn primary" data-act="readNext" ${plan && pos >= plan.order.length - 1 ? 'disabled' : ''}>Bài tiếp theo ▶</button></div>
      </aside>
    </div>`;
};

App.actions.selPassage = function (el) { this.readStop(); this.readIdx = +el.dataset.i; this.refresh(); window.scrollTo(0, 0); };
App.readMove = function (d) {
  const saved = Store.data.gen.reading[SRS.today()]; if (!saved) return;
  const o = this.readingPlan(saved).order, k = o.indexOf(this.readIdx) + d;
  if (k < 0 || k >= o.length) return;
  this.readStop(); this.readIdx = o[k]; this.refresh(); window.scrollTo(0, 0);
};
App.actions.readPrev = function () { this.readMove(-1); };
App.actions.readNext = function () { this.readMove(1); };
App.actions.exTab = function (el) {
  const e = el.dataset.e;
  UI.$$('.qpanel .segs .seg').forEach((b) => b.classList.toggle('on', b === el));
  UI.$$('.qpanel .exwrap').forEach((w) => { w.hidden = w.dataset.e !== e; });
};

/* ---- Nghe đọc: thanh phát ---- */
App.reader = { rate: 0.95, state: 'idle', idx: 0 };
App.readStop = function () {
  TTS.stop(); this.reader.state = 'idle'; this.reader.idx = 0;
  UI.$$('.sent.now').forEach((s) => s.classList.remove('now'));
  this.readUI();
};
App.readUI = function () {
  const R = this.reader, n = (UI.$('.pbar') || {}).dataset ? +UI.$('.pbar').dataset.n : 0;
  const b = UI.$('.pplay'); if (b) b.innerHTML = I(R.state === 'playing' ? 'pause' : 'play', 20);
  const f = UI.$('#pbFill'); if (f) f.style.width = (n && R.state !== 'idle' ? (R.idx + 1) / n * 100 : 0) + '%';
  const t = UI.$('#pbTime'); if (t) t.textContent = (R.state === 'idle' ? 0 : R.idx + 1) + '/' + n + ' câu';
};
App.readFrom = function (from) {
  const spans = UI.$$('#readText .sent'); const R = this.reader;
  R.state = 'playing';
  TTS.readList(spans.map((s) => s.textContent.trim()), {
    rate: R.rate, from,
    onSentence: (i) => { R.idx = i; UI.$$('.sent.now').forEach((s) => s.classList.remove('now')); spans[i].classList.add('now'); spans[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); this.readUI(); },
    onDone: () => this.readStop(),
  });
  this.readUI();
};
App.actions.play = function () {
  const R = this.reader;
  if (R.state === 'playing') { TTS.pause(); R.state = 'paused'; this.readUI(); }
  else if (R.state === 'paused') { TTS.resume(); R.state = 'playing'; this.readUI(); }
  else this.readFrom(0);
};
App.actions.stopRead = function () { this.readStop(); };
App.actions.setRate = function (el) {
  const R = this.reader; R.rate = +el.dataset.r;
  UI.$$('.speeds button').forEach((b) => b.classList.toggle('on', b === el));
  if (R.state !== 'idle') this.readFrom(R.idx);
};

/* ---- Tra nghĩa nhanh khi bấm vào từ tô sáng ---- */
App.wordInfo = function (key) {
  const saved = Store.data.gen.reading[SRS.today()];
  const pool = this.words().concat(saved ? saved.words : []);
  const k = this.normWord(key);
  return pool.find((w) => this.wordForms(w.word).includes(k)) || pool.find((w) => this.markMatches(key, w.word)) || null;
};
App.actions.wordTip = function (el) {
  const same = this.tipFor === el;
  this.closeTip();
  if (same) return;   // bấm lại đúng từ đó thì ẩn
  this.tipFor = el;
  const k = el.textContent;
  const w = this.wordInfo(k);
  const tip = document.createElement('div');
  tip.id = 'wtip'; tip.className = 'wtip';
  tip.innerHTML = w
    ? `<b>${UI.esc(w.word.replace(/\s*\(.*\)\s*$/, ''))}</b> <span class="ipa">${UI.esc(w.ipa || '')}</span> ${w.pos ? `<span class="pos">${UI.esc(UI.posAbbr(w.pos))}</span>` : ''}<div class="wt-m">${UI.esc(w.meaning)}</div>${w.example ? `<div class="wt-e">${UI.esc(w.example)}</div>` : ''}<div class="row"><button class="btn sm" data-act="tipSpeak" data-k="${UI.esc(w.word)}">${I('volume', 14)} Phát âm</button><button class="btn ghost sm" data-act="closeTip">Đóng</button></div>`
    : `<b>${UI.esc(k)}</b><div class="wt-m muted">Chưa có nghĩa trong kho từ vựng.</div><div class="row"><button class="btn sm" data-act="tipSpeak" data-k="${UI.esc(k)}">${I('volume', 14)} Phát âm</button><button class="btn ghost sm" data-act="closeTip">Đóng</button></div>`;
  document.body.appendChild(tip);
  const r = el.getBoundingClientRect();
  tip.style.top = (r.bottom + window.scrollY + 8) + 'px';
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + window.scrollX)) + 'px';
};
App.actions.closeTip = function () { this.closeTip(); };
App.actions.tipSpeak = function (el) { const w = this.wordInfo(el.dataset.k); TTS.speakWord(w || { word: el.dataset.k.replace(/\s*\(.*\)\s*$/, '') }); };

App.exerciseHTML = function (ex, pi, ei) {
  const titles = { match: 'Nối từ với nghĩa', gapfill: 'Điền từ vào câu', mcq: 'Câu hỏi trắc nghiệm', tfng: 'True / False / Not Given' };
  const L = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  let inner = '';
  if (ex.type === 'match') {
    const defs = UI.shuffle(ex.items.map((it) => it.definition));
    inner = ex.items.map((it, i) => `<div class="q" data-i="${i}"><b>${UI.esc(it.word)}</b>
      <select><option value="">— chọn định nghĩa —</option>${defs.map((d) => `<option>${UI.esc(d)}</option>`).join('')}</select><div class="fb"></div></div>`).join('');
  } else if (ex.type === 'gapfill') {
    inner = `<div class="bank">${UI.shuffle(ex.wordBank || []).map((w) => `<span class="chip">${UI.esc(w)}</span>`).join('')}</div>` +
      ex.items.map((it, i) => `<div class="q" data-i="${i}"><span>${i + 1}. ${UI.esc(it.q).replace('____', '<input class="gap" autocomplete="off" spellcheck="false">')}</span><div class="fb"></div></div>`).join('');
  } else if (ex.type === 'mcq') {
    inner = ex.items.map((it, i) => `<div class="q" data-i="${i}"><div>${i + 1}. ${UI.esc(it.q)}</div>${it.options.map((o, k) =>
      `<label class="opt"><input type="radio" name="e${pi}_${ei}_${i}" value="${k}"> ${L[k]}. ${UI.esc(o)}</label>`).join('')}<div class="fb"></div></div>`).join('');
  } else if (ex.type === 'tfng') {
    inner = ex.items.map((it, i) => `<div class="q" data-i="${i}"><div>${i + 1}. ${UI.esc(it.q)}</div>${['True', 'False', 'Not Given'].map((o) =>
      `<label class="opt inline"><input type="radio" name="e${pi}_${ei}_${i}" value="${o}"> ${o}</label>`).join('')}<div class="fb"></div></div>`).join('');
  } else return '';
  return `<div class="ex-block" data-p="${pi}" data-e="${ei}">
    <h3>${String.fromCharCode(65 + ei)}. ${titles[ex.type]}</h3>
    ${ex.instruction ? `<p class="muted">${UI.esc(ex.instruction)}</p>` : ''}
    ${inner}
    <div class="row"><button class="btn primary" data-act="check">Kiểm tra</button><button class="btn ghost" data-act="resetEx">Làm lại</button><span class="score"></span></div>
  </div>`;
};

App.actions.check = function (btn) {
  const blk = btn.closest('.ex-block');
  const ex = Store.data.gen.reading[SRS.today()].passages[+blk.dataset.p].exercises[+blk.dataset.e];
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  let ok = 0;
  UI.$$('.q', blk).forEach((q) => {
    const it = ex.items[+q.dataset.i];
    let good = false, shown = '';
    if (ex.type === 'match') { const v = UI.$('select', q).value; good = v === it.definition; shown = it.definition; }
    else if (ex.type === 'gapfill') {
      const v = norm(UI.$('input', q).value);
      good = String(it.answer).split('/').some((a) => norm(a) === v) && v !== ''; shown = it.answer;
    } else if (ex.type === 'mcq') { const r = UI.$('input:checked', q); good = !!r && +r.value === it.answer; shown = it.options[it.answer]; }
    else if (ex.type === 'tfng') { const r = UI.$('input:checked', q); good = !!r && r.value.toLowerCase() === String(it.answer).toLowerCase(); shown = it.answer; }
    if (good) ok++;
    q.classList.toggle('good', good); q.classList.toggle('bad', !good);
    UI.$('.fb', q).innerHTML = (good ? '✅ Đúng. ' : `❌ Đáp án: <b>${UI.esc(shown)}</b>. `) + UI.esc(it.explain || '');
  });
  UI.$('.score', blk).textContent = `Đúng ${ok}/${ex.items.length}`;
};

App.actions.resetEx = function (btn) {
  const blk = btn.closest('.ex-block');
  UI.$$('.q', blk).forEach((q) => { q.classList.remove('good', 'bad'); UI.$('.fb', q).textContent = ''; });
  UI.$$('input.gap', blk).forEach((i) => { i.value = ''; });
  UI.$$('input[type=radio]', blk).forEach((i) => { i.checked = false; });
  UI.$$('select', blk).forEach((s) => { s.value = ''; });
  UI.$('.score', blk).textContent = '';
};


/* ======================= FLASHCARD (hiện ngay trên trang Ôn hôm nay) ======================= */
App.fc = { ids: [], i: 0, flipped: false, front: 'word', done: {}, snap: {}, active: false };
App.actions.fcStart = function () {
  const ids = this.dueWords().map((w) => w.id);   // theo ngày hẹn: quá hạn lâu nhất trước
  if (!ids.length) return;
  this.fc = { ids, i: 0, flipped: false, front: this.fc.front || 'word', done: {}, snap: {}, active: true };
  if (this.tab !== 'review') { this.go('review'); } else this.fcRender();
  const h = UI.$('#fcHost'); if (h) h.scrollIntoView({ block: 'center', behavior: 'smooth' });
};
App.fcGo = function (i) {
  const F = this.fc;
  F.i = Math.max(0, Math.min(F.ids.length, i));
  F.pickG = null;
  F.flipped = F.i < F.ids.length && F.done[F.ids[F.i]] !== undefined;   // thẻ đã chấm: hiện luôn đáp án
  this.fcRender();
};
App.fcRender = function (noSpeak) {
  const el = UI.$('#fcHost'); if (!el) return;
  const F = this.fc;
  const info = UI.$('#fcInfo');
  if (!F.active) {
    if (info) info.textContent = '';
    const n = this.dueWords().length;
    el.innerHTML = n
      ? `<div class="fcidle"><div class="fcbig">${I('cards', 40)}</div><p>Còn <b>${n}</b> từ cần ôn. Thẻ xếp theo ngày hẹn, từ quá hạn lâu nhất đứng trước.</p><button class="btn primary" data-act="fcStart">${I('cards', 16)} Bắt đầu flashcard</button><small class="muted">Phím tắt: Space lật thẻ · 1–5 chọn nhóm · ← → chuyển thẻ</small></div>`
      : `<div class="fcidle"><div class="fcbig">${I('check', 40)}</div><p>Không còn từ nào đến hạn hôm nay.</p></div>`;
    return;
  }
  const total = F.ids.length;
  const rated = Object.keys(F.done).length;
  if (info) info.textContent = F.i < total ? `· Thẻ ${F.i + 1}/${total}` : '· Hoàn thành';
  if (F.i >= total) {
    const cnt = SRS.LEVELS.map(() => 0);
    Object.values(F.done).forEach((lv) => cnt[lv]++);
    el.innerHTML = `<div class="fcbox"><h3>Đã xem hết ${total} thẻ — đánh dấu ${rated}/${total} từ</h3>
      ${rated < total ? `<p class="note">Còn ${total - rated} từ chưa đánh dấu mức nhớ. Dùng nút “Trước” để quay lại.</p>` : ''}
      ${SRS.LEVELS.map((l, k) => cnt[k] ? `<div class="bar" style="grid-template-columns:150px 1fr 30px"><span class="tag ${l.cls}">${l.short}</span><div class="track"><i class="${l.cls}" style="width:${cnt[k] / total * 100}%"></i></div><b>${cnt[k]}</b></div>` : '').join('')}
      <div class="row end"><button class="btn" data-act="fcPrev">◀ Trước</button><button class="btn primary" data-act="fcClose">Đóng</button></div></div>`;
    return;
  }
  const w = this.byId(F.ids[F.i]);
  const mine = F.done[w.id];
  const frontWord = F.front === 'word';
  const pos = w.pos ? `<span class="pos">${UI.esc(UI.posAbbr(w.pos))}</span>` : '';
  const front = frontWord
    ? `<div class="fc-word">${UI.esc(w.word)}</div><div class="ipa">${w.ipa ? UI.esc(w.ipa) : ''}</div><button class="fc-spk" data-act="fcSpeak" aria-label="Nghe phát âm">${I('volume', 22)} <span>Nghe phát âm</span></button>`
    : `<div class="fc-mean">${UI.esc(w.meaning)}</div>${pos}`;
  const back = frontWord
    ? `${pos}<div class="fc-mean">${UI.esc(w.meaning)}</div>${w.example ? `<div class="ex">${UI.esc(w.example)} <button class="lnk" data-act="fcSpeakEx">${I('volume', 14)} Đọc ví dụ</button></div>` : ''}`
    : `<div class="fc-word">${UI.esc(w.word)}</div>${w.ipa ? `<div class="ipa">${UI.esc(w.ipa)}</div>` : ''}<button class="fc-spk" data-act="fcSpeak" aria-label="Nghe phát âm">${I('volume', 22)} <span>Nghe phát âm</span></button>${w.example ? `<div class="ex">${UI.esc(w.example)} <button class="lnk" data-act="fcSpeakEx">${I('volume', 14)} Đọc ví dụ</button></div>` : ''}`;
  const lv = SRS.isNew(w) ? '' : `Mốc hiện tại: ${SRS.LEVELS[w.level].days} ngày · chấm lúc ${w.lastReviewed ? SRS.fmt(w.lastReviewed) : '—'}`;
  el.innerHTML = `<div class="fcbox">
    <div class="fc-top"><label class="check small"><input type="checkbox" data-act="fcSide" ${frontWord ? '' : 'checked'}> Mặt trước là nghĩa</label>
      <button class="icon" data-act="fcClose" title="Dừng (Esc)">${I('x', 16)}</button></div>
    <div class="track"><i style="width:${F.i / total * 100}%"></i></div>
    <div class="fc-card" data-act="fcFlip" data-id="${w.id}">
      <div class="fc-face">${front}</div>
      ${F.flipped ? `<hr><div class="fc-face">${back}</div>` : '<div class="muted fc-hint">Bấm vào thẻ hoặc phím Space để lật</div>'}
      ${lv ? `<div class="fc-lv muted">${lv}</div>` : ''}
    </div>
    ${mine !== undefined ? `<p class="rated">Đã đánh dấu: <span class="tag ${SRS.LEVELS[mine].cls}">${SRS.LEVELS[mine].short}</span> → nhắc lại ${SRS.fmtFull(w.schedule[0] || SRS.today())}. Bấm mức khác để đổi.</p>` : ''}
    ${F.flipped ? this.fcRateHTML(F, mine) : '<button class="btn primary wide" data-act="fcFlip">Lật thẻ (Space)</button>'}
    <div class="fc-nav"><button class="btn" data-act="fcPrev" ${F.i === 0 ? 'disabled' : ''}>◀ Trước</button><button class="btn" data-act="fcNext">${F.i === total - 1 ? 'Kết thúc' : 'Sau'} ▶</button></div>
  </div>`;
  if (!noSpeak && frontWord && !F.flipped) TTS.speakWord(w);
};
App.fcRateHTML = function (F, mine) {
  const t = SRS.today();
  if (F.pickG == null) {
    return `<div class="rate">${SRS.GROUPS.map((g, i) => `<button class="lv ${g.cls} ${mine !== undefined && SRS.LEVELS[mine].group === i ? 'sel' : ''}" data-act="fcGroup" data-g="${i}"><b>${i + 1}. ${g.short}</b><small>${SRS.DAYS[i * 2]}d · ${SRS.DAYS[i * 2 + 1]}d</small></button>`).join('')}</div>`;
  }
  const g = F.pickG;
  return `<div class="rate2 open">${[g * 2, g * 2 + 1].map((i, k) => `<button class="lv2 ${SRS.LEVELS[i].cls} ${mine === i ? 'sel' : ''}" data-act="fcRate" data-lv="${i}"><b>${k + 1}. Sau ${SRS.LEVELS[i].days} ngày</b><small>${SRS.fmtFull(SRS.addDays(t, SRS.LEVELS[i].days))}</small></button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" data-act="fcBack">← Đổi nhóm (Backspace)</button></div>`;
};
App.actions.fcGroup = function (el) { this.fc.pickG = +el.dataset.g; this.fcRender(true); };
App.actions.fcBack = function () { this.fc.pickG = null; this.fcRender(true); };
App.actions.fcFlip = function (el, e) { if (e && e.target.closest('.lnk, .fc-spk')) return; this.fc.flipped = true; this.fcRender(true); };
App.actions.fcSpeak = function (el, e) { if (e) e.stopPropagation(); TTS.speakWord(this.byId(this.fc.ids[this.fc.i])); };
App.actions.fcSpeakEx = function (el, e) { if (e) e.stopPropagation(); const w = this.byId(this.fc.ids[this.fc.i]); if (w && w.example) TTS.speakExample(w.example); };
App.actions.fcSide = function (el) { this.fc.front = el.checked ? 'meaning' : 'word'; this.fc.flipped = false; this.fcRender(); };
App.actions.fcPrev = function () { this.fcGo(this.fc.i - 1); };
App.actions.fcNext = function () { this.fcGo(this.fc.i + 1); };
App.actions.fcRate = function (el) {
  const F = this.fc, lv = +el.dataset.lv, w = this.byId(F.ids[F.i]);
  // Chấm lại cùng một thẻ: khôi phục trạng thái ban đầu rồi chấm lại, để không đếm trùng lần ôn / lần quên.
  if (F.snap[w.id] === undefined) F.snap[w.id] = JSON.stringify(w);
  Object.assign(w, JSON.parse(F.snap[w.id]));
  SRS.rate(w, lv, SRS.today()); Store.save();
  F.done[w.id] = lv;
  F.i = Math.min(F.ids.length, F.i + 1); F.pickG = null;
  F.flipped = F.i < F.ids.length && F.done[F.ids[F.i]] !== undefined;
  this.refresh();                                   // cập nhật bảng, số liệu, biểu đồ; thẻ kế tiếp vẽ trong refresh
  const nw = this.byId(F.ids[F.i]); if (nw && !F.flipped && F.front === 'word') TTS.speakWord(nw);
};
App.actions.fcClose = function () { TTS.stop(); this.fc.active = false; this.refresh(); };
document.addEventListener('keydown', (e) => {
  const F = App.fc;
  if (!F.active || App.tab !== 'review') return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
  const inCard = F.i < F.ids.length;
  if (e.key === 'Escape') App.actions.fcClose.call(App);
  else if (e.key === 'ArrowRight' && inCard) App.fcGo(F.i + 1);
  else if (e.key === 'ArrowLeft') App.fcGo(F.i - 1);
  else if (e.key === ' ' && inCard && !F.flipped) { e.preventDefault(); App.actions.fcFlip.call(App); }
  else if (e.key === 'Backspace' && inCard && F.flipped && F.pickG != null) { e.preventDefault(); App.actions.fcBack.call(App); }
  else if (/^[1-5]$/.test(e.key) && inCard && F.flipped && F.pickG == null) App.actions.fcGroup.call(App, { dataset: { g: +e.key - 1 } });
  else if (/^[12]$/.test(e.key) && inCard && F.flipped && F.pickG != null) App.actions.fcRate.call(App, { dataset: { lv: F.pickG * 2 + (+e.key - 1) } });
  else if (e.key.toLowerCase() === 's' && inCard) App.actions.fcSpeak.call(App);
});

/* ======================= CÀI ĐẶT ======================= */
App.views.settings = function () {
  const s = Store.data.settings;
  const html = `
  ${this.accountPanel()}
  <section class="panel">
    <h2>${I('key')} Kết nối Claude (tạo bài đọc tự động)</h2>
    <p class="muted">Khoá API được lưu <b>chỉ trong trình duyệt này</b> và gửi thẳng tới api.anthropic.com. Không nhập khoá trên máy dùng chung. Có thể bỏ trống để dùng chế độ thủ công (sao chép prompt sang claude.ai).</p>
    <label>API key<input id="apiKey" type="password" autocomplete="off" placeholder="sk-ant-..." value="${UI.esc(s.apiKey)}"></label>
    <label>Model<input id="model" value="${UI.esc(s.model)}"></label>
    <div class="row"><button class="btn primary" data-act="saveSettings">Lưu</button><button class="btn" data-act="testAI">Thử kết nối</button><span class="muted" id="testOut"></span></div>
  </section>
  <section class="panel">
    <h2>${I('cloud')} Đồng bộ GitHub & bài đọc tự động</h2>
    <p class="muted">Dán GitHub token để web tự lưu danh sách từ lên GitHub; routine lúc 4:30 sáng sẽ đọc danh sách đó và tạo sẵn bài đọc cho bạn. Token chỉ lưu trong trình duyệt này.
    Tạo token: GitHub → Settings → Developer settings → Fine-grained tokens → chọn <b>chỉ repo Luong-Giang</b> → Repository permissions → <b>Contents: Read and write</b>.</p>
    <label>Repo<input id="ghRepo" value="${UI.esc(s.ghRepo || Sync.DEFAULT_REPO)}"></label>
    <label>GitHub token<input id="ghToken" type="password" autocomplete="off" placeholder="github_pat_..." value="${UI.esc(s.ghToken || '')}"></label>
    <div class="row"><button class="btn primary" data-act="saveSettings">Lưu</button><button class="btn" data-act="syncNow">Đồng bộ ngay</button><span class="muted" id="syncOut">${UI.esc(Sync.status)}</span></div>
  </section>
  <section class="panel">
    <h2>${I('volume')} Giọng đọc</h2>
    <p class="muted">Từ vựng, câu ví dụ và bài đọc dùng <b>giọng Emma</b> (giọng người thật, tải từ file âm thanh) nên giống hệt nhau trên máy tính, iPad và điện thoại. Giọng bên dưới chỉ là dự phòng khi từ/câu đó chưa có file âm thanh.</p>
    <label>Giọng dự phòng<select id="voiceSel"><option value="">Tự chọn giọng tự nhiên nhất</option>${TTS.voices.map((v) => `<option value="${UI.esc(v.voiceURI)}" ${v.voiceURI === s.voice ? 'selected' : ''}>${UI.esc(v.name)} (${v.lang})</option>`).join('')}</select></label>
    <label>Tốc độ <span id="rateVal">${s.rate}</span><input id="rateRange" type="range" min="0.6" max="1.3" step="0.05" value="${s.rate}"></label>
    <button class="btn" data-act="testVoice">Nghe thử</button>
  </section>
  <section class="panel">
    <h2>${I('save')} Dữ liệu</h2>
    <p class="muted">Dữ liệu nằm trong trình duyệt. Hãy xuất bản sao lưu định kỳ, nhất là trước khi xoá lịch sử trình duyệt.</p>
    <div class="row"><button class="btn" data-act="export">Xuất sao lưu (.json)</button>
    <label class="btn">Nhập sao lưu<input type="file" id="importFile" accept=".json" hidden></label>
    <button class="btn danger" data-act="wipe">Xoá toàn bộ dữ liệu</button></div>
  </section>`;
  return {
    html,
    after() {
      UI.$('#rateRange').addEventListener('input', (e) => { UI.$('#rateVal').textContent = e.target.value; });
      UI.$('#importFile').addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((t) => {
          try { const d = JSON.parse(t); if (!Array.isArray(d.words)) throw new Error(); d.settings = Object.assign({}, d.settings || {}, Store.data.settings); /* giữ token/API key hiện tại */ localStorage.setItem(Store.KEY, JSON.stringify(d)); Store.load(); UI.toast('Đã nhập sao lưu'); this.render(); }
          catch (err) { UI.toast('File sao lưu không hợp lệ'); }
        });
      });
    },
  };
};

App.accountPanel = function () {
  if (!Cloud.enabled()) {
    return `<section class="panel"><h2>${I('key')} Tài khoản</h2><p class="muted">Đăng nhập bằng Google chưa được bật. Điền cấu hình Firebase vào <code>firebase-config.js</code> để mỗi lần mở web phải đăng nhập và dữ liệu đồng bộ giữa các thiết bị.</p></section>`;
  }
  return `<section class="panel"><h2>${I('key')} Tài khoản</h2>
    <p>Đang đăng nhập: <b>${UI.esc(Cloud.user ? Cloud.user.email : '(ngoại tuyến)')}</b></p>
    <p class="muted">Dữ liệu học của bạn được lưu riêng cho tài khoản này và đồng bộ giữa các thiết bị.</p>
    <div class="row"><button class="btn" data-act="cloudSync">Đồng bộ ngay</button><button class="btn" data-act="cloudCheck">Kiểm tra đồng bộ</button><button class="btn danger" data-act="signOut">Đăng xuất</button><span class="muted" id="cloudOut">${UI.esc(Cloud.status)}</span></div>
    <div class="diag" id="cloudDiag">${this.diagLocal()}</div>
    <div class="row"><button class="btn ghost sm" data-act="refreshApp">Làm mới ứng dụng (xoá bản lưu cũ)</button></div></section>`;
};
App.recentCounts = function (words) {
  const t = SRS.today(), out = [];
  for (let i = 0; i < 4; i++) { const d = SRS.addDays(t, -i); out.push(SRS.fmt(d) + ': ' + words.filter((w) => w.lastReviewed === d).length); }
  return out.join(' · ');
};
App.diagLocal = function () {
  const w = Store.data.words;
  const when = Store.data.updatedAt ? new Date(Store.data.updatedAt).toLocaleString('vi-VN') : '—';
  return `<b>Máy này</b> — phiên bản <code>${UI.esc(window.APP_VERSION || 'cũ')}</code> · ${w.length} từ · ngày máy: ${SRS.fmtFull(SRS.today())}<br>
    Số từ có lần ôn gần nhất: ${this.recentCounts(w)}<br>Lưu lần cuối: ${when}`;
};
App.actions.cloudCheck = async function () {
  const box = UI.$('#cloudDiag'); box.innerHTML = this.diagLocal() + '<br><i>Đang kiểm tra đám mây...</i>';
  if (!Cloud.user) { box.innerHTML = this.diagLocal() + '<br>Đang ở chế độ ngoại tuyến.'; return; }
  try {
    const r = await Cloud.fetchRemote();
    if (!r) { box.innerHTML = this.diagLocal() + '<br><b>Đám mây</b>: chưa có dữ liệu nào.'; return; }
    const local = new Map(Store.data.words.map((w) => [Cloud.key(w), w]));
    let localNewer = 0, cloudNewer = 0, onlyLocal = 0;
    r.words.forEach((rw) => { const lw = local.get(Cloud.key(rw)); if (!lw) return; if ((lw.lastReviewed || '') > (rw.lastReviewed || '')) localNewer++; else if ((lw.lastReviewed || '') < (rw.lastReviewed || '')) cloudNewer++; });
    const rem = new Set(r.words.map((w) => Cloud.key(w)));
    Store.data.words.forEach((w) => { if (!rem.has(Cloud.key(w))) onlyLocal++; });
    const when = r.meta.updatedAt ? new Date(r.meta.updatedAt).toLocaleString('vi-VN') : '—';
    box.innerHTML = this.diagLocal() + `<br><b>Đám mây</b> (${UI.esc(r.meta.email || '?')}) — ${r.words.length} từ · cập nhật lúc ${when}<br>
      Số từ có lần ôn gần nhất: ${this.recentCounts(r.words)}<br>
      So với máy này: ${localNewer} từ máy này mới hơn đám mây · ${cloudNewer} từ đám mây mới hơn · ${onlyLocal} từ chỉ có ở máy này.
      ${localNewer || onlyLocal ? '<br><b>Bấm “Đồng bộ ngay” để đẩy phần mới của máy này lên đám mây.</b>' : ''}`;
  } catch (e) { box.innerHTML = this.diagLocal() + '<br><b>Lỗi:</b> ' + UI.esc(Cloud.errMsg(e)); }
};
App.actions.refreshApp = async function () {
  if (!confirm('Xoá bản lưu cũ của ứng dụng và tải lại bản mới nhất? Dữ liệu học của bạn KHÔNG bị xoá.')) return;
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); } catch (e) { /* bỏ qua */ }
  try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { /* bỏ qua */ }
  location.href = location.pathname + '?r=' + Date.now() + '#settings';
};
App.actions.cloudSync = async function () { if (!Cloud.user) { UI.toast('Đang ở chế độ ngoại tuyến.'); return; } Cloud.setStatus('Đang đồng bộ...'); await Cloud.push(); };
App.actions.signOut = async function () {
  if (!confirm('Đăng xuất khỏi tài khoản này?')) return;
  try { await Cloud.push(); } catch (e) { /* vẫn đăng xuất */ }
  await Cloud.signOut();
  location.reload();
};
App.actions.saveSettings = function () {
  const s = Store.data.settings;
  s.apiKey = UI.$('#apiKey').value.trim();
  s.model = UI.$('#model').value.trim() || 'claude-sonnet-5-5';
  s.voice = UI.$('#voiceSel').value;
  s.ghToken = UI.$('#ghToken').value.trim();
  s.ghRepo = UI.$('#ghRepo').value.trim() || Sync.DEFAULT_REPO;
  s.rate = +UI.$('#rateRange').value;
  Store.save(); UI.toast('Đã lưu cài đặt');
};
App.actions.syncNow = async function () { this.actions.saveSettings.call(this); if (!Sync.enabled()) { Sync.setStatus('Chưa nhập token.'); return; } Sync.setStatus('Đang đồng bộ...'); await Sync.push(); };
App.actions.testVoice = function () { this.actions.saveSettings.call(this); TTS.stop(); TTS.say('Spaced repetition helps you remember new vocabulary for a long time.'); };
App.actions.testAI = async function () {
  this.actions.saveSettings.call(this);
  const out = UI.$('#testOut');
  if (!AI.hasKey()) { out.textContent = 'Chưa nhập API key.'; return; }
  out.textContent = 'Đang thử...';
  try { await AI.ask({ system: 'Reply with the single word OK.', user: 'ping', maxTokens: 10 }); out.textContent = '✅ Kết nối thành công'; }
  catch (e) { out.textContent = '❌ ' + e.message; }
};
App.actions.export = function () {
  const blob = new Blob([JSON.stringify(Object.assign({}, Store.data, { settings: Object.assign({}, Store.data.settings, { apiKey: '', ghToken: '' }) }), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'vocab-backup-' + SRS.today() + '.json'; a.click();
};
App.actions.wipe = function () {
  if (confirm('Xoá toàn bộ từ vựng, lịch ôn và lịch sử? Không thể hoàn tác.')) { localStorage.removeItem(Store.KEY); Store.data = null; Store.load(); this.render(); }
};

document.addEventListener('DOMContentLoaded', () => App.init());

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeTip(); });
window.addEventListener('scroll', () => { if (App.tipFor) App.closeTip(); }, { passive: true });
