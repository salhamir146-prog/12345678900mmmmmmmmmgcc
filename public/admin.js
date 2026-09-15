/* ═══════════════════════════════════════════════════════════
   🛡 اوای یقین — پنل مدیریت
   ═══════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const state = {
  user: null,
  token: localStorage.getItem('oy_token') || null,
  users: [],
  currentUser: null,
  currentChatIndex: null
};

/* ═══════════ API Helper ═══════════ */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { headers, ...opts });
  if (res.status === 401) {
    toast('دسترسی غیرمجاز', 'error');
    setTimeout(() => window.location.href = '/', 1500);
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'خطای شبکه');
  }
  return res.json();
}

/* ═══════════ Init ═══════════ */
async function init() {
  if (!state.token) {
    window.location.href = '/';
    return;
  }
  try {
    const data = await api('/api/me');
    if (!data.user || data.user.role !== 'admin') {
      alert('دسترسی ندارید. بازگشت به صفحه اصلی...');
      window.location.href = '/';
      return;
    }
    state.user = data.user;
    $('adminApp').style.display = 'flex';
    await loadUsers();
    await loadSettings();
  } catch (e) {
    window.location.href = '/';
  }
}

/* ═══════════ Users ═══════════ */
async function loadUsers() {
  try {
    const data = await api('/api/admin/users');
    state.users = data.users || [];
    renderStats();
    renderUsers();
  } catch (e) {
    $('usersContainer').innerHTML = `
      <div class="empty-state">
        <svg><use href="#i-ban"/></svg>
        <h3>خطا در بارگذاری</h3>
        <p>${esc(e.message)}</p>
      </div>`;
  }
}

function renderStats() {
  const users = state.users;
  const total = users.length;
  const totalChats = users.reduce((s, u) => s + (u.chatCount || 0), 0);
  const activeToday = users.filter(u => Date.now() - (u.lastLogin || 0) < 86400000).length;
  const blocked = users.filter(u => u.blocked).length;

  $('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon"><svg><use href="#i-users"/></svg></div>
      <div class="num">${total}</div>
      <div class="label">کل کاربران</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><svg><use href="#i-message"/></svg></div>
      <div class="num">${totalChats}</div>
      <div class="label">کل گفتگوها</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><svg><use href="#i-clock"/></svg></div>
      <div class="num">${activeToday}</div>
      <div class="label">فعال امروز</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#fee2e2;color:#dc2626"><svg><use href="#i-ban"/></svg></div>
      <div class="num">${blocked}</div>
      <div class="label">مسدود شده</div>
    </div>`;
}

function renderUsers(filter = '') {
  const container = $('usersContainer');
  const users = filter
    ? state.users.filter(u => (u.name + u.phone).toLowerCase().includes(filter.toLowerCase()))
    : state.users;

  if (!users.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg><use href="#i-users"/></svg>
        <h3>${filter ? 'کاربری یافت نشد' : 'هنوز کاربری ثبت‌نام نکرده'}</h3>
        <p>${filter ? 'عبارت دیگری را جستجو کنید' : 'به‌محض ورود کاربران، اینجا نمایش داده می‌شوند'}</p>
      </div>`;
    return;
  }

  container.innerHTML = '<div class="users-list"></div>';
  const list = container.querySelector('.users-list');

  users.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-card-item';
    const lastLogin = formatDate(u.lastLogin);
    const created = formatDate(u.createdAt);

    el.innerHTML = `
      <div class="u-avatar">${esc((u.name || '؟').charAt(0))}</div>
      <div class="u-info">
        <div class="u-name">
          ${esc(u.name || 'بدون نام')}
          ${u.blocked ? '<span class="blocked-badge">مسدود</span>' : ''}
        </div>
        <div class="u-phone">${esc(u.phone)}</div>
        <div class="u-meta">
          <span><svg><use href="#i-message"/></svg> ${u.chatCount || 0} گفتگو</span>
          <span><svg><use href="#i-clock"/></svg> آخرین: ${lastLogin.short}</span>
          <span><svg><use href="#i-calendar"/></svg> عضویت: ${created.short}</span>
        </div>
      </div>
      <div class="u-arrow">‹</div>`;

    el.onclick = () => openUserDetail(u.phone);
    list.appendChild(el);
  });
}

function filterUsers(q) { renderUsers(q); }

/* ═══════════ User Detail ═══════════ */
async function openUserDetail(phone) {
  try {
    const data = await api('/api/admin/user?phone=' + encodeURIComponent(phone));
    state.currentUser = data.user;
    renderUserDetail();
  } catch (e) {
    toast('خطا: ' + e.message, 'error');
  }
}

