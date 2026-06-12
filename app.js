// ============================================================
// Config
// ============================================================
const JSONBIN_KEY = '$2a$10$QBi9BI/.1Np6zFQ1Mde./.G1S1QLi.auetF.iFlXyNpCi.Ib3jDaO';
const SHARED_BIN = '6a2bedb5f5f4af5e29e5db66';
const CHAT_BIN = '6a2bf192da38895dfeb46918';
const CLOUDINARY_CLOUD = 'dxftvseub';
const CLOUDINARY_PRESET = 'color_walking';
const JSONBIN_API = 'https://api.jsonbin.io/v3';

// ============================================================
// State
// ============================================================
let map, miniMap;
let allPhotos = [];
let currentFile = null;
let currentLat = null, currentLng = null;
let manualLat = null, manualLng = null;
let markers = [];
let userColors = {};
let colorIndex = 0;
let pollTimer = null;
const COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf','#ff8b94','#b4a7d6','#ffb347','#87ceeb'];

// Unique nickname per device — emoji + 4位随机字符，存本地不重复
const EMOJIS = ['🌸','🌈','🦋','🌙','⭐','🍀','🎨','🌊','🌺','🦊','🐬','🦄','🍭','🎸','🌵','🐧','🦋','🍄','🎯','🚀'];
function genNick() {
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return emoji + suffix;
}
const nickname = localStorage.getItem('cw_nick') || genNick();
localStorage.setItem('cw_nick', nickname);

// ============================================================
// Init
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadPhotos();
  startPolling();
});

// ============================================================
// Polling
// ============================================================
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadPhotos, 15000);
}

// ============================================================
// Map
// ============================================================
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([31.2304, 121.4737], 13);
  L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    attribution: '© 高德地图', maxZoom: 18
  }).addTo(map);
}

function getUserColor(name) {
  if (!userColors[name]) {
    userColors[name] = COLORS[colorIndex % COLORS.length];
    colorIndex++;
  }
  return userColors[name];
}

function addMarker(photo) {
  if (!photo.lat || !photo.lng) return;
  const color = getUserColor(photo.author);
  const likes = (photo.likes || []).length;
  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="width:44px;height:44px;border-radius:50% 50% 50% 0;background:${color};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35);transform:rotate(-45deg);cursor:pointer;overflow:hidden;">
        <img src="${photo.url}" style="width:100%;height:100%;object-fit:cover;transform:rotate(45deg);" onerror="this.style.display='none'"/>
      </div>
      ${likes > 0 ? `<div style="position:absolute;top:-6px;right:-6px;background:#ff6b6b;border-radius:10px;padding:1px 5px;font-size:10px;color:white;font-weight:700;border:1px solid white;">❤️${likes}</div>` : ''}
    </div>`,
    iconSize: [44, 44], iconAnchor: [22, 44]
  });
  const marker = L.marker([photo.lat, photo.lng], { icon }).addTo(map);
  marker.on('click', () => openPhoto(photo));
  markers.push(marker);
}

function updateLegend() {
  const legend = document.getElementById('map-legend');
  legend.innerHTML = '<div class="legend-title">📍 大家的足迹</div>';
  Object.entries(userColors).forEach(([name, color]) => {
    legend.innerHTML += `<div class="legend-item"><span class="dot" style="background:${color}"></span>${name}</div>`;
  });
}

// ============================================================
// Load Photos
// ============================================================
let openPhotoId = null; // 当前打开的照片ID

async function loadPhotos() {
  try {
    const res = await fetch(`${JSONBIN_API}/b/${SHARED_BIN}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    const photos = data.record?.photos || [];
    if (JSON.stringify(photos) === JSON.stringify(allPhotos)) return;
    allPhotos = photos;

    markers.forEach(m => map && map.removeLayer(m));
    markers = []; userColors = {}; colorIndex = 0;
    allPhotos.forEach(p => addMarker(p));
    updateLegend();
    renderWall();

    // 如果弹窗是打开的，刷新点赞和评论
    if (openPhotoId !== null) {
      const latest = allPhotos.find(p => p.id === openPhotoId);
      if (latest) refreshPhotoDetail(latest);
    }
  } catch(e) { console.error('加载失败', e); }
}

