import { useState, useRef } from 'react';
import { Download, Upload, Database, Stamp, Sparkles } from 'lucide-react';
import { resetFactureCounter, resetDevisCounter, resetBonLivraisonCounter } from './services/numberingService';
import { getStampSize, setStampSize as saveStampSize, getQuickAIEnabled, setQuickAIEnabled } from './services/companySettingsService';
import {
  exportFacturesCSV, exportDevisCSV, exportBLCSV,
  exportAchatsCSV, exportClientsCSV, exportBankStatementsCSV,
  exportAllJSON, parseBackupFile, importFromBackup,
  type BackupPreview,
} from './services/exportService';

export default function SettingsPage() {
  const currentYear = new Date().getFullYear();

  // ── Numbering counters ──────────────────────────────────────────────────────

  const [facYear,      setFacYear]      = useState(currentYear);
  const [facStartFrom, setFacStartFrom] = useState(0);
  const [facLoading,   setFacLoading]   = useState(false);
  const [facResult,    setFacResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  const [devYear,      setDevYear]      = useState(currentYear);
  const [devStartFrom, setDevStartFrom] = useState(0);
  const [devLoading,   setDevLoading]   = useState(false);
  const [devResult,    setDevResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  const [blYear,       setBlYear]       = useState(currentYear);
  const [blStartFrom,  setBlStartFrom]  = useState(0);
  const [blLoading,    setBlLoading]    = useState(false);
  const [blResult,     setBlResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Stamp size ─────────────────────────────────────────────────────────────

  const [stampSize, setStampSizeState] = useState(() => Math.round(getStampSize() * 100));

  function handleStampSize(pct: number) {
    setStampSizeState(pct);
    saveStampSize(pct / 100);
  }

  // ── Quick AI ────────────────────────────────────────────────────────────────

  const [quickAI, setQuickAIState] = useState(() => getQuickAIEnabled());

  function handleQuickAIToggle(enabled: boolean) {
    setQuickAIState(enabled);
    setQuickAIEnabled(enabled);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // ── Import ──────────────────────────────────────────────────────────────────

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<BackupPreview | null>(null);
  const [importRaw,     setImportRaw]     = useState<Record<string, unknown> | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult,  setImportResult]  = useState<{ inserted: number; errors: string[] } | null>(null);
  const [importError,   setImportError]   = useState<string | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleResetFacture() {
    const nextNum = `FAC-${facYear}-${String(facStartFrom + 1).padStart(4, '0')}`;
    if (!window.confirm(
      `Réinitialiser le compteur FAC-${facYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les factures existantes ne seront PAS supprimées.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    )) return;
    setFacLoading(true);
    setFacResult(null);
    try {
      await resetFactureCounter(facYear, facStartFrom);
      setFacResult({ ok: true, msg: `Compteur réinitialisé. Prochain numéro prévu : ${nextNum}` });
    } catch (e: unknown) {
      setFacResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setFacLoading(false);
    }
  }

  async function handleResetDevis() {
    const nextNum = `DEV-${devYear}-${String(devStartFrom + 1).padStart(4, '0')}`;
    if (!window.confirm(
      `Réinitialiser le compteur DEV-${devYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les devis existants ne seront PAS supprimés.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    )) return;
    setDevLoading(true);
    setDevResult(null);
    try {
      await resetDevisCounter(devYear, devStartFrom);
      setDevResult({ ok: true, msg: `Compteur réinitialisé. Prochain numéro prévu : ${nextNum}` });
    } catch (e: unknown) {
      setDevResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setDevLoading(false);
    }
  }

  async function handleResetBL() {
    const nextNum = `BL-${blYear}-${String(blStartFrom + 1).padStart(4, '0')}`;
    if (!window.confirm(
      `Réinitialiser le compteur BL-${blYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les bons de livraison existants ne seront PAS supprimés.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    )) return;
    setBlLoading(true);
    setBlResult(null);
    try {
      await resetBonLivraisonCounter(blYear, blStartFrom);
      setBlResult({ ok: true, msg: `Compteur réinitialisé. Prochain numéro prévu : ${nextNum}` });
    } catch (e: unknown) {
      setBlResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setBlLoading(false);
    }
  }

  async function runExport(key: string, fn: () => Promise<void>) {
    setExportLoading(key);
    try { await fn(); } catch (e: unknown) {
      alert('Erreur export : ' + ((e as { message?: string })?.message ?? 'Erreur inconnue'));
    } finally { setExportLoading(null); }
  }

  async function handleBackup() {
    setBackupLoading(true);
    try { await exportAllJSON(); } catch (e: unknown) {
      alert('Erreur sauvegarde : ' + ((e as { message?: string })?.message ?? 'Erreur inconnue'));
    } finally { setBackupLoading(false); }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setImportPreview(null);
    setImportRaw(null);
    setImportResult(null);
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const { preview, raw } = parseBackupFile(ev.target?.result as string);
        setImportPreview(preview);
        setImportRaw(raw);
      } catch (err: unknown) {
        setImportError((err as { message?: string })?.message ?? 'Fichier invalide');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importRaw) return;
    if (!window.confirm(
      'Confirmer l\'importation ?\n\nLes données existantes avec le même ID seront mises à jour (upsert). Aucune donnée ne sera supprimée.'
    )) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const result = await importFromBackup(importRaw);
      setImportResult(result);
      setImportPreview(null);
      setImportRaw(null);
      if (importInputRef.current) importInputRef.current.value = '';
    } catch (e: unknown) {
      setImportError((e as { message?: string })?.message ?? 'Erreur inconnue');
    } finally {
      setImportLoading(false);
    }
  }

  const CSV_EXPORTS = [
    { key: 'factures', label: 'Factures CSV',           fn: exportFacturesCSV      },
    { key: 'devis',    label: 'Devis CSV',               fn: exportDevisCSV         },
    { key: 'bl',       label: 'Bons de livraison CSV',   fn: exportBLCSV            },
    { key: 'achats',   label: 'Achats CSV',              fn: exportAchatsCSV        },
    { key: 'clients',  label: 'Clients CSV',             fn: exportClientsCSV       },
    { key: 'banque',   label: 'Relevés bancaires CSV',   fn: exportBankStatementsCSV },
  ] as const;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 max-w-2xl mx-auto">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Paramètres</h1>
      </div>

      {/* ── Factures ── */}
      <CounterSection
        title="Numérotation des factures"
        prefix="FAC"
        year={facYear}
        startFrom={facStartFrom}
        loading={facLoading}
        result={facResult}
        onYearChange={setFacYear}
        onStartFromChange={setFacStartFrom}
        onReset={handleResetFacture}
      />

      {/* ── Devis ── */}
      <CounterSection
        title="Numérotation des devis"
        prefix="DEV"
        year={devYear}
        startFrom={devStartFrom}
        loading={devLoading}
        result={devResult}
        onYearChange={setDevYear}
        onStartFromChange={setDevStartFrom}
        onReset={handleResetDevis}
      />

      {/* ── Bons de Livraison ── */}
      <CounterSection
        title="Numérotation des bons de livraison"
        prefix="BL"
        year={blYear}
        startFrom={blStartFrom}
        loading={blLoading}
        result={blResult}
        onYearChange={setBlYear}
        onStartFromChange={setBlStartFrom}
        onReset={handleResetBL}
      />

      {/* ── Apparence ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Stamp className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Apparence des documents</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Taille du cachet
              </label>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{stampSize}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 shrink-0 w-8 text-right">50%</span>
              <input
                type="range"
                min={50}
                max={400}
                step={5}
                value={stampSize}
                onChange={e => handleStampSize(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full accent-violet-600 cursor-pointer"
              />
              <span className="text-xs text-slate-400 shrink-0 w-10">400%</span>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Ajuste la taille visuelle du cachet sur les factures, devis et bons de livraison — aperçu et export PDF inclus.
            </p>
          </div>
          {stampSize !== 100 && (
            <button
              onClick={() => handleStampSize(100)}
              className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors"
            >
              Réinitialiser à 100%
            </button>
          )}
        </div>
      </div>

      {/* ── Quick AI ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Assistant IA</h2>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Barre IA rapide sur le tableau de bord</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Permet de créer une facture, un devis ou d'importer un achat en langage naturel.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={quickAI}
              onClick={() => handleQuickAIToggle(!quickAI)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${quickAI ? 'bg-violet-600' : 'bg-slate-200'}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${quickAI ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Export CSV ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Download className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">
            Export de données
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-slate-500">
            Exportez vos données en format CSV (compatible Excel, UTF-8 avec BOM).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CSV_EXPORTS.map(({ key, label, fn }) => (
              <button
                key={key}
                onClick={() => runExport(key, fn)}
                disabled={exportLoading === key}
                className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-60 text-left"
              >
                {exportLoading === key
                  ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
                  : <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── JSON Backup ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">
            Sauvegarde JSON
          </h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-slate-500">
            Téléchargez une sauvegarde complète de toutes vos données (Factures, Achats, Clients, Relevés bancaires).
          </p>
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
          >
            {backupLoading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Download className="w-4 h-4" />}
            Télécharger la sauvegarde
          </button>
        </div>
      </div>

      {/* ── Import / Restore ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Upload className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">
            Restaurer une sauvegarde
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
            <strong>Attention :</strong> l'importation fusionne les données (upsert par ID).
            Les enregistrements existants avec le même ID seront mis à jour. Aucune donnée ne sera supprimée.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Fichier de sauvegarde (.json)
            </label>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-slate-500
                file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200
                file:text-sm file:font-medium file:bg-white file:text-slate-700
                hover:file:bg-slate-50 transition-all cursor-pointer"
            />
          </div>

          {importError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              {importError}
            </div>
          )}

          {importPreview && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-600">Aperçu de la sauvegarde</p>
              </div>
              <div className="px-4 py-3 space-y-1.5 text-xs text-slate-600">
                <p>Exportée le :{' '}
                  <span className="font-medium text-slate-800">
                    {new Date(importPreview.exported_at).toLocaleString('fr-MA')}
                  </span>
                </p>
                <p>Version :{' '}
                  <span className="font-medium text-slate-800">{importPreview.version}</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-slate-100">
                  <p>Factures :{' '}<span className="font-semibold text-slate-800">{importPreview.counts.factures}</span></p>
                  <p>Achats :{' '}<span className="font-semibold text-slate-800">{importPreview.counts.achats}</span></p>
                  <p>Clients :{' '}<span className="font-semibold text-slate-800">{importPreview.counts.clients}</span></p>
                  <p>Relevés :{' '}<span className="font-semibold text-slate-800">{importPreview.counts.bank_statements}</span></p>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={handleImport}
                  disabled={importLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
                >
                  {importLoading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Upload className="w-4 h-4" />}
                  Confirmer l'importation
                </button>
              </div>
            </div>
          )}

          {importResult && (
            <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${
              importResult.errors.length === 0
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}>
              <p className="font-semibold">{importResult.inserted} enregistrement(s) importé(s) avec succès.</p>
              {importResult.errors.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {importResult.errors.map((err, i) => <li key={i}>⚠ {err}</li>)}
                </ul>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}

// ── Shared CounterSection ─────────────────────────────────────────────────────

function CounterSection({
  title, prefix, year, startFrom, loading, result,
  onYearChange, onStartFromChange, onReset,
}: {
  title: string;
  prefix: string;
  year: number;
  startFrom: number;
  loading: boolean;
  result: { ok: boolean; msg: string } | null;
  onYearChange: (y: number) => void;
  onStartFromChange: (n: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>

      <div className="px-6 py-5 space-y-5">

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
          <strong>Attention :</strong> cette action réinitialise le compteur interne.
          Les documents existants ne sont pas supprimés.
          Si le numéro généré existe déjà, le système l'incrémente automatiquement jusqu'à trouver un numéro libre.
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Année
          </label>
          <input
            type="number"
            value={year}
            min={2020}
            max={2099}
            onChange={e => onYearChange(Number(e.target.value))}
            className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Repartir à partir de
          </label>
          <input
            type="number"
            value={startFrom}
            min={0}
            onChange={e => onStartFromChange(Math.max(0, Number(e.target.value)))}
            className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            0 → prochain numéro sera {prefix}-{year}-0001
          </p>
        </div>

        {result && (
          <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${
            result.ok
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {result.msg}
          </div>
        )}

        <button
          onClick={onReset}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Réinitialiser le compteur
        </button>

      </div>
    </div>
  );
}
