import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  TrendingUp, TrendingDown, AlertCircle, FileText,
  ShoppingCart, Plus, ArrowRight, Receipt, FileCheck, Truck,
  BarChart3, LineChart, PieChart, Sparkles,
} from 'lucide-react';
import type { Invoice, Achat, DocumentType } from './types';
import { getFactures } from './services/factureService';
import { getAchats } from './services/achatService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'today' | '7d' | '30d' | 'month' | 'trimester' | 'year' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',     label: "Aujourd'hui"       },
  { key: '7d',        label: '7 derniers jours'  },
  { key: '30d',       label: '30 derniers jours' },
  { key: 'month',     label: 'Ce mois'           },
  { key: 'trimester', label: 'Ce trimestre'      },
  { key: 'year',      label: 'Cette année'       },
  { key: 'custom',    label: 'Personnalisé'      },
];

const MONTH_LABELS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function getPeriodStart(period: Period, customFrom: string): Date | null {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today')     return today;
  if (period === '7d')        { const d = new Date(today); d.setDate(d.getDate() - 6);  return d; }
  if (period === '30d')       { const d = new Date(today); d.setDate(d.getDate() - 29); return d; }
  if (period === 'month')     return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'trimester') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  if (period === 'year')      return new Date(now.getFullYear(), 0, 1);
  if (period === 'custom' && customFrom) return new Date(customFrom);
  return null;
}

