import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Camera, ImagePlus, ArrowDownRight, ArrowLeft, ArrowRight, Banknote, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FileText, Home, House, ListChecks, MapPin, Menu, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { deleteProperty, getAnswers, getCosts, getNotes, getPhotos, getProperties, removeCost, removeNote, removePhoto, saveAnswer, saveCost, saveNote, savePhoto, saveProperty } from './db';
import { CHECKLIST, type CheckStatus, type InspectionAnswer, type InspectionNote, type InspectionPhoto, type PropertyCost, type PropertyRecord } from './types';

type View = 'overview' | 'properties' | 'inspection' | 'costs' | 'compare' | 'settings';
const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
const shortDate = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => crypto.randomUUID();
const statusText: Record<CheckStatus, string> = { okay: 'Looks okay', concern: 'Needs attention', not_checked: 'Not checked', not_applicable: 'Not applicable' };
function blobToDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function dataUrlToBlob(value:string):Blob{const parts=value.split(',');if(parts.length!==2||!parts[0].startsWith('data:image/'))throw new Error('A photo in this backup is invalid.');const mime=parts[0].slice(5).split(';')[0];const binary=atob(parts[1]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:mime})}

export default function App() {
  const [view, setView] = useState<View>('overview');
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [answers, setAnswers] = useState<InspectionAnswer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const active = properties.find(p => p.id === activeId) ?? null;

  async function refresh() {
    try {
      const items = await getProperties();
      setProperties(items);
      if (activeId && !items.some(p => p.id === activeId)) setActiveId('');
    } catch {
      setError('Your local property records could not be opened. Try refreshing this page. If the problem continues, check browser storage settings.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!activeId) { setAnswers([]); return; }
    let cancelled = false;
    getAnswers(activeId).then(a => { if (!cancelled) setAnswers(a); }).catch(() => setError('Could not load inspection details from this browser.'));
    return () => { cancelled = true; };
  }, [activeId, properties]);
  const allItems = CHECKLIST.flatMap(section => section.items);
  const answered = answers.filter(a => a.status !== 'not_checked').length;
  const concerns = answers.filter(a => a.status === 'concern').length;
  const progress = allItems.length ? Math.round((answered / allItems.length) * 100) : 0;
  const filtered = useMemo(() => properties.filter(p => (p.name + ' ' + p.address).toLowerCase().includes(search.toLowerCase())), [properties, search]);

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const address = String(form.get('address') || '').trim();
    const rentAmount = Number(form.get('rentAmount'));
    if (!name || !address || !Number.isFinite(rentAmount) || rentAmount < 0) return;
    const now = new Date().toISOString();
    const item: PropertyRecord = { id: newId(), name, address, propertyType: String(form.get('propertyType') || 'Flat'), bedrooms: Number(form.get('bedrooms') || 1), rentAmount, rentDuration: String(form.get('rentDuration') || 'year') as 'year'|'month', inspectionDate: String(form.get('inspectionDate') || today()), createdAt: now, updatedAt: now, notes: '' };
    try {
      await saveProperty(item);
      await refresh();
      setActiveId(item.id);
      setShowCreate(false);
      setView('inspection');
      setToast('Property added. Start with what you can observe.');
      window.setTimeout(() => setToast(''), 3000);
    } catch { setError('This property could not be saved. Your browser may be out of storage space.'); }
  }
  async function updateAnswer(itemId: string, status: CheckStatus) {
    if (!active) return;
    const answer: InspectionAnswer = { propertyId: active.id, itemId, status, note: answers.find(a => a.itemId === itemId)?.note ?? '', updatedAt: new Date().toISOString() };
    try { await saveAnswer(answer); setAnswers(previous => [...previous.filter(a => a.itemId !== itemId), answer]); }
    catch { setError('This checklist response could not be saved.'); }
  }
  async function removeActive() {
    if (!active || !window.confirm('Delete this property and its inspection notes, costs, and checklist responses from this browser? This cannot be undone.')) return;
    try { await deleteProperty(active.id); setActiveId(''); await refresh(); setView('properties'); }
    catch { setError('The property could not be deleted.'); }
  }
  function navigate(next: View) { setView(next); setMobileNav(false); }
  function startInspection(property: PropertyRecord) { setActiveId(property.id); setView('inspection'); }
  async function importData(file: File) {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is larger than 50 MB.');
      const parsed = JSON.parse(await file.text()) as { schemaVersion?: number; properties?: PropertyRecord[]; details?: Array<{ id: string; answers?: InspectionAnswer[]; costs?: PropertyCost[]; notes?: InspectionNote[]; photos?: Array<Omit<InspectionPhoto,'blob'> & {blob:string}> }> };
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.properties) || !Array.isArray(parsed.details)) throw new Error('This is not a supported Before You Rent backup.');
      if (!parsed.properties.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.address === 'string')) throw new Error('The backup contains an invalid property record.');
      if (!window.confirm('Import ' + parsed.properties.length + ' properties? This merges the backup into this browser. Matching IDs will be overwritten; unrelated records will remain. Photo evidence is included.')) return;
      for (const property of parsed.properties) await saveProperty(property);
      for (const detail of parsed.details) {
        if (!detail || typeof detail.id !== 'string') continue;
        for (const answer of detail.answers ?? []) await saveAnswer(answer);
        for (const cost of detail.costs ?? []) await saveCost(cost);
        for (const note of detail.notes ?? []) await saveNote(note);
        for (const photo of detail.photos ?? []) {
          if (typeof photo.blob !== 'string') throw new Error('A photo in this backup is invalid.');
          await savePhoto({...photo, blob:dataUrlToBlob(photo.blob)});
        }
      }
      await refresh();
      setToast('Backup imported. Review the merged records before relying on them.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (e) {
      setError(e instanceof Error ? 'Import failed: ' + e.message : 'Import failed. Check that the file is a valid Before You Rent JSON backup.');
    }
  }

  async function exportData() {
    try {
      const records = await getProperties();
      const details = await Promise.all(records.map(async property => ({
        id: property.id,
        answers: await getAnswers(property.id),
        costs: await getCosts(property.id),
        notes: await getNotes(property.id),
        photos: await Promise.all((await getPhotos(property.id)).map(async photo => ({...photo, blob: await blobToDataUrl(photo.blob)}))),
      })));
      const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), properties: records, details };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'before-you-rent-backup.json'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast('Backup created. Keep it somewhere private and secure.');
      window.setTimeout(() => setToast(''), 3500);
    } catch {
      setError('Export failed. Your browser may not have enough memory to package the selected records and photos.');
    }
  }

  return <div className="app-shell">
    <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
      <button className="brand" onClick={() => navigate('overview')} aria-label="Before You Rent home"><span className="brand-mark"><House size={19} strokeWidth={2.4}/></span><span className="brand-copy">before you <b>rent.</b><small>YOUR RENTING COMPANION</small></span></button>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        <NavItem active={view === 'overview'} icon={<Home size={18}/>} label="Overview" onClick={() => navigate('overview')}/>
        <NavItem active={view === 'properties'} icon={<Building2 size={18}/>} label="My properties" count={properties.length} onClick={() => navigate('properties')}/>
        <NavItem active={view === 'inspection'} icon={<ClipboardCheck size={18}/>} label="Inspection" onClick={() => active ? navigate('inspection') : navigate('properties')} disabled={!active}/>
        <NavItem active={view === 'costs'} icon={<Wallet size={18}/>} label="Cost breakdown" onClick={() => active ? navigate('costs') : navigate('properties')} disabled={!active}/>
        <NavItem active={view === 'compare'} icon={<SlidersHorizontal size={18}/>} label="Compare options" onClick={() => navigate('compare')} disabled={properties.length < 2}/>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon"><ShieldCheck size={18}/></span><div><b>Your records stay here</b><p>Saved on this device. No account needed.</p></div></div>
        <button className="nav-item" onClick={() => navigate('settings')}><span className="nav-icon"><CircleHelp size={18}/></span><span>Data & help</span></button>
        <div className="sidebar-foot"><span className="online-dot"/> PRIVATE BY DEFAULT <span className="version">V0.1</span></div>
      </div>
    </aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open menu"><Menu size={21}/></button><div className="breadcrumb">Your space <span>/</span> <b>{viewLabels[view]}</b></div><div className="topbar-right"><span className="save-status"><span className="online-dot"/> Saved locally</span><button className="avatar" title="Local workspace">R</button></div></header>
      <div className="page-content">
        {error && <div className="alert-error" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {loading ? <div className="loading-state"><div className="loader"/><p>Opening your workspace…</p></div> : <>
          {view === 'overview' && <Overview properties={properties} active={active} answered={answered} concerns={concerns} progress={progress} onCreate={() => setShowCreate(true)} onNavigate={navigate} onOpen={startInspection}/>}
          {view === 'properties' && <PropertiesView properties={filtered} search={search} setSearch={setSearch} onCreate={() => setShowCreate(true)} onOpen={startInspection} onDelete={async p => { if(window.confirm('Delete ' + p.name + ' and all its local inspection data?')) { await deleteProperty(p.id); await refresh(); } }}/>}
          {view === 'inspection' && <InspectionView active={active} answers={answers} onCreate={() => setShowCreate(true)} onAnswer={updateAnswer} onBack={() => navigate('properties')} onDelete={removeActive}/>}
          {view === 'costs' && <CostsView active={active} onCreate={() => setShowCreate(true)}/>}
          {view === 'compare' && <CompareView properties={properties} onOpen={startInspection} onCreate={() => setShowCreate(true)}/>}
          {view === 'settings' && <SettingsView onExport={exportData} onImport={importData} count={properties.length}/>}
        </>}
      </div>
      <footer className="page-footer"><span>BEFORE YOU RENT <span className="footer-dot">•</span> MAKE A BETTER-INFORMED MOVE</span><span>Information tool, not a property safety certification.</span></footer>
    </main>
    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if(e.target === e.currentTarget) setShowCreate(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-head"><div><span className="eyebrow">NEW PROPERTY</span><h2 id="create-title">Let’s get the details down.</h2><p>Add the basics now. You can fill in the rest while inspecting.</p></div><button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close"><X size={20}/></button></div><form onSubmit={createProperty} className="create-form"><label>Property name <input name="name" placeholder="e.g. Flat on Awolowo Road" required autoFocus maxLength={90}/></label><label>Address or area <input name="address" placeholder="Street, neighbourhood, city" required maxLength={180}/></label><div className="form-row"><label>Property type<select name="propertyType"><option>Flat</option><option>Self-contained</option><option>Duplex</option><option>Room</option><option>Terrace</option><option>Bungalow</option><option>Shared apartment</option><option>Other</option></select></label><label>Bedrooms<select name="bedrooms"><option value="0">Studio / none</option><option value="1" selected>1 bedroom</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4+ bedrooms</option></select></label></div><label>Advertised rent <div className="money-input"><span>₦</span><input name="rentAmount" type="number" min="0" step="1000" placeholder="e.g. 1800000" required/></div></label><div className="form-row"><label>Rent period<select name="rentDuration"><option value="year">Per year</option><option value="month">Per month</option></select></label><label>Inspection date<input name="inspectionDate" type="date" defaultValue={today()} required/></label></div><div className="form-note"><ShieldCheck size={17}/><span>Your details are saved in this browser. You can add costs, photos, and notes as you go.</span></div><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="button-primary">Create property <ArrowRight size={16}/></button></div></form></section></div>}
    {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}

const viewLabels: Record<View,string> = { overview:'Overview', properties:'My properties', inspection:'Inspection', costs:'Cost breakdown', compare:'Compare options', settings:'Data & help' };
function NavItem({ active, icon, label, count, onClick, disabled=false }: {active:boolean; icon:ReactNode; label:string; count?:number; onClick:()=>void; disabled?:boolean}) { return <button className={'nav-item ' + (active?'nav-active ':'') + (disabled?'nav-disabled':'')} onClick={onClick} disabled={disabled}><span className="nav-icon">{icon}</span><span>{label}</span>{count !== undefined && <span className="nav-count">{count}</span>}{active && <span className="active-line"/>}</button>; }

function PageHeading({ eyebrow, title, description, action }: {eyebrow:string;title:ReactNode;description:ReactNode;action?:ReactNode}) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }

