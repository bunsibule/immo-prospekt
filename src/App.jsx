import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const PROPERTY_TYPES = ["Maison", "Appartement", "Terrain", "Local commercial"];
const STATUSES = ["À contacter", "Contacté", "En discussion", "Mandat signé", "Perdu"];
const STATUS_COLORS = {
  "À contacter":  { main: "#f59e0b" },
  "Contacté":     { main: "#3b82f6" },
  "En discussion":{ main: "#8b5cf6" },
  "Mandat signé": { main: "#10b981" },
  "Perdu":        { main: "#6b7280" },
};
const SOURCES = [
  { id:1, name:"Le Bon Coin",                icon:"🏷️", desc:"Annonces particulier à particulier",      tips:"Annonces > 45 jours sans agence, prix ayant baissé" },
  { id:2, name:"PAP.fr",                     icon:"📰", desc:"Particulier à particulier",                tips:"Contacter sous 48h après publication" },
  { id:3, name:"Réseaux sociaux",            icon:"📱", desc:"Facebook, groupes locaux",                 tips:"Groupes 'Ventes Narbonne / Corbières', #vendresamaison" },
  { id:4, name:"Successions & notaires",     icon:"⚖️", desc:"Partenariats études notariales",          tips:"3–5 notaires de l'Aude, proposer carte de visite" },
  { id:5, name:"Mutations professionnelles", icon:"💼", desc:"Vendeurs pressés = meilleurs prospects",   tips:"RH grandes entreprises locales, zone industrielle Narbonne" },
  { id:6, name:"Propriétaires bailleurs",    icon:"🏠", desc:"Locations répétées > 6 mois",              tips:"Propriétaire découragé = prêt à vendre" },
  { id:7, name:"Divorces & séparations",     icon:"📋", desc:"Journal d'annonces légales Aude",          tips:"Section 'dissolution', décisions du tribunal de Carcassonne" },
  { id:8, name:"Panneaux 'À vendre'",        icon:"🚗", desc:"Tournées terrain",                         tips:"1 tournée/semaine, noter les adresses sans agence" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const c = STATUS_COLORS[status]?.main || "#6b7280";
  return (
    <span style={{ background: c+"22", color: c, border:`1px solid ${c}44`, padding:"3px 11px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"18px 22px", display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ fontSize:30 }}>{icon}</div>
      <div>
        <div style={{ fontSize:28, fontWeight:700, color, fontFamily:"'Playfair Display',serif", lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:12, color:"#94a3b8", marginTop:3 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Spinner() {
  return <div style={{ display:"inline-block", width:16, height:16, border:"2px solid rgba(255,255,255,.2)", borderTopColor:"#c9a84c", borderRadius:"50%", animation:"spin .7s linear infinite" }} />;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");

  // Data
  const [zones,     setZones]     = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [syncStatus, setSyncStatus] = useState("ok"); // ok | saving | error

  // UI
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showProspectForm,  setShowProspectForm]  = useState(false);
  const [showZoneForm,      setShowZoneForm]      = useState(false);
  const [filterStatus,  setFilterStatus]  = useState("Tous");
  const [filterType,    setFilterType]    = useState("Tous");
  const [filterZone,    setFilterZone]    = useState("Toutes");
  const [aiMessage,     setAiMessage]     = useState("");
  const [aiLoading,     setAiLoading]     = useState(false);
  const [toast,         setToast]         = useState(null);

  const [newZone,  setNewZone]  = useState({ name:"", dept:"" });
  const [newProspect, setNewProspect] = useState({
    name:"", phone:"", zone:"", type:"Maison",
    source:"Le Bon Coin", status:"À contacter", note:"",
    date: new Date().toISOString().split("T")[0]
  });

  function showToast(msg, type="ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ─── CHARGEMENT INITIAL ───────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: z }, { data: p }] = await Promise.all([
        supabase.from("zones").select("*").order("name"),
        supabase.from("prospects").select("*").order("created_at", { ascending: false }),
      ]);
      setZones(z || []);
      setProspects(p || []);
    } catch {
      showToast("Erreur de connexion à la base de données", "error");
    }
    setLoading(false);
  }

  // ─── TEMPS RÉEL (Supabase Realtime) ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("immo-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospects" }, () => {
        loadProspects();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "zones" }, () => {
        loadZones();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function loadProspects() {
    const { data } = await supabase.from("prospects").select("*").order("created_at", { ascending: false });
    if (data) setProspects(data);
  }

  async function loadZones() {
    const { data } = await supabase.from("zones").select("*").order("name");
    if (data) setZones(data);
  }

  // ─── CRUD PROSPECTS ───────────────────────────────────────────────────────
  async function addProspect() {
    if (!newProspect.name || !newProspect.zone) return;
    setSyncStatus("saving");
    const { error } = await supabase.from("prospects").insert([{
      name:   newProspect.name,
      phone:  newProspect.phone,
      zone:   newProspect.zone,
      type:   newProspect.type,
      source: newProspect.source,
      status: newProspect.status,
      note:   newProspect.note,
      date:   newProspect.date,
    }]);
    if (error) { showToast("Erreur lors de l'ajout", "error"); setSyncStatus("error"); return; }
    setSyncStatus("ok");
    showToast("Prospect ajouté ✓");
    setNewProspect({ name:"", phone:"", zone:"", type:"Maison", source:"Le Bon Coin", status:"À contacter", note:"", date: new Date().toISOString().split("T")[0] });
    setShowProspectForm(false);
    loadProspects();
  }

  async function updateStatus(id, status) {
    setSyncStatus("saving");
    const { error } = await supabase.from("prospects").update({ status }).eq("id", id);
    if (error) { showToast("Erreur mise à jour", "error"); setSyncStatus("error"); return; }
    setSyncStatus("ok");
    showToast(`→ ${status}`);
    setProspects(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    if (selectedProspect?.id === id) setSelectedProspect(p => ({ ...p, status }));
  }

  async function deleteProspect(id) {
    if (!confirm("Supprimer ce prospect ?")) return;
    setSyncStatus("saving");
    await supabase.from("prospects").delete().eq("id", id);
    setSyncStatus("ok");
    showToast("Supprimé", "info");
    setProspects(prev => prev.filter(p => p.id !== id));
    if (selectedProspect?.id === id) setSelectedProspect(null);
  }

  // ─── CRUD ZONES ───────────────────────────────────────────────────────────
  async function addZone() {
    if (!newZone.name) return;
    const { error } = await supabase.from("zones").insert([{ name: newZone.name, dept: newZone.dept }]);
    if (error) { showToast("Erreur lors de l'ajout", "error"); return; }
    showToast("Zone ajoutée ✓");
    setNewZone({ name:"", dept:"" });
    setShowZoneForm(false);
    loadZones();
  }

  async function deleteZone(id) {
    await supabase.from("zones").delete().eq("id", id);
    showToast("Zone supprimée", "info");
    loadZones();
  }

  // ─── IA : MESSAGE PROSPECT ────────────────────────────────────────────────
  async function generateMessage(prospect) {
    setAiLoading(true);
    setAiMessage("");
    setSelectedProspect(prospect);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:500,
          messages:[{ role:"user", content:`Tu es assistante commerciale pour Sophie, mandataire immobilière indépendante dans l'Aude (Narbonne, Corbières).
Rédige un message de prospection court, chaleureux et humain pour ce prospect potentiel vendeur :
Nom : ${prospect.name}
Bien : ${prospect.type}
Zone : ${prospect.zone}
Source : ${prospect.source}
Note : ${prospect.note || "aucune"}
Le message doit : être en français, < 100 mots, humain, mentionner comment tu l'as trouvé, proposer un simple appel téléphonique. Signer "Sophie, mandataire immobilière – Narbonne & Corbières".
Message uniquement, sans introduction.`
          }]
        })
      });
      const data = await res.json();
      setAiMessage(data.content[0].text);
    } catch {
      setAiMessage("Erreur lors de la génération.");
    }
    setAiLoading(false);
  }

  // ─── FILTRES ──────────────────────────────────────────────────────────────
  const filtered = prospects.filter(p =>
    (filterStatus === "Tous"   || p.status === filterStatus) &&
    (filterType   === "Tous"   || p.type   === filterType)   &&
    (filterZone   === "Toutes" || p.zone   === filterZone)
  );

  const stats = {
    total:      prospects.length,
    aContacter: prospects.filter(p => p.status === "À contacter").length,
    enCours:    prospects.filter(p => ["Contacté","En discussion"].includes(p.status)).length,
    mandats:    prospects.filter(p => p.status === "Mandat signé").length,
  };

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const inp = { background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", color:"#f1f5f9", padding:"10px 14px", borderRadius:10, fontSize:13, width:"100%", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const btnGold  = { background:"linear-gradient(135deg,#c9a84c,#e6c970)", color:"#1a1208", border:"none", padding:"10px 22px", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" };
  const btnGhost = { background:"rgba(255,255,255,.07)", color:"#cbd5e1", border:"1px solid rgba(255,255,255,.12)", padding:"9px 18px", borderRadius:10, fontWeight:500, fontSize:13, cursor:"pointer", fontFamily:"inherit" };

  const navItems = [
    { id:"dashboard", label:"Tableau de bord", icon:"◈" },
    { id:"prospects", label:"Prospects",        icon:"◉", badge: stats.aContacter || null },
    { id:"zones",     label:"Zones",            icon:"◎" },
    { id:"sources",   label:"Sources",          icon:"◇" },
  ];

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d1117 0%,#111827 40%,#0f172a 100%)", color:"#f1f5f9", fontFamily:"'DM Sans','Segoe UI',sans-serif", display:"flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;} textarea{resize:vertical;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:4px;}
        input::placeholder,textarea::placeholder{color:#475569;} select option{background:#1e293b;color:#f1f5f9;}
        .card:hover{border-color:rgba(255,255,255,.14)!important;background:rgba(255,255,255,.04)!important;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:toast.type==="error"?"rgba(239,68,68,.95)":toast.type==="info"?"rgba(30,64,175,.95)":"rgba(16,185,129,.95)", color:"#fff", padding:"12px 22px", borderRadius:12, fontSize:13, fontWeight:600, boxShadow:"0 8px 30px rgba(0,0,0,.4)", animation:"slideIn .2s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width:228, background:"rgba(255,255,255,.02)", borderRight:"1px solid rgba(255,255,255,.06)", padding:"26px 14px", display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
        <div style={{ paddingLeft:8, marginBottom:30 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:"#c9a84c", lineHeight:1.2 }}>Immo<span style={{ color:"#f1f5f9" }}>Prospekt</span></div>
          <div style={{ fontSize:10, color:"#64748b", marginTop:4, letterSpacing:".5px" }}>NARBONNE & CORBIÈRES</div>
        </div>

        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ background:tab===n.id?"rgba(201,168,76,.12)":"transparent", border:tab===n.id?"1px solid rgba(201,168,76,.25)":"1px solid transparent", color:tab===n.id?"#c9a84c":"#94a3b8", padding:"10px 13px", borderRadius:9, fontSize:13, fontWeight:tab===n.id?600:400, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:"inherit", transition:"all .15s" }}>
            <span style={{ display:"flex", alignItems:"center", gap:9 }}><span>{n.icon}</span>{n.label}</span>
            {n.badge > 0 && <span style={{ background:"rgba(201,168,76,.8)", color:"#1a1208", fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:20 }}>{n.badge}</span>}
          </button>
        ))}

        <div style={{ marginTop:"auto", paddingTop:14, borderTop:"1px solid rgba(255,255,255,.06)" }}>
          {/* Sync indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,.03)", marginBottom:10 }}>
            {syncStatus === "saving" && <><Spinner /><span style={{ fontSize:11, color:"#94a3b8" }}>Synchronisation…</span></>}
            {syncStatus === "ok"     && <><span style={{ width:8, height:8, borderRadius:"50%", background:"#10b981", display:"inline-block" }}/><span style={{ fontSize:11, color:"#64748b" }}>Base synchronisée</span></>}
            {syncStatus === "error"  && <><span style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", display:"inline-block" }}/><span style={{ fontSize:11, color:"#f87171" }}>Erreur sync</span></>}
          </div>
          <div style={{ fontSize:12, color:"#c9a84c", fontWeight:600, paddingLeft:2 }}>Sophie ✦</div>
          <div style={{ fontSize:11, color:"#334155", paddingLeft:2, marginTop:2 }}>Mandataire immobilière</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, padding:"30px 34px", overflowY:"auto", maxHeight:"100vh" }}>

        {/* Loading */}
        {loading && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh", gap:16, color:"#475569" }}>
            <Spinner />
            <div style={{ fontSize:14 }}>Chargement depuis Supabase…</div>
          </div>
        )}

        {!loading && (
          <>

          {/* ══ DASHBOARD ════════════════════════════════════════════════════ */}
          {tab === "dashboard" && (
            <div style={{ animation:"fadeIn .3s ease" }}>
              <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, margin:0, fontWeight:700 }}>Tableau de bord</h1>
              <p style={{ color:"#64748b", margin:"6px 0 28px", fontSize:14 }}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }}>
                <StatCard label="Total prospects" value={stats.total}      icon="👥" color="#c9a84c" />
                <StatCard label="À contacter"     value={stats.aContacter} icon="📬" color="#f59e0b" />
                <StatCard label="En cours"         value={stats.enCours}   icon="💬" color="#8b5cf6" />
                <StatCard label="Mandats signés"   value={stats.mandats}   icon="✅" color="#10b981" />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:22 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <h3 style={{ margin:0, fontSize:15, color:"#cbd5e1" }}>Derniers prospects</h3>
                    <button onClick={() => setTab("prospects")} style={{ ...btnGhost, padding:"5px 12px", fontSize:12 }}>Voir tout →</button>
                  </div>
                  {prospects.slice(0,5).map(p => (
                    <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{p.name}</div>
                        <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{p.zone} · {p.type}</div>
                      </div>
                      <Badge status={p.status} />
                    </div>
                  ))}
                  {prospects.length === 0 && <div style={{ color:"#334155", fontSize:13, padding:"20px 0", textAlign:"center" }}>Aucun prospect encore</div>}
                </div>

                <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:22 }}>
                  <h3 style={{ margin:"0 0 16px", fontSize:15, color:"#cbd5e1" }}>Répartition par type</h3>
                  {PROPERTY_TYPES.map(type => {
                    const count = prospects.filter(p => p.type === type).length;
                    const pct = prospects.length ? Math.round(count/prospects.length*100) : 0;
                    return (
                      <div key={type} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
                          <span style={{ color:"#94a3b8" }}>{type}</span>
                          <span style={{ color:"#c9a84c", fontWeight:600 }}>{count}</span>
                        </div>
                        <div style={{ height:4, background:"rgba(255,255,255,.06)", borderRadius:4 }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:"linear-gradient(90deg,#c9a84c,#e6c970)", borderRadius:4, transition:"width .5s" }}/>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop:18, background:"rgba(201,168,76,.07)", border:"1px solid rgba(201,168,76,.15)", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:12, color:"#c9a84c", fontWeight:600, marginBottom:5 }}>💡 Synchro temps réel</div>
                    <p style={{ margin:0, fontSize:12, color:"#64748b", lineHeight:1.6 }}>Les données sont partagées en <strong style={{ color:"#cbd5e1" }}>temps réel</strong> avec tous les appareils connectés. Toute modification est instantanément visible.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ PROSPECTS ════════════════════════════════════════════════════ */}
          {tab === "prospects" && (
            <div style={{ animation:"fadeIn .3s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                <div>
                  <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, margin:0, fontWeight:700 }}>Prospects</h1>
                  <p style={{ color:"#64748b", margin:"6px 0 0", fontSize:14 }}>{filtered.length} prospect(s)</p>
                </div>
                <button onClick={() => setShowProspectForm(true)} style={btnGold}>+ Ajouter</button>
              </div>

              {/* Filtres */}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
                {["Tous",...STATUSES].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{ ...btnGhost, padding:"6px 13px", fontSize:12, background:filterStatus===s?"rgba(201,168,76,.15)":"rgba(255,255,255,.05)", color:filterStatus===s?"#c9a84c":"#64748b", border:filterStatus===s?"1px solid rgba(201,168,76,.3)":"1px solid rgba(255,255,255,.08)" }}>{s}</button>
                ))}
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inp, width:"auto", padding:"6px 12px", fontSize:12 }}>
                  <option>Tous</option>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...inp, width:"auto", padding:"6px 12px", fontSize:12 }}>
                  <option>Toutes</option>{zones.map(z => <option key={z.id}>{z.name}</option>)}
                </select>
              </div>

              {/* Formulaire */}
              {showProspectForm && (
                <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(201,168,76,.2)", borderRadius:14, padding:22, marginBottom:18 }}>
                  <h3 style={{ margin:"0 0 18px", color:"#c9a84c", fontSize:14 }}>Nouveau prospect</h3>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <input placeholder="Nom *" value={newProspect.name} onChange={e => setNewProspect({...newProspect,name:e.target.value})} style={inp}/>
                    <input placeholder="Téléphone" value={newProspect.phone} onChange={e => setNewProspect({...newProspect,phone:e.target.value})} style={inp}/>
                    <select value={newProspect.zone} onChange={e => setNewProspect({...newProspect,zone:e.target.value})} style={inp}>
                      <option value="">Zone *</option>{zones.map(z => <option key={z.id}>{z.name}</option>)}
                    </select>
                    <select value={newProspect.type} onChange={e => setNewProspect({...newProspect,type:e.target.value})} style={inp}>
                      {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <select value={newProspect.source} onChange={e => setNewProspect({...newProspect,source:e.target.value})} style={inp}>
                      {SOURCES.map(s => <option key={s.id}>{s.name}</option>)}
                    </select>
                    <select value={newProspect.status} onChange={e => setNewProspect({...newProspect,status:e.target.value})} style={inp}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <textarea placeholder="Notes…" value={newProspect.note} onChange={e => setNewProspect({...newProspect,note:e.target.value})} style={{ ...inp, gridColumn:"1/-1", minHeight:70 }}/>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button onClick={addProspect} style={btnGold}>Sauvegarder</button>
                    <button onClick={() => setShowProspectForm(false)} style={btnGhost}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Liste */}
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {filtered.map(p => (
                  <div key={p.id} className="card" onClick={() => setSelectedProspect(selectedProspect?.id===p.id?null:p)} style={{ background:selectedProspect?.id===p.id?"rgba(201,168,76,.06)":"rgba(255,255,255,.025)", border:selectedProspect?.id===p.id?"1px solid rgba(201,168,76,.3)":"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"16px 20px", cursor:"pointer", transition:"all .15s" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:6 }}>
                          <span style={{ fontWeight:700, fontSize:14 }}>{p.name}</span>
                          <Badge status={p.status}/>
                        </div>
                        <div style={{ fontSize:12, color:"#475569", display:"flex", gap:12, flexWrap:"wrap" }}>
                          <span>📞 {p.phone||"–"}</span><span>📍 {p.zone}</span><span>🏠 {p.type}</span><span>📌 {p.source}</span>
                        </div>
                        {p.note && <div style={{ fontSize:12, color:"#64748b", marginTop:6, fontStyle:"italic" }}>"{p.note}"</div>}
                      </div>
                      <div style={{ display:"flex", gap:8, marginLeft:12, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setSelectedProspect(p); generateMessage(p); }} style={{ ...btnGold, padding:"7px 13px", fontSize:12 }}>✨ Message</button>
                        <button onClick={() => deleteProspect(p.id)} style={{ ...btnGhost, padding:"7px 10px", color:"#ef4444", fontSize:14, border:"1px solid rgba(239,68,68,.2)" }}>✕</button>
                      </div>
                    </div>

                    {selectedProspect?.id===p.id && (
                      <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid rgba(255,255,255,.07)" }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize:12, color:"#475569", marginBottom:9 }}>Changer le statut :</div>
                        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
                          {STATUSES.map(s => {
                            const c = STATUS_COLORS[s]?.main || "#6b7280";
                            return <button key={s} onClick={() => updateStatus(p.id,s)} style={{ padding:"5px 11px", borderRadius:20, fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:p.status===s?700:400, background:p.status===s?c+"22":"transparent", color:c, border:`1px solid ${c}44` }}>{s}</button>;
                          })}
                        </div>

                        {/* Message IA */}
                        {aiLoading && selectedProspect?.id===p.id && (
                          <div style={{ display:"flex", gap:10, alignItems:"center", padding:14, background:"rgba(201,168,76,.06)", borderRadius:10, color:"#c9a84c", fontSize:13 }}>
                            <Spinner/>Génération du message…
                          </div>
                        )}
                        {aiMessage && selectedProspect?.id===p.id && !aiLoading && (
                          <div style={{ background:"rgba(201,168,76,.06)", border:"1px solid rgba(201,168,76,.2)", borderRadius:10, padding:16 }}>
                            <div style={{ fontSize:11, color:"#c9a84c", fontWeight:700, marginBottom:10, textTransform:"uppercase", letterSpacing:".5px" }}>✨ Message IA généré</div>
                            <p style={{ margin:0, fontSize:13, color:"#e2e8f0", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{aiMessage}</p>
                            <button onClick={() => { navigator.clipboard.writeText(aiMessage); showToast("Copié ✓"); }} style={{ ...btnGhost, marginTop:12, fontSize:12, padding:"6px 14px" }}>📋 Copier</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {filtered.length===0 && !showProspectForm && (
                  <div style={{ textAlign:"center", padding:60, color:"#334155" }}>
                    Aucun prospect pour ces filtres.
                    <button onClick={() => setShowProspectForm(true)} style={{ ...btnGold, marginLeft:14 }}>+ Ajouter</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ ZONES ════════════════════════════════════════════════════════ */}
          {tab === "zones" && (
            <div style={{ animation:"fadeIn .3s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                <div>
                  <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, margin:0, fontWeight:700 }}>Zones</h1>
                  <p style={{ color:"#64748b", margin:"6px 0 0", fontSize:14 }}>{zones.length} zone(s) active(s)</p>
                </div>
                <button onClick={() => setShowZoneForm(true)} style={btnGold}>+ Ajouter</button>
              </div>

              {showZoneForm && (
                <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(201,168,76,.2)", borderRadius:14, padding:22, marginBottom:18 }}>
                  <h3 style={{ margin:"0 0 16px", color:"#c9a84c", fontSize:14 }}>Nouvelle zone</h3>
                  <div style={{ display:"flex", gap:12 }}>
                    <input placeholder="Nom *" value={newZone.name} onChange={e => setNewZone({...newZone,name:e.target.value})} style={{ ...inp, flex:2 }}/>
                    <input placeholder="Dept (ex: 11)" value={newZone.dept} onChange={e => setNewZone({...newZone,dept:e.target.value})} style={{ ...inp, flex:1 }}/>
                    <button onClick={addZone} style={btnGold}>Ajouter</button>
                    <button onClick={() => setShowZoneForm(false)} style={btnGhost}>Annuler</button>
                  </div>
                </div>
              )}

              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                {zones.map(z => {
                  const count = prospects.filter(p => p.zone===z.name).length;
                  return (
                    <div key={z.id} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"20px 22px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15 }}>{z.name}</div>
                          <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>Dépt. {z.dept||"–"}</div>
                        </div>
                        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:30, color:"#c9a84c", lineHeight:1 }}>{count}</div>
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:14 }}>
                        <button onClick={() => { setFilterZone(z.name); setTab("prospects"); }} style={{ ...btnGhost, fontSize:12, padding:"6px 12px", flex:1 }}>Voir →</button>
                        <button onClick={() => deleteZone(z.id)} style={{ ...btnGhost, fontSize:12, padding:"6px 10px", color:"#ef4444", border:"1px solid rgba(239,68,68,.2)" }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ SOURCES ══════════════════════════════════════════════════════ */}
          {tab === "sources" && (
            <div style={{ animation:"fadeIn .3s ease" }}>
              <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, margin:0, fontWeight:700 }}>Sources de prospects</h1>
              <p style={{ color:"#64748b", margin:"6px 0 28px", fontSize:14 }}>Méthodes et canaux pour trouver des vendeurs dans l'Aude</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {SOURCES.map(s => (
                  <div key={s.id} style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"20px 22px" }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontSize:26 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
                        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{s.desc}</div>
                      </div>
                    </div>
                    <div style={{ background:"rgba(201,168,76,.07)", border:"1px solid rgba(201,168,76,.15)", borderRadius:9, padding:"11px 13px", fontSize:12, color:"#94a3b8", lineHeight:1.6 }}>
                      💡 {s.tips}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:22, marginTop:14 }}>
                <h3 style={{ margin:"0 0 14px", fontSize:15, color:"#c9a84c" }}>🗓 Routine hebdomadaire</h3>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                  {[["Lundi","Scan LBC + PAP, nouvelles annonces"],["Mardi","Appels prospection (annonces > 45j)"],["Mercredi","Tournée terrain, panneaux sans agence"],["Jeudi","Réseaux sociaux + groupes Facebook"],["Vendredi","Suivi prospects, mise à jour app"]].map(([d,t]) => (
                    <div key={d} style={{ background:"rgba(255,255,255,.03)", borderRadius:10, padding:14, textAlign:"center" }}>
                      <div style={{ fontWeight:700, color:"#c9a84c", fontSize:13, marginBottom:7 }}>{d}</div>
                      <div style={{ fontSize:12, color:"#64748b", lineHeight:1.5 }}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          </>
        )}
      </div>
    </div>
  );
}
