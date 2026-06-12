// ============================================================
// Config
// ============================================================
const JSONBIN_KEY = '$2a$10$QBi9BI/.1Np6zFQ1Mde./.G1S1QLi.auetF.iFlXyNpCi.Ib3jDaO';
const JSONBIN_BIN_KEY = 'color_walking_bin_id'; // localStorage key for bin id
const CLOUDINARY_CLOUD = 'Danyi';
const CLOUDINARY_PRESET = 'color_walking'; // unsigned upload preset (需要在Cloudinary设置)

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
const COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf','#ff8b94','#b4a7d6'];

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadPhotos();
  checkAutoWall();
});

// ============================================================
// Map
// ============================================================
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([31.2304, 121.4737], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CartoDB',
    maxZoom: 19
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
  const color = getUserColor(photo.name);
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid ${color};overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
      <img src="${photo.url}" style="width:100%;height:100%;object-fit:cover;transform:rotate(45deg)" />
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44]
  });

  const timeStr = new Date(photo.timestamp).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
  const marker = L.marker([photo.lat, photo.lng], {icon}).addTo(map);
  marker.bindPopup(`
    <img src="${photo.url}" class="popup-img" onclick="openPhotoDetail('${photo.id}')" />
    <div class="popup-name">${photo.name}</div>
    <div class="popup-caption">${photo.caption || ''}</div>
    <div class="popup-time">${timeStr}</div>
  `);
  markers.push(marker);
}

function renderAllMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  allPhotos.forEach(addMarker);
  if (allPhotos.length > 0 && allPhotos[0].lat) {
    map.setView([allPhotos[0].lat, allPhotos[0].lng], 14);
  }
}

// ============================================================
// JSONBin - 数据持久化
// ============================================================
async function getBinId() {
  let binId = localStorage.getItem(JSONBIN_BIN_KEY);
  if (binId) return binId;

  // 创建新bin
  const res = await fetch('https://api.jsonbin.io/v3/b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_KEY,
      'X-Bin-Name': 'color-walking-photos',
      'X-Bin-Private': 'false'
    },
    body: JSON.stringify({ photos: [] })
  });
  const data = await res.json();
  binId = data.metadata.id;
  localStorage.setItem(JSONBIN_BIN_KEY, binId);
  return binId;
}

async function loadPhotos() {
  try {
    const binId = await getBinId();
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    allPhotos = data.record.photos || [];
    document.getElementById('photo-count').textContent = allPhotos.length;
    renderAllMarkers();
    renderWall();
  } catch(e) {
    console.error('加载失败', e);
  }
}

async function savePhotos() {
  const binId = await getBinId();
  await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_KEY
    },
    body: JSON.stringify({ photos: allPhotos })
  });
}