function Overview({properties,active,answered,concerns,progress,onCreate,onNavigate,onOpen}:{properties:PropertyRecord[];active:PropertyRecord|null;answered:number;concerns:number;progress:number;onCreate:()=>void;onNavigate:(v:View)=>void;onOpen:(p:PropertyRecord)=>void}) {
  const recent = [...properties].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3);
  return <><PageHeading eyebrow="YOUR RENTING WORKSPACE" title={<>Find a place. <span className="title-accent">Know what you’re getting.</span></>} description="A calmer way to inspect a rental, get clear on the real cost, and keep your questions in one place." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>
    <section className="welcome-banner"><div className="banner-text"><span className="banner-kicker"><Sparkles size={14}/> A LITTLE MORE CERTAINTY</span><h2>Don’t let the viewing be<br/>the only thing you remember.</h2><p>Capture the details while you’re there. Make the decision when you’ve had time to think.</p><button className="banner-link" onClick={() => onNavigate(properties.length ? 'properties':'inspection')}>{properties.length ? 'Continue with your properties':'How it works'} <ArrowRight size={16}/></button></div><div className="banner-art" aria-hidden="true"><div className="art-sun"/><div className="art-house"><div className="art-roof"/><div className="art-wall"><div className="art-window"/><div className="art-door"/></div></div><div className="art-plant art-plant-one"/><div className="art-plant art-plant-two"/><div className="art-ground"/></div><span className="banner-index">01 / YOUR NEXT MOVE</span></section>
    <div className="section-head"><div><span className="eyebrow">AT A GLANCE</span><h2>Your renting progress</h2></div><button className="text-link" onClick={() => onNavigate('properties')}>All properties <ArrowRight size={15}/></button></div>
    <div className="stats-grid"><StatCard icon={<Building2 size={18}/>} label="Properties tracked" value={String(properties.length).padStart(2,'0')} note={properties.length ? 'Your shortlist is taking shape':'Start your shortlist'} tone="cream"/><StatCard icon={<ListChecks size={18}/>} label="Checks completed" value={String(answered).padStart(2,'0')} note={properties.length ? 'Across the selected inspection':'Nothing missed by memory alone'} tone="mint"/><StatCard icon={<ShieldCheck size={18}/>} label="Concerns recorded" value={String(concerns).padStart(2,'0')} note="Worth a second look" tone="peach"/><StatCard icon={<Wallet size={18}/>} label="Move-in costs" value={properties.length ? 'Review':'—'} note="Rent is only part of the picture" tone="lilac" onClick={() => active && onNavigate('costs')}/></div>
    <div className="content-columns"><section className="panel properties-panel"><div className="panel-head"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>{properties.length ? 'Properties in the mix':'Your first property starts here'}</h2></div><button className="icon-button subtle" onClick={() => onNavigate('properties')} aria-label="View properties"><ArrowRight size={18}/></button></div>{properties.length ? <div className="recent-list">{recent.map((p,i)=><button className="property-row" key={p.id} onClick={() => onOpen(p)}><div className={'property-thumb thumb-' + (i%3)}><House size={23}/><span>{String(i+1).padStart(2,'0')}</span></div><div className="property-row-copy"><b>{p.name}</b><span><MapPin size={13}/>{p.address}</span><small>{p.propertyType} · {p.bedrooms === 0 ? 'Studio' : p.bedrooms + (p.bedrooms===1?' bedroom':' bedrooms')}</small></div><div className="property-row-price"><b>{money(p.rentAmount)}</b><span>/{p.rentDuration === 'year'?'year':'month'}</span><ArrowRight size={15}/></div></button>)}</div>:<div className="empty-shortlist"><div className="empty-illustration"><House size={29}/><Plus size={15}/></div><h3>No properties yet.</h3><p>Start with the place you’re viewing next. Add what you know, then build the rest during the inspection.</p><button className="button-secondary" onClick={onCreate}><Plus size={16}/> Add your first property</button></div>}<button className="panel-bottom-link" onClick={() => onNavigate('properties')}>View property list <ArrowRight size={15}/></button></section>
    <section className="panel checklist-panel"><div className="panel-head"><div><span className="eyebrow">THE WALKTHROUGH</span><h2>Inspect with intention.</h2></div><span className="round-icon"><ClipboardCheck size={20}/></span></div><p className="panel-intro">A guided set of checks for the building, utilities, surroundings, and the paperwork behind the deal.</p><div className="progress-block"><div className="progress-label"><span>Inspection progress</span><b>{progress}%</b></div><div className="progress-track"><span style={{width:progress+'%'}}/></div><div className="progress-meta"><span>{answered} of {CHECKLIST.flatMap(s=>s.items).length} checks answered</span><span>{concerns} flagged</span></div></div><div className="checklist-preview"><div><span className="preview-icon"><CheckCircle2 size={16}/></span><span><b>Inside the property</b><small>Structure, water, power, ventilation</small></span></div><div><span className="preview-icon"><Banknote size={16}/></span><span><b>Money and paperwork</b><small>Fees, tenancy terms, receipts</small></span></div><div><span className="preview-icon"><CircleHelp size={16}/></span><span><b>Questions to follow up</b><small>Keep answers with the property</small></span></div></div><button className="button-primary full-width" onClick={() => onNavigate(active ? 'inspection':'properties')}>{active ? 'Continue inspection':'Choose a property'} <ArrowRight size={16}/></button><p className="small-disclaimer">Unchecked means unknown, not approved. Record what you can verify.</p></section></div>
    <div className="bottom-note"><div className="note-icon"><ShieldCheck size={19}/></div><p><b>A note on peace of mind.</b> Before You Rent helps you organise observations and questions. It cannot verify a landlord, guarantee a building’s safety, or replace professional advice.</p><button onClick={() => onNavigate('settings')}>How your data works <ArrowRight size={14}/></button></div>
  </>;
}
function StatCard({icon,label,value,note,tone,onClick}:{icon:ReactNode;label:string;value:string;note:string;tone:string;onClick?:()=>void}) { return <button className={'stat-card stat-'+tone} onClick={onClick} disabled={!onClick}><span className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-trend"><ArrowDownRight size={15}/></span></span><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-note">{note}</span></button>; }

