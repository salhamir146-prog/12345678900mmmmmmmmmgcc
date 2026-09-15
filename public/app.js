/* ═══════════════════════════════════════════════════════════
   🕌 اوای یقین — منطق چت کاربر
   ═══════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

marked.setOptions({ breaks: true, gfm: true });

const state = {
  conversations: [],
  currentId: null,
  generating: false,
  abortController: null,
  theme: localStorage.getItem('oy_theme') || 'light',
  user: null,
  token: localStorage.getItem('oy_token') || null,
  image: null,
  streamingText: ''
};

const input = $('input');
const sendBtn = $('sendBtn');
const sendIcon = $('sendIcon');
const wrap = $('wrap');
const content = $('content');
const sidebar = $('sidebar');
const backdrop = $('backdrop');
const scrollBtn = $('scrollBtn');

document.documentElement.setAttribute('data-theme', state.theme);
updateThemeBtn();

/* ═══════════ API Helper ═══════════ */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { headers, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'خطای شبکه');
  }
  return res.json();
}

/* ═══════════ Login ═══════════ */
async function checkAuth() {
  if (!state.token) return false;
  try {
    const data = await api('/api/me');
    if (data && data.user) {
      await onLoginSuccess(data.user, false);
      return true;
    }
  } catch (e) {}
  localStorage.removeItem('oy_token');
  state.token = null;
  return false;
}

async function doLogin() {
  const name = $('loginName').value.trim();
  const phone = $('loginPhone').value.trim();
  const errEl = $('loginError');
  errEl.classList.remove('show');

  if (!name || name.length < 2) {
    errEl.textContent = 'لطفاً نام خود را وارد کنید';
    errEl.classList.add('show');
    return;
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    errEl.textContent = 'لطفاً شماره تلفن معتبر وارد کنید';
    errEl.classList.add('show');
    return;
  }

  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'در حال ورود...';

  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ name, phone })
    });
    state.token = data.token;
    localStorage.setItem('oy_token', data.token);
    await onLoginSuccess(data.user, true);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'ورود به اوای یقین';
  }
}

async function onLoginSuccess(user, animate) {
  state.user = user;
  $('loginScreen').classList.add('hide');
  setTimeout(() => {
    $('loginScreen').style.display = 'none';
    $('app').style.display = 'flex';
  }, animate ? 500 : 0);

  $('userName').textContent = user.name;
  $('userPhone').textContent = user.phone;
  $('userAvatar').textContent = user.name.charAt(0);

  if (user.role === 'admin') {
    $('adminBtn').style.display = 'flex';
    $('adminBadge').style.display = 'inline-block';
  }

  await loadChats();
}

async function doLogout() {
  if (!confirm('از حساب خود خارج می‌شوید؟')) return;
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  state.user = null;
  state.token = null;
  state.conversations = [];
  localStorage.removeItem('oy_token');
  $('app').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  setTimeout(() => $('loginScreen').classList.remove('hide'), 50);
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = 'ورود به اوای یقین';
  $('loginPhone').value = '';
}

/* ═══════════ Chats ═══════════ */
async function loadChats() {
  try {
    const data = await api('/api/chats');
    state.conversations = data.chats || [];
    renderHistory();
  } catch (e) { console.error(e); }
}

async function saveChats() {
  try {
    await api('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ chats: state.conversations })
    });
  } catch (e) { console.error(e); }
}

function renderHistory() {
  const history = $('history');
  history.innerHTML = '';
  if (!state.conversations.length) {
    history.innerHTML = '<div style="padding:20px 12px;text-align:center;font-size:12px;color:var(--text-muted)">هنوز گفتگویی ندارید</div>';
    return;
  }
  state.conversations.forEach(conv => {
    const el = document.createElement('div');
    el.className = 'chat-item' + (conv.id === state.currentId ? ' active' : '');
    el.innerHTML = `
      <span class="title">
        <svg><use href="#i-message"/></svg>
        ${esc(conv.title)}
      </span>
      <button class="del-btn" onclick="event.stopPropagation();deleteChatById('${conv.id}')" aria-label="حذف">
        <svg><use href="#i-trash"/></svg>
      </button>`;
    el.onclick = () => openConversation(conv.id);
    history.appendChild(el);
  });
}

function newChat() {
  state.currentId = null;
  $('welcome').style.display = '';
  $('cards').style.display = '';
  wrap.querySelectorAll('.message').forEach(m => m.remove());
  input.value = ''; grow(input);
  sendBtn.disabled = true;
  renderHistory();
  closeSidebar();
  input.focus();
}

function openConversation(id) {
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;
  state.currentId = id;
  $('welcome').style.display = 'none';
  $('cards').style.display = 'none';
  wrap.querySelectorAll('.message').forEach(m => m.remove());
  conv.messages.forEach(m => addMessage(m.text, m.type, m.image));
  renderHistory();
  scrollBottom();
  closeSidebar();
}

