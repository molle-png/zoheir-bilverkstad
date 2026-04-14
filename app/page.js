import { useState, useRef, useEffect } from "react";

/* ═══ VEHICLE LOOKUPS ══════════════════════════════════════ */
async function lookupProxy(regNr, url) { const r = await fetch(`${url}?regNr=${encodeURIComponent(regNr)}`); if (!r.ok) throw new Error(`${r.status}`); const j = await r.json(); if (j.error || !j.make) throw new Error("not found"); return j; }
async function lookupBiluppgifter(regNr, key) { const r = await fetch(`https://api.biluppgifter.se/api/v1/vehicle/regno/${regNr}?include=basic,tech,status`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status}`); const j = await r.json(); const d = Array.isArray(j?.data) ? j.data[0] : j?.data; if (!d) throw new Error("empty"); const b = d.basic?.data || {}, t = d.tech?.data || {}; return { regno: d.attributes?.regno || regNr, vin: d.attributes?.vin || "", make: b.make || "", model: b.model || "", year: String(b.model_year || b.vehicle_year || ""), color: b.color || "", engine: t.engine_description || "", fuel: t.fuel || "", power: t.power ? `${t.power} hk` : "" }; }
async function decodeVIN(vin) { const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`); if (!r.ok) throw new Error("fail"); const v = (await r.json()).Results?.[0]; if (!v?.Make) throw new Error("No data"); const hp = v.EngineHP || ""; const eng = [v.DisplacementL ? `${v.DisplacementL}L` : "", v.EngineCylinders ? `${v.EngineCylinders}-cyl` : "", hp ? `${hp}hk` : ""].filter(Boolean).join(" "); return { vin, regno: "", make: v.Make, model: v.Model, year: v.ModelYear, engine: v.EngineModel ? `${v.EngineModel} ${eng}` : eng, fuel: v.FuelTypePrimary || "", power: hp ? `${hp} hk` : "", body: v.BodyClass || "", country: v.PlantCountry || "" }; }

/* ═══ DIAGNOSIS ════════════════════════════════════════════ */
async function runDiagnosis(vehicle, faultCodes) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system: "Du är en expert bilmekaniker. Svara ENBART med ren JSON (ingen markdown, inga backticks). Priser i SEK. Arbetskostnad 700 SEK/timme.", messages: [{ role: "user", content: `Fordon: ${vehicle.make} ${vehicle.model} ${vehicle.year}, Motor: ${vehicle.engine || "okänd"}
Felkoder: ${faultCodes}
JSON: {"severity":"low|medium|high|critical","systemAffected":"t.ex. Tändsystem","title":"Titel","description":"Förklaring","faultCodes":[{"code":"P0300","meaning":"Förklaring"}],"probableCauses":["Orsak 1","Orsak 2"],"parts":[{"name":"Del","partNumber":"nr","price":250,"supplier":"Biltema"}],"laborHours":2.5,"laborRate":700,"steps":[{"title":"Steg","description":"Beskrivning","minutes":15,"type":"inspection|test|repair|replace"}],"safetyWarnings":["Varning"],"swedenTips":["Tips om kyla/snö/salt/vinter"],"youtubeSearch":"sökterm"}` }] }) });
  const d = await r.json(); const t = (d.content || []).filter(b => b.type === "text").map(b => b.text).join(""); return JSON.parse(t.match(/\{[\s\S]*\}/)[0]);
}