function PropertiesView({properties,search,setSearch,onCreate,onOpen,onDelete}:{properties:PropertyRecord[];search:string;setSearch:(s:string)=>void;onCreate:()=>void;onOpen:(p:PropertyRecord)=>void;onDelete:(p:PropertyRecord)=>void}) {
 return <><PageHeading eyebrow="YOUR SHORTLIST" title="Properties" description="Keep every viewing, fee, and follow-up tied to the right place." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/><div className="toolbar"><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by property or area…" aria-label="Search properties"/></div><span className="results-count">{properties.length} {properties.length===1?'property':'properties'}</span></div>{properties.length ? <div className="property-grid">{properties.map((p,i)=><article className="property-card" key={p.id}><div className={'property-card-art thumb-'+(i%3)}><span className="property-type-pill">{p.propertyType}</span><span className="property-card-number">{String(i+1).padStart(2,'0')}</span><House size={42}/></div><div className="property-card-body"><div className="property-card-title"><h3>{p.name}</h3><button className="icon-button tiny danger" onClick={()=>onDelete(p)} aria-label={'Delete '+p.name}><Trash2 size={15}/></button></div><p className="address-line"><MapPin size={14}/>{p.address}</p><div className="property-card-meta"><span><Building2 size={14}/>{p.bedrooms===0?'Studio':p.bedrooms+' bed'}</span><span><CalendarDays size={14}/>{shortDate(p.inspectionDate)}</span></div><div className="property-card-price"><div><strong>{money(p.rentAmount)}</strong><span> / {p.rentDuration}</span></div><button onClick={()=>onOpen(p)} aria-label={'Open '+p.name}><ArrowRight size={17}/></button></div></div></article>)}</div>:<div className="empty-state"><div className="empty-illustration"><House size={30}/></div><h3>{search?'No matching properties':'Your shortlist is empty'}</h3><p>{search?'Try another property name or neighbourhood.':'Add the first property you want to inspect. You can track costs, checks, and questions for each one.'}</p>{search?<button className="button-secondary" onClick={()=>setSearch('')}>Clear search</button>:<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}</div>}</>;
}

