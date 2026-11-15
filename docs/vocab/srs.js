/* Spaced repetition logic (pure functions, no DOM) */
(function (root) {
  // Mỗi mức có 2 mốc ôn, tính từ ngày đánh dấu mức đó.
  const LEVELS = [
    { name: 'Chưa nhớ', short: 'Chưa nhớ', iv: [1, 3], cls: 'l0' },
    { name: 'Nhớ chưa chắc', short: 'Nhớ chưa chắc', iv: [7, 14], cls: 'l1' },
    { name: 'Nhớ nhưng chưa vận dụng', short: 'Nhớ, chưa vận dụng', iv: [21, 30], cls: 'l2' },
    { name: 'Vận dụng có hỗ trợ', short: 'Vận dụng có hỗ trợ', iv: [45, 60], cls: 'l3' },
    { name: 'Vận dụng thành thạo', short: 'Vận dụng thành thạo', iv: [90, 120], cls: 'l4' },
  ];

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

  function plan(levelIdx, from) { return LEVELS[levelIdx].iv.map((n) => addDays(from, n)); }

  // Đánh dấu mức nhớ cho từ vào ngày t. Trả về lịch ôn mới.
  function rate(w, li, t) {
    const prev = isNew(w) ? null : w.level;
    const remaining = (w.schedule || []).filter((d) => d > t);
    w.history = w.history || [];
    w.history.push({ date: t, level: li });
    if (prev !== null) {
      w.reviews = (w.reviews || 0) + 1;
      if (li <= 1 || li < prev) w.lapses = (w.lapses || 0) + 1;
    }
    if (prev === li && remaining.length > 0) {
      // Ôn mốc đầu của cùng mức: giữ nguyên mốc còn lại (vd 1/11 → 2/11, 4/11).
      w.schedule = remaining;
      w.mastered = false;
    } else if (prev === li && li === LEVELS.length - 1) {
      // Hoàn thành mốc cuối của mức cao nhất.
      w.schedule = [];
      w.mastered = true;
    } else {
      w.schedule = plan(li, t);
      w.mastered = false;
    }
    w.level = li;
    w.lastReviewed = t;
    return w.schedule;
  }

  // Từ "hay quên": đang ở mức thấp hoặc từng quên nhiều lần. Ưu tiên từ quên nhiều nhất.
  function weakWords(due) {
    const score = (w) => (w.lapses || 0) * 2 + (w.level <= 1 ? 2 : 0) + (w.level === 2 ? 1 : 0);
    const sorted = due.slice().sort((a, b) => score(b) - score(a));
    const weak = sorted.filter((w) => score(w) >= 2);
    return (weak.length >= 3 ? weak : sorted).slice(0, 8);
  }

  const api = { LEVELS, iso, parse, addDays, diffDays, today, fmt, fmtFull, isNew, isDue, plan, rate, weakWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof window !== 'undefined' ? window : globalThis);
