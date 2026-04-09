// ================================
// CONFIG
// ================================
const SECRET_KEY = 'sAuTaaxokJAPUbbqe7UtKy';
const SHEET_ACCOUNTS = 'ALLFundIn';
const SHEET_USERS = 'USERS';
const CACHE_TTL_SECONDS = 300; // 5 นาที — ข้อมูลบัญชี
const SESSION_TTL_SECONDS = 21600; // 6 ชั่วโมง = 6*60*60
// ================================
// ENTRY POINT
// ================================
function doGet(e) {
  const output = ContentService.createTextOutput();
 
  try {
    const params = e.parameter || {};
    const secret = (params.secret || '').trim();
    const action = (params.action || '').trim().toLowerCase();
    const mode = (params.mode || 'data').trim().toLowerCase();
    const callback = (params.callback || '').trim();
    
    // Debug logging
    console.log(`[doGet] action=${action}, mode=${mode}, secret=${secret.substring(0, 5)}...`);
    
    // ทุก request ต้องมี secret ที่ถูกต้อง
    if (secret !== SECRET_KEY) {
      console.warn('[doGet] Invalid secret key detected');
      output.setMimeType(ContentService.MimeType.JSON);
      output.setContent(JSON.stringify({ success: false, message: 'Invalid secret key' }));
      return output;
    }
    // ── Authentication endpoints ─────────────────────────────
    if (action === 'login') return handleLogin(params);
    if (action === 'verify') return handleVerify(params);
    if (action === 'logout') return handleLogout(params);
    if (action === 'change_password') return handleChangePassword(e);
    // ── Data endpoints (หลังจากผ่าน secret แล้ว) ─────────────
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_ACCOUNTS);
    if (!sheet) {
      return jsonResponse(output, { success: false, message: 'ไม่พบชีท ALLFundIn' });
    }
    // อ่าน timestamp ล่าสุด (A70) และ hash สำหรับ cache
    let updated = null;
    const updatedCell = sheet.getRange("A70").getValue();
    if (updatedCell instanceof Date && !isNaN(updatedCell.getTime())) {
      updated = updatedCell.getTime();
    } else {
      // ถ้า A70 ว่าง ให้ตั้งค่าเป็นวันนี้
      updated = new Date().getTime();
      sheet.getRange("A70").setValue(new Date());
      console.warn('[doGet] A70 was empty, setting to current date');
    }
    
    console.log(`[doGet] Updated timestamp: ${updated}`);
    
    // mode = check → ส่งเฉพาะ updated
    if (mode === 'check') {
      output.setMimeType(ContentService.MimeType.JSON);
      output.setContent(JSON.stringify({ updated }));
      return output;
    }
    // ── Cache handling ────────────────────────────────────────
    const cache = CacheService.getScriptCache();
    const cacheKey = `accounts_v2_${updated}`;
    let data = null;
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        data = JSON.parse(cached);
      } catch (parseErr) {
        console.error('Cache parse error:', parseErr);
        cache.remove(cacheKey);
      }
    }
    if (data !== null) {
      return jsonpResponse(output, data, updated, callback);
    }
    // ── Load fresh data ───────────────────────────────────────
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      cache.put(cacheKey, JSON.stringify([]), CACHE_TTL_SECONDS);
      return jsonpResponse(output, [], updated, callback);
    }
    const values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = values[0].map(h => (h || '').toString().trim());
    const colIndex = {
      name: headers.indexOf('Account Name'),
      no: headers.indexOf('Account No'),
      bank: headers.indexOf('Bank Name'),
      short: headers.indexOf('Short Acc'),
      displayMember: headers.indexOf('Display in Member'),
      status: headers.indexOf('Status'),
      groupsStart: headers.indexOf('A884')
    };
    
    // ตรวจสอบว่า columns ที่จำเป็นมีอยู่
    const requiredCols = ['name', 'no', 'bank', 'groupsStart'];
    const missingCols = requiredCols.filter(col => colIndex[col] === -1);
    if (missingCols.length > 0) {
      console.error('[doGet] Missing columns:', missingCols);
      return jsonResponse(output, { success: false, message: `Missing columns: ${missingCols.join(', ')}` });
    }
    
    console.log('[doGet] Column indices:', colIndex);
    const safeVal = (row, idx) => idx >= 0 ? (row[idx] ?? '') : '';
    const accounts = values.slice(1).map(row => {
      const groups = [];
      for (let i = colIndex.groupsStart; i < headers.length; i++) {
        const val = row[i];
        const strVal = (val ?? '').toString().trim().toLowerCase();
        if (
          val === true ||
          strVal === 'true' ||
          strVal === '1' ||
          strVal === 'yes' ||
          strVal === '✓' ||
          strVal === 'ใช่'
        ) {
          groups.push(headers[i]);
        }
      }
      return {
        name: safeVal(row, colIndex.name),
        no: safeVal(row, colIndex.no),
        bank: safeVal(row, colIndex.bank),
        short: safeVal(row, colIndex.short),
        status: !!safeVal(row, colIndex.status) || safeVal(row, colIndex.status) === 'true',
        displayMember: !!safeVal(row, colIndex.displayMember) || safeVal(row, colIndex.displayMember) === 'true',
        groups
      };
    });
    const visibleAccounts = accounts.filter(a => a.displayMember && a.status);
    
    console.log(`[doGet] Found ${accounts.length} total accounts, ${visibleAccounts.length} visible`);
    
    // Cache ผลลัพธ์
    cache.put(cacheKey, JSON.stringify(visibleAccounts), CACHE_TTL_SECONDS);
    console.log(`[doGet] Cached with key: ${cacheKey}`);
    
    return jsonpResponse(output, visibleAccounts, updated, callback);
  } catch (error) {
    console.error('doGet failed:', error);
    return jsonResponse(output, {
      success: false,
      message: 'Server error',
      detail: error.message
    });
  }
}
// ================================
// Auth Functions
// ================================
function handleLogin(params) {
  const username = (params.username || '').trim();
  const password = (params.password || '').trim();
  
  console.log(`[handleLogin] username=${username}`);
  
  if (!username || !password) {
    console.warn('[handleLogin] Missing username or password');
    return json({ success: false, message: 'ต้องระบุ username และ password' });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    console.error('[handleLogin] Sheet USERS not found');
    return json({ success: false, message: 'ไม่พบชีท USERS' });
  }
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dbUser = (row[0] || '').toString().trim();
    const dbPass = row[1] || '';
    const dbRole = (row[2] || 'user').trim();
    const dbStatus = (row[3] || '').toString().trim().toLowerCase();
    
    if (dbUser === username && dbPass === password && dbStatus === 'active') {
      const token = Utilities.getUuid();
      const cacheValue = JSON.stringify({ username: dbUser, role: dbRole });
      CacheService.getScriptCache().put(token, cacheValue, SESSION_TTL_SECONDS);
      
      console.log(`[handleLogin] ✓ Login successful for ${username}`);
      
      return json({
        success: true,
        token,
        username: dbUser,
        role: dbRole
      });
    }
  }
  
  console.warn(`[handleLogin] ✗ Login failed for ${username}`);
  return json({ success: false, message: 'ข้อมูลไม่ถูกต้องหรือบัญชีไม่ active' });
}
function handleVerify(params) {
  const token = (params.token || '').trim();
  if (!token) {
    return json({ valid: false, message: 'token required' });
  }
  const cached = CacheService.getScriptCache().get(token);
  if (!cached) {
    return json({ valid: false });
  }
  try {
    const session = JSON.parse(cached);
    return json({
      valid: true,
      username: session.username,
      role: session.role || 'user'
    });
  } catch (err) {
    console.error('Verify parse error:', err);
    return json({ valid: false });
  }
}
function handleChangePassword(e) {
  const token = (e.parameter?.token || '').trim();
  const oldPassword = (e.parameter?.old_password || '').trim();
  const newPassword = (e.parameter?.new_password || '').trim();
  
  console.log('[handleChangePassword] Request received');
  
  if (!token || !oldPassword || !newPassword) {
    console.warn('[handleChangePassword] Missing parameters');
    return json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
  }
  
  // ตรวจสอบ token ก่อน
  const cache = CacheService.getScriptCache();
  const cached = cache.get(token);
  if (!cached) {
    console.warn('[handleChangePassword] Token expired or invalid');
    return json({ success: false, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
  
  let userData;
  try {
    userData = JSON.parse(cached);
  } catch (err) {
    console.error('[handleChangePassword] Parse error:', err.message);
    return json({ success: false, message: 'ข้อมูลเซสชันไม่ถูกต้อง' });
  }
  
  const username = userData.username;
  console.log(`[handleChangePassword] Processing for user: ${username}`);
  
  // ตรวจสอบรหัสผ่านเก่าและอัปเดตในชีท
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    console.error('[handleChangePassword] Sheet USERS not found');
    return json({ success: false, message: 'ไม่พบชีท USERS' });
  }
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dbUser = (row[0] || '').toString().trim();
    const dbPass = row[1] || '';
    
    if (dbUser === username) {
      if (dbPass !== oldPassword) {
        console.warn(`[handleChangePassword] ✗ Old password incorrect for ${username}`);
        return json({ success: false, message: 'รหัสผ่านเก่าไม่ถูกต้อง' });
      }
      
      // อัปเดตรหัสผ่านใหม่
      sheet.getRange(i + 1, 2).setValue(newPassword); // คอลัมน์ B = password
      
      // อัปเดต cache ใหม่
      cache.put(
        token,
        JSON.stringify({ username: dbUser, role: row[2] || 'user' }),
        SESSION_TTL_SECONDS
      );
      
      console.log(`[handleChangePassword] ✓ Password changed for ${username}`);
      return json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    }
  }
  
  console.error(`[handleChangePassword] ✗ User not found: ${username}`);
  return json({ success: false, message: 'ไม่พบผู้ใช้' });
}
function handleLogout(params) {
  const token = (params.token || '').trim();
  if (token) {
    CacheService.getScriptCache().remove(token);
  }
  return json({ success: true });
}
// ================================
// Response Helpers
// ================================
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonResponse(output, obj) {
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify(obj));
  return output;
}
function jsonpResponse(output, data, updated, callback) {
  const result = { updated, data };
  if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
    const jsonStr = JSON.stringify(result);
    output.setContent(`${callback}(${jsonStr});`);
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    output.setContent(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.JSON);
  }
  return output;
}
// ================================
// onEdit Trigger
// ================================
function onEdit(e) {
  try {
    const sheetName = e.source.getActiveSheet().getName();
    if (sheetName === SHEET_ACCOUNTS) {
      const sheet = e.source.getSheetByName(SHEET_ACCOUNTS);
      sheet.getRange("A70").setValue(new Date());
      
      // Clear cache เมื่อมีการแก้ไข
      const cache = CacheService.getScriptCache();
      const keys = cache.getAllKeys();
      const accountKeys = keys.filter(k => k.startsWith('accounts_v2_'));
      accountKeys.forEach(k => cache.remove(k));
      
      console.log(`[onEdit] ✓ Updated A70 and cleared ${accountKeys.length} cache entries`);
    }
  } catch (err) {
    console.error('[onEdit] error:', err.message);
  }
}