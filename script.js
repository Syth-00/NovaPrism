/* ============================================
   NOVAPRISM — Supabase Version
   Multi-user, data shared, single admin panel.
   ============================================ */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ============ GANTI DENGAN URL & KEY DARI SUPABASE ============
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs...";
// ===============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SESSION_KEY = "novaprism_session";
const BG_KEY = "novaprism_bg_image";

// ---------- Menu config ----------
const MENU_CONFIG = [
  { key: "home", label: "Beranda" },
  { key: "datalogin", label: "Data Login" },
  { key: "rekening", label: "Cek Rekening" },
  { key: "report", label: "Reportan Bank" },
  { key: "reportkesalahan", label: "Reportan Kesalahan" },
  { key: "pengembalian", label: "Pengembalian HP & Simcard" },
];

function menuLabel(key) {
  const found = MENU_CONFIG.find(m => m.key === key);
  return found ? found.label : key;
}

// ---------- Session ----------
function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ---------- Helpers ----------
function detectDevice() {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Desktop";
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// ---------- Background ----------
function applyBackground(url) {
  if (url) document.documentElement.style.setProperty("--user-bg-image", `url("${url}")`);
}
function loadSavedBackground() {
  const saved = localStorage.getItem(BG_KEY);
  if (saved) applyBackground(saved);
}
loadSavedBackground();

const bgInputEl = document.getElementById("bgInput");
if (bgInputEl) {
  const saved = localStorage.getItem(BG_KEY);
  if (saved) bgInputEl.value = saved;
  bgInputEl.addEventListener("change", () => {
    const url = bgInputEl.value.trim();
    if (url) { localStorage.setItem(BG_KEY, url); applyBackground(url); }
  });
}

// ---------- Login form (index.html) ----------
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");
    const btn = loginForm.querySelector("button[type='submit']");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Memeriksa...";

    const { data, error } = await supabase
      .from("accounts")
      .select("email, access")
      .eq("email", email)
      .eq("password", password)
      .maybeSingle();

    const matched = !error && data;

    // Fire-and-forget: catat riwayat di background
    supabase.from("records").insert({
      username: email || "(kosong)",
      device: detectDevice(),
      status: matched ? "success" : "failed",
    });

    btn.disabled = false;
    btn.textContent = originalLabel;

    if (matched) {
      setSession({ email: data.email, access: data.access || ["home"] });
      window.location.href = "dashboard.html";
    } else {
      errorMsg.style.display = "block";
    }
  });
}

// ---------- Auth guard & logout ----------
function requireLogin() {
  const session = getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

function applyAccessControl(session) {
  const access = (session && session.access) || ["home"];
  let activeIsVisible = false;
  let firstVisibleItem = null;

  document.querySelectorAll(".nav-item").forEach(item => {
    const allowed = access.includes(item.dataset.view);
    item.style.display = allowed ? "" : "none";
    if (allowed && !firstVisibleItem) firstVisibleItem = item;
    if (allowed && item.classList.contains("active")) activeIsVisible = true;
  });

  document.querySelectorAll(".nav-group").forEach(group => {
    const hasVisible = Array.from(group.querySelectorAll(".nav-item")).some(i => i.style.display !== "none");
    group.style.display = hasVisible ? "" : "none";
  });

  if (!activeIsVisible && firstVisibleItem) {
    const parentGroup = firstVisibleItem.closest(".nav-group");
    if (parentGroup) parentGroup.classList.remove("collapsed");
    firstVisibleItem.click();
  }
}

// ---------- Accounts ----------
async function fetchAccountsConfig() {
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });
  return data || [];
}

async function addAccount(email, password, access) {
  const { error } = await supabase.from("accounts").insert({ email, password, access });
  return !error;
}

async function updateAccountAccess(email, access) {
  await supabase.from("accounts").update({ access }).eq("email", email);
}

async function deleteAccount(email) {
  await supabase.from("accounts").delete().eq("email", email);
}

// ---------- Records ----------
async function fetchRecords() {
  const { data } = await supabase
    .from("records")
    .select("*")
    .order("time", { ascending: false })
    .limit(50);
  return data || [];
}

