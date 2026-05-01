import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Printer, FileText, ArrowLeft, Save, LogOut, Stamp, X, AlertTriangle } from 'lucide-react';
import { numberToFrenchWords } from './numberToWords';
import type { Invoice, InvoiceStatus, LineItem, DocumentType, Client, InvoiceDraftPrefill } from './types';
import { getFacture, upsertFacture, updatePdfPath } from './services/factureService';
import { getClients } from './services/clientService';
import { signOut } from './services/authService';
import { sendConfirmationEmail } from './services/emailService';
import { captureInvoiceAsPdf, uploadInvoicePdf, A4_W_PX, A4_H_PX } from './services/pdfService';

const stampFiles = import.meta.glob<string>('./assets/stamp.png', { eager: true, query: '?url', import: 'default' });
const STAMP_URL: string | null = stampFiles['./assets/stamp.png'] ?? null;

// Drop src/assets/logo.png to enable logo — falls back to company name text
const logoFiles = import.meta.glob<string>('./assets/logo.png', { eager: true, query: '?url', import: 'default' });
const LOGO_URL: string | null = logoFiles['./assets/logo.png'] ?? null;

const COMPANY = {
  name:    'AMOR AMENAGEMENT',
  address: '05 Rue Dixmude 1er Etage Appt N°2 Benjdia - CASABLANCA',
  gsm:     '06 61 09 70 63',
  ice:     '003766077000051',
  rc:      '688445',
  if:      '68308643',
  patente: '34214765',
  CNSS:   '.',
};

const MIN_TABLE_ROWS = 4;
const STAMP_SIZE_PX = 220;  // Stamp size in pixels (easily adjustable)
const FACTURE_STATUSES:     InvoiceStatus[] = ['Générée', 'Envoyée', 'Payée', 'Annulée'];
const DEVIS_STATUSES:       InvoiceStatus[] = ['Envoyé', 'Accepté', 'Refusé'];
const BL_STATUSES:          InvoiceStatus[] = ['Générée', 'Livré', 'Annulée'];

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Brouillon: 'bg-slate-100 text-slate-500',
  Générée:   'bg-violet-50 text-violet-700',
  Envoyée:   'bg-blue-50 text-blue-700',
  Payée:     'bg-emerald-50 text-emerald-700',
  Annulée:   'bg-red-50 text-red-600',
  Envoyé:    'bg-blue-50 text-blue-700',
  Accepté:   'bg-emerald-50 text-emerald-700',
  Refusé:    'bg-red-50 text-red-600',
  Livré:     'bg-teal-50 text-teal-700',
};

function uid()   { return crypto.randomUUID(); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtNum(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

type ShareIntent = {
  type: 'email' | 'whatsapp';
  email?: string;
  phone?: string;
  invoiceNum: string;
  totalTTC: number;
};

const AI_DRAFT_KEY = 'invoicer_ai_invoice_draft_v1';
const AI_DRAFT_MAX_AGE_MS = 10 * 60 * 1000;

type StoredAIDraft = {
  docType: DocumentType;
  createdAt: number;
  prefill: InvoiceDraftPrefill;
};

function readInvoiceAIDraft(docType?: DocumentType): InvoiceDraftPrefill | null {
  if (!docType || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AI_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAIDraft>;
    if (parsed.docType !== docType || !parsed.prefill || !Array.isArray(parsed.prefill.items)) return null;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > AI_DRAFT_MAX_AGE_MS) return null;
    return parsed.prefill;
  } catch {
    return null;
  }
}

function clearInvoiceAIDraft() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AI_DRAFT_KEY);
}

interface Props {
  mode: 'new' | 'edit' | 'view';
  invoiceNumber?: string;
  invoiceId?: string;
  docType?: DocumentType;
  prefill?: InvoiceDraftPrefill;
  printOnLoad?: boolean;
  pendingShare?: ShareIntent;
  onShareOpened?: () => void;
  onBack: () => void;
  onSaved: () => void;
}

