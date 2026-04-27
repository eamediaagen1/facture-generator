import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  TrendingUp, TrendingDown, AlertCircle, FileText,
  ShoppingCart, Plus, ArrowRight, Receipt, FileCheck, Truck,
  BarChart3, LineChart, PieChart, Sparkles, Clock,
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

const DOC_BADGE: Record<DocumentType, { label: string; cls: string }> = {
  facture:       { label: 'Facture', cls: 'bg-violet-50 text-violet-700' },
  devis:         { label: 'Devis',   cls: 'bg-blue-50 text-blue-700'    },
  bon_livraison: { label: 'BL',      cls: 'bg-teal-50 text-teal-700'    },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onGoList:   () => void;
  onGoAchats: () => void;
  onNewDoc:   (type: DocumentType) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard({ onGoList, onGoAchats, onNewDoc }: Props) {
  const [invoices,    setInvoices]    = useState<Invoice[]>([]);
  const [achats,      setAchats]      = useState<Achat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [period,      setPeriod]      = useState<Period>('year');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');

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

  // Filtered data for metrics + recent lists
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
      impayeesCount:  impayees.length,
      impayeesAmount: impayees.reduce((s, i) => s + i.totalTTC, 0),
      totalDocs:      filteredInvoices.length,
    };
  }, [filteredInvoices, filteredAchats]);

  const recentDocs   = useMemo(() => filteredInvoices.slice(0, 8), [filteredInvoices]);
  const recentAchats = useMemo(() => filteredAchats.slice(0, 6),   [filteredAchats]);

  // Rolling 12-month chart data (always shows last 12 months for trend context)
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

  async function handleNewDoc(type: DocumentType) {
    setCreating(true);
    try { await onNewDoc(type); } finally { setCreating(false); }
  }

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 w-full max-w-[1600px] mx-auto">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tableau de bord</h1>
          <p className="text-sm text-slate-400 mt-0.5 capitalize">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <QuickNewBtn type="facture"       label="Facture" disabled={creating} onNew={handleNewDoc} />
          <QuickNewBtn type="devis"         label="Devis"   disabled={creating} onNew={handleNewDoc} />
          <QuickNewBtn type="bon_livraison" label="BL"      disabled={creating} onNew={handleNewDoc} />
        </div>
      </div>

      {/* ── Period selector ──────────────────────────────────────── */}
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
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <span className="text-sm text-slate-500 shrink-0">au</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        )}
      </div>

      {/* ── Metric cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm h-28 animate-pulse" />
          ))
        ) : (
          <>
            <MetricCard
              icon={<TrendingUp className="w-5 h-5 text-violet-500" />}
              iconBg="bg-violet-50"
              label="Chiffre d'affaires"
              value={`${fmt(metrics.ca)} DH`}
              valueClass="text-violet-700"
              sub="Factures non annulées"
            />
            <MetricCard
              icon={<TrendingDown className="w-5 h-5 text-blue-500" />}
              iconBg="bg-blue-50"
              label="Total achats"
              value={`${fmt(metrics.achatsTotal)} DH`}
              valueClass="text-blue-700"
              sub="Toutes dépenses fournisseurs"
            />
            <MetricCard
              icon={<AlertCircle className="w-5 h-5 text-amber-500" />}
              iconBg="bg-amber-50"
              label="Factures impayées"
              value={String(metrics.impayeesCount)}
              valueClass="text-amber-700"
              sub={metrics.impayeesCount > 0
                ? `${fmt(metrics.impayeesAmount)} DH en attente`
                : 'Aucune en attente'}
            />
            <MetricCard
              icon={<FileText className="w-5 h-5 text-slate-500" />}
              iconBg="bg-slate-50"
              label="Documents"
              value={String(metrics.totalDocs)}
              sub="Factures · Devis · BL"
            />
          </>
        )}
      </div>

      {/* ── Charts (rolling 12 months) ───────────────────────────── */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <ChartCard
          title="Chiffre d'affaires mensuel"
          subtitle="12 derniers mois"
          Icon={LineChart}
        >
          {loading ? <ChartSkeleton /> : (
            <BarChartSimple
              bars={chart12M.map(d => ({ label: d.label, value: d.ca }))}
              color="#7c3aed"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Achats mensuels"
          subtitle="12 derniers mois"
          Icon={BarChart3}
        >
          {loading ? <ChartSkeleton /> : (
            <BarChartSimple
              bars={chart12M.map(d => ({ label: d.label, value: d.achats }))}
              color="#2563eb"
            />
          )}
        </ChartCard>

        <ChartCard
          title="CA vs Achats"
          subtitle="12 derniers mois"
          Icon={PieChart}
          className="sm:col-span-2 xl:col-span-1"
        >
          {loading ? <ChartSkeleton /> : (
            <BarChartDouble
              bars={chart12M.map(d => ({ label: d.label, a: d.ca, b: d.achats }))}
              colorA="#7c3aed"
              colorB="#2563eb"
              legendA="CA"
              legendB="Achats"
            />
          )}
        </ChartCard>
      </div>

      {/* ── Recent lists ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* Recent documents */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Documents récents</span>
              {!loading && <span className="text-xs text-slate-400">({recentDocs.length})</span>}
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
                  <div className="h-5 w-14 bg-slate-100 rounded-full shrink-0" />
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
                const badge      = DOC_BADGE[inv.documentType];
                const clientLine = inv.client.split('\n')[0].trim();
                return (
                  <div key={inv.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors min-w-0">
                    <span className={`shrink-0 font-mono text-xs font-bold w-28 truncate ${
                      inv.documentType === 'bon_livraison' ? 'text-teal-700' :
                      inv.documentType === 'devis'         ? 'text-blue-700' : 'text-slate-700'
                    }`}>
                      {inv.number}
                    </span>
                    <span className="flex-1 text-sm text-slate-700 truncate min-w-0">
                      {clientLine || <span className="italic text-slate-400">Sans client</span>}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0 hidden md:block">
                      {dateFR(inv.date)}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-slate-800 hidden sm:block w-28 text-right">
                      {fmt(inv.totalTTC)} DH
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent achats */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Achats récents</span>
              {!loading && <span className="text-xs text-slate-400">({recentAchats.length})</span>}
            </div>
            <button onClick={onGoAchats} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Voir tout <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-5 sm:px-6 py-3.5 flex items-center gap-4 animate-pulse">
                  <div className="flex-1 h-4 bg-slate-100 rounded" />
                  <div className="h-4 w-20 bg-slate-100 rounded" />
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
                <div key={a.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.supplier_name || '—'}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{a.category || 'Sans catégorie'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-800">{fmt(a.amount_ttc)} DH</p>
                    <p className="text-xs text-slate-400 mt-0.5">{dateFR(a.invoice_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI summary ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-700">Résumé IA</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">Bientôt</span>
        </div>
        <div className="px-5 sm:px-6 py-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-violet-400" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-700">Analyse IA de votre activité</p>
            <p className="text-sm text-slate-400 mt-1 max-w-lg">
              Bientôt disponible : résumé automatique de votre performance financière, détection d'anomalies, prévisions et recommandations basées sur vos données.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 border border-slate-200 px-3 py-1.5 rounded-full shrink-0 ml-auto">
            <Clock className="w-3.5 h-3.5" />
            Prochainement
          </span>
        </div>
      </div>

    </div>
  );
}

// ── Bar chart (single series) ─────────────────────────────────────────────────

function BarChartSimple({ bars, color }: { bars: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div className="flex items-end gap-0.5 sm:gap-1 h-32 w-full px-1">
      {bars.map(({ label, value }) => {
        const pct = (value / max) * 100;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {fmtShort(value)} DH
            </div>
            <div className="w-full flex items-end" style={{ height: '112px' }}>
              <div
                className="w-full rounded-t-sm transition-all duration-200 hover:opacity-80"
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
      <div className="flex items-end gap-0.5 sm:gap-1 h-28 w-full px-1">
        {bars.map(({ label, a, b }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex items-end gap-px" style={{ height: '100px' }}>
              <div
                className="flex-1 rounded-t-sm hover:opacity-80 transition-all"
                style={{ height: `${Math.max((a / max) * 100, a > 0 ? 2 : 0)}%`, backgroundColor: colorA, minHeight: a > 0 ? '2px' : '0' }}
                title={`CA: ${fmtShort(a)} DH`}
              />
              <div
                className="flex-1 rounded-t-sm hover:opacity-80 transition-all"
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
  title, subtitle, Icon, children, className = '',
}: {
  title:     string;
  subtitle:  string;
  Icon:      React.ElementType;
  children:  ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        {children}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex items-end gap-1 h-32 animate-pulse">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="flex-1 bg-slate-100 rounded-t-sm" style={{ height: `${20 + Math.random() * 60}%` }} />
      ))}
    </div>
  );
}

// ── Quick new button ──────────────────────────────────────────────────────────

function QuickNewBtn({
  type, label, disabled, onNew,
}: {
  type:     DocumentType;
  label:    string;
  disabled: boolean;
  onNew:    (type: DocumentType) => void;
}) {
  const Icon = type === 'bon_livraison' ? Truck : type === 'devis' ? FileCheck : Receipt;
  return (
    <button
      onClick={() => onNew(type)}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[40px] bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
    >
      <Plus className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      <Icon className="w-3.5 h-3.5 sm:hidden" />
    </button>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  icon, iconBg, label, value, valueClass, sub,
}: {
  icon:        ReactNode;
  iconBg?:     string;
  label:       string;
  value:       string;
  valueClass?: string;
  sub?:        string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 flex items-start gap-4">
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5 ${iconBg ?? 'bg-slate-50'}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className={`text-lg sm:text-xl font-bold tracking-tight mt-1 break-words leading-tight ${valueClass ?? 'text-slate-800'}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
