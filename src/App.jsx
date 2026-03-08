import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const ZONES = ["Narbonne", "Narbonne-Plage", "Gruissan", "Port-la-Nouvelle", "Corbières – Lézignan", "Corbières – Tuchan", "Corbières – Durban", "Corbières – Lagrasse"];
const TYPES = ["Tous types", "Maison", "Appartement", "Terrain", "Local commercial"];
const SOURCES = ["Toutes sources", "Le Bon Coin", "PAP.fr", "Facebook", "Annonces légales"];
const STATUSES = ["À appeler", "Appelé", "En discussion", "Mandat signé", "Sans suite"];

const STATUS_C = {
  "À appeler":     "#f59e0b",
  "Appelé":        "#3b82f6",
  "En discussion": "#8b5cf6",
  "Mandat signé":  "#10b981",
  "Sans suite":    "#6b7280",
};

function Badge({ status }) {
  const c = STATUS_C[status] || "#6b7280";
  return <span style={{ background:c+"22", color:c, border:`1px solid ${c}44`, padding:"3px 11px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{status}</span>;
}

function Spinner({ size = 18 }) {
  return <div style={{ width:size, height:size, border:`2px solid rgba(255,255,255,.15)`, borderTopColor:"#c9a84c", borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }} />;
}

function SourceIcon({ source }) {
  const icons = { "Le Bon Coin":"🏷️", "PAP.fr":"📰", "Facebook":"📱", "Annonces légales":"⚖️" };
  return <span>{icons[source] || "🔍"}</span>;
}

export default function App() {
  const [tab, setTab] = useState("chasse");

  // Chasse state
  const [zones,      setZones]      = useState(["Narbonne", "Corbières – Lézignan"]);
  const [typesBien,  setTypesBien]  = useState("Tous types");
  const [sources,    setSources]    = useState("Toutes sources");
  const [anciennete, setAnciennete] = useState("30");
  const [searching,  setSearching]  = useState(false);
  const [results,    setResults]    = useState([]);
  const [searchErr,  setSearchErr]  = useState("");
  const [lastSearch, setLastSearch] = useState(null);

  // Shortlist (sauvegardée Supabase)
  const [shortlist,     setShortlist]     = useState([]);
  const [loadingList,   setLoadingList]   = useState(true);
  const [selectedPr,    setSelectedPr]    = useState(null);
  const [genLoading,    setGenLoading]    = useState(false);
  const [genMsg,        setGenMsg]        = useState("");

  const [toast, setToast] = useState(null);

  function showToast(msg, type="ok") { setToast({msg,type}); setTimeout(()=>setToast(null),3000); }

  // ── Chargement shortlist ──────────────────────────────────────────────────
  useEffect(() => { loadShortlist(); }, []);

  async function loadShortlist() {
    setLoadingList(true);
    const { data } = await supabase.from("prospects").select("*").order("created_at", { ascending:false });
    setShortlist(data || []);
    setLoadingList(false);
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel("hunter").on("postgres_changes", { event:"*", schema:"public", table:"prospects" }, loadShortlist).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── CHASSE IA ─────────────────────────────────────────────────────────────
  async function lancerChasse() {
    if (zones.length === 0) { showToast("Sélectionne au moins une zone", "err"); return; }
    setSearching(true); setResults([]); setSearchErr(""); setLastSearch(new Date());

    const zonesStr   = zones.join(", ");
    const typeStr    = typesBien === "Tous types" ? "maisons, appartements, terrains" : typesBien;
    const sourceStr  = sources  === "Toutes sources" ? "leboncoin.fr, pap.fr, Facebook Marketplace, groupes Facebook locaux, journaux annonces légales Aude" : sources;

    const systemPrompt = `Tu es un assistant de prospection immobilière pour Sophie, mandataire dans l'Aude (Narbonne & Corbières).
Tu dois chercher des annonces de particuliers qui vendent SANS agence immobilière dans ces zones : ${zonesStr}.
Tu cherches : ${typeStr}.
Sources à fouiller : ${sourceStr}.
Annonces publiées depuis moins de ${anciennete} jours de préférence.

Retourne UNIQUEMENT un tableau JSON valide (sans markdown), avec 6 à 10 résultats max :
[{
  "titre": "description courte du bien",
  "type": "Maison|Appartement|Terrain|Local commercial",
  "zone": "ville ou secteur",
  "prix": "prix affiché ou vide si inconnu",
  "source": "Le Bon Coin|PAP.fr|Facebook|Annonces légales",
  "url": "lien direct si trouvé, sinon chaîne vide",
  "contact": "nom ou pseudo si visible, sinon vide",
  "anciennete": "nombre de jours estimé depuis publication, ou vide",
  "signal": "signal fort de motivation vendeur (ex: baisse de prix, particulier pressé, succession, divorce…)",
  "note": "1 phrase max : pourquoi c'est une bonne piste pour Sophie"
}]
Si aucun résultat : retourner [].`;

    const userPrompt = `Cherche maintenant des annonces immobilières de particuliers vendeurs (SANS agence) dans : ${zonesStr}.
Type de bien : ${typeStr}. Sources : ${sourceStr}. Privilégie annonces < ${anciennete} jours avec signaux de motivation (baisses de prix, urgence, succession, divorce, etc.). JSON uniquement.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          tools: [{ type:"web_search_20250305", name:"web_search" }],
          system: systemPrompt,
          messages: [{ role:"user", content: userPrompt }]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b => b.type==="text").map(b => b.text).join("");
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setResults(Array.isArray(parsed) ? parsed : []);
      if (parsed.length === 0) setSearchErr("Aucune annonce trouvée. Essaie d'élargir la zone ou le type.");
    } catch(e) {
      setSearchErr("La recherche a échoué. Réessaie dans quelques secondes.");
    }
    setSearching(false);
  }

  // ── SAUVEGARDER EN SHORTLIST ──────────────────────────────────────────────
  async function sauvegarder(r) {
    const already = shortlist.find(p => p.name === r.titre && p.zone === r.zone);
    if (already) { showToast("Déjà dans ta liste", "info"); return; }
    const { error } = await supabase.from("prospects").insert([{
      name:   r.titre,
      phone:  r.contact || "",
      zone:   r.zone,
      type:   r.type,
      source: r.source,
      status: "À appeler",
      note:   `${r.signal ? "⚡ "+r.signal+" · " : ""}${r.note || ""}`,
      date:   new Date().toISOString().split("T")[0],
    }]);
    if (error) { showToast("Erreur sauvegarde", "err"); return; }
    showToast("Ajouté à ta liste ✓");
    loadShortlist();
  }

  // ── MAJ STATUT SHORTLIST ──────────────────────────────────────────────────
  async function updStatus(id, status) {
    await supabase.from("prospects").update({ status }).eq("id", id);
    setShortlist(prev => prev.map(p => p.id===id ? {...p,status} : p));
    if (selectedPr?.id===id) setSelectedPr(p => ({...p,status}));
    showToast(`→ ${status}`);
  }

  async function deletePr(id) {
    if (!confirm("Retirer de la liste ?")) return;
    await supabase.from("prospects").delete().eq("id", id);
    setShortlist(prev => prev.filter(p => p.id!==id));
    if (selectedPr?.id===id) setSelectedPr(null);
    showToast("Retiré", "info");
  }

  // ── GÉNÉRATION MESSAGE ────────────────────────────────────────────────────
  async function genererMessage(p) {
    setGenLoading(true); setGenMsg(""); setSelectedPr(p);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:400,
          messages:[{ role:"user", content:`Rédige un message de prospection court et chaleureux pour Sophie, mandataire immobilière dans l'Aude.
Prospect : ${p.name}, bien : ${p.type}, zone : ${p.zone}, source : ${p.source}.
Contexte : ${p.note||"aucun"}.
Français, < 80 mots, humain, pas commercial. Proposer un simple appel. Signer "Sophie – Mandataire immobilière, Narbonne & Corbières". Message uniquement.`}]
        })
      });
      const d = await res.json();
      setGenMsg(d.content[0].text);
    } catch { setGenMsg("Erreur génération."); }
    setGenLoading(false);
  }

  // ── TOGGLE ZONE ───────────────────────────────────────────────────────────
  function toggleZone(z) {
    setZones(prev => prev.includes(z) ? prev.filter(x=>x!==z) : [...prev,z]);
  }

  // ── STYLES ────────────────────────────────────────────────────────────────
  const inp  = { background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", color:"#f1f5f9", padding:"10px 14px", borderRadius:10, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box", width:"100%" };
  const btnG = { background:"linear-gradient(135deg,#c9a84c,#e6c970)", color:"#1a1208", border:"none", padding:"11px 24px", borderRadius:10, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" };
  const btnX = { background:"rgba(255,255,255,.07)", color:"#94a3b8", border:"1px solid rgba(255,255,255,.1)", padding:"8px 16px", borderRadius:9, fontWeight:500, fontSize:12, cursor:"pointer", fontFamily:"inherit" };

  const aContacter = shortlist.filter(p => p.status === "À appeler").length;

  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#f1f5f9", fontFamily:"'DM Sans','Segoe UI',sans-serif", display:"flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;} textarea{resize:vertical;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:4px;}
        input::placeholder,textarea::placeholder{color:#374151;} select option{background:#1e293b;color:#f1f5f9;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .result-card:hover{border-color:rgba(201,168,76,.3)!important;background:rgba(201,168,76,.04)!important;}
        .pr-card:hover{border-color:rgba(255,255,255,.14)!important;}
      `}</style>

      {/* Toast */}
      {toast && <div style={{ position:"fixed",top:20,right:20,zIndex:9999,background:toast.type==="err"?"rgba(239,68,68,.95)":toast.type==="info"?"rgba(30,64,175,.95)":"rgba(16,185,129,.95)",color:"#fff",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:600,boxShadow:"0 8px 30px rgba(0,0,0,.5)",animation:"slideIn .2s ease" }}>{toast.msg}</div>}

      {/* Sidebar */}
      <div style={{ width:220, background:"rgba(255,255,255,.02)", borderRight:"1px solid rgba(255,255,255,.06)", padding:"28px 14px", display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
        <div style={{ paddingLeft:8, marginBottom:28 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:19, color:"#c9a84c", lineHeight:1.2 }}>Immo<span style={{ color:"#f1f5f9" }}>Hunter</span></div>
          <div style={{ fontSize:10, color:"#374151", marginTop:4, letterSpacing:"1px", textTransform:"uppercase" }}>NARBONNE & CORBIÈRES</div>
        </div>

        {[
          { id:"chasse",    label:"🎯 Chasse prospects",  badge:null },
          { id:"liste",     label:"📋 Ma liste",           badge:aContacter||null },
        ].map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ background:tab===n.id?"rgba(201,168,76,.12)":"transparent", border:tab===n.id?"1px solid rgba(201,168,76,.25)":"1px solid transparent", color:tab===n.id?"#c9a84c":"#6b7280", padding:"11px 13px", borderRadius:9, fontSize:13, fontWeight:tab===n.id?700:400, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:"inherit", transition:"all .15s" }}>
            <span>{n.label}</span>
            {n.badge > 0 && <span style={{ background:"rgba(201,168,76,.8)", color:"#1a1208", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20 }}>{n.badge}</span>}
          </button>
        ))}

        <div style={{ marginTop:"auto", paddingTop:14, borderTop:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 8px" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#10b981", display:"inline-block", flexShrink:0 }}/>
            <span style={{ fontSize:11, color:"#374151" }}>Synchro active</span>
          </div>
          <div style={{ fontSize:12, color:"#c9a84c", fontWeight:600, paddingLeft:8, marginTop:4 }}>Sophie ✦</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, padding:"30px 36px", overflowY:"auto", maxHeight:"100vh" }}>

        {/* ══ CHASSE ══════════════════════════════════════════════════════════ */}
        {tab === "chasse" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:32, margin:"0 0 6px", fontWeight:700 }}>Chasse automatique</h1>
            <p style={{ color:"#4b5563", margin:"0 0 28px", fontSize:14 }}>L'IA cherche des vendeurs particuliers pour toi en temps réel</p>

            {/* Panneau de recherche */}
            <div style={{ background:"rgba(201,168,76,.05)", border:"1px solid rgba(201,168,76,.2)", borderRadius:18, padding:28, marginBottom:28 }}>

              {/* Zones */}
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:"#6b7280", display:"block", marginBottom:10, textTransform:"uppercase", letterSpacing:"1px", fontWeight:600 }}>📍 Zones à prospecter</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {ZONES.map(z => (
                    <button key={z} onClick={() => toggleZone(z)} style={{ padding:"7px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit", fontWeight:zones.includes(z)?700:400, background:zones.includes(z)?"rgba(201,168,76,.2)":"rgba(255,255,255,.05)", color:zones.includes(z)?"#c9a84c":"#6b7280", border:zones.includes(z)?"1px solid rgba(201,168,76,.4)":"1px solid rgba(255,255,255,.08)", transition:"all .15s" }}>
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtres */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:22 }}>
                <div>
                  <label style={{ fontSize:11, color:"#6b7280", display:"block", marginBottom:7, textTransform:"uppercase", letterSpacing:"1px", fontWeight:600 }}>🏠 Type de bien</label>
                  <select value={typesBien} onChange={e => setTypesBien(e.target.value)} style={inp}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:"#6b7280", display:"block", marginBottom:7, textTransform:"uppercase", letterSpacing:"1px", fontWeight:600 }}>📡 Sources</label>
                  <select value={sources} onChange={e => setSources(e.target.value)} style={inp}>
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:"#6b7280", display:"block", marginBottom:7, textTransform:"uppercase", letterSpacing:"1px", fontWeight:600 }}>📅 Annonces de moins de</label>
                  <select value={anciennete} onChange={e => setAnciennete(e.target.value)} style={inp}>
                    <option value="7">7 jours</option>
                    <option value="14">14 jours</option>
                    <option value="30">30 jours</option>
                    <option value="60">60 jours</option>
                    <option value="90">90 jours</option>
                  </select>
                </div>
              </div>

              {/* Bouton */}
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <button onClick={lancerChasse} disabled={searching} style={{ ...btnG, padding:"13px 36px", fontSize:15, opacity:searching?.7:1, display:"flex", alignItems:"center", gap:10 }}>
                  {searching ? <><Spinner size={16}/>Recherche en cours…</> : "🚀 Lancer la chasse"}
                </button>
                {lastSearch && !searching && (
                  <span style={{ fontSize:12, color:"#4b5563" }}>
                    Dernière recherche : {lastSearch.toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}
                  </span>
                )}
              </div>
            </div>

            {/* Loader */}
            {searching && (
              <div style={{ textAlign:"center", padding:"50px 0" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Spinner size={36} /></div>
                <div style={{ fontSize:16, color:"#c9a84c", fontWeight:600, marginBottom:8 }}>Recherche en cours…</div>
                <div style={{ fontSize:13, color:"#4b5563" }}>L'IA fouille Le Bon Coin, PAP, Facebook et les annonces légales</div>
                <div style={{ fontSize:12, color:"#374151", marginTop:6 }}>20 à 40 secondes</div>
              </div>
            )}

            {/* Erreur */}
            {searchErr && !searching && (
              <div style={{ background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", borderRadius:12, padding:"16px 20px", color:"#f87171", fontSize:13, marginBottom:20 }}>
                {searchErr}
              </div>
            )}

            {/* Résultats */}
            {results.length > 0 && !searching && (
              <div style={{ animation:"fadeIn .4s ease" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div>
                    <span style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, color:"#c9a84c" }}>{results.length}</span>
                    <span style={{ fontSize:14, color:"#6b7280", marginLeft:8 }}>piste(s) trouvée(s)</span>
                  </div>
                  <button onClick={() => { results.forEach(r => sauvegarder(r)); }} style={{ ...btnX, color:"#c9a84c", border:"1px solid rgba(201,168,76,.3)" }}>
                    ⭐ Tout sauvegarder
                  </button>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {results.map((r, i) => {
                    const already = shortlist.find(p => p.name===r.titre && p.zone===r.zone);
                    return (
                      <div key={i} className="result-card" style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"20px 24px", transition:"all .15s", animation:`fadeIn .3s ease ${i*0.05}s both` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                          <div style={{ flex:1 }}>
                            {/* Header */}
                            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
                              <span style={{ fontSize:18 }}><SourceIcon source={r.source}/></span>
                              <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{r.titre}</span>
                              {r.type && <span style={{ fontSize:11, color:"#6b7280", background:"rgba(255,255,255,.06)", padding:"2px 9px", borderRadius:6 }}>{r.type}</span>}
                              {r.anciennete && <span style={{ fontSize:11, color:"#4b5563" }}>il y a ~{r.anciennete}j</span>}
                            </div>

                            {/* Infos */}
                            <div style={{ display:"flex", gap:16, flexWrap:"wrap", fontSize:13, color:"#6b7280", marginBottom:10 }}>
                              <span>📍 {r.zone}</span>
                              {r.prix && <span style={{ color:"#c9a84c", fontWeight:700 }}>💶 {r.prix}</span>}
                              <span>📌 {r.source}</span>
                              {r.contact && <span>👤 {r.contact}</span>}
                            </div>

                            {/* Signal */}
                            {r.signal && (
                              <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(251,191,36,.1)", border:"1px solid rgba(251,191,36,.25)", borderRadius:8, padding:"5px 12px", fontSize:12, color:"#fbbf24", marginBottom:10, fontWeight:600 }}>
                                ⚡ {r.signal}
                              </div>
                            )}

                            {/* Note IA */}
                            {r.note && (
                              <div style={{ fontSize:13, color:"#4b5563", fontStyle:"italic", lineHeight:1.5 }}>
                                🤖 {r.note}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0, alignItems:"flex-end" }}>
                            {r.url ? (
                              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...btnG, padding:"9px 18px", fontSize:12, textDecoration:"none", display:"inline-block" }}>
                                Voir l'annonce →
                              </a>
                            ) : (
                              <span style={{ fontSize:11, color:"#374151", padding:"9px 0" }}>Lien non disponible</span>
                            )}
                            {already ? (
                              <span style={{ fontSize:12, color:"#10b981", padding:"6px 0" }}>✓ Déjà sauvegardé</span>
                            ) : (
                              <button onClick={() => sauvegarder(r)} style={{ ...btnX, fontSize:12, padding:"7px 14px" }}>
                                ⭐ Sauvegarder
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* État vide initial */}
            {results.length === 0 && !searching && !searchErr && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#374151" }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🎯</div>
                <div style={{ fontSize:16, color:"#4b5563", fontWeight:600, marginBottom:8 }}>Prête à chasser ?</div>
                <div style={{ fontSize:13, color:"#374151", lineHeight:1.7 }}>Sélectionne tes zones et lance la recherche.<br/>L'IA fouille Le Bon Coin, PAP, Facebook et les annonces légales pour toi.</div>
              </div>
            )}
          </div>
        )}

        {/* ══ LISTE ═══════════════════════════════════════════════════════════ */}
        {tab === "liste" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:32, margin:"0 0 6px", fontWeight:700 }}>Ma liste</h1>
            <p style={{ color:"#4b5563", margin:"0 0 24px", fontSize:14 }}>
              {shortlist.length} prospect(s) · {aContacter} à appeler
            </p>

            {loadingList && (
              <div style={{ display:"flex", gap:12, alignItems:"center", color:"#4b5563", padding:20 }}>
                <Spinner/><span>Chargement…</span>
              </div>
            )}

            {/* Stats rapides */}
            {!loadingList && shortlist.length > 0 && (
              <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
                {STATUSES.map(s => {
                  const c = shortlist.filter(p => p.status===s).length;
                  if (!c) return null;
                  const col = STATUS_C[s] || "#6b7280";
                  return <div key={s} style={{ background:col+"15", border:`1px solid ${col}33`, borderRadius:10, padding:"8px 16px", display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:18, fontWeight:700, color:col }}>{c}</span>
                    <span style={{ fontSize:12, color:col }}>{s}</span>
                  </div>;
                })}
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {!loadingList && shortlist.map(p => (
                <div key={p.id} className="pr-card" style={{ background:selectedPr?.id===p.id?"rgba(201,168,76,.05)":"rgba(255,255,255,.025)", border:selectedPr?.id===p.id?"1px solid rgba(201,168,76,.25)":"1px solid rgba(255,255,255,.07)", borderRadius:13, padding:"16px 22px", transition:"all .15s" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:7 }}>
                        <span style={{ fontWeight:700, fontSize:14 }}>{p.name}</span>
                        <Badge status={p.status}/>
                        <span style={{ fontSize:11, color:"#4b5563", background:"rgba(255,255,255,.05)", padding:"2px 8px", borderRadius:6 }}>{p.type}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#4b5563", display:"flex", gap:14, flexWrap:"wrap" }}>
                        <span>📍 {p.zone}</span>
                        <span>📌 {p.source}</span>
                        {p.phone && <span>👤 {p.phone}</span>}
                      </div>
                      {p.note && <div style={{ fontSize:12, color:"#374151", marginTop:7, fontStyle:"italic", lineHeight:1.5 }}>{p.note}</div>}
                    </div>

                    <div style={{ display:"flex", gap:8, marginLeft:14, flexShrink:0 }}>
                      <button onClick={() => { setSelectedPr(selectedPr?.id===p.id?null:p); genererMessage(p); }} style={{ ...btnX, fontSize:12, color:"#c9a84c", border:"1px solid rgba(201,168,76,.3)", padding:"7px 13px" }}>✨ Message</button>
                      <button onClick={() => deletePr(p.id)} style={{ ...btnX, padding:"7px 10px", color:"#ef4444", border:"1px solid rgba(239,68,68,.2)", fontSize:14 }}>✕</button>
                    </div>
                  </div>

                  {selectedPr?.id===p.id && (
                    <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid rgba(255,255,255,.06)" }}>
                      {/* Statuts */}
                      <div style={{ fontSize:11, color:"#4b5563", marginBottom:9, textTransform:"uppercase", letterSpacing:".5px" }}>Statut</div>
                      <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:16 }}>
                        {STATUSES.map(s => {
                          const c = STATUS_C[s] || "#6b7280";
                          return <button key={s} onClick={() => updStatus(p.id,s)} style={{ padding:"5px 13px", borderRadius:20, fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:p.status===s?700:400, background:p.status===s?c+"22":"transparent", color:c, border:`1px solid ${c}${p.status===s?"55":"22"}`, transition:"all .1s" }}>{s}</button>;
                        })}
                      </div>

                      {/* Message IA */}
                      {genLoading && <div style={{ display:"flex", gap:10, alignItems:"center", color:"#c9a84c", fontSize:13 }}><Spinner size={14}/>Génération du message…</div>}
                      {genMsg && !genLoading && (
                        <div style={{ background:"rgba(201,168,76,.06)", border:"1px solid rgba(201,168,76,.2)", borderRadius:10, padding:"16px 18px" }}>
                          <div style={{ fontSize:11, color:"#c9a84c", fontWeight:700, marginBottom:10, textTransform:"uppercase", letterSpacing:".5px" }}>✨ Message suggéré</div>
                          <p style={{ margin:0, fontSize:13, color:"#e2e8f0", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{genMsg}</p>
                          <button onClick={() => { navigator.clipboard.writeText(genMsg); showToast("Copié ✓"); }} style={{ ...btnX, marginTop:12, fontSize:12, padding:"6px 14px" }}>📋 Copier</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {!loadingList && shortlist.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:"#374151" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:15, color:"#4b5563", marginBottom:6 }}>Ta liste est vide</div>
                  <div style={{ fontSize:13 }}>Lance une chasse et sauvegarde les meilleures pistes !</div>
                  <button onClick={() => setTab("chasse")} style={{ ...btnG, marginTop:16 }}>🎯 Aller chasser</button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