function InspectionView({active,answers,onCreate,onAnswer,onBack,onDelete}:{active:PropertyRecord|null;answers:InspectionAnswer[];onCreate:()=>void;onAnswer:(id:string,s:CheckStatus)=>void;onBack:()=>void;onDelete:()=>void}) {
 const [expanded,setExpanded] = useState<string[]>([CHECKLIST[0].section]);
 if (!active) return <div className="empty-state"><div className="empty-illustration"><ClipboardCheck size={30}/></div><h3>Choose a property to inspect</h3><p>Each checklist response is saved against a specific property.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button><button className="text-link" onClick={onBack}>View your properties</button></div>;
 const answered = answers.filter(a=>a.status!=='not_checked').length;
 const concerns = answers.filter(a=>a.status==='concern').length;
 const answerFor = (id:string) => answers.find(a=>a.itemId===id);
 return <><button className="back-link" onClick={onBack}><ArrowLeft size={15}/> All properties</button><PageHeading eyebrow="PROPERTY INSPECTION" title={active.name} description={<><MapPin size={14}/> {active.address} <span className="inline-dot">·</span> Viewing date {shortDate(active.inspectionDate)}</>} action={<div className="inspection-actions"><button className="button-secondary" onClick={()=>window.print()}><FileText size={15}/> Print report</button><button className="button-secondary" onClick={onDelete}><Trash2 size={15}/> Delete</button></div>}/><div className="inspection-summary"><div><span className="eyebrow">CHECKLIST PROGRESS</span><strong>{answered}<small> / {CHECKLIST.flatMap(s=>s.items).length}</small></strong><div className="progress-track"><span style={{width:(answered/CHECKLIST.flatMap(s=>s.items).length*100)+'%'}}/></div><p>{answered===0?'Start with the first section.':answered+' checks answered so far.'}</p></div><div className="summary-divider"/><div><span className="eyebrow">ITEMS TO FOLLOW UP</span><strong className="concern-number">{String(concerns).padStart(2,'0')}</strong><p>Concerns you marked for a closer look.</p></div><div className="summary-divider"/><div><span className="eyebrow">RENT AS ADVERTISED</span><strong className="rent-amount">{money(active.rentAmount)}</strong><p>Per {active.rentDuration}. Other charges may apply.</p></div></div><div className="section-head checklist-section-head"><div><span className="eyebrow">GUIDED WALKTHROUGH</span><h2>Look closely. Record honestly.</h2><p>Choose the response that reflects what you actually checked.</p></div><span className="checklist-count">{answered} / {CHECKLIST.flatMap(s=>s.items).length} completed</span></div><div className="checklist-sections">{CHECKLIST.map((section,idx)=>{const done=section.items.filter(item=>answerFor(item.id)&&answerFor(item.id)?.status!=='not_checked').length;const isOpen=expanded.includes(section.section);return <section className="checklist-section" key={section.section}><button className="checklist-section-title" onClick={()=>setExpanded(old=>isOpen?old.filter(s=>s!==section.section):[...old,section.section])}><span className="section-number">{String(idx+1).padStart(2,'0')}</span><span className="section-title-copy"><b>{section.section}</b><small>{done} of {section.items.length} answered</small></span><span className="section-mini-progress"><i style={{width:(done/section.items.length*100)+'%'}}/></span><ChevronDown size={18} className={isOpen?'chevron-open':''}/></button>{isOpen&&<div className="checklist-items">{section.items.map(item=>{const response=answerFor(item.id)?.status??'not_checked';return <div className="check-item" key={item.id}><div className="check-item-copy"><b>{item.label}</b><p>{item.help}</p></div><div className="status-options">{(['okay','concern','not_checked','not_applicable'] as CheckStatus[]).map(status=><button key={status} className={'status-option status-'+status+(response===status?' status-selected':'')} onClick={()=>onAnswer(item.id,status)} aria-pressed={response===status} title={statusText[status]}>{status==='okay'?<Check size={14}/>:status==='concern'?<CircleHelp size={14}/>:status==='not_checked'?<Clock3 size={14}/>:<span className="na-mark">—</span>}<span>{status==='okay'?'Okay':status==='concern'?'Concern':status==='not_checked'?'Not checked':'N/A'}</span></button>)}</div></div>})}</div>}</section>})}</div><PrintReport active={active} answers={answers}/><NotesPanel propertyId={active.id}/><PhotosPanel propertyId={active.id}/><div className="bottom-note"><div className="note-icon"><ShieldCheck size={19}/></div><p><b>Keep the standard honest.</b> “Okay” means you observed no obvious issue during this viewing. It does not certify the condition of the property. If you could not check it, leave it as not checked.</p></div></>;
}

