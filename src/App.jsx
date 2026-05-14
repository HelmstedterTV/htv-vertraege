import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Kategorien ──────────────────────────────────────────────────────────────
const KATEGORIEN = [
  { id: "personal",     label: "Personal",     icon: "👤" },
  { id: "gaststaette",  label: "Gaststätte",   icon: "🍺" },
  { id: "versorger",    label: "Versorger",    icon: "⚡" },
  { id: "versicherer",  label: "Versicherer",  icon: "🛡️" },
  { id: "dienstleister",label: "Dienstleister",icon: "🔧" },
  { id: "sonstige",     label: "Sonstige",     icon: "📁" },
];

// ─── Ampel-Logik ─────────────────────────────────────────────────────────────
function getAmpel(v) {
  if (!v.ende) return "grau";
  const heute = new Date();
  const ende = new Date(v.ende);
  const frist = parseInt(v.kuendigungsfrist) || 0;
  const kuendigungBis = new Date(ende);
  kuendigungBis.setMonth(kuendigungBis.getMonth() - frist);
  const tage = Math.floor((kuendigungBis - heute) / 86400000);
  if (tage < 0) return "rot";
  if (tage <= 30) return "rot";
  if (tage <= 90) return "gelb";
  return "gruen";
}

function getAmpelLabel(ampel) {
  if (ampel === "rot")   return "⚠️ Frist läuft ab";
  if (ampel === "gelb")  return "⏳ Bald fällig";
  if (ampel === "gruen") return "✓ OK";
  return "∞ Unbefristet";
}

function naechsteKuendigung(v) {
  if (!v.ende || !v.kuendigungsfrist) return null;
  const ende = new Date(v.ende);
  const frist = parseInt(v.kuendigungsfrist) || 0;
  const d = new Date(ende);
  d.setMonth(d.getMonth() - frist);
  return d;
}