function renderUserDetail() {
  const u = state.currentUser;
  if (!u) return;

  const created = formatDate(u.createdAt);
  const lastLogin = formatDate(u.lastLogin);
  const chats = u.chats || [];

  let html = `
    <button class="back-btn" onclick="backToUsers()">
      <svg><use href="#i-arrow-right"/></svg> بازگشت به لیست
    </button>

    <div class="detail-header">
      <div class="d-avatar">${esc((u.name || '؟').charAt(0))}</div>
      <div class="d-info">
        <div class="d-name">${esc(u.name || 'بدون نام')}${u.blocked ? ' <span class="blocked-badge">مسدود</span>' : ''}</div>
        <div class="d-phone">${esc(u.phone)}</div>
        <div class="d-date">عضویت: ${created.full} • آخرین ورود: ${lastLogin.full}</div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="action-btn primary" onclick="enterUserChat()">
        <svg><use href="#i-message"/></svg> ورود به چت کاربر
      </button>
      <button class="action-btn warning" onclick="toggleBlock()">
        <svg><use href="#i-${u.blocked ? 'check-circle' : 'ban'}"/></svg>
        ${u.blocked ? 'رفع مسدودی' : 'مسدود کردن'}
      </button>
      <button class="action-btn" onclick="exportUserChats()">
        <svg><use href="#i-download"/></svg> خروجی گفتگوها
      </button>
      <button class="action-btn danger" onclick="deleteUser()">
        <svg><use href="#i-trash"/></svg> حذف کاربر
      </button>
    </div>

    <div class="settings-card">
      <h3><svg><use href="#i-message"/></svg> گفتگوها (${chats.length})</h3>`;

  if (!chats.length) {
    html += `<div class="empty-state" style="padding:30px 20px">
      <svg><use href="#i-message"/></svg>
      <h3>هیچ گفتگویی نیست</h3>
      <p>این کاربر هنوز گفتگویی شروع نکرده</p>
    </div>`;
  } else {
    html += '<div class="chats-list">';
    chats.forEach((chat, idx) => {
      const chatDate = formatDate(chat.createdAt);
      const firstMsg = (chat.messages?.[0]?.text || '').slice(0, 100) || '—';
      const msgCount = chat.messages?.length || 0;

      html += `
        <div class="chat-card">
          <div class="c-header">
            <div class="c-title">
              <svg><use href="#i-message"/></svg>
              ${esc(chat.title || 'بدون عنوان')}
            </div>
            <div class="c-date">${chatDate.short}</div>
          </div>
          <div class="c-preview">${esc(firstMsg)}${firstMsg.length >= 100 ? '...' : ''}</div>
          <div class="c-actions">
            <button onclick="viewChat(${idx})">
              <svg><use href="#i-eye"/></svg> مشاهده (${msgCount} پیام)
            </button>
            <button class="danger" onclick="deleteChat(${idx})">
              <svg><use href="#i-trash"/></svg> حذف
            </button>
          </div>
        </div>`;
    });
    html += '</div>';
  }

  html += '</div>';

  $('usersContainer').innerHTML = html;
}

function backToUsers() {
  state.currentUser = null;
  state.currentChatIndex = null;
  loadUsers();
}

function viewChat(index) {
  state.currentChatIndex = index;
  const chat = state.currentUser.chats[index];
  if (!chat) return;

  const chatDate = formatDate(chat.createdAt);
  let html = `
    <button class="back-btn" onclick="renderUserDetail()">
      <svg><use href="#i-arrow-right"/></svg> بازگشت
    </button>
    <div class="detail-header" style="background:linear-gradient(135deg,#0ea5e9,#0369a1)">
      <div class="d-info">
        <div class="d-name" style="font-size:16px">${esc(chat.title || 'بدون عنوان')}</div>
        <div class="d-date">شروع: ${chatDate.full} • ${chat.messages?.length || 0} پیام</div>
      </div>
    </div>
    <div class="chat-viewer">`;

  (chat.messages || []).forEach(m => {
    html += `
      <div class="view-msg ${m.type === 'user' ? 'user' : 'ai'}">
        <div class="view-role">
          ${m.type === 'user'
            ? '<svg><use href="#i-users"/></svg> کاربر'
            : '<svg><use href="#i-cpu"/></svg> اوای یقین'}
        </div>
        ${m.image ? `<img class="view-image" src="${m.image}" onclick="openLightbox('${m.image}')">` : ''}
        ${m.text ? `<div class="view-content">${esc(m.text)}</div>` : ''}
      </div>`;
  });

  html += '</div>';
  $('usersContainer').innerHTML = html;
}

/* ═══════════ Actions ═══════════ */
async function toggleBlock() {
  const u = state.currentUser;
  if (!u) return;
  const action = u.blocked ? 'رفع مسدودی' : 'مسدود کردن';
  if (!confirm(`آیا از ${action} کاربر مطمئن هستید؟`)) return;
  try {
    await api('/api/admin/user/block', {
      method: 'POST',
      body: JSON.stringify({ phone: u.phone, blocked: !u.blocked })
    });
    u.blocked = !u.blocked;
    toast('انجام شد', 'success');
    renderUserDetail();
  } catch (e) {
    toast('خطا: ' + e.message, 'error');
  }
}

async function deleteUser() {
  const u = state.currentUser;
  if (!u) return;
  if (!confirm(`آیا از حذف کاربر «${u.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست!`)) return;
  try {
    await api('/api/admin/user', {
      method: 'DELETE',
      body: JSON.stringify({ phone: u.phone })
    });
    toast('کاربر حذف شد', 'success');
    backToUsers();
  } catch (e) {
    toast('خطا: ' + e.message, 'error');
  }
}

