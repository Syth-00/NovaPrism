/* ============================================
   NOVAPRISM — Logic login & dashboard
   Akun, riwayat login, dan report sekarang disimpan lewat
   Cloudflare Worker (backend terpisah — bisa D1 atau KV, script.js
   ini ga peduli, karena cuma manggil alamat API-nya), bukan
   localStorage lagi — jadi data ga hilang walau kamu ganti PC/browser.
   Cek Rekening (Google Sheet) & background image tetap lokal,
   karena Sheet sudah jadi sumber data pusat & background cuma
   preferensi tampilan per device.
   ============================================ */

// GANTI dengan URL Worker kamu setelah deploy (lihat README-BACKEND.md
// di folder novaprism-backend). Contoh: "https://novaprism-api.namamu.workers.dev"
const API_BASE_URL = "novaprism-api.smbjacky.workers.dev";

const STORAGE_KEYS = {
  session: "novaprism_session",   // sekarang cuma nyimpen {token, email}
  bgImage: "novaprism_bg_image",
  rekening: "novaprism_rekening",
};

// Daftar menu yang tersedia di sidebar. Kalau nanti nambah menu baru di
// dashboard.html, cukup daftarin di sini (key harus sama dengan data-view
// pada elemen .nav-item) — otomatis muncul jadi pilihan akses.
const MENU_CONFIG = [
  { key: "home", label: "Beranda" },
  { key: "datalogin", label: "Data Login" },
  { key: "rekening", label: "Cek Rekening" },
  { key: "report", label: "Reportan Bank" },
  { key: "reportkesalahan", label: "Reportan Kesalahan" },
];

function menuLabel(key) {
  const found = MENU_CONFIG.find(m => m.key === key);
  return found ? found.label : key;
}

// ---------- Komunikasi ke Worker (API) ----------

function getToken() {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  const session = raw ? JSON.parse(raw) : null;
  return session ? session.token : null;
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE_URL + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      // Sesi habis/ga valid — paksa balik ke halaman login.
      localStorage.removeItem(STORAGE_KEYS.session);
      window.location.href = "index.html";
    }
    throw new Error(data.error || "Terjadi kesalahan pada server.");
  }
  return data;
}

// Disimpan sekali per load dashboard supaya applyAccessControl() ga perlu fetch ulang.
let currentAccess = [];

// ---------- Auth ----------

async function login(email, password) {
  const res = await fetch(API_BASE_URL + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "Login gagal." };

  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ token: data.token, email: data.email }));
  currentAccess = data.access || [];
  return { ok: true };
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

async function logout() {
  try { await apiFetch("/api/logout", { method: "POST" }); } catch (e) { /* abaikan, tetap logout */ }
  localStorage.removeItem(STORAGE_KEYS.session);
  window.location.href = "index.html";
}

// Validasi token ke server + ambil access terbaru. Dipanggil sekali saat
// dashboard dibuka. Kalau token ga valid/kadaluarsa, apiFetch otomatis
// nendang balik ke index.html.
async function checkSession() {
  const data = await apiFetch("/api/session");
  currentAccess = data.access || [];
  return data;
}

// ---------- Akun (Data Login) ----------

async function getAccounts() {
  return apiFetch("/api/accounts");
}

async function addAccount(email, password, access) {
  return apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ email, password, access }),
  });
}

async function updateAccountAccess(id, access) {
  return apiFetch(`/api/accounts/${id}/access`, {
    method: "PATCH",
    body: JSON.stringify({ access }),
  });
}

async function deleteAccount(id) {
  return apiFetch(`/api/accounts/${id}`, { method: "DELETE" });
}

// ---------- Riwayat login ----------

async function getRecords() {
  return apiFetch("/api/records");
}