function refreshPhotoDetail(photo) {
  // 刷新点赞
  const likes = photo.likes || [];
  const hasLiked = likes.includes(nickname);
  const likeBtn = document.getElementById('detail-like-btn');
  const likeCount = document.getElementById('detail-like-count');
  if (likeBtn) {
    likeBtn.textContent = hasLiked ? '❤️ 已点赞' : '🤍 点个赞';
    likeBtn.style.opacity = hasLiked ? '0.6' : '1';
    likeBtn.onclick = () => toggleLike(photo);
  }
  if (likeCount) likeCount.textContent = likes.length > 0 ? `${likes.length} 人觉得很美` : '';
  // 刷新评论
  renderComments(photo);
}

// ============================================================
// Upload
// ============================================================
function openUpload() {
  document.getElementById('upload-modal').classList.remove('hidden');
  document.getElementById('input-desc').value = '';
  document.getElementById('preview-img').classList.add('hidden');
  document.getElementById('preview-img').src = '';
  document.getElementById('location-status').textContent = '';
  document.getElementById('mini-map').classList.add('hidden');
  document.getElementById('btn-manual').classList.add('hidden');
  currentFile = null; currentLat = null; currentLng = null; manualLat = null; manualLng = null;
  if (miniMap) { miniMap.remove(); miniMap = null; }
}

function closeUpload() {
  document.getElementById('upload-modal').classList.add('hidden');
}

async function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentFile = file;

  // Preview
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('preview-img');
    img.src = e.target.result;
    img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);

  // Try EXIF GPS
  document.getElementById('location-status').textContent = '📍 读取GPS中...';
  try {
    const exif = await exifr.gps(file);
    if (exif && exif.latitude) {
      currentLat = exif.latitude;
      currentLng = exif.longitude;
      document.getElementById('location-status').textContent = `✅ 已获取位置`;
      showMiniMap(currentLat, currentLng);
      return;
    }
  } catch(e) {}

  // No GPS
  document.getElementById('location-status').textContent = '📍 未找到GPS，请手动标记位置';
  document.getElementById('btn-manual').classList.remove('hidden');
}

function enableManualLocation() {
  document.getElementById('mini-map').classList.remove('hidden');
  document.getElementById('location-status').textContent = '📌 点击地图标记拍摄位置';
  if (!miniMap) {
    miniMap = L.map('mini-map').setView([31.2304, 121.4737], 13);
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { attribution: '© 高德地图' }).addTo(miniMap);
    let tempMarker = null;
    miniMap.on('click', e => {
      manualLat = e.latlng.lat; manualLng = e.latlng.lng;
      if (tempMarker) miniMap.removeLayer(tempMarker);
      tempMarker = L.marker([manualLat, manualLng]).addTo(miniMap);
      document.getElementById('location-status').textContent = `✅ 位置已标记`;
    });
  }
}

function showMiniMap(lat, lng) {
  document.getElementById('mini-map').classList.remove('hidden');
  if (!miniMap) {
    miniMap = L.map('mini-map').setView([lat, lng], 15);
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { attribution: '© 高德地图' }).addTo(miniMap);
  } else { miniMap.setView([lat, lng], 15); }
  L.marker([lat, lng]).addTo(miniMap);
}

async function publishPhoto() {
  if (!currentFile) { alert('请先选择照片！'); return; }
  const lat = currentLat || manualLat;
  const lng = currentLng || manualLng;
  if (!lat || !lng) { alert('请标记拍摄位置！'); return; }

  const btn = document.querySelector('.btn-publish');
  btn.textContent = '上传中...'; btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: 'POST', body: formData
    });
    if (!uploadRes.ok) throw new Error('图片上传失败');
    const { secure_url: url } = await uploadRes.json();

    const photo = {
      id: Date.now(), url,
      author: nickname,
      desc: document.getElementById('input-desc').value.trim(),
      lat, lng,
      time: new Date().toLocaleString('zh-CN')
    };

    const getRes = await fetch(`${JSONBIN_API}/b/${SHARED_BIN}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const getData = await getRes.json();
    const photos = getData.record?.photos || [];
    photos.push(photo);

    await fetch(`${JSONBIN_API}/b/${SHARED_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ photos })
    });

    closeUpload();
    await loadPhotos();
    showPage('map');
    if (map) map.setView([lat, lng], 16);
  } catch(e) {
    alert('发布失败：' + e.message);
  } finally {
    btn.textContent = '发布 🎉'; btn.disabled = false;
  }
}