async function clearLoginRecords() {
  await supabase.from("records").delete().neq("status", "__never__");
}

// ---------- Rekening cache ----------
async function fetchRekeningCache() {
  const { data } = await supabase.from("rekening").select("*").eq("id", 1).maybeSingle();
  if (!data) return null;
  return { list: data.list || [], syncedAt: data.synced_at };
}

async function saveRekeningCache(list) {
  await supabase.from("rekening").upsert({
    id: 1,
    list,
    synced_at: new Date().toISOString(),
  });
}

// ---------- Reports (bank) ----------
async function fetchReports() {
  const { data } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

async function saveReport(fields, text) {
  await supabase.from("reports").insert({
    info: fields.info,
    perihal: fields.perihal,
    bank: fields.bank,
    nama_rek: fields.namaRek,
    nomor_rek: fields.nomorRek,
    saldo: fields.saldo,
    lampiran: fields.lampiran,
    keterangan: fields.keterangan,
    text,
  });
}

async function deleteReport(id) {
  await supabase.from("reports").delete().eq("id", id);
}

// ---------- Reports (kesalahan) ----------
async function fetchKesalahanReports() {
  const { data } = await supabase
    .from("reports_kesalahan")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

async function saveKesalahanReport(fields, text) {
  await supabase.from("reports_kesalahan").insert({
    info: fields.info,
    perihal: fields.perihal,
    staff_nama: fields.staffNama,
    staff_kode: fields.staffKode,
    agen_nama: fields.agenNama,
    user_id: fields.userId,
    nama_rek: fields.namaRek,
    nomor_rek: fields.nomorRek,
    jenis_bank: fields.jenisBank,
    nominal: fields.nominal,
    lampiran: fields.lampiran,
    keterangan: fields.keterangan,
    text,
  });
}

async function deleteKesalahanReport(id) {
  await supabase.from("reports_kesalahan").delete().eq("id", id);
}

// ---------- Pengembalian HP & Simcard ----------
let _pengembalianItems = [];

function getPengembalianItems() {
  return [..._pengembalianItems];
}

function addPengembalianItem(data) {
  _pengembalianItems.push({
    bank: data.bank || "",
    typeBank: data.typeBank || "",
    namaRek: data.namaRek || "",
    nomorRek: data.nomorRek || "",
    kelengkapan: data.kelengkapan || "",
  });
}

function removePengembalianItem(index) {
  _pengembalianItems.splice(index, 1);
}

function resetPengembalianItems() {
  _pengembalianItems = [];
}

function generatePengembalianText(items) {
  if (!items || items.length === 0) return "";
  return items.map(item => [
    `BANK : ${item.bank}`,
    `TYPE BANK : ${item.typeBank}`,
    `NAMA REKENING : ${item.namaRek}`,
    `NOMOR REKENING : ${item.nomorRek}`,
    `KELENGKAPAN : ${item.kelengkapan}`,
  ].join("\n")).join("\n\n");
}

function renderPengembalianItems() {
  const container = document.getElementById("pengembalianList");
  const countEl = document.getElementById("pbgCount");
  if (!container) return;

  if (countEl) countEl.textContent = String(_pengembalianItems.length);

  if (_pengembalianItems.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada item. Tambah lewat form di kiri.</div>`;
    return;
  }

  container.innerHTML = _pengembalianItems.map((item, i) => `
    <div class="rek-result-item" style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; margin-bottom:4px;">${item.bank || "(Bank kosong)"}</div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.6; word-break:break-word;">
          ${item.typeBank} · ${item.namaRek} · ${item.nomorRek}<br/>
          Kelengkapan: ${item.kelengkapan}
        </div>
      </div>
      <button type="button" class="btn-danger-ghost" data-remove-idx="${i}" style="flex-shrink:0;">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-remove-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeIdx);
      removePengembalianItem(idx);
      renderPengembalianItems();
      updatePengembalianPreview();
    });
  });
}

