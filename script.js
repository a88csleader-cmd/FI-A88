const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzt79HkmSmFkd7e6W8IVAjTPBZH0QDQ8kU_7eTdLijzL5NUtmxewIGV_oU_Kn6VVPoabw/exec';
const SECRET_KEY = 'sAuTaaxokJAPUbbqe7UtKy';
const CHECK_INTERVAL = 60000; // เพิ่มเป็น 60 วิที่แทน 20 วิที่

let token = localStorage.getItem("token");

let isAdmin = false;
let lastUpdate = null;
let lastAccountsJSON = null;
let checkUpdateTimeout = null;
let cachedDOMElements = {};

if (!token) {
  location.href = "login.html";
}

const bankColors = {
  SCB: "#4c1d95",
  KBANK: "#16a34a",
  BBL: "#2563eb",
  KTB: "#1d4ed8",
  TMB: "#7c3aed",
  BAY: "#dc2626",
  ISBT: "#7c3aed",
  default: "#1e40af"
};

const bankPriority = {
  SCB: 1,
  KTB: 2,
  KBANK: 3,
  BBL: 4,
  TMB: 5,
  BAY: 6,
  ISBT: 7
};

const bankThaiNames = {
  SCB: "ไทยพาณิชย์",
  KBANK: "กสิกรไทย",
  BBL: "กรุงเทพ",
  KTB: "กรุงไทย",
  TMB: "ทหารไทยธนชาต (TMBThanachart)",
  BAY: "กรุงศรีอยุธยา",
  GSB: "ออมสิน",
  UOB: "ยูโอบี",
  CIMB: "ซีไอเอ็มบี ไทย",
  ISBT: "อิสลามแห่งประเทศไทย",
  // เพิ่มธนาคารอื่น ๆ ถ้ามีในข้อมูล เช่น
  default: "ไม่ระบุ"
};

const paymentGroups = [
  { name: "A884", key: "A884" },
  { name: "A883,WC22", key: "A883,WC22" },
  { name: "A88,0,1,2,AF,AFF", key: "A88,0,1,2,AF,AFF" },
  { name: "THNA", key: "THNA" },
  { name: "THNB", key: "THNB" },
  { name: "THCA", key: "THCA" },
  { name: "THVA", key: "THVA" },
  { name: "AO", key: "AO" }
];

function formatAccountNumber(no) {
  const s = (no || '').toString();
  if (s.length === 10) {
    return `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4)}`;
  }
  return s;
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = 1; toast.style.transform = 'translateY(0)'; }, 10);
  setTimeout(() => { toast.style.opacity = 0; toast.style.transform = 'translateY(20px)'; }, 2500);
  setTimeout(() => { toast.remove(); }, 2800);
}

function loadData() {
  return new Promise((resolve, reject) => {
    const cb = 'gas_' + Date.now();
    const s = document.createElement("script");
    const url = `${APPS_SCRIPT_URL}?secret=${SECRET_KEY}&callback=${cb}`;
    s.src = url;
    
    const timeout = setTimeout(() => {
      delete window[cb];
      s.remove();
      reject(new Error('Request timeout'));
    }, 10000);
    
    window[cb] = (res) => {
      clearTimeout(timeout);
      delete window[cb];
      s.remove();
      
      if (!res?.data) {
        reject(new Error('No data'));
        return;
      }
      
      const accounts = res.data.map(a => ({
        ...a,
        short: (a.short || '').trim() || `${a.bank}-${a.no.toString().slice(-5)}`
      }));
      resolve(accounts);
    };
    
    s.onerror = (error) => {
      clearTimeout(timeout);
      delete window[cb];
      reject(error);
    };
    
    document.body.appendChild(s);
  });
}

function checkUpdate() {
  const url = `${APPS_SCRIPT_URL}?secret=${SECRET_KEY}&mode=check`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  fetch(url, { signal: controller.signal })
    .then(r => {
      clearTimeout(timeoutId);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      if (data.updated !== lastUpdate) {
        lastUpdate = data.updated;
        
        loadData()
          .then(accounts => {
            const json = JSON.stringify(accounts);
            if (json !== lastAccountsJSON) {
              renderGroups(accounts);
              lastAccountsJSON = json;
              showToast("ข้อมูลอัพเดทแล้ว ✓");
            }
            hideLoading();
          })
          .catch((err) => {
            showToast("โหลดข้อมูลล้มเหลว: " + err.message);
            hideLoading();
          });
      } else {
        hideLoading();
      }
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name !== 'AbortError') {
        showToast("ตรวจสอบอัพเดทไม่ได้: " + err.message);
      }
      hideLoading();
    });
}

