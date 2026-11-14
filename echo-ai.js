/* СЛОВОПАД — ИИ-помощник внутри «Эха».
   Игрок подключает СВОЙ ключ у любого провайдера (OpenAI, Anthropic, Google, OpenRouter или свой адрес).
   Ключ и переписка лежат только в этом браузере/приложении и уходят прямо к выбранному провайдеру — наш сервер их не видит. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b; }

  const PROV = {
    openai: { name: "OpenAI (ChatGPT)", url: "https://platform.openai.com/api-keys", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
      steps: ["Зайди на platform.openai.com и войди в аккаунт.", "Открой раздел API keys → «Create new secret key».", "Скопируй ключ (начинается с sk-) и вставь сюда. На аккаунте должен быть положен хотя бы $5."],
      en: ["Open platform.openai.com and sign in.", "Go to API keys → “Create new secret key”.", "Copy the key (starts with sk-) and paste it here. Your account needs some credit."],
      uk: ["Зайди на platform.openai.com і увійди в акаунт.", "Відкрий розділ API keys → «Create new secret key».", "Скопіюй ключ (починається з sk-) і встав сюди. На акаунті має бути поповнення."] },
    anthropic: { name: "Anthropic (Claude)", url: "https://console.anthropic.com/settings/keys", models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
      steps: ["Зайди на console.anthropic.com и войди в аккаунт.", "Открой Settings → API keys → «Create Key».", "Скопируй ключ (начинается с sk-ant-) и вставь сюда. Нужен положенный на счёт баланс."],
      en: ["Open console.anthropic.com and sign in.", "Go to Settings → API keys → “Create Key”.", "Copy the key (starts with sk-ant-) and paste it here. You need some credit on the account."],
      uk: ["Зайди на console.anthropic.com і увійди в акаунт.", "Відкрий Settings → API keys → «Create Key».", "Скопіюй ключ (починається з sk-ant-) і встав сюди. Потрібен баланс на рахунку."] },
    google: { name: "Google (Gemini)", url: "https://aistudio.google.com/apikey", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
      steps: ["Зайди на aistudio.google.com с аккаунтом Google.", "Нажми «Get API key» → «Create API key».", "Скопируй ключ (начинается с AIza) и вставь сюда. Есть бесплатный лимит."],
      en: ["Open aistudio.google.com with your Google account.", "Press “Get API key” → “Create API key”.", "Copy the key (starts with AIza) and paste it here. There is a free tier."],
      uk: ["Зайди на aistudio.google.com з акаунтом Google.", "Натисни «Get API key» → «Create API key».", "Скопіюй ключ (починається з AIza) і встав сюди. Є безкоштовний ліміт."] },
    openrouter: { name: "OpenRouter (много моделей)", url: "https://openrouter.ai/keys", models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-5-5", "google/gemini-2.5-flash", "deepseek/deepseek-chat"],
      steps: ["Зайди на openrouter.ai и войди в аккаунт.", "Открой раздел Keys → «Create Key».", "Скопируй ключ (начинается с sk-or-) и вставь сюда. Через него доступны модели разных компаний, есть бесплатные."],
      en: ["Open openrouter.ai and sign in.", "Go to Keys → “Create Key”.", "Copy the key (starts with sk-or-) and paste it here. It gives access to many companies' models, some free."],
      uk: ["Зайди на openrouter.ai і увійди в акаунт.", "Відкрий розділ Keys → «Create Key».", "Скопіюй ключ (починається з sk-or-) і встав сюди. Через нього доступні моделі різних компаній, є безкоштовні."] },
    custom: { name: "Свой адрес (совместимый с OpenAI)", url: "", models: [],
      steps: ["Подойдёт любой сервис с OpenAI-совместимым API: Groq, DeepSeek, Mistral, локальная Ollama и другие.", "Впиши адрес API (например https://api.groq.com/openai/v1) и название модели.", "Вставь ключ сервиса. У сервиса должен быть разрешён доступ из браузера (CORS)."],
      en: ["Any OpenAI-compatible service works: Groq, DeepSeek, Mistral, local Ollama and others.", "Enter the API address (e.g. https://api.groq.com/openai/v1) and the model name.", "Paste the service key. The service must allow browser access (CORS)."],
      uk: ["Підійде будь-який сервіс із OpenAI-сумісним API: Groq, DeepSeek, Mistral, локальна Ollama та інші.", "Впиши адресу API (наприклад https://api.groq.com/openai/v1) і назву моделі.", "Встав ключ сервісу. Сервіс має дозволяти доступ із браузера (CORS)."] },
  };
  const KEY = "sp_ai_cfg", HIST = "sp_ai_hist";
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null") } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } } };
  let cfg = Object.assign({ prov: "openai", keys: {}, models: {}, base: "" }, ls.get(KEY) || {});
  if (!PROV[cfg.prov]) cfg.prov = "openai";
  let hist = (ls.get(HIST) || []).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-40);
  let back = null, busy = false, panel = false, ctl = null, sure = false;
  const save = () => ls.set(KEY, cfg);
  const model = () => cfg.models[cfg.prov] || (PROV[cfg.prov].models[0] || "");
  const keyOf = () => (cfg.keys[cfg.prov] || "").trim();
  const ready = () => keyOf() && model() && (cfg.prov !== "custom" || cfg.base);

  // что игра знает об игроке: ранг, рекорды по темам, точность и скорость. Уходит провайдеру вместе с вопросом (без имени и контактов)
  function ctx() {
    try {
      const t = tw(), r = rki(t), k = RK[r], nx = RK[r + 1];
      const th = THEMES.map(x => tx(x.n) + " " + gbest(x)).join(", ");
      const acc = SlovopadCore.accuracy(PF.h, PF.m), wpm = SlovopadCore.wordsPerMinute(PF.w, PF.t);
      return "Player: rank " + tx(k.n) + " (" + t + " words" + (nx ? ", next rank at " + nx.w : ", max rank") + "); games " + PF.g + "; accuracy " + (acc === null ? "unknown" : acc + "%") + "; speed " + (wpm === null ? "unknown" : wpm + " wpm") + "; best combo " + PF.c + "; streak " + streakNow() + " days; best score per theme: " + th + ".";
    } catch (e) { return "" }
  }
  const RULES = "Game rules: words fall from the top, the player types them, a finished word explodes and gives points. A word reaching the shield costs 1 of 3 lives. Every 8 words the level rises and the game speeds up, words get longer. Gold words give triple points, the word LIFE restores a life. Combo without mistakes raises the score multiplier. Themes: brands, games, cities, countries, animals, food, sport, nature, mix. Three word languages: Russian, English, Ukrainian. Players earn sparkles for games and spend them in the shop on shield skins and backgrounds. Echo is the in-game messenger: friends, rooms up to 20 people, and race mode where everyone in a room types the same words.";
  const SYSTEM = () => T(
    "Ты — Эхо, дружелюбный тренер и помощник в игре «СЛОВОПАД». Отвечай коротко и по делу, на языке игрока, простыми словами. Опирайся на данные игрока ниже: хвали за успехи, находи слабое место (точность, скорость, тема) и давай 2–3 конкретных шага. Если просят тренировку, дай 6–8 слов из тем игры и объясни, как их печатать. Не проси личных данных. " + RULES + " " + ctx(),
    "You are Echo, a friendly coach and helper in the game SLOVOPAD. Answer briefly, in simple words, in the player's language. Use the player data below: praise progress, find the weak spot (accuracy, speed, theme) and give 2-3 concrete steps. If asked for a drill, give 6-8 words from the game's themes and say how to type them. Never ask for personal data. " + RULES + " " + ctx(),
    "Ти — Ехо, дружній тренер і помічник у грі «СЛОВОПАД». Відповідай коротко, простими словами, мовою гравця. Спирайся на дані гравця нижче: хвали за успіхи, знаходь слабке місце (точність, швидкість, тема) і давай 2–3 конкретні кроки. Якщо просять тренування, дай 6–8 слів із тем гри й поясни, як їх друкувати. Не питай особистих даних. " + RULES + " " + ctx());

  /* ---------- запросы к провайдерам ---------- */
  async function ask(messages, signal) {
    const key = keyOf(), m = model(), sys = SYSTEM();
    let url, init, pick;
    if (cfg.prov === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      init = { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: m, max_tokens: 900, system: sys, messages: messages.map(x => ({ role: x.role, content: x.text })) }) };
      pick = d => (d.content || []).map(c => c.text || "").join("");
    } else if (cfg.prov === "google") {
      url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent";
      init = { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: messages.map(x => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.text }] })), generationConfig: { maxOutputTokens: 900 } }) };
      pick = d => ((((d.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || "").join("");
    } else {
      const base = cfg.prov === "openai" ? "https://api.openai.com/v1" : cfg.prov === "openrouter" ? "https://openrouter.ai/api/v1" : cfg.base.replace(/\/+$/, "");
      url = base + "/chat/completions";
      init = { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model: m, max_tokens: 900, messages: [{ role: "system", content: sys }].concat(messages.map(x => ({ role: x.role, content: x.text }))) }) };
      pick = d => (((d.choices || [])[0] || {}).message || {}).content || "";
    }
    init.signal = signal;
    let r;
    try { r = await fetch(url, init) } catch (e) {
      if (e && e.name === "AbortError") throw new Error(T("Ответ не пришёл вовремя. Попробуй ещё раз.", "No answer in time. Try again.", "Відповідь не прийшла вчасно. Спробуй ще раз."));
      throw new Error(T("Не удалось связаться с провайдером. Проверь интернет и адрес.", "Couldn't reach the provider. Check your connection and address.", "Не вдалося зв'язатися з провайдером. Перевір інтернет і адресу."));
    }
    let d = null; try { d = await r.json() } catch (e) { }
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error(T("Провайдер не принял ключ. Проверь, что он скопирован целиком.", "The provider rejected the key. Check it was copied fully.", "Провайдер не прийняв ключ. Перевір, що його скопійовано повністю."));
      if (r.status === 429) throw new Error(T("У ключа закончился лимит или баланс. Подожди или пополни у провайдера.", "The key hit its limit or balance. Wait or top up at the provider.", "У ключа закінчився ліміт або баланс. Зачекай чи поповни у провайдера."));
      if (r.status === 404 || r.status === 400) throw new Error(T("Провайдер не знает такую модель или запрос. Выбери другую модель.", "The provider doesn't know this model or request. Pick another model.", "Провайдер не знає таку модель або запит. Обери іншу модель.") + ((d && d.error && (d.error.message || d.error)) ? " (" + String(d.error.message || d.error).slice(0, 90) + ")" : ""));
      throw new Error(T("Ошибка провайдера (", "Provider error (", "Помилка провайдера (") + r.status + ").");
    }
    const t = String(pick(d || {})).trim();
    if (!t) throw new Error(T("Модель вернула пустой ответ.", "The model returned an empty answer.", "Модель повернула порожню відповідь."));
    return t;
  }

  /* ---------- экран ---------- */
  function build() {
    if (g("o18")) return;
    const o = h("div", "ov"); o.id = "o18";
    o.innerHTML = '<div class="frh"><button class="ib" id="aiBk" type="button">←</button><div class="frt"><h2>🤖 ' + 'ИИ' + '</h2><div class="sub" id="aiSub"></div></div><button class="ib" id="aiSet" type="button" aria-label="settings">⚙</button></div>' +
      '<div class="aiset gl" id="aiSetP" hidden></div>' +
      '<div class="chl" id="aiL"></div><div class="hint" id="aiSt"></div>' +
      '<div class="aichips" id="aiCh"></div><div class="aibar"><select id="aiPv" aria-label="provider"></select><select id="aiMd" aria-label="model"></select></div>' +
      '<div class="chbar"><input id="aiIn" type="text" maxlength="800" autocomplete="off" enterkeyhint="send"><button class="btn chsn" id="aiSn" type="button">➤</button></div>';
    const after = g("o17") || g("o15");
    after.parentNode.insertBefore(o, after.nextSibling);
    g("aiBk").onclick = close;
    g("aiSet").onclick = () => { panel = !panel; sure = false; paintPanel() };
    g("aiSn").onclick = send;
    g("aiIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send() } });
    g("aiPv").onchange = () => { cfg.prov = g("aiPv").value; save(); paintBar(); paintPanel(); head() };
    g("aiMd").onchange = () => { const v = g("aiMd").value; if (v === "__c") { const c = prompt(T("Название модели", "Model name", "Назва моделі"), model()); if (c && c.trim()) cfg.models[cfg.prov] = c.trim() } else cfg.models[cfg.prov] = v; save(); paintBar(); head() };
    if (window.visualViewport) {
      const fit = () => { const e = g("o18"); if (!e || !e.classList.contains("s")) return; const v = window.visualViewport; e.style.height = v.height + "px"; e.style.transform = "translateY(" + v.offsetTop + "px)"; const l = g("aiL"); l.scrollTop = l.scrollHeight };
      window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit);
    }
  }
  function chips() {
    const b = g("aiCh"); if (!b) return; b.textContent = ""; if (!ready()) { b.hidden = true; return } b.hidden = false;
    [["📊", T("Разбери мою игру", "Review my play", "Розбери мою гру"), T("Разбери мою статистику и скажи, что подтянуть в первую очередь.", "Review my stats and tell me what to improve first.", "Розбери мою статистику і скажи, що підтягнути в першу чергу.")],
     ["🎯", T("Тренировка", "Drill", "Тренування"), T("Дай мне короткую тренировку печати на 8 слов из моей слабой темы и скажи, как их набирать без ошибок.", "Give me a short typing drill of 8 words from my weakest theme and tips to type them without mistakes.", "Дай мені коротке тренування друку на 8 слів із моєї слабкої теми й скажи, як їх набирати без помилок.")],
     ["🔤", T("Слова-цепочка", "Word chain", "Слова-ланцюжок"), T("Давай сыграем в слова: я называю слово, ты отвечаешь словом на его последнюю букву. Начинай ты, одно слово из тем игры.", "Let's play a word chain: I say a word, you answer with a word starting with its last letter. You start with one word from the game's themes.", "Давай зіграємо в слова: я називаю слово, ти відповідаєш словом на його останню літеру. Почни ти, одним словом із тем гри.")],
     ["🧠", T("Как набрать больше", "Score more", "Як набрати більше"), T("Как мне набирать больше очков? Дай 3 приёма для моего ранга.", "How can I score more? Give me 3 tricks for my rank.", "Як мені набирати більше очок? Дай 3 прийоми для мого рангу.")]
    ].forEach(c => { const x = h("button", "aich", c[0] + " " + c[1]); x.type = "button"; x.onclick = () => { g("aiIn").value = c[2]; send() }; b.appendChild(x) });
  }
  function head() { g("aiSub").textContent = ready() ? PROV[cfg.prov].name.split(" (")[0] + " · " + model() : T("НУЖЕН КЛЮЧ", "KEY NEEDED", "ПОТРІБЕН КЛЮЧ") }
  function paintBar() {
    const pv = g("aiPv"); pv.textContent = "";
    Object.keys(PROV).forEach(k => { const o = h("option", "", PROV[k].name); o.value = k; if (k === cfg.prov) o.selected = true; pv.appendChild(o) });
    const md = g("aiMd"); md.textContent = "";
    const list = PROV[cfg.prov].models.slice(); if (model() && !list.includes(model())) list.push(model());
    list.forEach(m => { const o = h("option", "", m); o.value = m; if (m === model()) o.selected = true; md.appendChild(o) });
    const c = h("option", "", T("＋ своя модель…", "＋ custom model…", "＋ своя модель…")); c.value = "__c"; md.appendChild(c);
    g("aiIn").placeholder = ready() ? T("Спроси про игру или печать…", "Ask about the game or typing…", "Запитай про гру чи друк…") : T("Сначала подключи ключ (⚙)", "Connect a key first (⚙)", "Спершу підключи ключ (⚙)");
    g("aiIn").disabled = g("aiSn").disabled = !ready();
  }
  function paintPanel() {
    const p = g("aiSetP"); p.hidden = !panel; if (!panel) return; p.textContent = "";
    const pr = PROV[cfg.prov];
    p.appendChild(h("b", "", T("Подключение ИИ", "Connect AI", "Підключення ШІ")));
    p.appendChild(h("span", "", T("Тебе нужен свой ключ у выбранного провайдера. Он хранится только на этом устройстве и отправляется прямо провайдеру — игра и наш сервер его не видят. Расходы идут с твоего счёта у провайдера.", "You need your own key from the chosen provider. It stays on this device and goes straight to the provider — the game and our server never see it. Costs are billed to your account with the provider.", "Тобі потрібен свій ключ у обраного провайдера. Він зберігається лише на цьому пристрої й іде прямо до провайдера — гра і наш сервер його не бачать. Витрати йдуть із твого рахунку у провайдера.")));
    p.appendChild(h("span", "ecdim", T("Чтобы советы были точнее, помощник видит твой ранг, рекорды и статистику. Имя, ник и контакты не отправляются.", "To give better tips, the helper sees your rank, records and stats. Your name, nickname and contacts are not sent.", "Щоб поради були точнішими, помічник бачить твій ранг, рекорди й статистику. Ім'я, нік і контакти не надсилаються.")));
    const ol = h("ol", "aist"); T(pr.steps, pr.en, pr.uk).forEach(s => ol.appendChild(h("li", "", s))); p.appendChild(ol);
    if (pr.url) { const a = h("a", "ailink", "🔗 " + pr.url.replace("https://", "")); a.href = pr.url; a.target = "_blank"; a.rel = "noopener noreferrer"; p.appendChild(a) }
    if (cfg.prov === "custom") {
      const b = h("input", "aifld"); b.type = "text"; b.placeholder = "https://api.example.com/v1"; b.value = cfg.base || ""; b.autocomplete = "off"; b.spellcheck = false;
      b.onchange = () => { const v = b.value.trim(); cfg.base = /^https:\/\//i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/i.test(v) ? v : ""; if (v && !cfg.base) setSt(T("Адрес должен начинаться с https://", "The address must start with https://", "Адреса має починатися з https://"), true); save(); paintBar(); head() };
      p.appendChild(b);
    }
    const k = h("input", "aifld"); k.type = "password"; k.placeholder = T("Вставь ключ сюда", "Paste the key here", "Встав ключ сюди"); k.autocomplete = "off"; k.spellcheck = false; k.value = keyOf();
    p.appendChild(k);
    const row = h("div", "airow");
    row.appendChild(btn("btn", T("СОХРАНИТЬ", "SAVE", "ЗБЕРЕГТИ"), () => { cfg.keys[cfg.prov] = k.value.trim(); save(); paintBar(); head(); chips(); setSt(ready() ? T("Ключ сохранён. Можно писать!", "Key saved. You can chat now!", "Ключ збережено. Можна писати!") : T("Заполни все поля.", "Fill in all fields.", "Заповни всі поля.")); if (ready()) { panel = false; paintPanel() } }));
    row.appendChild(btn("btn a", sure ? T("ТОЧНО?", "SURE?", "ТОЧНО?") : T("СТЕРЕТЬ КЛЮЧ", "REMOVE KEY", "СТЕРТИ КЛЮЧ"), () => { if (!sure) { sure = true; paintPanel(); return } delete cfg.keys[cfg.prov]; sure = false; save(); paintBar(); head(); paintPanel() }));
    p.appendChild(row);
    p.appendChild(btn("btn a", T("ОЧИСТИТЬ ПЕРЕПИСКУ", "CLEAR CHAT", "ОЧИСТИТИ ЛИСТУВАННЯ"), () => { hist = []; ls.set(HIST, hist); paintChat(); panel = false; paintPanel() }));
  }
  const setSt = (m, bad) => { const e = g("aiSt"); if (e) { e.textContent = m || ""; e.classList.toggle("bad", !!bad) } };
  function addMsg(role, text, cls) {
    const b = h("div", "chm" + (role === "user" ? " me" : "")); const s = h("span", "chb aib" + (cls ? " " + cls : ""), text); b.appendChild(s); g("aiL").appendChild(b); return b;
  }
  function paintChat() {
    const l = g("aiL"); l.textContent = "";
    if (!hist.length) l.appendChild(h("div", "chem", ready() ? T("Привет! Я Эхо 👋 Спроси, как печатать быстрее или как лучше играть.", "Hi! I'm Echo 👋 Ask how to type faster or play better.", "Привіт! Я Ехо 👋 Запитай, як друкувати швидше чи грати краще.") : T("Подключи свой ключ ИИ — нажми ⚙ сверху. Там есть инструкция.", "Connect your own AI key — tap ⚙ at the top. There are instructions.", "Підключи свій ключ ШІ — натисни ⚙ угорі. Там є інструкція.")));
    hist.forEach(m => addMsg(m.role, m.text));
    l.scrollTop = l.scrollHeight;
  }
  async function send() {
    const inp = g("aiIn"), text = inp.value.trim(); if (!text || busy || !ready()) return;
    inp.value = ""; busy = true; setSt("");
    const l = g("aiL"); if (l.querySelector(".chem")) l.querySelector(".chem").remove();
    hist.push({ role: "user", text }); addMsg("user", text);
    const wait = addMsg("assistant", "", "aiw"); wait.firstChild.innerHTML = "<i class=\"dot\"></i><i class=\"dot\"></i><i class=\"dot\"></i>"; l.scrollTop = l.scrollHeight;
    ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
    try {
      const a = await ask(hist.slice(-12), ctl.signal);
      hist.push({ role: "assistant", text: a }); wait.firstChild.textContent = a; wait.firstChild.classList.remove("aiw");
    } catch (e) {
      hist.pop(); wait.remove(); inp.value = text; setSt(e.message, true);
    } finally { clearTimeout(to); busy = false; hist = hist.slice(-40); ls.set(HIST, hist); l.scrollTop = l.scrollHeight }
  }
  function close() {
    try { if (ctl) ctl.abort() } catch (e) { }
    const o = g("o18"); o.style.height = ""; o.style.transform = ""; g("aiIn").blur();
    const f = back; back = null; if (f) f(); else ov("o1");
  }
  function open(from) {
    build(); back = from || null; panel = !ready(); sure = false; setSt("");
    paintBar(); head(); paintPanel(); paintChat(); chips(); ov("o18");
    const o = g("o18"), v = window.visualViewport; if (v) { o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)" }
  }
  window.EchoAI = { open };
})();