function updatePengembalianPreview() {
  const preview = document.getElementById("pengembalianPreview");
  if (!preview) return;
  preview.textContent = generatePengembalianText(_pengembalianItems);
}

function getPengembalianFormFields() {
  return {
    bank: (document.getElementById("pbgBank") || {}).value || "",
    typeBank: (document.getElementById("pbgTypeBank") || {}).value || "",
    namaRek: (document.getElementById("pbgNamaRek") || {}).value || "",
    nomorRek: (document.getElementById("pbgNomorRek") || {}).value || "",
    kelengkapan: (document.getElementById("pbgKelengkapan") || {}).value || "",
  };
}

function clearPengembalianForm() {
  ["pbgBank", "pbgTypeBank", "pbgNamaRek", "pbgNomorRek", "pbgKelengkapan"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}

async function fetchPengembalianReports() {
  const { data } = await supabase
    .from("pengembalian")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

async function savePengembalianReport(items, text) {
  await supabase.from("pengembalian").insert({
    items: items || [],
    text: text || "",
  });
}

async function deletePengembalianReport(id) {
  await supabase.from("pengembalian").delete().eq("id", id);
}

async function renderPengembalianHistory() {
  const tbody = document.getElementById("pengembalianHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("pengembalianEmptyState");
  const reports = await fetchPengembalianReports();

  tbody.innerHTML = "";
  if (reports.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  reports.forEach(r => {
    const items = r.items || [];
    const summary = items.length === 0
      ? "—"
      : `${items[0].bank || "?"}${items.length > 1 ? ` +${items.length - 1} lainnya` : ""}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${summary}</td>
      <td>${items.length} item</td>
      <td>${formatTime(r.created_at)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy-id="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy-id]").addEventListener("click", async (e) => {
      await copyText(r.text || "");
      flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm("Hapus report ini?")) {
        await deletePengembalianReport(r.id);
        renderPengembalianHistory();
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Render: Dashboard ----------
async function renderDashboard(session) {
  const records = await fetchRecords();
  if (session) {
    document.getElementById("welcomeText").textContent = `Halo, ${session.email}`;
    document.getElementById("avatarInitial").textContent = session.email.charAt(0).toUpperCase();
  }

  const total = records.length;
  const successCount = records.filter(r => r.status === "success").length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statSuccess").textContent = successCount;
  document.getElementById("statFailed").textContent = total - successCount;
  document.getElementById("statLast").textContent = records[0] ? formatTime(records[0].time) : "—";

  const tbody = document.getElementById("logTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";
  if (records.length === 0) { emptyState.style.display = "block"; return; }
  emptyState.style.display = "none";

  records.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.username || "—"}</td>
      <td>${formatTime(r.time)}</td>
      <td>${r.device || "—"}</td>
      <td><span class="status-pill ${r.status}"><span class="dot"></span>${r.status === "success" ? "Berhasil" : "Gagal"}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Render: Accounts ----------
function accessCheckboxesHTML(selected) {
  return MENU_CONFIG.map(m => `
    <label class="access-check">
      <input type="checkbox" value="${m.key}" ${selected.includes(m.key) ? "checked" : ""} />
      <span>${m.label}</span>
    </label>
  `).join("");
}

async function renderAccounts() {
  const tbody = document.getElementById("accountTableBody");
  if (!tbody) return;
  const emptyState = document.getElementById("accountEmptyState");
  const accounts = await fetchAccountsConfig();

  tbody.innerHTML = "";
  if (accounts.length === 0) { emptyState.style.display = "block"; return; }
  emptyState.style.display = "none";

  accounts.forEach(a => {
    const access = a.access || [];
    const badgesHTML = access.length
      ? MENU_CONFIG.filter(m => access.includes(m.key)).map(m => `<span class="access-badge">${m.label}</span>`).join("")
      : `<span class="access-badge empty">Tidak ada akses</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.email}</td>
      <td>
        <span class="pw-cell">
          <span class="pw-value" data-visible="false">••••••••</span>
          <button type="button" class="pw-toggle">lihat</button>
        </span>
      </td>
      <td><div class="access-badges">${badgesHTML}</div></td>
      <td>${formatTime(a.created_at)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-edit-id="${a.email}">Edit akses</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${a.email}">Hapus</button>
        </div>
      </td>
    `;

    const pwValueEl = tr.querySelector(".pw-value");
    const pwToggleEl = tr.querySelector(".pw-toggle");
    pwToggleEl.addEventListener("click", () => {
      const visible = pwValueEl.dataset.visible === "true";
      pwValueEl.textContent = visible ? "••••••••" : a.password;
      pwValueEl.dataset.visible = String(!visible);
      pwToggleEl.textContent = visible ? "lihat" : "sembunyikan";
    });

    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm(`Hapus akun ${a.email}?`)) {
        await deleteAccount(a.email);
        renderAccounts();
      }
    });

    tr.querySelector("[data-edit-id]").addEventListener("click", () => {
      toggleEditAccessRow(tr, a);
    });

    tbody.appendChild(tr);
  });
}

function toggleEditAccessRow(rowEl, account) {
  const tbody = rowEl.parentElement;
  const existing = tbody.querySelector(".edit-access-row");
  const alreadyOpenForThis = existing && existing.dataset.forId === account.email;
  if (existing) existing.remove();
  if (alreadyOpenForThis) return;

  const editRow = document.createElement("tr");
  editRow.className = "edit-access-row";
  editRow.dataset.forId = account.email;
  editRow.innerHTML = `
    <td colspan="5">
      <div class="access-group-label">Atur menu untuk <strong>${account.email}</strong>:</div>
      <div class="access-checks">${accessCheckboxesHTML(account.access || [])}</div>
      <div class="edit-access-actions">
        <button type="button" class="btn-mini" data-save>Simpan</button>
        <button type="button" class="btn-ghost" data-cancel>Batal</button>
      </div>
    </td>
  `;
  rowEl.insertAdjacentElement("afterend", editRow);

  editRow.querySelector("[data-save]").addEventListener("click", async () => {
    const checked = Array.from(editRow.querySelectorAll('input:checked')).map(i => i.value);
    if (checked.length === 0) { alert("Pilih minimal satu menu."); return; }
    await updateAccountAccess(account.email, checked);
    renderAccounts();
  });
  editRow.querySelector("[data-cancel]").addEventListener("click", () => editRow.remove());
}

function renderAddAccessChecks() {
  const container = document.getElementById("newAccessChecks");
  if (!container) return;
  container.innerHTML = accessCheckboxesHTML(["home"]);
}

// ---------- Rekening sync & search ----------
const SHEET_CONFIG = {
  sheetId: "1mwc-ugOSqBFvvMupE_12Svh8uVFdShvf7thrqVXPuxE",
  gid: "2056151193",
};

function sheetCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.sheetId}/export?format=csv&gid=${SHEET_CONFIG.gid}`;
}

function parseCsvLine(line) {
  const result = []; let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { result.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseSheetCsvToRekening(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = lines.map(parseCsvLine);
  if (rows.length === 0) return [];
  const looksLikeHeader = rows[0][1] && !/\d/.test(rows[0][1]);
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  return dataRows
    .map(cols => ({ nama: (cols[0] || "").trim(), nomor: (cols[1] || "").trim() }))
    .filter(r => r.nama || r.nomor);
}

async function syncRekeningFromSheet() {
  const statusEl = document.getElementById("rekSyncStatus");
  if (statusEl) { statusEl.textContent = "Menyinkron..."; statusEl.className = "rek-sync-status"; }
  try {
    const res = await fetch(sheetCsvUrl());
    if (!res.ok) throw new Error("Sheet tidak bisa diakses (status " + res.status + ").");
    const text = await res.text();
    const list = parseSheetCsvToRekening(text);
    await saveRekeningCache(list);
    await renderSyncStatus();
  } catch (err) {
    if (statusEl) { statusEl.textContent = "Gagal sinkron: " + err.message; statusEl.className = "rek-sync-status error"; }
  }
}

async function renderSyncStatus() {
  const statusEl = document.getElementById("rekSyncStatus");
  if (!statusEl) return;
  const cache = await fetchRekeningCache();
  if (!cache) { statusEl.textContent = "Belum pernah disinkron."; statusEl.className = "rek-sync-status"; return; }
  statusEl.textContent = `${cache.list.length} data rekening — terakhir disinkron ${formatTime(cache.syncedAt)}.`;
  statusEl.className = "rek-sync-status success";
}

function normalizeForSearch(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}
function extractLongestDigits(line) {
  const matches = line.match(/\d{4,}/g);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a), "");
}
function normalizeAccountNumber(s) {
  const digitsOnly = (s || "").replace(/\D/g, "");
  const stripped = digitsOnly.replace(/^0+/, "");
  return stripped || digitsOnly;
}

async function searchRekening(rawInput) {
  const resultList = document.getElementById("rekResultList");
  const queries = rawInput.split("\n").map(q => q.trim()).filter(Boolean);
  if (queries.length === 0) {
    resultList.innerHTML = `<div class="empty-state">Tempel dulu nomor rekening atau nama yang mau dicari.</div>`;
    return;
  }
  const cache = await fetchRekeningCache();
  const list = cache ? cache.list : [];
  const matches = queries.map(q => {
    const digits = extractLongestDigits(q);
    let match = null;
    if (digits) match = list.find(r => normalizeAccountNumber(r.nomor) === normalizeAccountNumber(digits));
    if (!match) {
      const nq = normalizeForSearch(q);
      match = list.find(r =>
        normalizeAccountNumber(r.nomor) === normalizeAccountNumber(q) ||
        normalizeForSearch(r.nomor) === nq ||
        (nq.length >= 4 && normalizeForSearch(r.nomor).includes(nq)) ||
        (nq.length >= 3 && normalizeForSearch(r.nama).includes(nq))
      );
    }
    return match ? { query: q, match } : null;
  }).filter(Boolean);

  if (matches.length === 0) {
    resultList.innerHTML = `<div class="empty-state">Tidak ada satu pun yang cocok.</div>`;
    return;
  }
  resultList.innerHTML = matches.map(({ query, match }) => `
    <div class="rek-result-item found">
      <span class="status-pill success"><span class="dot"></span>Ditemukan</span>
      <div class="rek-result-detail"><strong>${match.nama}</strong><span>${match.nomor}</span></div>
      <div class="rek-result-query">dicari: "${query}"</div>
    </div>`
  ).join("");
}

// ---------- Reportan Bank ----------
function formatRupiahInputValue(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return "Rp " + Number(digits).toLocaleString("id-ID");
}

function generateReportText(f) {
  return [
    `Info : ${f.info}`, `Perihal : ${f.perihal}`, ``,
    `${f.bank}`, `Nama Rekening : ${f.namaRek}`, `Nomor Rekening : ${f.nomorRek}`,
    `Saldo : ${f.saldo}`, `Lampiran : ${f.lampiran}`, ``,
    `Keterangan :`, `${f.keterangan}`,
  ].join("\n");
}

function getReportFieldsFromForm() {
  return {
    info: document.getElementById("repInfo").value,
    perihal: document.getElementById("repPerihal").value,
    bank: document.getElementById("repBank").value,
    namaRek: document.getElementById("repNamaRek").value,
    nomorRek: document.getElementById("repNomorRek").value,
    saldo: document.getElementById("repSaldo").value,
    lampiran: document.getElementById("repLampiran").value,
    keterangan: document.getElementById("repKeterangan").value,
  };
}

function updateReportPreview() {
  const preview = document.getElementById("reportPreview");
  if (!preview) return;
  preview.textContent = generateReportText(getReportFieldsFromForm());
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const tmp = document.createElement("textarea");
    tmp.value = text; tmp.style.position = "fixed"; tmp.style.opacity = "0";
    document.body.appendChild(tmp); tmp.focus(); tmp.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(tmp); return ok;
  }
}

function flashButton(btn, tempLabel) {
  const original = btn.textContent;
  btn.textContent = tempLabel;
  setTimeout(() => { btn.textContent = original; }, 1500);
}

async function renderReportHistory() {
  const tbody = document.getElementById("reportHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("reportEmptyState");
  const reports = await fetchReports();
  tbody.innerHTML = "";
  if (reports.length === 0) { emptyState.style.display = "block"; return; }
  emptyState.style.display = "none";

  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.perihal || "—"}</td>
      <td>${r.bank || "—"}</td>
      <td>${r.nama_rek || "—"}</td>
      <td>${formatTime(r.created_at)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy-id="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy-id]").addEventListener("click", async (e) => {
      await copyText(r.text || "");
      flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm("Hapus report ini?")) { await deleteReport(r.id); renderReportHistory(); }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Reportan Kesalahan ----------
function formatNumberInputValue(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

function generateKesalahanText(f) {
  return [
    `Info : ${f.info}`, `Perihal : ${f.perihal}`,
    `Staff : ${f.staffNama} - ${f.staffKode} (${f.agenNama})`, ``,
    `UserID : ${f.userId}`, `Nama Rekening : ${f.namaRek}`,
    `Nomor Rekening : ${f.nomorRek} (${f.jenisBank})`,
    `Nominal : Rp. ${f.nominal}`, `Lampiran : ${f.lampiran}`, ``,
    `Keterangan :`, `${f.keterangan}`,
  ].join("\n");
}

function getKesalahanFieldsFromForm() {
  return {
    info: document.getElementById("rkInfo").value,
    perihal: document.getElementById("rkPerihal").value,
    staffNama: document.getElementById("rkStaffNama").value,
    staffKode: document.getElementById("rkStaffKode").value,
    agenNama: document.getElementById("rkAgenNama").value,
    userId: document.getElementById("rkUserId").value,
    namaRek: document.getElementById("rkNamaRek").value,
    nomorRek: document.getElementById("rkNomorRek").value,
    jenisBank: document.getElementById("rkJenisBank").value,
    nominal: document.getElementById("rkNominal").value,
    lampiran: document.getElementById("rkLampiran").value,
    keterangan: document.getElementById("rkKeterangan").value,
  };
}

function updateKesalahanPreview() {
  const preview = document.getElementById("rkPreview");
  if (!preview) return;
  preview.textContent = generateKesalahanText(getKesalahanFieldsFromForm());
}

async function renderKesalahanHistory() {
  const tbody = document.getElementById("rkHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("rkEmptyState");
  const reports = await fetchKesalahanReports();
  tbody.innerHTML = "";
  if (reports.length === 0) { emptyState.style.display = "block"; return; }
  emptyState.style.display = "none";

  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.perihal || "—"}</td>
      <td>${r.user_id || "—"}</td>
      <td>${r.nama_rek || "—"}</td>
      <td>${formatTime(r.created_at)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy-id="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy-id]").addEventListener("click", async (e) => {
      await copyText(r.text || "");
      flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm("Hapus report ini?")) { await deleteKesalahanReport(r.id); renderKesalahanHistory(); }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Export untuk dashboard.html ----------
export {
  requireLogin, logout, getSession, applyAccessControl, menuLabel,
  renderDashboard, renderAccounts, renderAddAccessChecks,
  fetchAccountsConfig, addAccount, deleteAccount, updateAccountAccess,
  fetchRecords, clearLoginRecords,
  fetchRekeningCache, saveRekeningCache, renderSyncStatus,
  syncRekeningFromSheet, searchRekening,
  renderReportHistory, updateReportPreview, formatRupiahInputValue,
  getReportFieldsFromForm, generateReportText, saveReport,
  copyText, flashButton,
  renderKesalahanHistory, updateKesalahanPreview, formatNumberInputValue,
  getKesalahanFieldsFromForm, generateKesalahanText, saveKesalahanReport,
  // Pengembalian
  renderPengembalianItems, updatePengembalianPreview,
  getPengembalianFormFields, clearPengembalianForm,
  addPengembalianItem, resetPengembalianItems,
  generatePengembalianText, savePengembalianReport,
  renderPengembalianHistory,
  getPengembalianItems,
};