function NotesPanel({propertyId}:{propertyId:string}) {
 const [notes,setNotes]=useState<import('./types').InspectionNote[]>([]);
 const [draft,setDraft]=useState('');
 const [answerDraft,setAnswerDraft]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;getNotes(propertyId).then(items=>{if(!cancelled)setNotes(items)}).catch(()=>setError('Could not load your follow-up questions.'));return()=>{cancelled=true}},[propertyId]);
 async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();const question=draft.trim();if(!question)return;const note:import('./types').InspectionNote={id:newId(),propertyId,question,answer:answerDraft.trim(),resolved:false,createdAt:new Date().toISOString()};try{await saveNote(note);setNotes(old=>[note,...old]);setDraft('');setAnswerDraft('')}catch{setError('This question could not be saved.')}}
 async function remove(id:string){try{await removeNote(id);setNotes(old=>old.filter(n=>n.id!==id))}catch{setError('This question could not be removed.')}}
 async function resolve(note:import('./types').InspectionNote){const updated={...note,resolved:!note.resolved};try{await saveNote(updated);setNotes(old=>old.map(n=>n.id===note.id?updated:n))}catch{setError('This update could not be saved.')}}
 return <section className="panel notes-panel"><div className="panel-head"><div><span className="eyebrow">FOLLOW-UP LOG</span><h2>Questions to get answered</h2></div><span className="round-icon"><CircleHelp size={19}/></span></div><p className="panel-intro">Write down anything the agent or landlord needs to clarify. Keep the answer with the question.</p>{error&&<div className="alert-error" role="alert">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}<form className="note-entry-form" onSubmit={add}><label>Question or issue<input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="e.g. Who pays for repairs to the water pump?" required maxLength={220}/></label><label>Answer or agreement, if known<input value={answerDraft} onChange={e=>setAnswerDraft(e.target.value)} placeholder="Leave blank until confirmed" maxLength={500}/></label><button type="submit" className="button-primary"><Plus size={15}/> Add to follow-up log</button></form>{notes.length>0&&<div className="notes-list">{notes.map(note=><article className={'follow-up-item '+(note.resolved?'follow-up-resolved':'')} key={note.id}><button className={'resolve-check '+(note.resolved?'resolve-checked':'')} onClick={()=>resolve(note)} aria-label={note.resolved?'Mark unresolved':'Mark answered'}>{note.resolved&&<Check size={13}/>}</button><div className="follow-up-copy"><b>{note.question}</b>{note.answer?<p>{note.answer}</p>:<small>Answer still needed</small>}<span>{note.resolved?'MARKED AS ANSWERED':'ADDED '+shortDate(note.createdAt.slice(0,10)).toUpperCase()}</span></div><button className="icon-button tiny danger" onClick={()=>remove(note.id)} aria-label="Delete question"><Trash2 size={14}/></button></article>)}</div>}</section>;
}
function PhotoThumb({photo,onRemove}:{photo:InspectionPhoto;onRemove:(id:string)=>void}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{const next=URL.createObjectURL(photo.blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[photo.blob]);
 return <article className="evidence-card"><div className="evidence-image">{url&&<img src={url} alt={photo.caption||photo.name}/>}<span className="evidence-date">{shortDate(photo.createdAt.slice(0,10))}</span></div><div className="evidence-caption"><b>{photo.caption||photo.name}</b><small>{photo.name}</small><button className="icon-button tiny danger" onClick={()=>onRemove(photo.id)} aria-label="Remove photo"><Trash2 size={14}/></button></div></article>;
}
function PhotosPanel({propertyId}:{propertyId:string}) {
 const [photos,setPhotos]=useState<InspectionPhoto[]>([]);
 const [caption,setCaption]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let cancelled=false;getPhotos(propertyId).then(items=>{if(!cancelled)setPhotos(items)}).catch(()=>setError('Could not load saved photos.'));return()=>{cancelled=true}},[propertyId]);
 async function addFiles(event:ChangeEvent<HTMLInputElement>){const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';if(!files.length)return;const invalid=files.find(file=>!file.type.startsWith('image/')||file.size>8*1024*1024);if(invalid){setError('Choose image files under 8 MB each. Large images can fill browser storage quickly.');return}setBusy(true);setError('');try{const added:InspectionPhoto[]=[];for(const file of files){const photo:InspectionPhoto={id:newId(),propertyId,name:file.name,mimeType:file.type,blob:file,caption:caption.trim(),createdAt:new Date().toISOString()};await savePhoto(photo);added.push(photo)}setPhotos(old=>[...added,...old]);setCaption('')}catch{setError('The image could not be saved. Browser storage may be full.')}finally{setBusy(false)}}
 async function remove(id:string){try{await removePhoto(id);setPhotos(old=>old.filter(photo=>photo.id!==id))}catch{setError('The image could not be removed.')}}
 return <section className="panel photos-panel"><div className="panel-head"><div><span className="eyebrow">VISUAL EVIDENCE</span><h2>Photos from the viewing</h2></div><span className="round-icon"><Camera size={19}/></span></div><p className="panel-intro">Photograph visible issues, meters, fittings, damage, and anything you want to ask about. Get permission before photographing people or private belongings.</p>{error&&<div className="alert-error" role="alert">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}<div className="photo-upload-row"><label className="photo-caption-field">Caption (optional)<input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="e.g. Damp patch beside bedroom window" maxLength={140}/></label><label className={'button-primary photo-upload '+(busy?'upload-disabled':'')}>{busy?'Saving…':<><ImagePlus size={16}/> Add photos</>}<input type="file" accept="image/*" multiple disabled={busy} onChange={addFiles}/></label></div><p className="photo-storage-note">Images stay in this browser. Up to 8 MB per image; storage availability depends on your device.</p>{photos.length?<div className="evidence-grid">{photos.map(photo=><PhotoThumb key={photo.id} photo={photo} onRemove={remove}/>)}</div>:<div className="photo-empty"><ImagePlus size={24}/><b>No viewing photos yet.</b><span>Evidence can make follow-up conversations more specific.</span></div>}</section>;
}
function PrintReport({active,answers}:{active:PropertyRecord;answers:InspectionAnswer[]}) {
 const answerFor=(id:string)=>answers.find(a=>a.itemId===id);
 const all=CHECKLIST.flatMap(section=>section.items);
 const answered=answers.filter(a=>a.status!=='not_checked').length;
 const concerns=answers.filter(a=>a.status==='concern').length;
 return <section className="print-report"><div className="print-brand">BEFORE YOU RENT <span>INSPECTION RECORD</span></div><h1>{active.name}</h1><p>{active.address}</p><div className="print-meta"><span><b>Viewing date</b>{shortDate(active.inspectionDate)}</span><span><b>Advertised rent</b>{money(active.rentAmount)} / {active.rentDuration}</span><span><b>Checks answered</b>{answered} of {all.length}</span><span><b>Concerns recorded</b>{concerns}</span></div>{CHECKLIST.map(section=><div className="print-section" key={section.section}><h2>{section.section}</h2>{section.items.map(item=>{const status=answerFor(item.id)?.status??'not_checked';return <div className="print-item" key={item.id}><span>{item.label}</span><b>{statusText[status]}</b></div>})}</div>)}<p className="print-disclaimer">This record reflects observations entered by the renter. It is not a building inspection certificate, legal opinion, landlord identity verification, or guarantee of safety. “Looks okay” means no obvious concern was recorded at the time; it does not confirm hidden conditions. Items marked “Not checked” remain unknown.</p><p className="print-generated">Generated by Before You Rent on {new Date().toLocaleString('en-NG')}</p></section>;
}

