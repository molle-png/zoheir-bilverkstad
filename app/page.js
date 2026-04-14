"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/* ═══ CONFIG ═══════════════════════════════════════════════ */
const PROXY_URL = "https://ljnjvredrmqyeobylgzb.supabase.co/functions/v1/vehicle-lookup";
const LABOR_RATE = 700;

/* ═══ STORAGE ══════════════════════════════════════════════ */
const store = {
  get(key) { try { return localStorage.getItem(key); } catch {} return null; },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} },
};

/* ═══ VEHICLE LOOKUPS ══════════════════════════════════════ */
function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

async function lookupProxy(regNr) {
  const r = await fetch(`${PROXY_URL}?regNr=${encodeURIComponent(regNr)}`);
  if (!r.ok) throw new Error(`Server: ${r.status}`);
  const j = await r.json();
  if (j.error || !j.make) throw new Error(j.error || "Fordonet hittades inte");
  j.make = titleCase(j.make);
  return j;
}

async function lookupBiluppgifter(regNr, key) {
  const r = await fetch(`https://api.biluppgifter.se/api/v1/vehicle/regno/${regNr}?include=basic,tech`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`API: ${r.status}`);
  const j = await r.json();
  const d = Array.isArray(j?.data) ? j.data[0] : j?.data;
  if (!d) throw new Error("Tomt svar");
  const b = d.basic?.data || {}, t = d.tech?.data || {};
  return {
    regno: d.attributes?.regno || regNr, vin: d.attributes?.vin || "",
    make: b.make || "", model: b.model || "",
    year: String(b.model_year || b.vehicle_year || ""),
    color: b.color || "", engine: t.engine_description || "",
    fuel: t.fuel || "", power: t.power ? `${t.power} hk` : "",
  };
}

async function decodeVIN(vin) {
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
  if (!r.ok) throw new Error("NHTSA svarade ej");
  const v = (await r.json()).Results?.[0];
  if (!v?.Make) throw new Error("VIN kunde ej avkodas");
  const hp = v.EngineHP || "";
  const engParts = [v.DisplacementL ? `${v.DisplacementL}L` : "", v.EngineCylinders ? `${v.EngineCylinders}-cyl` : "", hp ? `${hp}hk` : ""].filter(Boolean).join(" ");
  return {
    vin, regno: "", make: titleCase(v.Make), model: v.Model || "",
    year: v.ModelYear || "", engine: v.EngineModel ? `${v.EngineModel} ${engParts}` : engParts,
    fuel: v.FuelTypePrimary || "", power: hp ? `${hp} hk` : "",
    body: v.BodyClass || "", country: v.PlantCountry || "",
  };
}

/* ═══ DIAGNOSIS ════════════════════════════════════════════ */
async function runDiagnosis(vehicle, faultCodes) {
  const r = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle, faultCodes }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Serverfel: ${r.status}`);
  }
  return await r.json();
}

/* ═══ UI HELPERS ═══════════════════════════════════════════ */
const SEV = { low: { c: "#16A34A", bg: "#F0FDF4", l: "LÅG" }, medium: { c: "#CA8A04", bg: "#FEFCE8", l: "MEDEL" }, high: { c: "#EA580C", bg: "#FFF7ED", l: "HÖG" }, critical: { c: "#DC2626", bg: "#FEF2F2", l: "KRITISK" } };
const STEP_C = { inspection: "#EF4444", test: "#F59E0B", repair: "#16A34A", replace: "#2563EB" };
const STEP_L = { inspection: "I", test: "T", repair: "R", replace: "B" };

function biltemaUrl(q, v) { return `https://www.biltema.se/sok?query=${encodeURIComponent((q || "") + " " + (v?.make || "") + " " + (v?.model || ""))}`; }
function youtubeUrl(q) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(q || "")}`; }
function googleUrl(q) { return `https://www.google.com/search?q=${encodeURIComponent(q || "")}`; }

