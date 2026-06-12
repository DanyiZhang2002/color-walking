// ============================================================
// Config
// ============================================================
const JSONBIN_KEY = '$2a$10$QBi9BI/.1Np6zFQ1Mde./.G1S1QLi.auetF.iFlXyNpCi.Ib3jDaO';
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
let roomCode = null;
let nickname = null;
let binId = null;
let pollTimer = null;
const COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf','#ff8b94','#b4a7d6','#ffb347','#87ceeb'];

// ============================================================
// Room Gate
// ============================================================
async function createRoom() {
  const nick = document.getElementById('input-nickname').value.trim();
  if (!nick) { alert('请先输入你的昵称！'); return; }
  nickname = nick;

  // Generate 6-char room code
  roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Create a new JSONBin for this room
  const res = await fetch(`${JSONBIN_API}/b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_KEY,
      'X-Bin-Name': `colorwalk-${roomCode}`,
      'X-Bin-Private': 'false'
    },
    body: JSON.stringify({ roomCode, photos: [] })
  });
  const data = await res.json();
  binId = data.metadata.id;

  // Save to localStorage so others can find it by room code
  // We store a mapping in a fixed "index" bin
  await registerRoom(roomCode, binId);

  localStorage.setItem('cw_room', roomCode);
  localStorage.setItem('cw_nick', nickname);
  localStorage.setItem('cw_bin', binId);

  enterApp();
}

async function joinRoom() {
  const nick = document.getElementById('input-nickname').value.trim();
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!nick) { alert('请先输入你的昵称！'); return; }
  if (code.length !== 6) { alert('请输入6位房间码！'); return; }

  nickname = nick;
  roomCode = code;

  // Look up bin id by room code
  const foundBin = await lookupRoom(code);
  if (!foundBin) { alert('找不到这个房间，请检查房间码是否正确～'); return; }
  binId = foundBin;

  localStorage.setItem('cw_room', roomCode);
  localStorage.setItem('cw_nick', nickname);
  localStorage.setItem('cw_bin', binId);

  enterApp();
}

// Register room code → binId in a fixed index bin
async function registerRoom(code, id) {
  const INDEX_BIN = '6a2bedb5f5f4af5e29e5db66'; // fixed index bin (pre-created)
  try {
    const r = await fetch(`${JSONBIN_API}/b/${INDEX_BIN}`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const d = await r.json();
    const index = d.record || {};
    index[code] = id;
    await fetch(`${JSONBIN_API}/b/${INDEX_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify(index)
    });
  } catch(e) {
    // fallback: store in localStorage only (same device share)
    localStorage.setItem('cw_index_' + code, id);
  }
}

async function lookupRoom(code) {
  // Try fixed index bin first
  const INDEX_BIN = '6a2bedb5f5f4af5e29e5db66';
  try {
    const r = await fetch(`${JSONBIN_API}/b/${INDEX_BIN}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const d = await r.json();
    if (d.record && d.record[code]) return d.record[code];
  } catch(e) {}
  // Fallback localStorage
  return localStorage.getItem('cw_index_' + code);
}

function enterApp() {
  document.getElementById('room-gate').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('room-badge-display').textContent = `🏠 房间码：${roomCode}`;
  initMap();
  loadPhotos();
  startPolling();
}

// Auto-resume session
window.addEventListener('DOMContentLoaded', () => {
  const savedRoom = localStorage.getItem('cw_room');
  const savedNick = localStorage.getItem('cw_nick');
  const savedBin = localStorage.getItem('cw_bin');
  if (savedRoom && savedNick && savedBin) {
    roomCode = savedRoom;
    nickname = savedNick;
    binId = savedBin;
    document.getElementById('input-nickname').value = savedNick;
    document.getElementById('input-room-code').value = savedRoom;
    enterApp();
  }
});

// ============================================================
// Polling — refresh photos every 15s
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
    attribution: '© 高德地图',
    maxZoom: 18
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
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:50% 50% 50% 0;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);transform:rotate(-45deg);cursor:pointer;">
      <img src="${photo.url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;transform:rotate(45deg);" onerror="this.style.display='none'"/>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36]
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
async function loadPhotos() {
  if (!binId) return;
  try {
    const res = await fetch(`${JSONBIN_API}/b/${binId}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    const photos = data.record?.photos || [];

    // Only update if changed
    if (JSON.stringify(photos) === JSON.stringify(allPhotos)) return;
    allPhotos = photos;

    // Clear markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    userColors = {};
    colorIndex = 0;

    allPhotos.forEach(p => addMarker(p));
    updateLegend();
    renderWall();
  } catch(e) {
    console.error('加载照片失败', e);
  }
}

// ============================================================
// Upload
// ============================================================
function openUpload() {
  document.getElementById('upload-modal').classList.remove('hidden');
  document.getElementById('input-desc').value = '';
  document.getElementById('preview-img').classList.add('hidden');
  document.getElementById('preview-img').src = '';
  document.getElementById('location-status').textContent = '📍 等待读取GPS...';
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
    if (exif && exif.latitude && exif.longitude) {
      currentLat = exif.latitude;
      currentLng = exif.longitude;
      document.getElementById('location-status').textContent = `✅ GPS已读取：${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`;
      showMiniMap(currentLat, currentLng);
      return;
    }
  } catch(e) {}

  // No GPS — offer manual
  document.getElementById('location-status').textContent = '📍 未找到GPS，请手动标记位置';
  document.getElementById('btn-manual').classList.remove('hidden');
}

