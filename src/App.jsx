import { useState, useEffect } from "react";

const PROPERTY_TYPES = ["Maison", "Appartement", "Terrain", "Local commercial"];
const STATUSES = ["À contacter", "Contacté", "En discussion", "Mandat signé", "Perdu"];
const STATUS_COLORS = {
  "À contacter": "#f59e0b",
  "Contacté": "#3b82f6",
  "En discussion": "#8b5cf6",
  "Mandat signé": "#10b981",
  "Perdu": "#6b7280",
};
const SOURCES = [
  { id: 1, name: "Le Bon Coin", icon: "🏷️", desc: "Annonces FSBO (particulier à particulier)", tips: "Filtrer par 'Ventes immobilières > Particulier', noter les annonces > 60 jours" },
  { id: 2, name: "PAP.fr", icon: "📰", desc: "Particulier à particulier – annonces directes", tips: "Scruter les annonces sans agence, contacter sous 48h après publication" },
  { id: 3, name: "Réseaux sociaux", icon: "📱", desc: "Facebook, Instagram, LinkedIn", tips: "Groupes locaux 'Ventes & achats', hashtags #vendresamaison" },
  { id: 4, name: "Successions & notaires", icon: "⚖️", desc: "Partenariats avec études notariales locales", tips: "Contacter 3-5 notaires de la zone, proposer une carte de visite" },
  { id: 5, name: "Mutations professionnelles", icon: "💼", desc: "Employés mutés = vendeurs pressés", tips: "Contacter RH de grandes entreprises locales, DRH industriels" },
  { id: 6, name: "Propriétaires bailleurs lassés", icon: "🏠", desc: "Annonces de locations répétées", tips: "Annonces de location > 6 mois sur LBC = propriétaire découragé" },
  { id: 7, name: "Divorces & séparations", icon: "📋", desc: "Tribunal judiciaire – annonces légales", tips: "Journal d'annonces légales du département, section 'dissolution'" },
  { id: 8, name: "Panneaux 'À vendre'", icon: "🚗", desc: "Tournées terrain dans la zone", tips: "Planifier 1 tournée/semaine, noter adresses sans agence" },
];

const INITIAL_ZONES = [
  { id: 1, name: "Narbonne", dept: "11" },
  { id: 2, name: "Narbonne-Plage", dept: "11" },
  { id: 3, name: "Gruissan", dept: "11" },
  { id: 4, name: "Port-la-Nouvelle", dept: "11" },
  { id: 5, name: "Corbières – Lézignan", dept: "11" },
  { id: 6, name: "Corbières – Tuchan", dept: "11" },
  { id: 7, name: "Corbières – Durban", dept: "11" },
  { id: 8, name: "Corbières – Lagrasse", dept: "11" },
];

const INITIAL_PROSPECTS = [
  { id: 1, name: "M. Fabre Jean-Louis", phone: "06 11 22 33 44", zone: "Corbières – Lézignan", type: "Maison", source: "Le Bon Coin", status: "À contacter", note: "Annonce en ligne depuis 55 jours, prix baissé une fois. Vigneron partant à la retraite.", date: "2026-03-01" },
  { id: 2, name: "Mme Rouquette Sylvie", phone: "06 55 66 77 88", zone: "Narbonne", type: "Appartement", source: "PAP.fr", status: "Contacté", note: "Mutation professionnelle vers Montpellier, vente urgente souhaitée.", date: "2026-03-04" },
  { id: 3, name: "M. Bonnet & Mme Arnal", phone: "07 33 44 55 66", zone: "Corbières – Tuchan", type: "Terrain", source: "Panneaux 'À vendre'", status: "En discussion", note: "Grande parcelle viticole, succession familiale en cours.", date: "2026-03-06" },
];

