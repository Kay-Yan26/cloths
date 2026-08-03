/* script.js - 完整版（集成：上传抠图 / 画布 / 持久化衣柜 + 智能衣橱 / AI 模拟 / 全屏 / 导出 / 录制 / 分享 / 手机模式） */

/* Utilities */
function escapeHtml(s){ if(typeof s!=='string') return s; return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
function clamp(v,a,b){ return Math.min(Math.max(v,a),b); }

/* Exposed global state */
window.currentCutoutData = window.currentCutoutData ?? null;
window.unboundedPreview = window.unboundedPreview ?? false;
window.fullscreenOpen = window.fullscreenOpen ?? false;

/* Config keys */
const WARDROBE_KEY = 'wardrobe_items_v1';
const SMART_WARDROBE_KEY = '智能衣橱';

/* LocalStorage helpers */
function loadWardrobeItems(){ try{ const raw = localStorage.getItem(WARDROBE_KEY); return raw ? JSON.parse(raw) : []; }catch(e){ console.warn('loadWardrobeItems', e); return []; } }
function saveWardrobeItems(items){ try{ localStorage.setItem(WARDROBE_KEY, JSON.stringify(items)); }catch(e){ console.warn('saveWardrobeItems', e); } }

function loadSmartWardrobe(){ try{ const raw = localStorage.getItem(SMART_WARDROBE_KEY); return raw ? JSON.parse(raw) : []; }catch(e){ console.warn('loadSmartWardrobe', e); return []; } }
function saveSmartWardrobe(arr){ try{ localStorage.setItem(SMART_WARDROBE_KEY, JSON.stringify(arr)); }catch(e){ console.warn('saveSmartWardrobe', e); } }
function addSmartWardrobeEntry(entry){ const arr = loadSmartWardrobe(); arr.unshift(entry); saveSmartWardrobe(arr); }

/* UI helpers */
window.toggleMenu = function(){
  const drawer=document.getElementById('sideDrawer'), overlay=document.getElementById('drawerOverlay');
  if(!drawer||!overlay) return;
  const open=!drawer.classList.contains('-translate-x-full');
  if(open){ drawer.classList.add('-translate-x-full'); drawer.setAttribute('aria-hidden','true'); overlay.classList.add('hidden'); }
  else { drawer.classList.remove('-translate-x-full'); drawer.setAttribute('aria-hidden','false'); overlay.classList.remove('hidden'); }
};

window.fetchHKOWeather = async function(){
  const weatherText=document.getElementById('hkoWeatherText'); if(!weatherText) return;
  try{
    const res = await fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc',{cache:'no-store'});
    const data = await res.json();
    const temp = data?.temperature?.data?.[0]?.value ?? data?.temperature?.value ?? null;
    let warning = null;
    if(Array.isArray(data?.warningMessage) && data.warningMessage.length) warning = data.warningMessage[0];
    else if(typeof data?.warningMessage === 'string') warning = data.warningMessage;
    if(temp !== null){
      const warnText = warning && typeof warning === 'string' ? warning : '晴/多云';
      const displayedWarn = warnText.length > 12 ? warnText.slice(0,12) + '…' : warnText;
      weatherText.textContent = `香港 ${Math.round(temp)}°C ${displayedWarn}`;
    } else weatherText.textContent = '香港 26°C 晴/微风';
  } catch (err) {
    console.warn('fetchHKOWeather error', err);
    weatherText.textContent = '香港 26°C 晴/微风';
  }
};

window.changeCanvasBg = function(color){ const c=document.getElementById('canvasArea'); if(c) c.style.backgroundColor = color; };

/* Upload / Accurate Cutout */
window.handleAccurateCutoutUpload = function(e){
  const file = e?.target?.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(event){
    const img = new Image();
    img.onload = function(){
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r > 215 && g > 215 && b > 215) data[i+3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);
        window.currentCutoutData = canvas.toDataURL('image/png');
      } catch (err) {
        console.warn('handleAccurateCutoutUpload getImageData failed', err);
        window.currentCutoutData = event.target.result;
      }
      const previewImg = document.getElementById('uploadPreviewImg');
      const previewContainer = document.getElementById('uploadPreviewContainer');
      if(previewImg) previewImg.src = window.currentCutoutData;
      if(previewContainer) previewContainer.classList.remove('hidden');
    };
    img.onerror = function(){ console.warn('uploaded image load error'); };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

/* Wardrobe UI & persistence */
function createClothCard(item){
  const card = document.createElement('div');
  card.className = "item-card min-w-[70px] h-20 bg-slate-50 border rounded-xl flex flex-col items-center justify-center cursor-pointer transition p-2 relative";
  card.title = item.name || '';
  card.onclick = () => window.addClothToCanvas(item.src || '👕', item.name || '衣物', !!item.src);

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'text-xs absolute top-1 right-1 text-red-500 bg-white/80 rounded-full px-[6px] py-[2px] hidden';
  del.onclick = (ev) => { ev.stopPropagation(); if(confirm(`删除 “${item.name}”？`)){ deleteWardrobeItem(item.id); } };
  card.appendChild(del);
  card.addEventListener('mouseenter', ()=> del.style.display='block');
  card.addEventListener('mouseleave', ()=> del.style.display='none');

  if(item.src){
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.name || '';
    img.className = 'h-10 object-contain';
    card.appendChild(img);
    const label = document.createElement('span');
    label.className = 'text-[10px] text-slate-600 mt-0.5 truncate w-full text-center';
    label.textContent = item.name || '';
    card.appendChild(label);
  } else {
    card.innerHTML = `<span class="text-2xl">👕</span><span class="text-[10px] text-slate-600 mt-0.5 truncate w-full text-center">${escapeHtml(item.name||'衣物')}</span>`;
  }
  return card;
}

function renderWardrobeItems(){
  const items = loadWardrobeItems();
  const grids = {
    tops: document.getElementById('grid-tops'),
    bottoms: document.getElementById('grid-bottoms'),
    shoes: document.getElementById('grid-shoes'),
    accessories: document.getElementById('grid-accessories'),
    outers: document.getElementById('grid-outers')
  };
  Object.values(grids).forEach(g=>{
    if(!g) return;
    Array.from(g.querySelectorAll('[data-persist="true"]')).forEach(n=>n.remove());
  });
  items.slice().sort((a,b)=> (b.created||0)-(a.created||0)).forEach(item=>{
    const grid = grids[item.category];
    if(grid){
      const card = createClothCard(item);
      card.setAttribute('data-persist','true');
      grid.prepend(card);
    }
  });
}

function deleteWardrobeItem(id){
  let items = loadWardrobeItems();
  items = items.filter(i => i.id !== id);
  saveWardrobeItems(items);
  renderWardrobeItems();
}

/* Save single cloth: wardrobe + smart wardrobe */
window.saveClothItem = function(e){
  if(e && e.preventDefault) e.preventDefault();
  const nameEl = document.getElementById('clothName');
  const name = nameEl ? nameEl.value.trim() : '';
  if(!name){ alert('请填写衣物名称'); return; }
  const checked = document.querySelector('input[name="clothCategory"]:checked');
  if(!checked){ alert('请选择衣物分类'); return; }
  const category = checked.value;
  const colorEl = document.getElementById('clothColor');
  const color = colorEl ? colorEl.value.trim() : '';

  const newItem = {
    id: 'w_' + Date.now().toString(36),
    name: name,
    category: category,
    color: color || null,
    src: window.currentCutoutData || null,
    created: Date.now()
  };

  // save to wardrobe
  try{
    const items = loadWardrobeItems();
    items.unshift(newItem);
    saveWardrobeItems(items);
  }catch(err){
    console.warn('save to wardrobe failed', err);
  }

  // also add to smart wardrobe
  try{
    const smartEntry = {
      id: 's_' + Date.now().toString(36),
      name: newItem.name,
      category: newItem.category,
      color: newItem.color,
      src: newItem.src,
      created: Date.now(),
      source: 'user'
    };
    addSmartWardrobeEntry(smartEntry);
  }catch(err){
    console.warn('addSmartWardrobeEntry failed', err);
  }

  // update UI
  const grid = document.getElementById(`grid-${category}`);
  if(grid){
    const card = createClothCard(newItem);
    card.setAttribute('data-persist','true');
    grid.prepend(card);
  }

  // reset UI
  const clothForm = document.getElementById('clothForm');
  if(clothForm && typeof clothForm.reset === 'function') clothForm.reset();
  const previewContainer = document.getElementById('uploadPreviewContainer');
  if(previewContainer) previewContainer.classList.add('hidden');
  window.currentCutoutData = null;
  alert(`已成功保存 “${name}” 并添加到衣柜与智能衣橱（已持久保存）！`);
};

/* Canvas creation & interactions */
window.addClothToCanvas = function(content, name, isImg = false) {
  const canvasArea = document.getElementById('canvasArea');
  if(!canvasArea) { alert('未找到画布区域'); return; }
  const canvasHint = document.getElementById('canvasHint'); if(canvasHint) canvasHint.classList.add('hidden');

  const wrapper = document.createElement('div');
  wrapper.className = "canvas-item";
  wrapper.style.position = 'absolute';
  const rect = canvasArea.getBoundingClientRect();
  const initialLeftPx = Math.max(6, Math.round(rect.width * 0.35));
  const initialTopPx = Math.max(6, Math.round(rect.height * 0.25));
  wrapper.style.left = initialLeftPx + 'px';
  wrapper.style.top = initialTopPx + 'px';
  wrapper.style.touchAction = 'none';

  let scale = 1;
  let angle = 0;
  wrapper.dataset.scale = scale;
  wrapper.dataset.rotate = angle;
  wrapper.style.transform = `rotate(${angle}deg) scale(${scale})`;

  if (isImg) {
    wrapper.innerHTML = `<img src="${content}" class="h-28 object-contain pointer-events-none" alt="${escapeHtml(name)}"/>`;
  } else {
    wrapper.innerHTML = `<span class="text-6xl pointer-events-none">${escapeHtml(content)}</span>`;
  }

  // delete
  const deleteBtn = document.createElement('button');
  deleteBtn.className = "delete-btn";
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = "✕";
  deleteBtn.onclick = (ev) => { ev.stopPropagation(); wrapper.remove(); };
  wrapper.appendChild(deleteBtn);

  // handles
  const rotateHandle = document.createElement('div'); rotateHandle.className = 'handle rotate-handle';
  rotateHandle.innerHTML = '<i class="fa-solid fa-rotate-right" style="font-size:10px;color:#4b5563"></i>';
  wrapper.appendChild(rotateHandle);
  const scaleHandle = document.createElement('div'); scaleHandle.className = 'handle scale-handle';
  scaleHandle.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center" style="font-size:10px;color:#4b5563"></i>';
  wrapper.appendChild(scaleHandle);

  function getEventClientXY(ev) {
    if (!ev) return {x:0,y:0};
    if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') return {x: ev.clientX, y: ev.clientY};
    const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]);
    if (t) return {x: t.clientX, y: t.clientY};
    return {x:0,y:0};
  }

  // dragging
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
  function onPointerDown(e) {
    if (e.target && e.target.classList && e.target.classList.contains('delete-btn')) return;
    const pt = getEventClientXY(e);
    isDragging = true;
    startX = pt.x; startY = pt.y;
    initialLeft = wrapper.offsetLeft; initialTop = wrapper.offsetTop;
    wrapper.style.zIndex = 9999;
    window.addEventListener('pointermove', onPointerMove, {passive:false});
    window.addEventListener('pointerup', onPointerUp);
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onPointerMove(e) {
    if (!isDragging) return;
    const pt = getEventClientXY(e);
    const dx = pt.x - startX; const dy = pt.y - startY;
    let newLeft = initialLeft + dx; let newTop = initialTop + dy;
    if (!window.unboundedPreview) {
      const wrapperRect = wrapper.getBoundingClientRect();
      const areaRect = canvasArea.getBoundingClientRect();
      const maxLeft = Math.max(0, areaRect.width - wrapperRect.width);
      const maxTop = Math.max(0, areaRect.height - wrapperRect.height);
      newLeft = clamp(newLeft, 0, maxLeft);
      newTop = clamp(newTop, 0, maxTop);
    }
    wrapper.style.left = newLeft + 'px';
    wrapper.style.top = newTop + 'px';
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onPointerUp() {
    isDragging = false;
    wrapper.style.zIndex = 1000;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  wrapper.addEventListener('pointerdown', onPointerDown);
  wrapper.addEventListener('touchstart', onPointerDown, {passive:false});

  // wheel zoom
  function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY || -e.wheelDelta || 0;
    const factor = Math.pow(1.0015, delta);
    scale = parseFloat(wrapper.dataset.scale) || 1;
    scale = clamp(scale * factor, 0.2, 3);
    wrapper.dataset.scale = scale;
    wrapper.style.transform = `rotate(${angle}deg) scale(${scale})`;
  }
  wrapper.addEventListener('wheel', onWheel, {passive:false});

  // touch pinch
  let pinch = {active:false, startDist:0, startScale:1};
  function getTouchDist(touches) {
    if (!touches || touches.length < 2) return 0;
    const t1 = touches[0], t2 = touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(e) {
    if (!e.touches) return;
    if (e.touches.length === 2) {
      pinch.active = true;
      pinch.startDist = getTouchDist(e.touches);
      pinch.startScale = parseFloat(wrapper.dataset.scale) || 1;
      e.preventDefault();
    }
  }
  function onTouchMove(e) {
    if (!pinch.active) return;
    if (e.touches && e.touches.length === 2) {
      const dist = getTouchDist(e.touches);
      if (pinch.startDist > 0) {
        let newScale = pinch.startScale * (dist / pinch.startDist);
        newScale = clamp(newScale, 0.2, 3);
        scale = newScale;
        wrapper.dataset.scale = scale;
        wrapper.style.transform = `rotate(${angle}deg) scale(${scale})`;
      }
      e.preventDefault();
    }
  }
  function onTouchEnd(e) {
    if (pinch.active && (!e.touches || e.touches.length < 2)) {
      pinch.active = false;
    }
  }
  wrapper.addEventListener('touchstart', onTouchStart, {passive:false});
  window.addEventListener('touchmove', onTouchMove, {passive:false});
  window.addEventListener('touchend', onTouchEnd);

  // scale handle pointer flow
  let resizing = false, rStartDist = 0, rStartScale = 1, rCenter = {x:0,y:0};
  function onScalePointerDown(e){
    e.stopPropagation();
    resizing = true;
    const rect = wrapper.getBoundingClientRect();
    rCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    const p = getEventClientXY(e);
    rStartDist = Math.hypot(p.x - rCenter.x, p.y - rCenter.y);
    rStartScale = parseFloat(wrapper.dataset.scale) || 1;
    window.addEventListener('pointermove', onScalePointerMove, {passive:false});
    window.addEventListener('pointerup', onScalePointerUp);
    if(e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onScalePointerMove(e){
    if(!resizing) return;
    const p = getEventClientXY(e);
    const curDist = Math.hypot(p.x - rCenter.x, p.y - rCenter.y);
    if (rStartDist === 0) return;
    let ns = rStartScale * (curDist / rStartDist);
    ns = clamp(ns, 0.2, 3);
    scale = ns;
    wrapper.dataset.scale = scale;
    wrapper.style.transform = `rotate(${angle}deg) scale(${scale})`;
    if(e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onScalePointerUp(){
    resizing = false;
    window.removeEventListener('pointermove', onScalePointerMove);
    window.removeEventListener('pointerup', onScalePointerUp);
  }
  scaleHandle.addEventListener('pointerdown', onScalePointerDown, {passive:false});

  // rotate handle pointer flow
  let rotating = false, rotStartAngle = 0, rotStartDeg = 0, rotCenter = {x:0,y:0};
  function onRotatePointerDown(e){
    e.stopPropagation();
    rotating = true;
    const rect = wrapper.getBoundingClientRect();
    rotCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    const p = getEventClientXY(e);
    rotStartAngle = Math.atan2(p.y - rotCenter.y, p.x - rotCenter.x);
    rotStartDeg = parseFloat(wrapper.dataset.rotate) || 0;
    window.addEventListener('pointermove', onRotatePointerMove, {passive:false});
    window.addEventListener('pointerup', onRotatePointerUp);
    if(e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onRotatePointerMove(e){
    if(!rotating) return;
    const p = getEventClientXY(e);
    const ang = Math.atan2(p.y - rotCenter.y, p.x - rotCenter.x);
    let deg = rotStartDeg + (ang - rotStartAngle) * 180 / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    angle = deg;
    wrapper.dataset.rotate = angle;
    wrapper.style.transform = `rotate(${angle}deg) scale(${scale})`;
    if(e && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onRotatePointerUp(){
    rotating = false;
    window.removeEventListener('pointermove', onRotatePointerMove);
    window.removeEventListener('pointerup', onRotatePointerUp);
  }
  rotateHandle.addEventListener('pointerdown', onRotatePointerDown, {passive:false});

  document.getElementById('canvasArea').appendChild(wrapper);
};

/* Avatar preview */
window.previewAvatar = function(e){
  const file = e?.target?.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt){
    const imgEl = document.getElementById('avatarImage');
    const placeholder = document.getElementById('avatarPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');
    if (imgEl) { imgEl.src = evt.target.result; imgEl.classList.remove('hidden'); }
  };
  reader.readAsDataURL(file);
};

/* Fullscreen / Export / Record / Share */
window.openFullScreenPreview = function(){
  if(window.fullscreenOpen) return;
  const overlay = document.createElement('div'); overlay.className = 'fullscreen-overlay'; overlay.id = 'fullscreenOverlay';
  const card = document.createElement('div'); card.className = 'fullscreen-card';
  const toolbar = document.createElement('div'); toolbar.className = 'fullscreen-toolbar';
  toolbar.innerHTML = `<div class="text-sm font-semibold">全屏试衣预览</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="fs-btn" onclick="exportFullscreenPNG()">导出 PNG</button>
      <button class="fs-btn" id="recordBtn" onclick="recordFullscreenVideo()">录制 3s 视频</button>
      <button class="fs-btn" onclick="saveCurrentOutfit()">保存穿搭</button>
      <button class="fs-btn" id="toggleUnboundedBtn" onclick="toggleUnboundedPreview()">不受限预览：关</button>
      <button class="fs-btn" onclick="shareFullscreen()">分享</button>
      <button class="fs-btn fs-close" onclick="closeFullScreenPreview()">关闭</button>
    </div>`;
  card.appendChild(toolbar);
  const fsCanvas = document.createElement('div'); fsCanvas.className = 'fullscreen-canvas'; fsCanvas.id = 'fullscreenCanvas';
  const bottomShade = document.createElement('div'); bottomShade.className = 'fullscreen-bottom-shade';
  const hint = document.createElement('div'); hint.className = 'gesture-hint'; hint.id = 'gestureHint';
  hint.innerHTML = `<div class="dot"><i class="fa-solid fa-hand-fingers-swipe"></i></div><div><div style="font-weight:700">手势提示</div><div style="opacity:.9;font-size:13px">拖拽移动 · 双指捏合缩放 · 旋转手柄旋转</div></div>`;
  card.appendChild(fsCanvas); card.appendChild(bottomShade); overlay.appendChild(card); overlay.appendChild(hint);
  document.body.appendChild(overlay);

  const canvasArea = document.getElementById('canvasArea');
  const origRect = canvasArea.getBoundingClientRect();
  const maxW = Math.min(window.innerWidth, 900);
  const maxH = window.innerHeight - 56;
  fsCanvas.style.width = maxW + 'px';
  fsCanvas.style.height = maxH + 'px';
  card.style.width = maxW + 'px';
  card.style.height = maxH + 'px';
  const fsRect = fsCanvas.getBoundingClientRect();
  const scaleX = fsRect.width / origRect.width;
  const scaleY = fsRect.height / origRect.height;

  window.savedCanvasState = { origRect: origRect, parent: canvasArea };

  const items = Array.from(canvasArea.querySelectorAll('.canvas-item'));
  items.forEach(item => {
    const itemRect = item.getBoundingClientRect();
    const relLeft = itemRect.left - origRect.left;
    const relTop  = itemRect.top  - origRect.top;
    item.style.left = (relLeft * scaleX) + 'px';
    item.style.top  = (relTop  * scaleY) + 'px';
    fsCanvas.appendChild(item);
  });

  fsCanvas.querySelectorAll('.handle').forEach(h => { h.style.width = '34px'; h.style.height = '34px'; h.style.boxShadow = '0 8px 28px rgba(2,6,23,0.12)'; });

  const seenHint = localStorage.getItem('wardrobe_gesture_hint_shown');
  if(!seenHint){ showGestureHintTemporarily(); localStorage.setItem('wardrobe_gesture_hint_shown','1'); }

  window.fullscreenOpen = true;
  updateUnboundedButton();
};

window.closeFullScreenPreview = function(){
  if(!window.fullscreenOpen) return;
  const overlay = document.getElementById('fullscreenOverlay');
  if(!overlay) return;
  const fsCanvas = document.getElementById('fullscreenCanvas');
  const canvasArea = window.savedCanvasState?.parent || document.getElementById('canvasArea');
  const origRect = window.savedCanvasState?.origRect || canvasArea.getBoundingClientRect();
  const fsRect = fsCanvas.getBoundingClientRect();
  const scaleX = origRect.width / fsRect.width;
  const scaleY = origRect.height / fsRect.height;

  const items = Array.from(fsCanvas.querySelectorAll('.canvas-item'));
  items.forEach(item => {
    const itemRect = item.getBoundingClientRect();
    const relLeft_fs = itemRect.left - fsRect.left;
    const relTop_fs  = itemRect.top - fsRect.top;
    const newLeft = relLeft_fs * scaleX;
    const newTop  = relTop_fs  * scaleY;
    item.style.left = newLeft + 'px';
    item.style.top = newTop + 'px';
    item.querySelectorAll('.handle').forEach(h => { h.style.width='24px'; h.style.height='24px'; h.style.boxShadow='0 6px 18px rgba(2,6,23,0.08)'; });
    canvasArea.appendChild(item);
  });

  overlay.remove();
  window.fullscreenOpen = false;
};

function showGestureHintTemporarily(){
  const hint = document.getElementById('gestureHint');
  if(!hint) return;
  hint.style.animation = 'hintIn .5s ease forwards';
  hint.style.opacity = '1';
  setTimeout(()=>{ hint.style.animation = 'hintOut .4s ease forwards'; }, 3000);
}

window.toggleUnboundedPreview = function(){ window.unboundedPreview = !window.unboundedPreview; updateUnboundedButton(); alert('不受限预览已 ' + (window.unboundedPreview ? '开启（可将单品拖出画布）' : '关闭（恢复边界限制）')); }
function updateUnboundedButton(){ const btn = document.getElementById('toggleUnboundedBtn'); if(btn) btn.textContent = '不受限预览：' + (window.unboundedPreview ? '开' : '关'); }

/* Export / Record / Share */
window.exportFullscreenPNG = async function(){
  const fsCanvas = document.getElementById('fullscreenCanvas');
  const target = fsCanvas ? fsCanvas : document.getElementById('canvasArea');
  try{
    const opt = { backgroundColor: null, useCORS: true, scale: 2 };
    const canvas = await html2canvas(target, opt);
    canvas.toBlob((blob)=>{
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'outfit.png'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }, 'image/png');
  }catch(err){
    console.warn('exportFullscreenPNG error', err);
    alert('导出失败，请稍后重试');
  }
};

window.recordFullscreenVideo = async function(){
  const duration = 3000; const fps = 10; const frames = Math.round(duration/1000*fps);
  const fsCanvas = document.getElementById('fullscreenCanvas'); const target = fsCanvas ? fsCanvas : document.getElementById('canvasArea');
  const rect = target.getBoundingClientRect();
  const off = document.createElement('canvas'); off.width = rect.width; off.height = rect.height;
  const ctx = off.getContext('2d');
  const stream = off.captureStream(fps); const recorded = []; const mime = 'video/webm; codecs=vp9';
  const rec = new MediaRecorder(stream, { mimeType: mime }); rec.ondataavailable = e => { if(e.data && e.data.size) recorded.push(e.data); };
  rec.start();
  for(let i=0;i<frames;i++){ const c = await html2canvas(target, { backgroundColor:null, useCORS:true, width:rect.width, height:rect.height, scale:1 }); ctx.clearRect(0,0,off.width,off.height); ctx.drawImage(c,0,0,off.width,off.height); await new Promise(r=>setTimeout(r,1000/fps)); }
  rec.stop();
  rec.onstop = ()=>{ const blob = new Blob(recorded, { type: 'video/webm' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='outfit-record.webm'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
};

window.shareFullscreen = async function(){
  try{
    const fsCanvas = document.getElementById('fullscreenCanvas'); const target = fsCanvas ? fsCanvas : document.getElementById('canvasArea');
    const canvas = await html2canvas(target, { backgroundColor: null, useCORS:true, scale:2 });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if(navigator.canShare && navigator.canShare({ files: [ new File([blob], 'outfit.png', { type:'image/png' }) ] })){
      await navigator.share({ files: [ new File([blob], 'outfit.png', { type:'image/png' }) ], title:'我的穿搭', text:'分享一套搭配' });
    } else {
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'outfit.png'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); alert('当前设备不支持直接分享，已为你下载图片。');
    }
  }catch(err){
    console.warn('shareFullscreen err', err);
    alert('分享失败或不被支持，已尝试导出图片。');
  }
};

/* Collection / Save current outfit */
function serializeCurrentCanvas(container){
  const items = Array.from(container.querySelectorAll('.canvas-item'));
  return items.map(it=>{
    const img = it.querySelector('img');
    return {
      html: img ? null : (it.querySelector('span') ? it.querySelector('span').textContent : ''),
      src: img ? img.src : null,
      left: parseFloat(it.style.left || 0),
      top: parseFloat(it.style.top || 0),
      scale: parseFloat(it.dataset.scale || 1),
      rotate: parseFloat(it.dataset.rotate || 0),
      width: it.getBoundingClientRect().width,
      height: it.getBoundingClientRect().height
    };
  });
}

window.saveCurrentOutfit = async function(){
  const fs = document.getElementById('fullscreenCanvas');
  const container = fs ? fs : document.getElementById('canvasArea');
  const data = serializeCurrentCanvas(container);
  if(data.length === 0){ alert('当前没有任何穿搭元素，无法保存'); return; }
  const outfits = JSON.parse(localStorage.getItem('wardrobe_outfits')||'[]');
  const obj = { id: Date.now().toString(36), name: '搭配 ' + new Date().toLocaleString(), items:data, created: Date.now() };
  outfits.unshift(obj); localStorage.setItem('wardrobe_outfits', JSON.stringify(outfits));
  try{
    const canvas = await html2canvas(container, { backgroundColor: null, useCORS:true, scale: 1 });
    const dataURL = canvas.toDataURL('image/png');
    const smartEntry = { id: 's_' + Date.now().toString(36), name: obj.name, items: data, img: dataURL, created: Date.now(), source: 'user' };
    addSmartWardrobeEntry(smartEntry);
  }catch(e){
    console.warn('saveCurrentOutfit: capture for smart wardrobe failed', e);
  }
  alert('已保存到收藏库并同步到智能衣橱');
}

/* Collection modal */
window.openCollectionModal = function(){
  const outfits = JSON.parse(localStorage.getItem('wardrobe_outfits')||'[]');
  const container = document.getElementById('collectionContainer'); container.innerHTML = '';
  const modal = document.createElement('div'); modal.className='collection-modal';
  const card = document.createElement('div'); card.className='collection-card';
  const header = document.createElement('div'); header.className='flex justify-between items-center mb-4';
  header.innerHTML = `<h3 class="text-lg font-semibold">穿搭收藏库</h3><div><button class="fs-btn" onclick="closeCollectionModal()">关闭</button></div>`;
  card.appendChild(header);
  const body = document.createElement('div'); body.className='grid grid-cols-1 md:grid-cols-2 gap-3';
  if(outfits.length === 0) body.innerHTML = '<p class="text-sm text-slate-500">暂无收藏穿搭</p>';
  outfits.forEach(o=>{
    const box = document.createElement('div'); box.className = 'p-3 rounded-lg border flex gap-3 items-center';
    const thumb = document.createElement('div'); thumb.style.width='84px'; thumb.style.height='84px'; thumb.style.background='#f7fafc'; thumb.style.borderRadius='8px'; thumb.style.overflow='hidden'; thumb.style.display='flex'; thumb.style.alignItems='center'; thumb.style.justifyContent='center';
    const mini = document.createElement('div'); mini.style.display='flex'; mini.style.flexDirection='column'; mini.style.gap='6px';
    const title = document.createElement('div'); title.textContent = o.name; title.style.fontWeight='700'; title.style.fontSize='13px';
    const previewRow = document.createElement('div'); previewRow.style.display='flex'; previewRow.style.gap='6px';
    o.items.slice(0,4).forEach(it=>{
      if(it.src){ const im=document.createElement('img'); im.src=it.src; im.style.width='36px'; im.style.height='36px'; im.style.objectFit='cover'; im.style.borderRadius='6px'; previewRow.appendChild(im); }
      else { const sp=document.createElement('div'); sp.textContent=it.html||'👕'; sp.style.width='36px'; sp.style.height='36px'; sp.style.display='flex'; sp.style.alignItems='center'; sp.style.justifyContent='center'; sp.style.background='#fff'; sp.style.borderRadius='6px'; previewRow.appendChild(sp); }
    });
    mini.appendChild(title); mini.appendChild(previewRow);
    const actions = document.createElement('div'); actions.style.marginLeft='auto'; actions.style.display='flex'; actions.style.flexDirection='column'; actions.style.gap='8px';
    const applyBtn = document.createElement('button'); applyBtn.className='fs-btn'; applyBtn.textContent='应用'; applyBtn.onclick = ()=>{ applyOutfitToCanvas(o); closeCollectionModal(); };
    const delBtn = document.createElement('button'); delBtn.className='fs-btn'; delBtn.textContent='删除'; delBtn.onclick = ()=>{ if(confirm('删除该穿搭？')){ const arr = JSON.parse(localStorage.getItem('wardrobe_outfits')||'[]').filter(x=>x.id!==o.id); localStorage.setItem('wardrobe_outfits', JSON.stringify(arr)); openCollectionModal(); } };
    actions.appendChild(applyBtn); actions.appendChild(delBtn);
    box.appendChild(thumb); box.appendChild(mini); box.appendChild(actions); body.appendChild(box);
  });
  card.appendChild(body); modal.appendChild(card); container.appendChild(modal);
};
function closeCollectionModal(){ const container=document.getElementById('collectionContainer'); container.innerHTML=''; }

function applyOutfitToCanvas(o){
  const fs = document.getElementById('fullscreenCanvas'); const canvasArea = fs ? fs : document.getElementById('canvasArea');
  Array.from(canvasArea.querySelectorAll('.canvas-item')).forEach(it=> it.remove());
  o.items.forEach(it=>{
    const wrapper = document.createElement('div'); wrapper.className='canvas-item'; wrapper.style.position='absolute';
    wrapper.style.left = (it.left || 20) + 'px'; wrapper.style.top = (it.top || 20) + 'px';
    wrapper.dataset.scale = it.scale || 1; wrapper.dataset.rotate = it.rotate || 0; wrapper.style.transform = `rotate(${it.rotate||0}deg) scale(${it.scale||1})`;
    if(it.src) wrapper.innerHTML = `<img src="${it.src}" class="content-img pointer-events-none" style="display:block;max-width:160px;max-height:160px;object-fit:contain" />`;
    else wrapper.innerHTML = `<span class="text-6xl pointer-events-none">${escapeHtml(it.html||'👕')}</span>`;
    canvasArea.appendChild(wrapper);
    (function(initWrapper){
      const del=document.createElement('button'); del.className='delete-btn'; del.type='button'; del.innerHTML='✕'; del.onclick=(ev)=>{ev.stopPropagation(); initWrapper.remove();}; initWrapper.appendChild(del);
      let dragging=false, sx=0, sy=0, left0=0, top0=0;
      function getEventClientXY(ev){ if(!ev) return {x:0,y:0}; if(typeof ev.clientX==='number' && typeof ev.clientY==='number') return {x:ev.clientX,y:ev.clientY}; const t=(ev.touches&&ev.touches[0])||(ev.changedTouches&&ev.changedTouches[0]); if(t) return {x:t.clientX,y:t.clientY}; return {x:0,y:0}; }
      function onDown(e){ if(e.target === del) return; const p=getEventClientXY(e); dragging=true; sx=p.x; sy=p.y; left0=initWrapper.offsetLeft; top0=initWrapper.offsetTop; initWrapper.style.zIndex=9999; window.addEventListener('pointermove', onMove,{passive:false}); window.addEventListener('pointerup', onUp); if(e&&e.preventDefault) e.preventDefault(); }
      function onMove(e){ if(!dragging) return; const p=getEventClientXY(e); const dx=p.x-sx, dy=p.y-sy; let newLeft=left0+dx, newTop=top0+dy; if(!window.unboundedPreview){ const wRect=initWrapper.getBoundingClientRect(), area=canvasArea.getBoundingClientRect(); const maxLeft=Math.max(0, area.width-wRect.width), maxTop=Math.max(0, area.height-wRect.height); newLeft=clamp(newLeft,0,maxLeft); newTop=clamp(newTop,0,maxTop); } initWrapper.style.left=newLeft+'px'; initWrapper.style.top=newTop+'px'; if(e&&e.preventDefault) e.preventDefault(); }
      function onUp(){ dragging=false; initWrapper.style.zIndex=1000; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
      initWrapper.addEventListener('pointerdown', onDown); initWrapper.addEventListener('touchstart', onDown,{passive:false});
    })(wrapper);
  });
}

/* AI 模拟衣橱：本地模拟 + 可选外部调用 */
window.openAiSimModal = function(){ const m=document.getElementById('aiSimModal'); if(m) m.classList.remove('hidden'); };
window.closeAiSimModal = function(){ const m=document.getElementById('aiSimModal'); if(m){ m.classList.add('hidden'); const results=document.getElementById('aiSimResults'); if(results) results.innerHTML=''; } };

document.addEventListener('DOMContentLoaded', function(){
  const modeSel = document.getElementById('aiSimMode');
  if(modeSel){
    modeSel.onchange = function(){
      const cfg = document.getElementById('aiExternalConfig');
      if(modeSel.value === 'external') cfg.classList.remove('hidden'); else cfg.classList.add('hidden');
    };
  }
});

/* run simulation entry */
window.runAiSimulate = async function(){
  const mode = document.getElementById('aiSimMode')?.value || 'simulate';
  const resultsEl = document.getElementById('aiSimResults');
  if(!resultsEl) return;
  resultsEl.innerHTML = '<div class="col-span-2 text-sm text-slate-500">生成中… 请稍候</div>';
  try{
    if(mode === 'simulate'){
      const imgs = await simulateLocalAIPreview();
      renderAiSimResults(imgs);
    } else {
      const endpoint = document.getElementById('aiApiEndpoint')?.value?.trim();
      const key = document.getElementById('aiApiKey')?.value?.trim();
      const model = document.getElementById('aiApiModel')?.value?.trim();
      if(!endpoint || !key){ alert('请填写 API Endpoint 与 API Key'); resultsEl.innerHTML=''; return; }
      const prompt = await generatePromptFromCanvas();
      const generated = await callExternalAIGenerate({ endpoint, key, model, prompt });
      const imgs = [];
      for(const url of generated){
        if(url.startsWith('data:')) imgs.push(url);
        else {
          try{
            const r = await fetch(url);
            const blob = await r.blob();
            imgs.push(await blobToDataURL(blob));
          }catch(e){ console.warn('fetch generated url failed', e); }
        }
      }
      renderAiSimResults(imgs);
    }
  }catch(err){
    console.warn('runAiSimulate error', err);
    resultsEl.innerHTML = `<div class="col-span-2 text-sm text-red-500">生成失败：${escapeHtml(err.message||err)}</div>`;
  }
};

async function generatePromptFromCanvas(){
  const items = Array.from(document.querySelectorAll('#canvasArea .canvas-item'));
  if(items.length === 0) return '一套简洁的休闲穿搭';
  const parts = items.map(it=>{
    const img = it.querySelector('img');
    const txt = img ? '图片单品' : (it.querySelector('span') ? it.querySelector('span').textContent.trim() : '单品');
    const left = Math.round(parseFloat(it.style.left||0));
    const top = Math.round(parseFloat(it.style.top||0));
    const scale = parseFloat(it.dataset.scale||1).toFixed(2);
    const rot = parseFloat(it.dataset.rotate||0).toFixed(0);
    return `${txt}（位置:${left},${top} 尺寸:${scale} 旋转:${rot}°）`;
  });
  const prompt = `请根据下列单品生成最终穿搭渲染图（正面视角，真实材质与光影）：\n` + parts.join('\n') + '\n风格：现代、自然光、高清、真实人物模特背景（可选）';
  return prompt;
}

async function simulateLocalAIPreview(){
  const area = document.getElementById('canvasArea');
  if(!area) throw new Error('未找到画布区域');
  const baseCanvas = await html2canvas(area, { backgroundColor: null, useCORS:true, scale: 2 });
  const variants = [];
  const toDataURL = (c) => c.toDataURL('image/png');
  variants.push(toDataURL(baseCanvas));
  variants.push(await canvasWithFilter(baseCanvas, 'rgba(255,244,229,0.4)', 'brightness(1.05) contrast(1.02)'));
  variants.push(await canvasWithFilter(baseCanvas, 'rgba(240,248,255,0.35)', 'saturate(0.95) hue-rotate(200deg)'));
  variants.push(await canvasWithBgBlur(baseCanvas));
  return variants;
}

async function canvasWithFilter(baseCanvas, bgColor, cssFilter){
  const w = baseCanvas.width, h = baseCanvas.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if(bgColor){ ctx.fillStyle = bgColor; ctx.fillRect(0,0,w,h); }
  try{
    // draw base first
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    // apply filter pass
    ctx.filter = cssFilter || 'none';
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    ctx.filter = 'none';
  }catch(e){
    ctx.drawImage(baseCanvas, 0, 0, w, h);
  }
  return c.toDataURL('image/png');
}

async function canvasWithBgBlur(baseCanvas){
  const w = baseCanvas.width, h = baseCanvas.height;
  const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
  const bctx = bg.getContext('2d');
  try{
    bctx.filter = 'blur(12px) saturate(0.9)';
    bctx.drawImage(baseCanvas, 0, 0, w, h);
    bctx.filter = 'none';
  }catch(e){
    bctx.drawImage(baseCanvas, 0, 0, w, h);
  }
  const final = document.createElement('canvas'); final.width = w; final.height = h;
  const fctx = final.getContext('2d');
  fctx.drawImage(bg, 0, 0, w, h);
  fctx.fillStyle = 'rgba(0,0,0,0.06)'; fctx.fillRect(0,0,w,h);
  const scale = 0.96;
  const sw = w*scale, sh = h*scale;
  const dx = (w-sw)/2, dy = (h-sh)/2;
  fctx.drawImage(baseCanvas, dx, dy, sw, sh);
  return final.toDataURL('image/png');
}

function blobToDataURL(blob){ return new Promise((res, rej)=>{ const fr = new FileReader(); fr.onload = ()=>res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); }

function renderAiSimResults(imgDataURLs){
  const container = document.getElementById('aiSimResults');
  if(!container) return;
  container.innerHTML = '';
  if(!imgDataURLs || imgDataURLs.length === 0){ container.innerHTML = '<div class="col-span-2 text-sm text-slate-500">未生成任何图片</div>'; return; }
  imgDataURLs.forEach((d, idx)=>{
    const box = document.createElement('div'); box.className = 'border rounded p-1 flex flex-col items-center gap-2';
    const img = document.createElement('img'); img.src = d; img.style.width = '100%'; img.style.height = 'auto'; img.style.borderRadius = '6px';
    const saveBtn = document.createElement('button'); saveBtn.className = 'fs-btn'; saveBtn.textContent = '保存到智能衣橱';
    saveBtn.onclick = ()=>{ saveGeneratedToSmartWardrobe(d, `AI_渲染_${idx+1}`); };
    const dlBtn = document.createElement('button'); dlBtn.className = 'fs-btn'; dlBtn.textContent = '下载';
    dlBtn.onclick = ()=>{ const a=document.createElement('a'); a.href=d; a.download=`ai_preview_${idx+1}.png`; document.body.appendChild(a); a.click(); a.remove(); };
    box.appendChild(img);
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='6px'; row.appendChild(saveBtn); row.appendChild(dlBtn);
    box.appendChild(row);
    container.appendChild(box);
  });
}

function saveGeneratedToSmartWardrobe(dataURL, name){
  try{
    const entry = { id:'g_'+Date.now().toString(36), name: name || ('生成图 ' + new Date().toLocaleString()), items: [], img: dataURL, created: Date.now(), source:'ai' };
    addSmartWardrobeEntry(entry);
    alert('已保存到 智能衣橱');
  }catch(e){
    console.warn('saveGeneratedToSmartWardrobe', e); alert('保存失败');
  }
}

/* callExternalAIGenerate template (adjust to provider) */
async function callExternalAIGenerate({ endpoint, key, model, prompt }){
  const payload = { model: model || undefined, prompt };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('外部生成失败: ' + res.status + ' ' + res.statusText);
  const data = await res.json();
  if(Array.isArray(data.images)) return data.images;
  if(Array.isArray(data.output)) return data.output;
  if(typeof data.image === 'string') return [data.image];
  if(data && data.url) return [data.url];
  throw new Error('无法解析外部生成响应，请检查 API 返回格式');
}

/* Mobile mode & panels */
window.toggleMobileMode = function(){
  const isMobile = document.body.classList.toggle('mobile-mode');
  try{ localStorage.setItem('wardrobe_mobile_mode', isMobile ? '1' : '0'); }catch(e){}
  const bottom = document.getElementById('mobileBottomNav'); if(bottom) bottom.setAttribute('aria-hidden', isMobile ? 'false' : 'true');
  const floatBtn = document.getElementById('openFullFloat'); if(floatBtn) floatBtn.style.display = isMobile ? 'inline-flex' : 'none';
  const openBtn = document.getElementById('openFullBtn'); if(openBtn) openBtn.style.display = isMobile ? 'none' : 'inline-flex';
  if(isMobile) window.showMobileTab('outfit'); else window.restoreDesktopView();
};
window.restoreDesktopView = function(){ document.querySelectorAll('.mobile-panel').forEach(p=>p.classList.remove('active')); document.getElementById('outfitSection')?.classList.add('active'); };
window.showMobileTab = function(tab){ if(tab === 'upload'){ document.getElementById('uploadSection')?.scrollIntoView({behavior:'smooth',block:'center'}); return; } document.querySelectorAll('.mobile-panel').forEach(p=>p.classList.remove('active')); if(tab === 'wardrobe') document.getElementById('wardrobeSection')?.classList.add('active'); else document.getElementById('outfitSection')?.classList.add('active'); document.querySelectorAll('.mobile-bottom-nav button').forEach(b=>b.classList.remove('active')); const map = {outfit:'navOutfit', wardrobe:'navWardrobe', upload:'navUpload', me:'navMe'}; const id = map[tab]; if(id){ const el = document.getElementById(id); if(el) el.classList.add('active'); } };

/* Init */
window.addEventListener('DOMContentLoaded', function(){
  window.fetchHKOWeather?.();
  try{ renderWardrobeItems(); }catch(e){ console.warn('renderWardrobeItems error', e); }
  try{ const v = localStorage.getItem('wardrobe_mobile_mode'); if(v === '1'){ document.body.classList.add('mobile-mode'); document.getElementById('mobileBottomNav')?.setAttribute('aria-hidden','false'); window.showMobileTab && window.showMobileTab('outfit'); const f = document.getElementById('openFullFloat'); if(f) f.style.display='inline-flex'; const o = document.getElementById('openFullBtn'); if(o) o.style.display='none'; } }catch(e){}
  if(!document.body.classList.contains('mobile-mode')){ const el = document.getElementById('openFullFloat'); if(el) el.style.display='none'; }

  // wire aiSimMode onchange if exists
  const modeSel = document.getElementById('aiSimMode');
  if(modeSel){
    modeSel.onchange = function(){
      const cfg = document.getElementById('aiExternalConfig');
      if(modeSel.value === 'external') cfg.classList.remove('hidden'); else cfg.classList.add('hidden');
    };
  }
});
