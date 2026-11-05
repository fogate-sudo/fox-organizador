// FOX Vida Saudável — app de hábitos
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Identidade do dispositivo ----------
function getDeviceId() {
  let id = localStorage.getItem("fox.deviceId");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
    localStorage.setItem("fox.deviceId", id);
  }
  return id;
}
const DEVICE = getDeviceId();

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { "content-type": "application/json", "x-device-id": DEVICE, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Falha na conexão");
  return data;
}

// ---------- Datas ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const HISTORY_DAYS = 120;

// ---------- Estado ----------
const state = {
  habits: [],
  logs: new Map(), // `${habitId}|${day}` -> count
  today: ymd(new Date()),
  selected: ymd(new Date()),
  editing: null,
  form: { emoji: "✨", color: "#f26b1d" },
};
const key = (h, d) => `${h}|${d}`;
const getCount = (h, d) => state.logs.get(key(h, d)) || 0;

const EMOJIS = ["💧", "🏃", "🥗", "🍎", "🌙", "🧘", "🚶", "🚴", "🏋️", "📖", "☀️", "🦷", "💊", "🍵", "🚭", "📵", "✍️", "😊", "🌿", "✨"];
const COLORS = ["#f26b1d", "#2b9fd9", "#4caf50", "#6c5ce7", "#e0a526", "#e8476a", "#1f3a2e", "#00a8a8"];
const SUGGESTIONS = [
  { name: "Caminhar 20 min", emoji: "🚶", color: "#4caf50", target: 1, unit: "caminhada" },
  { name: "Ler", emoji: "📖", color: "#6c5ce7", target: 10, unit: "páginas" },
  { name: "Tomar sol", emoji: "☀️", color: "#e0a526", target: 1, unit: "vez" },
  { name: "Alongar", emoji: "🌿", color: "#00a8a8", target: 1, unit: "sessão" },
  { name: "Sem açúcar", emoji: "🍎", color: "#e8476a", target: 1, unit: "dia" },
  { name: "Gratidão", emoji: "✍️", color: "#f26b1d", target: 3, unit: "coisas" },
  { name: "Menos telas à noite", emoji: "📵", color: "#1f3a2e", target: 1, unit: "noite" },
];

// ---------- Cálculos ----------
function dayRatio(day) {
  const hs = state.habits.filter((h) => ymd(new Date(h.createdAt)) <= day || hasAnyLog(h.id, day));
  if (!hs.length) return null;
  const sum = hs.reduce((a, h) => a + Math.min(1, getCount(h.id, day) / h.target), 0);
  return sum / hs.length;
}
const hasAnyLog = (hid, day) => getCount(hid, day) > 0;

function streakOf(h) {
  let d = parseDay(state.today);
  if (getCount(h.id, state.today) < h.target) d = addDays(d, -1); // hoje ainda em aberto
  let n = 0;
  while (n < HISTORY_DAYS && getCount(h.id, ymd(d)) >= h.target) { n++; d = addDays(d, -1); }
  return n;
}
function bestStreak(h) {
  let best = 0, cur = 0;
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = ymd(addDays(parseDay(state.today), -i));
    if (getCount(h.id, day) >= h.target) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

// ---------- Render: Hoje ----------
function renderHeader() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(".", "");
  const h = now.getHours();
  $("#greeting").textContent = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function renderDays() {
  const strip = $("#dayStrip");
  const base = parseDay(state.today);
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const d = addDays(base, -i);
    const day = ymd(d);
    const r = dayRatio(day) ?? 0;
    html += `<button class="day ${day === state.selected ? "is-selected" : ""} ${r >= 1 ? "full" : ""}" data-day="${day}"
      aria-pressed="${day === state.selected}" aria-label="${d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" })}">
      <span class="dw">${i === 0 ? "hoje" : WD[d.getDay()]}</span>
      <span class="dn">${d.getDate()}</span>
      <span class="dot"><b style="width:${Math.round(r * 100)}%"></b></span>
    </button>`;
  }
  strip.innerHTML = html;
}