function enableManualLocation() {
  const miniMapEl = document.getElementById('mini-map');
  miniMapEl.classList.remove('hidden');
  document.getElementById('location-status').textContent = '📌 点击地图标记拍摄位置';

  if (!miniMap) {
    const center = [31.2304, 121.4737];
    miniMap = L.map('mini-map').setView(center, 13);
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      attribution: '© 高德地图'
    }).addTo(miniMap);

    let tempMarker = null;
    miniMap.on('click', e => {
      manualLat = e.latlng.lat;
      manualLng = e.latlng.lng;
      if (tempMarker) miniMap.removeLayer(tempMarker);
      tempMarker = L.marker([manualLat, manualLng]).addTo(miniMap);
      document.getElementById('location-status').textContent = `✅ 已标记：${manualLat.toFixed(4)}, ${manualLng.toFixed(4)}`;
    });
  }
}

function showMiniMap(lat, lng) {
  const miniMapEl = document.getElementById('mini-map');
  miniMapEl.classList.remove('hidden');
  if (!miniMap) {
    miniMap = L.map('mini-map').setView([lat, lng], 15);
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      attribution: '© 高德地图'
    }).addTo(miniMap);
  } else {
    miniMap.setView([lat, lng], 15);
  }
  L.marker([lat, lng]).addTo(miniMap);
}

async function publishPhoto() {
  if (!currentFile) { alert('请先选择照片！'); return; }
  const lat = currentLat || manualLat;
  const lng = currentLng || manualLng;
  if (!lat || !lng) { alert('请标记拍摄位置！'); return; }

  const desc = document.getElementById('input-desc').value.trim();
  const btn = document.querySelector('.btn-publish');
  btn.textContent = '上传中...';
  btn.disabled = true;

  try {
    // Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: 'POST', body: formData
    });
    if (!uploadRes.ok) throw new Error('上传失败');
    const uploadData = await uploadRes.json();
    const url = uploadData.secure_url;

    // Save to JSONBin
    const photo = {
      id: Date.now(),
      url,
      author: nickname,
      desc,
      lat,
      lng,
      time: new Date().toLocaleString('zh-CN')
    };

    const getRes = await fetch(`${JSONBIN_API}/b/${binId}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const getData = await getRes.json();
    const photos = getData.record?.photos || [];
    photos.push(photo);

    await fetch(`${JSONBIN_API}/b/${binId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify({ roomCode, photos })
    });

    closeUpload();
    await loadPhotos();
    showPage('map');
    if (map && lat && lng) map.setView([lat, lng], 16);

  } catch(e) {
    alert('发布失败，请重试：' + e.message);
  } finally {
    btn.textContent = '发布 🎉';
    btn.disabled = false;
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
  grid.innerHTML = allPhotos.map(p => `
    <div class="wall-item" onclick="openPhoto(${JSON.stringify(p).replace(/"/g, '&quot;')})">
      <img src="${p.url}" loading="lazy" alt="${p.desc || ''}"/>
      <div class="wall-item-info">
        <span class="wall-author" style="color:${getUserColor(p.author)}">${p.author}</span>
        <span class="wall-desc">${p.desc || ''}</span>
      </div>
    </div>
  `).join('');
}

function generateWall() {
  renderWall();
  document.querySelector('.btn-gen-wall').textContent = '✅ 已生成！';
  setTimeout(() => document.querySelector('.btn-gen-wall').textContent = '✨ 生成照片墙', 2000);
}

function openPhoto(photo) {
  document.getElementById('detail-img').src = photo.url;
  document.getElementById('detail-author').textContent = photo.author;
  document.getElementById('detail-desc').textContent = photo.desc || '';
  document.getElementById('detail-time').textContent = photo.time || '';
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhoto() {
  document.getElementById('photo-modal').classList.add('hidden');
}

// ============================================================
// Pages
// ============================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.remove('hidden');
  const tabs = document.querySelectorAll('.tab-btn');
  if (name === 'map') tabs[0].classList.add('active');
  if (name === 'wall') { tabs[1].classList.add('active'); renderWall(); }
  if (map) setTimeout(() => map.invalidateSize(), 100);
}

// ============================================================
// Auto wall at 23:00
// ============================================================
function checkAutoWall() {
  const now = new Date();
  if (now.getHours() === 23 && now.getMinutes() === 0) generateWall();
}
setInterval(checkAutoWall, 60000);
