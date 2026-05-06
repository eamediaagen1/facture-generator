import { useState, useMemo } from 'react';
import {
  FileText, Download, ExternalLink, FolderOpen, Loader2, FileX,
} from 'lucide-react';
import type { Achat } from './types';
import { exportAchatsTrimesterZip } from './services/exportService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTrimesterFromDate(date: string): 1 | 2 | 3 | 4 {
  const m = parseInt(date.slice(5, 7), 10);
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

function filterAchatsByTrimester(achats: Achat[], year: string, trim: 1 | 2 | 3 | 4): Achat[] {
  return achats.filter(a => {
    if (!a.invoice_date) return false;
    if (!a.invoice_date.startsWith(year)) return false;
    return getTrimesterFromDate(a.invoice_date) === trim;
  });
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function fileName(url: string | null, path: string | null): string {
  const src = path ?? url ?? '';
  return src.split('/').pop()?.split('?')[0] ?? '';
}

// ── Trimester metadata ────────────────────────────────────────────────────────

const TRIMS = [
  { n: 1 as const, label: 'T1', months: 'Janvier — Mars',      accent: 'bg-blue-50 border-blue-200',    badge: 'bg-blue-100 text-blue-700' },
  { n: 2 as const, label: 'T2', months: 'Avril — Juin',         accent: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  { n: 3 as const, label: 'T3', months: 'Juillet — Septembre',  accent: 'bg-amber-50 border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  { n: 4 as const, label: 'T4', months: 'Octobre — Décembre',   accent: 'bg-violet-50 border-violet-200', badge: 'bg-violet-100 text-violet-700' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  achats:  Achat[];
  loading: boolean;
  onView:  (id: string) => void;
}

export default function AchatDocumentsView({ achats, loading, onView }: Props) {
  const currentYear = String(new Date().getFullYear());

  const years = useMemo(() => {
    const set = new Set(achats.map(a => a.invoice_date?.slice(0, 4)).filter(Boolean) as string[]);
    const list = Array.from(set).sort().reverse();
    if (!list.includes(currentYear)) list.unshift(currentYear);
    return list;
  }, [achats, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [openTrim,     setOpenTrim]     = useState<1 | 2 | 3 | 4 | null>(null);
  const [exporting,    setExporting]    = useState<1 | 2 | 3 | 4 | null>(null);

  async function handleExport(trim: 1 | 2 | 3 | 4) {
    setExporting(trim);
    try {
      await exportAchatsTrimesterZip(Number(selectedYear) as number, trim);
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Year selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Année :</span>
        <div className="flex flex-wrap gap-2">
          {years.map(y => (
            <button
              key={y}
              onClick={() => { setSelectedYear(y); setOpenTrim(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                selectedYear === y
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Trimester cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TRIMS.map(t => {
          const rows = filterAchatsByTrimester(achats, selectedYear, t.n);
          const withFile = rows.filter(a => a.file_url);
          const isOpen   = openTrim === t.n;

          return (
            <div key={t.n} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Card header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${t.accent}`}>
                <button
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                  onClick={() => setOpenTrim(isOpen ? null : t.n)}
                >
                  <FolderOpen className="w-5 h-5 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{t.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.badge}`}>
                        {rows.length} achat{rows.length !== 1 ? 's' : ''}
                      </span>
                      {withFile.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          {withFile.length} doc{withFile.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.months}</p>
                  </div>
                </button>

                <button
                  onClick={() => handleExport(t.n)}
                  disabled={exporting === t.n}
                  title={`Exporter ${t.label}`}
                  className="ml-2 shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg transition-all disabled:opacity-60"
                >
                  {exporting === t.n
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />
                  }
                  <span className="hidden sm:inline">Exporter {t.label}</span>
                  <span className="sm:hidden">{t.label}</span>
                </button>
              </div>

              {/* Expanded document list */}
              {isOpen && (
                <div>
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                      <FileX className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">Aucun achat pour {t.label} {selectedYear}</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {rows.map(a => {
                        const fname = fileName(a.file_url, a.file_path);
                        return (
                          <li key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                            <div className="shrink-0">
                              {a.file_url
                                ? <FileText className="w-5 h-5 text-slate-400" />
                                : <FileX className="w-5 h-5 text-slate-200" />
                              }
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-800 truncate max-w-[160px]">
                                  {a.supplier_name || '—'}
                                </span>
                                <span className="text-xs text-slate-400 shrink-0">{dateFR(a.invoice_date)}</span>
                                {a.supplier_invoice_number && (
                                  <span className="text-xs font-mono text-slate-500 shrink-0">
                                    {a.supplier_invoice_number}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="text-xs font-semibold text-slate-700">
                                  {fmt(a.amount_ttc)} DH TTC
                                </span>
                                {fname && (
                                  <span className="text-xs text-slate-400 truncate max-w-[160px]" title={fname}>
                                    {fname}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1">
                              {a.file_url && (
                                <a
                                  href={a.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Voir document"
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => onView(a.id)}
                                title="Voir détails"
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