function renderScore() {
  const r = dayRatio(state.selected) ?? 0;
  const pct = Math.round(r * 100);
  $("#scorePct").textContent = pct;
  $("#scoreRing").style.strokeDashoffset = String(326.7 * (1 - r));
  $(".score").classList.toggle("done", r >= 1);
  const isToday = state.selected === state.today;
  $("#scoreCap").textContent = isToday ? "do dia" : parseDay(state.selected).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const done = state.habits.filter((h) => getCount(h.id, state.selected) >= h.target).length;
  const total = state.habits.length;
  const title = $("#heroTitle"), sub = $("#heroSub");
  if (!total) { title.innerHTML = "Vamos <i>começar</i>?"; sub.textContent = "Crie um hábito e dê o primeiro passo."; }
  else if (r >= 1) { title.innerHTML = "Dia <i>completo</i>!"; sub.textContent = "Todos os hábitos cumpridos. A raposa está orgulhosa. 🦊"; }
  else if (r >= 0.5) { title.innerHTML = "Quase <i>lá</i>."; sub.textContent = `${done} de ${total} hábitos feitos — falta pouco.`; }
  else if (r > 0) { title.innerHTML = "Bom <i>ritmo</i>."; sub.textContent = `${done} de ${total} concluídos. Continue no seu tempo.`; }
  else { title.innerHTML = isToday ? "Um passo de <i>cada vez</i>." : "Dia em <i>branco</i>."; sub.textContent = isToday ? `${total} hábitos esperando por você hoje.` : "Ainda dá para registrar o que você fez."; }
}

function renderHabits() {
  const list = $("#habitList");
  $("#emptyToday").hidden = state.habits.length > 0;
  list.innerHTML = state.habits.map((h, i) => {
    const c = getCount(h.id, state.selected);
    const done = c >= h.target;
    const s = streakOf(h);
    const progress = h.target <= 12
      ? `<div class="segments">${Array.from({ length: h.target }, (_, k) => `<i class="${k < c ? "on" : ""}"></i>`).join("")}</div>`
      : `<div class="bar"><b style="width:${Math.min(100, (c / h.target) * 100)}%"></b></div>`;
    return `<li class="habit ${done ? "done" : ""}" style="--c:${h.color};--i:${i}" data-id="${h.id}">
      <button class="habit-icon" data-act="inc" aria-label="Registrar ${esc(h.name)}">${esc(h.emoji)}</button>
      <div class="habit-main">
        <p class="habit-name">${esc(h.name)}</p>
        <div class="habit-meta">
          <span><span class="count">${c}</span> / ${h.target} ${esc(h.unit)}</span>
          ${s > 0 ? `<span class="streak">🔥 ${s} ${s === 1 ? "dia" : "dias"}</span>` : ""}
        </div>
        ${progress}
      </div>
      <div class="stepper">
        <button class="plus ${done ? "check" : ""}" data-act="inc" aria-label="Mais um">${done ? "✓" : "+"}</button>
        <button data-act="dec" aria-label="Menos um" ${c === 0 ? "disabled" : ""}>−</button>
      </div>
    </li>`;
  }).join("");
}

function renderToday() { renderHeader(); renderDays(); renderScore(); renderHabits(); }