function deleteChatById(id) {
  if (!confirm('این گفتگو حذف شود؟')) return;
  state.conversations = state.conversations.filter(c => c.id !== id);
  saveChats();
  if (state.currentId === id) newChat();
  else renderHistory();
}

function filterHistory(q) {
  document.querySelectorAll('#history .chat-item').forEach(el => {
    el.style.display = el.innerText.includes(q) ? '' : 'none';
  });
}

/* ═══════════ Sidebar / Theme ═══════════ */
function toggleSidebar() {
  const isOpen = sidebar.classList.toggle('open');
  backdrop.classList.toggle('show', isOpen);
}
function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('show');
}
function toggleCollapse() { sidebar.classList.toggle('collapsed'); }

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('oy_theme', state.theme);
  updateThemeBtn();
}
function updateThemeBtn() {
  $('themeIcon').innerHTML = `<use href="#i-${state.theme === 'dark' ? 'sun' : 'moon'}"/>`;
  $('themeText').textContent = state.theme === 'dark' ? 'حالت روز' : 'حالت شب';
}

/* ═══════════ Input ═══════════ */
function grow(x) {
  x.style.height = 'auto';
  x.style.height = Math.min(x.scrollHeight, 180) + 'px';
}
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
    e.preventDefault();
    if (!sendBtn.disabled) e.target.form.requestSubmit();
  }
}
input.addEventListener('input', () => {
  grow(input);
  sendBtn.disabled = !input.value.trim() && !state.image && !state.generating;
});
function promptText(t) {
  input.value = t; grow(input);
  sendBtn.disabled = false;
  input.focus();
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

/* ═══════════ Image Upload ═══════════ */
function handleImage(inp) {
  const file = inp.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) return toast('حجم تصویر باید کمتر از ۴ مگابایت باشد', 'error');
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    state.image = { mimeType: file.type, data: dataUrl.split(',')[1], preview: dataUrl };
    $('imagePreviewImg').src = dataUrl;
    $('imagePreview').classList.add('show');
    $('imageBtn').classList.add('has-image');
    sendBtn.disabled = false;
  };
  reader.readAsDataURL(file);
  inp.value = '';
}
function clearImage() {
  state.image = null;
  $('imagePreview').classList.remove('show');
  $('imageBtn').classList.remove('has-image');
  sendBtn.disabled = !input.value.trim() && !state.generating;
}

/* ═══════════ Lightbox ═══════════ */
function openLightbox(src) {
  $('lightboxImg').src = src;
  $('lightbox').classList.add('show');
}
function closeLightbox() {
  $('lightbox').classList.remove('show');
}

/* ═══════════ Mic ═══════════ */
let recognition = null;
let isRecording = false;
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('مرورگر شما از میکروفون پشتیبانی نمی‌کند', 'error');
  if (isRecording) { recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = 'fa-IR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onstart = () => {
    isRecording = true;
    $('micBtn').classList.add('recording');
    input.placeholder = 'در حال شنیدن...';
  };
  recognition.onresult = e => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    input.value = text;
    grow(input);
    sendBtn.disabled = !text.trim();
  };
  recognition.onend = () => {
    isRecording = false;
    $('micBtn').classList.remove('recording');
    input.placeholder = 'پرسش دینی خود را بنویسید...';
  };
  recognition.onerror = e => {
    isRecording = false;
    $('micBtn').classList.remove('recording');
    input.placeholder = 'پرسش دینی خود را بنویسید...';
    if (e.error !== 'aborted') toast('خطا در ضبط صدا', 'error');
  };
  recognition.start();
}

/* ═══════════ AI SVG ═══════════ */
const AI_AVATAR = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 82 L20 70 L80 70 L92 82 Z" fill="#fff"/>
  <path d="M14 32 Q20 24 32 24 L50 30 L50 70 Q32 64 14 70 Z" fill="#fff"/>
  <path d="M86 32 Q80 24 68 24 L50 30 L50 70 Q68 64 86 70 Z" fill="#fff"/>
  <path d="M22 40 Q30 36 46 38M22 48 Q30 44 46 46M78 40 Q70 36 54 38M78 48 Q70 44 54 46" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

