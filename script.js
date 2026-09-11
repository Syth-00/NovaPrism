/* ============================================
   NOVAPRISM — Logic login & dashboard
   Semua data (akun & riwayat) disimpan di localStorage
   (sisi browser). Ganti bagian AUTH ini dengan pemanggilan
   API/Cloudflare Worker asli begitu backend-nya siap.
   ============================================ */

const STORAGE_KEYS = {
  session: "novaprism_session",
  records: "novaprism_login_records",
  bgImage: "novaprism_bg_image",
  accounts: "novaprism_accounts",
  rekening: "novaprism_rekening",
  reports: "novaprism_reports",
  reportsKesalahan: "novaprism_reports_kesalahan",
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

function allMenuKeys() {
  return MENU_CONFIG.map(m => m.key);
}

// ---------- Akun (Data Login) ----------

function getAccounts() {
  const raw = localStorage.getItem(STORAGE_KEYS.accounts);
  return raw ? JSON.parse(raw) : null;
}

function getAccountByEmail(email) {
  return (getAccounts() || []).find(a => a.email === email) || null;
}

function seedDefaultAccountIfNeeded() {
  const existing = getAccounts();
  if (existing === null) {
    // Akun awal, akses penuh ke semua menu — silakan ganti/hapus lewat menu "Data Login".
    const defaultAccount = [{
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      email: "syth",
      password: "asd123",
      access: allMenuKeys(),
      createdAt: new Date().toISOString(),
    }];
    localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(defaultAccount));
  }
}
seedDefaultAccountIfNeeded();

function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
}

function addAccount(email, password, access) {
  const accounts = getAccounts() || [];
  accounts.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    email,
    password,
    access: access && access.length ? access : ["home"],
    createdAt: new Date().toISOString(),
  });
  saveAccounts(accounts);
}

function updateAccountAccess(id, access) {
  const accounts = getAccounts() || [];
  const account = accounts.find(a => a.id === id);
  if (account) {
    account.access = access && access.length ? access : ["home"];
    saveAccounts(accounts);
  }
}

function deleteAccount(id) {
  const accounts = (getAccounts() || []).filter(a => a.id !== id);
  saveAccounts(accounts);
}

function findAccount(email, password) {
  const accounts = getAccounts() || [];
  return accounts.find(a => a.email === email && a.password === password) || null;
}

// ---------- Riwayat login ----------

function getRecords() {
  const raw = localStorage.getItem(STORAGE_KEYS.records);
  return raw ? JSON.parse(raw) : [];
}

function saveRecord(record) {
  const records = getRecords();
  records.unshift(record);
  localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records.slice(0, 50)));
}

function clearLoginRecords() {
  localStorage.removeItem(STORAGE_KEYS.records);
}

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

// ---------- Background custom ----------

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
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");

    const matched = findAccount(email, password);

    saveRecord({
      username: email || "(kosong)",
      time: new Date().toISOString(),
      device: detectDevice(),
      status: matched ? "success" : "failed",
    });

    if (matched) {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ email, loginAt: new Date().toISOString() }));
      window.location.href = "dashboard.html";
    } else {
      errorMsg.style.display = "block";
    }
  });
}

// ---------- Auth guard & dashboard (dashboard.html) ----------

// ---------- Cek Rekening: sinkron dari Google Sheet ----------

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
      // Prioritas 1: cocokkan berdasarkan nomor rekening yang diekstrak dari baris
      // (menangani baris campuran seperti "BCA Nama Pemilik 1234567890"),
      // dengan nol di depan diabaikan.
      const digits = extractLongestDigits(q);
      let match = null;
      if (digits) {
        const nDigits = normalizeAccountNumber(digits);
        match = list.find(r => normalizeAccountNumber(r.nomor) === nDigits);
      }

      // Prioritas 2 (fallback): cocokkan seluruh baris sebagai nomor/nama.
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

// Format input Saldo otomatis jadi "Rp X.XXX.XXX" saat diketik.
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
    // Fallback untuk browser/konteks yang ga dukung Clipboard API
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

function getReports() {
  const raw = localStorage.getItem(STORAGE_KEYS.reports);
  return raw ? JSON.parse(raw) : [];
}

function saveReport(fields, text) {
  const reports = getReports();
  reports.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...fields,
    text,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(reports.slice(0, 50)));
}

function deleteReport(id) {
  const reports = getReports().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(reports));
}

