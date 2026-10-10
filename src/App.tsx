import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Camera, ImagePlus, ArrowDownRight, ArrowLeft, ArrowRight, Banknote, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FileText, Home, House, ListChecks, MapPin, Menu, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { deleteAllData, deleteProperty, getAnswers, getCosts, getNotes, getPhotos, getProperties, importBackupData, removeCost, removeNote, removePhoto, saveAnswer, saveCost, saveNote, savePhoto, saveProperty } from './db';
import { CHECKLIST, type CheckStatus, type InspectionAnswer, type InspectionNote, type InspectionPhoto, type PropertyCost, type PropertyRecord } from './types';
import MarketingSite from './MarketingSite';
import { rentMonthlyEquivalent, rentPeriodLabel, summarizeCosts } from './finance';
import { validateBackupPayload } from './backup';

type View = 'overview' | 'properties' | 'inspection' | 'costs' | 'compare' | 'settings';
const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
const shortDate = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => crypto.randomUUID();
const statusText: Record<CheckStatus, string> = { okay: 'Looks okay', concern: 'Needs attention', not_checked: 'Not checked', not_applicable: 'Not applicable' };
function blobToDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function dataUrlToBlob(value:string):Blob{const parts=value.split(',');if(parts.length!==2||!parts[0].startsWith('data:image/'))throw new Error('A photo in this backup is invalid.');const mime=parts[0].slice(5).split(';')[0];const binary=atob(parts[1]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:mime})}