/* ═══════════ Add Message ═══════════ */
function addMessage(text, type, imageData) {
  const el = document.createElement('div');
  el.className = 'message ' + type;

  const avatar = type === 'ai'
    ? AI_AVATAR
    : esc(state.user?.name?.charAt(0) || 'شما');

  // ساخت بخش محتوای پیام
  let contentHtml = '';
  if (imageData) {
    contentHtml += `<img class="msg-image" src="${imageData}" alt="تصویر" onclick="openLightbox('${imageData}')">`;
  }
  if (text) {
    if (type === 'ai') {
      contentHtml += `<div class="msg-text">${marked.parse(text)}</div>`;
    } else {
      contentHtml += `<div class="msg-text">${esc(text)}</div>`;
    }
  }

  // اکشن‌ها
  let actions = '';
  if (type === 'ai') {
    actions = `<div class="msg-actions">
      <button onclick="copyText(this)" title="کپی"><svg><use href="#i-copy"/></svg></button>
      <button onclick="regenerate(this)" title="بازتولید"><svg><use href="#i-refresh"/></svg></button>
      <button onclick="speak(this)" title="خواندن"><svg><use href="#i-volume"/></svg></button>
    </div>`;
  } else {
    actions = `<div class="msg-actions">
      <button onclick="copyText(this)" title="کپی"><svg><use href="#i-copy"/></svg></button>
    </div>`;
  }

  el.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-body">
      <div class="msg-bubble">${contentHtml}</div>
      ${actions}
    </div>`;

  wrap.appendChild(el);
  content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
  return el;
}

/* ═══════════ Send ═══════════ */
async function sendMessage(e) {
  e.preventDefault();
  if (state.generating && state.abortController) {
    state.abortController.abort();
    return;
  }
  const text = input.value.trim();
  if (!text && !state.image) return;

  $('welcome').style.display = 'none';
  $('cards').style.display = 'none';

  if (!state.currentId) {
    const id = Date.now().toString();
    state.conversations.unshift({
      id,
      title: (text || 'تصویر').slice(0, 32),
      messages: [],
      createdAt: Date.now()
    });
    state.currentId = id;
    saveChats();
    renderHistory();
  }

  const conv = state.conversations.find(c => c.id === state.currentId);

  // ساخت پیام برای ذخیره و نمایش
  const savedMsg = { text: text, type: 'user' };
  if (state.image) savedMsg.image = state.image.preview;
  conv.messages.push(savedMsg);

  // نمایش پیام کاربر با عکس
  addMessage(text, 'user', state.image?.preview);

  input.value = ''; grow(input);
  state.generating = true;
  sendBtn.classList.add('stop');
  sendBtn.disabled = false;
  sendIcon.innerHTML = '<use href="#i-square"/>';

  const imgToSend = state.image;
  clearImage();
  await saveChats();
  await streamResponse(conv, imgToSend);
}

/* ═══════════ Stream Response ═══════════ */
async function streamResponse(conv, image) {
  const el = document.createElement('div');
  el.className = 'message ai';
  el.innerHTML = `
    <div class="msg-avatar">${AI_AVATAR}</div>
    <div class="msg-body">
      <div class="msg-bubble">
        <div class="msg-text">
          <span class="typing-indicator"><span></span><span></span><span></span></span>
        </div>
      </div>
      <div class="msg-actions" style="display:none">
        <button onclick="copyText(this)" title="کپی"><svg><use href="#i-copy"/></svg></button>
        <button onclick="regenerate(this)" title="بازتولید"><svg><use href="#i-refresh"/></svg></button>
        <button onclick="speak(this)" title="خواندن"><svg><use href="#i-volume"/></svg></button>
      </div>
    </div>`;
  wrap.appendChild(el);
  content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });

  const textEl = el.querySelector('.msg-text');
  const actionsEl = el.querySelector('.msg-actions');
  state.streamingText = '';
  state.abortController = new AbortController();

  const apiMessages = conv.messages.map(m => {
    const msg = { role: m.type === 'ai' ? 'assistant' : 'user', content: m.text || '' };
    return msg;
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: apiMessages,
        image: image ? { mimeType: image.mimeType, data: image.data } : null
      }),
      signal: state.abortController.signal
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'خطا در ارتباط با سرور');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const data = JSON.parse(jsonStr);
          const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (chunk) {
            state.streamingText += chunk;
            textEl.innerHTML = marked.parse(state.streamingText) + '<span class="streaming-cursor"></span>';
            content.scrollTop = content.scrollHeight;
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      state.streamingText = 'خطا: ' + err.message;
    }
  }

  textEl.innerHTML = marked.parse(state.streamingText);
  actionsEl.style.display = 'flex';
  state.generating = false;
  state.abortController = null;
  sendBtn.classList.remove('stop');
  sendIcon.innerHTML = '<use href="#i-arrow-up"/>';
  sendBtn.disabled = !input.value.trim();

  conv.messages.push({ text: state.streamingText, type: 'ai' });
  await saveChats();
  renderHistory();
}

/* ═══════════ Actions ═══════════ */
function copyText(btn) {
  const textEl = btn.closest('.msg-body').querySelector('.msg-text');
  const text = textEl ? textEl.innerText : '';
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = '<svg><use href="#i-check"/></svg>';
    setTimeout(() => btn.innerHTML = '<svg><use href="#i-copy"/></svg>', 1200);
  });
}

function regenerate(btn) {
  const msg = btn.closest('.message');
  const conv = state.conversations.find(c => c.id === state.currentId);
  if (!conv) return;
  const lastIdx = conv.messages.length - 1;
  if (conv.messages[lastIdx]?.type === 'ai') conv.messages.splice(lastIdx, 1);
  msg.remove();
  saveChats();
  state.generating = true;
  sendBtn.classList.add('stop');
  sendBtn.disabled = false;
  sendIcon.innerHTML = '<use href="#i-square"/>';
  streamResponse(conv, null);
}

function speak(btn) {
  const textEl = btn.closest('.msg-body').querySelector('.msg-text');
  const text = textEl ? textEl.innerText : '';
  if ('speechSynthesis' in window) {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      btn.innerHTML = '<svg><use href="#i-volume"/></svg>';
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fa-IR';
    u.rate = 0.95;
    speechSynthesis.speak(u);
    btn.innerHTML = '<svg><use href="#i-pause"/></svg>';
    u.onend = () => { btn.innerHTML = '<svg><use href="#i-volume"/></svg>'; };
  }
}

/* ═══════════ Modal ═══════════ */
function openModal(type) {
  const overlay = $('modalOverlay');
  const content = $('modalContent');
  let html = '';

  if (type === 'help') {
    html = `<h3><svg><use href="#i-help"/></svg> راهنما</h3>
      <p style="font-size:13.5px;line-height:2.2;color:var(--text-secondary)">
        • ارسال پیام: <strong>Enter</strong><br>
        • خط جدید: <strong>Shift + Enter</strong><br>
        • ارسال تصویر: دکمه‌ی تصویر<br>
        • صحبت: دکمه‌ی میکروفون<br>
        • شنیدن پاسخ: دکمه‌ی صدا<br>
        • بازتولید: دکمه‌ی بازتولید
      </p>
      <div class="modal-btns"><button class="btn-primary" onclick="closeModal()">متوجه شدم</button></div>`;
  } else if (type === 'options') {
    html = `<h3><svg><use href="#i-dots"/></svg> گزینه‌ها</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="side-btn" onclick="exportChat();closeModal()"><svg><use href="#i-download"/></svg><span>دانلود گفتگو</span></button>
        <button class="side-btn" onclick="newChat();closeModal()"><svg><use href="#i-plus"/></svg><span>گفتگوی جدید</span></button>
        <button class="side-btn danger" onclick="clearAllChats();closeModal()"><svg><use href="#i-trash"/></svg><span>پاک کردن همه</span></button>
      </div>`;
  } else if (type === 'model') {
    html = `<h3><svg><use href="#i-sparkles"/></svg> انتخاب حالت</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="padding:14px;border:1.5px solid var(--accent);border-radius:var(--radius-md);background:var(--sky-50);cursor:pointer">
          <div style="font-size:14px;font-weight:700;color:var(--sky-800);margin-bottom:4px">اوای یقین — پاسخگوی دینی</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">دقیق، مستند، مبتنی بر منابع معتبر</div>
        </div>
      </div>
      <div class="modal-btns"><button class="btn-primary" onclick="closeModal()">تأیید</button></div>`;
  }

  content.innerHTML = html;
  overlay.classList.add('show');
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  $('modalOverlay').classList.remove('show');
}

function clearAllChats() {
  if (!confirm('همه گفتگوها پاک شود؟')) return;
  state.conversations = [];
  state.currentId = null;
  saveChats();
  renderHistory();
  newChat();
}

function exportChat() {
  const conv = state.conversations.find(c => c.id === state.currentId);
  if (!conv) return toast('گفتگویی برای دانلود نیست', 'error');
  const text = conv.messages.map(m => `${m.type === 'user' ? '👤 شما' : '✦ اوای یقین'}:\n${m.text}`).join('\n\n---\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${conv.title}.txt`;
  a.click();
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2500);
}

/* ═══════════ Admin ═══════════ */
function openAdmin() {
  window.location.href = '/admin.html';
}

/* ═══════════ Scroll ═══════════ */
content.addEventListener('scroll', () => {
  $('topBar').classList.toggle('scrolled', content.scrollTop > 10);
  scrollBtn.classList.toggle('show', content.scrollHeight - content.scrollTop - content.clientHeight > 250);
}, { passive: true });

function scrollBottom() {
  content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
}

/* ═══════════ Init ═══════════ */
(async () => {
  const authed = await checkAuth();
  if (!authed) {
    $('loginScreen').style.display = 'flex';
  }
  if (window.innerWidth > 768) sidebar.classList.remove('collapsed');
})();

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'k') { e.preventDefault(); newChat(); }
  if (e.key === 'Escape') { closeModal(); closeSidebar(); closeLightbox(); }
});
