/* Lưu dữ liệu trong localStorage của trình duyệt */
const Store = {
  KEY: 'vocabApp.v1',
  data: null,

  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.data = null; }
    if (!this.data) this.data = {};
    this.data.words = this.data.words || [];
    this.data.settings = Object.assign({ apiKey: '', model: 'claude-sonnet-5-5', voice: '', rate: 0.95 }, this.data.settings);
    this.data.gen = this.data.gen || { reading: {}, speaking: [], writing: [] };
    return this.data;
  },

  save() {
    this.data.updatedAt = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); if (typeof Sync !== 'undefined') Sync.schedule(); return true; }
    catch (e) { UI.toast('Không lưu được dữ liệu (bộ nhớ trình duyệt đầy hoặc bị chặn).'); return false; }
  },

  uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'w' + Date.now() + Math.random().toString(16).slice(2)); },

  newWord(o) {
    return Object.assign({
      id: this.uid(), word: '', ipa: '', pos: '', meaning: '', example: '', audio: '',
      added: SRS.today(), level: null, schedule: [], history: [], lapses: 0, reviews: 0, mastered: false, lastReviewed: '',
    }, o);
  },

  addWord(o) {
    const key = (o.word || '').trim().toLowerCase();
    if (!key || this.data.words.some((w) => w.word.toLowerCase() === key)) return null;
    const w = this.newWord(Object.assign({}, o, { word: o.word.trim() }));
    this.data.words.push(w);
    return w;
  },

  prune() {
    const keys = Object.keys(this.data.gen.reading).sort();
    while (keys.length > 14) delete this.data.gen.reading[keys.shift()];
    this.data.gen.speaking = this.data.gen.speaking.slice(-30);
    this.data.gen.writing = this.data.gen.writing.slice(-30);
  },
};
