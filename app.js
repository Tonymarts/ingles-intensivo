// ---------- Lógica pura (probada en test.js) ----------
const DAY = 864e5;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // días hasta el próximo repaso según la "caja"
const NEW_PER_DAY = 15;
const DAILY_GOAL = 20;

function dayNumber(d = new Date()) { return Math.floor((d - d.getTimezoneOffset() * 6e4) / DAY); }

// Acierto: sube de caja y se aleja el repaso. Fallo: vuelve a la caja 1 (mañana).
function review(card, ok, t) {
  const box = ok ? Math.min((card ? card.box : 0) + 1, INTERVALS.length - 1) : 1;
  return { box, due: t + INTERVALS[box] };
}

function bumpStreak(streak, t) {
  if (streak.last === t) return streak;
  return { last: t, count: streak.last === t - 1 ? streak.count + 1 : 1 };
}

function buildDeck(VOCAB, VERBS, mine = []) {
  // Tus palabras van primero para que entren antes que las nuevas del día.
  const deck = mine.map(m => ({ id: "mias:" + m.en.toLowerCase(), cat: "mias", front: m.en, back: m.es, ex: m.ex || "", say: m.en }));
  for (const [cat, list] of Object.entries(VOCAB))
    for (const [en, es, ex] of list) deck.push({ id: cat + ":" + en, cat, front: en, back: es, ex, say: en });
  for (const [b, p, pp, es] of VERBS)
    deck.push({ id: "verbos:" + b, cat: "verbos", front: b + "  (" + es + ")", back: b + " · " + p + " · " + pp, ex: "", say: b + ", " + p.replace(" / ", ", ") + ", " + pp.replace(" / ", ", ") });
  return deck;
}

// Repasos vencidos primero; luego tarjetas nuevas hasta el límite diario.
function dueCards(deck, cards, t, newLeft, cat) {
  const pool = cat ? deck.filter(c => c.cat === cat) : deck;
  const due = pool.filter(c => cards[c.id] && cards[c.id].due <= t);
  const fresh = pool.filter(c => !cards[c.id]).slice(0, Math.max(0, newLeft));
  return due.concat(fresh);
}

function normWords(s) { return s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean); }
// Marca qué palabras del original se escribieron bien (comparación por posición tolerante).
function compareWords(target, typed) {
  const got = normWords(typed);
  return normWords(target).map(w => ({ w, ok: got.includes(w) }));
}

// Valida una copia de seguridad pegada por el usuario antes de reemplazar el progreso.
function parseBackup(text) {
  let d;
  try { d = JSON.parse(text.trim()); } catch { return null; }
  if (!d || typeof d !== "object" || typeof d.cards !== "object" || Array.isArray(d.cards)) return null;
  for (const v of Object.values(d.cards)) if (!v || typeof v.box !== "number" || typeof v.due !== "number") return null;
  const mine = Array.isArray(d.mine) ? d.mine.filter(m => m && typeof m.en === "string" && typeof m.es === "string").map(m => ({ en: m.en.slice(0, 120), es: m.es.slice(0, 200), ex: typeof m.ex === "string" ? m.ex.slice(0, 300) : "" })) : [];
  const st = d.streak && typeof d.streak.count === "number" ? { last: typeof d.streak.last === "number" ? d.streak.last : null, count: d.streak.count } : { last: null, count: 0 };
  return { cards: d.cards, mine, streak: st };
}

if (typeof module !== "undefined") module.exports = { review, bumpStreak, buildDeck, dueCards, compareWords, parseBackup, INTERVALS };