function WorkspaceApp() {
  const [view, setView] = useState<View>('overview');
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [answers, setAnswers] = useState<InspectionAnswer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyRecord | null>(null);
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
  useEffect(() => { if (new URLSearchParams(window.location.search).get('start') === 'property') setShowCreate(true); }, []);
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
    const bedrooms = Number(form.get('bedrooms'));
    const inspectionDate = String(form.get('inspectionDate') || '');
    const rentDuration = String(form.get('rentDuration') || 'year') as PropertyRecord['rentDuration'];
    if (!name || !address || !Number.isFinite(rentAmount) || rentAmount <= 0 || !Number.isInteger(bedrooms) || bedrooms < 0 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(inspectionDate) || Number.isNaN(Date.parse(inspectionDate + 'T00:00:00'))) { setError('Enter a property name, address, positive rent amount, valid bedroom count, and viewing date.'); return; }
    const now = new Date().toISOString();
    const item: PropertyRecord = { ...(editingProperty ?? {} as PropertyRecord), id: editingProperty?.id ?? newId(), name, address, propertyType: String(form.get('propertyType') || 'Flat'), bedrooms, rentAmount, rentDuration, inspectionDate, createdAt: editingProperty?.createdAt ?? now, updatedAt: now, notes: editingProperty?.notes ?? '' };
    try {
      await saveProperty(item);
      await refresh();
      setActiveId(item.id);
      setShowCreate(false);
      setEditingProperty(null);
      setView('inspection');
      setToast(editingProperty ? 'Property details updated. Your checklist, costs, notes, and photos are unchanged.' : 'Property added. Start with what you can observe.');
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
  function startCreate() { setEditingProperty(null); setShowCreate(true); }
  function startEdit(property: PropertyRecord) { setEditingProperty(property); setShowCreate(true); }
  async function importData(file: File) {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is larger than 50 MB.');
      const parsed = JSON.parse(await file.text()) as { schemaVersion: number; properties: PropertyRecord[]; details: Array<{ id: string; answers: InspectionAnswer[]; costs: PropertyCost[]; notes: InspectionNote[]; photos: Array<Omit<InspectionPhoto,'blob'> & {blob:string}> }> };
      const validationError = validateBackupPayload(parsed);
      if (validationError) throw new Error(validationError);
      if (!window.confirm('Import ' + parsed.properties.length + ' properties? This merges the backup into this browser. Matching IDs will be overwritten; unrelated records will remain. Photo evidence is included.')) return;
      const restoredDetails = parsed.details.map(detail => ({
        id: detail.id,
        answers: detail.answers,
        costs: detail.costs,
        notes: detail.notes,
        photos: detail.photos.map(photo => ({ ...photo, blob: dataUrlToBlob(photo.blob) })),
      }));
      await importBackupData(parsed.properties, restoredDetails);
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
      const backupBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (backupBlob.size > 50 * 1024 * 1024) throw new Error('Backup exceeds the 50 MB import limit. Remove or reduce large photos, then export again.');
      const url = URL.createObjectURL(backupBlob);
      const a = document.createElement('a'); a.href = url; a.download = 'before-you-rent-backup.json'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast('Backup created. Keep it somewhere private and secure.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (e) {
      setError(e instanceof Error ? 'Export failed: ' + e.message : 'Export failed. Your browser may not have enough memory to package the selected records and photos.');
    }
  }

  return <div className="app-shell">
    <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
      <button className="brand" onClick={() => navigate('overview')} aria-label="Before You Rent home"><span className="brand-mark"><House size={19} strokeWidth={2.4}/></span><span className="brand-copy">Before you <b>rent.</b></span></button>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        <NavItem active={view === 'overview'} icon={<Home size={18}/>} label="Overview" onClick={() => navigate('overview')}/>
        <NavItem active={view === 'properties'} icon={<Building2 size={18}/>} label="My properties" count={properties.length} onClick={() => navigate('properties')}/>
        <NavItem active={view === 'inspection'} icon={<ClipboardCheck size={18}/>} label="Inspection checklist" onClick={() => active ? navigate('inspection') : setShowCreate(true)}/>
        <NavItem active={view === 'costs'} icon={<Wallet size={18}/>} label="Cost breakdown" onClick={() => active ? navigate('costs') : setShowCreate(true)}/>
        <NavItem active={view === 'compare'} icon={<SlidersHorizontal size={18}/>} label="Compare options" onClick={() => navigate('compare')} disabled={properties.length < 2}/>
      </nav>
      <div className="sidebar-bottom">
        
        <button className="nav-item" onClick={() => navigate('settings')}><span className="nav-icon"><CircleHelp size={18}/></span><span>Data & help</span></button>
        <div className="sidebar-foot"><span className="online-dot"/> PRIVATE BY DEFAULT <span className="version">V0.1</span></div>
      </div>
    </aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open menu"><Menu size={21}/></button><div className="breadcrumb">Your space <span>/</span> <b>{viewLabels[view]}</b></div><div className="topbar-right"><button className="avatar" title="Workspace">BYR</button></div></header>
      <div className="page-content">
        {error && <div className="alert-error" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {loading ? <div className="loading-state"><div className="loader"/><p>Opening your workspace…</p></div> : <>
          {view === 'overview' && <Overview properties={properties} active={active} answered={answered} concerns={concerns} progress={progress} onCreate={() => setShowCreate(true)} onNavigate={navigate} onOpen={startInspection}/>}
          {view === 'properties' && <PropertiesView properties={filtered} search={search} setSearch={setSearch} onCreate={startCreate} onEdit={startEdit} onOpen={startInspection} onDelete={async p => { if(window.confirm('Delete ' + p.name + ' and all its local inspection data?')) { await deleteProperty(p.id); await refresh(); } }}/>}
          {view === 'inspection' && <InspectionView active={active} answers={answers} onCreate={startCreate} onEdit={startEdit} onAnswer={updateAnswer} onBack={() => navigate('properties')} onDelete={removeActive}/>}
          {view === 'costs' && <CostsView active={active} onCreate={startCreate}/>}
          {view === 'compare' && <CompareView properties={properties} onOpen={startInspection} onCreate={startCreate}/>}
          {view === 'settings' && <SettingsView onExport={exportData} onImport={importData} onDeleteAll={async () => { if(!window.confirm('Permanently delete every property, checklist response, cost, note, and photo saved in this browser? Export a backup first if you may need these records. This cannot be undone.')) return; try { await deleteAllData(); setProperties([]); setActiveId(''); setAnswers([]); setView('overview'); setToast('All local property data and photos have been deleted.'); } catch { setError('Could not delete all local data. Please try again.'); } }} count={properties.length}/>}
        </>}
      </div>
      <footer className="page-footer"><span>Before You Rent <span className="footer-dot">•</span> Make a better-informed move</span><span className="workspace-footer-links"><a href="/">Home</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>Decision support, not a property safety certification.</span></span></footer>
    </main>
    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if(e.target === e.currentTarget) { setShowCreate(false); setEditingProperty(null); } }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-head"><div><span className="eyebrow">{editingProperty ? 'EDIT PROPERTY' : 'NEW PROPERTY'}</span><h2 id="create-title">{editingProperty ? 'Correct the property details.' : 'Let’s get the details down.'}</h2><p>{editingProperty ? 'Update the details without losing the inspection record.' : 'Add the basics now. You can fill in the rest while inspecting.'}</p></div><button className="icon-button" onClick={() => { setShowCreate(false); setEditingProperty(null); }} aria-label="Close"><X size={20}/></button></div><form onSubmit={createProperty} className="create-form"><label>Property name <input name="name" defaultValue={editingProperty?.name ?? ''} placeholder="e.g. Flat on Awolowo Road" required autoFocus maxLength={90}/></label><label>Address or area <input name="address" defaultValue={editingProperty?.address ?? ''} placeholder="Street, neighbourhood, city" required maxLength={180}/></label><div className="form-row"><label>Property type<select name="propertyType" defaultValue={editingProperty?.propertyType ?? 'Flat'}><option>Flat</option><option>Self-contained</option><option>Duplex</option><option>Room</option><option>Terrace</option><option>Bungalow</option><option>Shared apartment</option><option>Other</option></select></label><label>Bedrooms<select name="bedrooms" defaultValue={String(editingProperty?.bedrooms ?? 1)}><option value="0">Studio / none</option><option value="1">1 bedroom</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4+ bedrooms</option></select></label></div><label>Advertised rent <div className="money-input"><span>₦</span><input name="rentAmount" type="number" min="1" step="100" defaultValue={editingProperty?.rentAmount ?? ''} placeholder="e.g. 1800000" required/></div></label><div className="form-row"><label>Rent period<select name="rentDuration" defaultValue={editingProperty?.rentDuration ?? 'year'}><option value="month">Per month</option><option value="quarter">Every 3 months</option><option value="half_year">Every 6 months</option><option value="year">Per year</option></select></label><label>Inspection date<input name="inspectionDate" type="date" defaultValue={editingProperty?.inspectionDate ?? today()} required/></label></div><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => { setShowCreate(false); setEditingProperty(null); }}>Cancel</button><button type="submit" className="button-primary">{editingProperty ? 'Save changes' : 'Create property'} <ArrowRight size={16}/></button></div></form></section></div>}
    {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}

const viewLabels: Record<View,string> = { overview:'Overview', properties:'My properties', inspection:'Inspection', costs:'Cost breakdown', compare:'Compare options', settings:'Data & help' };
function NavItem({ active, icon, label, count, onClick, disabled=false }: {active:boolean; icon:ReactNode; label:string; count?:number; onClick:()=>void; disabled?:boolean}) { return <button className={'nav-item ' + (active?'nav-active ':'') + (disabled?'nav-disabled':'')} onClick={onClick} disabled={disabled}><span className="nav-icon">{icon}</span><span>{label}</span>{count !== undefined && <span className="nav-count">{count}</span>}{active && <span className="active-line"/>}</button>; }

function PageHeading({ eyebrow, title, description, action }: {eyebrow:string;title:ReactNode;description:ReactNode;action?:ReactNode}) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }

function Overview({properties,active,answered,concerns,progress,onCreate,onNavigate,onOpen}:{properties:PropertyRecord[];active:PropertyRecord|null;answered:number;concerns:number;progress:number;onCreate:()=>void;onNavigate:(v:View)=>void;onOpen:(p:PropertyRecord)=>void}) {
  const recent = [...properties].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3);
  return <><PageHeading eyebrow="YOUR RENTING WORKSPACE" title={<>Find a place. <span className="title-accent">Know what you’re getting.</span></>} description="A calmer way to inspect a rental, get clear on the real cost, and keep your questions in one place." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>
    <section className="welcome-banner"><div className="banner-text"><span className="banner-kicker"><Sparkles size={14}/> A LITTLE MORE CERTAINTY</span><h2>Don’t let the viewing be<br/>the only thing you remember.</h2><p>Capture the details while you’re there. Make the decision when you’ve had time to think.</p><button className="banner-link" onClick={() => onNavigate('properties')}>{properties.length ? 'View your properties':'Start with a property'} <ArrowRight size={16}/></button></div><div className="banner-art" aria-hidden="true"><div className="art-sun"/><div className="art-house"><div className="art-roof"/><div className="art-wall"><div className="art-window"/><div className="art-door"/></div></div><div className="art-plant art-plant-one"/><div className="art-plant art-plant-two"/><div className="art-ground"/></div><span className="banner-index">01 / YOUR NEXT MOVE</span></section>
    <div className="section-head"><div><span className="eyebrow">AT A GLANCE</span><h2>Your renting progress</h2></div><button className="text-link" onClick={() => onNavigate('properties')}>All properties <ArrowRight size={15}/></button></div>
    <div className="stats-grid"><StatCard icon={<Building2 size={18}/>} label="Properties tracked" value={String(properties.length).padStart(2,'0')} note={properties.length ? 'Your shortlist is taking shape':'Start your shortlist'} tone="cream"/><StatCard icon={<ListChecks size={18}/>} label="Checks completed" value={String(answered).padStart(2,'0')} note={properties.length ? 'Across the selected inspection':'Nothing missed by memory alone'} tone="mint"/><StatCard icon={<ShieldCheck size={18}/>} label="Concerns recorded" value={String(concerns).padStart(2,'0')} note="Worth a second look" tone="peach"/><StatCard icon={<Wallet size={18}/>} label="Move-in costs" value={properties.length ? 'Review':'—'} note="Rent is only part of the picture" tone="lilac" onClick={() => active && onNavigate('costs')}/></div>
    <div className="content-columns"><section className="panel properties-panel"><div className="panel-head"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>{properties.length ? 'Properties in the mix':'Your first property starts here'}</h2></div><button className="icon-button subtle" onClick={() => onNavigate('properties')} aria-label="View properties"><ArrowRight size={18}/></button></div>{properties.length ? <div className="recent-list">{recent.map((p,i)=><button className="property-row" key={p.id} onClick={() => onOpen(p)}><div className={'property-thumb thumb-' + (i%3)}><House size={23}/><span>{String(i+1).padStart(2,'0')}</span></div><div className="property-row-copy"><b>{p.name}</b><span><MapPin size={13}/>{p.address}</span><small>{p.propertyType} · {p.bedrooms === 0 ? 'Studio' : p.bedrooms + (p.bedrooms===1?' bedroom':' bedrooms')}</small></div><div className="property-row-price"><b>{money(p.rentAmount)}</b><span>/{rentPeriodLabel(p.rentDuration)}</span><ArrowRight size={15}/></div></button>)}</div>:<div className="empty-shortlist"><div className="empty-illustration"><House size={29}/><Plus size={15}/></div><h3>No properties yet.</h3><p>Start with the place you’re viewing next. Add what you know, then build the rest during the inspection.</p><button className="button-secondary" onClick={onCreate}><Plus size={16}/> Add your first property</button></div>}<button className="panel-bottom-link" onClick={() => onNavigate('properties')}>View property list <ArrowRight size={15}/></button></section>
    <section className="panel checklist-panel"><div className="panel-head"><div><span className="eyebrow">THE WALKTHROUGH</span><h2>Inspect with intention.</h2></div><span className="round-icon"><ClipboardCheck size={20}/></span></div><p className="panel-intro">A guided set of checks for the building, utilities, surroundings, and the paperwork behind the deal.</p><div className="progress-block"><div className="progress-label"><span>Inspection progress</span><b>{progress}%</b></div><div className="progress-track"><span style={{width:progress+'%'}}/></div><div className="progress-meta"><span>{answered} of {CHECKLIST.flatMap(s=>s.items).length} checks answered</span><span>{concerns} flagged</span></div></div><div className="checklist-preview"><div><span className="preview-icon"><CheckCircle2 size={16}/></span><span><b>Inside the property</b><small>Structure, water, power, ventilation</small></span></div><div><span className="preview-icon"><Banknote size={16}/></span><span><b>Money and paperwork</b><small>Fees, tenancy terms, receipts</small></span></div><div><span className="preview-icon"><CircleHelp size={16}/></span><span><b>Questions to follow up</b><small>Keep answers with the property</small></span></div></div><button className="button-primary full-width" onClick={() => active ? onNavigate('inspection') : onCreate()}>{active ? 'Continue inspection':'Start with a property'} <ArrowRight size={16}/></button><p className="small-disclaimer">Unchecked means unknown, not approved. Record what you can verify.</p></section></div>
    <div className="bottom-note"><div className="note-icon"><ShieldCheck size={19}/></div><p><b>A note on peace of mind.</b> Before You Rent helps you organise observations and questions. It cannot verify a landlord, guarantee a building’s safety, or replace professional advice.</p><button onClick={() => onNavigate('settings')}>How your data works <ArrowRight size={14}/></button></div>
  </>;
}
function StatCard({icon,label,value,note,tone,onClick}:{icon:ReactNode;label:string;value:string;note:string;tone:string;onClick?:()=>void}) { return <button className={'stat-card stat-'+tone} onClick={onClick} disabled={!onClick}><span className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-trend"><ArrowDownRight size={15}/></span></span><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-note">{note}</span></button>; }