function Badge({ status }) {
  return (
    <span style={{
      background: STATUS_COLORS[status] + "22",
      color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}55`,
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>{status}</span>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: "20px 24px",
      display: "flex",
      alignItems: "center",
      gap: 16,
      backdropFilter: "blur(10px)",
    }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'Playfair Display', serif" }}>{value}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [zones, setZones] = useState(INITIAL_ZONES);
  const [prospects, setProspects] = useState(INITIAL_PROSPECTS);
  const [newZone, setNewZone] = useState({ name: "", dept: "" });
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("Tous");
  const [filterType, setFilterType] = useState("Tous");
  const [filterZone, setFilterZone] = useState("Toutes");
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [newProspect, setNewProspect] = useState({
    name: "", phone: "", zone: "", type: "Maison", source: "Le Bon Coin", status: "À contacter", note: "", date: new Date().toISOString().split("T")[0]
  });

  const filteredProspects = prospects.filter(p =>
    (filterStatus === "Tous" || p.status === filterStatus) &&
    (filterType === "Tous" || p.type === filterType) &&
    (filterZone === "Toutes" || p.zone === filterZone)
  );

  const stats = {
    total: prospects.length,
    aContacter: prospects.filter(p => p.status === "À contacter").length,
    enCours: prospects.filter(p => ["Contacté", "En discussion"].includes(p.status)).length,
    mandats: prospects.filter(p => p.status === "Mandat signé").length,
  };

  async function generateMessage(prospect) {
    setAiLoading(true);
    setAiMessage("");
    setSelectedProspect(prospect);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Tu es assistante commerciale pour une mandataire immobilière indépendante et expérimentée. Rédige un message de prospection court, chaleureux et professionnel pour contacter ce prospect potentiel vendeur :

Nom : ${prospect.name}
Bien : ${prospect.type}
Zone : ${prospect.zone}
Source : ${prospect.source}
Note : ${prospect.note}

Le message doit :
- Être en français
- Faire moins de 100 mots
- Être humain et non commercial/agressif
- Mentionner subtilement comment tu as trouvé leur contact
- Proposer un simple rendez-vous téléphonique
- Signer "Sophie, mandataire immobilière"

Rédige uniquement le message, sans introduction ni explication.`
          }]
        })
      });
      const data = await res.json();
      setAiMessage(data.content[0].text);
    } catch (e) {
      setAiMessage("Erreur lors de la génération. Vérifiez votre connexion.");
    }
    setAiLoading(false);
  }

  function addZone() {
    if (!newZone.name) return;
    setZones([...zones, { id: Date.now(), ...newZone }]);
    setNewZone({ name: "", dept: "" });
    setShowZoneForm(false);
  }

  function addProspect() {
    if (!newProspect.name || !newProspect.zone) return;
    setProspects([{ id: Date.now(), ...newProspect }, ...prospects]);
    setNewProspect({ name: "", phone: "", zone: "", type: "Maison", source: "Le Bon Coin", status: "À contacter", note: "", date: new Date().toISOString().split("T")[0] });
    setShowProspectForm(false);
  }

  function updateStatus(id, status) {
    setProspects(prospects.map(p => p.id === id ? { ...p, status } : p));
    if (selectedProspect?.id === id) setSelectedProspect({ ...selectedProspect, status });
  }

  function deleteProspect(id) {
    setProspects(prospects.filter(p => p.id !== id));
    if (selectedProspect?.id === id) setSelectedProspect(null);
  }

  const navItems = [
    { id: "dashboard", label: "Tableau de bord", icon: "◈" },
    { id: "prospects", label: "Prospects", icon: "◉" },
    { id: "zones", label: "Zones", icon: "◎" },
    { id: "sources", label: "Sources", icon: "◇" },
  ];

  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#f1f5f9",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    width: "100%",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const btnPrimary = {
    background: "linear-gradient(135deg, #c9a84c, #e6c970)",
    color: "#1a1208",
    border: "none",
    padding: "10px 22px",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  };

  const btnSecondary = {
    background: "rgba(255,255,255,0.07)",
    color: "#cbd5e1",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 22px",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d1117 0%, #111827 40%, #0f172a 100%)",
      color: "#f1f5f9",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "flex",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 4px; }
        * { box-sizing: border-box; }
        textarea { resize: vertical; }
        input::placeholder, textarea::placeholder, select::placeholder { color: #475569; }
        select option { background: #1e293b; color: #f1f5f9; }
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: 220,
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flexShrink: 0,
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ marginBottom: 32, paddingLeft: 8 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#c9a84c", lineHeight: 1.2 }}>
            Immo<span style={{ color: "#f1f5f9" }}>Prospekt</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, letterSpacing: "0.5px" }}>OUTIL DE PROSPECTION</div>
        </div>

        {navItems.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            background: tab === item.id ? "rgba(201,168,76,0.12)" : "transparent",
            border: tab === item.id ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
            color: tab === item.id ? "#c9a84c" : "#94a3b8",
            padding: "11px 14px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: tab === item.id ? 600 : 400,
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "inherit",
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "16px 8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 12, color: "#475569" }}>Mandataire</div>
          <div style={{ fontSize: 14, color: "#c9a84c", fontWeight: 600, marginTop: 2 }}>Sophie ✦</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "32px 36px", overflowY: "auto", maxHeight: "100vh" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0, fontWeight: 700 }}>
              Tableau de bord
            </h1>
            <p style={{ color: "#64748b", marginTop: 6, marginBottom: 32 }}>Vue d'ensemble de votre prospection</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 36 }}>
              <StatCard label="Total prospects" value={stats.total} icon="👥" color="#c9a84c" />
              <StatCard label="À contacter" value={stats.aContacter} icon="📬" color="#f59e0b" />
              <StatCard label="En cours" value={stats.enCours} icon="💬" color="#8b5cf6" />
              <StatCard label="Mandats signés" value={stats.mandats} icon="✅" color="#10b981" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#cbd5e1" }}>Répartition par type</h3>
                {PROPERTY_TYPES.map(type => {
                  const count = prospects.filter(p => p.type === type).length;
                  const pct = prospects.length ? Math.round((count / prospects.length) * 100) : 0;
                  return (
                    <div key={type} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                        <span style={{ color: "#94a3b8" }}>{type}</span>
                        <span style={{ color: "#c9a84c", fontWeight: 600 }}>{count}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #c9a84c, #e6c970)", borderRadius: 4, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#cbd5e1" }}>Derniers prospects</h3>
                {prospects.slice(0, 4).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{p.zone} · {p.type}</div>
                    </div>
                    <Badge status={p.status} />
                  </div>
                ))}
                <button onClick={() => setTab("prospects")} style={{ ...btnSecondary, width: "100%", marginTop: 16, textAlign: "center" }}>
                  Voir tous les prospects →
                </button>
              </div>
            </div>

            <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 16, padding: 24, marginTop: 20 }}>
              <h3 style={{ margin: "0 0 8px", color: "#c9a84c", fontSize: 16 }}>💡 Conseil du jour</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
                Les annonces <strong style={{ color: "#e2e8f0" }}>particulier à particulier</strong> sans agence depuis plus de <strong style={{ color: "#e2e8f0" }}>45 jours</strong> sont vos meilleurs prospects : le vendeur est souvent découragé et prêt à faire confiance à un professionnel. Appelez-les le matin entre 9h et 11h pour un meilleur taux de réponse.
              </p>
            </div>
          </div>
        )}

        {/* PROSPECTS */}
        {tab === "prospects" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0 }}>Prospects</h1>
                <p style={{ color: "#64748b", margin: "6px 0 0" }}>{filteredProspects.length} prospect(s) trouvé(s)</p>
              </div>
              <button onClick={() => setShowProspectForm(true)} style={btnPrimary}>+ Ajouter un prospect</button>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {["Tous", ...STATUSES].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  ...btnSecondary,
                  padding: "7px 14px",
                  background: filterStatus === s ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
                  color: filterStatus === s ? "#c9a84c" : "#94a3b8",
                  border: filterStatus === s ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  fontSize: 13,
                }}>{s}</button>
              ))}
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "7px 14px" }}>
                <option>Tous</option>
                {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "7px 14px" }}>
                <option>Toutes</option>
                {zones.map(z => <option key={z.id}>{z.name}</option>)}
              </select>
            </div>

            {/* Form */}
            {showProspectForm && (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 20px", color: "#c9a84c" }}>Nouveau prospect</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <input placeholder="Nom du prospect *" value={newProspect.name} onChange={e => setNewProspect({ ...newProspect, name: e.target.value })} style={inputStyle} />
                  <input placeholder="Téléphone" value={newProspect.phone} onChange={e => setNewProspect({ ...newProspect, phone: e.target.value })} style={inputStyle} />
                  <select value={newProspect.zone} onChange={e => setNewProspect({ ...newProspect, zone: e.target.value })} style={inputStyle}>
                    <option value="">Choisir une zone *</option>
                    {zones.map(z => <option key={z.id}>{z.name}</option>)}
                  </select>
                  <select value={newProspect.type} onChange={e => setNewProspect({ ...newProspect, type: e.target.value })} style={inputStyle}>
                    {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <select value={newProspect.source} onChange={e => setNewProspect({ ...newProspect, source: e.target.value })} style={inputStyle}>
                    {SOURCES.map(s => <option key={s.id}>{s.name}</option>)}
                  </select>
                  <select value={newProspect.status} onChange={e => setNewProspect({ ...newProspect, status: e.target.value })} style={inputStyle}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <textarea placeholder="Notes (signal vendeur, contexte...)" value={newProspect.note} onChange={e => setNewProspect({ ...newProspect, note: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 70 }} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={addProspect} style={btnPrimary}>Ajouter</button>
                  <button onClick={() => setShowProspectForm(false)} style={btnSecondary}>Annuler</button>
                </div>
              </div>
            )}

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredProspects.map(p => (
                <div key={p.id} style={{
                  background: selectedProspect?.id === p.id ? "rgba(201,168,76,0.07)" : "rgba(255,255,255,0.03)",
                  border: selectedProspect?.id === p.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "18px 22px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }} onClick={() => setSelectedProspect(selectedProspect?.id === p.id ? null : p)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                        <Badge status={p.status} />
                        <span style={{ fontSize: 12, color: "#64748b" }}>{p.type} · {p.zone}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                        📞 {p.phone || "Non renseigné"} &nbsp;·&nbsp; Source: {p.source} &nbsp;·&nbsp; {p.date}
                      </div>
                      {p.note && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6, fontStyle: "italic" }}>"{p.note}"</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 16, flexShrink: 0 }}>
                      <button onClick={() => generateMessage(p)} style={{ ...btnPrimary, padding: "8px 14px", fontSize: 12 }}>✨ Message IA</button>
                      <button onClick={() => deleteProspect(p.id)} style={{ ...btnSecondary, padding: "8px 12px", fontSize: 16, color: "#ef4444" }}>✕</button>
                    </div>
                  </div>

                  {selectedProspect?.id === p.id && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        <span style={{ fontSize: 13, color: "#64748b", alignSelf: "center" }}>Changer le statut :</span>
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => updateStatus(p.id, s)} style={{
                            padding: "5px 12px",
                            borderRadius: 20,
                            border: `1px solid ${STATUS_COLORS[s]}55`,
                            background: p.status === s ? STATUS_COLORS[s] + "33" : "transparent",
                            color: STATUS_COLORS[s],
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontWeight: p.status === s ? 700 : 400,
                          }}>{s}</button>
                        ))}
                      </div>

                      {aiLoading && selectedProspect?.id === p.id && (
                        <div style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 10, padding: 16, fontSize: 13, color: "#c9a84c" }}>
                          ✨ Génération du message en cours...
                        </div>
                      )}
                      {aiMessage && selectedProspect?.id === p.id && !aiLoading && (
                        <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 10, padding: 16 }}>
                          <div style={{ fontSize: 12, color: "#c9a84c", fontWeight: 600, marginBottom: 10, letterSpacing: "0.5px" }}>✨ MESSAGE GÉNÉRÉ PAR L'IA</div>
                          <p style={{ margin: 0, fontSize: 14, color: "#e2e8f0", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiMessage}</p>
                          <button onClick={() => navigator.clipboard.writeText(aiMessage)} style={{ ...btnSecondary, marginTop: 12, fontSize: 12, padding: "6px 14px" }}>📋 Copier</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredProspects.length === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                  Aucun prospect pour ces filtres.<br />
                  <button onClick={() => setShowProspectForm(true)} style={{ ...btnPrimary, marginTop: 16 }}>+ Ajouter le premier prospect</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ZONES */}
        {tab === "zones" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0 }}>Zones de prospection</h1>
                <p style={{ color: "#64748b", margin: "6px 0 0" }}>{zones.length} zone(s) active(s)</p>
              </div>
              <button onClick={() => setShowZoneForm(true)} style={btnPrimary}>+ Ajouter une zone</button>
            </div>

            {showZoneForm && (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 16px", color: "#c9a84c" }}>Nouvelle zone</h3>
                <div style={{ display: "flex", gap: 12 }}>
                  <input placeholder="Nom de la ville / quartier *" value={newZone.name} onChange={e => setNewZone({ ...newZone, name: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input placeholder="Département (ex: 69)" value={newZone.dept} onChange={e => setNewZone({ ...newZone, dept: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={addZone} style={btnPrimary}>Ajouter</button>
                  <button onClick={() => setShowZoneForm(false)} style={btnSecondary}>Annuler</button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {zones.map(z => {
                const count = prospects.filter(p => p.zone === z.name).length;
                return (
                  <div key={z.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{z.name}</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Département {z.dept || "–"}</div>
                      </div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#c9a84c" }}>{count}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>{count} prospect{count > 1 ? "s" : ""} dans cette zone</div>
                    <button onClick={() => { setFilterZone(z.name); setTab("prospects"); }} style={{ ...btnSecondary, marginTop: 12, fontSize: 12, padding: "6px 14px" }}>
                      Voir les prospects →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SOURCES */}
        {tab === "sources" && (
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0 }}>Sources de prospects</h1>
            <p style={{ color: "#64748b", margin: "6px 0 32px" }}>Méthodes et canaux pour trouver des vendeurs potentiels</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {SOURCES.map(s => (
                <div key={s.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 16,
                  padding: "22px 24px",
                  transition: "border-color 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 28 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.desc}</div>
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(201,168,76,0.07)",
                    border: "1px solid rgba(201,168,76,0.15)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#94a3b8",
                    lineHeight: 1.6,
                  }}>
                    💡 {s.tips}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24, marginTop: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#c9a84c" }}>🚀 Routine hebdomadaire recommandée</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                {[
                  { day: "Lundi", task: "Scan LBC + PAP, noter les nouvelles annonces" },
                  { day: "Mardi", task: "Appels de prospection (annonces > 45j)" },
                  { day: "Mercredi", task: "Tournée terrain, relever panneaux sans agence" },
                  { day: "Jeudi", task: "Réseaux sociaux + groupes Facebook locaux" },
                  { day: "Vendredi", task: "Suivi prospects en cours, mise à jour CRM" },
                ].map(({ day, task }) => (
                  <div key={day} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontWeight: 700, color: "#c9a84c", fontSize: 13, marginBottom: 8 }}>{day}</div>
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{task}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