// ---------- Interfaz ----------
if (typeof document !== "undefined") {
  const KEY = "ingles-v1";
  const $ = s => document.querySelector(s);
  const T = dayNumber();
  let DECK;
  const MOTIVOS = [
    "Cada palabra de hoy te acerca a un trabajo mejor para tu familia.",
    "10 minutos hoy valen más que 2 horas el domingo.",
    "En la entrevista vas a entender más gracias a lo de hoy.",
    "Equivocarte aquí es gratis. Practica para no dudar en la entrevista.",
    "Tu familia cuenta contigo. Tú puedes con esto.",
    "No tienes que ser perfecto, solo constante."
  ];

  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { S = {}; }
  S.cards ||= {}; S.streak ||= { last: null, count: 0 }; S.mine ||= [];
  if (!S.daily || S.daily.day !== T) S.daily = { day: T, done: 0, fresh: 0 };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const rebuild = () => { DECK = buildDeck(VOCAB, VERBS, S.mine); };
  rebuild();

  function did() { // cuenta una respuesta para la meta diaria y la racha
    S.daily.done++;
    if (S.daily.done >= 5) S.streak = bumpStreak(S.streak, T);
    save();
  }

  // Voz del teléfono: funciona sin conexión si el paquete de voz en inglés está descargado.
  function say(text, rate = 0.9) {
    if (!("speechSynthesis" in window)) return alert("Este navegador no tiene voz.");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = rate;
    const v = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").startsWith("en-US")) || speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // Micrófono: solo se activa al pulsar el botón. Suele necesitar internet.
  function listen(target, out) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { out.textContent = "Tu navegador no permite el micrófono aquí. Repite en voz alta igualmente."; return; }
    const r = new R(); r.lang = "en-US"; r.maxAlternatives = 1;
    out.textContent = "🎤 Escuchando…";
    r.onresult = e => {
      const heard = e.results[0][0].transcript;
      const res = compareWords(target, heard);
      const pct = Math.round(100 * res.filter(x => x.ok).length / res.length);
      out.innerHTML = "Te entendí: <b>" + esc(heard) + "</b><br>" + pct + "% " + (pct >= 80 ? "✅ ¡Muy bien!" : "— escucha 🐢 y prueba otra vez");
      did();
    };
    r.onerror = e => { out.textContent = e.error === "network" ? "El micrófono necesita internet. Repite en voz alta igualmente." : "No te escuché. Prueba otra vez."; };
    r.start();
  }

  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const audioBtns = t => `<div class="row"><button data-say="${esc(t)}">🔊 Escuchar</button><button data-slow="${esc(t)}">🐢 Lento</button></div>`;
  const view = html => { $("#app").innerHTML = html; window.scrollTo(0, 0); };

  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.say) say(b.dataset.say);
    if (b.dataset.slow) say(b.dataset.slow, 0.55);
    if (b.dataset.go) ROUTES[b.dataset.go](b.dataset.arg);
  });

  function home() {
    const pending = dueCards(DECK, S.cards, T, NEW_PER_DAY - S.daily.fresh).length;
    const pct = Math.min(100, Math.round(100 * S.daily.done / DAILY_GOAL));
    const streak = S.streak.last >= T - 1 ? S.streak.count : 0;
    view(`
      <p class="motivo">${MOTIVOS[T % MOTIVOS.length]}</p>
      <div class="stats"><div><b>🔥 ${streak}</b><span>días seguidos</span></div><div><b>${S.daily.done}/${DAILY_GOAL}</b><span>meta de hoy</span></div></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <button class="big" data-go="cards">🃏 Tarjetas <small>${pending} para hoy</small></button>
      <button class="big" data-go="cats">📚 Tarjetas por tema</button>
      <button class="big" data-go="grammar">✏️ Gramática y verbos</button>
      <button class="big" data-go="dictation">🎧 Escuchar y escribir</button>
      <button class="big" data-go="interview">💼 Practicar entrevista</button>
      <button class="big" data-go="mine">➕ Mis palabras <small>${S.mine.length}</small></button>
      <button class="big ghost" data-go="backup">🔄 Pasar mi progreso a otro dispositivo</button>
      <button class="big ghost" data-go="help">⚙️ Recordatorio y ayuda</button>`);
  }

  function mine() {
    view(`<h2>➕ Mis palabras</h2>
      <p class="muted">¿Viste una palabra o expresión que no entiendes (en una oferta, una serie, una entrevista)? Guárdala aquí y aparecerá en tus tarjetas.</p>
      <input id="en" placeholder="En inglés (ej: get along with)" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="120">
      <input id="es" placeholder="Qué significa (ej: llevarse bien con)" maxlength="200">
      <input id="ex" placeholder="Frase de ejemplo (opcional)" autocapitalize="off" maxlength="300">
      <div class="row"><button data-say="" id="try">🔊 Escuchar</button><button class="good" id="add">Guardar</button></div>
      <p id="msg" class="muted"></p>
      ${S.mine.map((m, i) => `<div class="card"><b>${esc(m.en)}</b> — ${esc(m.es)}${m.ex ? `<br><span class="muted">${esc(m.ex)}</span>` : ""}
        <div class="row"><button data-say="${esc(m.en)}">🔊</button><button class="bad" data-del="${i}">Borrar</button></div></div>`).reverse().join("")}
      <button class="ghost" data-go="home">← Inicio</button>`);
    $("#try").onclick = () => $("#en").value.trim() && say($("#en").value.trim());
    $("#add").onclick = () => {
      const en = $("#en").value.trim(), es = $("#es").value.trim(), ex = $("#ex").value.trim();
      if (!en || !es) return ($("#msg").textContent = "Escribe la palabra y su significado.");
      if (S.mine.some(m => m.en.toLowerCase() === en.toLowerCase())) return ($("#msg").textContent = "Esa ya la tienes guardada.");
      S.mine.push({ en, es, ex }); save(); rebuild(); mine();
      $("#msg").textContent = "✅ Guardada. Te saldrá en Tarjetas.";
    };
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      const m = S.mine[+b.dataset.del];
      if (!confirm(`¿Borrar "${m.en}"?`)) return;
      S.mine.splice(+b.dataset.del, 1); delete S.cards["mias:" + m.en.toLowerCase()]; save(); rebuild(); mine();
    });
  }

  function backup() {
    const data = JSON.stringify({ cards: S.cards, mine: S.mine, streak: S.streak });
    view(`<h2>🔄 Pasar mi progreso</h2>
      <p><b>1. En este dispositivo:</b> copia tu progreso y mándatelo (por WhatsApp a ti mismo, por email…).</p>
      <div class="row"><button class="good" id="copy">📋 Copiar progreso</button>${navigator.share ? `<button id="share">📤 Compartir</button>` : ""}</div>
      <p id="msg" class="muted"></p>
      <p><b>2. En el otro dispositivo:</b> abre esta misma pantalla, pega el texto aquí y pulsa Cargar.</p>
      <textarea id="paste" rows="4" placeholder="Pega aquí tu progreso…" autocomplete="off" spellcheck="false"></textarea>
      <button class="big" id="load">📥 Cargar progreso</button>
      <p class="muted">Cargar reemplaza el progreso de este dispositivo. Nada pasa por internet salvo lo que tú envíes.</p>
      <button class="ghost" data-go="home">← Inicio</button>`);
    $("#copy").onclick = async () => {
      try { await navigator.clipboard.writeText(data); $("#msg").textContent = "✅ Copiado. Pégalo en un mensaje para ti."; }
      catch { $("#paste").value = data; $("#paste").select(); $("#msg").textContent = "Copia el texto seleccionado de abajo."; }
    };
    if ($("#share")) $("#share").onclick = () => navigator.share({ title: "Progreso inglés", text: data }).catch(() => {});
    $("#load").onclick = () => {
      const d = parseBackup($("#paste").value);
      if (!d) return ($("#msg").textContent = "❌ Ese texto no es un progreso válido. Cópialo entero otra vez.");
      if (!confirm("¿Reemplazar el progreso de este dispositivo?")) return;
      Object.assign(S, d); save(); rebuild(); alert("✅ Progreso cargado."); home();
    };
  }

  function cats() {
    view(`<h2>Elige un tema</h2>` + Object.entries(CATS).map(([k, n]) => {
      const p = dueCards(DECK, S.cards, T, NEW_PER_DAY - S.daily.fresh, k).length;
      return `<button class="big" data-go="cards" data-arg="${k}">${n} <small>${p} para hoy</small></button>`;
    }).join("") + `<button class="ghost" data-go="home">← Inicio</button>`);
  }

  function cards(cat) {
    let queue = dueCards(DECK, S.cards, T, NEW_PER_DAY - S.daily.fresh, cat);
    const next = () => {
      if (!queue.length) return view(`<h2>✅ ¡Terminaste las tarjetas de hoy!</h2><p>Vuelve mañana: las que fallaste te volverán a salir.</p><button class="big" data-go="home">← Inicio</button>`);
      const c = queue[0];
      view(`<p class="muted">${CATS[c.cat]} · quedan ${queue.length}</p>
        <div class="card"><div class="front">${esc(c.front)}</div>${audioBtns(c.say)}
        <p class="hint" id="hint1"><b>Paso 1:</b> piensa en silencio qué significa en español.<br>Si no lo sabes, no pasa nada: toca <b>Ver respuesta</b>.</p>
        <div id="back" hidden><div class="back">${esc(c.back)}</div>
        <p class="hint"><b>Paso 2:</b> escucha la frase de ejemplo 🔊 y <b>léela tú en voz alta</b> tocando 🎤. El teléfono te dice si se te entiende.</p>
        ${c.ex ? `<p class="ex">${esc(c.ex)}</p>${audioBtns(c.ex)}` : ""}
        <button id="mic">🎤 Leer la frase en voz alta</button><p id="heard" class="muted"></p>
        <p class="hint"><b>Paso 3:</b> ¿sabías el significado en el paso 1? Elige abajo.</p></div></div>
        <button class="big" id="show">Ver respuesta</button>
        <div class="row" id="grade" hidden><button class="bad" id="no">❌ No la sabía</button><button class="good" id="yes">✅ La sabía</button></div>
        <button class="ghost" data-go="home">← Inicio</button>`);
      say(c.say);
      $("#show").onclick = () => { $("#back").hidden = false; $("#hint1").hidden = true; $("#grade").hidden = false; $("#show").hidden = true; };
      $("#mic").onclick = () => listen(c.ex || c.front, $("#heard"));
      const grade = ok => {
        if (!S.cards[c.id]) S.daily.fresh++;
        S.cards[c.id] = review(S.cards[c.id], ok, T);
        queue.shift();
        if (!ok) queue.push(c); // la fallada se repite al final de la sesión
        did(); next();
      };
      $("#yes").onclick = () => grade(true);
      $("#no").onclick = () => grade(false);
    };
    next();
  }

  function grammar() {
    // Mezcla preguntas de gramática con "¿cuál es el pasado de…?"
    const v = VERBS[Math.floor(Math.random() * VERBS.length)];
    const useVerb = Math.random() < 0.3;
    let item = GRAMMAR[Math.floor(Math.random() * GRAMMAR.length)];
    if (useVerb) {
      const wrong = VERBS.filter(x => x !== v).sort(() => Math.random() - 0.5).slice(0, 2).map(x => x[1]);
      const o = [v[1], ...wrong].sort(() => Math.random() - 0.5);
      item = { q: `Pasado de "${v[0]}" (${v[3]})`, o, a: o.indexOf(v[1]), why: `${v[0]} · ${v[1]} · ${v[2]}` };
    }
    view(`<h2>${esc(item.q)}</h2>${useVerb ? "" : audioBtns(item.q.replace("___", "blank"))}
      ${item.o.map((o, i) => `<button class="big opt" data-i="${i}">${esc(o)}</button>`).join("")}
      <p id="why"></p><button class="big" id="nextq" hidden>Siguiente →</button>
      <button class="ghost" data-go="home">← Inicio</button>`);
    document.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      const ok = +b.dataset.i === item.a;
      document.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (+x.dataset.i === item.a) x.classList.add("good"); });
      if (!ok) b.classList.add("bad");
      $("#why").innerHTML = (ok ? "✅ " : "❌ ") + esc(item.why);
      say(useVerb ? item.why.replace(/ · /g, ", ") : item.q.replace("___", item.o[item.a]));
      $("#nextq").hidden = false; did();
    });
    $("#nextq").onclick = grammar;
  }

  function dictation() {
    const all = DECK.filter(c => c.ex && c.ex.split(" ").length > 3).map(c => c.ex).concat(INTERVIEW.map(i => i.q));
    const s = all[Math.floor(Math.random() * all.length)];
    view(`<h2>🎧 Escucha y escribe lo que oyes</h2>${audioBtns(s)}
      <textarea id="typed" rows="3" placeholder="Escribe aquí en inglés…" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
      <button class="big" id="check">Comprobar</button><div id="res"></div>
      <button class="big" id="nextd" hidden>Otra frase →</button><button class="ghost" data-go="home">← Inicio</button>`);
    say(s, 0.8);
    $("#check").onclick = () => {
      const r = compareWords(s, $("#typed").value);
      const ok = r.filter(x => x.ok).length;
      $("#res").innerHTML = `<p class="ex">${r.map(x => `<span class="${x.ok ? "ok" : "miss"}">${esc(x.w)}</span>`).join(" ")}</p><p>${ok}/${r.length} palabras. Las rojas son las que no captaste: escúchalas en 🐢 lento.</p>`;
      $("#nextd").hidden = false; did();
    };
    $("#nextd").onclick = dictation;
  }

  function interview(i) {
    i = i === undefined ? Math.floor(Math.random() * INTERVIEW.length) : +i;
    const it = INTERVIEW[i];
    view(`<p class="muted">Pregunta ${i + 1} de ${INTERVIEW.length}</p><h2>${esc(it.q)}</h2>${audioBtns(it.q)}
      <p class="muted">${esc(it.es)}</p>
      <p>1️⃣ Responde en voz alta tú solo. 2️⃣ Mira la respuesta modelo. 3️⃣ Repítela.</p>
      <button class="big" id="model">Ver respuesta modelo</button>
      <div id="m" hidden><p class="ex">${esc(it.a)}</p>${audioBtns(it.a)}<button id="mic">🎤 Repetir en voz alta</button><p id="heard" class="muted"></p>
      <p class="muted">Adáptala a tu experiencia real y practícala aquí con Claude.</p></div>
      <button class="big" data-go="interview" data-arg="${(i + 1) % INTERVIEW.length}">Siguiente pregunta →</button>
      <button class="ghost" data-go="home">← Inicio</button>`);
    say(it.q);
    $("#model").onclick = () => { $("#m").hidden = false; $("#model").hidden = true; did(); };
    $("#mic").onclick = () => listen(it.a, $("#heard"));
  }

  function help() {
    // Enlace de Google Calendar: crea un evento diario a las 20:00 (lo puedes cambiar al guardarlo).
    const d = new Date(); d.setDate(d.getDate() + 1);
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const cal = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("🇬🇧 Inglés: 15 minutos (por un trabajo mejor)")
      + "&details=" + encodeURIComponent("Abre la app de inglés: " + location.href.split("#")[0])
      + "&dates=" + ymd + "T200000/" + ymd + "T201500"
      + "&recur=" + encodeURIComponent("RRULE:FREQ=DAILY");
    view(`<h2>⏰ Recordatorio diario</h2>
      <p>Crea un aviso todos los días en el calendario de tu teléfono. Gratis y funciona aunque la app esté cerrada.</p>
      <a class="big btn" href="${cal}" target="_blank" rel="noopener noreferrer">📅 Añadir a Google Calendar</a>
      <h2>📲 Instalar en el teléfono</h2>
      <p>En Chrome o Brave: menú ⋮ → <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>. Después funciona sin internet.</p>
      <h2>🔊 Voz sin internet</h2>
      <p>Ajustes del teléfono → <b>Salida de texto a voz</b> → Motor de Google → instalar datos de voz <b>English (United States)</b>.</p>
      <h2>🔒 Privacidad</h2>
      <p>Tu progreso se guarda solo en este teléfono. La app no envía datos a ningún sitio y no carga nada externo. El micrófono solo se usa cuando pulsas 🎤.</p>
      <button class="ghost" id="reset">Borrar mi progreso</button>
      <button class="big" data-go="home">← Inicio</button>`);
    $("#reset").onclick = () => { if (confirm("¿Borrar todo tu progreso? No se puede deshacer.")) { localStorage.removeItem(KEY); location.reload(); } };
  }

  const ROUTES = { home, cats, cards, grammar, dictation, interview, help, mine, backup };
  if ("speechSynthesis" in window) speechSynthesis.getVoices(); // precarga la lista de voces
  if ("serviceWorker" in navigator) {
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js");
    // Al llegar una versión nueva, recarga una vez para mostrarla (no en la primera instalación).
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW) location.reload(); });
  }
  home();
}