function PropertiesView({properties,search,setSearch,onCreate,onEdit,onOpen,onDelete}:{properties:PropertyRecord[];search:string;setSearch:(s:string)=>void;onCreate:()=>void;onEdit:(p:PropertyRecord)=>void;onOpen:(p:PropertyRecord)=>void;onDelete:(p:PropertyRecord)=>void}) {
 return <><PageHeading eyebrow="YOUR SHORTLIST" title="Properties" description="Keep every viewing, fee, and follow-up tied to the right place." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/><div className="toolbar"><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by property or area…" aria-label="Search properties"/></div><span className="results-count">{properties.length} {properties.length===1?'property':'properties'}</span></div>{properties.length ? <div className="property-grid">{properties.map((p,i)=><article className="property-card" key={p.id}><div className={'property-card-art thumb-'+(i%3)}><span className="property-type-pill">{p.propertyType}</span><span className="property-card-number">{String(i+1).padStart(2,'0')}</span><House size={42}/></div><div className="property-card-body"><div className="property-card-title"><h3>{p.name}</h3><div className="property-card-actions"><button className="icon-button tiny" onClick={()=>onEdit(p)} aria-label={'Edit '+p.name} title="Edit property"><FileText size={15}/></button><button className="icon-button tiny danger" onClick={()=>onDelete(p)} aria-label={'Delete '+p.name}><Trash2 size={15}/></button></div></div><p className="address-line"><MapPin size={14}/>{p.address}</p><div className="property-card-meta"><span><Building2 size={14}/>{p.bedrooms===0?'Studio':p.bedrooms+' bed'}</span><span><CalendarDays size={14}/>{shortDate(p.inspectionDate)}</span></div><div className="property-card-price"><div><strong>{money(p.rentAmount)}</strong><span> {rentPeriodLabel(p.rentDuration)}</span></div><button onClick={()=>onOpen(p)} aria-label={'Open '+p.name}><ArrowRight size={17}/></button></div></div></article>)}</div>:<div className="empty-state"><div className="empty-illustration"><House size={30}/></div><h3>{search?'No matching properties':'Your shortlist is empty'}</h3><p>{search?'Try another property name or neighbourhood.':'Add the first property you want to inspect. You can track costs, checks, and questions for each one.'}</p>{search?<button className="button-secondary" onClick={()=>setSearch('')}>Clear search</button>:<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}</div>}</>;
}