function formatDatum(str) {
  if (!str) return "–";
  const d = new Date(str);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDatumKurz(d) {
  if (!d) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [vertraege, setVertraege] = useState([]);

  const [view, setView] = useState("dashboard");     // dashboard | liste | detail | form
  const [aktiveKat, setAktiveKat] = useState(null);
  const [aktiversVertrag, setAktiversVertrag] = useState(null);
  const [formModus, setFormModus] = useState("neu"); // neu | bearbeiten
  const [loeschenId, setLoeschenId] = useState(null);

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Firestore live
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "vertraege"), (snap) => {
      setVertraege(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  if (authLoading) return null;
  if (!user) return <LoginView />;

  // ── Navigation ──────────────────────────────────────────────────────────────
  function zeigeKategorie(katId) {
    setAktiveKat(katId);
    setView("liste");
  }
  function zeigeDetail(vertrag) {
    setAktiversVertrag(vertrag);
    setView("detail");
  }
  function zeigeFormNeu(katId) {
    setAktiveKat(katId);
    setAktiversVertrag(null);
    setFormModus("neu");
    setView("form");
  }
  function zeigeFormBearbeiten(vertrag) {
    setAktiversVertrag(vertrag);
    setFormModus("bearbeiten");
    setView("form");
  }
  function zurueckZuListe() {
    setView("liste");
    setAktiversVertrag(null);
  }
  function zurueckZuDashboard() {
    setView("dashboard");
    setAktiveKat(null);
    setAktiversVertrag(null);
  }

  // ── Firestore Aktionen ──────────────────────────────────────────────────────
  async function vertragSpeichern(daten) {
    const payload = { ...daten, geaendertAm: serverTimestamp() };
    if (formModus === "neu") {
      await addDoc(collection(db, "vertraege"), {
        ...payload,
        erstelltAm: serverTimestamp(),
      });
      setView("liste");
    } else {
      await updateDoc(doc(db, "vertraege", aktiversVertrag.id), payload);
      setAktiversVertrag({ ...aktiversVertrag, ...daten });
      setView("detail");
    }
  }

  async function vertragLoeschen(id) {
    await deleteDoc(doc(db, "vertraege", id));
    setLoeschenId(null);
    setView("liste");
    setAktiversVertrag(null);
  }

  // ── Warn-Zusammenfassung für Dashboard ─────────────────────────────────────
  const rote  = vertraege.filter((v) => getAmpel(v) === "rot").length;
  const gelbe = vertraege.filter((v) => getAmpel(v) === "gelb").length;

  const kat = aktiveKat ? KATEGORIEN.find((k) => k.id === aktiveKat) : null;
  const listeVertraege = vertraege.filter((v) => v.kategorie === aktiveKat);

  return (
    <>
      <Topbar
        view={view}
        katLabel={kat ? `${kat.icon} ${kat.label}` : null}
        formModus={formModus}
        onHome={zurueckZuDashboard}
        onZurueck={
          view === "detail" ? zurueckZuListe :
          view === "liste"  ? zurueckZuDashboard :
          view === "form"   ? (formModus === "bearbeiten" ? () => setView("detail") : zurueckZuListe) :
          null
        }
        onAbmelden={() => signOut(auth)}
      />

      {view === "dashboard" && (
        <Dashboard
          vertraege={vertraege}
          rote={rote}
          gelbe={gelbe}
          onKategorie={zeigeKategorie}
        />
      )}

      {view === "liste" && (
        <KategorieListe
          kat={kat}
          vertraege={listeVertraege}
          onVertrag={zeigeDetail}
          onNeu={() => zeigeFormNeu(aktiveKat)}
        />
      )}

      {view === "detail" && aktiversVertrag && (
        <VertragDetail
          vertrag={aktiversVertrag}
          onBearbeiten={() => zeigeFormBearbeiten(aktiversVertrag)}
          onLoeschen={() => setLoeschenId(aktiversVertrag.id)}
        />
      )}

      {view === "form" && (
        <VertragForm
          vertrag={aktiversVertrag}
          modus={formModus}
          defaultKategorie={aktiveKat}
          onSpeichern={vertragSpeichern}
          onAbbrechen={() =>
            formModus === "bearbeiten" ? setView("detail") : zurueckZuListe()
          }
        />
      )}

      {loeschenId && (
        <LoeschenModal
          name={aktiversVertrag?.name || "diesen Vertrag"}
          onBestaetigen={() => vertragLoeschen(loeschenId)}
          onAbbrechen={() => setLoeschenId(null)}
        />
      )}
    </>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginView() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [fehler, setFehler] = useState("");
  const [laden, setLaden] = useState(false);

  async function anmelden(e) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch {
      setFehler("E-Mail oder Passwort falsch.");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">📋</div>
      <h1>HTV Vertragsmanagement</h1>
      <p>Helmstedter Tennis-Verein e.V.</p>
      <form className="login-form" onSubmit={anmelden}>
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Passwort"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
          autoComplete="current-password"
        />
        {fehler && <span className="login-error">{fehler}</span>}
        <button type="submit" className="btn-primary" disabled={laden}>
          {laden ? "Anmelden …" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ view, katLabel, formModus, onHome, onZurueck, onAbmelden }) {
  const titel =
    view === "dashboard"  ? "Vertragsmanagement" :
    view === "liste"      ? (katLabel || "Verträge") :
    view === "detail"     ? "Vertragsdetail" :
    formModus === "neu"   ? "Neuer Vertrag" : "Vertrag bearbeiten";

  return (
    <div className="topbar">
      <div className="topbar-title" onClick={onHome}>
        <span>📋</span> HTV
      </div>
      <div style={{ fontWeight: 600, color: "var(--text-h)", fontSize: 15 }}>
        {titel}
      </div>
      <div className="topbar-actions">
        {onZurueck && (
          <button className="btn-back" onClick={onZurueck}>← Zurück</button>
        )}
        {view === "dashboard" && (
          <button className="btn-ghost" style={{ fontSize: 13, padding: "6px 12px" }} onClick={onAbmelden}>
            Abmelden
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ vertraege, rote, gelbe, onKategorie }) {
  return (
    <div className="dashboard">
      {rote > 0 && (
        <div className="warn-banner">
          🔴 {rote} Vertrag{rote > 1 ? "e" : ""} — Kündigungsfrist läuft ab oder ist verpasst!
        </div>
      )}
      {gelbe > 0 && (
        <div className="warn-banner warn-banner-gelb">
          🟡 {gelbe} Vertrag{gelbe > 1 ? "e" : ""} — Kündigung in weniger als 90 Tagen möglich
        </div>
      )}
      <div className="kat-grid">
        {KATEGORIEN.map((kat) => {
          const katVertraege = vertraege.filter((v) => v.kategorie === kat.id);
          const ampeln = katVertraege.map(getAmpel);
          return (
            <button
              key={kat.id}
              className="kat-kachel"
              onClick={() => onKategorie(kat.id)}
            >
              <div className="kat-kachel-header">
                <span className="kat-icon">{kat.icon}</span>
                {ampeln.length > 0 && (
                  <div className="kat-ampeln">
                    {ampeln.map((a, i) => (
                      <span key={i} className={`ampel-dot ${a}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="kat-label">{kat.label}</div>
              <div className="kat-count">
                {katVertraege.length === 0
                  ? "Keine Verträge"
                  : `${katVertraege.length} Vertrag${katVertraege.length > 1 ? "e" : ""}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kategorie-Liste ──────────────────────────────────────────────────────────
function KategorieListe({ kat, vertraege, onVertrag, onNeu }) {
  return (
    <div className="kat-liste">
      <div className="kat-liste-header">
        <div className="kat-liste-title">
          <span>{kat?.icon}</span> {kat?.label}
        </div>
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={onNeu}>
          + Neu
        </button>
      </div>

      {vertraege.length === 0 ? (
        <div className="leer">
          <div className="leer-icon">📄</div>
          Noch keine Verträge in dieser Kategorie.<br />
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={onNeu}>
            Ersten Vertrag anlegen
          </button>
        </div>
      ) : (
        vertraege.map((v) => (
          <VertragKarte key={v.id} vertrag={v} onClick={() => onVertrag(v)} />
        ))
      )}
    </div>
  );
}

// ─── Vertrags-Karte (Kurzüberblick) ──────────────────────────────────────────
function VertragKarte({ vertrag: v, onClick }) {
  const ampel = getAmpel(v);
  const nk = naechsteKuendigung(v);

  return (
    <div className="vertrag-karte" onClick={onClick}>
      <div className="vertrag-karte-header">
        <div className="vertrag-karte-name">{v.name}</div>
        <span className={`ampel-badge ${ampel}`}>{getAmpelLabel(ampel)}</span>
      </div>

      <div className="vertrag-karte-details">
        <div className="detail-row">
          <span className="detail-label">Partner</span>
          <span className="detail-value">{v.partner || "–"}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Laufzeit</span>
          <span className="detail-value">
            {v.beginn ? formatDatum(v.beginn) : "–"}
            {v.ende ? ` – ${formatDatum(v.ende)}` : v.beginn ? " (unbefristet)" : ""}
          </span>
        </div>
        {nk && (
          <div className="detail-row">
            <span className="detail-label">Nächste Kündigung bis</span>
            <span className="detail-value">{formatDatumKurz(nk)}</span>
          </div>
        )}
        {v.kuendigungsfrist && (
          <div className="detail-row">
            <span className="detail-label">Kündigungsfrist</span>
            <span className="detail-value">{v.kuendigungsfrist} Monate</span>
          </div>
        )}
      </div>

      {v.notizen && (
        <div className="vertrag-karte-notiz">💬 {v.notizen}</div>
      )}
    </div>
  );
}

// ─── Vertrags-Detail ──────────────────────────────────────────────────────────
function VertragDetail({ vertrag: v, onBearbeiten, onLoeschen }) {
  const ampel = getAmpel(v);
  const nk = naechsteKuendigung(v);
  const kat = KATEGORIEN.find((k) => k.id === v.kategorie);
  const dokumente = Array.isArray(v.dokumente) ? v.dokumente : [];

  return (
    <div className="vertrag-detail">
      <div className="detail-header">
        <div className="detail-header-left">
          <div style={{ fontSize: 13, color: "var(--text)" }}>
            {kat?.icon} {kat?.label}
          </div>
          <div className="detail-titel">{v.name}</div>
          <span className={`ampel-badge ${ampel}`}>{getAmpelLabel(ampel)}</span>
        </div>
        <div className="detail-header-actions">
          <button className="btn-ghost" style={{ fontSize: 13, padding: "7px 12px" }} onClick={onBearbeiten}>
            ✏️ Bearbeiten
          </button>
        </div>
      </div>

      {/* Kerndaten */}
      <div className="detail-section">
        <div className="detail-section-title">Vertragsdaten</div>
        <div className="detail-grid">
          <div className="detail-field">
            <label>Vertragspartner</label>
            <span>{v.partner || "–"}</span>
          </div>
          <div className="detail-field">
            <label>Status</label>
            <span>{v.status || "aktiv"}</span>
          </div>
          <div className="detail-field">
            <label>Beginn</label>
            <span>{formatDatum(v.beginn)}</span>
          </div>
          <div className="detail-field">
            <label>Ende / Laufzeitende</label>
            <span>{v.ende ? formatDatum(v.ende) : "unbefristet"}</span>
          </div>
          <div className="detail-field">
            <label>Kündigungsfrist</label>
            <span>{v.kuendigungsfrist ? `${v.kuendigungsfrist} Monate` : "–"}</span>
          </div>
          <div className="detail-field">
            <label>Kündigung bis spätestens</label>
            <span>{nk ? formatDatumKurz(nk) : "–"}</span>
          </div>
          {v.wert && (
            <div className="detail-field">
              <label>Vertragswert / Kosten</label>
              <span>{v.wert}</span>
            </div>
          )}
          {v.ansprechpartner && (
            <div className="detail-field">
              <label>Ansprechpartner HTV</label>
              <span>{v.ansprechpartner}</span>
            </div>
          )}
        </div>
      </div>

      {/* Dokumente */}
      {dokumente.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">📎 Dokumente</div>
          {dokumente.map((dok, i) => (
            <div key={i}>
              {dok.url ? (
                <a className="doc-link" href={dok.url} target="_blank" rel="noreferrer">
                  📄 {dok.name || dok.url}
                </a>
              ) : (
                <div className="doc-link" style={{ cursor: "default", color: "var(--text)" }}>
                  📄 {dok.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notizen */}
      {v.notizen && (
        <div className="detail-section">
          <div className="detail-section-title">Notizen</div>
          <div className="notiz-box">{v.notizen}</div>
        </div>
      )}

      {/* Löschen */}
      <div className="delete-zone">
        <button className="btn-danger" onClick={onLoeschen}>
          🗑️ Vertrag löschen
        </button>
      </div>
    </div>
  );
}

// ─── Vertrags-Formular ────────────────────────────────────────────────────────
function VertragForm({ vertrag, modus, defaultKategorie, onSpeichern, onAbbrechen }) {
  const init = vertrag || {};
  const [name,             setName]            = useState(init.name             || "");
  const [kategorie,        setKategorie]       = useState(init.kategorie        || defaultKategorie || "personal");
  const [partner,          setPartner]         = useState(init.partner          || "");
  const [status,           setStatus]          = useState(init.status           || "aktiv");
  const [beginn,           setBeginn]          = useState(init.beginn           || "");
  const [ende,             setEnde]            = useState(init.ende             || "");
  const [kuendigungsfrist, setKuendigungsfrist]= useState(init.kuendigungsfrist || "");
  const [wert,             setWert]            = useState(init.wert             || "");
  const [ansprechpartner,  setAnsprechpartner] = useState(init.ansprechpartner  || "");
  const [notizen,          setNotizen]         = useState(init.notizen          || "");
  const [dokumente,        setDokumente]       = useState(
    Array.isArray(init.dokumente) && init.dokumente.length > 0
      ? init.dokumente
      : [{ name: "", url: "" }]
  );
  const [laden, setLaden] = useState(false);

  function dokAktualisieren(i, feld, wert) {
    setDokumente((prev) => prev.map((d, idx) => idx === i ? { ...d, [feld]: wert } : d));
  }
  function dokHinzufuegen() {
    setDokumente((prev) => [...prev, { name: "", url: "" }]);
  }
  function dokEntfernen(i) {
    setDokumente((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function absenden(e) {
    e.preventDefault();
    setLaden(true);
    const saubereDoks = dokumente.filter((d) => d.name || d.url);
    await onSpeichern({
      name, kategorie, partner, status,
      beginn, ende, kuendigungsfrist, wert,
      ansprechpartner, notizen,
      dokumente: saubereDoks,
    });
    setLaden(false);
  }

  return (
    <form className="form-wrap" onSubmit={absenden}>
      {/* Stammdaten */}
      <div className="form-section">
        <div className="form-section-title">Stammdaten</div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Vertragsbezeichnung *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="z.B. Pachtvertrag Gaststätte" />
          </div>
          <div className="form-field">
            <label>Kategorie</label>
            <select value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
              {KATEGORIEN.map((k) => (
                <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="aktiv">Aktiv</option>
              <option value="gekuendigt">Gekündigt</option>
              <option value="abgelaufen">Abgelaufen</option>
              <option value="entwurf">Entwurf</option>
            </select>
          </div>
          <div className="form-field full">
            <label>Vertragspartner</label>
            <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Name / Firma" />
          </div>
        </div>
      </div>

      {/* Laufzeit */}
      <div className="form-section">
        <div className="form-section-title">Laufzeit & Kündigung</div>
        <div className="form-grid">
          <div className="form-field">
            <label>Beginn</label>
            <input type="date" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Ende (leer = unbefristet)</label>
            <input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Kündigungsfrist (Monate)</label>
            <input type="number" min="0" value={kuendigungsfrist} onChange={(e) => setKuendigungsfrist(e.target.value)} placeholder="z.B. 3" />
          </div>
          <div className="form-field">
            <label>Vertragswert / Kosten</label>
            <input value={wert} onChange={(e) => setWert(e.target.value)} placeholder="z.B. 450 €/Monat" />
          </div>
        </div>
      </div>

      {/* Dokumente */}
      <div className="form-section">
        <div className="form-section-title">📎 Dokumente (OneDrive-Links)</div>
        {dokumente.map((dok, i) => (
          <div key={i} className="doc-eintrag">
            <input
              placeholder="Bezeichnung (z.B. Pachtvertrag.pdf)"
              value={dok.name}
              onChange={(e) => dokAktualisieren(i, "name", e.target.value)}
            />
            <input
              placeholder="SharePoint/OneDrive-Link (https://…)"
              value={dok.url}
              onChange={(e) => dokAktualisieren(i, "url", e.target.value)}
              style={{ flex: 2 }}
            />
            <button
              type="button"
              className="btn-remove-doc"
              onClick={() => dokEntfernen(i)}
              title="Entfernen"
            >✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost" style={{ fontSize: 13, alignSelf: "flex-start" }} onClick={dokHinzufuegen}>
          + Dokument hinzufügen
        </button>
      </div>

      {/* Kontakt & Notizen */}
      <div className="form-section">
        <div className="form-section-title">Weitere Informationen</div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Ansprechpartner HTV</label>
            <input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} placeholder="z.B. Peter Schinnerling" />
          </div>
          <div className="form-field full">
            <label>Notizen</label>
            <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Besonderheiten, Vereinbarungen, Hinweise …" rows={3} />
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onAbbrechen}>Abbrechen</button>
        <button type="submit" className="btn-primary" disabled={laden}>
          {laden ? "Speichern …" : modus === "neu" ? "Vertrag anlegen" : "Änderungen speichern"}
        </button>
      </div>
    </form>
  );
}

// ─── Löschen-Modal ────────────────────────────────────────────────────────────
function LoeschenModal({ name, onBestaetigen, onAbbrechen }) {
  return (
    <div className="modal-overlay" onClick={onAbbrechen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🗑️ Vertrag löschen?</h3>
        <p>
          <strong>"{name}"</strong> wird unwiderruflich gelöscht.
          Die Originaldokumente in OneDrive bleiben unberührt.
        </p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onAbbrechen}>Abbrechen</button>
          <button className="btn-danger" onClick={onBestaetigen}>Ja, löschen</button>
        </div>
      </div>
    </div>
  );
}
