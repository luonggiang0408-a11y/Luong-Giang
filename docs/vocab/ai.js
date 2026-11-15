/* Gọi Claude để tạo bài đọc / chủ đề / chấm bài.
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

  /* ---------- Chủ đề nói / viết ---------- */
  topicPrompt(kind, words) {
    const list = words.map((w) => `${w.word}: ${w.meaning}`).join('; ');
    const system = 'You are an IELTS examiner. Reply with ONE JSON object only, no markdown fences.';
    const user = kind === 'speaking'
      ? `Learner often forgets these words/phrases: ${list}.
Create an IELTS Speaking Part 2 cue card whose natural answer lets the learner use as many of these words as possible (without telling them to use specific words in the prompt text).
JSON: {"topic":"Describe ...","points":["You should say:","...","...","and explain ..."],"part3":["follow-up question 1","follow-up question 2"],"suggested":["words from the list that fit best"]}`
      : `Learner often forgets these words/phrases: ${list}.
Create an IELTS Writing Task 2 question (opinion, discussion, advantages/disadvantages or problem-solution) on a topic where these words fit naturally.
JSON: {"topic":"full Task 2 question text","type":"opinion|discussion|adv-disadv|problem-solution","suggested":["words from the list that fit best"],"outline_vi":"2-3 câu gợi ý dàn ý bằng tiếng Việt"}`;
    return { system, user, maxTokens: 800 };
  },

  /* ---------- Chấm bài ---------- */
  speakingPrompt(topic, words, stats, transcript) {
    const system = `You are a certified IELTS Speaking examiner and a kind coach for a Vietnamese learner (target band 6.5-7.0).
Score using the official IELTS band descriptors (0-9, half bands allowed). Be honest, not generous.
IMPORTANT: you only have an automatic speech-recognition transcript, not the audio. Estimate Pronunciation from recognition confidence, words the recogniser got wrong/odd, and likely Vietnamese-speaker issues (final consonants, stress, th/s/sh, linking); say clearly that this is an estimate.
Write all feedback in Vietnamese, keep English examples in English. Reply with ONE JSON object only, no markdown fences.`;
    const user = `Cue card: ${topic.topic}\n${(topic.points || []).join(' | ')}
Target words the learner should activate: ${words.map((w) => w.word).join(', ')}
Stats: duration ${stats.seconds}s, ${stats.words} words (~${stats.wpm} wpm), avg recognition confidence ${stats.conf}, fillers (um/uh/er/like/you know): ${stats.fillers}
Transcript:
"""
${transcript}
"""
JSON shape:
{"bands":{"pronunciation":0,"vocabulary":0,"grammar":0,"fluency":0,"clarity":0},"overall":0,
 "comments":{"pronunciation":"","vocabulary":"","grammar":"","fluency":"","clarity":""},
 "errors":[{"original":"","better":"","why":""}],
 "used_words":[""],"missed_words":[""],
 "better_version":"a stronger band-7 version of the learner's answer, keeping their ideas",
 "next_steps":["3 concrete things to practise"]}
"clarity" = clarity and development of ideas (answers the question, organised, examples). Give 3-6 errors.`;
    return { system, user, maxTokens: 3000 };
  },

  writingPrompt(topic, words, text, count, minutes) {
    const system = `You are a certified IELTS Writing examiner and a kind coach for a Vietnamese learner (target band 6.5-7.0).
Score Task 2 using the official four criteria (Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy), half bands allowed. Be honest, not generous.
Write all feedback in Vietnamese, keep English quotes in English. Reply with ONE JSON object only, no markdown fences.`;
    const user = `Question: ${topic.topic}
Target words the learner should activate: ${words.map((w) => w.word).join(', ')}
Word count: ${count}${minutes ? `, time used: ${minutes} min` : ''}${count < 250 ? ' (below the 250-word minimum: penalise Task Response)' : ''}
Essay:
"""
${text}
"""
JSON shape:
{"bands":{"task":0,"coherence":0,"lexical":0,"grammar":0},"overall":0,
 "comments":{"task":"","coherence":"","lexical":"","grammar":""},
 "errors":[{"original":"","better":"","why":""}],
 "used_words":[""],"missed_words":[""],"word_use_feedback":"were the target words used correctly?",
 "better_version":"rewrite of the weakest paragraph at band 7+, keeping the learner's ideas",
 "next_steps":["3 concrete things to practise"]}
Give 4-8 errors.`;
    return { system, user, maxTokens: 3500 };
  },
};