/* ═══ HELPERS ══════════════════════════════════════════════ */
const SEV = { low: { c: "#16A34A", bg: "#F0FDF4", l: "LÅG" }, medium: { c: "#CA8A04", bg: "#FEFCE8", l: "MEDEL" }, high: { c: "#EA580C", bg: "#FFF7ED", l: "HÖG" }, critical: { c: "#DC2626", bg: "#FEF2F2", l: "KRITISK" } };
const SC = { inspection: "#EF4444", test: "#F59E0B", repair: "#16A34A", replace: "#2563EB" };
const SL = { inspection: "I", test: "T", repair: "R", replace: "B" };
const bt = (q, v) => `https://www.biltema.se/sok?query=${encodeURIComponent(q + " " + v.make + " " + v.model)}`;
const yt = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const gg = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
function Spin({ sz = 28, c = "#0057FF" }) { return <div style={{ width: sz, height: sz, border: `3px solid ${c}18`, borderTopColor: c, borderRadius: "50%", animation: "spin .7s linear infinite" }} />; }
function IR({ l, v }) { return v ? <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}><span style={{ fontSize: 12, color: "#9CA3AF" }}>{l}</span><span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{v}</span></div> : null; }

/* ═══ APP ═════════════════════════════════════════════════ */
export default function App() {
  const [step, setStep] = useState("input");
  const [proxyUrl, setProxyUrl] = useState(""); const [proxyIn, setProxyIn] = useState("");
  const [apiKey, setApiKey] = useState(""); const [apiKeyIn, setApiKeyIn] = useState("");
  const [showSet, setShowSet] = useState(false);
  const [regNr, setRegNr] = useState(""); const [vinIn, setVinIn] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [mm, setMm] = useState({ make: "", model: "", year: "", engine: "" });
  const [faultCodes, setFaultCodes] = useState("");
  const [diag, setDiag] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState("");
  const fr = useRef(null), rr = useRef(null);

  useEffect(() => { (async () => { try { const a = await window.storage.get("bu_key"); if (a?.value) { setApiKey(a.value); setApiKeyIn(a.value); } } catch {} try { const p = await window.storage.get("proxy_url"); if (p?.value) { setProxyUrl(p.value); setProxyIn(p.value); } } catch {} })(); }, []);
  useEffect(() => { if (step === "ready") setTimeout(() => fr.current?.focus(), 120); if (step === "result" && rr.current) setTimeout(() => rr.current.scrollIntoView({ behavior: "smooth" }), 100); }, [step]);

  const saveSets = async () => { if (proxyIn.trim()) try { await window.storage.set("proxy_url", proxyIn.trim()); setProxyUrl(proxyIn.trim()); } catch {} if (apiKeyIn.trim()) try { await window.storage.set("bu_key", apiKeyIn.trim()); setApiKey(apiKeyIn.trim()); } catch {} setShowSet(false); };

  const handleLookup = async () => {
    const reg = regNr.trim().replace(/\s/g, "").toUpperCase(), vin = vinIn.trim().toUpperCase();
    if (!reg && !vin) return; setError(null); setStep("lookup");
    if (proxyUrl && reg) { setMsg("Söker fordonsdata…"); try { const v = await lookupProxy(reg, proxyUrl); if (v?.make) { setVehicle({ ...v, regno: reg }); setStep("ready"); return; } } catch {} }
    if (apiKey && reg) { setMsg("Hämtar från Biluppgifter.se…"); try { const v = await lookupBiluppgifter(reg, apiKey); if (v?.make) { setVehicle(v); setStep("ready"); return; } } catch {} }
    if (vin && vin.length >= 11) { setMsg("Avkodar VIN via NHTSA…"); try { const v = await decodeVIN(vin); if (v?.make) { setVehicle({ ...v, regno: reg }); setStep("ready"); return; } } catch {} }
    setVehicle({ regno: reg, vin, make: "", model: "", year: "", engine: "", fuel: "" }); setStep("manual");
  };
  const handleManual = () => { if (!mm.make.trim()) return; setVehicle(p => ({ ...p, ...mm })); setStep("ready"); };
  const handleDiag = async () => { if (!faultCodes.trim()) return; setStep("diagnosing"); setError(null); try { const d = await runDiagnosis(vehicle, faultCodes.trim()); setDiag(d); setStep("result"); } catch { setError("Diagnos misslyckades."); setStep("ready"); } };
  const reset = () => { setStep("input"); setRegNr(""); setVinIn(""); setVehicle(null); setMm({ make: "", model: "", year: "", engine: "" }); setFaultCodes(""); setDiag(null); setError(null); };

  const sv = diag ? (SEV[diag.severity] || SEV.medium) : SEV.medium;
  const tP = diag ? diag.parts.reduce((s, p) => s + (p.price || 0), 0) : 0;
  const tL = diag ? (diag.laborHours || 0) * (diag.laborRate || 700) : 0;
  const tT = tP + tL;
  const hasLookup = !!proxyUrl || !!apiKey;

  return (
    <div style={S.wrap}><style>{CSS}</style>

      {/* HEADER */}
      <header style={S.hdr} className="no-print"><div style={S.hdrIn}>
        <div style={S.logo} onClick={reset}><svg width="28" height="28" viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="#0057FF"/><path d="M8 10H16L18 14H10L8 10Z" fill="#fff"/><path d="M10 16H20L22 20H12L10 16Z" fill="#fff" opacity=".6"/></svg>
          <div><div style={S.logoN}>Zoheir</div><div style={S.logoB}>BILVERKSTAD</div></div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {step !== "input" && <button onClick={reset} style={S.ghost}>← Ny sökning</button>}
          <button onClick={() => setShowSet(!showSet)} style={{ ...S.ghost, fontSize: 16 }}>⚙</button>
        </div>
      </div></header>

      {/* SETTINGS */}
      {showSet && <div style={S.mBg} onClick={() => setShowSet(false)}><div style={S.mod} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Inställningar</h3>
        <div style={S.field}><label style={S.label}>FORDONSUPPSLAGNING (SUPABASE PROXY)</label>
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>URL till Edge Function för gratis reg.nr-sökning.</p>
          <input style={S.inp} placeholder="https://xxx.supabase.co/functions/v1/vehicle-lookup" value={proxyIn} onChange={e => setProxyIn(e.target.value)} />
          {proxyUrl && <p style={{ fontSize: 11, color: "#16A34A", marginTop: 4 }}>✓ Aktiv</p>}</div>
        <div style={S.field}><label style={S.label}>BILUPPGIFTER.SE API-NYCKEL (ALTERNATIV)</label>
          <input style={S.inp} type="password" placeholder="API-nyckel…" value={apiKeyIn} onChange={e => setApiKeyIn(e.target.value)} />
          {apiKey && <p style={{ fontSize: 11, color: "#16A34A", marginTop: 4 }}>✓ Aktiv</p>}</div>
        <button onClick={saveSets} style={{ ...S.btn, fontSize: 13, padding: "10px", minHeight: 38 }}>Spara inställningar</button>
      </div></div>}

      <main style={S.main}>

        {/* INPUT */}
        {step === "input" && <div className="fadeUp" style={S.col}>
          <div style={{ textAlign: "center", marginBottom: 8 }}><h1 style={S.h1}>Vad behöver <span style={{ color: "#0057FF" }}>lagas</span>?</h1>
            <p style={S.sub}>{hasLookup ? "Ange registreringsnummer — data hämtas automatiskt." : "Ange VIN för gratis uppslagning, eller koppla reg.nr-sökning i ⚙."}</p></div>
          <div style={S.card}>
            <div style={S.field}><label style={S.label}>REGISTRERINGSNUMMER</label>
              <div style={S.plateW}><div style={S.plateB}><span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>S</span></div>
                <input style={S.plateI} placeholder="ABC 123" value={regNr} onChange={e => setRegNr(e.target.value.toUpperCase())} maxLength={7} onKeyDown={e => e.key === "Enter" && handleLookup()} autoFocus /></div>
              {hasLookup && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }}/><span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>{proxyUrl ? "Fordonsuppslagning aktiv" : "Biluppgifter.se kopplad"}</span></div>}
            </div>
            <div style={S.field}><label style={S.label}>VIN / CHASSINUMMER <span style={{ fontWeight: 400, color: "#B0B5BF" }}>— gratis via NHTSA</span></label>
              <input style={S.inp} placeholder="YV1CZ59H451103789" value={vinIn} onChange={e => setVinIn(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && handleLookup()} /></div>
            {error && <p style={S.err}>{error}</p>}
            <button onClick={handleLookup} disabled={!regNr.trim() && !vinIn.trim()} style={S.btn}>Sök fordon</button>
            {!hasLookup && <button onClick={() => setShowSet(true)} style={S.link}>⚙ Koppla reg.nr-sökning</button>}
          </div>
        </div>}

        {step === "lookup" && <div style={S.col}><div style={{ ...S.card, padding: "48px 28px", textAlign: "center", alignItems: "center" }}><Spin /><p style={{ fontSize: 16, fontWeight: 700 }}>{msg}</p></div></div>}

        {step === "manual" && <div className="fadeUp" style={S.col}><div style={S.card}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Fordonsuppgifter</h2>
          <div style={S.g2}>{[["MÄRKE *","Volvo","make"],["MODELL","XC60","model"],["ÅRSMODELL","2022","year"],["MOTOR","2.0 D4","engine"]].map(([l,p,k])=>
            <div key={k} style={S.field}><label style={S.label}>{l}</label><input style={S.inp} placeholder={p} value={mm[k]} onChange={e=>setMm(v=>({...v,[k]:e.target.value}))} autoFocus={k==="make"} onKeyDown={e=>e.key==="Enter"&&k==="engine"&&handleManual()}/></div>)}</div>
          <button onClick={handleManual} disabled={!mm.make.trim()} style={S.btn}>Fortsätt</button>
        </div></div>}

        {(step==="ready"||step==="diagnosing")&&vehicle&&<div className="fadeUp" style={S.col}><div style={S.card}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {vehicle.regno&&<div style={S.mPlate}><div style={S.mBlu}><span style={{color:"#fff",fontSize:8,fontWeight:700}}>S</span></div><span style={S.mTxt}>{vehicle.regno}</span></div>}
            <div style={{flex:1}}><div style={{fontSize:20,fontWeight:700}}>{vehicle.make} {vehicle.model}</div><div style={{fontSize:13,color:"#6B7280"}}>{vehicle.year}{vehicle.color?` · ${vehicle.color}`:""}</div></div>
            <div style={{background:"#F0FDF4",color:"#16A34A",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>✓ Hittad</div>
          </div>
          <div style={{background:"#F9FAFB",borderRadius:8,padding:"4px 14px"}}><IR l="VIN" v={vehicle.vin}/><IR l="Motor" v={vehicle.engine}/><IR l="Bränsle" v={vehicle.fuel}/><IR l="Effekt" v={vehicle.power}/><IR l="Kaross" v={vehicle.body}/></div>
          <div style={S.field}><label style={S.label}>FELKOD(ER)</label><input ref={fr} style={S.inp} placeholder="P0171, P0300…" value={faultCodes} onChange={e=>setFaultCodes(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleDiag()}/></div>
          {error&&<p style={S.err}>{error}</p>}
          <button onClick={handleDiag} disabled={!faultCodes.trim()||step==="diagnosing"} style={S.btn}>{step==="diagnosing"?<Spin sz={18} c="#fff"/>:"Diagnostisera"}</button>
        </div></div>}

        {/* ═══ RESULT ═══ */}
        {step==="result"&&diag&&vehicle&&<div ref={rr} className="fadeUp" style={S.col}>

          {/* Severity */}
          <div style={{...S.card,background:sv.bg,borderColor:sv.c+"33"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:sv.c}}/>
                  <span style={{fontSize:11,fontWeight:700,color:sv.c,letterSpacing:".1em"}}>{sv.l} SVÅRIGHETSGRAD</span>
                  <span style={{fontSize:11,color:"#6B7280"}}>· {diag.systemAffected}</span>
                </div>
                <h2 style={{fontSize:22,fontWeight:700,color:"#111827",marginBottom:10}}>{diag.title}</h2>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {diag.faultCodes.map((f,i)=><span key={i} style={{fontSize:12,fontWeight:700,color:"#DC2626",background:"#FEF2F2",padding:"2px 10px",borderRadius:4,border:"1px solid #FECACA",fontFamily:"'Space Mono',monospace"}}>{f.code}</span>)}</div>
                <p style={{fontSize:14,color:"#374151",lineHeight:1.6}}>{diag.description}</p>
              </div>
              <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"14px 20px",textAlign:"center",minWidth:140,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:11,color:"#6B7280",fontWeight:600}}>TOTAL UPPSKATTNING</div>
                <div style={{fontSize:28,fontWeight:700,color:"#DC2626",fontFamily:"'Space Mono',monospace"}}>{tT.toLocaleString()}</div>
                <div style={{fontSize:11,color:"#9CA3AF"}}>SEK · Delar + Arbete</div>
              </div>
            </div>
          </div>

          {/* Causes */}
          <div><h3 style={S.secT}>TROLIGA ORSAKER</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {diag.probableCauses.map((c,i)=><span key={i} style={{fontSize:13,fontWeight:600,padding:"6px 14px",borderRadius:6,background:i===0?"#FEF2F2":"#F3F4F6",color:i===0?"#DC2626":"#374151",border:`1px solid ${i===0?"#FECACA":"#E5E7EB"}`}}>{c}</span>)}</div></div>

          {/* Parts */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={S.secT}>RESERVDELAR</h3><a href="https://www.biltema.se/bil---mc/" target="_blank" rel="noopener" style={{fontSize:12,color:"#0057FF",fontWeight:600,textDecoration:"none"}}>Öppna Biltema →</a></div>
            <div style={{...S.card,gap:0,padding:0}}>
              {diag.parts.map((p,i)=><div key={i} style={{padding:"14px 20px",borderBottom:i<diag.parts.length-1?"1px solid #F3F4F6":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{p.name}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{p.partNumber}</div><a href={bt(p.name,vehicle)} target="_blank" rel="noopener" style={{fontSize:11,color:"#0057FF",textDecoration:"none"}}>Sök på Biltema →</a></div>
                <div><span style={{fontSize:16,fontWeight:700,color:"#DC2626",fontFamily:"'Space Mono',monospace"}}>{p.price}</span><span style={{fontSize:12,color:"#9CA3AF"}}> SEK</span></div>
              </div>)}
              <div style={{padding:"12px 20px",background:"#F9FAFB",borderTop:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:13,color:"#DC2626",fontFamily:"'Space Mono',monospace"}}>Arbete ({diag.laborHours}h × {diag.laborRate||700} SEK/h)</span>
                <span style={{fontSize:16,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>{tL.toLocaleString()} SEK</span>
              </div>
            </div>
          </div>

          {/* System Diagram */}
          <div><h3 style={S.secT}>SYSTEMDIAGRAM</h3><div style={{...S.card,padding:20,background:"#F9FAFB"}}>
            <div style={{textAlign:"center",fontSize:11,color:"#6B7280",letterSpacing:".08em",marginBottom:12,fontFamily:"'Space Mono',monospace"}}>{vehicle.year} {vehicle.make} {vehicle.model}</div>
            <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 20px"}}><div style={{fontSize:13,fontWeight:700,color:"#DC2626"}}>⚙ {diag.systemAffected}</div></div></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:10,fontWeight:700,color:"#EA580C",letterSpacing:".1em",marginBottom:6}}>ORSAKER</div>
                {diag.probableCauses.map((c,i)=><div key={i} style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:6,padding:"6px 10px",marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:"#C2410C"}}>● {c}</div></div>)}</div>
              <div><div style={{fontSize:10,fontWeight:700,color:"#16A34A",letterSpacing:".1em",marginBottom:6}}>DELAR</div>
                {diag.parts.map((p,i)=><div key={i} style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:6,padding:"6px 10px",marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:"#15803D"}}>{p.name}</div><div style={{fontSize:10,color:"#6B7280"}}>{p.price} SEK</div></div>)}</div>
            </div>
            <div style={{display:"flex",justifyContent:"center",marginTop:14,gap:8,flexWrap:"wrap"}}>
              <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,color:"#1D4ED8"}}>ECM / Styrmodul</div>
              {diag.faultCodes.map((f,i)=><div key={i} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:4,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#DC2626",fontFamily:"'Space Mono',monospace"}}>{f.code}</div>)}
            </div>
          </div></div>

          {/* Steps */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={S.secT}>STEG-FÖR-STEG REPARATIONSGUIDE</h3>
              <a href={yt(`${diag.youtubeSearch||diag.title} ${vehicle.make} ${vehicle.model}`)} target="_blank" rel="noopener" style={{fontSize:12,fontWeight:700,color:"#DC2626",border:"1px solid #FECACA",borderRadius:6,padding:"4px 12px",textDecoration:"none",background:"#FEF2F2"}}>Sök YouTube</a></div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {diag.steps.map((s,i)=>{const col=SC[s.type]||"#6B7280";const q=`${s.title} ${vehicle.make} ${vehicle.model} ${vehicle.year}`;return(
                <div key={i} style={{...S.card,padding:"16px 20px",borderLeft:`3px solid ${col}`}}>
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{width:40,height:40,borderRadius:8,background:col+"12",border:`1.5px solid ${col}40`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:10,fontWeight:700,color:col}}>{SL[s.type]||"?"}</span>
                      <span style={{fontSize:14,fontWeight:700,color:col}}>{String(i+1).padStart(2,"0")}</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:15,fontWeight:700,color:"#111827"}}>{s.title}</span><span style={{fontSize:12,color:"#9CA3AF",fontFamily:"'Space Mono',monospace"}}>{s.minutes} min</span></div>
                      <p style={{fontSize:13,color:"#6B7280",lineHeight:1.5,marginBottom:8}}>{s.description}</p>
                      <div style={{display:"flex",gap:6}}>
                        <a href={yt(q)} target="_blank" rel="noopener" style={S.sBtn}>▶ YouTube</a>
                        <a href={gg(q)} target="_blank" rel="noopener" style={S.sBtn}>🔍 Google</a>
                        <a href={bt(s.title,vehicle)} target="_blank" rel="noopener" style={S.sBtn}>🛒 Biltema</a>
                      </div>
                    </div>
                  </div>
                </div>);})}
            </div>
          </div>

          {/* Safety + Sweden */}
          <div style={S.g2}>
            <div style={{...S.card,background:"#FEF2F2",borderColor:"#FECACA"}}><h4 style={{fontSize:13,fontWeight:700,color:"#DC2626"}}>⚠ SÄKERHETSVARNINGAR</h4>
              {diag.safetyWarnings.map((w,i)=><p key={i} style={{fontSize:13,color:"#7F1D1D",lineHeight:1.5}}>• {w}</p>)}</div>
            <div style={{...S.card,background:"#EFF6FF",borderColor:"#BFDBFE"}}><h4 style={{fontSize:13,fontWeight:700,color:"#1D4ED8"}}>❄ SVENSKA VERKSTADSTIPS</h4>
              {diag.swedenTips.map((t,i)=><p key={i} style={{fontSize:13,color:"#1E3A5F",lineHeight:1.5}}>• {t}</p>)}</div>
          </div>

          {/* Actions */}
          <div className="no-print" style={{display:"flex",justifyContent:"center",gap:12}}>
            <button onClick={reset} style={{...S.btn,background:"#fff",color:"#374151",border:"1px solid #D1D5DB"}}>Ny diagnos</button>
            <button onClick={()=>window.print()} style={{...S.btn,background:"#DC2626"}}>Exportera PDF</button>
          </div>
        </div>}
      </main>

      <footer style={S.ftr} className="no-print"><span>© 2026 Zoheir Bilverkstad</span><span style={{color:"#0057FF"}}>AI-diagnostik</span></footer>
    </div>
  );
}