export default function InvoiceForm({
  mode, invoiceNumber: newNumber, invoiceId, docType: docTypeProp, prefill, printOnLoad,
  pendingShare, onShareOpened, onBack, onSaved,
}: Props) {
  const readOnly    = mode === 'view';
  const internalId  = useRef<string>(invoiceId ?? uid());
  const aiPrefillRef = useRef<InvoiceDraftPrefill | null>(
    mode === 'new' ? readInvoiceAIDraft(docTypeProp) : null,
  );
  const initialPrefill = aiPrefillRef.current ?? prefill;
  const isAIDraft = !!aiPrefillRef.current?.aiDraft;

  const [fetchLoading, setFetchLoading] = useState(mode !== 'new');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const [invoiceNum, setInvoiceNum] = useState(newNumber ?? '');
  const [date,       setDate]       = useState(today());
  const [client,     setClient]     = useState(initialPrefill?.client ?? '');
  const [docType,    setDocType]    = useState<DocumentType>(docTypeProp ?? 'facture');
  const [status,     setStatus]     = useState<InvoiceStatus>('Générée');
  const [items,      setItems]      = useState<LineItem[]>(
    initialPrefill?.items ?? [{ id: uid(), designation: '', quantity: 1, unitPrice: 0 }]
  );
  const [sourceDocumentId, setSourceDocumentId] = useState<string | undefined>(initialPrefill?.sourceDocumentId);
  const [originDevisId,    setOriginDevisId]    = useState<string | undefined>(undefined);
  const [createdAt,        setCreatedAt]        = useState<string>(today());
  const tvaRate = 20;

  // CRM client link
  const [clientId,     setClientId]     = useState<string | null>(initialPrefill?.clientId ?? null);
  const [crmClients,   setCrmClients]   = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showDrop,     setShowDrop]     = useState(false);

  // Stamp overlay
  const [stampVisible, setStampVisible] = useState(false);
  const [stampPos,     setStampPos]     = useState({ x: 70, y: 78 });

  // Drag
  const [dragging,  setDragging]  = useState<'stamp' | null>(null);
  const pageRef     = useRef<HTMLDivElement>(null);
  const printRef    = useRef<HTMLDivElement>(null);
  const dragStart   = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  // Email confirmation before save
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [confirmEmail,     setConfirmEmail]     = useState('');

  // Share notice banner (after afterprint)
  const [shareNotice, setShareNotice] = useState('');

  useEffect(() => {
    if (readOnly) return;
    getClients().then(setCrmClients).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'new') return;
    setFetchLoading(true);
    getFacture(internalId.current).then(inv => {
      if (inv) {
        setInvoiceNum(inv.number);
        setDate(inv.date);
        setClient(inv.client);
        setStatus(inv.status);
        setDocType(inv.documentType ?? 'facture');
        setItems(inv.items);
        setClientId(inv.clientId ?? null);
        setSourceDocumentId(inv.sourceDocumentId);
        setOriginDevisId(inv.originDevisId);
        setCreatedAt(inv.createdAt);
        if (inv.stampPos)     { setStampPos(inv.stampPos); setStampVisible(true); }
      }
      setFetchLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!printOnLoad || fetchLoading) return;
    const t = setTimeout(() => {
      document.title = `AMOR AMENAGEMENT - ${invoiceNum}`;
      window.addEventListener('afterprint', () => {
        document.title = 'Facture';
        if (pendingShare) { triggerShare(pendingShare); onShareOpened?.(); }
      }, { once: true });
      window.print();
    }, 500);
    return () => clearTimeout(t);
  }, [printOnLoad, fetchLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag event listeners
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragStart.current || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const dx = (e.clientX - dragStart.current.mx) / rect.width  * 100;
      const dy = (e.clientY - dragStart.current.my) / A4_H_PX     * 100;
      const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx));
      const ny = Math.max(2, Math.min(98, dragStart.current.oy + dy));
      if (dragging === 'stamp') setStampPos({ x: nx, y: ny });
    }
    function onMoveTouch(e: TouchEvent) {
      if (!dragStart.current || !pageRef.current || !e.touches[0]) return;
      const rect = pageRef.current.getBoundingClientRect();
      const dx = (e.touches[0].clientX - dragStart.current.mx) / rect.width  * 100;
      const dy = (e.touches[0].clientY - dragStart.current.my) / A4_H_PX     * 100;
      const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx));
      const ny = Math.max(2, Math.min(98, dragStart.current.oy + dy));
      if (dragging === 'stamp') setStampPos({ x: nx, y: ny });
    }
    function onUp() { setDragging(null); dragStart.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMoveTouch, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMoveTouch);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPrintTitle() {
    document.title = `AMOR AMENAGEMENT - ${invoiceNum}`;
    window.addEventListener('afterprint', () => { document.title = 'Facture'; }, { once: true });
  }

  function startDrag(e: React.MouseEvent, which: 'stamp') {
    e.preventDefault();
    const pos = which === 'stamp' ? stampPos : stampPos;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
    setDragging(which);
  }

  function startDragTouch(e: React.TouchEvent, which: 'stamp') {
    const t = e.touches[0];
    if (!t) return;
    const pos = which === 'stamp' ? stampPos : stampPos;
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: pos.x, oy: pos.y };
    setDragging(which);
  }

  function triggerShare(share: ShareIntent) {
    const fmtTotal = share.totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const label = share.invoiceNum.toLowerCase().startsWith('d') ? 'devis' : 'facture';
    const body = `Bonjour,\n\nVeuillez trouver ci-joint votre ${label} ${share.invoiceNum} d'un montant de ${fmtTotal} DH.\n\nCordialement,\nAMOR AMENAGEMENT`;
    if (share.type === 'email') {
      const subject = encodeURIComponent(`Facture ${share.invoiceNum} - AMOR AMENAGEMENT`);
      window.location.href = `mailto:${share.email ?? ''}?subject=${subject}&body=${encodeURIComponent(body)}`;
      setShareNotice(share.email ? `Email pré-rempli pour ${share.email}. Joignez le PDF.` : `Email pré-rempli. Ajoutez le destinataire et joignez le PDF.`);
    } else {
      const phone = (share.phone ?? '').replace(/[^0-9+]/g, '').replace(/^0([0-9])/, '212$1');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, '_blank');
      setShareNotice(share.phone ? `WhatsApp ouvert pour ${share.phone}. Joignez le PDF.` : `WhatsApp ouvert. Joignez le PDF.`);
    }
  }


  const addItem = useCallback(() => {
    setItems(p => [...p, { id: uid(), designation: '', quantity: 1, unitPrice: 0 }]);
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems(p => p.length <= 1 ? p : p.filter(i => i.id !== id));
  }, []);
  const updateItem = useCallback((id: string, field: keyof LineItem, value: string | number) => {
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i));
  }, []);

  const totalHT      = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tvaAmount    = totalHT * (tvaRate / 100);
  const totalTTC     = totalHT + tvaAmount;
  const totalInWords = numberToFrenchWords(totalTTC);
  const placeholders = Math.max(0, MIN_TABLE_ROWS - items.length);

  function selectCrmClient(c: Client) {
    setClientId(c.id);
    setClientSearch('');
    setShowDrop(false);
    const lines = [
      c.name,
      [c.address, c.city].filter(Boolean).join(', '),
      c.ice ? `ICE : ${c.ice}` : '',
    ].filter(Boolean);
    setClient(lines.join('\n'));
  }

  function clearCrmClient() {
    setClientId(null);
  }

  const linkedClient = clientId ? crmClients.find(c => c.id === clientId) : null;
  const dropClients  = clientSearch
    ? crmClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)
    : crmClients.slice(0, 8);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const invoice: Invoice = {
        id:        internalId.current,
        number:    invoiceNum,
        client, date, items, tvaRate,
        totalHT, tvaAmount, totalTTC,
        status:           mode === 'new' ? (docType === 'devis' ? 'Envoyé' : 'Générée') : status,
        documentType:     docType,
        createdAt:        mode === 'new' ? new Date().toISOString() : createdAt,
        clientId:         clientId ?? undefined,
        sourceDocumentId: sourceDocumentId,
        originDevisId:    originDevisId,
        stampPos:         stampVisible ? stampPos : undefined,
      };

      // 1. Persist invoice data
      await upsertFacture(invoice);

      // 2. Generate PDF from the rendered invoice and upload to Supabase Storage.
      //    Errors here are non-fatal — the invoice is already saved.
      if (printRef.current) {
        try {
          const blob    = await captureInvoiceAsPdf(printRef.current);
          const pdfPath = await uploadInvoicePdf(invoice.id, blob);
          await updatePdfPath(invoice.id, pdfPath);
        } catch (pdfErr) {
          console.warn('PDF upload skipped:', pdfErr);
        }
      }

      if (isAIDraft) clearInvoiceAIDraft();
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ?? 'Erreur de sauvegarde';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (docType === 'bon_livraison') { handleSave(); return; }
    const linkedClient = clientId ? crmClients.find(c => c.id === clientId) : null;
    setConfirmEmail(linkedClient?.email ?? '');
    setShowEmailConfirm(true);
  }

  async function proceedSave(withEmail: boolean) {
    setShowEmailConfirm(false);
    if (withEmail && confirmEmail) {
      try { await sendConfirmationEmail(confirmEmail, invoiceNum, totalTTC, docType); } catch (_) {}
    }
    await handleSave();
  }

  function handlePrint() { setPrintTitle(); window.print(); }

  function handleBack() {
    if (isAIDraft) clearInvoiceAIDraft();
    onBack();
  }

  // Click anywhere on the invoice page to reposition the active overlay.
  // Excluded: interactive elements and the overlay divs themselves.
  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || !pageRef.current || dragging) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, button, [data-overlay]')) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((e.clientY - rect.top)  / A4_H_PX)   * 100));
    if (stampVisible) setStampPos({ x, y });
  }

  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const titleLabel =
    mode === 'new'  ? (docType === 'devis' ? 'Nouveau Devis'  : docType === 'bon_livraison' ? 'Nouveau BL'     : 'Nouvelle Facture') :
    mode === 'edit' ? (docType === 'devis' ? 'Modifier Devis'  : docType === 'bon_livraison' ? 'Modifier BL'    : 'Modifier Facture') :
                      (docType === 'devis' ? 'Aperçu Devis'    : docType === 'bon_livraison' ? 'Aperçu BL'      : 'Aperçu Facture');

  const savedStatuses = docType === 'devis' ? DEVIS_STATUSES : docType === 'bon_livraison' ? BL_STATUSES : FACTURE_STATUSES;

  // Status control shared between mobile and desktop toolbars
  const statusControl = (
    <>
      {mode === 'new' && (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES.Brouillon}`}>
          Brouillon
        </span>
      )}
      {mode === 'edit' && (
        <select
          value={status}
          onChange={e => setStatus(e.target.value as InvoiceStatus)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {savedStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {mode === 'view' && (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      )}
    </>
  );

  // Renders the invoice layout in two modes:
  //   ro=false → visible editable invoice (ref=pageRef)
  //   ro=true  → hidden A4 print source  (ref=printRef); always clean, no edit chrome
  function renderInvoiceLayout(ro: boolean, ref: React.RefObject<HTMLDivElement>) {
    return (
      <div
        ref={ref}
        onClick={ro ? undefined : handlePageClick}
        style={ro ? { width: `${A4_W_PX}px`, height: `${A4_H_PX}px`, boxSizing: 'border-box' } : undefined}
        className={ro
          ? 'relative bg-white flex flex-col invoice-page'
          : `relative bg-white shadow-lg inv-shadow rounded-xl border border-slate-200 inv-border overflow-hidden flex flex-col min-h-[297mm] invoice-page${!readOnly && stampVisible ? ' cursor-crosshair' : ''}`
        }
      >

        {/* ── Header ── */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 print:px-8 py-4 sm:py-6 print:py-5 shrink-0 invoice-header">
          <div className="flex flex-row sm:items-start print:items-start sm:justify-between print:justify-between gap-8">
            <div className="flex-1 pt-1">
              {LOGO_URL
                ? <img src={LOGO_URL} alt={COMPANY.name} className="max-w-[200px] max-h-16 object-contain print:max-w-56 print:max-h-20" />
                : <h1 className="text-xl sm:text-2xl print:text-2xl font-bold text-slate-900 tracking-wide">{COMPANY.name}</h1>
              }
            </div>
            <div className="flex-shrink-0">
              <div className="bg-slate-900 rounded-lg px-6 sm:px-6 print:px-6 py-4 sm:py-4 print:py-4 text-center shadow-md min-w-[260px]">
                <p className="text-[10px] sm:text-[10px] print:text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">{docType === 'bon_livraison' ? 'BON DE LIVRAISON' : docType === 'devis' ? 'DEVIS' : 'FACTURE'}</p>
                {/* Paragraph: shown in view-only and print; hidden in edit mode on screen */}
                <p className={`text-white font-bold text-lg sm:text-xl print:text-xl tracking-wide leading-tight ${!ro && !readOnly ? 'hidden print:block' : ''}`}>
                  {invoiceNum}
                </p>
                {/* Input: shown only in edit mode on screen; hidden in print */}
                {!ro && !readOnly && (
                  <input
                    type="text"
                    value={invoiceNum}
                    onChange={e => setInvoiceNum(e.target.value)}
                    className="w-full bg-transparent text-white font-bold text-lg sm:text-xl tracking-wide leading-tight text-center outline-none focus:ring-2 focus:ring-slate-400 rounded px-1 sm:block print:hidden"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={`invoice-body ${ro ? 'grow shrink-0' : 'flex-1 min-h-0'}`}>

          {/* ── Date & Client ── */}
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 print:py-5 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row print:flex-row gap-8 sm:gap-20 print:gap-20 justify-between items-start">
              {/* ── Left: Date ── */}
              <div className="flex-shrink-0">
                <label className="block text-[10px] sm:text-xs print:text-xs font-bold text-slate-600 uppercase tracking-[0.05em] mb-2">Date</label>
                {(ro || readOnly) ? (
                  <p className="text-sm print:text-sm text-slate-900 font-semibold">{dateFR(date)}</p>
                ) : (
                  <>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all inv-field"
                    />
                    <p className="inv-date text-sm text-slate-900 font-semibold mt-1">{dateFR(date)}</p>
                  </>
                )}
              </div>

              {/* ── Right: Client Box (constrained width) ── */}
              <div className="flex-shrink-0 sm:w-80 print:w-80">
                <label className="block text-[10px] sm:text-xs print:text-xs font-bold text-slate-600 uppercase tracking-[0.05em] mb-2">Client</label>

                {/* CRM selector — screen editable only, never in print container */}
                {!ro && !readOnly && (
                  <div className="relative mb-3 no-print">
                    {linkedClient ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs">
                        <span className="font-medium text-emerald-700 flex-1 truncate">✓ {linkedClient.name}</span>
                        <button
                          type="button"
                          onClick={clearCrmClient}
                          className="text-emerald-500 hover:text-emerald-800 transition-colors flex-shrink-0"
                          title="Désélectionner"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 1l12 12M13 1L1 13"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Lier à un client…"
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowDrop(true); }}
                          onFocus={() => setShowDrop(true)}
                          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition-all"
                        />
                        {showDrop && dropClients.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                            {dropClients.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); selectCrmClient(c); }}
                                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors flex items-baseline gap-2"
                              >
                                <span className="font-medium">{c.name}</span>
                                {c.city && <span className="text-[10px] text-slate-400">{c.city}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(ro || readOnly) ? (
                  <div className="bg-slate-50 border border-slate-200 rounded px-4 py-4 min-h-[100px]">
                    <p className="text-xs print:text-xs text-slate-800 whitespace-pre-line font-medium leading-relaxed">{client || '—'}</p>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-300 rounded px-4 py-3 min-h-[100px]">
                    <textarea
                      value={client}
                      onChange={e => setClient(e.target.value)}
                      placeholder={'Nom du client\nAdresse\nICE'}
                      rows={3}
                      className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none inv-field leading-relaxed"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Spacing before articles ── */}
          <div className="h-2 sm:h-3 print:h-3 bg-white" />

          {/* ── Line Items ── */}
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 border-b border-slate-200">

            {/* Desktop table — always rendered; mobile cards excluded from print container */}
            <div className="hidden sm:block print:block">
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left   text-[11px] font-semibold text-slate-600 uppercase tracking-[0.04em] px-3 py-3 border-b-2 border-slate-300">Designation</th>
                    <th className="text-center text-[11px] font-semibold text-slate-600 uppercase tracking-[0.04em] px-2 py-3 border-b-2 border-slate-300 w-20">Qte</th>
                    <th className="text-right  text-[11px] font-semibold text-slate-600 uppercase tracking-[0.04em] px-2 py-3 border-b-2 border-slate-300 w-24">P.U (DH)</th>
                    <th className="text-right  text-[11px] font-semibold text-slate-600 uppercase tracking-[0.04em] px-3 py-3 border-b-2 border-slate-300 w-28">Total H.T.</th>
                    {!ro && !readOnly && <th className="w-8 border-b-2 border-slate-300 no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className={!ro && !readOnly ? 'group hover:bg-slate-50/50 transition-colors' : ''}>
                      <td className="px-3 py-2.5 border-b border-slate-100 break-words">
                        {(ro || readOnly)
                          ? <span className="text-xs text-slate-800 block">{item.designation}</span>
                          : <input type="text" value={item.designation}
                              onChange={e => updateItem(item.id, 'designation', e.target.value)}
                              placeholder="Description..."
                              className="w-full px-1.5 py-1 text-xs text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-2 py-2.5 border-b border-slate-100 text-center">
                        {(ro || readOnly)
                          ? <span className="text-xs text-slate-800">{item.quantity}</span>
                          : <input type="number" min="0" step="1" value={item.quantity || ''}
                              onChange={e => updateItem(item.id, 'quantity', Math.max(0, Number(e.target.value)))}
                              className="w-full px-1 py-1 text-xs text-center text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-2 py-2.5 border-b border-slate-100 text-right">
                        {(ro || readOnly)
                          ? <span className="text-xs text-slate-800 block">{fmtNum(item.unitPrice)}</span>
                          : <input type="number" min="0" step="0.01" value={item.unitPrice || ''}
                              onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                              className="w-full px-1 py-1 text-xs text-right text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-right">
                        <span className="text-xs font-semibold text-slate-700">{fmtNum(item.quantity * item.unitPrice)}</span>
                      </td>
                      {!ro && !readOnly && (
                        <td className="px-1 py-2.5 border-b border-slate-100 no-print text-center">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {Array.from({ length: placeholders }).map((_, i) => (
                    <tr key={`ph-${i}`}>
                      <td className="px-3 py-1.5 border-b border-slate-100">&nbsp;</td>
                      <td className="px-2 py-1.5 border-b border-slate-100">&nbsp;</td>
                      <td className="px-2 py-1.5 border-b border-slate-100">&nbsp;</td>
                      <td className="px-3 py-1.5 border-b border-slate-100">&nbsp;</td>
                      {!ro && !readOnly && <td className="px-1 py-1.5 border-b border-slate-100 no-print" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile item cards — screen only, never in print container */}
            {!ro && (
              <div className="sm:hidden no-print space-y-3">
                {items.map(item => (
                  <MobileItemCard
                    key={item.id}
                    item={item}
                    readOnly={readOnly}
                    canRemove={items.length > 1}
                    onUpdate={(field, value) => updateItem(item.id, field, value)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
            )}

            {!ro && !readOnly && (
              <div className="mt-3 no-print">
                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all w-full sm:w-auto justify-center sm:justify-start"
                >
                  <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  Ajouter une ligne
                </button>
              </div>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 print:py-5 bg-slate-50/50 border-t border-slate-200">
            <div className="flex justify-end">
              <div className="w-full sm:w-64 print:w-64">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                  <span className="text-[10px] sm:text-xs print:text-xs font-semibold text-slate-700 uppercase tracking-[0.04em]">Total H.T.</span>
                  <span className="text-xs sm:text-sm print:text-sm font-semibold text-slate-800">{fmtNum(totalHT)} DH</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                  <span className="text-[10px] sm:text-xs print:text-xs font-semibold text-slate-700 uppercase tracking-[0.04em]">TVA ({tvaRate}%)</span>
                  <span className="text-xs sm:text-sm print:text-sm font-semibold text-slate-800">{fmtNum(tvaAmount)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-slate-800 rounded mt-1 px-2.5">
                  <span className="text-xs sm:text-sm print:text-sm font-bold text-white uppercase tracking-wide">Total T.T.C.</span>
                  <span className="text-base sm:text-lg print:text-lg font-bold text-white">{fmtNum(totalTTC)} DH</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Amount in words ── */}
          <div className="amount-section px-4 sm:px-8 print:px-8 py-4 sm:py-5 print:py-5 border-t border-slate-200">
            <p className="text-[9px] sm:text-[10px] print:text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] mb-2">
              Arreter la presente facture a la somme de :
            </p>
            <p className="text-xs sm:text-sm print:text-sm text-slate-800 font-medium bg-slate-50 px-4 py-2.5 rounded border border-slate-200 italic leading-relaxed">
              {totalInWords}
            </p>
          </div>

        </div>{/* ── end invoice-body ── */}

        {/* ── Stamp overlay ── */}
        {stampVisible && STAMP_URL && (
          <div
            data-overlay
            className={`absolute select-none z-10 ${!ro && !readOnly ? 'cursor-move' : ''}`}
            style={{ left: `${stampPos.x}%`, top: `${stampPos.y}%`, transform: 'translate(-50%, -50%)' }}
            onMouseDown={!ro && !readOnly ? e => startDrag(e, 'stamp') : undefined}
            onTouchStart={!ro && !readOnly ? e => startDragTouch(e, 'stamp') : undefined}
          >
            <img src={STAMP_URL} alt="Cachet" style={{ width: `${STAMP_SIZE_PX}px`, height: `${STAMP_SIZE_PX}px` }} className="max-w-[140px] max-h-[90px] object-contain pointer-events-none opacity-85 drop-shadow-lg print:max-w-[120px] print:max-h-[80px]" />
            {!ro && !readOnly && (
              <button
                className="no-print absolute -top-3 -right-3 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center shadow-md"
                onClick={e => { e.stopPropagation(); setStampVisible(false); }}
              ><X className="w-4 h-4" /></button>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="border-t border-slate-500 px-4 sm:px-8 print:px-8 py-2 invoice-footer shrink-0">
          <div className="flex justify-center items-center gap-4 sm:gap-6 print:gap-6 mb-1 flex-wrap sm:flex-nowrap print:flex-nowrap">
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] print:text-[11px] text-slate-700">
              <span className="font-medium">Adresse:</span>
              <span className="font-normal">{COMPANY.address}</span>
            </div>
            <span className="text-slate-300 text-[8px]">•</span>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] print:text-[11px] text-slate-700">
              <span className="font-medium">GSM:</span>
              <span className="font-normal">{COMPANY.gsm}</span>
            </div>
          </div>
          <div className="text-center text-[9px] sm:text-[10px] print:text-[10px] text-slate-600 flex flex-wrap justify-center gap-2 sm:gap-3 print:gap-3">
            {([['ICE', COMPANY.ice], ['RC', COMPANY.rc], ['IF', COMPANY.if], ['Patente', COMPANY.patente], ['CNSS', COMPANY.CNSS]] as [string,string][]).map(([label, value], idx) => (
              <span key={label}>
                <span className="font-medium">{label}:</span> {value}{idx < 4 ? ' •' : ''}
              </span>
            ))}
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">

        {/* Mobile toolbar (2 rows) */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="flex items-center gap-2">
              {statusControl}
              <button
                onClick={() => signOut()}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {!readOnly && (
              <>
                <button
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
                >
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Sauvegarder
                </button>
                {STAMP_URL && (
                  <button
                    onClick={() => setStampVisible(v => !v)}
                    title={stampVisible ? 'Retirer le cachet' : 'Ajouter le cachet'}
                    className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border transition-all ${stampVisible ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Stamp className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            <button
              onClick={handlePrint}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all ${readOnly ? 'flex-1' : ''}`}
            >
              <Printer className="w-4 h-4" />
              {readOnly ? 'Imprimer' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Desktop toolbar (1 row) */}
        <div className="hidden sm:flex max-w-4xl mx-auto px-4 py-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase">{titleLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusControl}
            {!readOnly && (
              <>
                {STAMP_URL && (
                  <button
                    onClick={() => setStampVisible(v => !v)}
                    title={stampVisible ? 'Retirer le cachet' : 'Ajouter le cachet'}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-all shadow-sm ${stampVisible ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Stamp className="w-4 h-4" />
                    Cachet
                  </button>
                )}
                <button
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
                >
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Sauvegarder
                </button>
              </>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              {readOnly ? 'Imprimer' : 'Aperçu PDF'}
            </button>
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 pb-2 max-w-4xl mx-auto">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          </div>
        )}
        {shareNotice && (
          <div className="px-4 pb-2 max-w-4xl mx-auto flex items-center justify-between gap-3 bg-blue-50 border-b border-blue-200 py-2">
            <p className="text-xs text-blue-700">{shareNotice}</p>
            <button onClick={() => setShareNotice('')} className="text-blue-400 hover:text-blue-700 shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {isAIDraft && (
          <div className="px-4 pb-2 max-w-4xl mx-auto">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold">Vérifiez les données avant enregistrement.</p>
                {aiPrefillRef.current?.aiNotes && (
                  <p className="mt-0.5 text-amber-700 break-words">{aiPrefillRef.current.aiNotes}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Invoice card (visible editable preview) ── */}
      <div className="w-[794px] mx-auto my-6 print:my-0 inv-spacing print:flex-none">
        {renderInvoiceLayout(false, pageRef)}
      </div>

      {/* ── Hidden A4 print container — always mounted, always painted, source for PDF capture ── */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, width: `${A4_W_PX}px`, height: `${A4_H_PX}px`, opacity: 0, pointerEvents: 'none', zIndex: -1, background: 'white' }}
      >
        {renderInvoiceLayout(true, printRef)}
      </div>


      {/* ── Email confirmation modal ── */}
      {showEmailConfirm && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Confirmation avant sauvegarde</h2>
              <button onClick={() => setShowEmailConfirm(false)} className="text-slate-400 hover:text-slate-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">Envoyer une confirmation par email avant de finaliser ?</p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">Email du destinataire</label>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={e => setConfirmEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => proceedSave(true)}
                  disabled={!confirmEmail}
                  className="w-full py-2.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
                >
                  Envoyer la confirmation et sauvegarder
                </button>
                <button
                  onClick={() => proceedSave(false)}
                  className="w-full py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Sauvegarder sans envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile item card ──────────────────────────────────────────────────────────
// Shown on small screens instead of the desktop table. Never printed.

function MobileItemCard({
  item, readOnly, canRemove, onUpdate, onRemove,
}: {
  item: LineItem;
  readOnly: boolean;
  canRemove: boolean;
  onUpdate: (field: keyof LineItem, value: string | number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
      {/* Designation */}
      <div>
        <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">
          Désignation
        </label>
        {readOnly ? (
          <p className="text-sm text-slate-800">{item.designation || '—'}</p>
        ) : (
          <input
            type="text"
            value={item.designation}
            onChange={e => onUpdate('designation', e.target.value)}
            placeholder="Description du produit ou service..."
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
          />
        )}
      </div>

      {/* QTE / P.U / P.T.H.T */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">QTE</label>
          {readOnly ? (
            <p className="text-sm font-medium text-slate-800">{item.quantity}</p>
          ) : (
            <input
              type="number" min="0" step="1"
              value={item.quantity || ''}
              onChange={e => onUpdate('quantity', Math.max(0, Number(e.target.value)))}
              className="w-full px-2 py-2.5 text-sm text-center border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          )}
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">P.U</label>
          {readOnly ? (
            <p className="text-sm font-medium text-slate-800">{fmtNum(item.unitPrice)}</p>
          ) : (
            <input
              type="number" min="0" step="0.01"
              value={item.unitPrice || ''}
              onChange={e => onUpdate('unitPrice', Math.max(0, Number(e.target.value)))}
              className="w-full px-2 py-2.5 text-sm text-right border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          )}
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">P.T.H.T</label>
          <p className="text-sm font-semibold text-slate-800 pt-2.5">{fmtNum(item.quantity * item.unitPrice)}</p>
        </div>
      </div>

      {!readOnly && canRemove && (
        <button
          onClick={onRemove}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 py-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer cette ligne
        </button>
      )}
    </div>
  );
}
