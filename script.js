/* ============================================
   NOVAPRISM — Firebase Firestore Version
   Data bersama, multi-user, multi-device.
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs,
  addDoc, deleteDoc, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============ 1. GANTI DENGAN CONFIG DARI FIREBASE CONSOLE ============
  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyCdNfBIY9gK0LKPqNmJLkCq30XAnqaiR8E",
    authDomain: "novaprism-393c6.firebaseapp.com",
    projectId: "novaprism-393c6",
    storageBucket: "novaprism-393c6.firebasestorage.app",
    messagingSenderId: "710392896339",
    appId: "1:710392896339:web:d192a561813fbc06e11fa6"
  };

  // Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Menu config (sama seperti sebelumnya) ----------
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

// ---------- Session (pakai Firebase Auth) ----------
let currentUser = null;
let currentAccess = ["home"];

// ---------- Akun: baca dari config/accounts ----------
async function fetchAccountsConfig() {
  const docSnap = await getDoc(doc(db, "config", "accounts"));
  return docSnap.exists() ? docSnap.data().list || [] : [];
}

async function saveAccountsConfig(list) {
  await setDoc(doc(db, "config", "accounts"), { list });
}

// ---------- Riwayat login (shared) ----------
async function fetchRecords() {
  const q = query(collection(db, "records"), orderBy("time", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

async function addRecord(record) {
  await addDoc(collection(db, "records"), record);
}

async function clearLoginRecords() {
  const snap = await getDocs(collection(db, "records"));
  for (const d of snap.docs) await deleteDoc(d.ref);
}

// ---------- Rekening cache (shared) ----------
async function fetchRekeningCache() {
  const docSnap = await getDoc(doc(db, "config", "rekening"));
  return docSnap.exists() ? docSnap.data() : null;
}

async function saveRekeningCache(list) {
  await setDoc(doc(db, "config", "rekening"), {
    list, syncedAt: new Date().toISOString()
  });
}

// ---------- Reports (shared) ----------
async function fetchReports() {
  const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveReport(fields, text) {
  await addDoc(collection(db, "reports"), {
    ...fields, text, createdAt: new Date().toISOString()
  });
}

async function deleteReport(id) {
  await deleteDoc(doc(db, "reports", id));
}

// ---------- Reports Kesalahan (shared) ----------
async function fetchKesalahanReports() {
  const q = query(collection(db, "reportsKesalahan"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveKesalahanReport(fields, text) {
  await addDoc(collection(db, "reportsKesalahan"), {
    ...fields, text, createdAt: new Date().toISOString()
  });
}

async function deleteKesalahanReport(id) {
  await deleteDoc(doc(db, "reportsKesalahan", id));
}

// ---------- Helper (tetap sama) ----------
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

// ---------- Login form (index.html) ----------
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      await addRecord({
        username: email,
        time: new Date().toISOString(),
        device: detectDevice(),
        status: "success",
      });
      window.location.href = "dashboard.html";
    } catch (err) {
      errorMsg.style.display = "block";
      await addRecord({
        username: email || "(kosong)",
        time: new Date().toISOString(),
        device: detectDevice(),
        status: "failed",
      });
    }
  });
}

// ---------- Dashboard guard (dashboard.html) ----------
async function requireLogin() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = "index.html"; reject(); return; }
      currentUser = user;
      const accounts = await fetchAccountsConfig();
      const entry = accounts.find(a => a.email === user.email);
      currentAccess = entry ? entry.access : ["home"];
      resolve();
    });
  });
}

async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

function applyAccessControl() {
  let activeIsVisible = false;
  let firstVisibleItem = null;

  document.querySelectorAll(".nav-item").forEach(item => {
    const allowed = currentAccess.includes(item.dataset.view);
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

async function renderDashboard() {
  const records = await fetchRecords();
  document.getElementById("welcomeText").textContent = `Halo, ${currentUser.email}`;
  document.getElementById("avatarInitial").textContent = currentUser.email.charAt(0).toUpperCase();

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
      <td>${r.username}</td>
      <td>${formatTime(r.time)}</td>
      <td>${r.device}</td>
      <td><span class="status-pill ${r.status}"><span class="dot"></span>${r.status === "success" ? "Berhasil" : "Gagal"}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Data Login: render daftar akun ----------
async function renderAccounts() {
  const tbody = document.getElementById("accountTableBody");
  if (!tbody) return;
  const emptyState = document.getElementById("accountEmptyState");
  const accounts = await fetchAccountsConfig();

  tbody.innerHTML = "";
  if (accounts.length === 0) { emptyState.style.display = "block"; return; }
  emptyState.style.display = "none";

  accounts.forEach(a => {
    const badges = (a.access || []).map(k => {
      const m = MENU_CONFIG.find(x => x.key === k);
      return m ? `<span class="access-badge">${m.label}</span>` : "";
    }).join("");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.email}</td>
      <td><div class="access-badges">${badges || '<span class="access-badge empty">Tidak ada</span>'}</div></td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-edit="${a.email}">Edit akses</button>
          <button type="button" class="btn-danger-ghost" data-del="${a.email}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-edit]").addEventListener("click", () => toggleEditAccessRow(tr, a));
    tr.querySelector("[data-del]").addEventListener("click", async () => {
      if (confirm(`Hapus akses ${a.email} dari daftar? (Akun Firebase Auth-nya tidak ikut terhapus)`)) {
        const list = (await fetchAccountsConfig()).filter(x => x.email !== a.email);
        await saveAccountsConfig(list);
        renderAccounts();
      }
    });
    tbody.appendChild(tr);
  });
}

async function toggleEditAccessRow(rowEl, account) {
  const tbody = rowEl.parentElement;
  const existing = tbody.querySelector(".edit-access-row");
  if (existing) existing.remove();

  const editRow = document.createElement("tr");
  editRow.className = "edit-access-row";
  editRow.innerHTML = `
    <td colspan="3">
      <div class="access-group-label">Atur menu untuk <strong>${account.email}</strong>:</div>
      <div class="access-checks">
        ${MENU_CONFIG.map(m => `
          <label class="access-check">
            <input type="checkbox" value="${m.key}" ${(account.access || []).includes(m.key) ? "checked" : ""} />
            <span>${m.label}</span>
          </label>
        `).join("")}
      </div>
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
    const list = await fetchAccountsConfig();
    const entry = list.find(x => x.email === account.email);
    if (entry) entry.access = checked;
    await saveAccountsConfig(list);
    renderAccounts();
  });
  editRow.querySelector("[data-cancel]").addEventListener("click", () => editRow.remove());
}

async function renderAddAccessChecks() {
  const container = document.getElementById("newAccessChecks");
  if (!container) return;
  container.innerHTML = MENU_CONFIG.map(m => `
    <label class="access-check">
      <input type="checkbox" value="${m.key}" ${m.key === "home" ? "checked" : ""} />
      <span>${m.label}</span>
    </label>
  `).join("");
}

// ---------- Cek Rekening (Google Sheet) ----------
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
    renderSyncStatus();
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
      <td>${r.namaRek || "—"}</td>
      <td>${formatTime(r.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy]").addEventListener("click", async (e) => {
      await copyText(r.text); flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del]").addEventListener("click", async () => {
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
      <td>${r.userId || "—"}</td>
      <td>${r.namaRek || "—"}</td>
      <td>${formatTime(r.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button type="button" class="btn-mini" data-copy="${r.id}">Salin</button>
          <button type="button" class="btn-danger-ghost" data-del="${r.id}">Hapus</button>
        </div>
      </td>
    `;
    tr.querySelector("[data-copy]").addEventListener("click", async (e) => {
      await copyText(r.text); flashButton(e.target, "Tersalin!");
    });
    tr.querySelector("[data-del]").addEventListener("click", async () => {
      if (confirm("Hapus report ini?")) { await deleteKesalahanReport(r.id); renderKesalahanHistory(); }
    });
    tbody.appendChild(tr);
  });
}
