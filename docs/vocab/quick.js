/* Chấm nhanh bằng thuật toán trong trình duyệt (miễn phí, tức thì, không gọi AI).
   Dựa trên cách chấm của trang bài tập hằng ngày. Đây chỉ là ĐIỂM ƯỚC TÍNH từ các chỉ số bề mặt:
   số từ, tốc độ, từ nối, từ vựng đã dùng, lỗi ngữ pháp phổ biến, độ tin cậy nhận dạng giọng nói. */
const Quick = {
  toks(t) { return (String(t).toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || []); },
  stem(w) { return w.replace(/'(s|t|re|ve|ll|d)$/, '').replace(/(ing|ed|es|s|ly|d)$/, ''); },
  half(x) { return Math.max(1, Math.min(8, Math.round(x * 2) / 2)); },

  CONN: ['however', 'although', 'though', 'whereas', 'while', 'therefore', 'firstly', 'first of all', 'secondly', 'finally', 'for example', 'for instance', 'in addition', 'moreover', 'as a result', 'despite', 'on the other hand', 'in contrast', 'instead', 'besides', 'overall', 'in conclusion', 'because', 'so that', 'as well as', 'furthermore', 'nevertheless', 'consequently'],
  ERR: [
    [/\b(he|she|it)\s+(go|have|do|make|want|need|like|take|get|know|think|live|work|say|come|give|use|try|feel|help|become|love|enjoy)\b/g, 'chủ ngữ số ít + động từ nguyên mẫu (thiếu -s)'],
    [/\b(i|you|we|they)\s+(goes|has|does|makes|wants|needs|likes|takes|gets|knows|thinks|lives|works|says|comes|gives|uses|tries|feels|helps)\b/g, 'chủ ngữ số nhiều + động từ thêm -s'],
    [/\b(more|most)\s+\w+(er|est)\b/g, 'so sánh kép (more …-er)'],
    [/\b(didn't|did not|doesn't|does not|don't|do not)\s+\w+ed\b/g, 'sau trợ động từ phủ định dùng động từ nguyên mẫu'],
    [/\b(peoples|informations|advices|childs|furnitures|knowledges|equipments)\b/g, 'danh từ không đếm được/bất quy tắc dùng sai số nhiều'],
    [/\b(a lot of|many)\s+(person|thing|child)\b/g, 'danh từ đếm được cần ở dạng số nhiều'],
    [/\bI am agree\b|\bI am live\b|\bI am go\b/gi, 'I am + động từ nguyên mẫu'],
  ],
  GR: [
    ['mệnh đề quan hệ', /\b(which|who|whom|whose|where)\b/],
    ['câu điều kiện/giả định', /\b(if|unless|would|could|might)\b/],
    ['bị động', /\b(was|were|is|are|been|being|get|got)\s+(\w+ed|made|done|built|given|taken|known|seen|written|held|paid|chosen|grown)\b/],
    ['thì hoàn thành', /\b(have|has|had)\s+(\w+ed|been|done|made|gone|seen|taken|had|got|known|become|lived|spent)\b/],
    ['liên từ nhượng bộ/lý do', /\b(although|though|whereas|while|despite|because|since|so that|as a result|even though)\b/],
    ['so sánh', /\b(more|less|better|worse|bigger|cheaper|easier)\b.*\bthan\b|\b(as)\s+\w+\s+as\b/],
    ['V-ing/to-V chỉ mục đích', /\b(in order to|so as to|instead of|by \w+ing|before \w+ing|after \w+ing)\b/],
    ['thì quá khứ', /\b(was|were|went|had|did|came|saw|took|made|felt|\w+ed)\b/],
  ],
  FILL: /\b(um+|uh+|er+|erm|ah+|hmm+)\b|\byou know\b|\bi mean\b|\bkind of\b|\bsort of\b/g,

  usedWords(words, T) {
    const S = new Set(T.map((w) => this.stem(w)));
    return words.filter((w) => {
      const ws = this.toks(w).filter((x) => x !== 'sb' && x !== 'sth');
      return ws.length && ws.filter((x) => S.has(this.stem(x))).length / ws.length >= 0.75;
    });
  },

  // Chỉ số dùng chung cho nói và viết.
  analyse(text, targets) {
    const low = text.toLowerCase().replace(/[’‘]/g, "'");
    const T = this.toks(low), n = T.length;
    const conn = this.CONN.filter((c) => new RegExp('\\b' + c + '\\b').test(low));
    const fill = (low.match(this.FILL) || []).length;
    let rep = 0; for (let i = 1; i < n; i++) if (T[i] === T[i - 1] && !['very', 'that', 'had'].includes(T[i])) rep++;
    const uniq = new Set(T.map((w) => this.stem(w))).size, ttr = n ? uniq / n : 0;
    const advr = n ? T.filter((w) => w.length >= 8).length / n : 0;
    const used = this.usedWords(targets, T);
    const cats = this.GR.filter((g) => g[1].test(low)).map((g) => g[0]);
    const errs = [];
    this.ERR.forEach((e) => { const m = low.match(e[0]); if (m) m.forEach((x) => errs.push({ s: x, w: e[1] })); });
    const reasons = (low.match(/\b(because|for example|for instance|such as|one reason|since|so that|as a result)\b/g) || []).length;
    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    return { low, T, n, conn, fill, rep, ttr, advr, used, missing: targets.filter((w) => !used.includes(w)), cats, errs, reasons, sentences };
  },

  lexical(a, need) {
    let l = 3.5 + 1.5 * Math.min(1, a.used.length / need) + (a.used.length > need ? .5 : 0) + (a.n >= 30 && a.ttr >= .6 ? .5 : 0) + (a.n >= 30 && a.ttr >= .7 ? .5 : 0) + (a.advr >= .06 ? .5 : 0) + (a.advr >= .1 ? .5 : 0);
    return l;
  },
  grammar(a) {
    return 3.5 + Math.min(2.4, a.cats.length * .4) + (a.n >= 45 ? .5 : 0) + (a.n >= 80 ? .5 : 0) - Math.min(2, a.errs.length * .5);
  },

  shape(bands, comments, a, steps) {
    const keys = Object.keys(bands).filter((k) => bands[k] !== null);
    return {
      bands, overall: this.half(keys.reduce((s, k) => s + bands[k], 0) / keys.length), comments,
      errors: a.errs.slice(0, 6).map((e) => ({ original: e.s, better: '', why: e.w })),
      used_words: a.used, missed_words: a.missing, better_version: '', next_steps: steps, quick: true,
    };
  },

  speaking(words, text, seconds, confs) {
    const targets = words.map((w) => w.word);
    const a = this.analyse(text, targets);
    const need = Math.min(3, targets.length || 3);
    const wpm = seconds > 3 ? Math.round(a.n / (seconds / 60)) : null;
    let f = 3.5 + (a.n >= 25 ? .5 : 0) + (a.n >= 45 ? .5 : 0) + (a.n >= 70 ? .5 : 0) + (a.n >= 100 ? .5 : 0) + Math.min(1.5, a.conn.length * .3);
    if (wpm !== null) f += (wpm >= 100 && wpm <= 170) ? 1 : (wpm >= 80 && wpm < 100) ? .5 : wpm < 60 ? -.5 : 0;
    f -= Math.min(1.5, .25 * Math.max(0, a.fill + a.rep - 1));
    let l = this.lexical(a, need), g = this.grammar(a);
    // Rõ ý: có ý chính, lý do/ví dụ, đủ độ dài, câu không quá rời rạc.
    let c = 3.5 + (a.n >= 45 ? .5 : 0) + (a.n >= 80 ? .5 : 0) + Math.min(1.5, a.reasons * .5) + (a.sentences >= 4 ? .5 : 0) + (a.conn.length >= 2 ? .5 : 0) + (a.n >= 120 ? .5 : 0);
    let p = null, pm = null;
    if (confs && confs.length) {
      pm = confs.reduce((x, y) => x + y, 0) / confs.length;
      p = pm >= .95 ? 7.5 : pm >= .9 ? 7 : pm >= .85 ? 6.5 : pm >= .8 ? 6 : pm >= .7 ? 5.5 : pm >= .6 ? 5 : pm >= .5 ? 4.5 : 4;
    }
    if (a.n < 20) { f = Math.min(f, 4.5); l = Math.min(l, 4.5); g = Math.min(g, 4.5); c = Math.min(c, 4.5); if (p !== null) p = Math.min(p, 5); }
    const bands = { pronunciation: p === null ? null : this.half(p), vocabulary: this.half(l), grammar: this.half(g), fluency: this.half(f), clarity: this.half(c) };
    const comments = {
      pronunciation: pm === null ? 'Chưa chấm được vì không có dữ liệu nhận dạng giọng nói (gõ tay hoặc trình duyệt không hỗ trợ). Dùng Chrome/Edge và ghi âm.' : `Trình nhận dạng hiểu đúng khoảng ${Math.round(pm * 100)}% lời bạn nói. Đây chỉ là ước lượng độ rõ của phát âm, không nghe được âm thanh thật.`,
      vocabulary: `Dùng ${a.used.length}/${targets.length} từ mục tiêu${a.used.length ? ': ' + a.used.join(', ') : ''}. Độ đa dạng từ ${Math.round(a.ttr * 100)}%.`,
      grammar: (a.cats.length ? `Cấu trúc đã dùng: ${a.cats.join(', ')}. ` : 'Gần như chỉ dùng câu đơn; thử thêm mệnh đề quan hệ, câu điều kiện hoặc although/whereas. ') + (a.errs.length ? `Có ${a.errs.length} lỗi phổ biến phát hiện bằng quy tắc.` : 'Không phát hiện lỗi phổ biến bằng quy tắc tự động.'),
      fluency: `Khoảng ${a.n} từ${wpm ? ` (≈ ${wpm} từ/phút)` : ''}; ${a.conn.length ? 'từ nối: ' + a.conn.slice(0, 5).join(', ') : 'chưa thấy từ nối rõ ràng'}; ${a.fill} từ đệm, ${a.rep} lần lặp từ.`,
      clarity: `${a.reasons} lý do/ví dụ, ${a.sentences} câu. ${a.n < 60 ? 'Câu trả lời còn ngắn; hướng tới 1 ý chính + 1–2 lý do/ví dụ.' : 'Độ dài ổn; kiểm tra ý có đi thẳng vào câu hỏi không.'}`,
    };
    const steps = [];
    if (a.missing.length) steps.push('Dùng thêm các từ chưa dùng: ' + a.missing.slice(0, 5).join(', '));
    if (a.n < 80) steps.push('Nói dài hơn: mỗi ý chính kèm 1 lý do (because…) và 1 ví dụ (for example…)');
    if (a.fill + a.rep > 1) steps.push('Giảm từ đệm “um/uh”: ngừng lặng ngắn rồi nói tiếp');
    if (!steps.length) steps.push('Thử nâng cấp bằng cấu trúc phức (mệnh đề quan hệ, điều kiện) và từ vựng chính xác hơn');
    return this.shape(bands, comments, a, steps);
  },

  writing(words, text, minutes) {
    const targets = words.map((w) => w.word);
    const a = this.analyse(text, targets);
    const need = Math.min(3, targets.length || 3);
    const paras = text.split(/\n\s*\n/).filter((x) => x.trim()).length;
    const opinion = /\b(in my opinion|i believe|i think|i agree|i disagree|from my perspective|to my mind)\b/i.test(text);
    const wc = a.n;
    let t = 3.5 + (wc >= 150 ? .5 : 0) + (wc >= 200 ? .5 : 0) + (wc >= 250 ? 1 : 0) + (wc >= 300 ? .5 : 0) + (paras >= 4 ? .5 : 0) + (opinion ? .5 : 0) + Math.min(1, a.reasons * .25);
    let c = 3.5 + (paras >= 3 ? .5 : 0) + (paras >= 4 ? .5 : 0) + Math.min(2.5, a.conn.length * .35) + (wc >= 250 ? .5 : 0);
    let l = this.lexical(a, need), g = this.grammar(a);
    if (wc < 120) { t = Math.min(t, 4.5); c = Math.min(c, 4.5); l = Math.min(l, 4.5); g = Math.min(g, 4.5); }
    const bands = { task: this.half(t), coherence: this.half(c), lexical: this.half(l), grammar: this.half(g) };
    const comments = {
      task: `${wc} từ${wc < 250 ? ' (dưới mức tối thiểu 250 từ nên bị trừ điểm)' : ''}; ${paras} đoạn; ${opinion ? 'có nêu quan điểm rõ ràng' : 'chưa thấy câu nêu quan điểm rõ ràng (I believe / In my opinion…)'}.`,
      coherence: `${a.conn.length ? 'Từ nối đã dùng: ' + a.conn.slice(0, 6).join(', ') + '.' : 'Chưa thấy từ nối rõ ràng.'} ${paras < 4 ? 'Nên chia bài thành 4 đoạn: mở bài, 2 thân bài, kết bài.' : 'Bố cục đoạn văn hợp lý.'}`,
      lexical: `Dùng ${a.used.length}/${targets.length} từ mục tiêu${a.used.length ? ': ' + a.used.join(', ') : ''}. Độ đa dạng từ ${Math.round(a.ttr * 100)}%, từ dài/học thuật ${Math.round(a.advr * 100)}%.`,
      grammar: (a.cats.length ? `Cấu trúc đã dùng: ${a.cats.join(', ')}. ` : 'Gần như chỉ dùng câu đơn. ') + (a.errs.length ? `Có ${a.errs.length} lỗi phổ biến phát hiện bằng quy tắc.` : 'Không phát hiện lỗi phổ biến bằng quy tắc tự động.'),
    };
    const steps = [];
    if (wc < 250) steps.push(`Viết thêm ${250 - wc} từ để đạt tối thiểu 250 từ`);
    if (a.missing.length) steps.push('Dùng thêm các từ chưa dùng: ' + a.missing.slice(0, 5).join(', '));
    if (a.conn.length < 4) steps.push('Thêm từ nối giữa các ý (however, for example, as a result, in addition…)');
    if (!steps.length) steps.push('Nhờ Claude chấm sâu để nhận góp ý chi tiết về lập luận và lỗi ngữ pháp');
    return this.shape(bands, comments, a, steps);
  },
};
