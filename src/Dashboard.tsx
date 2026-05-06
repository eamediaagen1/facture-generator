import { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp, AlertCircle, FileText,
  ShoppingCart, Plus, ArrowRight, Receipt, FileCheck, Truck,
  PieChart, Sparkles, Clock, CheckCircle, Upload, X, Send,
} from 'lucide-react';
import type { Invoice, Achat, DocumentType, InvoiceDraftPrefill, Client } from './types';
import { getFactures } from './services/factureService';
import { getAchats } from './services/achatService';
import { getClients } from './services/clientService';
import { extractInvoiceDraftWithAI, extractAchatFromFile } from './services/achatAIService';
import { detectIntent } from './services/quickActionAIRouter';
import { ENABLE_AI_DOCUMENT_CREATION } from './config';
import { getQuickAIEnabled } from './services/companySettingsService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'all' | 'today' | 'month' | 'trimester' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',       label: 'Tout'              },
  { key: 'today',     label: "Aujourd'hui"       },
  { key: 'month',     label: 'Ce mois'           },
  { key: 'trimester', label: 'Ce trimestre'      },
  { key: 'custom',    label: 'Personnalisé'      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function matchClient(query: string, clients: Client[]): Client | null {
  if (!query.trim() || !clients.length) return null;
  const q = norm(query);
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  let best: { client: Client; score: number } | null = null;
  for (const c of clients) {
    const n = norm(c.name);
    let score = 0;
    if (n === q)                             score = 1000;
    else if (n.includes(q) || q.includes(n)) score = 100;
    else {
      const hits = words.filter(w => n.includes(w)).length;
      if (hits > 0) score = hits * 20 - Math.abs(n.length - q.length) * 0.1;
    }
    if (score > 0 && (!best || score > best.score)) best = { client: c, score };
  }
  return best?.client ?? null;
}

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
  if (period === 'month')     return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'trimester') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
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
  onGoList:              () => void;
  onGoAchats:            () => void;
  onNewDoc:              (type: DocumentType) => Promise<void>;
  onNewDocWithPrefill:   (type: DocumentType, prefill: InvoiceDraftPrefill) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard({ onGoList, onGoAchats, onNewDoc, onNewDocWithPrefill }: Props) {
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [achats,     setAchats]     = useState<Achat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [period,     setPeriod]     = useState<Period>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  // Inline AI bar
  const [quickAIEnabled] = useState(() => getQuickAIEnabled());
  const [aiPrompt,   setAiPrompt]   = useState('');
  const [aiFile,     setAiFile]     = useState<File | null>(null);
  const [aiStage,    setAiStage]    = useState<'idle' | 'processing' | 'error'>('idle');
  const [aiError,    setAiError]    = useState('');
  const aiFileRef = useRef<HTMLInputElement>(null);

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
    const collected   = filteredInvoices.filter(i =>
      i.documentType === 'facture' && i.status === 'Payée',
    );
    return {
      ca,
      achatsTotal,
      benefice:       ca - achatsTotal,
      impayeesCount:  impayees.length,
      impayeesAmount: impayees.reduce((s, i) => s + i.totalTTC, 0),
      collectedAmount: collected.reduce((s, i) => s + i.totalTTC, 0),
      totalDocs:      filteredInvoices.length,
    };
  }, [filteredInvoices, filteredAchats]);

  // Previous equivalent period for trend badges
  const prevPeriodMetrics = useMemo(() => {
    if (period === 'all' || period === 'custom') return null;
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let prevStart: Date, prevEnd: Date;
    if (period === 'today') {
      prevStart = new Date(today); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd   = new Date(prevStart); prevEnd.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      const q   = Math.floor(now.getMonth() / 3);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd   = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
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

  // Donut: invoice payment status breakdown
  const donutData = useMemo(() => {
    const factures   = filteredInvoices.filter(i => i.documentType === 'facture');
    const payees     = factures.filter(i => i.status === 'Payée');
    const enAttente  = factures.filter(i => i.status === 'Générée' || i.status === 'Envoyée');
    const annulees   = factures.filter(i => i.status === 'Annulée');
    const tPayees    = payees.reduce((s, i) => s + i.totalTTC, 0);
    const tAttente   = enAttente.reduce((s, i) => s + i.totalTTC, 0);
    const tAnnulees  = annulees.reduce((s, i) => s + i.totalTTC, 0);
    const total      = tPayees + tAttente + tAnnulees;
    return {
      total,
      pctCollected: total > 0 ? (tPayees / total) * 100 : 0,
      segments: [
        { key: 'payees',    label: 'Payées',      value: tPayees,   count: payees.length,    color: '#10b981', textColor: 'text-emerald-600' },
        { key: 'attente',   label: 'En attente',  value: tAttente,  count: enAttente.length, color: '#f59e0b', textColor: 'text-amber-500'   },
        { key: 'annulees',  label: 'Annulées',    value: tAnnulees, count: annulees.length,  color: '#cbd5e1', textColor: 'text-slate-400'   },
      ],
    };
  }, [filteredInvoices]);

  async function handleNewDoc(type: DocumentType) {
    setCreating(true);
    try { await onNewDoc(type); } finally { setCreating(false); }
  }

  async function handleAISubmit() {
    if (aiStage === 'processing') return;
    const intent = detectIntent(aiPrompt, aiFile?.name ?? '');
    if (intent.intent === 'unknown') {
      setAiError("Demande non reconnue. Essayez : « Créer facture pour... », « Convertir devis DEV-001 en facture », ou « Importer achat »");
      setAiStage('error');
      return;
    }
    setAiError('');
    setAiStage('processing');
    try {
      if (intent.intent === 'convert_devis') {
        const rawNum = intent.devisNumber ?? '';
        // Find the devis — try exact match then partial
        const allDocs = await getFactures();
        const devis = allDocs.find(d =>
          d.documentType === 'devis' &&
          (d.number.toUpperCase() === rawNum || d.number.toUpperCase().includes(rawNum))
        );
        if (!devis) {
          setAiError(`Devis « ${rawNum} » introuvable.`);
          setAiStage('error');
          return;
        }
        const prefill: InvoiceDraftPrefill = {
          client:           devis.client,
          clientId:         devis.clientId,
          items:            devis.items,
          sourceDocumentId: devis.id,
        };
        setAiPrompt('');
        setAiFile(null);
        setAiStage('idle');
        await onNewDocWithPrefill('facture', prefill);

      } else if (intent.intent === 'create_document') {
        const resolvedDocType = intent.documentType ?? 'facture';
        const [prefill, clients] = await Promise.all([
          extractInvoiceDraftWithAI({ docType: resolvedDocType, text: aiPrompt }),
          getClients(),
        ]);
        if (prefill.client) {
          const found = matchClient(prefill.client, clients);
          if (found) {
            prefill.clientId = found.id;
            prefill.client = [
              found.name,
              [found.address, found.city].filter(Boolean).join(', '),
              found.ice ? `ICE : ${found.ice}` : '',
            ].filter(Boolean).join('\n');
          }
        }
        await onNewDocWithPrefill(resolvedDocType, prefill);

      } else if (intent.intent === 'import_achat') {
        if (!aiFile) {
          setAiError('Joignez un fichier pour importer un achat.');
          setAiStage('error');
          return;
        }
        await extractAchatFromFile(aiFile);
        setAiPrompt('');
        setAiFile(null);
        setAiStage('idle');
        getAchats().then(setAchats);
      }
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Erreur lors du traitement.');
      setAiStage('error');
    }
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

      {/* ── ALERT: Unpaid invoices (Problems section) ─────── */}
      {!loading && metrics.impayeesCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <AlertCircle className="w-6 h-6 text-red-600 mt-0.5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-red-700 mb-1">
                {metrics.impayeesCount} facture{metrics.impayeesCount > 1 ? 's' : ''} impayée{metrics.impayeesCount > 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-red-600 mb-3">
                {fmt(metrics.impayeesAmount)} DH en attente de paiement
              </p>
              <button onClick={onGoList} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                Voir les factures impayées
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI cards (Money section) ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <div className="bg-slate-100 rounded-2xl h-36 animate-pulse" />
            <div className="bg-slate-100 rounded-2xl h-36 animate-pulse" />
            <div className="bg-slate-100 rounded-2xl h-36 animate-pulse" />
          </>
        ) : (
          <>
            {/* Revenue */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-violet-600" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Chiffre d'affaires</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
                {fmt(metrics.ca)} <span className="text-base font-semibold text-slate-400">DH</span>
              </p>
              {caTrend !== null && (
                <p className={`text-xs mt-2 font-medium ${caTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {caTrend >= 0 ? '↑' : '↓'} {Math.abs(caTrend).toFixed(1)}% vs période préc.
                </p>
              )}
            </div>

            {/* Pending amount */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">À encaisser</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums mt-1">
                {fmt(metrics.impayeesAmount)} <span className="text-base font-semibold text-amber-400">DH</span>
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {metrics.impayeesCount} facture{metrics.impayeesCount !== 1 ? 's' : ''} en attente
              </p>
            </div>

            {/* Collections */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Encaissements</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums mt-1">
                {fmt(metrics.collectedAmount)} <span className="text-base font-semibold text-emerald-400">DH</span>
              </p>
              <p className="text-xs text-slate-400 mt-2">Factures payées</p>
            </div>
          </>
        )}
      </div>

      {/* ── Quick AI inline bar ──────────────────────────── */}
      {ENABLE_AI_DOCUMENT_CREATION && quickAIEnabled && (
        <div className="space-y-2">
          <div className={`flex items-center gap-3 bg-white rounded-2xl border shadow-sm px-4 py-3 transition-all ${
            aiStage === 'error'
              ? 'border-red-300'
              : 'border-slate-200 focus-within:border-violet-300 focus-within:shadow-md'
          }`}>

            {/* Icon / spinner */}
            <div className="shrink-0 w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              {aiStage === 'processing'
                ? <div className="w-4 h-4 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                : <Sparkles className="w-4 h-4 text-violet-500" />}
            </div>

            {/* Text input */}
            <input
              type="text"
              value={aiPrompt}
              onChange={e => { setAiPrompt(e.target.value); if (aiStage === 'error') setAiStage('idle'); setAiError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleAISubmit(); }}
              placeholder="Créer une facture, importer un achat, analyser un document…"
              disabled={aiStage === 'processing'}
              className="flex-1 text-sm text-slate-700 placeholder-slate-400 bg-transparent outline-none disabled:opacity-50 min-w-0 py-1"
            />

            {/* File chip */}
            {aiFile && (
              <div className="shrink-0 hidden sm:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg px-2 py-1 max-w-[140px]">
                <span className="truncate">{aiFile.name}</span>
                <button onClick={() => setAiFile(null)} className="text-slate-400 hover:text-slate-700 shrink-0 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={() => aiFileRef.current?.click()}
              title="Joindre un fichier"
              disabled={aiStage === 'processing'}
              className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Submit */}
            <button
              onClick={handleAISubmit}
              disabled={aiStage === 'processing' || (!aiPrompt.trim() && !aiFile)}
              className="shrink-0 w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>

            <input
              ref={aiFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setAiFile(f); setAiError(''); setAiStage('idle'); }
              }}
            />
          </div>

          {/* Error */}
          {aiError && (
            <p className="text-xs text-red-600 px-1">{aiError}</p>
          )}
        </div>
      )}

      {/* ── Chart + Recent documents (side by side) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent documents */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
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
                <div key={i} className="grid grid-cols-12 gap-2 px-4 sm:px-5 py-3 items-center h-12 animate-pulse border-l-4 border-slate-100">
                  <div className="col-span-2 h-3 bg-slate-100 rounded" />
                  <div className="col-span-7 md:col-span-4 h-3 bg-slate-100 rounded" />
                  <div className="hidden md:block md:col-span-2 h-3 bg-slate-100 rounded" />
                  <div className="col-span-3 md:col-span-2 h-3 bg-slate-100 rounded" />
                  <div className="hidden md:block md:col-span-2 h-3 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 flex-1 min-h-96">
              <FileText className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Aucun document sur cette période</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDocs.map(inv => {
                const dc = DOC_COLOR[inv.documentType];
                const clientLine = inv.client.split('\n')[0].trim();
                return (
                  <div
                    key={inv.id}
                    className="grid grid-cols-12 gap-2 px-4 sm:px-5 py-3 items-center h-12 hover:bg-slate-50/70 transition-colors text-sm"
                    style={{ borderLeft: `4px solid ${dc.border}` }}
                  >
                    {/* Number: 2 cols */}
                    <span className={`col-span-2 font-mono font-bold text-xs truncate ${dc.text}`} title={inv.number}>
                      {inv.number}
                    </span>

                    {/* Client: 7 cols mobile / 4 cols desktop */}
                    <span className="col-span-7 md:col-span-4 text-slate-700 text-sm truncate" title={clientLine}>
                      {clientLine || <span className="italic text-slate-400">—</span>}
                    </span>

                    {/* Date: 2 cols, desktop only */}
                    <span className="hidden md:block md:col-span-2 text-xs text-slate-400 text-center">
                      {dateFR(inv.date)}
                    </span>

                    {/* Type badge: 3 cols mobile / 2 cols desktop */}
                    <span className={`col-span-3 md:col-span-2 text-xs font-semibold px-1.5 py-1 rounded text-center whitespace-nowrap ${dc.badge}`}>
                      {dc.label}
                    </span>

                    {/* Amount: 2 cols, desktop only */}
                    <span className="hidden md:block md:col-span-2 text-slate-800 text-right tabular-nums font-semibold text-sm">
                      {fmt(inv.totalTTC)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Donut */}
        <div className="lg:col-span-1 self-stretch flex flex-col">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">État des factures</span>
              </div>
              <span className="text-xs text-slate-400">Période sélectionnée</span>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8">
              {loading ? (
                <DonutSkeleton />
              ) : (
                <>
                  <DonutChart
                    segments={donutData.segments}
                    centerLabel={donutData.total > 0 ? 'collecté' : 'aucune donnée'}
                    centerValue={donutData.total > 0 ? `${Math.round(donutData.pctCollected)}%` : '—'}
                  />

                  {/* Legend */}
                  <div className="w-full space-y-3">
                    {donutData.segments.map(seg => (
                      <div key={seg.key} className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
                        <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{seg.label}</span>
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${seg.textColor}`}>
                          {fmtShort(seg.value)} DH
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0 w-10 text-right">
                          {seg.count} fac.
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Total row */}
                  {donutData.total > 0 && (
                    <div className="w-full pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Total facturé</span>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">{fmtShort(donutData.total)} DH</span>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Recent achats ────────────────────────────────── */}
      <div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
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

    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────

function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments:    { key: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const SIZE  = 172;
  const cx    = SIZE / 2;
  const cy    = SIZE / 2;
  const outerR = 72;
  const innerR = 50;
  const r      = (outerR + innerR) / 2;
  const sw     = outerR - innerR;
  const circ   = 2 * Math.PI * r;

  const total  = segments.reduce((s, seg) => s + seg.value, 0);
  const active = segments.filter(s => s.value > 0);
  const gapLen = active.length > 1 ? 4 : 0;

  let cumFrac = 0;

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
        ) : (
          active.map(seg => {
            const pct    = seg.value / total;
            const segLen = Math.max(pct * circ - gapLen, 1);
            const offset = circ * (0.25 - cumFrac);
            cumFrac += pct;
            return (
              <circle
                key={seg.key}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={sw}
                strokeDasharray={`${segLen} ${circ}`}
                strokeDashoffset={offset}
              />
            );
          })
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <span className="text-[10px] text-slate-400 font-medium leading-none">{centerLabel}</span>
        <span className="text-2xl font-bold text-slate-800 tabular-nums leading-tight mt-0.5">{centerValue}</span>
      </div>
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="w-[172px] h-[172px] rounded-full border-[22px] border-slate-100 animate-pulse" />
      <div className="w-full space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-100 shrink-0" />
            <div className="flex-1 h-3 bg-slate-100 rounded" />
            <div className="w-14 h-3 bg-slate-100 rounded shrink-0" />
          </div>
        ))}
      </div>
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