/* ═══ STYLES ═════════════════════════════════════════════ */
const S={wrap:{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:"#F8F9FC",color:"#111827",display:"flex",flexDirection:"column"},hdr:{background:"#fff",borderBottom:"1px solid #E5E7EB",position:"sticky",top:0,zIndex:50},hdrIn:{maxWidth:680,margin:"0 auto",padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"},logo:{display:"flex",alignItems:"center",gap:10,cursor:"pointer"},logoN:{fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:17,lineHeight:1.1},logoB:{fontSize:8.5,fontWeight:600,letterSpacing:".2em",color:"#0057FF"},ghost:{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,background:"none",border:"none",color:"#6B7280",cursor:"pointer"},main:{flex:1,padding:"0 20px"},col:{maxWidth:640,margin:"0 auto",display:"flex",flexDirection:"column",gap:24,paddingTop:36,paddingBottom:48},h1:{fontSize:36,fontWeight:700,letterSpacing:"-.03em",lineHeight:1.15,marginBottom:8},sub:{fontSize:15,color:"#6B7280"},card:{background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,padding:24,display:"flex",flexDirection:"column",gap:16,boxShadow:"0 1px 3px rgba(0,0,0,.04)"},field:{display:"flex",flexDirection:"column",gap:6},label:{fontSize:10.5,fontWeight:700,letterSpacing:".1em",color:"#9CA3AF"},plateW:{display:"flex",borderRadius:8,overflow:"hidden",border:"1.5px solid #D1D5DB"},plateB:{width:32,background:"#0057FF",display:"flex",alignItems:"center",justifyContent:"center"},plateI:{fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,padding:"12px 16px",border:"none",outline:"none",flex:1,letterSpacing:".08em",textTransform:"uppercase",background:"#fff",color:"#111827"},inp:{fontFamily:"'DM Sans',sans-serif",fontSize:14,padding:"11px 14px",border:"1.5px solid #D1D5DB",borderRadius:8,background:"#fff",color:"#111827"},btn:{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,padding:"12px 28px",border:"none",borderRadius:8,background:"#0057FF",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",minHeight:46,transition:"all .15s"},link:{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:500,background:"none",border:"none",color:"#0057FF",cursor:"pointer",padding:"4px 0",textAlign:"center"},err:{fontSize:13,color:"#DC2626",fontWeight:500},g2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},mPlate:{display:"flex",alignItems:"stretch",borderRadius:5,overflow:"hidden",border:"1.5px solid #D1D5DB",flexShrink:0},mBlu:{width:18,background:"#0057FF",display:"flex",alignItems:"center",justifyContent:"center"},mTxt:{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"4px 8px",letterSpacing:".05em"},secT:{fontSize:11,fontWeight:700,letterSpacing:".12em",color:"#9CA3AF",marginBottom:8},sBtn:{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,background:"#F3F4F6",color:"#6B7280",textDecoration:"none",border:"1px solid #E5E7EB"},mBg:{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:100,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80},mod:{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:28,width:"100%",maxWidth:440,display:"flex",flexDirection:"column",gap:16,boxShadow:"0 8px 32px rgba(0,0,0,.1)"},ftr:{borderTop:"1px solid #E5E7EB",padding:"14px 20px",display:"flex",justifyContent:"space-between",fontSize:11,color:"#9CA3AF",maxWidth:680,margin:"0 auto",width:"100%"}};

const CSS=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{background:#F8F9FC}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fadeUp{animation:fadeUp .4s ease-out}input::placeholder{color:#B0B5BF}input:focus{outline:none;border-color:#0057FF;box-shadow:0 0 0 3px rgba(0,87,255,.1)}
button:hover:not(:disabled){filter:brightness(.96);transform:translateY(-1px)}button:active:not(:disabled){transform:translateY(0)}button:disabled{opacity:.4;cursor:not-allowed}a:hover{opacity:.85}
@media print{.no-print{display:none!important}}`;