// ============================================================
// Cloudinary 上传
// ============================================================
async function uploadToCloudinary(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', 'color-walking');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 80));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } else {
        reject(new Error('上传失败'));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`);
    xhr.send(formData);
  });
}

// ============================================================
// EXIF GPS 读取
// ============================================================
function getGPSFromEXIF(file) {
  return new Promise((resolve) => {
    EXIF.getData(file, function() {
      const lat = EXIF.getTag(this, 'GPSLatitude');
      const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
      const lng = EXIF.getTag(this, 'GPSLongitude');
      const lngRef = EXIF.getTag(this, 'GPSLongitudeRef');
      if (lat && lng) {
        const toDecimal = (arr) => arr[0] + arr[1]/60 + arr[2]/3600;
        let latitude = toDecimal(lat);
        let longitude = toDecimal(lng);
        if (latRef === 'S') latitude = -latitude;
        if (lngRef === 'W') longitude = -longitude;
        resolve({ lat: latitude, lng: longitude });
      } else {
        resolve(null);
      }
    });
  });
}

// ============================================================
// Upload Modal
// ============================================================
function openUpload() {
  document.getElementById('upload-modal').classList.add('active');
  resetUploadForm();
}

function closeUpload(e) {
  if (e.target === document.getElementById('upload-modal')) closeUploadDirect();
}

function closeUploadDirect() {
  document.getElementById('upload-modal').classList.remove('active');
  resetUploadForm();
}

function resetUploadForm() {
  document.getElementById('upload-area').style.display = 'block';
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('manual-loc-area').style.display = 'none';
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('uploader-name').value = localStorage.getItem('user_name') || '';
  document.getElementById('photo-caption').value = '';
  document.getElementById('submit-btn').disabled = false;
  currentFile = null; currentLat = null; currentLng = null;
  manualLat = null; manualLng = null;
}

async function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentFile = file;

  // 预览
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('upload-area').style.display = 'none';
    document.getElementById('preview-area').style.display = 'block';
  };
  reader.readAsDataURL(file);

  // 读取EXIF GPS
  document.getElementById('loc-text').textContent = '正在读取GPS信息...';
  const gps = await getGPSFromEXIF(file);
  if (gps) {
    currentLat = gps.lat;
    currentLng = gps.lng;
    document.getElementById('loc-text').textContent = `📍 ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`;
  } else {
    // 尝试浏览器定位
    document.getElementById('loc-text').textContent = '照片无GPS，尝试获取当前位置...';
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        currentLat = pos.coords.latitude;
        currentLng = pos.coords.longitude;
        document.getElementById('loc-text').textContent = `📍 当前位置 ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`;
      },
      () => {
        document.getElementById('loc-text').textContent = '无法自动获取位置，请手动标记';
      }
    );
  }
}

function openManualLocation() {
  document.getElementById('manual-loc-area').style.display = 'block';
  setTimeout(() => {
    if (!miniMap) {
      const center = currentLat ? [currentLat, currentLng] : [31.2304, 121.4737];
      miniMap = L.map('mini-map').setView(center, 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(miniMap);
      let tempMarker;
      miniMap.on('click', (e) => {
        manualLat = e.latlng.lat;
        manualLng = e.latlng.lng;
        if (tempMarker) miniMap.removeLayer(tempMarker);
        tempMarker = L.marker([manualLat, manualLng]).addTo(miniMap);
        document.getElementById('manual-loc-text').textContent = `✅ 已选择：${manualLat.toFixed(4)}, ${manualLng.toFixed(4)}`;
        document.getElementById('loc-text').textContent = `📍 手动标记 ${manualLat.toFixed(4)}, ${manualLng.toFixed(4)}`;
      });
    }
    miniMap.invalidateSize();
  }, 100);
}

async function submitPhoto() {
  const name = document.getElementById('uploader-name').value.trim();
  if (!name) { alert('请填写你的名字 😊'); return; }
  if (!currentFile) { alert('请先选择照片'); return; }

  const lat = manualLat || currentLat;
  const lng = manualLng || currentLng;

  localStorage.setItem('user_name', name);

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('upload-progress').style.display = 'block';

  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');

  try {
    text.textContent = '上传照片中...';
    const url = await uploadToCloudinary(currentFile, (p) => {
      fill.style.width = p + '%';
    });

    fill.style.width = '90%';
    text.textContent = '保存位置信息...';

    const photo = {
      id: Date.now().toString(),
      name,
      caption: document.getElementById('photo-caption').value.trim(),
      url,
      lat, lng,
      timestamp: new Date().toISOString()
    };

    allPhotos.unshift(photo);
    await savePhotos();

    fill.style.width = '100%';
    text.textContent = '发布成功！🎉';

    addMarker(photo);
    document.getElementById('photo-count').textContent = allPhotos.length;
    renderWall();

    setTimeout(() => {
      closeUploadDirect();
      if (lat && lng) map.setView([lat, lng], 16);
    }, 1000);

  } catch(e) {
    text.textContent = '上传失败，请重试 😢';
    document.getElementById('submit-btn').disabled = false;
    console.error(e);
  }
}

// ============================================================
// Photo Detail
// ============================================================
function openPhotoDetail(id) {
  const photo = allPhotos.find(p => p.id === id);
  if (!photo) return;
  document.getElementById('detail-img').src = photo.url;
  document.getElementById('detail-name').textContent = '📸 ' + photo.name;
  document.getElementById('detail-caption').textContent = photo.caption || '';
  document.getElementById('detail-time').textContent = new Date(photo.timestamp).toLocaleString('zh-CN');
  document.getElementById('detail-loc').textContent = photo.lat ? `📍 ${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}` : '📍 位置未知';
  document.getElementById('photo-modal').classList.add('active');
}

function closePhotoModal(e) {
  if (e.target === document.getElementById('photo-modal')) closePhotoModalDirect();
}
function closePhotoModalDirect() {
  document.getElementById('photo-modal').classList.remove('active');
}

// ============================================================
// Photo Wall
// ============================================================
function renderWall() {
  const wall = document.getElementById('photo-wall');
  if (allPhotos.length === 0) {
    wall.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.3);margin-top:3rem">还没有照片，快去上传第一张吧 📸</p>';
    return;
  }
  wall.innerHTML = allPhotos.map(photo => `
    <div class="wall-item" onclick="openPhotoDetail('${photo.id}')">
      <img src="${photo.url}" alt="${photo.name}" loading="lazy"/>
      <div class="wall-item-info">
        <div class="wall-item-name">${photo.name}</div>
        ${photo.caption ? `<div class="wall-item-caption">${photo.caption}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function generateWall() {
  renderWall();
  showPage('wall');
}

// ============================================================
// 每天23点自动生成照片墙
// ============================================================
function checkAutoWall() {
  const now = new Date();
  const todayKey = now.toDateString();
  const lastGenerated = localStorage.getItem('wall_generated_date');

  if (now.getHours() >= 23 && lastGenerated !== todayKey) {
    localStorage.setItem('wall_generated_date', todayKey);
    generateWall();
    // 提示
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#4ecdc4;color:#000;padding:0.6rem 1.2rem;border-radius:20px;font-size:0.85rem;font-weight:600;z-index:9999';
    toast.textContent = '🖼️ 今日照片墙已自动生成！';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // 每分钟检查一次
  setTimeout(checkAutoWall, 60000);
}

// ============================================================
// Page Navigation
// ============================================================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[onclick="showPage('${page}')"]`).classList.add('active');

  if (page === 'map') setTimeout(() => map.invalidateSize(), 100);
}