async function deleteChat(index) {
  const u = state.currentUser;
  if (!u) return;
  if (!confirm('این گفتگو حذف شود؟')) return;
  try {
    await api('/api/admin/chat', {
      method: 'DELETE',
      body: JSON.stringify({ phone: u.phone, chatIndex: index })
    });
    u.chats.splice(index, 1);
    toast('گفتگو حذف شد', 'success');
    renderUserDetail();
  } catch (e) {
    toast('خطا: ' + e.message, 'error');
  }
}

function enterUserChat() {
  const u = state.currentUser;
  if (!u) return;
  if (!confirm(`ورود به چت «${u.name}»؟\nشما در حساب این کاربر وارد خواهید شد.`)) return;

  // ذخیره ادمین فعلی برای بازگشت
  localStorage.setItem('oy_admin_token', state.token);
  localStorage.setItem('oy_admin_name', state.user.name);
  localStorage.setItem('oy_admin_phone', state.user.phone);

  // ورود به عنوان کاربر (با API مخصوص)
  (async () => {
    try {
      const data = await api('/api/admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ phone: u.phone })
      });
      localStorage.setItem('oy_token', data.token);
      window.location.href = '/';
    } catch (e) {
      toast('خطا: ' + e.message, 'error');
    }
  })();
}

function exportUserChats() {
  const u = state.currentUser;
  if (!u || !u.chats?.length) return toast('گفتگویی نیست', 'error');

  let text = `گفتگوهای ${u.name} — ${u.phone}\n`;
  text += `تاریخ خروجی: ${new Date().toLocaleString('fa-IR')}\n`;
  text += '═'.repeat(50) + '\n\n';

  u.chats.forEach((chat, i) => {
    text += `\n📌 گفتگو ${i + 1}: ${chat.title}\n`;
    text += `تاریخ: ${formatDate(chat.createdAt).full}\n`;
    text += '─'.repeat(50) + '\n';
    (chat.messages || []).forEach(m => {
      text += `\n${m.type === 'user' ? '👤 کاربر' : '✦ اوای یقین'}:\n`;
      text += (m.text || '') + '\n';
    });
    text += '\n' + '═'.repeat(50) + '\n';
  });

  downloadFile(text, `chats-${u.phone}.txt`);
}

/* ═══════════ Export CSV ═══════════ */
function exportCSV() {
  if (!state.users.length) return toast('کاربری نیست', 'error');

  let csv = 'نام,شماره تلفن,تعداد گفتگو,تاریخ عضویت,آخرین ورود,وضعیت\n';
  state.users.forEach(u => {
    const created = formatDate(u.createdAt).full;
    const lastLogin = formatDate(u.lastLogin).full;
    const status = u.blocked ? 'مسدود' : 'فعال';
    csv += `"${u.name || ''}","${u.phone}","${u.chatCount || 0}","${created}","${lastLogin}","${status}"\n`;
  });

  // BOM برای Excel فارسی
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `users-${Date.now()}.csv`;
  a.click();
  toast('فایل CSV دانلود شد', 'success');
}

/* ═══════════ Settings ═══════════ */
async function loadSettings() {
  try {
    const data = await api('/api/admin/settings');
    $('systemPrompt').value = data.config.systemPrompt || '';
    $('temperature').value = data.config.temperature;
    $('tempVal').textContent = data.config.temperature;
  } catch (e) {
    toast('خطا در بارگذاری تنظیمات', 'error');
  }
}

async function saveSettings() {
  const btn = $('saveSettingsBtn');
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div> در حال ذخیره...';

  try {
    await api('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        systemPrompt: $('systemPrompt').value,
        temperature: parseFloat($('temperature').value)
      })
    });
    toast('تنظیمات ذخیره شد', 'success');
  } catch (e) {
    toast('خطا: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = original;
}

/* ═══════════ Tabs ═══════════ */
function switchTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  $('tab-' + tab).classList.add('active');
  if (tab === 'settings') loadSettings();
  else if (tab === 'users') backToUsers();
}

/* ═══════════ Navigation ═══════════ */
function goToChat() {
  window.location.href = '/';
}

function doLogout() {
  if (!confirm('از حساب خود خارج می‌شوید؟')) return;
  api('/api/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('oy_token');
  localStorage.removeItem('oy_admin_token');
  localStorage.removeItem('oy_admin_name');
  localStorage.removeItem('oy_admin_phone');
  window.location.href = '/';
}

/* ═══════════ Helpers ═══════════ */
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function formatDate(ts) {
  if (!ts) return { short: '-', full: '-' };
  const d = new Date(ts);
  const date = d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return {
    short: `${date} ${time}`,
    full: `${date} ساعت ${time}`
  };
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function openLightbox(src) {
  $('lightboxImg').src = src;
  $('lightbox').classList.add('show');
}
function closeLightbox() {
  $('lightbox').classList.remove('show');
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2500);
}

/* ═══════════ Init ═══════════ */
init();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});
