/* ============================================
   PULSE — Logic sederhana untuk demo login & dashboard
   Semua data disimpan di localStorage (sisi browser).
   Ganti bagian AUTH ini dengan pemanggilan API/Cloudflare
   Worker asli begitu backend-nya siap.
   ============================================ */

const STORAGE_KEYS = {
  session: "novaprism_session",
  records: "novaprism_login_records",
  bgImage: "novaprism_bg_image",
};

// Kredensial demo. GANTI dengan verifikasi backend untuk produksi.
const DEMO_USER = { username: "admin", password: "admin123" };

// ---------- Utilitas umum ----------

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
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");

    const success = username === DEMO_USER.username && password === DEMO_USER.password;

    saveRecord({
      username: username || "(kosong)",
      time: new Date().toISOString(),
      device: detectDevice(),
      status: success ? "success" : "failed",
    });

    if (success) {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ username, loginAt: new Date().toISOString() }));
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

function renderDashboard() {
  const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null");
  const records = getRecords();

  if (session) {
    document.getElementById("welcomeText").textContent = `Halo, ${session.username}`;
    document.getElementById("avatarInitial").textContent = session.username.charAt(0).toUpperCase();
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
