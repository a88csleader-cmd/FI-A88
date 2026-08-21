// login.js

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorEl = document.getElementById('error');

  const reason = new URLSearchParams(window.location.search).get('reason');
  if (reason) {
    errorEl.textContent = `เข้าสู่ระบบไม่สำเร็จ: ${reason}`;
  }

  // แก้ URL นี้ให้ตรงกับ deployment ของคุณจริง ๆ
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxtpe345eQlTLcEU6oqpQRccmrvwdemsgWyDRuacPgI684RAS4VHt1IzejOlUSDNNXdCw/exec';

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      errorEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      return;
    }

    errorEl.textContent = 'กำลังตรวจสอบ...';
    loginBtn.disabled = true;

    try {
      const params = new URLSearchParams({
        action: 'login',
        username: username,
        password: password,
		secret: 'sAuTaaxokJAPUbbqe7UtKy'
      });

      const response = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text || 'ไม่สามารถเชื่อมต่อได้'}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Response ไม่ใช่ JSON:', text);
        throw new Error(text.trim() || 'เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่ถูกต้อง');
      }

      if (data.success && data.token) {
		console.log("Token ที่ได้รับ:", data.token); // ดูใน console ว่ามี token ไหม
		localStorage.setItem('token', data.token);
  
  // แสดงข้อความ + รอสักครู่ให้ localStorage เขียนเสร็จ (แก้ปัญหา redirect เร็วเกิน)
  errorEl.style.color = '#10b981';
  errorEl.textContent = 'เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...';
  
  setTimeout(() => {
    console.log("กำลัง redirect ไป index.html | Token ใน storage:", localStorage.getItem('token'));
    window.location.href = 'index.html';
  }, 1000); // รอ 1 วินาที
      } else {
        errorEl.textContent = data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      }

    } catch (err) {
      console.error('Login error:', err);
      errorEl.textContent = err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    } finally {
      loginBtn.disabled = false;
    }
  });

});