function getPeriodEnd(period: Period, customTo: string): Date | null {
  if (period === 'custom' && customTo) {
    const d = new Date(customTo);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return null;
}

function inPeriod(dateStr: string, period: Period, customFrom: string, customTo: string): boolean {
  if (!dateStr) return false;
  const date  = new Date(dateStr);
  const start = getPeriodStart(period, customFrom);
  const end   = getPeriodEnd(period, customTo);
  if (start && date < start) return false;
  if (end   && date > end)   return false;
  return true;
}

const DOC_COLOR: Record<DocumentType, { border: string; badge: string; text: string; label: string }> = {
  facture:       { border: '#7c3aed', badge: 'bg-violet-50 text-violet-700', text: 'text-violet-700', label: 'Facture' },
  devis:         { border: '#2563eb', badge: 'bg-blue-50 text-blue-700',     text: 'text-blue-700',   label: 'Devis'   },
  bon_livraison: { border: '#0d9488', badge: 'bg-teal-50 text-teal-700',     text: 'text-teal-700',   label: 'BL'      },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onGoList:   () => void;
  onGoAchats: () => void;
  onNewDoc:   (type: DocumentType) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard({ onGoList, onGoAchats, onNewDoc }: Props) {
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [achats,     setAchats]     = useState<Achat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [period,     setPeriod]     = useState<Period>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [inv, ach] = await Promise.all([getFactures(), getAchats()]);
        setInvoices(inv);
        setAchats(ach);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredInvoices = useMemo(
    () => invoices.filter(i => inPeriod(i.date, period, customFrom, customTo)),
    [invoices, period, customFrom, customTo],
  );
  const filteredAchats = useMemo(
    () => achats.filter(a => a.invoice_date && inPeriod(a.invoice_date, period, customFrom, customTo)),
    [achats, period, customFrom, customTo],
  );

  const metrics = useMemo(() => {
    const factures    = filteredInvoices.filter(i => i.documentType === 'facture' && i.status !== 'Annulée');
    const ca          = factures.reduce((s, i) => s + i.totalTTC, 0);
    const achatsTotal = filteredAchats.reduce((s, a) => s + a.amount_ttc, 0);
    const impayees    = filteredInvoices.filter(i =>
      i.documentType === 'facture' && (i.status === 'Générée' || i.status === 'Envoyée'),
    );
    return {
      ca,
      achatsTotal,
      benefice:       ca - achatsTotal,
      impayeesCount:  impayees.length,
      impayeesAmount: impayees.reduce((s, i) => s + i.totalTTC, 0),
      totalDocs:      filteredInvoices.length,
    };
  }, [filteredInvoices, filteredAchats]);

  // Previous equivalent period for trend badges
  const prevPeriodMetrics = useMemo(() => {
    if (period === 'custom') return null;
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let prevStart: Date, prevEnd: Date;
    if (period === 'today') {
      prevStart = new Date(today); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd   = new Date(prevStart); prevEnd.setHours(23, 59, 59, 999);
    } else if (period === '7d') {
      prevEnd   = new Date(today); prevEnd.setDate(prevEnd.getDate() - 7); prevEnd.setHours(23, 59, 59, 999);
      prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6); prevStart.setHours(0, 0, 0, 0);
    } else if (period === '30d') {
      prevEnd   = new Date(today); prevEnd.setDate(prevEnd.getDate() - 30); prevEnd.setHours(23, 59, 59, 999);
      prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 29); prevStart.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === 'trimester') {
      const q   = Math.floor(now.getMonth() / 3);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd   = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
    } else {
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    }
    const inPrev = (ds: string) => { if (!ds) return false; const d = new Date(ds); return d >= prevStart && d <= prevEnd; };
    const ca          = invoices.filter(i => i.documentType === 'facture' && i.status !== 'Annulée' && inPrev(i.date)).reduce((s, i) => s + i.totalTTC, 0);
    const achatsTotal = achats.filter(a => a.invoice_date && inPrev(a.invoice_date)).reduce((s, a) => s + a.amount_ttc, 0);
    return { ca, achatsTotal };
  }, [invoices, achats, period]);

  const caTrend     = prevPeriodMetrics && prevPeriodMetrics.ca > 0
    ? ((metrics.ca - prevPeriodMetrics.ca) / prevPeriodMetrics.ca) * 100 : null;
  const achatsTrend = prevPeriodMetrics && prevPeriodMetrics.achatsTotal > 0
    ? ((metrics.achatsTotal - prevPeriodMetrics.achatsTotal) / prevPeriodMetrics.achatsTotal) * 100 : null;

  const recentDocs = useMemo(
    () => [...filteredInvoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    [filteredInvoices],
  );
  const recentAchats = useMemo(
    () => [...filteredAchats].sort((a, b) => (b.invoice_date ?? '').localeCompare(a.invoice_date ?? '')).slice(0, 6),
    [filteredAchats],
  );

  // Rolling 12-month chart data
  const chart12M = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const ca = invoices
        .filter(inv =>
          inv.documentType === 'facture' && inv.status !== 'Annulée' &&
          inv.date.startsWith(`${y}-${String(m).padStart(2,'0')}`)
        )
        .reduce((s, inv) => s + inv.totalTTC, 0);
      const ach = achats
        .filter(a => a.invoice_date?.startsWith(`${y}-${String(m).padStart(2,'0')}`))
        .reduce((s, a) => s + a.amount_ttc, 0);
      return { label: MONTH_LABELS[d.getMonth()], ca, achats: ach };
    });
  }, [invoices, achats]);

  // Last non-zero month vs previous non-zero month for chart annotation
  const caInsight = useMemo(() => {
    const nz = chart12M.filter(d => d.ca > 0);
    if (nz.length < 2) return null;
    const last = nz[nz.length - 1], prev = nz[nz.length - 2];
    return { pct: ((last.ca - prev.ca) / prev.ca) * 100, month: last.label };
  }, [chart12M]);

  const achatInsight = useMemo(() => {
    const nz = chart12M.filter(d => d.achats > 0);
    if (nz.length < 2) return null;
    const last = nz[nz.length - 1], prev = nz[nz.length - 2];
    return { pct: ((last.achats - prev.achats) / prev.achats) * 100, month: last.label };
  }, [chart12M]);

  async function handleNewDoc(type: DocumentType) {
    setCreating(true);
    try { await onNewDoc(type); } finally { setCreating(false); }
  }

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tableau de bord</h1>
          <p className="text-sm text-slate-400 mt-0.5 capitalize">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <QuickNewBtn type="facture"       label="Facture" disabled={creating} onNew={handleNewDoc} primary />
          <QuickNewBtn type="devis"         label="Devis"   disabled={creating} onNew={handleNewDoc} />
          <QuickNewBtn type="bon_livraison" label="BL"      disabled={creating} onNew={handleNewDoc} />
        </div>
      </div>

      {/* ── Period selector ──────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                period === p.key
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 w-fit">
            <span className="text-sm text-slate-500 shrink-0">Du</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            <span className="text-sm text-slate-500 shrink-0">au</span>
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        )}
      </div>

      {/* ── KPI cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          <>
            <div className="sm:col-span-2 bg-violet-100 rounded-2xl h-36 animate-pulse" />
            <div className="bg-slate-100 rounded-2xl h-36 animate-pulse" />
            <div className="bg-slate-100 rounded-2xl h-36 animate-pulse" />
          </>
        ) : (
          <>
            {/* Hero — CA */}
            <div className="sm:col-span-2 relative overflow-hidden bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-5 sm:p-6 text-white shadow-lg shadow-violet-200/60 hover:shadow-xl hover:shadow-violet-200/70 transition-all duration-200 cursor-default">
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
              <div className="absolute right-4 -bottom-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
              <div className="relative">
                <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Chiffre d'affaires</p>
                <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                  <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-none">{fmt(metrics.ca)}</p>
                  <span className="text-lg font-semibold text-violet-300">DH</span>
                  {caTrend !== null && (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      caTrend >= 0 ? 'bg-emerald-400/25 text-emerald-200' : 'bg-red-400/25 text-red-200'
                    }`}>
                      {caTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {caTrend >= 0 ? '+' : ''}{caTrend.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-violet-400 mt-1">Factures non annulées</p>
                <div className="mt-4 pt-3.5 border-t border-violet-500/40 flex items-center gap-5 flex-wrap">
                  <div>
                    <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Bénéfice net</p>
                    <p className={`text-sm font-bold mt-0.5 ${metrics.benefice >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {metrics.benefice >= 0 ? '+' : ''}{fmt(metrics.benefice)} DH
                    </p>
                  </div>
                  <div className="w-px h-7 bg-violet-500/50" />
                  <div>
                    <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Achats</p>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <p className="text-sm font-bold text-white">{fmt(metrics.achatsTotal)} DH</p>
                      {achatsTrend !== null && (
                        <span className={`text-[10px] font-semibold ${achatsTrend >= 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                          {achatsTrend >= 0 ? '+' : ''}{achatsTrend.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Impayées */}
            <div className={`relative bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all duration-200 cursor-default ${
              metrics.impayeesCount > 0 ? 'border-amber-200' : 'border-slate-200'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                metrics.impayeesCount > 0 ? 'bg-amber-50' : 'bg-slate-50'
              }`}>
                <AlertCircle className={`w-5 h-5 ${metrics.impayeesCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Factures impayées</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${metrics.impayeesCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {metrics.impayeesCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {metrics.impayeesCount > 0 ? `${fmt(metrics.impayeesAmount)} DH en attente` : 'Aucune en attente'}
              </p>
            </div>

            {/* Documents */}
            <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all duration-200 cursor-default">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
                <FileText className="w-5 h-5 text-slate-500" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Documents</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{metrics.totalDocs}</p>
              <p className="text-xs text-slate-400 mt-1">Factures · Devis · BL</p>
            </div>
          </>
        )}
      </div>

      {/* ── Charts ───────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <ChartCard title="Chiffre d'affaires mensuel" subtitle="12 derniers mois" Icon={LineChart} insight={caInsight}>
          {loading ? <ChartSkeleton /> : (
            <BarChartSimple bars={chart12M.map(d => ({ label: d.label, value: d.ca }))} color="#7c3aed" />
          )}
        </ChartCard>

        <ChartCard title="Achats mensuels" subtitle="12 derniers mois" Icon={BarChart3} insight={achatInsight}>
          {loading ? <ChartSkeleton /> : (
            <BarChartSimple bars={chart12M.map(d => ({ label: d.label, value: d.achats }))} color="#2563eb" />
          )}
        </ChartCard>

        <ChartCard title="CA vs Achats" subtitle="12 derniers mois" Icon={PieChart} className="sm:col-span-2 xl:col-span-1">
          {loading ? <ChartSkeleton /> : (
            <BarChartDouble
              bars={chart12M.map(d => ({ label: d.label, a: d.ca, b: d.achats }))}
              colorA="#7c3aed" colorB="#2563eb" legendA="CA" legendB="Achats"
            />
          )}
        </ChartCard>
      </div>

      {/* ── Recent lists ─────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* Recent documents */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Documents récents</span>
              {!loading && (
                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md font-semibold">{recentDocs.length}</span>
              )}
            </div>
            <button onClick={onGoList} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Voir tout <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-5 sm:px-6 py-3.5 flex items-center gap-4 animate-pulse">
                  <div className="h-4 w-24 bg-slate-100 rounded shrink-0" />
                  <div className="flex-1 h-4 bg-slate-100 rounded" />
                  <div className="h-5 w-14 bg-slate-100 rounded shrink-0" />
                  <div className="h-4 w-20 bg-slate-100 rounded shrink-0 hidden sm:block" />
                </div>
              ))}
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 flex-1">
              <FileText className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Aucun document sur cette période</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              {recentDocs.map(inv => {
                const dc = DOC_COLOR[inv.documentType];
                const clientLine = inv.client.split('\n')[0].trim();
                return (
                  <div
                    key={inv.id}
                    className="flex items-center hover:bg-slate-50/70 transition-colors min-w-0"
                    style={{ borderLeft: `3px solid ${dc.border}` }}
                  >
                    <div className="flex-1 flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 min-w-0">
                      <span className={`shrink-0 font-mono text-xs font-bold w-24 truncate ${dc.text}`}>
                        {inv.number}
                      </span>
                      <span className="flex-1 text-sm text-slate-700 truncate min-w-0">
                        {clientLine || <span className="italic text-slate-400">Sans client</span>}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0 hidden md:block">
                        {dateFR(inv.date)}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md ${dc.badge}`}>
                        {dc.label}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-slate-800 hidden sm:block w-28 text-right tabular-nums">
                        {fmt(inv.totalTTC)} DH
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent achats */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Achats récents</span>
              {!loading && (
                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md font-semibold">{recentAchats.length}</span>
              )}
            </div>
            <button onClick={onGoAchats} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Voir tout <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-5 sm:px-6 py-3.5 flex items-center gap-4 animate-pulse">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg shrink-0" />
                  <div className="flex-1 h-4 bg-slate-100 rounded" />
                  <div className="h-4 w-20 bg-slate-100 rounded shrink-0" />
                </div>
              ))}
            </div>
          ) : recentAchats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 flex-1">
              <ShoppingCart className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Aucun achat sur cette période</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentAchats.map(a => (
                <div key={a.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3 hover:bg-slate-50/70 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.supplier_name || '—'}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{a.category || 'Sans catégorie'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-blue-700 tabular-nums">{fmt(a.amount_ttc)} DH</p>
                    <p className="text-xs text-slate-400 mt-0.5">{dateFR(a.invoice_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI banner ────────────────────────────────────── */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3.5">
        <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
        </div>
        <p className="text-sm text-slate-600 flex-1 min-w-0">
          <span className="font-semibold text-slate-700">Résumé IA</span>
          {' — '}Analyse automatique de votre activité financière, prévisions et anomalies.
        </p>
        <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 font-semibold">
          Bientôt
        </span>
      </div>

    </div>
  );
}

// ── Bar chart (single series) ─────────────────────────────────────────────────

function BarChartSimple({ bars, color }: { bars: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div className="flex items-end gap-0.5 sm:gap-1 h-40 w-full px-1">
      {bars.map(({ label, value }) => {
        const pct = (value / max) * 100;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-800 text-white text-[10px] px-1.5 py-1 rounded-md whitespace-nowrap z-10 shadow-lg">
              {fmtShort(value)} DH
            </div>
            <div className="w-full flex items-end" style={{ height: '128px' }}>
              <div
                className="w-full rounded-t transition-all duration-150 group-hover:opacity-70"
                style={{
                  height:          `${Math.max(pct, value > 0 ? 2 : 0)}%`,
                  backgroundColor: color,
                  minHeight:       value > 0 ? '3px' : '0',
                }}
              />
            </div>
            <span className="text-[8px] sm:text-[9px] text-slate-400 leading-none truncate w-full text-center">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Bar chart (dual series) ───────────────────────────────────────────────────

function BarChartDouble({
  bars, colorA, colorB, legendA, legendB,
}: {
  bars:    { label: string; a: number; b: number }[];
  colorA:  string;
  colorB:  string;
  legendA: string;
  legendB: string;
}) {
  const max = Math.max(...bars.flatMap(b => [b.a, b.b]), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-0.5 sm:gap-1 h-36 w-full px-1">
        {bars.map(({ label, a, b }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5 group">
            <div className="w-full flex items-end gap-px" style={{ height: '112px' }}>
              <div
                className="flex-1 rounded-t group-hover:opacity-70 transition-all duration-150"
                style={{ height: `${Math.max((a / max) * 100, a > 0 ? 2 : 0)}%`, backgroundColor: colorA, minHeight: a > 0 ? '2px' : '0' }}
                title={`CA: ${fmtShort(a)} DH`}
              />
              <div
                className="flex-1 rounded-t group-hover:opacity-70 transition-all duration-150"
                style={{ height: `${Math.max((b / max) * 100, b > 0 ? 2 : 0)}%`, backgroundColor: colorB, minHeight: b > 0 ? '2px' : '0' }}
                title={`Achats: ${fmtShort(b)} DH`}
              />
            </div>
            <span className="text-[8px] sm:text-[9px] text-slate-400 leading-none truncate w-full text-center">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colorA }} />
          <span className="text-xs text-slate-500">{legendA}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colorB }} />
          <span className="text-xs text-slate-500">{legendB}</span>
        </div>
      </div>
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, Icon, children, className = '', insight,
}: {
  title:     string;
  subtitle:  string;
  Icon:      React.ElementType;
  children:  ReactNode;
  className?: string;
  insight?:  { pct: number; month: string } | null;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xs text-slate-400">{subtitle}</span>
          {insight && (
            <span className={`text-[10px] font-semibold ${insight.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {insight.pct >= 0 ? '+' : ''}{insight.pct.toFixed(1)}% vs mois préc.
            </span>
          )}
        </div>
      </div>
      <div className="px-4 sm:px-5 py-5">
        {children}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex items-end gap-1 h-40 animate-pulse">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="flex-1 bg-slate-100 rounded-t" style={{ height: `${20 + Math.random() * 60}%` }} />
      ))}
    </div>
  );
}

// ── Quick new button ──────────────────────────────────────────────────────────

function QuickNewBtn({
  type, label, disabled, onNew, primary = false,
}: {
  type:     DocumentType;
  label:    string;
  disabled: boolean;
  onNew:    (type: DocumentType) => void;
  primary?: boolean;
}) {
  const Icon = type === 'bon_livraison' ? Truck : type === 'devis' ? FileCheck : Receipt;
  return (
    <button
      onClick={() => onNew(type)}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[40px] text-sm font-medium rounded-lg transition-all disabled:opacity-60 ${
        primary
          ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200'
          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
      }`}
    >
      <Plus className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      <Icon className="w-3.5 h-3.5 sm:hidden" />
    </button>
  );
}
