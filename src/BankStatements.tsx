import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit2, ExternalLink, Upload, X,
  Landmark, TrendingUp, TrendingDown, ArrowUpDown, FileText, Sparkles,
} from 'lucide-react';
import { MetricCard, TableActionBtn } from './ui';
import type { BankStatement, BankStatementStatus } from './types';
import {
  getBankStatements, upsertBankStatement, deleteBankStatement,
  uploadStatementFile, deleteStatementFile, validateStatementFile,
} from './services/bankStatementService';
import { extractBankStatementFromFile } from './services/bankStatementAIService';

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const AI_ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const AI_MAX_SIZE = 5 * 1024 * 1024;

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status?: BankStatementStatus }) {
  if (!status || status === 'validated') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        Validé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
      À vérifier
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BankStatements() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<BankStatement | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState('');
  const aiInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      setStatements(await getBankStatements());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const yearStatements = useMemo(
    () => statements.filter(s => s.year === yearFilter),
    [statements, yearFilter],
  );

  const metrics = useMemo(() => {
    const totalCredit = yearStatements.reduce((s, r) => s + r.total_credit,  0);
    const totalDebit  = yearStatements.reduce((s, r) => s + r.total_debit,   0);
    const lastBalance = yearStatements[0]?.closing_balance ?? 0;
    return { totalCredit, totalDebit, net: totalCredit - totalDebit, lastBalance };
  }, [yearStatements]);

  async function handleDelete(stmt: BankStatement) {
    if (!window.confirm(`Supprimer le relevé ${MONTH_NAMES[stmt.month - 1]} ${stmt.year} ?`)) return;
    if (stmt.file_path) await deleteStatementFile(stmt.file_path);
    await deleteBankStatement(stmt.id);
    setStatements(prev => prev.filter(s => s.id !== stmt.id));
  }

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(stmt: BankStatement) {
    setEditing(stmt);
    setShowForm(true);
  }

  function handleSaved(updated: BankStatement) {
    setStatements(prev => {
      const idx = prev.findIndex(s => s.id === updated.id);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = updated; return next;
      }
      return [updated, ...prev];
    });
    setShowForm(false);
  }

  async function handleAIFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!AI_ALLOWED.includes(file.type) && !AI_ALLOWED.some(t => file.name.toLowerCase().endsWith(t.split('/')[1]))) {
      setAiError('Format non supporté. Acceptés : PDF, JPG, PNG.');
      return;
    }
    if (file.size > AI_MAX_SIZE) {
      setAiError(`Fichier trop volumineux (max 5 MB). Votre fichier : ${(file.size / 1024 / 1024).toFixed(1)} MB`);
      return;
    }

    setAiError('');
    setAiLoading(true);
    try {
      const extracted = await extractBankStatementFromFile(file);
      setEditing(extracted);
      setShowForm(true);
      setYearFilter(extracted.year ?? CURRENT_YEAR);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Erreur lors de l'extraction IA");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relevés bancaires</h1>
          <p className="text-sm text-slate-400 mt-0.5">Suivi mensuel des mouvements bancaires</p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Import */}
          <button
            onClick={() => { setAiError(''); aiInputRef.current?.click(); }}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-medium rounded-lg transition-all disabled:opacity-60"
          >
            {aiLoading
              ? <span className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            {aiLoading ? 'Extraction…' : 'Importer avec IA'}
          </button>
          <input
            ref={aiInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleAIFileChange}
          />
          {/* Manual */}
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouveau relevé
          </button>
        </div>
      </div>

      {/* AI error */}
      {aiError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{aiError}</span>
          <button onClick={() => setAiError('')} className="shrink-0 text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Year filter ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
        {YEARS.map(y => (
          <button
            key={y}
            onClick={() => setYearFilter(y)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              yearFilter === y
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={<TrendingUp  className="w-5 h-5 text-emerald-500" />} iconBg="bg-emerald-50"
          label="Total crédit"  value={`${fmt(metrics.totalCredit)} DH`} valueClass="text-emerald-700" />
        <MetricCard icon={<TrendingDown className="w-5 h-5 text-red-500" />} iconBg="bg-red-50"
          label="Total débit"   value={`${fmt(metrics.totalDebit)} DH`}  valueClass="text-red-600" />
        <MetricCard icon={<ArrowUpDown className="w-5 h-5 text-blue-500" />} iconBg="bg-blue-50"
          label="Flux net"      value={`${fmt(metrics.net)} DH`}
          valueClass={metrics.net >= 0 ? 'text-blue-700' : 'text-red-600'} />
        <MetricCard icon={<Landmark   className="w-5 h-5 text-slate-500" />} iconBg="bg-slate-50"
          label="Dernier solde" value={`${fmt(metrics.lastBalance)} DH`} />
      </div>

      {/* ── Chart ── */}
      {!loading && yearStatements.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <BankBarChart statements={yearStatements} year={yearFilter} />
        </div>
      )}

      {/* ── List ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center py-16 gap-2 text-red-500 text-sm">
            <span>{fetchError}</span>
            <button onClick={load} className="text-xs underline text-slate-500">Réessayer</button>
          </div>
        ) : yearStatements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Landmark className="w-10 h-10 mb-3 opacity-25" />
            <p className="text-sm font-medium">Aucun relevé pour {yearFilter}</p>
            <p className="text-xs mt-1">Ajoutez votre premier relevé bancaire</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Mois</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Solde ouv.</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Crédit</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Débit</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Solde clôt.</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Notes</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearStatements.map(stmt => (
                    <tr key={stmt.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">{MONTH_NAMES[stmt.month - 1]}</span>
                          <StatusBadge status={stmt.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-slate-600 tabular-nums">{fmt(stmt.opening_balance)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-emerald-700 tabular-nums">{fmt(stmt.total_credit)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-red-600 tabular-nums">{fmt(stmt.total_debit)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-800 tabular-nums">{fmt(stmt.closing_balance)} DH</td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 max-w-[200px] truncate">{stmt.notes || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {stmt.file_url && (
                            <a href={stmt.file_url} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all" title="Voir fichier">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <TableActionBtn title="Modifier"  onClick={() => openEdit(stmt)}><Edit2  className="w-4 h-4" /></TableActionBtn>
                          <TableActionBtn title="Supprimer" onClick={() => handleDelete(stmt)} danger><Trash2 className="w-4 h-4" /></TableActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {yearStatements.map(stmt => (
                <div key={stmt.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{MONTH_NAMES[stmt.month - 1]} {stmt.year}</span>
                      <StatusBadge status={stmt.status} />
                    </div>
                    <div className="flex items-center gap-1">
                      {stmt.file_url && (
                        <a href={stmt.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      )}
                      <TableActionBtn title="Modifier"  onClick={() => openEdit(stmt)}><Edit2  className="w-5 h-5" /></TableActionBtn>
                      <TableActionBtn title="Supprimer" onClick={() => handleDelete(stmt)} danger><Trash2 className="w-5 h-5" /></TableActionBtn>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Crédit</p>
                      <p className="font-semibold text-emerald-700 tabular-nums">{fmt(stmt.total_credit)} DH</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Débit</p>
                      <p className="font-semibold text-red-600 tabular-nums">{fmt(stmt.total_debit)} DH</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Solde clôture</p>
                      <p className="font-bold text-slate-800 tabular-nums">{fmt(stmt.closing_balance)} DH</p>
                    </div>
                  </div>
                  {stmt.notes && <p className="text-xs text-slate-500">{stmt.notes}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Form modal ── */}
      {showForm && (
        <StatementForm
          initial={editing}
          defaultYear={yearFilter}
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Statement form modal ──────────────────────────────────────────────────────

function StatementForm({
  initial, defaultYear, onSaved, onClose,
}: {
  initial:     BankStatement | null;
  defaultYear: number;
  onSaved:     (s: BankStatement) => void;
  onClose:     () => void;
}) {
  const isAIExtracted = initial?.status === 'needs_review';

  const [month,          setMonth]          = useState(initial?.month ?? new Date().getMonth() + 1);
  const [year,           setYear]           = useState(initial?.year  ?? defaultYear);
  const [openingBalance, setOpeningBalance] = useState(String(initial?.opening_balance ?? ''));
  const [totalCredit,    setTotalCredit]    = useState(String(initial?.total_credit    ?? ''));
  const [totalDebit,     setTotalDebit]     = useState(String(initial?.total_debit     ?? ''));
  const [closingBalance, setClosingBalance] = useState(String(initial?.closing_balance ?? ''));
  const [notes,          setNotes]          = useState(initial?.notes ?? '');
  const [status,         setStatus]         = useState<BankStatementStatus>(initial?.status ?? 'validated');
  const [file,           setFile]           = useState<File | null>(null);
  const [fileError,      setFileError]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const calcClosing = () => {
    const ob = parseFloat(openingBalance) || 0;
    const cr = parseFloat(totalCredit)    || 0;
    const db = parseFloat(totalDebit)     || 0;
    setClosingBalance(String((ob + cr - db).toFixed(2)));
  };

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateStatementFile(f);
    if (err) { setFileError(err); return; }
    setFileError('');
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = initial?.id ?? crypto.randomUUID();
      let fileUrl  = initial?.file_url  ?? null;
      let filePath = initial?.file_path ?? null;

      if (file) {
        const uploaded = await uploadStatementFile(id, file);
        fileUrl  = uploaded.url;
        filePath = uploaded.path;
      }

      const saved = await upsertBankStatement({
        id,
        month:           month,
        year:            year,
        opening_balance: parseFloat(openingBalance) || 0,
        total_credit:    parseFloat(totalCredit)    || 0,
        total_debit:     parseFloat(totalDebit)     || 0,
        closing_balance: parseFloat(closingBalance) || 0,
        notes,
        status,
        file_url:  fileUrl,
        file_path: filePath,
        raw_json:  initial?.raw_json ?? null,
      });
      onSaved(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {isAIExtracted && <Sparkles className="w-4 h-4 text-violet-500" />}
            <h2 className="text-base font-semibold text-slate-800">
              {initial ? 'Modifier le relevé' : 'Nouveau relevé bancaire'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAIExtracted && (
          <div className="mx-6 mt-4 px-4 py-3 bg-violet-50 border border-violet-200 rounded-lg flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700 leading-relaxed">
              Données extraites par IA — vérifiez les valeurs avant de valider.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Mois</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300">
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Année</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <FField label="Solde d'ouverture (DH)" value={openingBalance}
            onChange={setOpeningBalance} onBlur={calcClosing} type="number" step="0.01" />
          <FField label="Total crédits (DH)" value={totalCredit}
            onChange={setTotalCredit} onBlur={calcClosing} type="number" step="0.01" />
          <FField label="Total débits (DH)" value={totalDebit}
            onChange={setTotalDebit} onBlur={calcClosing} type="number" step="0.01" />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Solde de clôture (DH)</label>
              <button type="button" onClick={calcClosing} className="text-xs text-slate-400 hover:text-slate-700 underline">
                Auto-calculer
              </button>
            </div>
            <input
              type="number" step="0.01"
              value={closingBalance}
              onChange={e => setClosingBalance(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
              placeholder="Notes optionnelles…" />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Statut</label>
            <div className="flex gap-2">
              {([
                { value: 'needs_review', label: 'À vérifier', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
                { value: 'validated',   label: 'Validé',      cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    status === opt.value
                      ? opt.cls
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* File upload (only shown for new or manual entries; AI already stored the file) */}
          {!isAIExtracted && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Fichier relevé (PDF/image)
              </label>
              <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 transition-all">
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500 truncate">
                  {file ? file.name : initial?.file_url ? 'Fichier existant (changer)' : 'Choisir un fichier…'}
                </span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} className="hidden" />
              </label>
              {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
              {initial?.file_url && !file && (
                <a href={initial.file_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                  <FileText className="w-3 h-3" />Voir le fichier actuel
                </a>
              )}
            </div>
          )}

          {/* File link for AI-extracted (file already stored) */}
          {isAIExtracted && initial?.file_url && (
            <a href={initial.file_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
              <FileText className="w-3 h-3" />Voir le fichier importé
            </a>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm">
              {saving ? 'Sauvegarde…' : isAIExtracted ? 'Valider le relevé' : initial ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bank statement bar chart ──────────────────────────────────────────────────

const SHORT_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

function BankBarChart({ statements, year }: { statements: BankStatement[]; year: number }) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const now           = new Date();
  const currentMonth  = now.getMonth() + 1;
  const isCurrentYear = year === now.getFullYear();

  const data = SHORT_MONTHS.map((label, i) => {
    const s = statements.find(st => st.month === i + 1);
    return { label, month: i + 1, credit: s?.total_credit ?? 0, debit: s?.total_debit ?? 0, hasData: !!s };
  });

  const rawMax = Math.max(...data.flatMap(d => [d.credit, d.debit]), 1);
  const mag    = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const maxVal = Math.ceil(rawMax / mag) * mag;

  // SVG layout
  const VW = 720, ML = 54, MR = 8, MT = 12, MB = 26;
  const CW = VW - ML - MR;  // 658
  const CH = 175;
  const VH = CH + MT + MB;  // 213

  const slotW = CW / 12;    // ~54.8
  const barW  = 21;
  const gap   = 5;

  const barH      = (v: number) => Math.max(0, (v / maxVal) * CH);
  const gridLevels = [0, 0.25, 0.5, 0.75, 1];

  const trendPts = data
    .filter(d => d.hasData)
    .map(d => {
      const x    = ML + (d.month - 1) * slotW + slotW / 2;
      const netV = d.credit - d.debit;
      const y    = Math.max(MT + 1, Math.min(MT + CH, MT + CH - (netV / maxVal) * CH));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="pt-4 pb-3 space-y-3">

      <h3 className="px-5 text-sm font-semibold text-slate-600">
        Flux de trésorerie — {year}
      </h3>

      {/* chart fills full card width — no horizontal padding, no fixed height */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="w-full"
          onMouseLeave={() => setHoveredMonth(null)}
        >
          {/* Grid lines + Y-axis labels */}
          {gridLevels.map((lvl, i) => {
            const y = MT + CH - lvl * CH;
            return (
              <g key={i}>
                <line
                  x1={ML} y1={y} x2={ML + CW} y2={y}
                  stroke={lvl === 0 ? '#e2e8f0' : '#f8fafc'}
                  strokeWidth={1}
                />
                {lvl > 0 && (
                  <text
                    x={ML - 7} y={y + 3.5}
                    textAnchor="end" fontSize={9} fill="#cbd5e1" fontFamily="system-ui"
                  >
                    {fmtY(lvl * maxVal)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Month columns: bars + labels + hover */}
          {data.map((d, i) => {
            const slotX     = ML + i * slotW;
            const groupW    = barW * 2 + gap;
            const gX        = slotX + (slotW - groupW) / 2;
            const cX        = gX;
            const dX        = gX + barW + gap;
            const cH        = barH(d.credit);
            const dH        = barH(d.debit);
            const isHL      = isCurrentYear && d.month === currentMonth;
            const isHovered = hoveredMonth === d.month;

            return (
              <g key={i}>
                {/* Column background */}
                {(isHL || isHovered) && (
                  <rect
                    x={slotX + 1} y={MT} width={slotW - 2} height={CH}
                    fill={isHovered ? '#f8fafc' : '#f0fdf4'} rx={5}
                  />
                )}

                {/* Credit bar — only when data exists */}
                {d.hasData && cH > 0 && (
                  <path
                    d={rrect(cX, MT + CH - cH, barW, cH, 4)}
                    fill={isHL ? '#059669' : '#34d399'}
                  />
                )}

                {/* Debit bar — only when data exists */}
                {d.hasData && dH > 0 && (
                  <path
                    d={rrect(dX, MT + CH - dH, barW, dH, 4)}
                    fill={isHL ? '#dc2626' : '#f87171'}
                  />
                )}

                {/* Month label — always full opacity */}
                <text
                  x={slotX + slotW / 2} y={MT + CH + 22}
                  textAnchor="middle"
                  fontSize={isHL ? 11 : 10}
                  fill={isHL ? '#475569' : '#94a3b8'}
                  fontWeight={isHL ? '700' : '400'}
                  fontFamily="system-ui"
                >
                  {d.label}
                </text>

                {/* Invisible hover zone */}
                <rect
                  x={slotX} y={MT} width={slotW} height={CH + 34}
                  fill="transparent"
                  onMouseEnter={() => setHoveredMonth(d.month)}
                  style={{ cursor: 'crosshair' }}
                />
              </g>
            );
          })}

          {/* Solde net trend line */}
          {trendPts && (
            <>
              <polyline
                points={trendPts}
                fill="none" stroke="#334155" strokeWidth={1.5}
                strokeLinejoin="round" strokeLinecap="round"
                opacity={0.55} strokeDasharray="4,3"
              />
              {data.filter(d => d.hasData).map(d => {
                const netV = d.credit - d.debit;
                const x = ML + (d.month - 1) * slotW + slotW / 2;
                const y = Math.max(MT + 2, Math.min(MT + CH, MT + CH - (netV / maxVal) * CH));
                return <circle key={d.month} cx={x} cy={y} r={2} fill="#334155" opacity={0.55} />;
              })}
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoveredMonth !== null && (() => {
          const d    = data[hoveredMonth - 1];
          const netV = d.credit - d.debit;
          const pct  = ((ML + (hoveredMonth - 1) * slotW + slotW / 2) / VW) * 100;
          const left = `${Math.min(Math.max(pct - 11, 1), 57)}%`;
          return (
            <div
              className="absolute top-2 pointer-events-none z-10 bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-3 min-w-[168px] text-xs"
              style={{ left }}
            >
              <p className="font-bold text-slate-800 mb-2">{MONTH_NAMES[d.month - 1]} {year}</p>
              <div className="space-y-1.5">
                <TooltipRow color="bg-emerald-400" label="Crédits"  value={`${fmt(d.credit)} DH`} positive />
                <TooltipRow color="bg-red-400"     label="Débits"   value={`${fmt(d.debit)} DH`}  />
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-5">
                  <span className="text-slate-400">Solde net</span>
                  <span className={`font-bold tabular-nums ${netV >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {netV >= 0 ? '+' : ''}{fmt(netV)} DH
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="px-5 flex items-center gap-5 pt-2 border-t border-slate-100">
        <ChartLegend color="bg-emerald-400" label="Crédits" />
        <ChartLegend color="bg-red-400"     label="Débits"  />
        <div className="flex items-center gap-1.5">
          <svg width="18" height="8">
            <line x1="0" y1="4" x2="18" y2="4"
              stroke="#334155" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.55" />
          </svg>
          <span className="text-xs text-slate-400">Solde net</span>
        </div>
      </div>

    </div>
  );
}

// ── Chart sub-components ──────────────────────────────────────────────────────

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-sm ${color}`} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

function TooltipRow({ color, label, value, positive }: {
  color: string; label: string; value: string; positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={`flex items-center gap-1.5 ${positive ? 'text-emerald-600' : 'text-rose-500'}`}>
        <span className={`w-2 h-2 rounded-sm inline-block ${color}`} />
        {label}
      </span>
      <span className="font-semibold text-slate-700 tabular-nums">{value}</span>
    </div>
  );
}

function rrect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, Math.max(h, 0.01));
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} H${x} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}

function fmtY(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}


function FField({
  label, value, onChange, onBlur, type = 'text', step,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; type?: string; step?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type} step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
    </div>
  );
}