function renderReportHistory() {
  const tbody = document.getElementById("reportHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("reportEmptyState");
  const reports = getReports();

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
    tr.querySelector("[data-del-id]").addEventListener("click", () => {
      if (confirm("Hapus report ini dari riwayat?")) {
        deleteReport(r.id);
        renderReportHistory();
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------- Reportan Kesalahan (sub-menu dari grup Reportan) ----------

// Format angka pakai titik ribuan tanpa prefix "Rp" (dipakai bareng "Rp." statis di template).
function formatNumberInputValue(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

function generateKesalahanText(f) {
  return [
    `Info : ${f.info}`,
    `Perihal : ${f.perihal}`,
    `Staff : ${f.staffNama} - ${f.staffKode}`,
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

function getKesalahanReports() {
  const raw = localStorage.getItem(STORAGE_KEYS.reportsKesalahan);
  return raw ? JSON.parse(raw) : [];
}

function saveKesalahanReport(fields, text) {
  const reports = getKesalahanReports();
  reports.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...fields,
    text,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEYS.reportsKesalahan, JSON.stringify(reports.slice(0, 50)));
}

function deleteKesalahanReport(id) {
  const reports = getKesalahanReports().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.reportsKesalahan, JSON.stringify(reports));
}

function renderKesalahanHistory() {
  const tbody = document.getElementById("rkHistoryBody");
  if (!tbody) return;
  const emptyState = document.getElementById("rkEmptyState");
  const reports = getKesalahanReports();

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
    tr.querySelector("[data-del-id]").addEventListener("click", () => {
      if (confirm("Hapus report ini dari riwayat?")) {
        deleteKesalahanReport(r.id);
        renderKesalahanHistory();
      }
    });
    tbody.appendChild(tr);
  });
}

function requireLogin() {
  const session = localStorage.getItem(STORAGE_KEYS.session);
  if (!session) {
    window.location.href = "index.html";
  }
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
  window.location.href = "index.html";
}

// Sembunyikan menu sidebar yang ga termasuk akses akun yang sedang login,
// dan pindah ke menu pertama yang boleh diakses kalau menu aktif ternyata
// disembunyikan.
function applyAccessControl() {
  const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null");
  if (!session) return;

  const account = getAccountByEmail(session.email);
  if (!account) {
    // Akun sudah dihapus dari Data Login tapi sesi masih tersimpan.
    logout();
    return;
  }

  const access = account.access && account.access.length ? account.access : ["home"];
  let activeIsVisible = false;
  let firstVisibleItem = null;

  document.querySelectorAll(".nav-item").forEach(item => {
    const key = item.dataset.view;
    const allowed = access.includes(key);
    item.style.display = allowed ? "" : "none";
    if (allowed && !firstVisibleItem) firstVisibleItem = item;
    if (allowed && item.classList.contains("active")) activeIsVisible = true;
  });

  // Sembunyikan seluruh grup "Reportan" kalau ga ada satu pun sub-menunya yang boleh diakses.
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

function renderDashboard() {
  const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null");
  const records = getRecords();

  if (session) {
    document.getElementById("welcomeText").textContent = `Halo, ${session.email}`;
    document.getElementById("avatarInitial").textContent = session.email.charAt(0).toUpperCase();
  }

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
  // Default: akun baru dicentang akses "Beranda" saja, biar admin sadar milih sendiri sisanya.
  container.innerHTML = accessCheckboxesHTML(["home"]);
}

// ---------- Render tabel Data Login ----------

function renderAccounts() {
  const tbody = document.getElementById("accountTableBody");
  if (!tbody) return;
  const emptyState = document.getElementById("accountEmptyState");
  const accounts = getAccounts() || [];

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
      <td>
        <span class="pw-cell">
          <span class="pw-value" data-visible="false">••••••••</span>
          <button type="button" class="pw-toggle">lihat</button>
        </span>
      </td>
      <td><div class="access-badges">${badgesHTML}</div></td>
      <td>${formatTime(a.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-edit-id="${a.id}">Edit akses</button>
          <button type="button" class="btn-danger-ghost" data-id="${a.id}">Hapus</button>
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

    tr.querySelector(".btn-danger-ghost").addEventListener("click", () => {
      if (confirm(`Hapus akun ${a.email}?`)) {
        deleteAccount(a.id);
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
// Hanya satu baris edit yang boleh terbuka dalam satu waktu.
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

  editRow.querySelector("[data-save-id]").addEventListener("click", () => {
    const checked = Array.from(editRow.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
    if (checked.length === 0) {
      alert("Pilih minimal satu menu, kalau tidak akun ini ga bisa buka apa-apa setelah login.");
      return;
    }
    updateAccountAccess(account.id, checked);
    renderAccounts();
  });

  editRow.querySelector("[data-cancel-id]").addEventListener("click", () => {
    editRow.remove();
  });
}
