/* Tiện ích giao diện + đọc giọng nói (Web Speech API) */

/* Bộ biểu tượng SVG đồng nhất (nét 2px, theo màu chữ) */
const ICONS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  reading: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  cards: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 9v9M17 5v13"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
function I(name, size) {
  size = size || 18;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const UI = {
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  $(sel, el) { return (el || document).querySelector(sel); },
  $$(sel, el) { return Array.from((el || document).querySelectorAll(sel)); },
  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  },
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  posAbbr(p) {
    const m = { noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv', preposition: 'prep', conjunction: 'conj', pronoun: 'pron', interjection: 'excl', phrase: 'phr' };
    return m[(p || '').toLowerCase()] || p || '';
  },
  band(n) { return (Math.round(n * 2) / 2).toFixed(1); },
};

/* Đọc giọng nói. Ưu tiên file mp3 giọng Emma (tạo sẵn bằng tools/gen_vocab_audio.py) nên mọi thiết bị nghe cùng một giọng;
   chưa có file thì dùng giọng của trình duyệt. Tên file = cyrb53(văn bản chuẩn hoá) — phải khớp với script Python. */
const TTS = {
  voices: [],
  queueId: 0,
  el: null,
  mode: 'idle',   // 'audio' | 'speech' | 'idle'

  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); };
    load();
    speechSynthesis.onvoiceschanged = load;
  },

  /* ---- chuẩn hoá văn bản + tên file (giống hệt tools/gen_vocab_audio.py) ---- */
  ws(s) { return String(s || '').replace(/\s+/g, ' ').trim(); },
  wordText(w) {
    return this.ws(String(w || '').replace(/\(([^)]*)\)/g, ' $1 ').replace(/\bsb\b/gi, 'somebody').replace(/\bsth\b/gi, 'something').replace(/\s*[=\/]\s*/g, ', '));
  },
  exampleText(e) { return this.ws(String(e || '').split('→')[0]); },
  sentText(s) { return this.ws(String(s || '').replace(/\*\*/g, '')); },
  hash(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  },
  fileFor(text) { return 'audio/' + this.hash(text) + '.mp3'; },

  // Một thẻ <audio> dùng chung (iOS chỉ cho phát tiếp sau khi người dùng đã chạm một lần).
  audioEl() { if (!this.el) { this.el = new Audio(); this.el.preload = 'auto'; } return this.el; },

  // Ưu tiên giọng tự nhiên của trình duyệt (dự phòng khi chưa có file Emma).
  pick() {
    const want = Store.data.settings.voice;
    if (want) { const v = this.voices.find((x) => x.voiceURI === want); if (v) return v; }
    const us = this.voices.filter((v) => /en[-_]US/i.test(v.lang));
    const pool = us.length ? us : this.voices;
    const rank = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : /samantha|ava|allison|emma|jenny|aria/i.test(v.name) ? 2 : 3);
    return pool.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
  },

  // Giọng trình duyệt (dự phòng)
  browserSay(text, opts) {
    if (!('speechSynthesis' in window)) { UI.toast('Chưa có file âm thanh và trình duyệt không hỗ trợ đọc giọng nói'); opts.onend && opts.onend(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pick();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = opts.rate || Store.data.settings.rate || 0.95;
    if (opts.onend) u.onend = opts.onend;
    u.onerror = () => { opts.onerror ? opts.onerror() : opts.onend && opts.onend(); };
    this.mode = 'speech';
    speechSynthesis.speak(u);
  },

  // Phát file mp3 của đúng văn bản này; không có file thì gọi fail().
  playFile(text, opts, fail) {
    const a = this.audioEl(), id = this.queueId;
    const speed = Math.max(0.6, Math.min(1.5, (opts.rate || Store.data.settings.rate || 0.95) / 0.95));
    a.onended = () => { if (id === this.queueId) { this.mode = 'idle'; opts.onend && opts.onend(); } };
    a.onerror = () => { if (id === this.queueId) fail(); };
    a.src = this.fileFor(text);
    a.playbackRate = speed;
    this.mode = 'audio';
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (id === this.queueId && !(e && e.name === 'AbortError')) fail(); });
  },

  say(text, opts = {}) {
    const t = this.ws(text);
    if (!t) { opts.onend && opts.onend(); return; }
    const id = this.queueId;
    this.playFile(t, opts, () => { if (id === this.queueId) this.browserSay(t, opts); });
  },

  speakWord(w) {
    this.stop();
    const t = this.wordText(w.word), id = this.queueId;
    const opts = { rate: 0.9 };
    this.playFile(t, opts, () => {
      if (id !== this.queueId) return;
      if (w.audio) { const a = this.audioEl(); a.onerror = () => { if (id === this.queueId) this.browserSay(t, { rate: 0.85 }); }; a.onended = null; a.src = w.audio; a.playbackRate = 1; a.play().catch(() => this.browserSay(t, { rate: 0.85 })); }
      else this.browserSay(t, { rate: 0.85 });
    });
  },

  speakExample(text) { this.stop(); this.say(this.exampleText(text)); },

  stop() {
    this.queueId++; this.mode = 'idle';
    if (this.el) { this.el.onended = null; this.el.onerror = null; try { this.el.pause(); } catch (e) { /* bỏ qua */ } }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
  pause() { if (this.mode === 'audio' && this.el) this.el.pause(); else if ('speechSynthesis' in window) speechSynthesis.pause(); },
  resume() { if (this.mode === 'audio' && this.el) this.el.play().catch(() => {}); else if ('speechSynthesis' in window) speechSynthesis.resume(); },

  // Đọc lần lượt các câu; onSentence(i) để tô sáng câu đang đọc.
  readList(sentences, { rate, onSentence, onDone, from = 0 }) {
    this.stop();
    const id = this.queueId;
    const next = (i) => {
      if (id !== this.queueId) return;
      if (i >= sentences.length) { onDone && onDone(); return; }
      onSentence && onSentence(i);
      this.say(this.sentText(sentences[i]), { rate, onend: () => next(i + 1), onerror: () => next(i + 1) });
    };
    next(from);
  },
};