// ---------- Render: Progresso ----------
function renderProgress() {
  const weeks = 16;
  const today = parseDay(state.today);
  const end = addDays(today, 6 - today.getDay()); // sábado desta semana
  const start = addDays(end, -(weeks * 7 - 1));
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const day = ymd(d);
    if (day > state.today) { cells += `<i class="future"></i>`; continue; }
    const r = dayRatio(day) ?? 0;
    const l = r === 0 ? 0 : r < 0.34 ? 1 : r < 0.67 ? 2 : r < 1 ? 3 : 4;
    cells += `<i class="l${l} ${day === state.today ? "today" : ""}" title="${d.toLocaleDateString("pt-BR")}: ${Math.round(r * 100)}%"></i>`;
  }
  $("#heatmap").innerHTML = cells;

  // Estatísticas
  let perfect = 0, active = 0, ratioSum = 0;
  for (let i = 0; i < 30; i++) {
    const r = dayRatio(ymd(addDays(today, -i))) ?? 0;
    ratioSum += r; if (r >= 1) perfect++; if (r > 0) active++;
  }
  const best = state.habits.reduce((m, h) => Math.max(m, bestStreak(h)), 0);
  $("#statCards").innerHTML = `
    <div class="stat accent"><b>${Math.round((ratioSum / 30) * 100)}%</b><span>constância em 30 dias</span></div>
    <div class="stat"><b>${perfect}</b><span>dias completos</span></div>
    <div class="stat"><b>${best}</b><span>maior sequência</span></div>`;

  $("#perHabit").innerHTML = state.habits.map((h) => {
    let cellsH = "", full = 0;
    for (let i = 29; i >= 0; i--) {
      const c = getCount(h.id, ymd(addDays(today, -i)));
      const cls = c >= h.target ? "full" : c > 0 ? "part" : "";
      if (c >= h.target) full++;
      cellsH += `<i class="${cls}"></i>`;
    }
    return `<li class="ph" style="--c:${h.color}">
      <div class="ph-top"><span>${esc(h.emoji)} ${esc(h.name)}</span><small>${full}/30 · 🔥 ${streakOf(h)}</small></div>
      <div class="ph-days">${cellsH}</div>
    </li>`;
  }).join("") || `<p class="empty">Crie hábitos para ver seu progresso.</p>`;
}