function CostsView({active,onCreate}:{active:PropertyRecord|null;onCreate:()=>void}) {
 const [costs,setCosts] = useState<import('./types').PropertyCost[]>([]);
 const [adding,setAdding] = useState(false);
 const [costError,setCostError] = useState('');
 useEffect(() => { let cancelled=false; if(active) getCosts(active.id).then(items=>{if(!cancelled)setCosts(items)}).catch(()=>setCostError('Could not load saved costs.')); return ()=>{cancelled=true}; },[active]);
 const total = costs.reduce((sum,item)=>sum+item.amount,0);
 async function addCost(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); if(!active)return;
  const form=new FormData(event.currentTarget); const amount=Number(form.get('amount'));
  if(!Number.isFinite(amount)||amount<0)return;
  const item:import('./types').PropertyCost={id:newId(),propertyId:active.id,label:String(form.get('label')||'').trim(),amount,kind:String(form.get('kind')) as 'upfront'|'recurring',refundable:form.get('refundable')==='on',frequency:String(form.get('frequency')) as 'once'|'monthly'|'yearly',note:String(form.get('note')||'').trim()};
  try { await saveCost(item); setCosts(old=>[...old,item]); setAdding(false); }
  catch { setCostError('This cost could not be saved. Try again.'); }
 }
 async function remove(id:string) { try { await removeCost(id); setCosts(old=>old.filter(item=>item.id!==id)); } catch { setCostError('This cost could not be removed.'); } }
 return <><PageHeading eyebrow="MONEY, WITHOUT SURPRISES" title="Cost breakdown" description="Rent is one line in the budget. Get the full payment picture before committing." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>{active?<><div className="costs-property-strip"><div className="property-thumb thumb-1"><House size={23}/></div><div><b>{active.name}</b><span><MapPin size={13}/>{active.address}</span></div><span className="selected-label">SELECTED PROPERTY</span></div>{costError&&<div className="alert-error" role="alert">{costError}<button onClick={()=>setCostError('')}><X size={15}/></button></div>}<div className="costs-layout"><section className="panel cost-summary-panel"><span className="eyebrow">CURRENTLY RECORDED</span><h2>Know the cash you’ll need.</h2><p>Keep refundable deposits separate from non-refundable charges. A deposit still affects the amount you need upfront.</p><div className="cost-total"><span>Advertised rent</span><strong>{money(active.rentAmount)}</strong><small>Per {active.rentDuration}</small></div><div className="cost-total"><span>Additional charges recorded</span><strong>{money(total)}</strong><small>{costs.length} recorded item{costs.length===1?'':'s'}</small></div><div className="cost-total cost-total-highlight"><span>Rent plus recorded charges</span><strong>{money(active.rentAmount+total)}</strong><small>Not yet a complete move-in estimate</small></div><div className="cost-tip"><Banknote size={19}/><span><b>Ask for a written breakdown.</b> Agency, legal, caution, service, utility, and other fees vary. Confirm which are refundable and who receives each payment.</span></div></section><section className="panel cost-list-panel"><div className="panel-head"><div><span className="eyebrow">PAYMENTS TO CLARIFY</span><h2>Fees and deposits</h2></div><button className="icon-button subtle" onClick={()=>setAdding(!adding)} aria-label="Add a cost"><Plus size={18}/></button></div>{adding&&<form className="cost-entry-form" onSubmit={addCost}><label>Payment name<input name="label" required placeholder="e.g. Caution deposit" maxLength={90}/></label><label>Amount in naira<input name="amount" type="number" min="0" step="100" required placeholder="e.g. 150000"/></label><div className="form-row"><label>Payment type<select name="kind"><option value="upfront">Upfront / one-off</option><option value="recurring">Recurring</option></select></label><label>Frequency<select name="frequency"><option value="once">One time</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div><label className="check-label"><input type="checkbox" name="refundable"/> Refundable deposit</label><label>Notes (optional)<input name="note" placeholder="Who receives it? What was agreed?"/></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={()=>setAdding(false)}>Cancel</button><button type="submit" className="button-primary">Save payment</button></div></form>}{costs.length===0&&!adding?<div className="cost-list-empty"><div className="empty-illustration"><Wallet size={26}/></div><h3>No additional fees recorded.</h3><p>Ask for a complete fee breakdown and record each amount, including deposits and recurring charges.</p><button className="button-secondary" onClick={()=>setAdding(true)}><Plus size={15}/> Add a payment</button></div>:<div className="cost-items-list">{costs.map(item=><div className="cost-item-row" key={item.id}><div className="cost-item-icon">{item.refundable?<ArrowDownRight size={17}/>:<Banknote size={17}/>}</div><div className="cost-item-copy"><b>{item.label}</b><span>{item.kind==='upfront'?'Upfront':'Recurring'} · {item.frequency==='once'?'one time':item.frequency}</span>{item.note&&<small>{item.note}</small>}<div className="cost-badges">{item.refundable&&<span>REFUNDABLE DEPOSIT</span>}</div></div><div className="cost-item-price"><b>{money(item.amount)}</b><button className="icon-button tiny danger" onClick={()=>remove(item.id)} aria-label={'Remove '+item.label}><Trash2 size={14}/></button></div></div>)}</div>}</section></div></>:<div className="empty-state"><div className="empty-illustration"><Wallet size={30}/></div><h3>Choose a property first</h3><p>Cost breakdowns are kept separately for each place you’re considering.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button></div>}</>;
}