function Spinner({ size = 28, color = "#0057FF" }) {
  return <div style={{ width: size, height: size, border: "3px solid rgba(0,0,0,.08)", borderTopColor: color, borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F3F4F6", gap: 12 }}>
      <span style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", wordBreak: "break-all", textAlign: "right" }}>{value}</span>
    </div>
  );
}

/* ═══ MAIN APP ═════════════════════════════════════════════ */
export default function ZoheirBilverkstad() {
  const [step, setStep] = useState("input");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyIn, setApiKeyIn] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [regNr, setRegNr] = useState("");
  const [vinIn, setVinIn] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [manual, setManual] = useState({ make: "", model: "", year: "", engine: "" });
  const [faultCodes, setFaultCodes] = useState("");
  const [diag, setDiag] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  const faultInputRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    const key = store.get("biluppgifter_key");
    if (key) { setApiKey(key); setApiKeyIn(key); }
  }, []);

  useEffect(() => {
    if (step === "ready") setTimeout(() => faultInputRef.current?.focus(), 150);
    if (step === "result" && resultRef.current) setTimeout(() => resultRef.current.scrollIntoView({ behavior: "smooth" }), 150);
  }, [step]);

  const saveSettings = () => {
    const key = apiKeyIn.trim();
    if (key) { store.set("biluppgifter_key", key); setApiKey(key); }
    else { store.del("biluppgifter_key"); setApiKey(""); }
    setShowSettings(false);
  };

  const handleLookup = useCallback(async () => {
    const reg = regNr.trim().replace(/\s/g, "").toUpperCase();
    const vin = vinIn.trim().toUpperCase();
    if (!reg && !vin) return;
    setError(null); setStep("lookup");
    let lastError = "";

    if (reg) {
      setStatusMsg("Söker fordonsdata…");
      try { const v = await lookupProxy(reg); if (v?.make) { setVehicle({ ...v, regno: reg }); setStep("ready"); return; } }
      catch (e) { lastError = e.message; console.warn("Proxy:", e.message); }
    }
    if (apiKey && reg) {
      setStatusMsg("Hämtar från Biluppgifter.se…");
      try { const v = await lookupBiluppgifter(reg, apiKey); if (v?.make) { setVehicle(v); setStep("ready"); return; } }
      catch (e) { lastError = e.message; console.warn("Biluppgifter:", e.message); }
    }
    if (vin && vin.length >= 11) {
      setStatusMsg("Avkodar VIN via NHTSA…");
      try { const v = await decodeVIN(vin); if (v?.make) { setVehicle({ ...v, regno: reg }); setStep("ready"); return; } }
      catch (e) { lastError = e.message; console.warn("NHTSA:", e.message); }
    }

    setVehicle({ regno: reg, vin, make: "", model: "", year: "", engine: "", fuel: "" });
    setError(lastError ? `Automatisk sökning misslyckades (${lastError}). Fyll i manuellt.` : null);
    setStep("manual");
  }, [regNr, vinIn, apiKey]);

  const handleManual = () => { if (!manual.make.trim()) return; setVehicle(p => ({ ...p, ...manual })); setError(null); setStep("ready"); };

  const handleDiagnose = async () => {
    if (!faultCodes.trim()) return;
    setStep("diagnosing"); setError(null);
    try {
      const result = await runDiagnosis(vehicle, faultCodes.trim());
      setDiag(result); setStep("result");
    } catch (e) {
      console.error("Diagnosis error:", e);
      setError(`Diagnos misslyckades: ${e.message || "Okänt fel"}. Försök igen.`);
      setStep("ready");
    }
  };

  const reset = () => {
    setStep("input"); setRegNr(""); setVinIn(""); setVehicle(null);
    setManual({ make: "", model: "", year: "", engine: "" });
    setFaultCodes(""); setDiag(null); setError(null); setStatusMsg("");
  };

  const sev = diag ? (SEV[diag.severity] || SEV.medium) : SEV.medium;
  const totalParts = diag ? diag.parts.reduce((sum, p) => sum + (Number(p.price) || 0), 0) : 0;
  const totalLabor = diag ? diag.laborHours * (diag.laborRate || LABOR_RATE) : 0;
  const totalEstimate = totalParts + totalLabor;

  return (
    <div style={S.page}>

      {/* HEADER */}
      <header style={S.header} className="no-print">
        <div style={S.headerInner}>
          <div style={S.logo} onClick={reset}>
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="#0057FF"/><path d="M8 10H16L18 14H10L8 10Z" fill="#fff"/><path d="M10 16H20L22 20H12L10 16Z" fill="#fff" opacity=".6"/></svg>
            <div><div style={S.logoTitle}>Zoheir</div><div style={S.logoBrand}>BILVERKSTAD</div></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {step !== "input" && step !== "lookup" && <button onClick={reset} style={S.ghostBtn}>← Ny sökning</button>}
            <button onClick={() => setShowSettings(true)} style={{ ...S.ghostBtn, fontSize: 16 }} aria-label="Inställningar">⚙</button>
          </div>
        </div>
      </header>

      {/* SETTINGS */}
      {showSettings && (
        <div style={S.backdrop} onClick={() => setShowSettings(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Inställningar</h3>
              <button onClick={() => setShowSettings(false)} style={{ ...S.ghostBtn, fontSize: 20 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
              Fordonsuppslagning via registreringsnummer är automatiskt konfigurerad.
              Biluppgifter.se API-nyckel är valfri.
            </p>
            <div style={S.field}>
              <label style={S.label}>BILUPPGIFTER.SE API-NYCKEL (VALFRITT)</label>
              <input style={S.input} type="password" placeholder="API-nyckel…" value={apiKeyIn} onChange={e => setApiKeyIn(e.target.value)} onKeyDown={e => e.key === "Enter" && saveSettings()} />
              {apiKey && <p style={{ fontSize: 11, color: "#16A34A", marginTop: 4 }}>✓ Aktiv</p>}
            </div>
            <button onClick={saveSettings} style={{ ...S.btn, fontSize: 13, minHeight: 40 }}>Spara</button>
          </div>
        </div>
      )}

      <main style={S.main}>

        {/* INPUT */}
        {step === "input" && (
          <div className="fadeUp" style={S.container}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <h1 className="hero-title" style={S.title}>Vad behöver <span style={{ color: "#0057FF" }}>lagas</span>?</h1>
              <p style={S.subtitle}>Ange registreringsnummer eller VIN — vi hämtar fordonsinfo automatiskt.</p>
            </div>
            <div style={S.card}>
              <div style={S.field}>
                <label style={S.label}>REGISTRERINGSNUMMER</label>
                <div style={S.plateWrap}>
                  <div style={S.plateBadge}><span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>S</span></div>
                  <input style={S.plateInput} placeholder="ABC 123" value={regNr} onChange={e => setRegNr(e.target.value.toUpperCase())} maxLength={7} onKeyDown={e => e.key === "Enter" && handleLookup()} autoFocus />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>VIN / CHASSINUMMER <span style={{ fontWeight: 400, color: "#B0B5BF" }}>— gratis via NHTSA</span></label>
                <input style={S.input} placeholder="YV1CZ59H451103789" value={vinIn} onChange={e => setVinIn(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && handleLookup()} />
              </div>
              {error && <p style={S.errorText}>{error}</p>}
              <button onClick={handleLookup} disabled={!regNr.trim() && !vinIn.trim()} style={S.btn}>Sök fordon</button>
            </div>
          </div>
        )}

        {/* LOADING */}
        {step === "lookup" && (
          <div style={S.container}>
            <div style={{ ...S.card, padding: "48px 24px", textAlign: "center", alignItems: "center", gap: 16 }}>
              <Spinner /><p style={{ fontSize: 16, fontWeight: 700 }}>{statusMsg || "Söker…"}</p>
            </div>
          </div>
        )}

        {/* MANUAL */}
        {step === "manual" && (
          <div className="fadeUp" style={S.container}><div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Fordonsuppgifter</h2>
              <button onClick={() => { setError(null); setStep("input"); }} style={S.ghostBtn}>← Tillbaka</button>
            </div>
            {vehicle?.regno && <p style={{ fontSize: 13, color: "#6B7280" }}>Reg.nr: <strong>{vehicle.regno}</strong></p>}
            {error && <p style={{ fontSize: 13, color: "#DC2626", background: "#FEF2F2", padding: "10px 14px", borderRadius: 8, border: "1px solid #FECACA" }}>{error}</p>}
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["MÄRKE *", "Volvo", "make"], ["MODELL", "XC60", "model"], ["ÅRSMODELL", "2022", "year"], ["MOTOR", "2.0 D4", "engine"]].map(([label, ph, key]) => (
                <div key={key} style={S.field}><label style={S.label}>{label}</label>
                  <input style={S.input} placeholder={ph} value={manual[key]} onChange={e => setManual(p => ({ ...p, [key]: e.target.value }))} autoFocus={key === "make"} onKeyDown={e => e.key === "Enter" && key === "engine" && handleManual()} />
                </div>
              ))}
            </div>
            <button onClick={handleManual} disabled={!manual.make.trim()} style={S.btn}>Fortsätt till diagnostik</button>
          </div></div>
        )}

        {/* READY / DIAGNOSING */}
        {(step === "ready" || step === "diagnosing") && vehicle && (
          <div className="fadeUp" style={S.container}><div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {vehicle.regno && <div style={S.miniPlate}><div style={S.miniPlateBlue}><span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>S</span></div><span style={S.miniPlateText}>{vehicle.regno}</span></div>}
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{vehicle.make} {vehicle.model}</div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>{vehicle.year}{vehicle.color ? ` · ${vehicle.color}` : ""}</div>
              </div>
              <span style={{ background: "#F0FDF4", color: "#16A34A", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>✓ Redo</span>
            </div>
            <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "4px 14px" }}>
              <DetailRow label="VIN" value={vehicle.vin} /><DetailRow label="Motor" value={vehicle.engine} /><DetailRow label="Bränsle" value={vehicle.fuel} /><DetailRow label="Effekt" value={vehicle.power} /><DetailRow label="Kaross" value={vehicle.body} />
            </div>
            <div style={S.field}><label style={S.label}>FELKOD(ER)</label>
              <input ref={faultInputRef} style={S.input} placeholder="P0171, P0300, C1234…" value={faultCodes} onChange={e => setFaultCodes(e.target.value)} onKeyDown={e => e.key === "Enter" && handleDiagnose()} />
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>Separera flera koder med komma</p>
            </div>
            {error && <p style={S.errorText}>{error}</p>}
            <button onClick={handleDiagnose} disabled={!faultCodes.trim() || step === "diagnosing"} style={{ ...S.btn, ...(step === "diagnosing" ? { opacity: 1 } : {}) }}>
              {step === "diagnosing" ? <><Spinner size={18} color="#fff" /><span style={{ marginLeft: 8 }}>Analyserar felkoder…</span></> : "Diagnostisera"}
            </button>
          </div></div>
        )}

        {/* ═══ RESULT ═══ */}
        {step === "result" && diag && vehicle && (
          <div ref={resultRef} className="fadeUp" style={S.container}>

            {/* Severity */}
            <div style={{ ...S.card, background: sev.bg, borderColor: sev.c + "33" }}>
              <div className="severity-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: sev.c }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: sev.c, letterSpacing: ".1em" }}>{sev.l} SVÅRIGHETSGRAD</span>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>· {diag.systemAffected}</span>
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 10 }}>{diag.title}</h2>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {diag.faultCodes.map((f, i) => <span key={i} style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 10px", borderRadius: 4, border: "1px solid #FECACA", fontFamily: "'Space Mono',monospace" }}>{f.code}</span>)}
                  </div>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{diag.description}</p>
                </div>
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 20px", textAlign: "center", minWidth: 120, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>TOTAL UPPSKATTNING</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono',monospace" }}>{totalEstimate.toLocaleString("sv-SE")}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>SEK · Delar + Arbete</div>
                </div>
              </div>
            </div>

            {/* Causes */}
            <div><h3 style={S.sectionLabel}>TROLIGA ORSAKER</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {diag.probableCauses.map((c, i) => <span key={i} style={{ fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 6, background: i === 0 ? "#FEF2F2" : "#F3F4F6", color: i === 0 ? "#DC2626" : "#374151", border: `1px solid ${i === 0 ? "#FECACA" : "#E5E7EB"}` }}>{c}</span>)}
              </div>
            </div>

            {/* Parts */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h3 style={S.sectionLabel}>RESERVDELAR</h3>
                <a href="https://www.biltema.se/bil---mc/" target="_blank" rel="noopener" style={{ fontSize: 12, color: "#0057FF", fontWeight: 600, textDecoration: "none" }}>Öppna Biltema →</a>
              </div>
              <div style={{ ...S.card, gap: 0, padding: 0 }}>
                {diag.parts.map((p, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderBottom: i < diag.parts.length - 1 ? "1px solid #F3F4F6" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{p.partNumber}</div>
                      <a href={biltemaUrl(p.name, vehicle)} target="_blank" rel="noopener" style={{ fontSize: 11, color: "#0057FF", textDecoration: "none" }}>Sök på Biltema →</a>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono',monospace" }}>{p.price}</span>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}> SEK</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "12px 16px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#DC2626", fontFamily: "'Space Mono',monospace" }}>Arbete ({diag.laborHours}h × {diag.laborRate} SEK/h)</span>
                  <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{totalLabor.toLocaleString("sv-SE")} SEK</span>
                </div>
              </div>
            </div>

            {/* System Diagram */}
            <div><h3 style={S.sectionLabel}>SYSTEMDIAGRAM</h3>
              <div style={{ ...S.card, padding: 16, background: "#F9FAFB" }}>
                <div style={{ textAlign: "center", fontSize: 11, color: "#6B7280", letterSpacing: ".08em", marginBottom: 12, fontFamily: "'Space Mono',monospace" }}>{vehicle.year} {vehicle.make} {vehicle.model}</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>⚙ {diag.systemAffected}</div>
                  </div>
                </div>
                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontSize: 10, fontWeight: 700, color: "#EA580C", letterSpacing: ".1em", marginBottom: 6 }}>ORSAKER</div>
                    {diag.probableCauses.map((c, i) => <div key={i} style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#C2410C" }}>● {c}</div></div>)}</div>
                  <div><div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", letterSpacing: ".1em", marginBottom: 6 }}>DELAR</div>
                    {diag.parts.map((p, i) => <div key={i} style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>{p.name}</div><div style={{ fontSize: 10, color: "#6B7280" }}>{p.price} SEK</div></div>)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 14, gap: 6, flexWrap: "wrap" }}>
                  <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>ECM / Styrmodul</div>
                  {diag.faultCodes.map((f, i) => <div key={i} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono',monospace" }}>{f.code}</div>)}
                </div>
              </div>
            </div>

            {/* Repair Steps */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h3 style={S.sectionLabel}>STEG-FÖR-STEG REPARATIONSGUIDE</h3>
                <a href={youtubeUrl(`${diag.youtubeSearch || diag.title} ${vehicle.make} ${vehicle.model}`)} target="_blank" rel="noopener" style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", border: "1px solid #FECACA", borderRadius: 6, padding: "4px 12px", textDecoration: "none", background: "#FEF2F2" }}>Sök YouTube</a>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {diag.steps.map((s, i) => {
                  const col = STEP_C[s.type] || "#6B7280";
                  const searchQ = `${s.title} ${vehicle.make} ${vehicle.model} ${vehicle.year}`;
                  return (
                    <div key={i} style={{ ...S.card, padding: "14px 16px", borderLeft: `3px solid ${col}` }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: col + "14", border: `1.5px solid ${col}44`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: col }}>{STEP_L[s.type] || "?"}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{String(i + 1).padStart(2, "0")}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</span>
                            <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "'Space Mono',monospace", flexShrink: 0 }}>{s.minutes} min</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>{s.description}</p>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <a href={youtubeUrl(searchQ)} target="_blank" rel="noopener" style={S.smallBtn}>▶ YouTube</a>
                            <a href={googleUrl(searchQ)} target="_blank" rel="noopener" style={S.smallBtn}>🔍 Google</a>
                            <a href={biltemaUrl(s.title, vehicle)} target="_blank" rel="noopener" style={S.smallBtn}>🛒 Biltema</a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Safety + Sweden Tips */}
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...S.card, background: "#FEF2F2", borderColor: "#FECACA" }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>⚠ SÄKERHETSVARNINGAR</h4>
                {diag.safetyWarnings.map((w, i) => <p key={i} style={{ fontSize: 13, color: "#7F1D1D", lineHeight: 1.5 }}>• {w}</p>)}
              </div>
              <div style={{ ...S.card, background: "#EFF6FF", borderColor: "#BFDBFE" }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>❄ SVENSKA VERKSTADSTIPS</h4>
                {diag.swedenTips.map((t, i) => <p key={i} style={{ fontSize: 13, color: "#1E3A5F", lineHeight: 1.5 }}>• {t}</p>)}
              </div>
            </div>

            {/* Actions */}
            <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <button onClick={reset} style={{ ...S.btn, background: "#fff", color: "#374151", border: "1px solid #D1D5DB", width: "auto" }}>Ny diagnos</button>
              <button onClick={() => window.print()} style={{ ...S.btn, background: "#DC2626", width: "auto" }}>Exportera PDF</button>
            </div>
          </div>
        )}
      </main>

      <footer style={S.footer} className="no-print">
        <span>© 2026 Zoheir Bilverkstad</span>
        <span style={{ color: "#0057FF" }}>AI-diagnostik</span>
      </footer>
    </div>
  );
}

/* ═══ STYLES ═══════════════════════════════════════════════ */
const S = {
  page: { fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: "#F8F9FC", color: "#111827", display: "flex", flexDirection: "column" },
  header: { background: "#fff", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, zIndex: 50 },
  headerInner: { maxWidth: 680, margin: "0 auto", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  logo: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  logoTitle: { fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 17, lineHeight: 1.1 },
  logoBrand: { fontSize: 8.5, fontWeight: 600, letterSpacing: ".2em", color: "#0057FF" },
  ghostBtn: { fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: "4px 0" },
  main: { flex: 1, padding: "0 16px" },
  container: { maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, paddingTop: 32, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.15, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#6B7280" },
  card: { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "#9CA3AF" },
  plateWrap: { display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid #D1D5DB" },
  plateBadge: { width: 32, background: "#0057FF", display: "flex", alignItems: "center", justifyContent: "center" },
  plateInput: { fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700, padding: "12px 14px", border: "none", outline: "none", flex: 1, letterSpacing: ".08em", textTransform: "uppercase", background: "#fff", color: "#111827" },
  input: { fontFamily: "'DM Sans',sans-serif", fontSize: 14, padding: "11px 14px", border: "1.5px solid #D1D5DB", borderRadius: 8, background: "#fff", color: "#111827", width: "100%" },
  btn: { fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, padding: "12px 24px", border: "none", borderRadius: 8, background: "#0057FF", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44, transition: "all .15s", width: "100%" },
  errorText: { fontSize: 13, color: "#DC2626", fontWeight: 500 },
  miniPlate: { display: "flex", alignItems: "stretch", borderRadius: 5, overflow: "hidden", border: "1.5px solid #D1D5DB", flexShrink: 0 },
  miniPlateBlue: { width: 18, background: "#0057FF", display: "flex", alignItems: "center", justifyContent: "center" },
  miniPlateText: { fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, padding: "4px 8px", letterSpacing: ".05em" },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#9CA3AF", marginBottom: 8 },
  smallBtn: { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, background: "#F3F4F6", color: "#6B7280", textDecoration: "none", border: "1px solid #E5E7EB", whiteSpace: "nowrap" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px 16px" },
  modal: { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,.1)" },
  footer: { borderTop: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", maxWidth: 680, margin: "0 auto", width: "100%" },
};