function InspectionView({active,answers,onCreate,onEdit,onAnswer,onBack,onDelete}:{active:PropertyRecord|null;answers:InspectionAnswer[];onCreate:()=>void;onEdit:(p:PropertyRecord)=>void;onAnswer:(id:string,s:CheckStatus)=>void;onBack:()=>void;onDelete:()=>void}) {
 const [expanded,setExpanded] = useState<string[]>([CHECKLIST[0].section]);
 if (!active) return <div className="empty-state"><div className="empty-illustration"><ClipboardCheck size={30}/></div><h3>Choose a property to inspect</h3><p>Each checklist response is saved against a specific property.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button><button className="text-link" onClick={onBack}>View your properties</button></div>;
 const answered = answers.filter(a=>a.status!=='not_checked').length;
 const concerns = answers.filter(a=>a.status==='concern').length;
 const answerFor = (id:string) => answers.find(a=>a.itemId===id);
 return <><button className="back-link" onClick={onBack}><ArrowLeft size={15}/> All properties</button><PageHeading eyebrow="PROPERTY INSPECTION" title={active.name} description={<><MapPin size={14}/> {active.address} <span className="inline-dot">·</span> Viewing date {shortDate(active.inspectionDate)}</>} action={<div className="inspection-actions"><button className="button-secondary" onClick={()=>onEdit(active)}><FileText size={15}/> Edit details</button><button className="button-secondary" onClick={()=>window.print()}><FileText size={15}/> Print report</button><button className="button-secondary" onClick={onDelete}><Trash2 size={15}/> Delete</button></div>}/><div className="inspection-summary"><div><span className="eyebrow">CHECKLIST PROGRESS</span><strong>{answered}<small> / {CHECKLIST.flatMap(s=>s.items).length}</small></strong><div className="progress-track"><span style={{width:(answered/CHECKLIST.flatMap(s=>s.items).length*100)+'%'}}/></div><p>{answered===0?'Start with the first section.':answered+' checks answered so far.'}</p></div><div className="summary-divider"/><div><span className="eyebrow">ITEMS TO FOLLOW UP</span><strong className="concern-number">{String(concerns).padStart(2,'0')}</strong><p>Concerns you marked for a closer look.</p></div><div className="summary-divider"/><div><span className="eyebrow">RENT AS ADVERTISED</span><strong className="rent-amount">{money(active.rentAmount)}</strong><p>{rentPeriodLabel(active.rentDuration)}. Other charges may apply.</p></div></div><div className="section-head checklist-section-head"><div><span className="eyebrow">GUIDED WALKTHROUGH</span><h2>Look closely. Record honestly.</h2><p>Choose the response that reflects what you actually checked.</p></div><span className="checklist-count">{answered} / {CHECKLIST.flatMap(s=>s.items).length} completed</span></div><div className="checklist-sections">{CHECKLIST.map((section,idx)=>{const done=section.items.filter(item=>answerFor(item.id)&&answerFor(item.id)?.status!=='not_checked').length;const isOpen=expanded.includes(section.section);return <section className="checklist-section" key={section.section}><button className="checklist-section-title" onClick={()=>setExpanded(old=>isOpen?old.filter(s=>s!==section.section):[...old,section.section])}><span className="section-number">{String(idx+1).padStart(2,'0')}</span><span className="section-title-copy"><b>{section.section}</b><small>{done} of {section.items.length} answered</small></span><span className="section-mini-progress"><i style={{width:(done/section.items.length*100)+'%'}}/></span><ChevronDown size={18} className={isOpen?'chevron-open':''}/></button>{isOpen&&<div className="checklist-items">{section.items.map(item=>{const response=answerFor(item.id)?.status??'not_checked';return <div className="check-item" key={item.id}><div className="check-item-copy"><b>{item.label}</b><p>{item.help}</p></div><div className="status-options">{(['okay','concern','not_checked','not_applicable'] as CheckStatus[]).map(status=><button key={status} className={'status-option status-'+status+(response===status?' status-selected':'')} onClick={()=>onAnswer(item.id,status)} aria-pressed={response===status} title={statusText[status]}>{status==='okay'?<Check size={14}/>:status==='concern'?<CircleHelp size={14}/>:status==='not_checked'?<Clock3 size={14}/>:<span className="na-mark">—</span>}<span>{status==='okay'?'Okay':status==='concern'?'Concern':status==='not_checked'?'Not checked':'N/A'}</span></button>)}</div></div>})}</div>}</section>})}</div><PrintReport active={active} answers={answers}/><NotesPanel propertyId={active.id}/><PhotosPanel propertyId={active.id}/><div className="bottom-note"><div className="note-icon"><ShieldCheck size={19}/></div><p><b>Keep the standard honest.</b> “Okay” means you observed no obvious issue during this viewing. It does not certify the condition of the property. If you could not check it, leave it as not checked.</p></div></>;
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
function PrintPhoto({photo}:{photo:InspectionPhoto}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{const next=URL.createObjectURL(photo.blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[photo.blob]);
 return <figure className="print-photo">{url&&<img src={url} alt={photo.caption||photo.name}/>}<figcaption>{photo.caption||photo.name} · {shortDate(photo.createdAt.slice(0,10))}</figcaption></figure>;
}
function PrintReport({active,answers}:{active:PropertyRecord;answers:InspectionAnswer[]}) {
 const [costs,setCosts]=useState<PropertyCost[]>([]);
 const [notes,setNotes]=useState<InspectionNote[]>([]);
 const [photos,setPhotos]=useState<InspectionPhoto[]>([]);
 const [loadError,setLoadError]=useState('');
 useEffect(()=>{let cancelled=false;Promise.all([getCosts(active.id),getNotes(active.id),getPhotos(active.id)]).then(([c,n,p])=>{if(!cancelled){setCosts(c);setNotes(n);setPhotos(p)}}).catch(()=>{if(!cancelled)setLoadError('Some report details could not be loaded. Reopen the report and try again.')});return()=>{cancelled=true}},[active.id]);
 const answerFor=(id:string)=>answers.find(a=>a.itemId===id);
 const all=CHECKLIST.flatMap(section=>section.items);
 const answered=answers.filter(a=>a.status!=='not_checked').length;
 const concerns=answers.filter(a=>a.status==='concern').length;
 const summary=summarizeCosts(active,costs);
 return <section className="print-report"><div className="print-brand">BEFORE YOU RENT <span>INSPECTION RECORD</span></div><h1>{active.name}</h1><p>{active.address}</p><div className="print-meta"><span><b>Property type</b>{active.propertyType} · {active.bedrooms===0?'Studio':active.bedrooms+' bedroom(s)'}</span><span><b>Viewing date</b>{shortDate(active.inspectionDate)}</span><span><b>Advertised rent</b>{money(active.rentAmount)} · {rentPeriodLabel(active.rentDuration)}</span><span><b>Monthly rent equivalent</b>{money(summary?.rentMonthly??rentMonthlyEquivalent(active.rentAmount,active.rentDuration))}</span><span><b>Checks answered</b>{answered} of {all.length}</span><span><b>Concerns recorded</b>{concerns}</span></div>
 <div className="print-section"><h2>Cost summary</h2>{summary&&<><div className="print-item"><span>Rent payment for advertised period</span><b>{money(summary.rentDueNow)}</b></div><div className="print-item"><span>Other upfront cash (including refundable deposits)</span><b>{money(summary.upfrontTotal)}</b></div><div className="print-item"><span>Of which refundable deposits</span><b>{money(summary.refundableUpfront)}</b></div><div className="print-item"><span>Non-refundable upfront payments</span><b>{money(summary.nonRefundableUpfront)}</b></div><div className="print-item"><span>Estimated cash due at start</span><b>{money(summary.cashDueAtStart)}</b></div><div className="print-item"><span>Recurring charges, monthly equivalent</span><b>{money(summary.recurringMonthly)}</b></div><div className="print-item"><span>Rent + recurring charges, monthly equivalent</span><b>{money(summary.monthlyEquivalentTotal)}</b></div></>}{costs.map(cost=><div className="print-item" key={cost.id}><span>{cost.label}{cost.refundable?' (refundable deposit)':''} · {cost.kind==='upfront'?'upfront':cost.frequency}</span><b>{money(cost.amount)}{cost.note?' · '+cost.note:''}</b></div>)}</div>
 {CHECKLIST.map(section=><div className="print-section" key={section.section}><h2>{section.section}</h2>{section.items.map(item=>{const response=answerFor(item.id);const status=response?.status??'not_checked';return <div className="print-item print-item-with-note" key={item.id}><span>{item.label}{response?.note?<small>{response.note}</small>:null}</span><b>{statusText[status]}</b></div>})}</div>)}
 <div className="print-section"><h2>Questions and repair follow-ups</h2>{notes.length?notes.map(note=><div className="print-note" key={note.id}><b>{note.question}</b><p>{note.answer||'No answer recorded yet.'}</p><small>{note.resolved?'Marked as answered':'Still unresolved'}</small></div>):<p>No follow-up questions recorded.</p>}</div>
 <div className="print-section"><h2>Property notes</h2><p>{active.notes.trim()||'No general property notes recorded.'}</p></div>
 {loadError&&<p role="alert">{loadError}</p>}
 <div className="print-section"><h2>Photo evidence ({photos.length})</h2>{photos.length?<div className="print-photo-grid">{photos.map(photo=><PrintPhoto key={photo.id} photo={photo}/>)}</div>:<p>No photos attached to this property.</p>}</div>
 <p className="print-disclaimer">This record reflects observations entered by the renter. It is not a building inspection certificate, legal opinion, landlord identity verification, or guarantee of safety. “Looks okay” means no obvious concern was recorded at the time; it does not confirm hidden conditions. Items marked “Not checked” remain unknown. Amounts are based on information entered and should be confirmed with the property representative.</p><p className="print-generated">Generated by Before You Rent on {new Date().toLocaleString('en-NG')}</p></section>;
}

function CostsView({active,onCreate}:{active:PropertyRecord|null;onCreate:()=>void}) {
 const [costs,setCosts] = useState<import('./types').PropertyCost[]>([]);
 const [adding,setAdding] = useState(false);
 const [costError,setCostError] = useState('');
 useEffect(() => { let cancelled=false; if(active) getCosts(active.id).then(items=>{if(!cancelled)setCosts(items)}).catch(()=>setCostError('Could not load saved costs.')); return ()=>{cancelled=true}; },[active]);
 const upfrontTotal = costs.filter(item=>item.kind==='upfront').reduce((sum,item)=>sum+item.amount,0); const recurringMonthlyTotal = costs.filter(item=>item.kind==='recurring').reduce((sum,item)=>sum+(item.frequency==='monthly'?item.amount:item.frequency==='yearly'?item.amount/12:0),0); const summary = summarizeCosts(active, costs); const rentMonthly = active ? rentMonthlyEquivalent(active.rentAmount, active.rentDuration) : 0; const moveInTotal = summary?.cashDueAtStart ?? 0; const monthlyEquivalent = rentMonthly+recurringMonthlyTotal;
 async function addCost(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); if(!active)return;
  const form=new FormData(event.currentTarget); const amount=Number(form.get('amount'));
  if(!Number.isFinite(amount)||amount<0)return;
  const label=String(form.get('label')||'').trim(); const kind=String(form.get('kind')) as 'upfront'|'recurring'; const frequency=String(form.get('frequency')) as 'once'|'monthly'|'yearly'; const refundable=form.get('refundable')==='on';
  if(!label || !Number.isFinite(amount) || amount<=0 || (kind==='recurring' && frequency==='once') || (refundable && kind!=='upfront')) { setCostError('Enter a payment name and positive amount. Recurring payments need a monthly or yearly frequency; refundable deposits must be upfront.'); return; }
  const item:import('./types').PropertyCost={id:newId(),propertyId:active.id,label,amount,kind,refundable,frequency,note:String(form.get('note')||'').trim()};
  try { await saveCost(item); setCosts(old=>[...old,item]); setAdding(false); }
  catch { setCostError('This cost could not be saved. Try again.'); }
 }
 async function remove(id:string) { try { await removeCost(id); setCosts(old=>old.filter(item=>item.id!==id)); } catch { setCostError('This cost could not be removed.'); } }
 return <><PageHeading eyebrow="MONEY, WITHOUT SURPRISES" title="Cost breakdown" description="Rent is one line in the budget. Get the full payment picture before committing." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>{active?<><div className="costs-property-strip"><div className="property-thumb thumb-1"><House size={23}/></div><div><b>{active.name}</b><span><MapPin size={13}/>{active.address}</span></div><span className="selected-label">SELECTED PROPERTY</span></div>{costError&&<div className="alert-error" role="alert">{costError}<button onClick={()=>setCostError('')}><X size={15}/></button></div>}<div className="costs-layout"><section className="panel cost-summary-panel"><span className="eyebrow">CURRENTLY RECORDED</span><h2>Know the cash you’ll need.</h2><p>Keep refundable deposits separate from non-refundable charges. A deposit still affects the amount you need upfront.</p><div className="cost-total"><span>Advertised rent</span><strong>{money(active.rentAmount)}</strong><small>{rentPeriodLabel(active.rentDuration)}. Confirm the payment schedule.</small></div><div className="cost-total"><span>Additional upfront payments</span><strong>{money(upfrontTotal)}</strong><small>Cash required in addition to rent</small></div><div className="cost-total"><span>Of which refundable deposits</span><strong>{money(summary?.refundableUpfront ?? 0)}</strong><small>Still payable upfront, but potentially refundable under the agreed terms</small></div><div className="cost-total"><span>Non-refundable upfront payments</span><strong>{money(summary?.nonRefundableUpfront ?? 0)}</strong><small>Fees and other upfront payments not marked refundable</small></div><div className="cost-total"><span>Recurring charges (monthly equivalent)</span><strong>{money(recurringMonthlyTotal)}</strong><small>Annual recurring charges are divided by 12</small></div><div className="cost-total cost-total-highlight"><span>Estimated cash due at the start</span><strong>{money(moveInTotal)}</strong><small>Advertised rent plus recorded upfront payments; confirm the actual due date</small></div><div className="cost-total"><span>Rent + recurring charges (monthly equivalent)</span><strong>{money(monthlyEquivalent)}</strong><small>Budget comparison only; not necessarily the amount due monthly</small></div><div className="cost-tip"><Banknote size={19}/><span><b>Ask for a written breakdown.</b> Agency, legal, caution, service, utility, and other fees vary. Confirm which are refundable and who receives each payment.</span></div></section><section className="panel cost-list-panel"><div className="panel-head"><div><span className="eyebrow">PAYMENTS TO CLARIFY</span><h2>Fees and deposits</h2></div><button className="icon-button subtle" onClick={()=>setAdding(!adding)} aria-label="Add a cost"><Plus size={18}/></button></div>{adding&&<form className="cost-entry-form" onSubmit={addCost}><label>Payment name<input name="label" required placeholder="e.g. Caution deposit" maxLength={90}/></label><label>Amount in naira<input name="amount" type="number" min="0" step="100" required placeholder="e.g. 150000"/></label><div className="form-row"><label>Payment type<select name="kind" defaultValue="upfront"><option value="upfront">Upfront / one-off</option><option value="recurring">Recurring</option></select></label><label>Frequency<select name="frequency" defaultValue="once"><option value="once">One time</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div><label className="check-label"><input type="checkbox" name="refundable"/> Refundable deposit</label><label>Notes (optional)<input name="note" placeholder="Who receives it? What was agreed?"/></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={()=>setAdding(false)}>Cancel</button><button type="submit" className="button-primary">Save payment</button></div></form>}{costs.length===0&&!adding?<div className="cost-list-empty"><div className="empty-illustration"><Wallet size={26}/></div><h3>No additional fees recorded.</h3><p>Ask for a complete fee breakdown and record each amount, including deposits and recurring charges.</p><button className="button-secondary" onClick={()=>setAdding(true)}><Plus size={15}/> Add a payment</button></div>:<div className="cost-items-list">{costs.map(item=><div className="cost-item-row" key={item.id}><div className="cost-item-icon">{item.refundable?<ArrowDownRight size={17}/>:<Banknote size={17}/>}</div><div className="cost-item-copy"><b>{item.label}</b><span>{item.kind==='upfront'?'Upfront':'Recurring'} · {item.frequency==='once'?'one time':item.frequency}</span>{item.note&&<small>{item.note}</small>}<div className="cost-badges">{item.refundable&&<span>REFUNDABLE DEPOSIT</span>}</div></div><div className="cost-item-price"><b>{money(item.amount)}</b><button className="icon-button tiny danger" onClick={()=>remove(item.id)} aria-label={'Remove '+item.label}><Trash2 size={14}/></button></div></div>)}</div>}</section></div></>:<div className="empty-state"><div className="empty-illustration"><Wallet size={30}/></div><h3>Choose a property first</h3><p>Cost breakdowns are kept separately for each place you’re considering.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button></div>}</>;
}

function CompareView({properties,onOpen,onCreate}:{properties:PropertyRecord[];onOpen:(p:PropertyRecord)=>void;onCreate:()=>void}) {
 const [details,setDetails]=useState<Record<string,{answers:InspectionAnswer[];costs:PropertyCost[];notes:InspectionNote[]}>>({});
 const [loadError,setLoadError]=useState('');
 useEffect(()=>{let cancelled=false;Promise.all(properties.map(async p=>({id:p.id,answers:await getAnswers(p.id),costs:await getCosts(p.id),notes:await getNotes(p.id)}))).then(items=>{if(!cancelled)setDetails(Object.fromEntries(items.map(item=>[item.id,{answers:item.answers,costs:item.costs,notes:item.notes}])))}).catch(()=>{if(!cancelled)setLoadError('Some saved inspection details could not be loaded. Refresh and try again.');});return()=>{cancelled=true}},[properties]);
 const totalChecks=CHECKLIST.flatMap(section=>section.items).length;
 return <><PageHeading eyebrow="A CLEARER SIDE-BY-SIDE" title="Compare your options" description="Compare upfront cash, ongoing costs, what you observed, and what still needs an answer." action={<button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button>}/>{loadError&&<div className="alert-error" role="alert">{loadError}</div>}{properties.length<2?<div className="empty-state"><div className="empty-illustration"><SlidersHorizontal size={30}/></div><h3>Two properties make a comparison.</h3><p>Add at least two places to compare rent, cash needed, inspection concerns, and open questions side by side.</p><button className="button-primary" onClick={onCreate}><Plus size={17}/> Add property</button></div>:<div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>DETAIL</th>{properties.map(p=><th key={p.id}><button className="compare-property-name" onClick={()=>onOpen(p)}>{p.name}<ArrowUpRightFallback/></button><small>{p.address}</small></th>)}</tr></thead><tbody>
 <tr><th>Advertised rent</th>{properties.map(p=><td key={p.id}><strong>{money(p.rentAmount)}</strong><small>{rentPeriodLabel(p.rentDuration)}</small></td>)}</tr>
 <tr><th>Monthly rent equivalent</th>{properties.map(p=><td key={p.id}><strong>{money(rentMonthlyEquivalent(p.rentAmount,p.rentDuration))}</strong><small>Normalised for comparison</small></td>)}</tr>
 <tr><th>Property type / bedrooms</th>{properties.map(p=><td key={p.id}>{p.propertyType} · {p.bedrooms===0?'Studio':p.bedrooms+' bed'}</td>)}</tr>
 <tr><th>Viewing date</th>{properties.map(p=><td key={p.id}>{shortDate(p.inspectionDate)}</td>)}</tr>
 <tr><th>Rent payable now</th>{properties.map(p=>{const summary=summarizeCosts(p,details[p.id]?.costs??[]);return <td key={p.id}><strong>{money(summary?.rentDueNow??p.rentAmount)}</strong><small>Advertised rental period</small></td>})}</tr>
 <tr><th>Other upfront cash</th>{properties.map(p=>{const summary=summarizeCosts(p,details[p.id]?.costs??[]);return <td key={p.id}><strong>{money(summary?.upfrontTotal??0)}</strong><small>Includes refundable deposits</small></td>})}</tr>
 <tr><th>Estimated cash due at start</th>{properties.map(p=>{const summary=summarizeCosts(p,details[p.id]?.costs??[]);return <td key={p.id}><strong>{money(summary?.cashDueAtStart??p.rentAmount)}</strong><small>Rent + recorded upfront costs</small></td>})}</tr>
 <tr><th>Recurring monthly costs</th>{properties.map(p=>{const summary=summarizeCosts(p,details[p.id]?.costs??[]);return <td key={p.id}><strong>{money(summary?.recurringMonthly??0)}</strong><small>Recurring charges only</small></td>})}</tr>
 <tr><th>Monthly equivalent incl. rent</th>{properties.map(p=>{const summary=summarizeCosts(p,details[p.id]?.costs??[]);return <td key={p.id}><strong>{money((summary?.rentMonthly??rentMonthlyEquivalent(p.rentAmount,p.rentDuration))+(summary?.recurringMonthly??0))}</strong><small>Budget comparison</small></td>})}</tr>
 <tr><th>Inspection concerns</th>{properties.map(p=>{const a=details[p.id]?.answers??[];return <td key={p.id}><strong className="compare-concern">{a.filter(x=>x.status==='concern').length} flagged</strong><small>{a.filter(x=>x.status==='not_checked').length+(totalChecks-a.length)} unchecked</small></td>})}</tr>
 <tr><th>Questions still open</th>{properties.map(p=>{const notes=details[p.id]?.notes??[];return <td key={p.id}><strong>{notes.filter(n=>!n.resolved).length}</strong><small>{notes.filter(n=>!n.answer.trim()).length} without an answer</small></td>})}</tr>
 <tr><th>Unresolved repair promises</th>{properties.map(p=>{const notes=details[p.id]?.notes??[];const repairs=notes.filter(n=>/repair|fix|replace|maintenance|leak|plumb|electric|paint|work/i.test(n.question+' '+n.answer)&&!n.resolved);return <td key={p.id}><strong>{repairs.length}</strong><small>Based on unresolved follow-up notes</small></td>})}</tr>
 <tr><th>Viewing record</th>{properties.map(p=><td key={p.id}><button className="table-action" onClick={()=>onOpen(p)}>Open inspection <ArrowRight size={14}/></button></td>)}</tr>
 </tbody></table><p className="small-disclaimer">Comparison uses only information you recorded. A blank or unchecked item is unknown, not a clean bill of health. Repair promises are inferred from follow-up wording; keep agreements explicit and in writing.</p></div>}</>;
}
function ArrowUpRightFallback() { return <ArrowRight size={14}/>; }

function SettingsView({onExport,onImport,onDeleteAll,count}:{onExport:()=>void;onImport:(file:File)=>void;onDeleteAll:()=>void;count:number}) {
 return <><PageHeading eyebrow="PRIVACY AND PRACTICALITIES" title="Your data, your call." description="Understand where your records live and how to keep a copy."/><div className="settings-grid"><section className="panel settings-panel"><span className="settings-icon"><ShieldCheck size={22}/></span><h2>Stored on this device</h2><p>Your property records, checklist responses, costs, notes, and photos are saved in this browser using IndexedDB. There is no account or cloud sync in this version.</p><ul><li>Other browsers and devices will not automatically have your records.</li><li>Clearing browser data may remove your records.</li><li>Anyone with access to this browser profile may be able to view them.</li></ul><div className="backup-actions"><button className="button-primary" onClick={onExport}><FileText size={16}/> Export a backup (.json)</button><label className="button-secondary import-backup">Import backup<input type="file" accept="application/json,.json" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)onImport(file);e.currentTarget.value='';}}/></label></div></section><section className="panel settings-panel"><span className="settings-icon"><ClipboardCheck size={22}/></span><h2>What this tool can’t verify</h2><p>Before You Rent is a decision-support tool, not an inspection certificate, legal service, or landlord verification service.</p><ul><li>It cannot guarantee structural safety or detect hidden defects.</li><li>It cannot confirm a person’s authority to rent a property.</li><li>It cannot replace professional building, legal, or financial advice.</li></ul><span className="settings-count">{count} {count===1?'property':'properties'} currently saved in this browser</span><div className="danger-zone"><h3>Delete all local data</h3><p>Erase all saved properties, inspection responses, costs, notes, and photos from this browser. This does not delete exported backup files.</p><button className="button-secondary danger-action" onClick={onDeleteAll}>Delete all local data</button></div></section></div><div className="bottom-note"><div className="note-icon"><CircleHelp size={19}/></div><p><b>Back up before switching devices.</b> Export creates a JSON file containing your records and attached photos. Keep it somewhere private and secure.</p></div></>;
}


export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/app' || path.startsWith('/app/')) return <WorkspaceApp />;
  return <MarketingSite path={path} />;
}