function CompareView({properties,onOpen,onCreate}:{properties:PropertyRecord[];onOpen:(p:PropertyRecord)=>void;onCreate:()=>void}) { return <><PageHeading eyebrow="A CLEARER SIDE-BY-SIDE" title="Compare your options" description="Compare what you know, what you still need to ask, and what each property will cost." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>{properties.length<2?<div className="empty-state"><div className="empty-illustration"><SlidersHorizontal size={30}/></div><h3>Two properties make a comparison.</h3><p>Add at least two places to compare rent, location, property type, and inspection progress side by side.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button></div>:<div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>DETAIL</th>{properties.map(p=><th key={p.id}><button className="compare-property-name" onClick={()=>onOpen(p)}>{p.name}<ArrowUpRightFallback/></button><small>{p.address}</small></th>)}</tr></thead><tbody><tr><th>Advertised rent</th>{properties.map(p=><td key={p.id}><strong>{money(p.rentAmount)}</strong><small>per {p.rentDuration}</small></td>)}</tr><tr><th>Property type</th>{properties.map(p=><td key={p.id}>{p.propertyType}</td>)}</tr><tr><th>Bedrooms</th>{properties.map(p=><td key={p.id}>{p.bedrooms===0?'Studio':p.bedrooms}</td>)}</tr><tr><th>Viewing date</th>{properties.map(p=><td key={p.id}>{shortDate(p.inspectionDate)}</td>)}</tr><tr><th>Inspection record</th>{properties.map(p=><td key={p.id}><button className="table-action" onClick={()=>onOpen(p)}>Open inspection <ArrowRight size={14}/></button></td>)}</tr></tbody></table><p className="small-disclaimer">This comparison shows the property details currently recorded. Add fees and complete inspections before relying on it to decide.</p></div>}</>; }
function ArrowUpRightFallback() { return <ArrowRight size={14}/>; }
function SettingsView({onExport,onImport,count}:{onExport:()=>void;onImport:(file:File)=>void;count:number}) {
