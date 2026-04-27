import { useState } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { resetFactureCounter, resetDevisCounter, resetBonLivraisonCounter } from './services/numberingService';

interface Props {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: Props) {
  const currentYear = new Date().getFullYear();

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

  async function handleResetFacture() {
    const nextNum = `FAC-${facYear}-${String(facStartFrom + 1).padStart(4, '0')}`;
    const ok = window.confirm(
      `Réinitialiser le compteur FAC-${facYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les factures existantes ne seront PAS supprimées.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    );
    if (!ok) return;
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
    const ok = window.confirm(
      `Réinitialiser le compteur DEV-${devYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les devis existants ne seront PAS supprimés.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    );
    if (!ok) return;
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
    const ok = window.confirm(
      `Réinitialiser le compteur BL-${blYear} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les bons de livraison existants ne seront PAS supprimés.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    );
    if (!ok) return;
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

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Toolbar */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <Settings className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase">Paramètres</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

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

      </div>
    </div>
  );
}

// ── Shared section component ──────────────────────────────────────────────────

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
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
          {title}
        </h2>
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
