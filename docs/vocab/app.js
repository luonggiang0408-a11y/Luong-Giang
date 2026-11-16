/* Giao diện chính: Từ vựng, Ôn hôm nay, Bài đọc, Bài nói, Bài viết, Cài đặt */
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
  boot(offline) {
    if (Cloud.user && !offline) Cloud.bindStore(Cloud.user.uid); else if (!offline) Store.load();
    if (this.booted) { this.autoStart(); this.go(this.tab); return; }
    this.booted = true;
    this.autoStart();
    TTS.init();
    UI.$('#logo').innerHTML = I('book', 22);
    UI.$$('#tabs button').forEach((b) => { b.insertAdjacentHTML('afterbegin', I(b.dataset.icon, 20)); b.addEventListener('click', () => this.go(b.dataset.tab)); });
    document.addEventListener('click', (e) => this.onClick(e));
    this.go(location.hash.slice(1) || 'review');
    if (Cloud.user && !offline) {
      Cloud.pull().then((changed) => { if (changed) { this.autoStart(); this.render(); } });
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
    TTS.stop();
    if (this.rec.on) this.stopRec();
    clearInterval(this.rec.timer); this.rec.timer = null; this.rec.seconds = 0;
    if (!this.views[tab]) tab = 'review';
    this.tab = tab;
    location.hash = tab;
    UI.$$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.render();
  },

  render() {
    const v = this.views[this.tab].call(this);
    UI.$('#view').innerHTML = v.html;
    if (v.after) v.after.call(this);
    this.updateBadge();
  },

  updateBadge() {
    const due = this.dueWords().length;
    const b = UI.$('#tabs [data-tab="review"] .badge');
    if (b) { b.textContent = due; b.style.display = due ? '' : 'none'; }
    UI.$('#todayLabel').textContent = 'Hôm nay ' + SRS.fmtFull(SRS.today());
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
  const nw = this.newWords();
  const all = this.words();
  const q = (this.wordQuery || '').toLowerCase();
  const filtered = all.filter((w) => !q || (w.word + ' ' + w.meaning + ' ' + (w.example || '')).toLowerCase().includes(q));
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
      <thead><tr><th>Từ</th><th>Phiên âm</th><th>Loại</th><th>Nghĩa</th><th>Ví dụ</th><th>Mức</th><th>Ôn tiếp</th><th></th></tr></thead>
      <tbody>${filtered.map((w) => {
        const lv = SRS.isNew(w) ? null : SRS.LEVELS[w.level];
        return `<tr class="wcard-row" data-id="${w.id}"><td><button class="spk sm" data-act="speakRow">${I('volume', 16)}</button> <b>${UI.esc(w.word)}</b></td><td>${UI.esc(w.ipa)}</td><td>${UI.esc(UI.posAbbr(w.pos))}</td><td>${UI.esc(w.meaning)}</td>
        <td class="excell">${w.example ? `<button class="spk sm" data-act="speakEx" aria-label="Nghe câu ví dụ">${I('volume', 16)}</button> <span class="exs">${UI.esc(w.example)}</span>` : '<a href="#" class="muted" data-act="editRow">+ thêm ví dụ</a>'}</td>
        <td>${lv ? `<span class="tag ${lv.cls}">${lv.short}</span>` : '<span class="tag new">Mới</span>'}</td>
        <td>${w.mastered ? '✔ xong' : w.schedule.length ? SRS.fmtFull(w.schedule[0]) : '—'}</td>
        <td class="nowrap"><button class="icon" data-act="editRow" title="Sửa">${I('pen', 16)}</button><button class="icon" data-act="delRow" title="Xoá">${I('trash', 16)}</button></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">Không có từ nào.</td></tr>'}</tbody>
    </table></div>
  </section>`;
  return {
    html,
    after() {
      const s = UI.$('#wordSearch');
      s.addEventListener('input', () => { this.wordQuery = s.value; const pos = s.selectionStart; this.render(); const n = UI.$('#wordSearch'); n.focus(); n.setSelectionRange(pos, pos); });
      UI.$('#importFile2').addEventListener('change', (ev) => {
        const f = ev.target.files[0]; if (!f) return;
        f.text().then((txt) => { UI.$('#importBox').value = txt; UI.$('#importInfo').textContent = f.name + ': ' + txt.split(/\r?\n/).filter((l) => l.trim()).length + ' dòng. Bấm “Nhập” để hoàn tất.'; });
      });
      UI.$('#wordForm').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.target).entries());
        if (this.editing) { Object.assign(this.byId(this.editing), f); this.editing = null; UI.toast('Đã lưu'); }
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
  if (Sync.enabled()) return '';
  return `<div class="banner warn">${I('cloud')}<div><b>Chưa kết nối GitHub.</b> Danh sách từ chưa được lưu lên GitHub nên bài đọc tự động lúc 5:00 sáng sẽ không có dữ liệu, và bạn sẽ không thấy từ khi mở trên máy khác.</div><button class="btn primary sm" data-act="gotoSettings">Kết nối ngay</button></div>`;
};
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
App.actions.speakRow = function (el) { const w = this.byId(el.closest('tr').dataset.id); if (w) TTS.speakWord(w); };
App.actions.speakEx = function (el) { const w = this.byId(el.closest('tr').dataset.id); if (w && w.example) { TTS.stop(); TTS.say(w.example); } };
App.actions.editRow = function (el, e) { if (e) e.preventDefault(); this.editing = el.closest('tr').dataset.id; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
App.actions.cancelEdit = function () { this.editing = null; this.render(); };
App.actions.delRow = function (el) {
  const w = this.byId(el.closest('tr').dataset.id);
  if (w && confirm('Xoá từ “' + w.word + '” và toàn bộ lịch ôn của nó?')) { Store.data.words = this.words().filter((x) => x !== w); Store.save(); this.render(); }
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
    if (existing) { if (exNew && !existing.example) { existing.example = exNew; filled++; } else skipped++; return; }
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
App.views.review = function () {
  const t = SRS.today();
  const due = this.dueWords();
  const words = this.words();
  const learned = words.filter((w) => !SRS.isNew(w));
  const counts = SRS.LEVELS.map((g, i) => learned.filter((w) => w.level === i && !w.mastered).length);
  const active = learned.filter((w) => !w.mastered);
  const overdue = active.filter((w) => w.schedule[0] && w.schedule[0] < t).length;
  const waitDays = (w) => { const d = SRS.diffDays(w.schedule[0], t); return d < 0 ? `quá hạn ${-d} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`; };
  const rows = (ws) => ws.map((w) => `<tr><td><b>${UI.esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${UI.esc(w.ipa)}</span>` : ''}</td><td>${UI.esc(w.meaning)}</td>
    <td>${w.mastered ? '✔ xong' : w.schedule[0] ? SRS.fmtFull(w.schedule[0]) + ` <small class="muted">(${waitDays(w)})</small>` : '—'}</td>
    <td>${w.added ? SRS.fmtFull(w.added) : '—'}</td><td>${w.lastReviewed ? SRS.fmtFull(w.lastReviewed) : '—'}</td><td>${w.reviews || 0}</td><td>${w.lapses || 0}</td></tr>`).join('');
  const table = (ws) => `<div class="table-wrap"><table class="tbl"><thead><tr><th>Từ</th><th>Nghĩa</th><th>Ôn tiếp</th><th>Ngày học</th><th>Ôn gần nhất</th><th>Lần ôn</th><th>Lần quên</th></tr></thead><tbody>${rows(ws)}</tbody></table></div>`;
  const trackHTML = SRS.LEVELS.map((l, i) => {
    const ws = active.filter((w) => w.level === i).sort((a, b) => (a.schedule[0] || '').localeCompare(b.schedule[0] || ''));
    return ws.length ? `<details class="trk"><summary><span class="tag ${l.cls}">${l.short}</span> <b>${ws.length}</b> từ — nhắc lại sau ${l.days} ngày</summary>${table(ws)}</details>` : '';
  }).join('') + (learned.some((w) => w.mastered) ? `<details class="trk"><summary><span class="tag l4">Đã xong chu kỳ</span> <b>${learned.filter((w) => w.mastered).length}</b> từ</summary>${table(learned.filter((w) => w.mastered))}</details>` : '');
  const done = words.filter((w) => w.mastered).length;
  const doneToday = words.filter((w) => w.lastReviewed === t).length;
  const ratedToday = words.filter((w) => w.lastReviewed === t && !SRS.isNew(w));
  const totalToday = doneToday + due.length;
  const pct = totalToday ? Math.round(doneToday / totalToday * 100) : 100;
  // Lịch 7 ngày tới
  const upcoming = [];
  for (let i = 1; i <= 7; i++) {
    const d = SRS.addDays(t, i);
    const n = learned.filter((w) => !w.mastered && w.schedule[0] === d).length;
    upcoming.push({ d, n });
  }
  const html = `
  ${this.syncBanner()}
  <section class="hero">
    <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
    <div class="hero-text"><h2>Hôm nay</h2>
      <p>Đã ôn <b>${doneToday}</b>/${totalToday} từ · còn <b>${due.length}</b> từ đến hạn</p>
      ${due.length ? `<button class="btn primary" data-act="fcStart">${I('cards')} Học bằng flashcard</button>` : '<span class="muted">Không còn từ nào đến hạn.</span>'}
      ${doneToday ? `<button class="btn hero-ghost" data-act="showHistory">${I('list')} Xem từ đã ôn</button>` : ''}</div>
  </section>
  <section class="stats">
    <div class="stat clickable" data-act="showDue"><b>${due.length}</b><span>cần ôn hôm nay<br><small>Xem chi tiết ›</small></span></div>
    <div class="stat clickable" data-act="showNew"><b>${this.newWords().length}</b><span>từ mới chưa học<br><small>Xem chi tiết ›</small></span></div>
    <div class="stat clickable" data-act="gotoTrack"><b>${active.length}</b><span>đang theo dõi${overdue ? ` · ${overdue} quá hạn` : ''}<br><small>Xem chi tiết ›</small></span></div>
    <div class="stat"><b>${done}</b><span>đã xong chu kỳ</span></div>
  </section>
  <section class="panel">
    <h2>${I('repeat')} Danh sách ôn tập hôm nay (<span id="dueCount">${due.length}</span>)</h2>
    <div class="row">
      <label class="check"><input type="checkbox" id="hideMean" ${this.hideMeaning ? 'checked' : ''}> Ẩn nghĩa để tự kiểm tra (bấm vào để hiện)</label>
    </div>
    
    <p class="muted">Với mỗi từ: nhớ lại nghĩa, rồi chọn mức nhớ. Hệ thống tự đặt lịch ôn tiếp theo.</p>
    <div id="dueList">${due.length ? due.map((w) => this.wordCard(w, { due: true })).join('')
      : `<div class="empty">Hôm nay không có từ nào đến hạn ôn. ${this.newWords().length ? 'Hãy sang tab “Từ vựng” học các từ mới.' : ''}</div>`}</div>
  </section>
  ${ratedToday.length ? `<section class="panel" id="ratedPanel">
    <details ${ratedToday.length <= 12 ? 'open' : ''}><summary class="h2like">${I('check')} Đã ôn hôm nay (${ratedToday.length}) <button class="btn ghost sm" data-act="showHistory">Xem lịch sử các ngày</button></summary>
    <p class="muted">Chấm nhầm? Với từ có nút “Chấm lại” (chấm trong hôm nay), bấm để trả về trạng thái trước đó và chọn mức khác.</p>
    ${ratedToday.map((w) => this.ratedRow(w)).join('')}</details>
  </section>` : ''}
  <section class="panel">
    <h2>${I('chart')} Tiến độ</h2>
    ${(() => {
      const gc = SRS.GROUPS.map((g, gi) => counts[gi * 2] + counts[gi * 2 + 1]);
      const tot = gc.reduce((x, y) => x + y, 0);
      return `<div class="stack">${tot ? SRS.GROUPS.map((g, gi) => gc[gi] ? `<i class="${g.cls}" style="flex:${gc[gi]}" title="${g.name}: ${gc[gi]} từ"></i>` : '').join('') : ''}</div>
      <div class="legend">${SRS.GROUPS.map((g, gi) => `<div class="lg"><span class="dot ${g.cls}"></span><span class="lgname" title="${g.name}">${g.short}</span><b>${gc[gi]}</b><small>${SRS.DAYS[gi * 2]}d: ${counts[gi * 2]} · ${SRS.DAYS[gi * 2 + 1]}d: ${counts[gi * 2 + 1]}</small></div>`).join('')}</div>`;
    })()}
    <h3>Lịch ôn 7 ngày tới</h3>
    <div class="cal">${upcoming.map((u) => `<div class="day ${u.n ? 'has' : ''}"><small>${SRS.fmt(u.d)}</small><b>${u.n}</b></div>`).join('')}</div>
  </section>
  <section class="panel" id="trackPanel">
    <h2>${I('list')} Từ đang theo dõi (${active.length})</h2>
    <p class="muted">Chia theo 10 mốc ôn. Bấm vào từng mốc để xem danh sách từ, ngày ôn tiếp theo, số lần ôn và số lần quên.</p>
    ${trackHTML || '<div class="empty">Chưa có từ nào đang theo dõi.</div>'}
  </section>`;
  return {
    html,
    after() { UI.$('#hideMean').addEventListener('change', (e) => { this.hideMeaning = e.target.checked; this.render(); }); },
  };
};

/* ======================= BÀI ĐỌC ======================= */
App.targetWords = function () {
  const due = this.dueWords();
  if (due.length) return { words: due, fallback: false };
  const learned = this.words().filter((w) => !SRS.isNew(w)).slice(-10);
  return { words: learned.length ? learned : this.words().slice(-10), fallback: true };
};

App.views.reading = function () {
  const t = SRS.today();
  const saved = Store.data.gen.reading[t];
  const tw = this.targetWords();
  const words = saved ? saved.words : tw.words;
  const html = `
  ${this.syncBanner()}
  <section class="panel">
    <h2>${I('reading')} Bài đọc hôm nay</h2>
    <p class="muted">${saved ? 'Bài đọc đã tạo cho các từ cần ôn hôm nay.' : tw.fallback ? 'Hôm nay chưa có từ đến hạn — dùng các từ học gần nhất để luyện.' : 'Bài đọc sẽ dùng đúng các từ trong danh sách ôn hôm nay.'}</p>
    <div class="chips">${words.map((w) => `<span class="chip">${UI.esc(w.word)}</span>`).join('') || '<span class="muted">Chưa có từ nào. Hãy thêm từ trước.</span>'}</div>
    <div class="row">
      <button class="btn primary" data-act="genReading" ${words.length ? '' : 'disabled'}>${saved ? 'Tạo lại bài đọc' : 'Tạo bài đọc'}</button>
      <span class="muted" id="genStatus"></span>
    </div>
    ${AI.hasKey() ? '' : '<p class="note">Chưa có API key: ứng dụng sẽ hướng dẫn bạn sao chép prompt sang Claude và dán kết quả về (xem tab Cài đặt để tự động hoá).</p>'}
  </section>
  <div id="passages">${saved ? saved.passages.map((p, i) => this.passageHTML(p, i)).join('') : ''}</div>`;
  return {
    html,
    after() {
      if (saved || this.readingChecked === t) return;
      this.readingChecked = t;
      UI.$('#genStatus').textContent = 'Đang kiểm tra bài đọc tạo sẵn...';
      Sync.fetchReading(t).then((j) => {
        if (j) { Store.data.gen.reading[t] = { words: j.words || [], passages: j.passages }; Store.prune(); Store.save(); if (this.tab === 'reading') this.render(); }
        else { const s = UI.$('#genStatus'); if (s) s.textContent = 'Chưa có bài đọc tạo sẵn cho hôm nay.'; }
      });
    },
  };
};

App.actions.genReading = async function (btn) {
  const t = SRS.today();
  const saved = Store.data.gen.reading[t];
  const words = saved ? saved.words : this.targetWords().words;
  if (!words.length) return;
  const snap = words.map((w) => ({ id: w.id, word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning }));
  const n = Math.min(snap.length, snap.length <= 12 ? 3 : snap.length <= 20 ? 4 : 5);
  const subsets = Array.from({ length: n }, () => []);
  snap.forEach((w, i) => subsets[i % n].push(w));
  btn.disabled = true;
  const status = UI.$('#genStatus');
  const box = UI.$('#passages');
  box.innerHTML = '';
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
    Store.data.gen.reading[t] = { words: snap, passages };
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

App.passageHTML = function (p, pi) {
  const paras = p.text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  let si = 0;
  const body = paras.map((para) => '<p>' + this.splitSentences(para).map((s) => {
    const html = UI.esc(s.trim()).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
    return `<span class="sent" data-i="${si++}">${html}</span> `;
  }).join('') + '</p>').join('');
  return `<article class="panel passage" data-p="${pi}">
    <h2>${pi + 1}. ${UI.esc(p.title)}</h2>
    <div class="player">
      <button class="btn primary" data-act="play">Nghe</button>
      <button class="btn" data-act="pause">Tạm dừng</button>
      <button class="btn ghost" data-act="stopRead">Dừng</button>
      <label>Tốc độ <select data-act="rateSel"><option value="0.75">Chậm</option><option value="0.95" selected>Tự nhiên</option><option value="1.15">Nhanh</option></select></label>
    </div>
    <div class="text">${body}</div>
    ${p.summary_vi ? `<details><summary>Tóm tắt tiếng Việt</summary><p>${UI.esc(p.summary_vi)}</p></details>` : ''}
    ${(p.exercises || []).map((ex, ei) => this.exerciseHTML(ex, pi, ei)).join('')}
  </article>`;
};

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

App.reader = { paused: false, sents: [], p: null };
App.actions.play = function (btn) {
  const art = btn.closest('.passage');
  const spans = UI.$$('.sent', art);
  const rate = +UI.$('[data-act=rateSel]', art).value;
  UI.$$('.passage .sent.now').forEach((s) => s.classList.remove('now'));
  TTS.readList(spans.map((s) => s.textContent.trim()), {
    rate,
    onSentence: (i) => { UI.$$('.sent.now', art).forEach((s) => s.classList.remove('now')); spans[i].classList.add('now'); spans[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); },
    onDone: () => UI.$$('.sent.now', art).forEach((s) => s.classList.remove('now')),
  });
};
App.actions.pause = function (btn) {
  if (!('speechSynthesis' in window)) return;
  if (speechSynthesis.paused) { speechSynthesis.resume(); btn.textContent = 'Tạm dừng'; }
  else { speechSynthesis.pause(); btn.textContent = 'Tiếp tục'; }
};
App.actions.stopRead = function (btn) { TTS.stop(); UI.$$('.sent.now').forEach((s) => s.classList.remove('now')); };
App.actions.rateSel = function () { /* đổi tốc độ áp dụng ở lần bấm Nghe tiếp theo */ };

/* ======================= BÀI NÓI ======================= */
const SPEAK_BANK = [
  { kw: 'memory remember forget brain learn study recall revise review', topic: 'Describe something you learned that you still remember very well.', points: ['You should say:', 'what you learned', 'when and how you learned it', 'why you still remember it', 'and explain how it has helped you.'], part3: ['What helps people remember information?', 'Is it better to learn by heart or by understanding?'] },
  { kw: 'study school exam teacher student education course class', topic: 'Describe a teacher who helped you a lot in your studies.', points: ['You should say:', 'who the teacher was', 'what subject they taught', 'how they helped you', 'and explain why you remember them.'], part3: ['What makes a good teacher?', 'How is learning different today from the past?'] },
  { kw: 'habit routine decision resolution goal plan change effort', topic: 'Describe a goal or resolution you made and tried to keep.', points: ['You should say:', 'what the goal was', 'why you set it', 'how you tried to achieve it', 'and explain whether you kept it.'], part3: ['Why do people find it hard to keep their resolutions?', 'Do goals motivate people?'] },
  { kw: 'problem solve difficult challenge tackle deal', topic: 'Describe a time when you had to solve a difficult problem.', points: ['You should say:', 'what the problem was', 'how you dealt with it', 'who helped you', 'and explain how you felt afterwards.'], part3: ['Why do some people avoid facing problems?', 'How can schools teach problem-solving?'] },
  { kw: 'city place community public park building town', topic: 'Describe a place in your city that is important for the community.', points: ['You should say:', 'where it is', 'what people do there', 'how often you go there', 'and explain why it matters.'], part3: ['How do public places change a city?', 'Should governments spend more on public spaces?'] },
  { kw: 'person influence friend family role model', topic: 'Describe a person who has influenced you.', points: ['You should say:', 'who the person is', 'how you know them', 'what they did', 'and explain why they influenced you.'], part3: ['What makes someone a good role model?', 'Do celebrities have a responsibility to set an example?'] },
  { kw: 'technology phone internet computer online device app', topic: 'Describe a piece of technology you use every day.', points: ['You should say:', 'what it is', 'how you use it', 'how long you have had it', 'and explain why it is important to you.'], part3: ['Does technology make life easier or more stressful?', 'How will technology change education?'] },
  { kw: 'health sleep exercise food stress body mind tired', topic: 'Describe something you do to stay healthy.', points: ['You should say:', 'what you do', 'how often you do it', 'when you started', 'and explain how it affects you.'], part3: ['Why do people find it hard to lead a healthy lifestyle?', 'Who is responsible for public health?'] },
  { kw: 'environment pollution nature climate sustainable energy waste', topic: 'Describe something you do to help protect the environment.', points: ['You should say:', 'what you do', 'when you started', 'why you do it', 'and explain whether it makes a difference.'], part3: ['Who should do more for the environment, individuals or governments?', 'Will people care more about nature in the future?'] },
  { kw: 'travel trip holiday journey visit tourist', topic: 'Describe a memorable trip you took.', points: ['You should say:', 'where you went', 'who you went with', 'what you did', 'and explain why it was memorable.'], part3: ['Why do people like travelling?', 'How does tourism affect local places?'] },
  { kw: 'work job career office company business', topic: 'Describe a job or kind of work you would like to do in the future.', points: ['You should say:', 'what the job is', 'what skills it needs', 'why it interests you', 'and explain how you could prepare for it.'], part3: ['What do people look for in a job today?', 'Is working from home a good idea?'] },
];
const WRITE_BANK = [
  { kw: 'memory remember forget brain learn study recall revise review', topic: 'Some people believe that the best way to improve memory is to use learning techniques, while others think memory depends mainly on natural ability. Discuss both views and give your own opinion.', type: 'discussion' },
  { kw: 'study school exam teacher student education course class learn', topic: 'Some people think that students should memorise facts, while others believe it is more important to understand ideas. Discuss both views and give your opinion.', type: 'discussion' },
  { kw: 'habit routine decision resolution goal plan change effort', topic: 'Many people make resolutions but fail to keep them. What are the reasons for this, and what can be done to help people achieve their goals?', type: 'problem-solution' },
  { kw: 'transport city public road traffic building', topic: 'Some people believe that governments should spend more money on public transport rather than building new roads. To what extent do you agree or disagree?', type: 'opinion' },
  { kw: 'health sleep exercise food stress body mind tired', topic: 'Many young people today find it difficult to manage stress. What are the causes of this, and what can be done to help?', type: 'problem-solution' },
  { kw: 'work job career office company business technology', topic: 'Some people believe that working from home is better for employees, while others think working in an office is more effective. Discuss both views and give your opinion.', type: 'discussion' },
  { kw: 'technology phone internet computer online device app', topic: 'The use of technology in classrooms has increased greatly. Do the advantages of this development outweigh the disadvantages?', type: 'adv-disadv' },
  { kw: 'environment pollution nature climate sustainable energy waste', topic: 'Some people think that individuals can do little to protect the environment and that only governments and large companies can make a difference. To what extent do you agree or disagree?', type: 'opinion' },
];

// Chọn chủ đề khớp nhất với các từ hay quên (đếm từ khoá trùng); không có thì chọn ngẫu nhiên.
App.pickTopic = function (kind) {
  const bank = kind === 'speaking' ? SPEAK_BANK : WRITE_BANK;
  const weak = this.weakSource();
  const text = weak.map((w) => w.word + ' ' + w.meaning).join(' ').toLowerCase();
  const toks = new Set(text.match(/[a-z]+/g) || []);
  const scored = bank.map((t) => ({ t, s: t.kw.split(' ').filter((k) => toks.has(k) || text.includes(k)).length + Math.random() * 0.5 }));
  scored.sort((a, b) => b.s - a.s);
  return Object.assign({}, scored[0].t, { suggested: weak.slice(0, 6).map((w) => w.word) });
};

App.weakSource = function () {
  const due = this.dueWords();
  const pool = due.length ? due : this.words().filter((w) => !SRS.isNew(w));
  return SRS.weakWords(pool);
};

App.productionView = function (kind) {
  const weak = this.weakSource();
  const key = kind === 'speaking' ? 'speakTopic' : 'writeTopic';
  if (!this[key] && weak.length) this[key] = this.pickTopic(kind);
  const topic = this[key];
  const hist = Store.data.gen[kind].slice(-5).reverse();
  const isS = kind === 'speaking';
  const html = `
  <section class="panel">
    <h2>${isS ? `${I('mic')} Bài nói` : `${I('pen')} Bài viết`} — vận dụng các từ hay quên</h2>
    <p class="muted">Các từ bạn hay quên (lấy từ danh sách ôn hôm nay):</p>
    <div class="chips">${weak.map((w) => `<span class="chip warn" title="${UI.esc(w.meaning)}">${UI.esc(w.word)}</span>`).join('') || '<span class="muted">Chưa có từ nào để luyện. Hãy học và đánh dấu mức nhớ trước.</span>'}</div>
    <div class="row">
      <button class="btn primary" data-act="genTopic" data-kind="${kind}" ${weak.length ? '' : 'disabled'}>Tạo chủ đề từ các từ này</button>
      <button class="btn" data-act="bankTopic" data-kind="${kind}">Chủ đề có sẵn</button>
    </div>
  </section>
  ${topic ? `<section class="panel topic" id="topicBox">
    <h3>${isS ? 'Cue card' : 'Task 2'}</h3>
    <p class="big">${UI.esc(topic.topic)}</p>
    ${isS ? `<ul>${(topic.points || []).map((x) => `<li>${UI.esc(x)}</li>`).join('')}</ul>${(topic.part3 || []).length ? `<p class="muted"><b>Part 3:</b> ${topic.part3.map(UI.esc).join(' • ')}</p>` : ''}`
      : topic.outline_vi ? `<p class="muted">${UI.esc(topic.outline_vi)}</p>` : ''}
    ${(topic.suggested || []).length ? `<p>Thử dùng: ${topic.suggested.map((w) => `<span class="chip">${UI.esc(w)}</span>`).join('')}</p>` : ''}
  </section>
  <section class="panel">
    ${isS ? `
      <div class="recbar"><button class="btn rec" id="recBtn" data-act="toggleRec">Bắt đầu nói</button><span id="timer" class="timer">00:00</span><span class="muted" id="recHint">Nói 1–2 phút. Dùng Chrome/Edge để nhận dạng giọng nói.</span></div>
      <audio id="playback" controls hidden></audio>
      <label>Bản ghi (có thể sửa lại trước khi chấm)<textarea id="answerBox" rows="7" placeholder="Văn bản nhận dạng sẽ hiện ở đây. Nếu trình duyệt không hỗ trợ, hãy gõ lại những gì bạn nói."></textarea></label>`
    : `
      <div class="recbar"><button class="btn" data-act="toggleTimer" id="wTimerBtn">Bắt đầu tính giờ (40 phút)</button><span id="timer" class="timer">00:00</span><span class="counter" id="wc">0 từ</span></div>
      <label>Bài viết của bạn (tối thiểu 250 từ)<textarea id="answerBox" rows="16" placeholder="Viết bài của bạn ở đây..."></textarea></label>`}
    <div class="row"><button class="btn primary" data-act="gradeQuick" data-kind="${kind}">Chấm nhanh (tự động, miễn phí)</button><button class="btn" data-act="grade" data-kind="${kind}">Chấm sâu bằng Claude</button><span class="muted" id="gradeStatus"></span></div>
    <p class="muted">Chấm nhanh dùng thuật toán trong trình duyệt (đếm từ, từ nối, từ vựng đã dùng, lỗi phổ biến${isS ? ', tốc độ nói, độ rõ của giọng' : ''}) nên chỉ là điểm ước tính. Chấm sâu bằng Claude cho góp ý chi tiết hơn (cần API key hoặc sao chép-dán).</p>
  </section>
  <div id="result"></div>` : ''}
  ${hist.length ? `<section class="panel"><h3>Lịch sử gần đây</h3><div class="hist">${hist.map((h) => `<div><span class="muted">${SRS.fmtFull(h.date)}</span> <b>Band ${UI.band(h.overall)}</b> — ${UI.esc(h.topic.slice(0, 90))}…</div>`).join('')}</div></section>` : ''}`;
  return {
    html,
    after() {
      const box = UI.$('#answerBox');
      if (box && !isS) box.addEventListener('input', () => { UI.$('#wc').textContent = this.countWords(box.value) + ' từ'; });
    },
  };
};
App.views.speaking = function () { return this.productionView('speaking'); };
App.views.writing = function () { return this.productionView('writing'); };
App.countWords = (s) => (s.trim().match(/[A-Za-z0-9'’-]+/g) || []).length;

App.actions.bankTopic = function (el) {
  const kind = el.dataset.kind;
  this[kind === 'speaking' ? 'speakTopic' : 'writeTopic'] = this.pickTopic(kind);
  this.render();
};

App.actions.genTopic = async function (el) {
  const kind = el.dataset.kind;
  if (!AI.hasKey()) { this.actions.bankTopic.call(this, el); UI.toast('Đã chọn chủ đề phù hợp nhất từ kho có sẵn (cần API key để Claude tự viết chủ đề riêng).'); return; }
  el.disabled = true; el.textContent = 'Đang tạo...';
  try {
    const pr = AI.topicPrompt(kind, this.weakSource());
    const t = await AI.askJSON(pr);
    this[kind === 'speaking' ? 'speakTopic' : 'writeTopic'] = t;
    this.render();
  } catch (e) { UI.toast(e.message || 'Không tạo được chủ đề'); this.render(); }
};

/* --- ghi âm + nhận dạng giọng nói --- */
App.rec = { on: false, final: '', confs: [], t0: 0, timer: null, recognizer: null, media: null, chunks: [] };

App.actions.toggleRec = async function (btn) {
  const R = this.rec;
  const box = UI.$('#answerBox');
  if (R.on) { this.stopRec(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) UI.toast('Trình duyệt này không nhận dạng giọng nói — hãy dùng Chrome/Edge hoặc gõ văn bản.');
  R.on = true; R.final = box.value ? box.value + ' ' : ''; R.confs = []; R.t0 = Date.now(); R.chunks = [];
  btn.textContent = 'Dừng'; btn.classList.add('on'); box.readOnly = true;
  UI.$('#playback').hidden = true;
  R.timer = setInterval(() => { const s = Math.floor((Date.now() - R.t0) / 1000); UI.$('#timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 500);
  try {
    R.media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(R.media);
    mr.ondataavailable = (e) => R.chunks.push(e.data);
    mr.onstop = () => { const a = UI.$('#playback'); if (a) { a.src = URL.createObjectURL(new Blob(R.chunks, { type: 'audio/webm' })); a.hidden = false; } };
    mr.start(); R.mr = mr;
  } catch (e) { UI.toast('Không truy cập được micro. Hãy cho phép micro cho trang này.'); }
  if (SR) {
    const rc = new SR();
    rc.lang = 'en-US'; rc.continuous = true; rc.interimResults = true;
    rc.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { R.final += r[0].transcript.trim() + ' '; if (r[0].confidence) R.confs.push(r[0].confidence); }
        else interim += r[0].transcript;
      }
      const b = UI.$('#answerBox'); if (b) b.value = R.final + interim;
    };
    rc.onend = () => { if (R.on) { try { rc.start(); } catch (e) { /* đang chạy */ } } };
    rc.onerror = (ev) => { if (ev.error === 'not-allowed') { UI.toast('Micro bị chặn'); } };
    rc.start(); R.recognizer = rc;
  }
};

App.stopRec = function () {
  const R = this.rec;
  R.on = false; clearInterval(R.timer);
  R.seconds = Math.round((Date.now() - R.t0) / 1000);
  try { R.recognizer && R.recognizer.stop(); } catch (e) { /* bỏ qua */ }
  try { R.mr && R.mr.state !== 'inactive' && R.mr.stop(); } catch (e) { /* bỏ qua */ }
  if (R.media) R.media.getTracks().forEach((t) => t.stop());
  const btn = UI.$('#recBtn'), box = UI.$('#answerBox');
  if (btn) { btn.textContent = 'Nói lại / nói tiếp'; btn.classList.remove('on'); }
  if (box) { box.readOnly = false; box.value = R.final.trim() || box.value; }
};

App.actions.toggleTimer = function (btn) {
  const R = this.rec;
  if (R.timer) { clearInterval(R.timer); R.timer = null; R.seconds = Math.round((Date.now() - R.t0) / 1000); btn.textContent = 'Tiếp tục tính giờ'; return; }
  R.t0 = Date.now() - (R.seconds || 0) * 1000;
  btn.textContent = 'Dừng giờ';
  R.timer = setInterval(() => { const s = Math.floor((Date.now() - R.t0) / 1000); const el = UI.$('#timer'); if (!el) return; el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); el.classList.toggle('over', s > 2400); }, 500);
};

App.actions.grade = async function (btn) {
  const kind = btn.dataset.kind;
  const isS = kind === 'speaking';
  const R = this.rec;
  if (isS && R.on) this.stopRec();
  const text = UI.$('#answerBox').value.trim();
  const count = this.countWords(text);
  if (count < (isS ? 25 : 60)) { UI.toast(isS ? 'Bài nói quá ngắn để chấm (cần ít nhất ~25 từ).' : 'Bài viết quá ngắn để chấm.'); return; }
  const topic = isS ? this.speakTopic : this.writeTopic;
  const words = this.weakSource();
  const status = UI.$('#gradeStatus');
  btn.disabled = true; status.textContent = 'Đang chấm bài...';
  try {
    let pr;
    if (isS) {
      const secs = R.seconds || Math.max(30, Math.round(count / 2.2));
      const conf = R.confs.length ? (R.confs.reduce((a, b) => a + b, 0) / R.confs.length).toFixed(2) : 'n/a (typed or unavailable)';
      const fillers = (text.match(/\b(um+|uh+|er+|erm|you know)\b/gi) || []).length;
      pr = AI.speakingPrompt(topic, words, { seconds: secs, words: count, wpm: Math.round(count / secs * 60), conf, fillers }, text);
    } else {
      const mins = R.seconds ? Math.round(R.seconds / 60) : 0;
      pr = AI.writingPrompt(topic, words, text, count, mins);
    }
    const r = await AI.askJSON(pr);
    const keys = Object.keys(r.bands);
    r.overall = Math.round(keys.reduce((a, k) => a + Number(r.bands[k]), 0) / keys.length * 2) / 2;
    Store.data.gen[kind].push({ date: SRS.today(), topic: topic.topic, overall: r.overall, bands: r.bands, text });
    Store.prune(); Store.save();
    UI.$('#result').innerHTML = this.resultHTML(kind, r);
    UI.$('#result').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { UI.toast(e.message || 'Chấm bài thất bại'); }
  btn.disabled = false; status.textContent = '';
};

App.actions.gradeQuick = function (btn) {
  const kind = btn.dataset.kind, isS = kind === 'speaking', R = this.rec;
  if (isS && R.on) this.stopRec();
  const text = UI.$('#answerBox').value.trim();
  const count = this.countWords(text);
  if (count < (isS ? 10 : 40)) { UI.toast(isS ? 'Hãy nói hoặc gõ thêm một chút để chấm.' : 'Bài viết quá ngắn để chấm.'); return; }
  const words = this.weakSource();
  let r;
  if (isS) r = Quick.speaking(words, text, R.seconds || 0, R.confs);
  else r = Quick.writing(words, text, R.seconds ? Math.round(R.seconds / 60) : 0);
  const topic = isS ? this.speakTopic : this.writeTopic;
  Store.data.gen[kind].push({ date: SRS.today(), topic: topic.topic, overall: r.overall, bands: r.bands, text, quick: true });
  Store.prune(); Store.save();
  UI.$('#result').innerHTML = this.resultHTML(kind, r);
  UI.$('#result').scrollIntoView({ behavior: 'smooth' });
};

App.resultHTML = function (kind, r) {
  const labels = kind === 'speaking'
    ? { pronunciation: 'Phát âm', vocabulary: 'Từ vựng', grammar: 'Ngữ pháp', fluency: 'Độ trôi chảy', clarity: 'Mức độ rõ ý' }
    : { task: 'Task Response', coherence: 'Coherence & Cohesion', lexical: 'Lexical Resource', grammar: 'Grammar' };
  const c = r.comments || {};
  return `<section class="panel result">
    <div class="overall"><span>Band tổng</span><b>${UI.band(r.overall)}</b></div>
    <div class="bands">${Object.keys(labels).map((k) => `<div class="bandcard"><small>${labels[k]}</small><b>${r.bands[k] == null ? '—' : UI.band(r.bands[k])}</b><div class="track"><i style="width:${(r.bands[k] || 0) / 9 * 100}%"></i></div><p>${UI.esc(c[k] || '')}</p></div>`).join('')}</div>
    ${r.quick ? '<p class="note">Điểm ước tính bằng thuật toán, không phải giám khảo thật. Muốn góp ý chi tiết về lỗi và cách diễn đạt hay hơn, bấm “Chấm sâu bằng Claude”.</p>' : ''}
    ${kind === 'speaking' && !r.quick ? '<p class="note">Điểm phát âm chỉ là ước lượng từ văn bản nhận dạng giọng nói và độ tin cậy của trình nhận dạng — không nghe được âm thanh thật. Hãy coi đó là gợi ý.</p>' : ''}
    <h3>Từ mục tiêu</h3>
    <p>✅ Đã dùng: ${(r.used_words || []).map((w) => `<span class="chip good">${UI.esc(w)}</span>`).join('') || '—'}</p>
    <p>Chưa dùng: ${(r.missed_words || []).map((w) => `<span class="chip warn">${UI.esc(w)}</span>`).join('') || '—'}</p>
    ${r.word_use_feedback ? `<p class="muted">${UI.esc(r.word_use_feedback)}</p>` : ''}
    <h3>Lỗi cần sửa</h3>
    <div class="errs">${(r.errors || []).map((x) => `<div class="err"><div class="o">✗ ${UI.esc(x.original)}</div>${x.better ? `<div class="b">✓ ${UI.esc(x.better)}</div>` : ''}<div class="w">${UI.esc(x.why)}</div></div>`).join('') || '<p class="muted">Không có lỗi đáng kể.</p>'}</div>
    ${r.better_version ? `<h3>Phiên bản tốt hơn (gợi ý)</h3>
    <blockquote>${UI.esc(r.better_version).replace(/\n/g, '<br>')}</blockquote>
    <button class="btn" data-act="sayText" data-text="${UI.esc(r.better_version)}">Nghe bản mẫu</button>` : ''}
    <h3>Việc cần luyện tiếp</h3>
    <ul>${(r.next_steps || []).map((x) => `<li>${UI.esc(x)}</li>`).join('')}</ul>
  </section>`;
};
App.actions.sayText = function (el) { TTS.stop(); TTS.say(el.dataset.text); };


/* ======================= FLASHCARD ======================= */
App.fc = { ids: [], i: 0, flipped: false, front: 'word', done: {}, snap: {} };
App.actions.fcStart = function () {
  this.fc = { ids: UI.shuffle(this.dueWords().map((w) => w.id)), i: 0, flipped: false, front: this.fc.front || 'word', done: {}, snap: {} };
  if (!this.fc.ids.length) return;
  const el = document.createElement('div');
  el.id = 'fcModal'; el.className = 'modal';
  document.body.appendChild(el);
  this.fcRender();
};
App.fcGo = function (i) {
  const F = this.fc;
  F.i = Math.max(0, Math.min(F.ids.length, i));
  F.pickG = null;
  F.flipped = F.i < F.ids.length && F.done[F.ids[F.i]] !== undefined;   // thẻ đã chấm: hiện luôn đáp án
  this.fcRender();
};
App.fcRender = function () {
  const el = UI.$('#fcModal'); if (!el) return;
  const F = this.fc;
  const total = F.ids.length;
  const rated = Object.keys(F.done).length;
  if (F.i >= total) {
    const cnt = SRS.LEVELS.map(() => 0);
    Object.values(F.done).forEach((lv) => cnt[lv]++);
    el.innerHTML = `<div class="modal-box fc"><h3>Đã xem hết ${total} thẻ — đánh dấu ${rated}/${total} từ</h3>
      ${rated < total ? `<p class="note">Còn ${total - rated} từ chưa đánh dấu mức nhớ. Dùng nút “Trước” để quay lại.</p>` : ''}
      ${SRS.LEVELS.map((l, k) => cnt[k] ? `<div class="bar" style="grid-template-columns:200px 1fr 30px"><span class="tag ${l.cls}">${l.short}</span><div class="track"><i class="${l.cls}" style="width:${cnt[k] / total * 100}%"></i></div><b>${cnt[k]}</b></div>` : '').join('')}
      <div class="row end"><button class="btn" data-act="fcPrev">◀ Trước</button><button class="btn primary" data-act="fcClose">Đóng</button></div></div>`;
    return;
  }
  const w = this.byId(F.ids[F.i]);
  const mine = F.done[w.id];
  const frontWord = F.front === 'word';
  const front = frontWord
    ? `<div class="fc-word">${UI.esc(w.word)}</div>${w.ipa ? `<div class="ipa">${UI.esc(w.ipa)}</div>` : ''}`
    : `<div class="fc-mean">${UI.esc(w.meaning)}</div>${w.pos ? `<span class="pos">${UI.esc(UI.posAbbr(w.pos))}</span>` : ''}`;
  const back = frontWord
    ? `<div class="fc-mean">${UI.esc(w.meaning)}</div>${w.pos ? `<span class="pos">${UI.esc(UI.posAbbr(w.pos))}</span>` : ''}${w.example ? `<div class="ex">“${UI.esc(w.example)}”</div>` : ''}`
    : `<div class="fc-word">${UI.esc(w.word)}</div>${w.ipa ? `<div class="ipa">${UI.esc(w.ipa)}</div>` : ''}${w.example ? `<div class="ex">“${UI.esc(w.example)}”</div>` : ''}`;
  el.innerHTML = `<div class="modal-box fc">
    <div class="fc-top"><span class="muted">${F.i + 1} / ${total} · đã đánh dấu ${rated}</span>
      <label class="check"><input type="checkbox" data-act="fcSide" ${frontWord ? '' : 'checked'}> Mặt trước là nghĩa</label>
      <button class="icon" data-act="fcClose" title="Đóng (Esc)">${I('x', 16)}</button></div>
    <div class="track"><i style="width:${F.i / total * 100}%"></i></div>
    <div class="fc-card" data-act="fcFlip" data-id="${w.id}">
      <div class="fc-face">${front}<button class="spk" data-act="fcSpeak" title="Nghe (S)">${I('volume', 16)}</button></div>
      ${F.flipped ? `<hr><div class="fc-face">${back}</div>` : '<div class="muted fc-hint">Bấm vào thẻ hoặc phím Space để lật</div>'}
    </div>
    ${mine !== undefined ? `<p class="rated">Đã đánh dấu: <span class="tag ${SRS.LEVELS[mine].cls}">${SRS.LEVELS[mine].short}</span> → nhắc lại ${SRS.fmtFull(w.schedule[0] || SRS.today())}. Bấm mức khác để đổi.</p>` : ''}
    ${F.flipped ? this.fcRateHTML(F, mine)
      : '<div class="row end"><button class="btn primary" data-act="fcFlip">Lật thẻ</button></div>'}
    <div class="fc-nav"><button class="btn" data-act="fcPrev" ${F.i === 0 ? 'disabled' : ''}>◀ Trước</button><span class="muted">← → để chuyển thẻ</span><button class="btn" data-act="fcNext">${F.i === total - 1 ? 'Kết thúc' : 'Sau'} ▶</button></div>
  </div>`;
  if (frontWord && !F.flipped) TTS.speakWord(w);
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
App.actions.fcGroup = function (el) { this.fc.pickG = +el.dataset.g; this.fcRender(); };
App.actions.fcBack = function () { this.fc.pickG = null; this.fcRender(); };
App.actions.fcFlip = function (el, e) { if (e && e.target.closest('.spk')) return; this.fc.flipped = true; this.fcRender(); };
App.actions.fcSpeak = function () { TTS.speakWord(this.byId(this.fc.ids[this.fc.i])); };
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
  this.fcGo(F.i + 1);
};
App.actions.fcClose = function () { TTS.stop(); const m = UI.$('#fcModal'); if (m) m.remove(); this.render(); };
document.addEventListener('keydown', (e) => {
  if (!UI.$('#fcModal')) return;
  const F = App.fc, inCard = F.i < F.ids.length;
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
    <h2>${I('key')} Kết nối Claude (tạo bài đọc & chấm bài tự động)</h2>
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
    <p class="muted">Giọng chất lượng cao nhất có sẵn trên máy: trên Edge chọn các giọng có chữ “Natural” (vd. Microsoft Aria/Jenny Online (Natural)).</p>
    <label>Giọng<select id="voiceSel"><option value="">Tự chọn giọng tự nhiên nhất</option>${TTS.voices.map((v) => `<option value="${UI.esc(v.voiceURI)}" ${v.voiceURI === s.voice ? 'selected' : ''}>${UI.esc(v.name)} (${v.lang})</option>`).join('')}</select></label>
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
    <div class="row"><button class="btn" data-act="cloudSync">Đồng bộ ngay</button><button class="btn danger" data-act="signOut">Đăng xuất</button><span class="muted" id="cloudOut">${UI.esc(Cloud.status)}</span></div></section>`;
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
