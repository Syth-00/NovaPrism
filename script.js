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
};

// Daftar menu yang tersedia di sidebar. Kalau nanti nambah menu baru di
// dashboard.html, cukup daftarin di sini (key harus sama dengan data-view
// pada elemen .nav-item) — otomatis muncul jadi pilihan akses.
const MENU_CONFIG = [
  { key: "home", label: "Beranda" },
  { key: "datalogin", label: "Data Login" },
];

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
      email: "owner@novaprism.io",
      password: "NovaPrism#2026",
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

  if (!activeIsVisible && firstVisibleItem) {
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
