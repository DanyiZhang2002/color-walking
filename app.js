// ============================================================
// Config
// ============================================================
const JSONBIN_KEY = '$2a$10$QBi9BI/.1Np6zFQ1Mde./.G1S1QLi.auetF.iFlXyNpCi.Ib3jDaO';
const SHARED_BIN = '6a2bedb5f5f4af5e29e5db66';
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

// Random anonymous name per session
const ANON_NAMES = ['🌸小花','🌈彩虹','🦋蝴蝶','🌙月亮','⭐星星','🍀幸运草','🎨画家','🌊海浪','🌺玫瑰','🦊小狐'];
const nickname = localStorage.getItem('cw_nick') || ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)];
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
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:44px;height:44px;border-radius:50% 50% 50% 0;background:${color};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35);transform:rotate(-45deg);cursor:pointer;overflow:hidden;">
      <img src="${photo.url}" style="width:100%;height:100%;object-fit:cover;transform:rotate(45deg);" onerror="this.style.display='none'"/>
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
  } catch(e) { console.error('加载失败', e); }
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
  grid.innerHTML = allPhotos.map(p => `
    <div class="wall-item" onclick='openPhoto(${JSON.stringify(p)})'>
      <img src="${p.url}" loading="lazy" alt=""/>
      <div class="wall-item-info">
        <span class="wall-author" style="color:${getUserColor(p.author)}">${p.author}</span>
        <span class="wall-desc">${p.desc || ''}</span>
      </div>
    </div>
  `).join('');
}

function generateWall() {
  renderWall();
  const btn = document.querySelector('.btn-gen-wall');
  btn.textContent = '✅ 已生成！';
  setTimeout(() => btn.textContent = '✨ 生成照片墙', 2000);
}

function openPhoto(photo) {
  if (typeof photo === 'string') photo = JSON.parse(photo);
  document.getElementById('detail-img').src = photo.url;
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
  if (name === 'map') { tabs[0].classList.add('active'); setTimeout(() => map && map.invalidateSize(), 100); }
  if (name === 'wall') { tabs[1].classList.add('active'); renderWall(); }
}

// Auto wall at 23:00
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 23 && now.getMinutes() === 0) generateWall();
}, 60000);
