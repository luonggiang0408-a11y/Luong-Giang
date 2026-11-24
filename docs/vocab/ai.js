/* Gọi Claude để tạo bài đọc.
   Có API key  -> gọi trực tiếp từ trình duyệt.
   Không có key -> chế độ thủ công: sao chép prompt, dán câu trả lời JSON. */
const AI = {
  hasKey() { return !!Store.data.settings.apiKey; },

  async ask({ system, user, maxTokens = 4000 }) {
    if (!this.hasKey()) return this.manual(system, user);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Store.data.settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: Store.data.settings.model || 'claude-sonnet-5-5',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      let msg = res.status + '';
      try { msg += ' ' + (await res.json()).error.message; } catch (e) { /* ignore */ }
      throw new Error('API lỗi: ' + msg);
    }
    const j = await res.json();
    return (j.content || []).map((b) => b.text || '').join('');
  },

  manual(system, user) {
    return new Promise((resolve, reject) => {
      const prompt = system + '\n\n---\n\n' + user;
      const el = document.createElement('div');
      el.className = 'modal';
      el.innerHTML = `<div class="modal-box">
        <h3>Chế độ thủ công (chưa có API key)</h3>
        <p class="muted">1) Sao chép prompt, dán vào Claude (claude.ai). 2) Dán nguyên câu trả lời (JSON) vào ô bên dưới.
        Hoặc nhập API key trong tab Cài đặt để tự động hoàn toàn.</p>
        <textarea readonly rows="6" class="mono">${UI.esc(prompt)}</textarea>
        <div class="row"><button class="btn" data-a="copy">Sao chép prompt</button></div>
        <textarea rows="8" class="mono" placeholder="Dán câu trả lời của Claude ở đây..."></textarea>
        <div class="row end"><button class="btn ghost" data-a="cancel">Huỷ</button><button class="btn primary" data-a="ok">Dùng kết quả</button></div>
      </div>`;
      document.body.appendChild(el);
      const [promptBox, answerBox] = el.querySelectorAll('textarea');
      el.addEventListener('click', (e) => {
        const a = e.target.dataset.a;
        if (a === 'copy') { promptBox.select(); navigator.clipboard.writeText(prompt).then(() => UI.toast('Đã sao chép prompt'), () => document.execCommand('copy')); }
        if (a === 'cancel') { el.remove(); reject(new Error('Đã huỷ')); }
        if (a === 'ok') {
          if (!answerBox.value.trim()) { UI.toast('Hãy dán câu trả lời trước'); return; }
          el.remove(); resolve(answerBox.value);
        }
      });
    });
  },

  // Lấy JSON từ câu trả lời (chịu được ```json ... ``` và lời dẫn).
  parseJSON(text) {
    const t = text.replace(/```json|```/gi, '');
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('Không tìm thấy JSON trong câu trả lời. Hãy dán TOÀN BỘ câu trả lời của Claude.');
    const raw = t.slice(s, e + 1);
    try { return JSON.parse(raw); } catch (err) { /* thử sửa lỗi phổ biến bên dưới */ }
    // Sửa: dấu nháy cong, xuống dòng/tab thật trong chuỗi, dấu phẩy thừa.
    let fixed = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, ' ');
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < fixed.length; i++) {
      const ch = fixed[i];
      if (inStr) {
        if (esc) { out += ch; esc = false; }
        else if (ch === '\\') { out += ch; esc = true; }
        else if (ch === '"') {
          // Dấu " thật sự đóng chuỗi chỉ khi theo sau là , : } ] (hoặc hết); ngược lại là dấu " nằm trong nội dung.
          const nx = (fixed.slice(i + 1).match(/^\s*(.)/) || [])[1];
          if (!nx || ',:}]'.includes(nx)) { out += ch; inStr = false; } else out += '\\"';
        }
        else if (ch === '\n') out += '\\n';
        else if (ch === '\r') out += '';
        else if (ch === '\t') out += ' ';
        else out += ch;
      } else { if (ch === '"') inStr = true; out += ch; }
    }
    out = out.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(out); } catch (err) {
      throw new Error('Câu trả lời chưa phải JSON hợp lệ (' + err.message + '). Hãy bấm "Copy" ở khối code của Claude rồi dán lại, hoặc nhờ Claude: "chỉ trả lại JSON thuần".');
    }
  },

  async askJSON(opts) { return this.parseJSON(await this.ask(opts)); },

  /* ---------- Bài đọc ---------- */
  readingPrompt(subsets) {
    const system = `You are an experienced IELTS/EAP materials writer for a Vietnamese learner at B1+/B2 aiming for IELTS 6.5-7.0.
Write natural, engaging reading passages with exercises in the style of "Active Skills for Reading, Book 2" (National Geographic):
vocabulary matching, completing sentences from a word bank, comprehension (True/False/Not Given, multiple choice).
Reply with ONE JSON object only, no markdown fences, no commentary.`;
    const list = subsets.map((ws, i) => `Passage ${i + 1} target words:\n` + ws.map((w) => `- ${w.word}${w.pos ? ' (' + w.pos + ')' : ''}: ${w.meaning}`).join('\n')).join('\n\n');
    const user = `${list}

Requirements for EACH passage:
- 130-180 words, CEFR B2, a coherent topic (news feature, explanation, personal story, etc.). Different topic for each passage.
- Use EVERY target word of that passage at least once, in a context that makes the meaning inferable. Keep the exact form given (you may only change tense/number if grammatically necessary). Wrap each target word occurrence in **double asterisks**.
- Separate paragraphs with a blank line (\\n\\n).
- Exercises (the "answer" must be unambiguous, the "explain" is written in Vietnamese, 1-2 sentences, and says why):
  1. "match": match each target word to its English definition (items: word, definition). All words of that passage.
  2. "gapfill": 4-6 NEW sentences (not copied from the passage) each with ____ ; learner types a target word from the word bank; include "wordBank" (the target words, shuffled). Use new situations so the learner applies the word.
  3. "mcq": 3 comprehension questions, 4 options each, "answer" = index 0-3.
  4. "tfng": 4 statements, answer exactly "True", "False" or "Not Given".
- "summary_vi": one-sentence Vietnamese summary of the passage.

JSON shape:
{"passages":[{"title":"","text":"","summary_vi":"","exercises":[
 {"type":"match","instruction":"","items":[{"word":"","definition":"","explain":""}]},
 {"type":"gapfill","instruction":"","wordBank":[""],"items":[{"q":"... ____ ...","answer":"","explain":""}]},
 {"type":"mcq","instruction":"","items":[{"q":"","options":["","","",""],"answer":0,"explain":""}]},
 {"type":"tfng","instruction":"","items":[{"q":"","answer":"True","explain":""}]}
]}]}
Return exactly ${subsets.length} passage(s) in "passages".`;
    return { system, user };
  },
};
