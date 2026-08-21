import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Undo2, Wallet, Loader2, Camera, X, AlertTriangle, CalendarClock, Printer, Store, RotateCcw, ImagePlus, Check, CloudUpload } from 'lucide-react';

// ---- Design tokens ----
const C = {
  bg: '#F1F2ED', surface: '#FFFFFF', line: '#DDE0D9', ink: '#1C2B25', inkSoft: '#5B6A61',
  alert: '#B8402A', alertSoft: '#F6E4DF', warn: '#A8722F', warnSoft: '#F3E9DB',
};
const PALETTE = [
  { accent: '#2F6F5E', accentSoft: '#E4EFEA' }, { accent: '#A8722F', accentSoft: '#F3E9DB' },
  { accent: '#5A5A9E', accentSoft: '#E7E7F3' }, { accent: '#8A3E5C', accentSoft: '#F2E1E8' },
  { accent: '#3E7C9E', accentSoft: '#E2EEF4' },
];
const displayFont = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const monoFont = "'IBM Plex Mono', ui-monospace, monospace";
const KEY_V2 = 'consignment-shops-v2';
const KEY_V1 = 'consignment-shops-v1';
const MAX_PHOTO_BYTES = 600 * 1024;
const SUMMARY_KEYS = ['consignedTotal', 'soldTotal', 'remaining', 'salesValue', 'shopCommission', 'owedToOwner'];

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function money(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('th-TH'); }
function newId(p) { return p + '_' + Math.random().toString(36).slice(2, 9); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function diffDays(dateStr) {
  if (!dateStr) return null;
  const d1 = new Date(dateStr + 'T00:00:00'), d0 = new Date(todayStr() + 'T00:00:00');
  return Math.round((d1 - d0) / 86400000);
}
function hasOverride(ov, key) { return ov && ov[key] !== undefined && ov[key] !== null; }

function makeShop(name) {
  const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return { id: newId('shop'), name: name || 'ร้านฝากขายใหม่', contactPerson: '', phone: '', address: '', photo: null, commissionPct: 20, nextPickupDate: '', overrides: {}, ...palette, products: [] };
}
function migrateFromV1(v1) {
  return Object.values(v1).map(s => ({
    id: newId('shop'), name: s.label, contactPerson: '', phone: '', address: '', photo: null,
    accent: s.accent, accentSoft: s.accentSoft, commissionPct: s.commissionPct, nextPickupDate: '', overrides: {},
    products: (s.products || []).map(p => ({ ...p, expiryDate: '', photo: null })),
  }));
}
function normalize(shops) {
  return shops.map(s => ({ ...s, overrides: s.overrides || {}, products: (s.products || []).map(p => ({ ...p, photo: p.photo || null })) }));
}

function baseSummary(s) {
  let consignedTotal = 0, soldTotal = 0, salesValue = 0;
  s.products.forEach(p => {
    const price = Number(p.price) || 0, consigned = Number(p.consigned) || 0, sold = Number(p.sold) || 0;
    consignedTotal += consigned; soldTotal += sold; salesValue += sold * price;
  });
  return { consignedTotal, soldTotal, salesValue };
}
function effectiveSummary(s) {
  const base = baseSummary(s), ov = s.overrides || {}, pct = Number(s.commissionPct) || 0;
  const consignedTotal = hasOverride(ov, 'consignedTotal') ? Number(ov.consignedTotal) || 0 : base.consignedTotal;
  const soldTotal = hasOverride(ov, 'soldTotal') ? Number(ov.soldTotal) || 0 : base.soldTotal;
  const remaining = hasOverride(ov, 'remaining') ? Number(ov.remaining) || 0 : consignedTotal - soldTotal;
  const salesValue = hasOverride(ov, 'salesValue') ? Number(ov.salesValue) || 0 : base.salesValue;
  const shopCommission = hasOverride(ov, 'shopCommission') ? Number(ov.shopCommission) || 0 : salesValue * (pct / 100);
  const owedToOwner = hasOverride(ov, 'owedToOwner') ? Number(ov.owedToOwner) || 0 : salesValue - shopCommission;
  return { consignedTotal, soldTotal, remaining, salesValue, shopCommission, owedToOwner };
}

export default function App() {
  const [shops, setShops] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [history, setHistory] = useState([]);
  const [addingShop, setAddingShop] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved'
  const beforeEditRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(KEY_V2, false);
        if (res && res.value) {
          const parsed = normalize(JSON.parse(res.value));
          setShops(parsed); setActiveId(parsed[0]?.id || null);
        } else {
          let migrated = null;
          try {
            const v1 = await window.storage.get(KEY_V1, false);
            if (v1 && v1.value) migrated = migrateFromV1(JSON.parse(v1.value));
          } catch (e) {}
          const initial = migrated || [makeShop('ร้านฝากขาย 1'), makeShop('ร้านฝากขาย 2')];
          setShops(initial); setActiveId(initial[0]?.id || null);
          await window.storage.set(KEY_V2, JSON.stringify(initial), false);
        }
      } catch (e) {
        const initial = [makeShop('ร้านฝากขาย 1'), makeShop('ร้านฝากขาย 2')];
        setShops(initial); setActiveId(initial[0]?.id || null);
      } finally { setLoading(false); }
    })();
  }, []);

  async function persist(next) {
    setSaveStatus('saving');
    try { await window.storage.set(KEY_V2, JSON.stringify(next), false); } catch (e) {}
    setSaveStatus('saved');
  }

  function commit(next, prevSnapshot) {
    setHistory(h => [...h, deepClone(prevSnapshot)].slice(-25));
    setShops(next); persist(next);
  }
  function handleUndo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setShops(prev);
    if (!prev.find(s => s.id === activeId)) setActiveId(prev[0]?.id || null);
    persist(prev);
  }
  function addShop() {
    const name = newShopName.trim() || 'ร้านฝากขายใหม่';
    const next = [...deepClone(shops), makeShop(name)];
    commit(next, shops); setActiveId(next[next.length - 1].id); setNewShopName(''); setAddingShop(false);
  }
  function deleteShop(id) {
    const next = shops.filter(s => s.id !== id);
    commit(next, shops);
    if (activeId === id) setActiveId(next[0]?.id || null);
  }
  function addProduct() {
    const next = deepClone(shops);
    next.find(s => s.id === activeId).products.push({ id: newId('p'), name: 'สินค้าใหม่', price: 0, consigned: 0, sold: 0, expiryDate: '', photo: null });
    commit(next, shops);
  }
  function deleteProduct(pid) {
    const next = deepClone(shops);
    const s = next.find(s => s.id === activeId);
    s.products = s.products.filter(p => p.id !== pid);
    commit(next, shops);
  }
  function onFieldFocus() { beforeEditRef.current = deepClone(shops); }
  function onFieldBlur() {
    if (beforeEditRef.current) {
      const before = beforeEditRef.current; beforeEditRef.current = null;
      setHistory(h => [...h, before].slice(-25)); persist(shops);
    }
  }
  function onShopFieldChange(field, value) {
    setShops(prev => { const next = deepClone(prev); const s = next.find(s => s.id === activeId);
      s[field] = field === 'commissionPct' ? (value === '' ? '' : Number(value)) : value; return next; });
  }
  function onProductFieldChange(pid, field, value) {
    setShops(prev => { const next = deepClone(prev); const s = next.find(s => s.id === activeId); const p = s.products.find(p => p.id === pid);
      if (!p) return prev;
      p[field] = (field === 'name' || field === 'expiryDate') ? value : (value === '' ? '' : Number(value));
      return next; });
  }
  // summary override editing: initialize override to current effective value on focus, so typing is smooth
  function onSummaryFocus(key) {
    beforeEditRef.current = deepClone(shops);
    setShops(prev => { const next = deepClone(prev); const s = next.find(s => s.id === activeId);
      if (!hasOverride(s.overrides, key)) s.overrides[key] = effectiveSummary(s)[key];
      return next; });
  }
  function onSummaryChange(key, value) {
    setShops(prev => { const next = deepClone(prev); const s = next.find(s => s.id === activeId);
      s.overrides[key] = value === '' ? '' : Number(value); return next; });
  }
  function resetSummaryField(key) {
    const before = deepClone(shops);
    const next = deepClone(shops);
    delete next.find(s => s.id === activeId).overrides[key];
    commit(next, before);
  }
  function readPhotoFile(file) {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_PHOTO_BYTES) { reject(new Error('too big')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function handleShopPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const dataUrl = await readPhotoFile(file);
      const before = deepClone(shops); const next = deepClone(shops);
      next.find(s => s.id === activeId).photo = dataUrl;
      commit(next, before);
    } catch { alert('ไฟล์รูปใหญ่เกินไป กรุณาเลือกรูปขนาดเล็กกว่า 600KB'); }
    e.target.value = '';
  }
  function removeShopPhoto() {
    const before = deepClone(shops); const next = deepClone(shops);
    next.find(s => s.id === activeId).photo = null;
    commit(next, before);
  }
  async function handleProductPhoto(pid, e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const dataUrl = await readPhotoFile(file);
      const before = deepClone(shops); const next = deepClone(shops);
      next.find(s => s.id === activeId).products.find(p => p.id === pid).photo = dataUrl;
      commit(next, before);
    } catch { alert('ไฟล์รูปใหญ่เกินไป กรุณาเลือกรูปขนาดเล็กกว่า 600KB'); }
    e.target.value = '';
  }
  function removeProductPhoto(pid) {
    const before = deepClone(shops); const next = deepClone(shops);
    next.find(s => s.id === activeId).products.find(p => p.id === pid).photo = null;
    commit(next, before);
  }

  const grandTotal = useMemo(() => {
    if (!shops) return null;
    return shops.reduce((acc, s) => {
      const eff = effectiveSummary(s);
      acc.consignedTotal += eff.consignedTotal; acc.soldTotal += eff.soldTotal;
      acc.salesValue += eff.salesValue; acc.shopCommission += eff.shopCommission; acc.owedToOwner += eff.owedToOwner;
      return acc;
    }, { consignedTotal: 0, soldTotal: 0, salesValue: 0, shopCommission: 0, owedToOwner: 0 });
  }, [shops]);

  const alerts = useMemo(() => {
    if (!shops) return [];
    const list = [];
    shops.forEach(s => {
      const d = diffDays(s.nextPickupDate);
      if (d !== null && d <= 0) list.push({ kind: d < 0 ? 'overdue' : 'today', text: `${s.name}: ${d < 0 ? `เลยกำหนดรอบรับ-ส่งสินค้ามา ${-d} วัน` : 'ถึงกำหนดรอบรับ-ส่งสินค้าวันนี้'}` });
      s.products.forEach(p => {
        const ed = diffDays(p.expiryDate);
        if (ed !== null) {
          if (ed < 0) list.push({ kind: 'overdue', text: `${s.name} · ${p.name}: หมดอายุแล้ว ${-ed} วัน ควรเก็บคืน` });
          else if (ed <= 3) list.push({ kind: 'today', text: `${s.name} · ${p.name}: ใกล้หมดอายุในอีก ${ed} วัน` });
        }
        const remaining = (Number(p.consigned) || 0) - (Number(p.sold) || 0);
        if ((Number(p.consigned) || 0) >= 5 && remaining / (Number(p.consigned) || 1) > 0.7) {
          list.push({ kind: 'slow', text: `${s.name} · ${p.name}: ขายช้า เหลือ ${remaining} จาก ${p.consigned} ชิ้น พิจารณาเก็บคืน` });
        }
      });
    });
    return list;
  }, [shops]);

  if (loading || !shops) {
    return <div style={{ background: C.bg, fontFamily: displayFont }} className="w-full min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" style={{ color: C.inkSoft }} /></div>;
  }

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: displayFont, minHeight: '100vh' }} className="w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: ${monoFont}; }
        input.cell { background: transparent; border: none; outline: none; width: 100%; font-family: inherit; }
        input.cell:focus { background: #F1F2ED; border-radius: 4px; }
        input.kpi { background: transparent; border: none; outline: none; width: 100%; font-family: ${monoFont}; }
        @media print {
          .no-print { display: none !important; }
          .shop-panel { display: block !important; page-break-inside: avoid; margin-bottom: 24px; }
          body { background: white !important; }
        }
        @media screen { .shop-panel.inactive { display: none; } }
      `}</style>

      <div className="flex items-center justify-between px-6 py-4 border-b no-print" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">บัญชีฝากขาย</h1>
          <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: '#E4EFEA', color: '#2F6F5E' }}>
            {saveStatus === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {saveStatus === 'saving' ? 'กำลังบันทึก...' : 'บันทึกอัตโนมัติ'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
            <Printer size={14} /> สรุป PDF
          </button>
          <button onClick={handleUndo} disabled={!history.length} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium"
            style={{ border: `1px solid ${C.line}`, color: history.length ? C.ink : C.inkSoft, opacity: history.length ? 1 : 0.5, cursor: history.length ? 'pointer' : 'default' }}>
            <Undo2 size={14} /> ย้อนกลับ
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-semibold">สรุปการเงินธุรกิจฝากขาย</h1>
          <p className="text-sm" style={{ color: C.inkSoft }}>ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH')}</p>
        </div>

        <div className="rounded-lg p-4 mb-5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
          <h2 className="font-medium mb-3">ภาพรวมธุรกิจ ({shops.length} ร้าน)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StaticCard label="ฝากทั้งหมด" value={`${grandTotal.consignedTotal} ชิ้น`} />
            <StaticCard label="ขายแล้ว" value={`${grandTotal.soldTotal} ชิ้น`} />
            <StaticCard label="ยอดขายรวม" value={`฿${money(grandTotal.salesValue)}`} />
            <StaticCard label="ค่าคอมฯ รวม" value={`฿${money(grandTotal.shopCommission)}`} />
            <StaticCard label="โอนคืนเจ้าของรวม" value={`฿${money(grandTotal.owedToOwner)}`} strong />
          </div>
          <p className="text-xs mt-2" style={{ color: C.inkSoft }}>รวมจากทุกร้าน (คำนวณอัตโนมัติ) — แก้ไขค่าตัวเลขได้ที่การ์ดของแต่ละร้านด้านล่าง</p>
        </div>

        {alerts.length > 0 && (
          <div className="rounded-lg p-4 mb-5 no-print" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} style={{ color: C.alert }} /><h2 className="font-medium">แจ้งเตือน</h2></div>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {alerts.map((a, i) => (
                <div key={i} className="text-xs px-2 py-1.5 rounded" style={{ background: a.kind === 'overdue' ? C.alertSoft : C.warnSoft, color: a.kind === 'overdue' ? C.alert : C.warn }}>{a.text}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-5 no-print">
          {shops.map(s => (
            <button key={s.id} onClick={() => setActiveId(s.id)} className="flex items-center gap-2 text-sm pl-2 pr-3 py-1.5 rounded-md font-medium"
              style={{ background: activeId === s.id ? s.accentSoft : 'transparent', color: activeId === s.id ? s.accent : C.inkSoft, border: `1px solid ${activeId === s.id ? s.accent : C.line}` }}>
              {s.photo ? <img src={s.photo} alt="" className="w-5 h-5 rounded-full object-cover" /> : <Store size={14} />} {s.name}
            </button>
          ))}
          {!addingShop ? (
            <button onClick={() => setAddingShop(true)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md font-medium" style={{ border: `1px dashed ${C.line}`, color: C.inkSoft }}>
              <Plus size={14} /> เพิ่มร้าน
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input autoFocus value={newShopName} onChange={e => setNewShopName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addShop()}
                placeholder="ชื่อร้านใหม่" className="text-sm px-2 py-1.5 rounded-md" style={{ border: `1px solid ${C.line}` }} />
              <button onClick={addShop} className="text-sm px-2 py-1.5 rounded-md font-medium" style={{ background: C.ink, color: C.surface }}>เพิ่ม</button>
              <button onClick={() => { setAddingShop(false); setNewShopName(''); }} className="p-1.5"><X size={14} style={{ color: C.inkSoft }} /></button>
            </div>
          )}
        </div>

        {shops.length === 0 && <p className="text-sm text-center py-10" style={{ color: C.inkSoft }}>ยังไม่มีร้านฝากขาย — กด "เพิ่มร้าน" เพื่อเริ่มต้น</p>}

        {shops.map(s => {
          const eff = effectiveSummary(s);
          const ov = s.overrides || {};
          return (
            <div key={s.id} className={`shop-panel ${s.id === activeId ? 'active' : 'inactive'}`}>
              <div className="rounded-lg p-4 mb-4 flex flex-wrap gap-4" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <div className="flex flex-col items-center gap-2 no-print">
                  {s.photo ? <img src={s.photo} alt={s.name} className="w-16 h-16 rounded-lg object-cover" style={{ border: `1px solid ${C.line}` }} />
                    : <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: s.accentSoft }}><Camera size={18} style={{ color: s.accent }} /></div>}
                  <label className="text-xs cursor-pointer" style={{ color: s.accent }}>{s.photo ? 'เปลี่ยนรูป' : 'แนบรูปร้าน'}<input type="file" accept="image/*" className="hidden" onChange={handleShopPhoto} /></label>
                  {s.photo && <button onClick={removeShopPhoto} className="text-xs" style={{ color: C.inkSoft }}>ลบรูป</button>}
                </div>
                <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <LabeledInput label="ชื่อร้าน" value={s.name} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={v => onShopFieldChange('name', v)} />
                  <LabeledInput label="ผู้ติดต่อ" value={s.contactPerson} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={v => onShopFieldChange('contactPerson', v)} />
                  <LabeledInput label="เบอร์โทร" value={s.phone} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={v => onShopFieldChange('phone', v)} />
                  <LabeledInput label="ที่อยู่" value={s.address} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={v => onShopFieldChange('address', v)} />
                  <div>
                    <p className="text-xs mb-1" style={{ color: C.inkSoft }}>ค่าคอมมิชชั่นร้าน (%)</p>
                    <input type="number" className="mono text-sm px-2 py-1 rounded w-24" style={{ border: `1px solid ${C.line}` }} value={s.commissionPct} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onShopFieldChange('commissionPct', e.target.value)} />
                  </div>
                  <div>
                    <p className="text-xs mb-1 flex items-center gap-1" style={{ color: C.inkSoft }}><CalendarClock size={12} /> รอบรับ-ส่งสินค้าครั้งถัดไป</p>
                    <input type="date" className="mono text-sm px-2 py-1 rounded" style={{ border: `1px solid ${C.line}` }} value={s.nextPickupDate} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onShopFieldChange('nextPickupDate', e.target.value)} />
                  </div>
                </div>
                <button onClick={() => deleteShop(s.id)} className="no-print self-start text-xs flex items-center gap-1" style={{ color: C.alert }}><Trash2 size={13} /> ลบร้านนี้</button>
              </div>

              {/* Editable summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <EditableCard label="ฝากทั้งหมด" unit="ชิ้น" value={eff.consignedTotal} overridden={hasOverride(ov, 'consignedTotal')}
                  onFocus={() => onSummaryFocus('consignedTotal')} onChange={v => onSummaryChange('consignedTotal', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('consignedTotal')} />
                <EditableCard label="ขายแล้ว" unit="ชิ้น" value={eff.soldTotal} overridden={hasOverride(ov, 'soldTotal')}
                  onFocus={() => onSummaryFocus('soldTotal')} onChange={v => onSummaryChange('soldTotal', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('soldTotal')} />
                <EditableCard label="คงเหลือ" unit="ชิ้น" value={eff.remaining} warn={eff.remaining < 0} overridden={hasOverride(ov, 'remaining')}
                  onFocus={() => onSummaryFocus('remaining')} onChange={v => onSummaryChange('remaining', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('remaining')} />
                <EditableCard label="ยอดขายรวม" unit="฿" value={eff.salesValue} isMoney overridden={hasOverride(ov, 'salesValue')}
                  onFocus={() => onSummaryFocus('salesValue')} onChange={v => onSummaryChange('salesValue', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('salesValue')} />
                <EditableCard label={`ค่าคอมฯ ร้าน (${s.commissionPct || 0}%)`} unit="฿" value={eff.shopCommission} isMoney accent={s.accent} accentSoft={s.accentSoft} overridden={hasOverride(ov, 'shopCommission')}
                  onFocus={() => onSummaryFocus('shopCommission')} onChange={v => onSummaryChange('shopCommission', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('shopCommission')} />
                <EditableCard label="โอนคืนเจ้าของสินค้า" unit="฿" value={eff.owedToOwner} isMoney accent={s.accent} accentSoft={s.accentSoft} strong overridden={hasOverride(ov, 'owedToOwner')}
                  onFocus={() => onSummaryFocus('owedToOwner')} onChange={v => onSummaryChange('owedToOwner', v)} onBlur={onFieldBlur} onReset={() => resetSummaryField('owedToOwner')} />
              </div>

              <div className="rounded-lg p-4 mb-6" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between mb-3 no-print">
                  <h2 className="font-medium flex items-center gap-2"><Wallet size={16} style={{ color: C.inkSoft }} /> รายการสินค้าฝากขาย</h2>
                  <button onClick={addProduct} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium" style={{ background: s.accentSoft, color: s.accent, border: `1px solid ${s.accent}` }}>
                    <Plus size={14} /> เพิ่มสินค้า
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ color: C.inkSoft }}>
                        <th className="py-2 pr-2 font-medium no-print">รูป</th>
                        <th className="py-2 pr-2 font-medium">ชื่อสินค้า</th>
                        <th className="py-2 pr-2 font-medium text-right">ราคา/ชิ้น</th>
                        <th className="py-2 pr-2 font-medium text-right">ฝากไว้</th>
                        <th className="py-2 pr-2 font-medium text-right">ขายแล้ว</th>
                        <th className="py-2 pr-2 font-medium text-right">คงเหลือ</th>
                        <th className="py-2 pr-2 font-medium text-right">ยอดขาย</th>
                        <th className="py-2 pr-2 font-medium">วันหมดอายุ</th>
                        <th className="py-2 pr-2 font-medium no-print"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.products.map(p => {
                        const price = Number(p.price) || 0, consigned = Number(p.consigned) || 0, sold = Number(p.sold) || 0;
                        const remaining = consigned - sold, ed = diffDays(p.expiryDate);
                        return (
                          <tr key={p.id} className="border-t" style={{ borderColor: C.line }}>
                            <td className="py-1.5 pr-2 no-print">
                              <div className="relative w-9 h-9">
                                {p.photo ? <img src={p.photo} alt="" className="w-9 h-9 rounded object-cover" style={{ border: `1px solid ${C.line}` }} />
                                  : <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: C.bg, border: `1px dashed ${C.line}` }}><ImagePlus size={14} style={{ color: C.inkSoft }} /></div>}
                                <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-center text-[9px] text-white rounded" style={{ background: 'rgba(0,0,0,0.45)' }}>
                                  {p.photo ? 'เปลี่ยน' : 'แนบ'}
                                  <input type="file" accept="image/*" className="hidden" onChange={e => handleProductPhoto(p.id, e)} />
                                </label>
                              </div>
                            </td>
                            <td className="py-1.5 pr-2"><input className="cell" value={p.name} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onProductFieldChange(p.id, 'name', e.target.value)} /></td>
                            <td className="py-1.5 pr-2 text-right"><input className="cell mono text-right" type="number" value={p.price} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onProductFieldChange(p.id, 'price', e.target.value)} /></td>
                            <td className="py-1.5 pr-2 text-right"><input className="cell mono text-right" type="number" value={p.consigned} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onProductFieldChange(p.id, 'consigned', e.target.value)} /></td>
                            <td className="py-1.5 pr-2 text-right"><input className="cell mono text-right" type="number" value={p.sold} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onProductFieldChange(p.id, 'sold', e.target.value)} /></td>
                            <td className="py-1.5 pr-2 text-right mono font-medium" style={{ color: remaining < 0 ? C.alert : C.ink }}>{remaining}</td>
                            <td className="py-1.5 pr-2 text-right mono">฿{money(sold * price)}</td>
                            <td className="py-1.5 pr-2">
                              <input type="date" className="cell mono text-xs" style={{ color: ed !== null && ed < 0 ? C.alert : C.ink }} value={p.expiryDate || ''} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={e => onProductFieldChange(p.id, 'expiryDate', e.target.value)} />
                            </td>
                            <td className="py-1.5 pr-1 text-right no-print"><button onClick={() => deleteProduct(p.id)} style={{ color: C.alert }}><Trash2 size={14} /></button></td>
                          </tr>
                        );
                      })}
                      {s.products.length === 0 && <tr><td colSpan={9} className="py-6 text-center" style={{ color: C.inkSoft }}>ยังไม่มีสินค้า</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, onFocus, onBlur }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: C.inkSoft }}>{label}</p>
      <input className="text-sm px-2 py-1 rounded w-full" style={{ border: `1px solid ${C.line}` }} value={value || ''} onFocus={onFocus} onBlur={onBlur} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function StaticCard({ label, value, strong }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <p className="text-xs mb-1" style={{ color: C.inkSoft }}>{label}</p>
      <p className={`mono ${strong ? 'text-lg font-semibold' : 'text-base font-medium'}`}>{value}</p>
    </div>
  );
}

function EditableCard({ label, unit, value, isMoney, warn, accent, accentSoft, strong, overridden, onFocus, onChange, onBlur, onReset }) {
  return (
    <div className="rounded-lg p-3 relative" style={{ background: accentSoft || C.surface, border: `1px solid ${warn ? C.alert : (accent || C.line)}` }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs" style={{ color: C.inkSoft }}>{label}{overridden && <span className="no-print"> · แก้ไขเอง</span>}</p>
        {overridden && (
          <button onClick={onReset} className="no-print" title="ใช้ค่าที่คำนวณอัตโนมัติ"><RotateCcw size={11} style={{ color: C.inkSoft }} /></button>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        {isMoney && <span className={`mono ${strong ? 'text-lg' : 'text-base'} font-medium`} style={{ color: warn ? C.alert : (accent || C.ink) }}>฿</span>}
        <input type="number" className={`kpi ${strong ? 'text-lg font-semibold' : 'text-base font-medium'}`}
          style={{ color: warn ? C.alert : (accent || C.ink) }}
          value={value} onFocus={onFocus} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
        {!isMoney && <span className="text-xs" style={{ color: C.inkSoft }}>{unit}</span>}
      </div>
    </div>
  );
}