// ---------- Render: Hábitos ----------
function renderManage() {
  $("#manageList").innerHTML = state.habits.map((h, i) => `
    <li style="--c:${h.color}" data-id="${h.id}">
      <span class="em">${esc(h.emoji)}</span>
      <span class="nm">${esc(h.name)}<small>${h.target} ${esc(h.unit)} por dia</small></span>
      <span class="acts">
        <button class="icon-btn" data-act="up" aria-label="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-btn" data-act="edit" aria-label="Editar">✎</button>
        <button class="icon-btn danger" data-act="del" aria-label="Excluir">✕</button>
      </span>
    </li>`).join("");

  $("#emojiPick").innerHTML = EMOJIS.map((e) => `<button type="button" data-emoji="${e}" aria-pressed="${e === state.form.emoji}">${e}</button>`).join("");
  $("#colorPick").innerHTML = COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-label="Cor ${c}" aria-pressed="${c === state.form.color}"></button>`).join("");
  const names = new Set(state.habits.map((h) => h.name.toLowerCase()));
  $("#suggestions").innerHTML = SUGGESTIONS.filter((s) => !names.has(s.name.toLowerCase()))
    .map((s, i) => `<button type="button" class="chip" data-sug="${i}">${s.emoji} ${esc(s.name)}</button>`).join("");
}

function renderAll() { renderToday(); renderProgress(); renderManage(); }

// ---------- Interações ----------
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function confetti(x, y, color) {
  const palette = [color, "#f26b1d", "#1f3a2e", "#e0a526", "#6f9a5a"];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    const a = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 90;
    p.style.cssText = `left:${x}px;top:${y}px;background:${palette[i % palette.length]};--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist + 60}px;--r:${Math.random() * 720 - 360}deg`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
}

const pending = new Map();
function saveCount(habitId, day, count) {
  const k = key(habitId, day);
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(async () => {
    pending.delete(k);
    try { await api("checkins", { method: "PUT", body: { habitId, day, count } }); }
    catch (e) { toast("Não foi possível salvar. Tentando de novo…"); setTimeout(() => saveCount(habitId, day, getCount(habitId, day)), 2500); }
  }, 350));
}

$("#habitList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const li = btn.closest(".habit");
  const h = state.habits.find((x) => x.id === Number(li.dataset.id));
  const before = getCount(h.id, state.selected);
  const next = btn.dataset.act === "inc" ? Math.min(100, before + 1) : Math.max(0, before - 1);
  if (next === before) return;
  const dayBefore = dayRatio(state.selected);
  state.logs.set(key(h.id, state.selected), next);
  saveCount(h.id, state.selected, next);
  renderToday(); renderProgress();

  const newLi = $(`.habit[data-id="${h.id}"]`);
  $(".habit-icon", newLi).classList.add("pop");
  if (before < h.target && next >= h.target) {
    const r = $(".habit-icon", newLi).getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2, h.color);
    if (dayBefore < 1 && dayRatio(state.selected) >= 1) setTimeout(() => toast("Dia completo! 🦊✨"), 300);
  }
});

$("#dayStrip").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  state.selected = b.dataset.day;
  renderToday();
});

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) switchView(b.dataset.view); });
document.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (b) switchView(b.dataset.goto); });

// Form
const form = $("#habitForm");
function resetForm() {
  state.editing = null;
  form.reset();
  state.form = { emoji: "✨", color: "#f26b1d" };
  $("#formTitle").textContent = "Novo hábito";
  $("#submitBtn").textContent = "Adicionar hábito";
  $("#cancelEdit").hidden = true;
  renderManage();
}
function fillForm(h) {
  state.editing = h.id;
  form.name.value = h.name; form.target.value = h.target; form.unit.value = h.unit;
  state.form = { emoji: h.emoji, color: h.color };
  $("#formTitle").textContent = "Editar hábito";
  $("#submitBtn").textContent = "Salvar alterações";
  $("#cancelEdit").hidden = false;
  renderManage();
}

$("#emojiPick").addEventListener("click", (e) => { const b = e.target.closest("[data-emoji]"); if (b) { state.form.emoji = b.dataset.emoji; renderManage(); } });
$("#colorPick").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (b) { state.form.color = b.dataset.color; renderManage(); } });
$("#suggestions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sug]"); if (!b) return;
  const s = SUGGESTIONS[Number(b.dataset.sug)];
  form.name.value = s.name; form.target.value = s.target; form.unit.value = s.unit;
  state.form = { emoji: s.emoji, color: s.color };
  renderManage(); form.name.focus();
});
$("#cancelEdit").addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    name: form.name.value, target: Number(form.target.value), unit: form.unit.value,
    emoji: state.form.emoji, color: state.form.color,
  };
  const btn = $("#submitBtn"); btn.disabled = true;
  try {
    if (state.editing) {
      const updated = await api(`habits/${state.editing}`, { method: "PATCH", body });
      state.habits = state.habits.map((h) => (h.id === updated.id ? updated : h));
      toast("Hábito atualizado");
    } else {
      const created = await api("habits", { method: "POST", body });
      state.habits.push(created);
      toast(`${created.emoji} ${created.name} adicionado`);
    }
    resetForm(); renderAll();
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; }
});

$("#manageList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = Number(b.closest("li").dataset.id);
  const idx = state.habits.findIndex((h) => h.id === id);
  const h = state.habits[idx];
  if (b.dataset.act === "edit") { fillForm(h); form.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (b.dataset.act === "del") {
    if (!confirm(`Excluir "${h.name}" e todo o histórico dele?`)) return;
    try {
      await api(`habits/${id}`, { method: "DELETE" });
      state.habits.splice(idx, 1);
      if (state.editing === id) resetForm();
      renderAll(); toast("Hábito excluído");
    } catch (err) { toast(err.message); }
    return;
  }
  if (b.dataset.act === "up" && idx > 0) {
    [state.habits[idx - 1], state.habits[idx]] = [state.habits[idx], state.habits[idx - 1]];
    renderAll();
    try {
      await Promise.all(state.habits.map((x, i) => x.position !== i
        ? api(`habits/${x.id}`, { method: "PATCH", body: { position: i } }).then(() => { x.position = i; })
        : null));
    } catch (err) { toast(err.message); }
  }
});

// Novo dia sem recarregar
setInterval(() => {
  const t = ymd(new Date());
  if (t !== state.today) { if (state.selected === state.today) state.selected = t; state.today = t; renderAll(); }
}, 60_000);

// ---------- Boot ----------
async function boot() {
  renderHeader();
  $("#habitList").innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  const from = ymd(addDays(new Date(), -HISTORY_DAYS));
  try {
    const data = await api(`state?from=${from}&to=${state.today}&seed=1`);
    state.habits = data.habits;
    for (const c of data.checkins) state.logs.set(key(c.habitId, String(c.day).slice(0, 10)), c.count);
    renderAll();
  } catch (err) {
    $("#habitList").innerHTML = "";
    toast(err.message);
  }
}
boot();
