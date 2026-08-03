/* script.js - 完整版（已集成：上传抠图 / 画布 / 持久化衣柜 + 智能衣橱 / 全屏 / 导出 / 录制 / 分享 / 手机模式） */

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
    const res = await fetch('https://data.weather.gov
