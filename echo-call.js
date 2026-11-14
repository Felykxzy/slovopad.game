/* СЛОВОПАД — «Эхо»: голосовой и видеозвонок в комнате (до 4 человек).
   Звук и видео идут напрямую между игроками (WebRTC), сервер только знакомит их друг с другом (/api/echo/call/*).
   Подключается после echo.js. Использует: cloudRequest, ov, L3. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b }
  const api = (path, opt) => cloudRequest(path, opt);
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });
  const C = { active: false, room: "", roomName: "", me: "", myJ: 0, ice: [], peers: {}, early: {}, mic: null, cam: null, micOn: true, camOn: false, facing: "user", after: 0, timer: 0, hb: 0, busy: false, fail: 0, back: null, tile: null, turn: false };

  /* ---------- экран звонка ---------- */
  function build() {
    if (g("o19")) return;
    const o = h("div", "ov"); o.id = "o19";
    o.innerHTML = '<div class="frh ecrh"><button class="ib" id="clBk" type="button">←</button><div class="frt"><h2 id="clT"></h2><div class="sub" id="clS"></div></div></div>' +
      '<div class="cgrid" id="clG"></div><div class="hint" id="clSt"></div>' +
      '<div class="cbar"><button class="cb" id="clMic" type="button">🎤</button><button class="cb" id="clCam" type="button">📷</button><button class="cb" id="clFl" type="button">🔄</button><button class="cb end" id="clEnd" type="button">☎</button></div>';
    const after = g("o18") || g("o17") || g("o16") || g("o1"); after.parentNode.insertBefore(o, after.nextSibling);
    g("clBk").onclick = () => minimize();
    g("clMic").onclick = toggleMic; g("clCam").onclick = toggleCam; g("clFl").onclick = flip; g("clEnd").onclick = () => leave(true);
  }
  const hint = (msg, bad) => { const e = g("clSt"); if (e) { e.textContent = msg || ""; e.classList.toggle("bad", !!bad) } };
  function makeTile(name, self) {
    const t = h("div", "ctile" + (self ? " self" : "")), v = h("video"); v.autoplay = true; v.playsInline = true; v.setAttribute("playsinline", ""); if (self) v.muted = true;
    const av = h("div", "cav", (name || "?").slice(0, 1).toUpperCase()), nm = h("div", "cnm", self ? name + " · " + T("ты", "you", "ти") : name), st = h("div", "cst");
    t.appendChild(v); t.appendChild(av); t.appendChild(nm); t.appendChild(st); t._v = v; t._st = st; t.classList.add("nocam");
    return t;
  }
  function layout() {
    const G = g("clG"); if (!G) return; const n = G.children.length; G.dataset.n = String(n);
    const names = Object.keys(C.peers);
    g("clT").textContent = "📞 " + C.roomName; g("clS").textContent = (names.length + 1) + " " + T("в звонке", "in call", "у дзвінку") + (C.turn ? "" : " · " + T("прямая связь", "direct link", "пряма зв'язь"));
  }
  function paintTile(P) {
    const t = P.tile; if (!t) return; t.classList.toggle("nocam", !P.cam);
    t._st.textContent = P.mic === false ? "🔇" : "";
  }
  function paintSelf() {
    if (!C.tile) return; C.tile.classList.toggle("nocam", !C.camOn); C.tile.classList.toggle("flip", C.facing === "user");
    C.tile._st.textContent = C.micOn ? "" : "🔇";
    g("clMic").classList.toggle("off", !C.micOn); g("clMic").textContent = C.micOn ? "🎤" : "🔇";
    g("clCam").classList.toggle("on", C.camOn); g("clFl").hidden = !C.camOn;
  }

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
      try { tr.direction = "sendrecv"; tr.sender.replaceTrack(track || null) } catch (e) { }
    });
  }
  function sendState(P) { try { if (P.dc && P.dc.readyState === "open") P.dc.send(JSON.stringify({ cam: C.camOn, mic: C.micOn })) } catch (e) { } }
  function wireDc(P, dc) {
    P.dc = dc; dc.onopen = () => sendState(P);
    dc.onmessage = e => { try { const d = JSON.parse(e.data); P.cam = !!d.cam; P.mic = d.mic !== false; paintTile(P) } catch (x) { } };
  }
  function ensurePeer(name) {
    if (C.peers[name]) return C.peers[name];
    const pc = new RTCPeerConnection({ iceServers: C.ice }), P = { name, pc, pend: [], stream: new MediaStream(), cam: false, mic: true, tile: makeTile(name, false), dc: null, made: Date.now() };
    C.peers[name] = P; P.tile._v.srcObject = P.stream; g("clG").appendChild(P.tile); layout();
    pc.onicecandidate = e => { if (e.candidate) queueCand(P, e.candidate.toJSON ? e.candidate.toJSON() : e.candidate) };
    pc.ontrack = e => {
      if (!P.stream.getTracks().includes(e.track)) P.stream.addTrack(e.track);
      if (e.track.kind === "video") { e.track.onunmute = () => { P.cam = true; paintTile(P) }; e.track.onmute = () => { P.cam = false; paintTile(P) } }
      try { P.tile._v.play().catch(() => { }) } catch (x) { }
    };
    pc.ondatachannel = e => wireDc(P, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { P.tile.classList.remove("wait"); hint(""); sendState(P) }
      else if (pc.connectionState === "connecting" || pc.connectionState === "new") P.tile.classList.add("wait");
      else if (pc.connectionState === "failed") { hint(T("Связь с " + name + " оборвалась, пробую снова…", "Lost link with " + name + ", retrying…", "Зв'язок із " + name + " урвався, пробую знову…"), true); closePeer(name) }
    };
    return P;
  }
  function closePeer(name) {
    const P = C.peers[name]; if (!P) return; delete C.peers[name];
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
  function toggleMic() { C.micOn = !C.micOn; if (C.mic) C.mic.enabled = C.micOn; paintSelf(); Object.values(C.peers).forEach(sendState) }
  async function camStart() {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
    C.cam = s.getVideoTracks()[0]; C.tile._v.srcObject = new MediaStream([C.cam]); try { C.tile._v.play().catch(() => { }) } catch (e) { }
    Object.values(C.peers).forEach(attachLocal);
  }
  function camStop() {
    if (C.cam) { try { C.cam.stop() } catch (e) { } C.cam = null }
    if (C.tile) C.tile._v.srcObject = null;
    Object.values(C.peers).forEach(attachLocal);
  }
  async function toggleCam() {
    if (!navigator.mediaDevices) return hint(T("Камера здесь недоступна.", "Camera is not available here.", "Камера тут недоступна."), true);
    try {
      if (C.camOn) { C.camOn = false; camStop() } else { await camStart(); C.camOn = true }
      hint(""); paintSelf(); Object.values(C.peers).forEach(sendState);
    } catch (e) { C.camOn = false; hint(T("Нет доступа к камере. Разреши её в настройках браузера.", "No camera access. Allow it in browser settings.", "Немає доступу до камери. Дозволь її в налаштуваннях браузера."), true); paintSelf() }
  }
  async function flip() {
    if (!C.camOn) return; C.facing = C.facing === "user" ? "environment" : "user";
    try { if (C.cam) { C.cam.stop(); C.cam = null } await camStart(); paintSelf() } catch (e) { C.facing = C.facing === "user" ? "environment" : "user"; try { await camStart() } catch (x) { C.camOn = false; paintSelf() } }
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
    paintSelf(); onParts(r.parts || []); show();
    clearInterval(C.timer); C.timer = setInterval(tick, 1500);
  }
  function show() { build(); ov("o19"); paintSelf(); layout() }
  function minimize() { if (typeof C.back === "function") C.back(); else ov("") }
  async function leave(goBack) {
    const room = C.room, was = C.active; C.active = false; clearInterval(C.timer); C.timer = 0;
    Object.keys(C.peers).forEach(closePeer);
    [C.mic, C.cam].forEach(t => { try { t && t.stop() } catch (e) { } }); C.mic = C.cam = null; C.camOn = false;
    const G = g("clG"); if (G) G.textContent = ""; C.tile = null;
    if (was) { try { await post("/api/echo/call/leave", { room }) } catch (e) { } }
    if (goBack) minimize();
  }

  /* ---------- плашка в комнате: кто в звонке ---------- */
  async function banner(room, el, back, name) {
    if (!el) return;
    const paint = parts => {
      el.textContent = "";
      if (C.active && C.room === room) {
        el.hidden = false; el.className = "rmcall on";
        el.appendChild(h("span", "", "🔊 " + T("Ты в звонке", "You are in the call", "Ти в дзвінку")));
        el.appendChild(btn("rcb", T("ОТКРЫТЬ", "OPEN", "ВІДКРИТИ"), show)); el.appendChild(btn("rcb end", T("ВЫЙТИ", "LEAVE", "ВИЙТИ"), () => { leave(false).then(() => banner(room, el, back, name)) }));
      } else if (parts && parts.length) {
        el.hidden = false; el.className = "rmcall";
        el.appendChild(h("span", "", "📞 " + T("В звонке: ", "In call: ", "У дзвінку: ") + parts.join(", ")));
        el.appendChild(btn("rcb", T("ВОЙТИ", "JOIN", "ПРИЄДНАТИСЬ"), () => join(room, name, back)));
      } else el.hidden = true;
    };
    if (C.active && C.room === room) return paint();
    try { const r = await api("/api/echo/call/who?room=" + encodeURIComponent(room)); paint(r.parts || []) } catch (e) { }
  }

  window.EchoCall = { join, leave, banner, active: () => C.active, room: () => C.room };
})();