function sortAccounts(accounts) {
  return accounts.sort((a, b) => {
    const pa = bankPriority[a.bank] || 999;
    const pb = bankPriority[b.bank] || 999;
    if (pa !== pb) return pa - pb;
    return (a.short || "").localeCompare(b.short || "");
  });
}

function renderGroups(accounts) {
  const container = document.getElementById("groups-container");

  // ลบเฉพาะกลุ่มเก่า (เก็บ header ไว้)
  document.querySelectorAll('.group-row').forEach(el => el.remove());

  const fragment = document.createDocumentFragment();
  // Pre-sort accounts เพียงครั้งเดียว
  const sortedAccounts = sortAccounts(accounts);

  paymentGroups.forEach(g => {
    // Filter จาก sorted accounts แล้ว
    const matches = sortedAccounts.filter(a => a.groups.includes(g.key));
    if (matches.length === 0) return;

    const row = document.createElement("div");
    row.className = "group-row";

    const groupName = document.createElement("div");
    groupName.className = "group-name";
    groupName.textContent = g.name;
    row.appendChild(groupName);

    const accountsContainer = document.createElement("div");
    accountsContainer.className = "accounts-list";

    matches.forEach(acc => {
      const item = document.createElement("button");
      item.className = "account-item";
      item.type = "button";

      const bankThai = bankThaiNames[acc.bank] || bankThaiNames.default || acc.bank;
      const formattedNo = formatAccountNumber(acc.no);

      item.innerHTML = '<span class="col-bank">' + bankThai + '</span>\n        <span class="col-name">' + acc.short + '</span>\n        <span class="col-accname">' + acc.name + '</span>\n        <span class="col-accno">' + formattedNo + '</span>';

      item.dataset.bank = acc.bank;
      item.dataset.name = acc.name;
      item.dataset.no = acc.no;

      accountsContainer.appendChild(item);
    });

    row.appendChild(accountsContainer);
    fragment.appendChild(row);
  });

  container.appendChild(fragment);
  hideLoading();
}

// Event delegation สำหรับ account buttons (ที่ groups-container)
const groupsContainer = document.getElementById("groups-container");
if (groupsContainer) {
  groupsContainer.addEventListener("click", (e) => {
    const item = e.target.closest(".account-item");
    if (item) {
      const bankThai = bankThaiNames[item.dataset.bank] || bankThaiNames.default || item.dataset.bank;

      const text = `📌 ช่องทางโอนเงิน
ธนาคาร : ${bankThai}
ชื่อบัญชี : ${item.dataset.name}
เลขบัญชี : ${formatAccountNumber(item.dataset.no)}

━━━━━━━━━━━━━━━━

⚠️ สำคัญ
• กรุณาตรวจสอบชื่อบัญชีก่อนโอน
• โอนจากบัญชีชื่อเดียวกับที่สมัครเท่านั้น
• ฝากขั้นต่ำ 50 บาท
• ถอนขั้นต่ำ 250 บาท

หากโอนแล้ว กรุณาส่งสลิปเพื่อทำรายการค่ะ 🙏`;

      navigator.clipboard.writeText(text).then(() => {
        showToast("คัดลอกแล้ว ✓");
      });

      item.classList.add("copied");
      setTimeout(() => item.classList.remove("copied"), 1400);
    }
  });
}

function hideLoading() {
  const el = document.getElementById("loading-indicator");
  if (el) el.classList.add("hidden");
}

