const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzzKu6OY5VcxNWwx7UXAR5FPfHEbWM5TO2PnQxdhQiNUwwwLTMu3-ll9Lmh5dnpep4tfw/exec';
const SECRET_KEY = 'sAuTaaxokJAPUbbqe7UtKy';

let token = localStorage.getItem("token");
let isAdmin = false;
let lastUpdate = null;
let lastAccountsJSON = null;

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
  default: "#1e40af"
};

const bankPriority = {
  SCB: 1,
  KTB: 2,
  KBANK: 3,
  BBL: 4,
  TMB: 5,
  BAY: 6
};

const bankThaiNames = {
  SCB: "ไทยพาณิชย์",
  KBANK: "กสิกรไทย",
  BBL: "กรุงเทพ",
  KTB: "กรุงไทย",
  TMB: "ทหารไทยธนชาต (TMBThanachart)",
  BAY: "กรุงศรีอยุธยา",
  GSB: "ออมสิน",
  // เพิ่มธนาคารอื่น ๆ ถ้ามีในข้อมูล เช่น
  UOB: "ยูโอบี",
  CIMB: "ซีไอเอ็มบี ไทย",
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
    return `${s.slice(0,3)}-${s.slice(3,4)}-${s.slice(4)}`;
  }
  return s;
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = 1; toast.style.transform = 'translateY(0)'; }, 50);
  setTimeout(() => { toast.style.opacity = 0; }, 2200);
  setTimeout(() => { toast.remove(); }, 2800);
}

function loadData() {
  return new Promise((resolve, reject) => {
    const cb = 'gas_' + Date.now();
    const s = document.createElement("script");
    s.src = `${APPS_SCRIPT_URL}?secret=${SECRET_KEY}&callback=${cb}`;
    window[cb] = (res) => {
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
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function checkUpdate() {
  fetch(`${APPS_SCRIPT_URL}?secret=${SECRET_KEY}&mode=check`)
    .then(r => r.json())
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
          .catch(() => {
            showToast("โหลดข้อมูลล้มเหลว");
            hideLoading();
          });
      } else {
        hideLoading();
      }
    })
    .catch(() => {
      showToast("ตรวจสอบอัพเดทไม่ได้");
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

  paymentGroups.forEach(g => {
    const matches = sortAccounts(accounts.filter(a => a.groups.includes(g.key)));
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

  const displayText = acc.short;  // หรือจะปรับแสดงชื่อไทยที่นี่ด้วยก็ได้ แต่ส่วนใหญ่คนชอบเห็นตัวย่อบนหน้าเว็บ

  item.innerHTML = `<span class="acc-text">${displayText}</span>`;

  item.onclick = () => {
    const bankThai = bankThaiNames[acc.bank] || bankThaiNames.default || acc.bank;

    const text = `📌 ช่องทางโอนเงิน
ธนาคาร : ${bankThai}
ชื่อบัญชี : ${acc.name}
เลขบัญชี : ${formatAccountNumber(acc.no)}

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
  };

  accountsContainer.appendChild(item);
});

    row.appendChild(accountsContainer);
    container.appendChild(row);
  });

  hideLoading();
}

function hideLoading() {
  const el = document.getElementById("loading-indicator");
  if (el) el.classList.add("hidden");
}

// เริ่มต้น + event listeners (ส่วนเมนู, modal, logout, เปลี่ยนรหัสผ่าน)
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menu-btn");
  const panel = document.getElementById("admin-panel");
  const overlay = document.getElementById("menu-overlay");
  const closeBtn = document.getElementById("menu-close");

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

  document.getElementById("logout-link")?.addEventListener("click", e => {
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
        document.getElementById("user-info").textContent = `User : ${username}`;
        document.getElementById("my-username-display").textContent = username;

        isAdmin = data.role === 'admin' || data.isAdmin === true;
        if (isAdmin) {
          document.getElementById("admin-only-section").style.display = "block";
        }

        checkUpdate();
        setInterval(checkUpdate, 20000);
      } else {
        localStorage.removeItem("token");
        location.href = "login.html";
      }
    })
    .catch(() => {
      localStorage.removeItem("token");
      location.href = "login.html";
    });

  // Modal เปลี่ยนรหัสผ่าน
  const changeLink = document.getElementById("change-password-link");
  const modal = document.getElementById("change-password-modal");
  const closeModal = document.getElementById("close-password-modal");
  const submitBtn = document.getElementById("submit-password-change");
  const errorEl = document.getElementById("password-error");

  changeLink?.addEventListener("click", e => {
    e.preventDefault();
    modal.style.display = "flex";
    setTimeout(() => modal.classList.add("open"), 10);
    errorEl.textContent = "";
  });

  closeModal?.addEventListener("click", () => {
    modal.classList.remove("open");
    setTimeout(() => { modal.style.display = "none"; }, 300);
  });

  modal?.addEventListener("click", e => {
    if (e.target === modal) {
      modal.classList.remove("open");
      setTimeout(() => { modal.style.display = "none"; }, 300);
    }
  });

  submitBtn?.addEventListener("click", async () => {
    const oldPass = document.getElementById("old-password").value.trim();
    const newPass = document.getElementById("new-password").value.trim();
    const confirm = document.getElementById("confirm-password").value.trim();

    errorEl.textContent = "";
    if (!oldPass || !newPass || !confirm) {
      errorEl.textContent = "กรุณากรอกครบทุกช่อง";
      return;
    }
    if (newPass !== confirm) {
      errorEl.textContent = "รหัสผ่านใหม่ไม่ตรงกัน";
      return;
    }
    if (newPass.length < 6) {
      errorEl.textContent = "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร";
      return;
    }

    submitBtn.disabled = true;
    errorEl.textContent = "กำลังดำเนินการ...";

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
        errorEl.style.color = "#10b981";
        errorEl.textContent = "เปลี่ยนรหัสผ่านสำเร็จ!";
        setTimeout(() => {
          modal.classList.remove("open");
          setTimeout(() => {
            modal.style.display = "none";
            document.getElementById("old-password").value = "";
            document.getElementById("new-password").value = "";
            document.getElementById("confirm-password").value = "";
            errorEl.textContent = "";
            errorEl.style.color = "#ef4444";
          }, 300);
        }, 1400);
      } else {
        errorEl.textContent = data.message || "เกิดข้อผิดพลาด";
      }
    } catch {
      errorEl.textContent = "ไม่สามารถเชื่อมต่อได้";
    } finally {
      submitBtn.disabled = false;
    }
  });
});