async function clearLoginRecords() {
  return apiFetch("/api/records", { method: "DELETE" });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// ---------- Background custom (tetap lokal — preferensi tampilan per device) ----------

function applyBackground(url) {
  if (url) {
    document.documentElement.style.setProperty("--user-bg-image", `url("${url}")`);
  }
}

function loadSavedBackground() {
  const saved = localStorage.getItem(STORAGE_KEYS.bgImage);
  if (saved) applyBackground(saved);
}

loadSavedBackground();

const bgInputEl = document.getElementById("bgInput");
if (bgInputEl) {
  const saved = localStorage.getItem(STORAGE_KEYS.bgImage);
  if (saved) bgInputEl.value = saved;

  bgInputEl.addEventListener("change", () => {
    const url = bgInputEl.value.trim();
    if (url) {
      localStorage.setItem(STORAGE_KEYS.bgImage, url);
      applyBackground(url);
    }
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
    const submitBtn = loginForm.querySelector("button[type=submit]");

    submitBtn.disabled = true;
    submitBtn.textContent = "Memeriksa...";
    errorMsg.style.display = "none";

    try {
      const result = await login(email, password);
      if (result.ok) {
        window.location.href = "dashboard.html";
        return;
      }
      errorMsg.textContent = result.error;
      errorMsg.style.display = "block";
    } catch (err) {
      errorMsg.textContent = "Ga bisa menghubungi server. Cek koneksi atau konfigurasi API_BASE_URL.";
      errorMsg.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Masuk";
    }
  });
}

// ---------- Cek Rekening: sinkron dari Google Sheet (tetap sama, tidak perlu migrasi) ----------

// Ganti sheetId/gid ini kalau kamu pindah ke spreadsheet atau tab lain.
// gid dilihat dari URL sheet setelah "#gid=..." saat tab "CEK REK" sedang dibuka.
const SHEET_CONFIG = {
  sheetId: "1mwc-ugOSqBFvvMupE_12Svh8uVFdShvf7thrqVXPuxE",
  gid: "2056151193",
};

function sheetCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.sheetId}/export?format=csv&gid=${SHEET_CONFIG.gid}`;
}

function getRekeningCache() {
  const raw = localStorage.getItem(STORAGE_KEYS.rekening);
  return raw ? JSON.parse(raw) : null;
}

function saveRekeningCache(list) {
  localStorage.setItem(STORAGE_KEYS.rekening, JSON.stringify({
    list,
    syncedAt: new Date().toISOString(),
  }));
}

// Kolom A = nama rekening, kolom B = nomor rekening. Baris pertama dianggap
// header (dilewati) kalau kolom B pada baris itu bukan berupa angka.
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

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

async function syncRekeningFromSheet() {
  const statusEl = document.getElementById("rekSyncStatus");
  if (statusEl) {
    statusEl.textContent = "Menyinkron data dari Google Sheet...";
    statusEl.className = "rek-sync-status";
  }
  try {
    const res = await fetch(sheetCsvUrl());
    if (!res.ok) throw new Error("Sheet ga bisa diakses (status " + res.status + "). Pastikan sharing-nya \"Anyone with the link\".");
    const text = await res.text();
    const list = parseSheetCsvToRekening(text);
    saveRekeningCache(list);
    renderSyncStatus();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = "Gagal sinkron: " + err.message;
      statusEl.className = "rek-sync-status error";
    }
  }
}

function renderSyncStatus() {
  const statusEl = document.getElementById("rekSyncStatus");
  if (!statusEl) return;
  const cache = getRekeningCache();
  if (!cache) {
    statusEl.textContent = "Belum pernah disinkron.";
    statusEl.className = "rek-sync-status";
    return;
  }
  statusEl.textContent = `${cache.list.length} data rekening — terakhir disinkron ${formatTime(cache.syncedAt)}.`;
  statusEl.className = "rek-sync-status success";
}

function normalizeForSearch(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

// Ambil deretan digit terpanjang dari sebuah baris — dipakai untuk kasus
// baris campuran seperti "BCA Yesi Gusman 7621598108", di mana nomor
// rekeningnya nempel bareng nama bank & nama pemilik.
function extractLongestDigits(line) {
  const matches = line.match(/\d{4,}/g);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a), "");
}

// Buang semua yang bukan digit, lalu buang nol di depan — soalnya Google Sheets
// sering menyimpan nomor rekening sebagai angka murni dan otomatis
// menghilangkan nol di depannya (mis. "078401012113508" jadi "78401012113508").
function normalizeAccountNumber(s) {
  const digitsOnly = (s || "").replace(/\D/g, "");
  const stripped = digitsOnly.replace(/^0+/, "");
  return stripped || digitsOnly; // kalau semuanya nol, jangan sampai jadi string kosong
}

function searchRekening(rawInput) {
  const resultList = document.getElementById("rekResultList");
  const queries = rawInput.split("\n").map(q => q.trim()).filter(Boolean);

  if (queries.length === 0) {
    resultList.innerHTML = `<div class="empty-state">Tempel dulu nomor rekening atau nama yang mau dicari.</div>`;
    return;
  }

  const cache = getRekeningCache();
  const list = cache ? cache.list : [];

  const matches = queries
    .map(q => {
      const digits = extractLongestDigits(q);
      let match = null;
      if (digits) {
        const nDigits = normalizeAccountNumber(digits);
        match = list.find(r => normalizeAccountNumber(r.nomor) === nDigits);
      }
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
    })
    .filter(Boolean);

  if (matches.length === 0) {
    resultList.innerHTML = `<div class="empty-state">Tidak ada satu pun yang cocok dengan data di sheet.</div>`;
    return;
  }

  resultList.innerHTML = matches.map(({ query, match }) => `
    <div class="rek-result-item found">
      <span class="status-pill success"><span class="dot"></span>Ditemukan</span>
      <div class="rek-result-detail">
        <strong>${match.nama}</strong>
        <span>${match.nomor}</span>
      </div>
      <div class="rek-result-query">dicari: "${query}"</div>
    </div>`
  ).join("");
}

// ---------- Reportan Bank: generator teks + riwayat ----------

function formatRupiahInputValue(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return "Rp " + Number(digits).toLocaleString("id-ID");
}

function generateReportText(f) {
  return [
    `Info : ${f.info}`,
    `Perihal : ${f.perihal}`,
    ``,
    `${f.bank}`,
    `Nama Rekening : ${f.namaRek}`,
    `Nomor Rekening : ${f.nomorRek}`,
    `Saldo : ${f.saldo}`,
    `Lampiran : ${f.lampiran}`,
    ``,
    `Keterangan :`,
    `${f.keterangan}`,
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
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    const tmp = document.createElement("textarea");
    tmp.value = text;
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(tmp);
    return ok;
  }
}

function flashButton(btn, tempLabel) {
  const original = btn.textContent;
  btn.textContent = tempLabel;
  setTimeout(() => { btn.textContent = original; }, 1500);
}

async function getReports() {
  return apiFetch("/api/reports");
}

async function saveReport(fields, text) {
  return apiFetch("/api/reports", { method: "POST", body: JSON.stringify({ ...fields, text }) });
}

async function deleteReport(id) {
  return apiFetch(`/api/reports/${id}`, { method: "DELETE" });
}

async function renderReportHistory() {
  const tbody = document.getElementById("reportHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("reportEmptyState");
  const reports = await getReports();

  tbody.innerHTML = "";
  if (reports.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.perihal || "—"}</td>
      <td>${r.bank || "—"}</td>
      <td>${r.namaRek || "—"}</td>
      <td>${formatTime(r.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy-id="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy-id]").addEventListener("click", async (e) => {
      await copyText(r.text);
      flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm("Hapus report ini dari riwayat?")) {
        await deleteReport(r.id);
        renderReportHistory();
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Reportan Kesalahan (sub-menu dari grup Reportan) ----------

function formatNumberInputValue(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

function generateKesalahanText(f) {
  return [
    `Info : ${f.info}`,
    `Perihal : ${f.perihal}`,
    `Staff : ${f.staffNama} - ${f.staffKode} (${f.agenNama})`,
    ``,
    `UserID : ${f.userId}`,
    `Nama Rekening : ${f.namaRek}`,
    `Nomor Rekening : ${f.nomorRek} (${f.jenisBank})`,
    `Nominal : Rp. ${f.nominal}`,
    `Lampiran : ${f.lampiran}`,
    ``,
    `Keterangan :`,
    `${f.keterangan}`,
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

async function getKesalahanReports() {
  return apiFetch("/api/reports-kesalahan");
}

async function saveKesalahanReport(fields, text) {
  return apiFetch("/api/reports-kesalahan", { method: "POST", body: JSON.stringify({ ...fields, text }) });
}

async function deleteKesalahanReport(id) {
  return apiFetch(`/api/reports-kesalahan/${id}`, { method: "DELETE" });
}

async function renderKesalahanHistory() {
  const tbody = document.getElementById("rkHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("rkEmptyState");
  const reports = await getKesalahanReports();

  tbody.innerHTML = "";
  if (reports.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.perihal || "—"}</td>
      <td>${r.userId || "—"}</td>
      <td>${r.namaRek || "—"}</td>
      <td>${formatTime(r.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy-id="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del-id="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy-id]").addEventListener("click", async (e) => {
      await copyText(r.text);
      flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del-id]").addEventListener("click", async () => {
      if (confirm("Hapus report ini dari riwayat?")) {
        await deleteKesalahanReport(r.id);
        renderKesalahanHistory();
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Kontrol akses sidebar ----------

// Sembunyikan menu sidebar yang ga termasuk akses akun yang sedang login,
// berdasarkan `currentAccess` yang sudah diambil lewat checkSession().
function applyAccessControl() {
  const access = currentAccess && currentAccess.length ? currentAccess : ["home"];
  let activeIsVisible = false;
  let firstVisibleItem = null;

  document.querySelectorAll(".nav-item").forEach(item => {
    const key = item.dataset.view;
    const allowed = access.includes(key);
    item.style.display = allowed ? "" : "none";
    if (allowed && !firstVisibleItem) firstVisibleItem = item;
    if (allowed && item.classList.contains("active")) activeIsVisible = true;
  });

  document.querySelectorAll(".nav-group").forEach(group => {
    const hasVisibleChild = Array.from(group.querySelectorAll(".nav-item")).some(i => i.style.display !== "none");
    group.style.display = hasVisibleChild ? "" : "none";
  });

  if (!activeIsVisible && firstVisibleItem) {
    const parentGroup = firstVisibleItem.closest(".nav-group");
    if (parentGroup) parentGroup.classList.remove("collapsed");
    firstVisibleItem.click();
  }
}

async function renderDashboard() {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  const session = raw ? JSON.parse(raw) : null;
  if (session) {
    document.getElementById("welcomeText").textContent = `Halo, ${session.email}`;
    document.getElementById("avatarInitial").textContent = session.email.charAt(0).toUpperCase();
  }

  const records = await getRecords();

  const total = records.length;
  const successCount = records.filter(r => r.status === "success").length;
  const failedCount = total - successCount;
  const last = records[0];

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statSuccess").textContent = successCount;
  document.getElementById("statFailed").textContent = failedCount;
  document.getElementById("statLast").textContent = last ? formatTime(last.time) : "—";

  const tbody = document.getElementById("logTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";

  if (records.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  records.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.username}</td>
      <td>${formatTime(r.time)}</td>
      <td>${r.device}</td>
      <td><span class="status-pill ${r.status}"><span class="dot"></span>${r.status === "success" ? "Berhasil" : "Gagal"}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Checkbox akses (dipakai di form tambah & edit akun) ----------

function accessCheckboxesHTML(selected) {
  return MENU_CONFIG.map(m => `
    <label class="access-check">
      <input type="checkbox" value="${m.key}" ${selected.includes(m.key) ? "checked" : ""} />
      <span>${m.label}</span>
    </label>
  `).join("");
}

function renderAddAccessChecks() {
  const container = document.getElementById("newAccessChecks");
  if (!container) return;
  container.innerHTML = accessCheckboxesHTML(["home"]);
}

// ---------- Render tabel Data Login ----------

async function renderAccounts() {
  const tbody = document.getElementById("accountTableBody");
  if (!tbody) return;
  const emptyState = document.getElementById("accountEmptyState");
  const accounts = await getAccounts();

  tbody.innerHTML = "";

  if (accounts.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  accounts.forEach(a => {
    const access = a.access && a.access.length ? a.access : [];
    const badgesHTML = access.length
      ? MENU_CONFIG.filter(m => access.includes(m.key)).map(m => `<span class="access-badge">${m.label}</span>`).join("")
      : `<span class="access-badge empty">Tidak ada akses</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.email}</td>
      <td><span class="access-badge" style="opacity:.6;">tersimpan di server</span></td>
      <td><div class="access-badges">${badgesHTML}</div></td>
      <td>${formatTime(a.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-edit-id="${a.id}">Edit akses</button>
          <button type="button" class="btn-danger-ghost" data-id="${a.id}">Hapus</button>
        </div>
      </td>
    `;

    tr.querySelector(".btn-danger-ghost").addEventListener("click", async () => {
      if (confirm(`Hapus akun ${a.email}?`)) {
        await deleteAccount(a.id);
        renderAccounts();
      }
    });

    tr.querySelector("[data-edit-id]").addEventListener("click", () => {
      toggleEditAccessRow(tr, a);
    });

    tbody.appendChild(tr);
  });
}

// Buka/tutup baris edit akses tepat di bawah baris akun yang diklik.
function toggleEditAccessRow(rowEl, account) {
  const tbody = rowEl.parentElement;
  const existing = tbody.querySelector(".edit-access-row");
  const alreadyOpenForThis = existing && existing.dataset.forId === account.id;

  if (existing) existing.remove();
  if (alreadyOpenForThis) return;

  const editRow = document.createElement("tr");
  editRow.className = "edit-access-row";
  editRow.dataset.forId = account.id;
  editRow.innerHTML = `
    <td colspan="5">
      <div class="access-group-label">Atur menu yang boleh diakses <strong>${account.email}</strong>:</div>
      <div class="access-checks" id="editAccessChecks-${account.id}">
        ${accessCheckboxesHTML(account.access || [])}
      </div>
      <div class="edit-access-actions">
        <button type="button" class="btn-mini" data-save-id="${account.id}">Simpan</button>
        <button type="button" class="btn-ghost" data-cancel-id="${account.id}">Batal</button>
      </div>
    </td>
  `;
  rowEl.insertAdjacentElement("afterend", editRow);

  editRow.querySelector("[data-save-id]").addEventListener("click", async () => {
    const checked = Array.from(editRow.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
    if (checked.length === 0) {
      alert("Pilih minimal satu menu, kalau tidak akun ini ga bisa buka apa-apa setelah login.");
      return;
    }
    await updateAccountAccess(account.id, checked);
    renderAccounts();
  });

  editRow.querySelector("[data-cancel-id]").addEventListener("click", () => {
    editRow.remove();
  });
}