// เริ่มต้น + event listeners (ส่วนเมนู, modal, logout, เปลี่ยนรหัสผ่าน)
function initializeApp() {
  const menuBtn = document.getElementById("menu-btn");
  const panel = document.getElementById("admin-panel");
  const overlay = document.getElementById("menu-overlay");
  const closeBtn = document.getElementById("menu-close");

  // Cache DOM elements
  cachedDOMElements = {
    userInfo: document.getElementById("user-info"),
    usernameDisplay: document.getElementById("my-username-display"),
    adminSection: document.getElementById("admin-only-section"),
    logoutLink: document.getElementById("logout-link"),
    changePasswordLink: document.getElementById("change-password-link"),
    modal: document.getElementById("change-password-modal"),
    closeModal: document.getElementById("close-password-modal"),
    submitBtn: document.getElementById("submit-password-change"),
    errorEl: document.getElementById("password-error"),
    oldPasswordInput: document.getElementById("old-password"),
    newPasswordInput: document.getElementById("new-password"),
    confirmPasswordInput: document.getElementById("confirm-password")
  };

  const openPanel = () => {
    panel.classList.add("open");
    overlay.classList.add("open");
  };
  const closePanel = () => {
    panel.classList.remove("open");
    overlay.classList.remove("open");
  };

  menuBtn?.addEventListener("click", openPanel);
  closeBtn?.addEventListener("click", closePanel);
  overlay?.addEventListener("click", closePanel);

  cachedDOMElements.logoutLink?.addEventListener("click", e => {
    e.preventDefault();
    localStorage.removeItem("token");
    showToast("ออกจากระบบแล้ว");
    setTimeout(() => location.href = "login.html", 800);
  });

  fetch(`${APPS_SCRIPT_URL}?action=verify&token=${token}&secret=${SECRET_KEY}`)
    .then(r => r.json())
    .then(data => {
      if (data.valid) {
        const username = data.username || '—';
        cachedDOMElements.userInfo.textContent = `User : ${username}`;
        cachedDOMElements.usernameDisplay.textContent = username;

        isAdmin = data.role === 'admin' || data.isAdmin === true;
        if (isAdmin) {
          cachedDOMElements.adminSection.style.display = "block";
        }

        // โหลดข้อมูลทันทีหลัง login สำเร็จ
        loadData()
          .then(accounts => {
            renderGroups(accounts);
            lastAccountsJSON = JSON.stringify(accounts);
          })
          .catch((err) => {
            showToast("โหลดข้อมูลล้มเหลว: " + err.message);
            hideLoading();
          });

        // ตั้งค่าให้ตรวจสอบอัพเดทเป็นระยะ
        checkUpdateTimeout = setInterval(checkUpdate, CHECK_INTERVAL);
      } else {
        localStorage.removeItem("token");
        location.href = "login.html";
      }
    })
    .catch((err) => {
      localStorage.removeItem("token");
      location.href = "login.html";
    });

  // Modal เปลี่ยนรหัสผ่าน
  cachedDOMElements.changePasswordLink?.addEventListener("click", e => {
    e.preventDefault();
    cachedDOMElements.modal.style.display = "flex";
    setTimeout(() => cachedDOMElements.modal.classList.add("open"), 10);
    cachedDOMElements.errorEl.textContent = "";
  });

  cachedDOMElements.closeModal?.addEventListener("click", () => {
    cachedDOMElements.modal.classList.remove("open");
    setTimeout(() => { cachedDOMElements.modal.style.display = "none"; }, 300);
  });

  cachedDOMElements.modal?.addEventListener("click", e => {
    if (e.target === cachedDOMElements.modal) {
      cachedDOMElements.modal.classList.remove("open");
      setTimeout(() => { cachedDOMElements.modal.style.display = "none"; }, 300);
    }
  });

  cachedDOMElements.submitBtn?.addEventListener("click", async () => {
    const oldPass = cachedDOMElements.oldPasswordInput.value.trim();
    const newPass = cachedDOMElements.newPasswordInput.value.trim();
    const confirm = cachedDOMElements.confirmPasswordInput.value.trim();

    cachedDOMElements.errorEl.textContent = "";
    if (!oldPass || !newPass || !confirm) {
      cachedDOMElements.errorEl.textContent = "กรุณากรอกครบทุกช่อง";
      return;
    }
    if (newPass !== confirm) {
      cachedDOMElements.errorEl.textContent = "รหัสผ่านใหม่ไม่ตรงกัน";
      return;
    }
    if (newPass.length < 6) {
      cachedDOMElements.errorEl.textContent = "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร";
      return;
    }

    cachedDOMElements.submitBtn.disabled = true;
    cachedDOMElements.errorEl.textContent = "กำลังดำเนินการ...";

    try {
      const params = new URLSearchParams({
        action: "change_password",
        token,
        secret: SECRET_KEY,
        old_password: oldPass,
        new_password: newPass
      });
      const res = await fetch(`${APPS_SCRIPT_URL}?${params}`);
      const data = await res.json();

      if (data.success) {
        cachedDOMElements.errorEl.style.color = "#10b981";
        cachedDOMElements.errorEl.textContent = "เปลี่ยนรหัสผ่านสำเร็จ!";
        setTimeout(() => {
          cachedDOMElements.modal.classList.remove("open");
          setTimeout(() => {
            cachedDOMElements.modal.style.display = "none";
            cachedDOMElements.oldPasswordInput.value = "";
            cachedDOMElements.newPasswordInput.value = "";
            cachedDOMElements.confirmPasswordInput.value = "";
            cachedDOMElements.errorEl.textContent = "";
            cachedDOMElements.errorEl.style.color = "#ef4444";
          }, 300);
        }, 1400);
      } else {
        cachedDOMElements.errorEl.textContent = data.message || "เกิดข้อผิดพลาด";
      }
    } catch {
      cachedDOMElements.errorEl.textContent = "ไม่สามารถเชื่อมต่อได้";
    } finally {
      cachedDOMElements.submitBtn.disabled = false;
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (checkUpdateTimeout) clearInterval(checkUpdateTimeout);
  });
}

// ========================================
// Call initializeApp at the right time
// ========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // Use setTimeout to ensure all scripts are loaded
  setTimeout(initializeApp, 100);
}