// ============================================================
// Photo Wall
// ============================================================
function renderWall() {
  const grid = document.getElementById('wall-grid');
  if (!allPhotos.length) {
    grid.innerHTML = '<div class="wall-empty">还没有照片，快去上传吧！📸</div>';
    return;
  }
  // 按时间最新到最旧排列
  const sorted = [...allPhotos].sort((a, b) => b.id - a.id);
  grid.innerHTML = sorted.map(p => {
    const likeCount = (p.likes || []).length;
    const commentCount = (p.comments || []).length;
    return `<div class="wall-item" onclick='openPhoto(${JSON.stringify(p)})'>
      <img src="${p.url}" loading="lazy" alt=""/>
      <div class="wall-item-info">
        <span class="wall-author" style="color:${getUserColor(p.author)}">${p.author}</span>
        <span class="wall-desc">${p.desc || ''}</span>
        <div class="wall-stats">${likeCount > 0 ? `❤️ ${likeCount}` : ''} ${commentCount > 0 ? `💬 ${commentCount}` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function openPhoto(photo) {
  if (typeof photo === 'string') photo = JSON.parse(photo);
  // 从 allPhotos 拿最新数据（包含最新点赞）
  const latest = allPhotos.find(p => p.id === photo.id) || photo;
  openPhotoId = latest.id; // 记录当前打开的照片ID
  document.getElementById('detail-img').src = latest.url;
  document.getElementById('detail-desc').textContent = latest.desc || '';
  document.getElementById('detail-time').textContent = latest.time || '';
  
  // 点赞区
  const likes = latest.likes || [];
  const hasLiked = likes.includes(nickname);
  const likeBtn = document.getElementById('detail-like-btn');
  const likeCount = document.getElementById('detail-like-count');
  likeBtn.textContent = hasLiked ? '❤️ 已点赞' : '🤍 点个赞';
  likeBtn.style.opacity = hasLiked ? '0.6' : '1';
  likeBtn.onclick = () => toggleLike(latest);
  likeCount.textContent = likes.length > 0 ? `${likes.length} 人觉得很美` : '';

  // 评论区
  document.getElementById('comment-input').value = '';
  document.getElementById('comment-input').dataset.photoId = latest.id;
  renderComments(latest);

  document.getElementById('photo-modal').classList.remove('hidden');
}

async function toggleLike(photo) {
  const idx = allPhotos.findIndex(p => p.id === photo.id);
  if (idx === -1) return;
  const likes = [...(allPhotos[idx].likes || [])];
  const alreadyLiked = likes.includes(nickname);
  if (alreadyLiked) {
    likes.splice(likes.indexOf(nickname), 1);
  } else {
    likes.push(nickname);
  }
  allPhotos[idx].likes = likes;
  
  // 更新按钮状态
  const likeBtn = document.getElementById('detail-like-btn');
  const likeCount = document.getElementById('detail-like-count');
  likeBtn.textContent = !alreadyLiked ? '❤️ 已点赞' : '🤍 点个赞';
  likeBtn.style.opacity = !alreadyLiked ? '0.6' : '1';
  likeCount.textContent = likes.length > 0 ? `${likes.length} 人觉得很美` : '';
  
  // 保存到 JSONBin
  try {
    await fetch(`${JSONBIN_API}/b/${SHARED_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ photos: allPhotos })
    });
    // 刷新地图标记
    markers.forEach(m => map && map.removeLayer(m));
    markers = [];
    allPhotos.forEach(p => addMarker(p));
    updateLegend();
  } catch(e) { console.error('点赞失败', e); }
}

function closePhoto() {
  document.getElementById('photo-modal').classList.add('hidden');
  openPhotoId = null;
}

// ============================================================
// Pages
// ============================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.remove('hidden');
  const tabs = document.querySelectorAll('.tab-btn');
  if (name === 'map') { tabs[0].classList.add('active'); setTimeout(() => map && map.invalidateSize(), 100); }
  if (name === 'wall') { tabs[1].classList.add('active'); renderWall(); }
}

// Wall updates in real-time via loadPhotos polling

// ============================================================
// Chat
// ============================================================
let chatMessages = [];
let chatPollTimer = null;
let chatOpen = false;
let unreadCount = 0;

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window');
  const bubble = document.getElementById('chat-bubble');
  if (chatOpen) {
    win.classList.remove('hidden');
    unreadCount = 0;
    bubble.textContent = '💬';
    loadMessages();
    if (!chatPollTimer) chatPollTimer = setInterval(loadMessages, 10000);
  } else {
    win.classList.add('hidden');
  }
}

