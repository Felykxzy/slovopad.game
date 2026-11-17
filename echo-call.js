/* СЛОВОПАД — «Эхо»: голосовой и видеозвонок в комнате (до 4 человек).
   Звук и видео идут напрямую между игроками (WebRTC), сервер только знакомит их друг с другом (/api/echo/call/*).
   Подключается после echo.js. Использует: cloudRequest, ov, L3. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) { if (window.IC && typeof text === "string" && text.indexOf("{") >= 0) IC.t(e, text); else e.textContent = text } return e }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b }
  const api = (path, opt) => cloudRequest(path, opt);
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });
  const C = { active: false, room: "", roomName: "", me: "", myJ: 0, ice: [], peers: {}, early: {}, mic: null, cam: null, micOn: true, camOn: false, facing: "user", after: 0, timer: 0, hb: 0, busy: false, fail: 0, back: null, tile: null, turn: false };

  /* ---------- звуки (синтез, без файлов) ---------- */
  let AC = null;
  function actx() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC } catch (e) { return null } }
  function cv() { try { var c = JSON.parse(localStorage.getItem("cfg") || "{}"), x = c.vol == null ? 100 : c.vol; return x * x / 1e4 } catch (e) { return 1 } }
  function tone(f, at, dur, type, vol, f2) {
    const a = actx(); if (!a) return; const o = a.createOscillator(), gn = a.createGain(), t = a.currentTime + at;
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol || 0.12) * cv()), t + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  const NOTE = { A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, E4: 330, C4: 262 };
  function sfx(kind) {
    try { if (typeof mute !== "undefined" && mute) return } catch (e) { }
    switch (kind) {
      case "me-join": tone(NOTE.E5, 0, .16, "sine", .12); tone(NOTE.A5, .11, .16, "sine", .12); tone(1175, .22, .3, "sine", .1); break;
      case "me-leave": tone(NOTE.A5, 0, .16, "sine", .1); tone(NOTE.E5, .11, .16, "sine", .1); tone(NOTE.A4, .22, .3, "sine", .09); break;
      case "join": tone(NOTE.E5, 0, .13, "triangle", .1); tone(NOTE.A5, .1, .2, "triangle", .1); break;
      case "leave": tone(NOTE.A5, 0, .13, "triangle", .09); tone(NOTE.E5, .1, .2, "triangle", .09); break;
      case "mute": tone(420, 0, .12, "sine", .13, 210); break;
      case "unmute": tone(520, 0, .1, "sine", .12, 880); break;
      case "cam": tone(700, 0, .05, "square", .04); tone(940, .06, .05, "square", .04); break;
      case "ring": [0, .5, 1.3, 1.8].forEach((d, i) => tone(i % 2 ? NOTE.E5 : NOTE.G5, d, .32, "sine", .13)); break;
      case "msg": tone(880, 0, .08, "sine", .06); tone(1320, .05, .12, "sine", .05); break;
    }
  }

  /* ---------- экран звонка ---------- */
  function build() {
    if (g("o19")) return;
    const o = h("div", "ov"); o.id = "o19";
    o.innerHTML = '<div class="clh"><button class="ib" id="clBk" type="button" aria-label="minimize">'+IC.html("back")+'</button><div class="clt"><h2 id="clT"></h2><div class="sub"><span id="clS"></span><b id="clTm">0:00</b></div></div><div class="clq" id="clQ"></div></div>' +
      '<div class="cgrid" id="clG"></div><div class="hint" id="clSt"></div>' +
      '<div class="cbar"><div class="cbw"><button class="cb" id="clMic" type="button">'+IC.html("mic")+'</button><span>' + T("Микрофон", "Mic", "Мікрофон") + '</span></div><div class="cbw"><button class="cb" id="clCam" type="button">'+IC.html("cam")+'</button><span>' + T("Камера", "Camera", "Камера") + '</span></div><div class="cbw" id="clScw" hidden><button class="cb" id="clScr" type="button">'+IC.html("screen")+'</button><span>' + T("Экран", "Screen", "Екран") + '</span></div><div class="cbw" id="clCsw" hidden><button class="cb" id="clCs" type="button">'+IC.html("swap")+'</button><span>' + T("Камеры", "Cameras", "Камери") + '</span></div><div class="cbw" id="clFlw"><button class="cb" id="clFl" type="button">'+IC.html("flip")+'</button><span>' + T("Поворот", "Flip", "Поворот") + '</span></div><div class="cbw"><button class="cb end" id="clEnd" type="button">'+IC.html("hangup")+'</button><span>' + T("Выйти", "Leave", "Вийти") + '</span></div></div>';
    const after = g("o18") || g("o17") || g("o16") || g("o1"); after.parentNode.insertBefore(o, after.nextSibling);
    g("clBk").onclick = () => minimize();
    g("clMic").onclick = toggleMic; g("clCam").onclick = toggleCam; g("clFl").onclick = flip; g("clScr").onclick = toggleScr; g("clScw").hidden = !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); g("clEnd").onclick = () => leave(true);
    document.addEventListener("visibilitychange", () => { if (document.hidden) C.hid = Date.now() });
    const cm = h("div", "clcm"); cm.id = "clCm"; cm.hidden = true; o.appendChild(cm);
    g("clCs").onclick = e => { e.stopPropagation(); if (cm.hidden) camMenu(); else cm.hidden = true };
    o.addEventListener("click", e => { if (!cm.hidden && !cm.contains(e.target)) cm.hidden = true });
    try { navigator.mediaDevices.addEventListener("devicechange", () => { camList().then(camUi) }) } catch (e) { }
  }
  /* выбор камеры: на компьютере их может быть несколько (вебкамера, внешняя, виртуальная) */
  const coarse = () => { try { return matchMedia("(pointer:coarse)").matches } catch (e) { return false } };
  async function camList() {
    try { const d = await navigator.mediaDevices.enumerateDevices(); C.cams = d.filter(x => x.kind === "videoinput" && x.deviceId) } catch (e) { C.cams = [] }
    return C.cams;
  }
  function camUi() {
    const w = g("clCsw"); if (!w) return;
    const many = !!(C.cams && C.cams.length > 1 && C.camOn && !C.scr && !coarse());
    w.hidden = !many; if (many) g("clFlw").hidden = true; if (!many && g("clCm")) g("clCm").hidden = true;
  }
  async function camMenu() {
    const m = g("clCm"), list = await camList(); m.textContent = "";
    list.forEach((d, i) => {
      const b = h("button", "clci" + ((C.cam && C.cam.getSettings && C.cam.getSettings().deviceId === d.deviceId) ? " on" : "")); b.type = "button";
      b.textContent = d.label || (T("Камера ", "Camera ", "Камера ") + (i + 1));
      b.onclick = async () => { m.hidden = true; await camPick(d.deviceId) };
      m.appendChild(b);
    });
    m.hidden = false;
  }
  async function camPick(id) {
    if (!C.camOn || C.scr) return;
    const old = C.devId; C.devId = id; try { localStorage.setItem("callCamId", id) } catch (e) { }
    try { if (C.cam) { C.cam.stop(); C.cam = null } await camStart(); sendAll(); paintSelf() }
    catch (e) { C.devId = old; try { await camStart() } catch (x) { C.camOn = false; paintSelf(); Object.values(C.peers).forEach(sendState); hint(T("Эта камера не включилась.", "This camera did not start.", "Ця камера не ввімкнулась."), true) } }
  }
  const sendAll = () => Object.values(C.peers).forEach(sendState);
  const hint = (msg, bad) => { const e = g("clSt"); if (e) { e.textContent = msg || ""; e.classList.toggle("bad", !!bad) } };
  const hue = n => { let x = 0; for (const c of String(n)) x = (x * 31 + c.charCodeAt(0)) % 360; return x };
  function makeTile(name, self) {
    const t = h("div", "ctile" + (self ? " self" : "")), v = h("video"); v.autoplay = true; v.playsInline = true; v.setAttribute("playsinline", ""); if (self) v.muted = true;
    const av = h("div", "cav"), c = h("i", "", (name || "?").slice(0, 1).toUpperCase()); c.style.background = "linear-gradient(135deg,hsl(" + hue(name) + " 85% 62%),hsl(" + ((hue(name) + 50) % 360) + " 80% 48%))"; av.appendChild(c);
    const nm = h("div", "cnm", self ? name + " · " + T("ты", "you", "ти") : name), st = h("div", "cst");
    t.appendChild(v); t.appendChild(av); t.appendChild(nm); t.appendChild(st); t._v = v; t._st = st; t.classList.add("nocam");
    v.addEventListener("playing", () => { t._live = true; if (t._rp) t._rp() }); v.addEventListener("emptied", () => { t._live = false; if (t._rp) t._rp() });
    return t;
  }
  function layout() {
    const G = g("clG"); if (!G) return; G.dataset.n = String(G.querySelectorAll(".ctile").length);
    const names = Object.keys(C.peers);
    g("clT").textContent = C.roomName; g("clS").textContent = (names.length + 1) + " " + T("в звонке", "in call", "у дзвінку") + " · ";
    g("clQ").className = "clq " + (C.turn ? "good" : "mid"); IC.t(g("clQ"), "{signal}"); g("clQ").title = C.turn ? T("защищённая связь", "relay available", "захищений зв'язок") : T("прямая связь", "direct link", "пряма зв'язь");
    G.classList.toggle("alone", names.length === 0);
    let w = G.querySelector(".cwait"); if (!names.length && !w) { w = h("div", "cwait"); w.appendChild(h("i", "")); w.appendChild(h("span", "", T("Ждём друзей…", "Waiting for friends…", "Чекаємо друзів…"))); G.appendChild(w) } else if (names.length && w) w.remove();
  }
  function paintTile(P) {
    const t = P.tile; if (!t) return; t.classList.toggle("nocam", !(P.cam && t._live)); t.classList.toggle("scr", !!(P.cam && P.scr));
    IC.t(t._st, P.mic === false ? "{mic-off}" : "");
  }
  function paintSelf() {
    if (!C.tile) return; C.tile.classList.toggle("nocam", !(C.camOn && C.tile._live)); C.tile.classList.toggle("flip", C.facing === "user" && !C.scr); C.tile.classList.toggle("scr", !!C.scr); g("clScr").classList.toggle("on", !!C.scr);
    IC.t(C.tile._st, C.micOn ? "" : "{mic-off}");
    g("clMic").classList.toggle("off", !C.micOn); IC.t(g("clMic"), C.micOn ? "{mic}" : "{mic-off}"); IC.t(g("clCam"), C.camOn ? "{cam}" : "{cam-off}");
    g("clCam").classList.toggle("on", C.camOn); g("clFlw").hidden = !C.camOn || !!C.scr; camUi();
  }
  // кто говорит: мерим громкость каждого потока
  function watch(tile, stream) {
    const a = actx(); if (!a || !stream || !stream.getAudioTracks().length) return;
    try {
      const src = a.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]])), an = a.createAnalyser(); an.fftSize = 512; src.connect(an);
      tile._an = an; tile._buf = new Uint8Array(an.fftSize); tile._src = src;
    } catch (e) { }
  }
  function speakLoop() {
    if (!C.active) return; const G = g("clG");
    if (G) Array.from(G.children).forEach(t => {
      if (!t._an) return; t._an.getByteTimeDomainData(t._buf); let m = 0; for (let k = 0; k < t._buf.length; k++) m = Math.max(m, Math.abs(t._buf[k] - 128));
      const on = m > 14 && !(t.classList.contains("self") && !C.micOn); t.classList.toggle("speak", on);
    });
    C.sp = setTimeout(speakLoop, 110);
  }
  function timerLoop() { const e = g("clTm"); if (!e || !C.active) return; const s = Math.floor((Date.now() - C.t0) / 1000); e.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") }

  /* ---------- сигналы ---------- */
  const sig = (to, data) => post("/api/echo/call/sig", { room: C.room, to, data: JSON.stringify(data) }).catch(() => { });
  function queueCand(P, c) {
    P.cq = P.cq || []; P.cq.push(c); if (P.ct) return;
    P.ct = setTimeout(() => { P.ct = 0; const cs = P.cq.splice(0); if (cs.length) sig(P.name, { cs }) }, 250);
  }
  function attachLocal(P) {
    P.pc.getTransceivers().forEach(tr => {
      const kind = tr.receiver && tr.receiver.track ? tr.receiver.track.kind : "";
      const track = kind === "audio" ? C.mic : kind === "video" ? C.cam : null;
      try { tr.direction = "sendrecv"; tr.sender.replaceTrack(track || null); if (kind === "video") tune(tr.sender) } catch (e) { }
    });
  }
  // плавность важнее чёткости: держим частоту кадров, битрейт делим между собеседниками
  function tune(sender) {
    try {
      const n = Math.max(1, Object.keys(C.peers).length), p = sender.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
      p.encodings[0].maxBitrate = n <= 1 ? 2500000 : n === 2 ? 1800000 : 1200000; p.encodings[0].maxFramerate = C.scr ? 30 : 60; p.degradationPreference = C.scr ? "maintain-resolution" : "maintain-framerate";
      sender.setParameters(p).catch(() => { });
    } catch (e) { }
  }
  function sendState(P) { try { if (P.dc && P.dc.readyState === "open") P.dc.send(JSON.stringify({ cam: C.camOn, mic: C.micOn, scr: !!C.scr })) } catch (e) { } }
  function wireDc(P, dc) {
    P.dc = dc; dc.onopen = () => sendState(P);
    dc.onmessage = e => { try { const d = JSON.parse(e.data); P.cam = !!d.cam; P.mic = d.mic !== false; P.scr = !!d.scr; paintTile(P) } catch (x) { } };
  }
  function ensurePeer(name) {
    if (C.peers[name]) return C.peers[name];
    const pc = new RTCPeerConnection({ iceServers: C.ice }), P = { name, pc, pend: [], stream: new MediaStream(), cam: false, mic: true, tile: makeTile(name, false), dc: null, made: Date.now() };
    C.peers[name] = P; P.tile._rp = () => paintTile(P); P.tile._v.srcObject = P.stream; g("clG").appendChild(P.tile); layout();
    pc.onicecandidate = e => { if (e.candidate) queueCand(P, e.candidate.toJSON ? e.candidate.toJSON() : e.candidate) };
    pc.ontrack = e => {
      if (!P.stream.getTracks().includes(e.track)) P.stream.addTrack(e.track);
      if (e.track.kind === "audio" && !P.tile._an) watch(P.tile, P.stream);
      if (e.track.kind === "video") { e.track.onunmute = () => { P.cam = true; paintTile(P) }; e.track.onmute = () => { P.cam = false; paintTile(P) } }
      try { P.tile._v.play().catch(() => { }) } catch (x) { }
    };
    pc.ondatachannel = e => wireDc(P, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { P.tile.classList.remove("wait"); hint(""); sendState(P); if (!P.heard) { P.heard = true; sfx("join") } }
      else if (pc.connectionState === "connecting" || pc.connectionState === "new") P.tile.classList.add("wait");
      else if (pc.connectionState === "failed") { hint(T("Связь с " + name + " оборвалась, пробую снова…", "Lost link with " + name + ", retrying…", "Зв'язок із " + name + " урвався, пробую знову…"), true); closePeer(name) }
    };
    return P;
  }
  function closePeer(name) {
    const P = C.peers[name]; if (!P) return; delete C.peers[name]; if (P.heard && C.active) sfx("leave");
    try { clearTimeout(P.ct); P.pc.close() } catch (e) { }
    if (P.tile && P.tile.parentNode) P.tile.parentNode.removeChild(P.tile); layout();
  }
  async function callOut(name) {
    const P = ensurePeer(name);
    try {
      wireDc(P, P.pc.createDataChannel("st"));
      P.pc.addTransceiver("audio", { direction: "sendrecv" }); P.pc.addTransceiver("video", { direction: "sendrecv" }); attachLocal(P);
      const off = await P.pc.createOffer(); await P.pc.setLocalDescription(off);
      sig(name, { t: "offer", sdp: P.pc.localDescription.sdp });
    } catch (e) { closePeer(name) }
  }
  async function flushCands(P) { const q = P.pend.splice(0); for (const c of q) { try { await P.pc.addIceCandidate(c) } catch (e) { } } }
  async function onSig(s) {
    let d; try { d = JSON.parse(s.data) } catch (e) { return }
    const from = s.from;
    if (d.t === "offer") {
      closePeer(from); const P = ensurePeer(from);
      try {
        await P.pc.setRemoteDescription({ type: "offer", sdp: d.sdp }); attachLocal(P);
        const ans = await P.pc.createAnswer(); await P.pc.setLocalDescription(ans);
        sig(from, { t: "answer", sdp: P.pc.localDescription.sdp });
        (C.early[from] || []).forEach(c => P.pend.push(c)); delete C.early[from]; await flushCands(P);
      } catch (e) { closePeer(from) }
    } else if (d.t === "answer") {
      const P = C.peers[from];
      if (P && P.pc.signalingState === "have-local-offer") { try { await P.pc.setRemoteDescription({ type: "answer", sdp: d.sdp }); await flushCands(P) } catch (e) { } }
    } else if (d.cs) {
      const P = C.peers[from];
      if (P && P.pc.remoteDescription) d.cs.forEach(c => P.pc.addIceCandidate(c).catch(() => { }));
      else if (P) d.cs.forEach(c => P.pend.push(c));
      else (C.early[from] = C.early[from] || []).push(...d.cs);
    }
  }
  function onParts(parts) {
    const names = parts.map(p => p.name), mine = parts.find(p => p.name === C.me);
    if (mine) C.myJ = mine.j;
    parts.forEach(p => {
      if (p.name === C.me || C.peers[p.name]) return;
      // предлагает связь тот, кто вошёл позже: так двое не звонят друг другу одновременно
      const iOffer = mine && (mine.j > p.j || (mine.j === p.j && C.me > p.name));
      if (iOffer) callOut(p.name);
    });
    Object.keys(C.peers).forEach(n => { if (!names.includes(n) && Date.now() - C.peers[n].made > 8000) closePeer(n) });
  }
  async function tick() {
    if (!C.active || C.busy) return; C.busy = true;
    try {
      const hb = Date.now() - C.hb > 10000;
      const r = await api("/api/echo/call/poll?room=" + encodeURIComponent(C.room) + "&after=" + C.after + (hb ? "&hb=1" : ""));
      if (hb) C.hb = Date.now(); C.fail = 0;
      onParts(r.parts || []);
      for (const s of (r.sigs || [])) { C.after = Math.max(C.after, s.id); await onSig(s) }
    } catch (e) { if (++C.fail > 25) { hint(T("Нет связи с сервером, звонок завершён.", "Server unreachable, call ended.", "Немає зв'язку з сервером, дзвінок завершено."), true); leave(false) } }
    finally { C.busy = false }
  }

  /* ---------- управление ---------- */
  function toggleMic() { C.micOn = !C.micOn; sfx(C.micOn ? "unmute" : "mute"); if (C.mic) C.mic.enabled = C.micOn; paintSelf(); Object.values(C.peers).forEach(sendState) }
  async function camStart() {
    if (C.devId === undefined) { try { C.devId = localStorage.getItem("callCamId") || "" } catch (e) { C.devId = "" } }
    const base = { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)) ? 30 : 60 } };
    let s;
    if (C.devId) { try { s = await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: C.devId } }, audio: false }) } catch (e) { C.devId = "" } }
    if (!s) { try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: C.facing }, ...base }, audio: false }) } catch (e) { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing, ...base }, audio: false }) } }
    await camList();
    C.cam = s.getVideoTracks()[0]; try { C.cam.contentHint = "motion" } catch (e) { } C.tile._rp = paintSelf; showSelf();
    Object.values(C.peers).forEach(attachLocal);
  }
  // показываем своё видео; если кадры не пошли (бывает на iPhone) — переподключаем картинку до трёх раз
  function showSelf(n) {
    const v = C.tile && C.tile._v; if (!v || !C.cam) return; n = n || 0;
    v.srcObject = null; v.srcObject = new MediaStream([C.cam]); v.muted = true; try { v.play().catch(() => { }) } catch (e) { }
    setTimeout(() => { if (C.cam && C.tile && C.tile._v === v && !C.tile._live && n < 3) showSelf(n + 1) }, 1500);
  }
  function camStop() {
    if (C.cam) { try { C.cam.stop() } catch (e) { } C.cam = null }
    if (C.tile) C.tile._v.srcObject = null;
    Object.values(C.peers).forEach(attachLocal);
  }
  /* показ экрана: вместо камеры уходит картинка экрана (только там, где браузер это умеет) */
  async function scrStart() {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    const tr = s.getVideoTracks()[0]; if (!tr) throw new Error("no video");
    if (C.cam) { try { C.cam.stop() } catch (e) { } }
    C.cam = tr; C.scr = true; C.camOn = true; try { tr.contentHint = "detail" } catch (e) { }
    tr.onended = () => { if (C.scr && C.cam === tr) { const bg = document.hidden || Date.now() - (C.hid || 0) < 5000; scrStop(); if (bg) hint(T("Показ экрана остановился: приложение свернулось. Вернись и нажми «Экран» снова.", "Screen sharing stopped because the app went to the background. Come back and tap Screen again.", "Показ екрана зупинився: застосунок згорнувся. Повернись і натисни «Екран» знову."), true) } };
    C.tile._v.srcObject = new MediaStream([tr]); try { C.tile._v.play().catch(() => { }) } catch (e) { }
    Object.values(C.peers).forEach(attachLocal);
  }
  function scrStop() {
    C.scr = false; C.camOn = false; camStop(); sfx("cam"); paintSelf(); Object.values(C.peers).forEach(sendState);
  }
  async function toggleScr() {
    if (C.scr) return scrStop();
    try { await scrStart(); sfx("cam"); hint(""); paintSelf(); Object.values(C.peers).forEach(sendState) }
    catch (e) { C.scr = false; if (C.cam && !C.camOn) C.cam = null; if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") hint(T("Показ экрана здесь недоступен.", "Screen sharing is not available here.", "Показ екрана тут недоступний."), true); paintSelf() }
  }
  async function toggleCam() {
    if (C.scr) return scrStop();
    if (!navigator.mediaDevices) return hint(T("Камера здесь недоступна.", "Camera is not available here.", "Камера тут недоступна."), true);
    try {
      if (C.camOn) { C.camOn = false; camStop() } else { await camStart(); C.camOn = true } sfx("cam");
      hint(""); paintSelf(); Object.values(C.peers).forEach(sendState);
    } catch (e) { C.camOn = false; hint(T("Нет доступа к камере. Разреши её в настройках браузера.", "No camera access. Allow it in browser settings.", "Немає доступу до камери. Дозволь її в налаштуваннях браузера."), true); paintSelf() }
  }
  // Поворот камеры (передняя ↔ задняя). Старую камеру отпускаем и ждём, иначе на iPhone картинка тёмная или замирает
  async function flip() {
    if (!C.camOn || C.flipping) return; C.flipping = true;
    const prev = C.facing, od = C.devId; C.facing = prev === "user" ? "environment" : "user"; C.devId = "";
    const swap = async () => { if (C.cam) { try { C.cam.stop() } catch (e) { } C.cam = null } if (C.tile) C.tile._v.srcObject = null; await new Promise(r => setTimeout(r, 300)); await camStart(); paintSelf() };
    try { await swap() } catch (e) { C.facing = prev; C.devId = od; try { await swap() } catch (x) { C.camOn = false; paintSelf() } }
    finally { C.flipping = false }
  }

  /* ---------- вход и выход ---------- */
  async function join(room, roomName, back) {
    build();
    if (C.active && C.room === room) { C.back = back || C.back; show(); return }
    if (C.active) await leave(false);
    if (!window.RTCPeerConnection || !navigator.mediaDevices) { alert(T("В этом браузере звонки не работают. Попробуй Chrome или Safari.", "Calls do not work in this browser. Try Chrome or Safari.", "У цьому браузері дзвінки не працюють. Спробуй Chrome або Safari.")); return }
    let r; try { r = await post("/api/echo/call/join", { room }) } catch (e) { alert(e.message); return }
    Object.assign(C, { active: true, room, roomName: roomName || "", me: r.me, ice: r.ice || [], turn: !!r.turn, peers: {}, early: {}, after: 0, hb: Date.now(), fail: 0, micOn: true, camOn: false, back: back || null, mic: null, cam: null, facing: "user" });
    const G = g("clG"); G.textContent = ""; C.tile = makeTile(C.me, true); G.appendChild(C.tile); layout();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      C.mic = s.getAudioTracks()[0];
    } catch (e) { C.micOn = false; hint(T("Микрофон не включился. Ты слышишь других, но они тебя нет. Разреши микрофон в настройках.", "Microphone is off. You can hear others but they can't hear you. Allow the microphone in settings.", "Мікрофон не ввімкнувся. Ти чуєш інших, але вони тебе ні. Дозволь мікрофон у налаштуваннях."), true) }
    C.t0 = Date.now(); if (C.mic) watch(C.tile, new MediaStream([C.mic])); sfx("me-join");
    paintSelf(); onParts(r.parts || []); show(); clearTimeout(C.sp); speakLoop(); clearInterval(C.tt); C.tt = setInterval(timerLoop, 1000); timerLoop();
    clearInterval(C.timer); C.timer = setInterval(tick, 1500);
  }
  function show() { build(); ov("o19"); paintSelf(); layout() }
  function minimize() { if (typeof C.back === "function") C.back(); else ov("") }
  async function leave(goBack) {
    const room = C.room, was = C.active; if (was) sfx("me-leave"); C.active = false; clearInterval(C.timer); C.timer = 0; clearTimeout(C.sp); clearInterval(C.tt);
    Object.keys(C.peers).forEach(closePeer);
    [C.mic, C.cam].forEach(t => { try { t && t.stop() } catch (e) { } }); C.mic = C.cam = null; C.camOn = false; C.scr = false;
    const G = g("clG"); if (G) G.textContent = ""; C.tile = null;
    if (was) { try { await post("/api/echo/call/leave", { room }) } catch (e) { } }
    if (goBack) minimize();
  }

  /* ---------- плашка в комнате: кто в звонке ---------- */
  let lastWho = -1;
  async function banner(room, el, back, name) {
    if (!el) return;
    const paint = parts => {
      el.textContent = "";
      if (C.active && C.room === room) {
        el.hidden = false; el.className = "rmcall on";
        el.appendChild(h("span", "", "{speaker}" + T("Ты в звонке", "You are in the call", "Ти в дзвінку")));
        el.appendChild(btn("rcb", T("ОТКРЫТЬ", "OPEN", "ВІДКРИТИ"), show)); el.appendChild(btn("rcb end", T("ВЫЙТИ", "LEAVE", "ВИЙТИ"), () => { leave(false).then(() => banner(room, el, back, name)) }));
      } else if (parts && parts.length) {
        el.hidden = false; el.className = "rmcall";
        el.appendChild(h("span", "", "{phone}" + T("В звонке: ", "In call: ", "У дзвінку: ") + parts.join(", ")));
        el.appendChild(btn("rcb", T("ВОЙТИ", "JOIN", "ПРИЄДНАТИСЬ"), () => join(room, name, back)));
      } else el.hidden = true;
    };
    if (C.active && C.room === room) return paint();
    try { const r = await api("/api/echo/call/who?room=" + encodeURIComponent(room)), n = (r.parts || []).length; if (n && lastWho === 0) sfx("ring"); lastWho = n; paint(r.parts || []) } catch (e) { }
  }

  window.EchoCall = { sfx, join, leave, banner, active: () => C.active, room: () => C.room };
})();
