import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const ZONES = ["Narbonne","Narbonne-Plage","Gruissan","Port-la-Nouvelle","Corbières – Lézignan","Corbières – Tuchan","Corbières – Durban","Corbières – Lagrasse"];
const TYPES = ["Tous types","Maison","Appartement","Terrain","Local commercial"];
const SOURCES = ["Toutes sources","Le Bon Coin","PAP.fr","Facebook","Annonces légales"];
const STATUSES = ["À appeler","Appelé","En discussion","Mandat signé","Sans suite"];
const STATUS_C = { "À appeler":"#f59e0b","Appelé":"#3b82f6","En discussion":"#8b5cf6","Mandat signé":"#10b981","Sans suite":"#6b7280" };
const GEMINI_MODEL = "gemini-2.5-flash";

function Badge({ status }) {
  const c = STATUS_C[status] || "#6b7280";
  return <span style={{ background:c+"22",color:c,border:`1px solid ${c}44`,padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap" }}>{status}</span>;
}
function Spinner({ size=18 }) {
  return <div style={{ width:size,height:size,border:`2px solid rgba(255,255,255,.15)`,borderTopColor:"#c9a84c",borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0 }}/>;
}

export default function App() {
  const [tab, setTab] = useState("chasse");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_key") || "");
  const [keyDraft, setKeyDraft] = useState("");
  const [zones, setZones] = useState(["Narbonne","Corbières – Lézignan"]);
  const [typeBien, setTypeBien] = useState("Tous types");
  const [source, setSource] = useState("Toutes sources");
  const [anciennete, setAnciennete] = useState("30");
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState("");
  const [results, setResults] = useState([]);
  const [searchErr, setSearchErr] = useState("");
  const [lastSearch, setLastSearch] = useState(null);
  const [shortlist, setShortlist] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedPr, setSelectedPr] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [toast, setToast] = useState(null);

  function showToast(msg, type="ok") { setToast({msg,type}); setTimeout(()=>setToast(null),3200); }

  useEffect(() => { loadShortlist(); }, []);
  useEffect(() => {
    const ch = supabase.channel("hunter4").on("postgres_changes",{event:"*",schema:"public",table:"prospects"},loadShortlist).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function loadShortlist() {
    setLoadingList(true);
    const { data } = await supabase.from("prospects").select("*").order("created_at",{ascending:false});
    setShortlist(data||[]);
    setLoadingList(false);
  }

  function saveKey() {
    if (!keyDraft.trim()) return;
    localStorage.setItem("gemini_key", keyDraft.trim());
    setApiKey(keyDraft.trim());
    setKeyDraft("");
    showToast("Clé Gemini sauvegardée ✓");
  }

  async function lancerChasse() {
    if (!apiKey) { setTab("config"); return; }
    if (zones.length === 0) { showToast("Sélectionne au moins une zone","err"); return; }
    setSearching(true); setResults([]); setSearchErr(""); setLastSearch(new Date());

    const zonesStr = zones.join(", ");
    const typeStr = typeBien === "Tous types" ? "maisons, appartements, terrains, locaux commerciaux" : typeBien;
    const sourceStr = source === "Toutes sources"
      ? "leboncoin.fr, pap.fr, Facebook Marketplace, groupes Facebook locaux de l'Aude, journaux annonces légales Aude"
      : source === "Le Bon Coin" ? "leboncoin.fr uniquement"
      : source === "PAP.fr" ? "pap.fr uniquement"
      : source === "Facebook" ? "Facebook Marketplace et groupes Facebook locaux de l'Aude uniquement"
      : "journaux d'annonces légales de l'Aude uniquement";

    try {
      // Étape 1 : recherche avec Google Search
      setSearchStep("🔍 Recherche en cours sur " + (source === "Toutes sources" ? "LBC, PAP, Facebook, annonces légales" : source) + "…");
      const res1 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            tools:[{ google_search:{} }],
            contents:[{ role:"user", parts:[{ text:`Cherche sur internet des annonces immobilières récentes (moins de ${anciennete} jours) publiées par des PARTICULIERS sans agence dans ces zones : ${zonesStr}, département Aude (11), France. Type de bien : ${typeStr}. Sources à fouiller : ${sourceStr}. Pour chaque annonce trouvée, donne le maximum de détails : titre du bien, ville, prix, lien vers l'annonce, contact si visible, date de publication, et tout signal de motivation vendeur (baisse de prix, succession, divorce, mutation, urgence).` }] }],
            generationConfig:{ temperature:0.1, maxOutputTokens:2048 }
          })
        }
      );

      if (!res1.ok) {
        const err = await res1.json();
        if (res1.status===429) setSearchErr("Trop de requêtes — attends 60 secondes et réessaie.");
        else setSearchErr(`Erreur API : ${err?.error?.message || res1.status}`);
        setSearching(false); return;
      }

      const data1 = await res1.json();
      const rawText = (data1.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");

if (!rawText.trim()) {
  setSearchErr("Aucun résultat trouvé. Essaie d'élargir les critères.");
  setSearching(false); return;
}
// DEBUG TEMPORAIRE
setSearchErr("DEBUG rawText: " + rawText.slice(0, 500));
setSearching(false); return;
      }

      // Étape 2 : structurer en JSON
      setSearchStep("⚙️ Analyse et structuration des résultats…");
      const res2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            contents:[{ role:"user", parts:[{ text:`Voici des résultats de recherche sur des annonces immobilières :\n\n${rawText}\n\nExtrait et structure ces annonces en tableau JSON. Retourne UNIQUEMENT le tableau JSON brut, sans markdown, sans backticks, sans texte avant ou après :\n[{"titre":"description courte du bien ex Maison 4p avec jardin","type":"Maison ou Appartement ou Terrain ou Local commercial","zone":"ville ou secteur","prix":"prix avec euro ou vide si inconnu","source":"Le Bon Coin ou PAP.fr ou Facebook ou Annonces légales","url":"lien direct vers annonce ou vide","contact":"nom ou pseudo vendeur ou vide","anciennete":"nombre de jours estimé ou vide","signal":"signal motivation vendeur ex baisse de prix succession divorce ou vide","note":"1 phrase pourquoi bonne piste pour Amandine mandataire immobilière"}]\nMaximum 10 résultats. Si aucune annonce exploitable retourner [].` }] }],
            generationConfig:{ temperature:0, maxOutputTokens:2048 }
          })
        }
      );

      const data2 = await res2.json();
      const text2 = (data2.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
      const clean = text2.replace(/```json|```/g,"").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) {
        setSearchErr("Pas de résultats exploitables. Réessaie dans quelques secondes.");
        setSearching(false); return;
      }
      const parsed = JSON.parse(match[0]);
      setResults(Array.isArray(parsed) ? parsed : []);
      if (!parsed.length) setSearchErr("Aucune annonce trouvée. Essaie d'élargir les critères ou l'ancienneté.");

    } catch(e) {
      setSearchErr("Erreur de connexion. Réessaie.");
    }
    setSearching(false);
    setSearchStep("");
  }

  async function sauvegarder(r) {
    if (shortlist.find(p=>p.name===r.titre&&p.zone===r.zone)) { showToast("Déjà dans ta liste","info"); return; }
    const { error } = await supabase.from("prospects").insert([{
      name:r.titre, phone:r.contact||"", zone:r.zone, type:r.type, source:r.source,
      status:"À appeler", note:`${r.signal?"⚡ "+r.signal+" · ":""}${r.note||""}`,
      date:new Date().toISOString().split("T")[0],
    }]);
    if (error) { showToast("Erreur sauvegarde","err"); return; }
    showToast("Sauvegardé ✓"); loadShortlist();
  }

  async function updStatus(id, status) {
    await supabase.from("prospects").update({status}).eq("id",id);
    setShortlist(prev=>prev.map(p=>p.id===id?{...p,status}:p));
    if (selectedPr?.id===id) setSelectedPr(p=>({...p,status}));
    showToast(`→ ${status}`);
  }

  async function deletePr(id) {
    if (!confirm("Retirer de la liste ?")) return;
    await supabase.from("prospects").delete().eq("id",id);
    setShortlist(prev=>prev.filter(p=>p.id!==id));
    if (selectedPr?.id===id) setSelectedPr(null);
    showToast("Retiré","info");
  }

  async function genererMessage(p) {
    if (!apiKey) { showToast("Configure ta clé Gemini","err"); return; }
    setGenLoading(true); setGenMsg("");
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        { method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ contents:[{ role:"user", parts:[{ text:`Rédige un message de prospection court et chaleureux pour Amandine, mandataire immobilière dans l'Aude. Prospect : ${p.name}, bien : ${p.type}, zone : ${p.zone}. Contexte : ${p.note||"aucun"}. Français, moins de 80 mots, humain, pas commercial. Proposer un simple appel. Signer "Amandine – Mandataire immobilière, Narbonne & Corbières". Message uniquement.` }] }], generationConfig:{maxOutputTokens:300} }) }
      );
      const d = await res.json();
      setGenMsg(d.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur.");
    } catch { setGenMsg("Erreur génération."); }
    setGenLoading(false);
  }

  function toggleZone(z) { setZones(prev=>prev.includes(z)?prev.filter(x=>x!==z):[...prev,z]); }

  const inp  = { background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"#f1f5f9",padding:"10px 14px",borderRadius:10,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",width:"100%" };
  const btnG = { background:"linear-gradient(135deg,#c9a84c,#e6c970)",color:"#1a1208",border:"none",padding:"11px 24px",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" };
  const btnX = { background:"rgba(255,255,255,.07)",color:"#94a3b8",border:"1px solid rgba(255,255,255,.1)",padding:"8px 16px",borderRadius:9,fontWeight:500,fontSize:12,cursor:"pointer",fontFamily:"inherit" };
  const aContacter = shortlist.filter(p=>p.status==="À appeler").length;

  return (
    <div style={{ minHeight:"100vh",background:"#0d1117",color:"#f1f5f9",fontFamily:"'DM Sans','Segoe UI',sans-serif",display:"flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:4px;}
        select option{background:#1e293b;color:#f1f5f9;}
        input::placeholder{color:#374151;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .rcard:hover{border-color:rgba(201,168,76,.3)!important;background:rgba(201,168,76,.04)!important;}
      `}</style>

      {toast && <div style={{ position:"fixed",top:20,right:20,zIndex:9999,background:toast.type==="err"?"rgba(239,68,68,.95)":toast.type==="info"?"rgba(30,64,175,.95)":"rgba(16,185,129,.95)",color:"#fff",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:600,boxShadow:"0 8px 30px rgba(0,0,0,.5)",animation:"slideIn .2s ease" }}>{toast.msg}</div>}

      {/* Sidebar */}
      <div style={{ width:220,background:"rgba(255,255,255,.02)",borderRight:"1px solid rgba(255,255,255,.06)",padding:"28px 14px",display:"flex",flexDirection:"column",gap:6,flexShrink:0 }}>
        <div style={{ paddingLeft:8,marginBottom:28 }}>
          <div style={{ fontFamily:"'Playfair Display',serif",fontSize:19,color:"#c9a84c" }}>Immo<span style={{ color:"#f1f5f9" }}>Hunter</span></div>
          <div style={{ fontSize:10,color:"#374151",marginTop:4,letterSpacing:"1px",textTransform:"uppercase" }}>NARBONNE & CORBIÈRES</div>
        </div>
        {[{id:"chasse",label:"🎯 Chasse prospects",badge:null},{id:"liste",label:"📋 Ma liste",badge:aContacter||null},{id:"config",label:"⚙️ Configuration",badge:!apiKey?1:null}].map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} style={{ background:tab===n.id?"rgba(201,168,76,.12)":"transparent",border:tab===n.id?"1px solid rgba(201,168,76,.25)":"1px solid transparent",color:tab===n.id?"#c9a84c":"#6b7280",padding:"11px 13px",borderRadius:9,fontSize:13,fontWeight:tab===n.id?700:400,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit",transition:"all .15s" }}>
            <span>{n.label}</span>
            {n.badge>0&&<span style={{ background:n.id==="config"?"rgba(239,68,68,.8)":"rgba(201,168,76,.8)",color:n.id==="config"?"#fff":"#1a1208",fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:20 }}>{n.badge}</span>}
          </button>
        ))}
        <div style={{ marginTop:"auto",paddingTop:14,borderTop:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:7,padding:"6px 8px" }}>
            <span style={{ width:7,height:7,borderRadius:"50%",background:apiKey?"#10b981":"#ef4444",display:"inline-block" }}/>
            <span style={{ fontSize:11,color:"#374151" }}>{apiKey?"Gemini connecté":"Clé manquante"}</span>
          </div>
          <div style={{ fontSize:12,color:"#c9a84c",fontWeight:600,paddingLeft:8,marginTop:4 }}>Amandine ✦</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"30px 36px",overflowY:"auto",maxHeight:"100vh" }}>

        {/* CONFIG */}
        {tab==="config" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:32,margin:"0 0 6px",fontWeight:700 }}>Configuration</h1>
            <p style={{ color:"#4b5563",margin:"0 0 28px",fontSize:14 }}>Configure ta clé Gemini pour activer la chasse automatique</p>
            <div style={{ background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:28,maxWidth:560 }}>
              <h3 style={{ margin:"0 0 6px",fontSize:16,color:"#c9a84c" }}>🔑 Clé API Google Gemini</h3>
              <p style={{ margin:"0 0 20px",fontSize:13,color:"#4b5563",lineHeight:1.7 }}>
                Gratuit · 1 500 recherches/jour · Aucune carte bancaire requise<br/>
                <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" style={{ color:"#c9a84c" }}>aistudio.google.com</a> → Get API Key → Create API key
              </p>
              {apiKey ? (
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.2)",borderRadius:10,padding:"12px 16px",marginBottom:16 }}>
                    <span>✅</span>
                    <div>
                      <div style={{ fontSize:13,fontWeight:600,color:"#34d399" }}>Clé configurée</div>
                      <div style={{ fontSize:12,color:"#4b5563" }}>{apiKey.slice(0,8)}••••••••{apiKey.slice(-4)}</div>
                    </div>
                  </div>
                  <button onClick={()=>{ localStorage.removeItem("gemini_key"); setApiKey(""); showToast("Clé supprimée","info"); }} style={{ ...btnX,color:"#ef4444",border:"1px solid rgba(239,68,68,.2)",fontSize:12 }}>🗑 Supprimer la clé</button>
                </div>
              ) : (
                <div>
                  <input placeholder="AIzaSy..." value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} style={{ ...inp,marginBottom:12,fontFamily:"monospace",fontSize:12 }}/>
                  <button onClick={saveKey} disabled={!keyDraft.trim()} style={{ ...btnG,opacity:keyDraft.trim()?1:.5 }}>Enregistrer la clé</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHASSE */}
        {tab==="chasse" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:32,margin:"0 0 6px",fontWeight:700 }}>Chasse automatique</h1>
            <p style={{ color:"#4b5563",margin:"0 0 28px",fontSize:14 }}>Gemini + Google Search fouille LBC, PAP, Facebook et annonces légales pour toi</p>

            {!apiKey && (
              <div style={{ background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:12,padding:"16px 20px",marginBottom:22,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <span>⚠️</span>
                  <span style={{ fontSize:13,color:"#f87171",fontWeight:600 }}>Configure ta clé Gemini pour activer la chasse</span>
                </div>
                <button onClick={()=>setTab("config")} style={{ ...btnG,padding:"8px 16px",fontSize:12 }}>Configurer →</button>
              </div>
            )}

            <div style={{ background:"rgba(201,168,76,.05)",border:"1px solid rgba(201,168,76,.2)",borderRadius:18,padding:28,marginBottom:28 }}>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11,color:"#6b7280",display:"block",marginBottom:10,textTransform:"uppercase",letterSpacing:"1px",fontWeight:600 }}>📍 Zones</label>
                <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                  {ZONES.map(z=>(
                    <button key={z} onClick={()=>toggleZone(z)} style={{ padding:"7px 14px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:zones.includes(z)?700:400,background:zones.includes(z)?"rgba(201,168,76,.2)":"rgba(255,255,255,.05)",color:zones.includes(z)?"#c9a84c":"#6b7280",border:zones.includes(z)?"1px solid rgba(201,168,76,.4)":"1px solid rgba(255,255,255,.08)",transition:"all .15s" }}>{z}</button>
                  ))}
                </div>
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:22 }}>
                <div>
                  <label style={{ fontSize:11,color:"#6b7280",display:"block",marginBottom:7,textTransform:"uppercase",letterSpacing:"1px",fontWeight:600 }}>🏠 Type de bien</label>
                  <select value={typeBien} onChange={e=>setTypeBien(e.target.value)} style={inp}>{TYPES.map(t=><option key={t}>{t}</option>)}</select>
                </div>
                <div>
                  <label style={{ fontSize:11,color:"#6b7280",display:"block",marginBottom:7,textTransform:"uppercase",letterSpacing:"1px",fontWeight:600 }}>📡 Source</label>
                  <select value={source} onChange={e=>setSource(e.target.value)} style={inp}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select>
                </div>
                <div>
                  <label style={{ fontSize:11,color:"#6b7280",display:"block",marginBottom:7,textTransform:"uppercase",letterSpacing:"1px",fontWeight:600 }}>📅 Ancienneté max</label>
                  <select value={anciennete} onChange={e=>setAnciennete(e.target.value)} style={inp}>
                    <option value="7">7 jours</option>
                    <option value="14">14 jours</option>
                    <option value="30">30 jours</option>
                    <option value="60">60 jours</option>
                    <option value="90">90 jours</option>
                  </select>
                </div>
              </div>

              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <button onClick={lancerChasse} disabled={searching||!apiKey} style={{ ...btnG,padding:"13px 36px",fontSize:15,opacity:searching||!apiKey?.6:1,display:"flex",alignItems:"center",gap:10 }}>
                  {searching?<><Spinner size={16}/>Recherche…</>:"🚀 Lancer la chasse"}
                </button>
                {lastSearch&&!searching&&<span style={{ fontSize:12,color:"#4b5563" }}>Dernière : {lastSearch.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span>}
              </div>
            </div>

            {searching && (
              <div style={{ textAlign:"center",padding:"50px 0" }}>
                <div style={{ display:"flex",justifyContent:"center",marginBottom:16 }}><Spinner size={40}/></div>
                <div style={{ fontSize:16,color:"#c9a84c",fontWeight:600,marginBottom:8 }}>{searchStep || "Gemini cherche pour toi…"}</div>
                <div style={{ fontSize:13,color:"#4b5563" }}>Fouille {source === "Toutes sources" ? "LBC, PAP, Facebook, annonces légales" : source}</div>
                <div style={{ fontSize:12,color:"#374151",marginTop:6 }}>30 à 60 secondes</div>
              </div>
            )}

            {searchErr&&!searching&&(
              <div style={{ background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"16px 20px",color:"#f87171",fontSize:13,marginBottom:20 }}>{searchErr}</div>
            )}

            {results.length>0&&!searching&&(
              <div style={{ animation:"fadeIn .4s ease" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                  <div>
                    <span style={{ fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:"#c9a84c" }}>{results.length}</span>
                    <span style={{ fontSize:14,color:"#6b7280",marginLeft:8 }}>piste(s) trouvée(s)</span>
                  </div>
                  <button onClick={()=>results.forEach(r=>sauvegarder(r))} style={{ ...btnX,color:"#c9a84c",border:"1px solid rgba(201,168,76,.3)" }}>⭐ Tout sauvegarder</button>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                  {results.map((r,i)=>{
                    const already=shortlist.find(p=>p.name===r.titre&&p.zone===r.zone);
                    return(
                      <div key={i} className="rcard" style={{ background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:"20px 24px",transition:"all .15s",animation:`fadeIn .3s ease ${i*.05}s both` }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10 }}>
                              <span>{{"Le Bon Coin":"🏷️","PAP.fr":"📰","Facebook":"📱","Annonces légales":"⚖️"}[r.source]||"🔍"}</span>
                              <span style={{ fontWeight:700,fontSize:15 }}>{r.titre}</span>
                              {r.type&&<span style={{ fontSize:11,color:"#6b7280",background:"rgba(255,255,255,.06)",padding:"2px 9px",borderRadius:6 }}>{r.type}</span>}
                              {r.anciennete&&<span style={{ fontSize:11,color:"#4b5563" }}>~{r.anciennete}j</span>}
                            </div>
                            <div style={{ display:"flex",gap:16,flexWrap:"wrap",fontSize:13,color:"#6b7280",marginBottom:10 }}>
                              <span>📍 {r.zone}</span>
                              {r.prix&&<span style={{ color:"#c9a84c",fontWeight:700 }}>💶 {r.prix}</span>}
                              <span>📌 {r.source}</span>
                              {r.contact&&<span>👤 {r.contact}</span>}
                            </div>
                            {r.signal&&<div style={{ display:"inline-flex",alignItems:"center",gap:6,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8,padding:"5px 12px",fontSize:12,color:"#fbbf24",marginBottom:10,fontWeight:600 }}>⚡ {r.signal}</div>}
                            {r.note&&<div style={{ fontSize:13,color:"#4b5563",fontStyle:"italic",lineHeight:1.5 }}>🤖 {r.note}</div>}
                          </div>
                          <div style={{ display:"flex",flexDirection:"column",gap:8,flexShrink:0,alignItems:"flex-end" }}>
                            {r.url?<a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...btnG,padding:"9px 18px",fontSize:12,textDecoration:"none",display:"inline-block" }}>Voir →</a>:<span style={{ fontSize:11,color:"#374151" }}>Lien non dispo</span>}
                            {already?<span style={{ fontSize:12,color:"#10b981" }}>✓ Sauvegardé</span>:<button onClick={()=>sauvegarder(r)} style={{ ...btnX,fontSize:12,padding:"7px 14px" }}>⭐ Sauvegarder</button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {results.length===0&&!searching&&!searchErr&&(
              <div style={{ textAlign:"center",padding:"60px 0" }}>
                <div style={{ fontSize:52,marginBottom:16 }}>🎯</div>
                <div style={{ fontSize:16,color:"#4b5563",fontWeight:600,marginBottom:8 }}>Prête à chasser ?</div>
                <div style={{ fontSize:13,color:"#374151",lineHeight:1.8 }}>Sélectionne tes zones et lance la recherche.<br/>Gemini fouille Le Bon Coin, PAP, Facebook et les annonces légales.</div>
              </div>
            )}
          </div>
        )}

        {/* LISTE */}
        {tab==="liste" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:32,margin:"0 0 6px",fontWeight:700 }}>Ma liste</h1>
            <p style={{ color:"#4b5563",margin:"0 0 24px",fontSize:14 }}>{shortlist.length} prospect(s) · {aContacter} à appeler</p>
            {loadingList&&<div style={{ display:"flex",gap:12,alignItems:"center",color:"#4b5563",padding:20 }}><Spinner/>Chargement…</div>}
            {!loadingList&&shortlist.length>0&&(
              <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap" }}>
                {STATUSES.map(s=>{ const c=shortlist.filter(p=>p.status===s).length; if(!c)return null; const col=STATUS_C[s]||"#6b7280";
                  return <div key={s} style={{ background:col+"15",border:`1px solid ${col}33`,borderRadius:10,padding:"8px 16px",display:"flex",gap:8,alignItems:"center" }}>
                    <span style={{ fontSize:20,fontWeight:700,color:col }}>{c}</span>
                    <span style={{ fontSize:12,color:col }}>{s}</span>
                  </div>;
                })}
              </div>
            )}
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {!loadingList&&shortlist.map(p=>(
                <div key={p.id} style={{ background:selectedPr?.id===p.id?"rgba(201,168,76,.05)":"rgba(255,255,255,.025)",border:selectedPr?.id===p.id?"1px solid rgba(201,168,76,.25)":"1px solid rgba(255,255,255,.07)",borderRadius:13,padding:"16px 22px",transition:"all .15s" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:7 }}>
                        <span style={{ fontWeight:700,fontSize:14 }}>{p.name}</span>
                        <Badge status={p.status}/>
                        <span style={{ fontSize:11,color:"#4b5563",background:"rgba(255,255,255,.05)",padding:"2px 8px",borderRadius:6 }}>{p.type}</span>
                      </div>
                      <div style={{ fontSize:12,color:"#4b5563",display:"flex",gap:14,flexWrap:"wrap" }}>
                        <span>📍 {p.zone}</span><span>📌 {p.source}</span>
                        {p.phone&&<span>👤 {p.phone}</span>}
                      </div>
                      {p.note&&<div style={{ fontSize:12,color:"#374151",marginTop:7,fontStyle:"italic",lineHeight:1.5 }}>{p.note}</div>}
                    </div>
                    <div style={{ display:"flex",gap:8,marginLeft:14,flexShrink:0 }}>
                      <button onClick={()=>{ setSelectedPr(selectedPr?.id===p.id?null:p); genererMessage(p); }} style={{ ...btnX,fontSize:12,color:"#c9a84c",border:"1px solid rgba(201,168,76,.3)",padding:"7px 13px" }}>✨ Message</button>
                      <button onClick={()=>deletePr(p.id)} style={{ ...btnX,padding:"7px 10px",color:"#ef4444",border:"1px solid rgba(239,68,68,.2)",fontSize:14 }}>✕</button>
                    </div>
                  </div>
                  {selectedPr?.id===p.id&&(
                    <div style={{ marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.06)" }}>
                      <div style={{ fontSize:11,color:"#4b5563",marginBottom:9,textTransform:"uppercase",letterSpacing:".5px" }}>Statut</div>
                      <div style={{ display:"flex",gap:7,flexWrap:"wrap",marginBottom:16 }}>
                        {STATUSES.map(s=>{ const c=STATUS_C[s]||"#6b7280"; return(
                          <button key={s} onClick={()=>updStatus(p.id,s)} style={{ padding:"5px 13px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:p.status===s?700:400,background:p.status===s?c+"22":"transparent",color:c,border:`1px solid ${c}${p.status===s?"55":"22"}`,transition:"all .1s" }}>{s}</button>
                        );})}
                      </div>
                      {genLoading&&<div style={{ display:"flex",gap:10,alignItems:"center",color:"#c9a84c",fontSize:13 }}><Spinner size={14}/>Génération…</div>}
                      {genMsg&&!genLoading&&(
                        <div style={{ background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.2)",borderRadius:10,padding:"16px 18px" }}>
                          <div style={{ fontSize:11,color:"#c9a84c",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px" }}>✨ Message suggéré</div>
                          <p style={{ margin:0,fontSize:13,color:"#e2e8f0",lineHeight:1.8,whiteSpace:"pre-wrap" }}>{genMsg}</p>
                          <button onClick={()=>{ navigator.clipboard.writeText(genMsg); showToast("Copié ✓"); }} style={{ ...btnX,marginTop:12,fontSize:12,padding:"6px 14px" }}>📋 Copier</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!loadingList&&shortlist.length===0&&(
                <div style={{ textAlign:"center",padding:"60px 0" }}>
                  <div style={{ fontSize:40,marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:15,color:"#4b5563",marginBottom:6 }}>Ta liste est vide</div>
                  <div style={{ fontSize:13,color:"#374151" }}>Lance une chasse et sauvegarde les meilleures pistes !</div>
                  <button onClick={()=>setTab("chasse")} style={{ ...btnG,marginTop:16 }}>🎯 Aller chasser</button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
