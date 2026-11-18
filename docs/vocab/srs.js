/* Spaced repetition logic (pure functions, no DOM) */
(function (root) {
  // 10 mốc ôn: mỗi nút là một mốc, lịch ôn kế tiếp = ngày đánh dấu + số ngày của mốc.
  const DAYS = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120];
  const GROUPS = [
    { name: 'Chưa nhớ', short: 'Chưa nhớ', cls: 'l0' },
    { name: 'Nhớ chưa chắc', short: 'Chưa chắc', cls: 'l1' },
    { name: 'Nhớ nhưng chưa vận dụng', short: 'Chưa vận dụng', cls: 'l2' },
    { name: 'Vận dụng có hỗ trợ', short: 'Có hỗ trợ', cls: 'l3' },
    { name: 'Vận dụng thành thạo', short: 'Thành thạo', cls: 'l4' },
  ];
  const LEVELS = DAYS.map((d, i) => {
    const g = GROUPS[Math.floor(i / 2)];
    return { name: g.name, short: g.short + ' · ' + d + 'd', cls: g.cls, days: d, group: Math.floor(i / 2) };
  });
  const LAST = LEVELS.length - 1;

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const today = () => iso(new Date());
  const fmt = (s) => { const [, m, d] = s.split('-'); return d + '/' + m; };
  const fmtFull = (s) => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };

  const isNew = (w) => w.level === null || w.level === undefined;
  const isDue = (w, t) => !isNew(w) && !w.mastered && w.schedule.length > 0 && w.schedule[0] <= t;

  function plan(levelIdx, from) { return [addDays(from, LEVELS[levelIdx].days)]; }

  // Đánh dấu mốc li (0-9) cho từ vào ngày t → nhắc lại sau LEVELS[li].days ngày kể từ t.
  function rate(w, li, t) {
    const prev = isNew(w) ? null : w.level;
    w.history = w.history || [];
    // Lưu trạng thái trước lần chấm đầu tiên trong ngày để có thể "Chấm lại" (hoàn tác).
    if (!(w.undo && w.undo.on === t)) {
      w.undo = { on: t, level: prev, schedule: (w.schedule || []).slice(), mastered: !!w.mastered, lapses: w.lapses || 0, reviews: w.reviews || 0, lastReviewed: w.lastReviewed || '', hist: w.history.length };
    }
    w.history.push({ date: t, level: li });
    if (prev !== null) {
      w.reviews = (w.reviews || 0) + 1;
      if (LEVELS[li].group === 0 || li < prev) w.lapses = (w.lapses || 0) + 1;
    }
    if (prev === LAST && li === LAST) { w.schedule = []; w.mastered = true; }   // hoàn thành chu kỳ
    else { w.schedule = plan(li, t); w.mastered = false; }
    w.level = li;
    w.lastReviewed = t;
    w.v = 2;
    w.mod = Date.now();
    return w.schedule;
  }

  // Hoàn tác lần chấm trong ngày t: trả từ về trạng thái trước khi chấm.
  function unrate(w, t) {
    const u = w.undo;
    if (!u || u.on !== t) return false;
    w.level = u.level; w.schedule = u.schedule; w.mastered = u.mastered; w.lapses = u.lapses; w.reviews = u.reviews; w.lastReviewed = u.lastReviewed;
    w.history = (w.history || []).slice(0, u.hist);
    delete w.undo;
    w.mod = Date.now();
    return true;
  }

  // Sửa mức đã chấm của lần ôn gần nhất: lịch ôn tính lại từ chính ngày đó, không thay đổi số lần ôn/quên.
  function rerate(w, li) {
    const base = w.lastReviewed || today();
    w.level = li;
    w.schedule = plan(li, base);
    w.mastered = false;
    const h = w.history || [];
    if (h.length && h[h.length - 1].date === base) h[h.length - 1].level = li;
    w.v = 2;
    w.mod = Date.now();
    return w.schedule;
  }

  // Dữ liệu cũ (5 mức × 2 mốc) → 10 mốc: lấy mốc đầu của mức cũ, giữ lịch ôn kế tiếp đã có.
  function migrate(w) {
    if (w.v === 2) return w;
    if (!isNew(w)) { w.level = Math.min(LAST, w.level * 2); w.schedule = (w.schedule || []).slice(0, 1); }
    w.v = 2;
    return w;
  }

  // Từ "hay quên": đang ở nhóm thấp hoặc từng quên nhiều lần. Ưu tiên từ quên nhiều nhất.
  function weakWords(due) {
    const grp = (w) => LEVELS[w.level].group;
    const score = (w) => (w.lapses || 0) * 2 + (grp(w) <= 1 ? 2 : 0) + (grp(w) === 2 ? 1 : 0);
    const sorted = due.slice().sort((a, b) => score(b) - score(a));
    const weak = sorted.filter((w) => score(w) >= 2);
    return (weak.length >= 3 ? weak : sorted).slice(0, 8);
  }

  const api = { DAYS, GROUPS, LEVELS, iso, parse, addDays, diffDays, today, fmt, fmtFull, isNew, isDue, plan, rate, unrate, rerate, migrate, weakWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof window !== 'undefined' ? window : globalThis);