async function loadMessages() {
  try {
    const res = await fetch(`${JSONBIN_API}/b/${CHAT_BIN}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    const msgs = data.record?.messages || [];
    if (JSON.stringify(msgs) === JSON.stringify(chatMessages)) return;
    const isNew = msgs.length > chatMessages.length;
    chatMessages = msgs;
    renderMessages();
    // Update @to dropdown with known users
    updateToDropdown();
    // Unread badge
    if (isNew && !chatOpen) {
      unreadCount++;
      document.getElementById('chat-bubble').textContent = `💬 ${unreadCount}`;
    }
  } catch(e) { console.error('chat load fail', e); }
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!chatMessages.length) {
    container.innerHTML = '<div class="chat-empty">还没有消息，说点什么吧 🎈</div>';
    return;
  }
  container.innerHTML = chatMessages.map(m => {
    const isMine = m.author === nickname;
    const toTag = m.to && m.to !== 'all' ? `<span class="chat-to-tag">@${m.to}</span>` : (m.to === 'all' ? '' : '');
    const color = getUserColor(m.author);
    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">
      ${!isMine ? `<span class="chat-author" style="color:${color}">${m.author}</span>` : ''}
      <div class="chat-bubble-msg ${isMine ? 'mine' : ''}">  
        ${toTag}${m.text}
      </div>
      <span class="chat-time">${m.time}</span>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function updateToDropdown() {
  const sel = document.getElementById('chat-to');
  const current = sel.value;
  const authors = [...new Set(allPhotos.map(p => p.author).filter(a => a !== nickname))];
  sel.innerHTML = '<option value="all">📢 @全员</option>' +
    authors.map(a => `<option value="${a}">@${a}</option>`).join('');
  sel.value = authors.includes(current) ? current : 'all';
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const to = document.getElementById('chat-to').value;

  const msg = {
    id: Date.now(),
    author: nickname,
    to,
    text,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  };

  input.value = '';
  try {
    const msgs = [...chatMessages, msg];
    await fetch(`${JSONBIN_API}/b/${CHAT_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ messages: msgs })
    });
    chatMessages = msgs;
    renderMessages();
  } catch(e) { alert('发送失败'); }
}

// Enter key to send
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'chat-input') sendMessage();
});

// ============================================================
// Comments
// ============================================================
function renderComments(photo) {
  const list = document.getElementById('comments-list');
  const comments = photo.comments || [];
  if (!comments.length) {
    list.innerHTML = '<div class="no-comments">还没有评论，来说两句～</div>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const color = getUserColor(c.author);
    const isMine = c.author === nickname;
    return `<div class="comment-item">
      <span class="comment-author" style="color:${color}">${c.author}</span>
      <span class="comment-text">${c.text}</span>
      <span class="comment-time">${c.time}</span>
      ${isMine ? `<button class="comment-delete" onclick="deleteComment(${photo.id}, ${c.id})">✕</button>` : ''}
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

async function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;
  const photoId = Number(input.dataset.photoId);
  const idx = allPhotos.findIndex(p => p.id === photoId);
  if (idx === -1) return;

  const comment = {
    id: Date.now(),
    author: nickname,
    text,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  };
  allPhotos[idx].comments = [...(allPhotos[idx].comments || []), comment];
  input.value = '';
  renderComments(allPhotos[idx]);

  try {
    await fetch(`${JSONBIN_API}/b/${SHARED_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ photos: allPhotos })
    });
  } catch(e) { console.error('评论失败', e); }
}

async function deleteComment(photoId, commentId) {
  const idx = allPhotos.findIndex(p => p.id === photoId);
  if (idx === -1) return;
  allPhotos[idx].comments = (allPhotos[idx].comments || []).filter(c => c.id !== commentId);
  renderComments(allPhotos[idx]);
  try {
    await fetch(`${JSONBIN_API}/b/${SHARED_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ photos: allPhotos })
    });
  } catch(e) { console.error('删除评论失败', e); }
}

// Enter to comment
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'comment-input') submitComment();
});

// Start chat polling in background
setTimeout(() => {
  chatPollTimer = setInterval(loadMessages, 10000);
  loadMessages();
}, 2000);
