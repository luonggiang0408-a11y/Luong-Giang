/* Tiện ích giao diện + đọc giọng nói (Web Speech API) */
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

const TTS = {
  voices: [],
  queueId: 0,

  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); };
    load();
    speechSynthesis.onvoiceschanged = load;
  },

  // Ưu tiên giọng tự nhiên (Edge "Natural", Google US, Apple Samantha...).
  pick() {
    const want = Store.data.settings.voice;
    if (want) { const v = this.voices.find((x) => x.voiceURI === want); if (v) return v; }
    const us = this.voices.filter((v) => /en[-_]US/i.test(v.lang));
    const pool = us.length ? us : this.voices;
    const rank = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : /samantha|ava|allison|emma|jenny|aria/i.test(v.name) ? 2 : 3);
    return pool.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
  },

  say(text, opts = {}) {
    if (!('speechSynthesis' in window)) { UI.toast('Trình duyệt không hỗ trợ đọc giọng nói'); return null; }
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pick();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = opts.rate || Store.data.settings.rate || 0.95;
    if (opts.onend) u.onend = opts.onend;
    if (opts.onerror) u.onerror = opts.onerror;
    speechSynthesis.speak(u);
    return u;
  },

  speakWord(w) {
    this.stop();
    if (w.audio) { const a = new Audio(w.audio); a.play().catch(() => this.say(w.word, { rate: 0.85 })); }
    else this.say(w.word, { rate: 0.85 });
  },

  stop() { this.queueId++; if ('speechSynthesis' in window) speechSynthesis.cancel(); },

  // Đọc lần lượt các câu; onSentence(i) để tô sáng câu đang đọc.
  readList(sentences, { rate, onSentence, onDone, from = 0 }) {
    this.stop();
    const id = this.queueId;
    const next = (i) => {
      if (id !== this.queueId) return;
      if (i >= sentences.length) { onDone && onDone(); return; }
      onSentence && onSentence(i);
      this.say(sentences[i], { rate, onend: () => next(i + 1), onerror: () => next(i + 1) });
    };
    next(from);
  },
};
