import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Plus, Trash2, Edit2, ExternalLink, Upload, X,
  Landmark, TrendingUp, TrendingDown, ArrowUpDown, FileText,
} from 'lucide-react';
import type { BankStatement } from './types';
import {
  getBankStatements, upsertBankStatement, deleteBankStatement,
  uploadStatementFile, deleteStatementFile, validateStatementFile,
} from './services/bankStatementService';

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BankStatements() {
  const [statements, setStatements]   = useState<BankStatement[]>([]);
  const [loading,    setLoading]      = useState(true);
  const [fetchError, setFetchError]   = useState('');
  const [yearFilter, setYearFilter]   = useState(CURRENT_YEAR);
  const [showForm,   setShowForm]     = useState(false);
  const [editing,    setEditing]      = useState<BankStatement | null>(null);

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
    const totalCredit  = yearStatements.reduce((s, r) => s + r.total_credit,    0);
    const totalDebit   = yearStatements.reduce((s, r) => s + r.total_debit,     0);
    const lastBalance  = yearStatements[0]?.closing_balance ?? 0;
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

  async function handleSaved(updated: BankStatement) {
    setStatements(prev => {
      const idx = prev.findIndex(s => s.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setShowForm(false);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relevés bancaires</h1>
          <p className="text-sm text-slate-400 mt-0.5">Suivi mensuel des mouvements bancaires</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouveau relevé
        </button>
      </div>

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
        <MCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} bg="bg-emerald-50"
          label="Total crédit" value={`${fmt(metrics.totalCredit)} DH`} cls="text-emerald-700" />
        <MCard icon={<TrendingDown className="w-5 h-5 text-red-500" />} bg="bg-red-50"
          label="Total débit" value={`${fmt(metrics.totalDebit)} DH`} cls="text-red-600" />
        <MCard icon={<ArrowUpDown className="w-5 h-5 text-blue-500" />} bg="bg-blue-50"
          label="Flux net" value={`${fmt(metrics.net)} DH`}
          cls={metrics.net >= 0 ? 'text-blue-700' : 'text-red-600'} />
        <MCard icon={<Landmark className="w-5 h-5 text-slate-500" />} bg="bg-slate-50"
          label="Dernier solde" value={`${fmt(metrics.lastBalance)} DH`} />
      </div>

      {/* ── Chart (credits vs debits by month) ── */}
      {!loading && yearStatements.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Crédits vs Débits — {yearFilter}</p>
          <BankBarChart statements={yearStatements} />
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
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-36">Mois</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Solde ouv.</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Crédit</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Débit</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Solde cloture</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Notes</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearStatements.map(stmt => (
                    <tr key={stmt.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-sm text-slate-800">{MONTH_NAMES[stmt.month - 1]}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-slate-600">{fmt(stmt.opening_balance)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-emerald-700">{fmt(stmt.total_credit)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-red-600">{fmt(stmt.total_debit)} DH</td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-800">{fmt(stmt.closing_balance)} DH</td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 max-w-[200px] truncate">{stmt.notes || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {stmt.file_url && (
                            <a href={stmt.file_url} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all" title="Voir fichier">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <button onClick={() => openEdit(stmt)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all" title="Modifier">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(stmt)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                    <span className="font-bold text-slate-800">{MONTH_NAMES[stmt.month - 1]} {stmt.year}</span>
                    <div className="flex items-center gap-1">
                      {stmt.file_url && (
                        <a href={stmt.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      )}
                      <button onClick={() => openEdit(stmt)}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDelete(stmt)}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Crédit</p>
                      <p className="font-semibold text-emerald-700">{fmt(stmt.total_credit)} DH</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Débit</p>
                      <p className="font-semibold text-red-600">{fmt(stmt.total_debit)} DH</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Solde clôture</p>
                      <p className="font-bold text-slate-800">{fmt(stmt.closing_balance)} DH</p>
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
  const [month,          setMonth]          = useState(initial?.month ?? new Date().getMonth() + 1);
  const [year,           setYear]           = useState(initial?.year  ?? defaultYear);
  const [openingBalance, setOpeningBalance] = useState(String(initial?.opening_balance ?? ''));
  const [totalCredit,    setTotalCredit]    = useState(String(initial?.total_credit    ?? ''));
  const [totalDebit,     setTotalDebit]     = useState(String(initial?.total_debit     ?? ''));
  const [closingBalance, setClosingBalance] = useState(String(initial?.closing_balance ?? ''));
  const [notes,          setNotes]          = useState(initial?.notes ?? '');
  const [file,           setFile]           = useState<File | null>(null);
  const [fileError,      setFileError]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  // Auto-calculate closing balance
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
        file_url:        fileUrl,
        file_path:       filePath,
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
          <h2 className="text-base font-semibold text-slate-800">
            {initial ? 'Modifier le relevé' : 'Nouveau relevé bancaire'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

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

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm">
              {saving ? 'Sauvegarde…' : initial ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bank statement bar chart ──────────────────────────────────────────────────

function BankBarChart({ statements }: { statements: BankStatement[] }) {
  const data = MONTH_NAMES.map((name, i) => {
    const stmt = statements.find(s => s.month === i + 1);
    return { label: name.slice(0, 3), credit: stmt?.total_credit ?? 0, debit: stmt?.total_debit ?? 0 };
  });
  const max = Math.max(...data.flatMap(d => [d.credit, d.debit]), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 h-36 w-full">
        {data.map(({ label, credit, debit }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex items-end justify-center gap-px" style={{ height: '128px' }}>
              <div
                className="flex-1 rounded-t-sm hover:opacity-80 transition-all"
                style={{ height: `${Math.max((credit / max) * 100, credit > 0 ? 2 : 0)}%`, backgroundColor: '#059669' }}
                title={`Crédit: ${credit.toFixed(2)} DH`}
              />
              <div
                className="flex-1 rounded-t-sm hover:opacity-80 transition-all"
                style={{ height: `${Math.max((debit / max) * 100, debit > 0 ? 2 : 0)}%`, backgroundColor: '#dc2626' }}
                title={`Débit: ${debit.toFixed(2)} DH`}
              />
            </div>
            <span className="text-[9px] text-slate-400 leading-none">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-600" />
          <span className="text-xs text-slate-500">Crédit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-600" />
          <span className="text-xs text-slate-500">Débit</span>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MCard({
  icon, bg, label, value, cls = 'text-slate-800',
}: {
  icon:  ReactNode;
  bg:    string;
  label: string;
  value: string;
  cls?:  string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 sm:px-5 py-4 sm:py-5 flex items-start gap-3 sm:gap-4">
      <div className={`shrink-0 w-9 sm:w-10 h-9 sm:h-10 rounded-xl flex items-center justify-center ${bg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className={`text-base sm:text-lg font-bold mt-1 break-words leading-tight ${cls}`}>{value}</p>
      </div>
    </div>
  );
}

function FField({
  label, value, onChange, onBlur, type = 'text', step,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  onBlur?:  () => void;
  type?:    string;
  step?:    string;
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
