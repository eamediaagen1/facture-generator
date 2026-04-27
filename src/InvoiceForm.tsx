import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Printer, FileText, ArrowLeft, Save, LogOut, Stamp, PenLine, X } from 'lucide-react';
import { numberToFrenchWords } from './numberToWords';
import type { Invoice, InvoiceStatus, LineItem, DocumentType, Client } from './types';
import { getFacture, upsertFacture } from './services/factureService';
import { getClients } from './services/clientService';
import { signOut } from './services/authService';
import { sendConfirmationEmail } from './services/emailService';

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

interface Props {
  mode: 'new' | 'edit' | 'view';
  invoiceNumber?: string;
  invoiceId?: string;
  docType?: DocumentType;
  prefill?: { client: string; clientId?: string; items: LineItem[]; sourceDocumentId?: string };
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

  const [fetchLoading, setFetchLoading] = useState(mode !== 'new');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const [invoiceNum, setInvoiceNum] = useState(newNumber ?? '');
  const [date,       setDate]       = useState(today());
  const [client,     setClient]     = useState(prefill?.client ?? '');
  const [docType,    setDocType]    = useState<DocumentType>(docTypeProp ?? 'facture');
  const [status,     setStatus]     = useState<InvoiceStatus>('Générée');
  const [items,      setItems]      = useState<LineItem[]>(
    prefill?.items ?? [{ id: uid(), designation: '', quantity: 1, unitPrice: 0 }]
  );
  const [sourceDocumentId] = useState<string | undefined>(prefill?.sourceDocumentId);
  const tvaRate = 20;

  // CRM client link
  const [clientId,     setClientId]     = useState<string | null>(prefill?.clientId ?? null);
  const [crmClients,   setCrmClients]   = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showDrop,     setShowDrop]     = useState(false);

  // Stamp overlay
  const [stampVisible, setStampVisible] = useState(false);
  const [stampPos,     setStampPos]     = useState({ x: 65, y: 75 });

  // Signature overlay
  const [sigVisible,   setSigVisible]   = useState(false);
  const [sigPos,       setSigPos]       = useState({ x: 15, y: 80 });
  const [sigData,      setSigData]      = useState<string | null>(null);

  // Signature modal
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigTab,       setSigTab]       = useState<'draw' | 'upload'>('draw');
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isDrawing   = useRef(false);
  const lastPt      = useRef({ x: 0, y: 0 });

  // Drag
  const [dragging,  setDragging]  = useState<'stamp' | 'sig' | null>(null);
  const pageRef     = useRef<HTMLDivElement>(null);
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
        if (inv.stampPos)     { setStampPos(inv.stampPos); setStampVisible(true); }
        if (inv.signatureData){ setSigData(inv.signatureData); setSigPos(inv.signaturePos ?? { x: 15, y: 80 }); setSigVisible(true); }
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
      const dx = (e.clientX - dragStart.current.mx) / rect.width * 100;
      const dy = (e.clientY - dragStart.current.my) / rect.height * 100;
      const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx));
      const ny = Math.max(2, Math.min(98, dragStart.current.oy + dy));
      if (dragging === 'stamp') setStampPos({ x: nx, y: ny });
      else setSigPos({ x: nx, y: ny });
    }
    function onMoveTouch(e: TouchEvent) {
      if (!dragStart.current || !pageRef.current || !e.touches[0]) return;
      const rect = pageRef.current.getBoundingClientRect();
      const dx = (e.touches[0].clientX - dragStart.current.mx) / rect.width * 100;
      const dy = (e.touches[0].clientY - dragStart.current.my) / rect.height * 100;
      const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx));
      const ny = Math.max(2, Math.min(98, dragStart.current.oy + dy));
      if (dragging === 'stamp') setStampPos({ x: nx, y: ny });
      else setSigPos({ x: nx, y: ny });
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

  function startDrag(e: React.MouseEvent, which: 'stamp' | 'sig') {
    e.preventDefault();
    const pos = which === 'stamp' ? stampPos : sigPos;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
    setDragging(which);
  }

  function startDragTouch(e: React.TouchEvent, which: 'stamp' | 'sig') {
    const t = e.touches[0];
    if (!t) return;
    const pos = which === 'stamp' ? stampPos : sigPos;
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

  // Canvas drawing helpers
  function canvasDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    lastPt.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function canvasDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
    ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(x, y); ctx.stroke();
    lastPt.current = { x, y };
  }
  function canvasUp() { isDrawing.current = false; }
  function clearCanvas() {
    if (!canvasRef.current) return;
    canvasRef.current.getContext('2d')!.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }
  function confirmDrawnSig() {
    if (!canvasRef.current) return;
    setSigData(canvasRef.current.toDataURL('image/png'));
    setSigVisible(true); setSigPos({ x: 15, y: 80 });
    setShowSigModal(false);
  }
  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setSigData(ev.target?.result as string);
      setSigVisible(true); setSigPos({ x: 15, y: 80 });
      setShowSigModal(false);
    };
    reader.readAsDataURL(file);
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
        createdAt:        new Date().toISOString(),
        clientId:         clientId ?? undefined,
        sourceDocumentId: sourceDocumentId,
        stampPos:         stampVisible ? stampPos : undefined,
        signaturePos:     sigVisible && sigData ? sigPos : undefined,
        signatureData:    sigVisible && sigData ? sigData : undefined,
      };
      await upsertFacture(invoice);
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

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">

        {/* Mobile toolbar (2 rows) */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onBack}
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
                <button
                  onClick={() => { setSigTab('draw'); setShowSigModal(true); }}
                  title={sigVisible ? 'Modifier la signature' : 'Ajouter une signature'}
                  className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border transition-all ${sigVisible ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  <PenLine className="w-4 h-4" />
                </button>
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
              onClick={onBack}
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
                  onClick={() => { setSigTab('draw'); setShowSigModal(true); }}
                  title={sigVisible ? 'Modifier la signature' : 'Ajouter une signature'}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-all shadow-sm ${sigVisible ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <PenLine className="w-4 h-4" />
                  Signature
                </button>
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
      </div>

      {/* ── Invoice card ── */}
      {/*
        Mobile:  no margin, no rounding — full-width edge-to-edge card
        Desktop: centered, rounded, with vertical margin
        Print:   inv-spacing / inv-border CSS overrides handle layout
      */}
      <div className="w-[794px] mx-auto my-6 print:my-0 inv-spacing print:flex-none">
        <div ref={pageRef} className="relative bg-white shadow-lg inv-shadow rounded-xl border border-slate-200 inv-border overflow-hidden flex flex-col min-h-[297mm] invoice-page">

          {/* ── Header ── */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-8 print:px-8 py-4 sm:py-6 shrink-0 invoice-header">
            <div className="flex flex-col sm:flex-row print:flex-row sm:items-start print:items-center sm:justify-between print:justify-between gap-3">
              <div>
                {LOGO_URL
                  ? <img src={LOGO_URL} alt={COMPANY.name} className="max-w-[250px] max-h-[180px] object-contain print:max-h-20" />
                  : <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide whitespace-nowrap">{COMPANY.name}</h1>
                }
              </div>
              <div className="sm:text-right print:text-right">
                <div className="inline-block bg-slate-800 rounded-lg px-3 sm:px-4 py-2">
                  <p className="text-xs text-slate-300 uppercase tracking-wider">{docType === 'bon_livraison' ? 'BON DE LIVRAISON N°' : docType === 'devis' ? 'Devis N°' : 'Facture N°'}</p>
                  <p className="text-white font-bold text-base sm:text-lg tracking-wide">{invoiceNum}</p>
                </div>
              </div>
            </div>
          </div>


          {/* ── Body ── */}
          <div className="invoice-body flex-1 min-h-0">

          {/* ── Date & Client ── */}
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row print:flex-row sm:items-start print:items-start sm:justify-between print:justify-between gap-4 sm:gap-8 print:gap-8">
              <div className="sm:flex-1 print:flex-1">
                <label className="block text-[14px] font-bold text-slate-700 uppercase tracking-[0.04em] mb-1.5">Date</label>
                {readOnly ? (
                  <p className="text-sm text-slate-800 py-2">{dateFR(date)}</p>
                ) : (
                  <>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all inv-field"
                    />
                    <p className="inv-date text-sm text-slate-800 mt-1">{dateFR(date)}</p>
                  </>
                )}
              </div>
              <div className="sm:flex-1 print:flex-1">
                <label className="block text-[14px] font-bold text-slate-700 uppercase tracking-[0.04em] mb-1.5">Client</label>

                {/* CRM selector — edit mode only, never printed */}
                {!readOnly && (
                  <div className="relative mb-2 no-print">
                    {linkedClient ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <span className="text-xs font-medium text-emerald-700 flex-1 truncate">✓ {linkedClient.name}</span>
                        <button
                          type="button"
                          onClick={clearCrmClient}
                          className="text-emerald-500 hover:text-emerald-800 transition-colors"
                          title="Désélectionner"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 1l12 12M13 1L1 13"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Lier à un client CRM…"
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowDrop(true); }}
                          onFocus={() => setShowDrop(true)}
                          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition-all"
                        />
                        {showDrop && dropClients.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-44 overflow-y-auto">
                            {dropClients.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); selectCrmClient(c); }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-baseline gap-2"
                              >
                                <span className="font-medium">{c.name}</span>
                                {c.city && <span className="text-xs text-slate-400">{c.city}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {readOnly ? (
                  <p className="text-sm text-slate-800 py-2 whitespace-pre-line">{client || '—'}</p>
                ) : (
                  <textarea
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    placeholder={'Nom du client\nAdresse\nICE'}
                    rows={3}
                    className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all resize-none inv-field"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 border-b border-slate-200">

            {/* Desktop table — hidden on mobile screens, always visible on print */}
            <div className="hidden sm:block print:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left   text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300">Designation</th>
                    <th className="text-center text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-24">Qte</th>
                    <th className="text-right  text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-32">P.U (DH)</th>
                    <th className="text-right  text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-36">P.T.H.T (DH)</th>
                    {!readOnly && <th className="w-10 border-b-2 border-slate-300 no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className={!readOnly ? 'group hover:bg-slate-50/50 transition-colors' : ''}>
                      <td className="px-4 py-2 border-b border-slate-100">
                        {readOnly
                          ? <span className="text-sm text-slate-800 px-2 block">{item.designation}</span>
                          : <input type="text" value={item.designation}
                              onChange={e => updateItem(item.id, 'designation', e.target.value)}
                              placeholder="Description..."
                              className="w-full px-2 py-1.5 text-sm text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100 text-center">
                        {readOnly
                          ? <span className="text-sm text-slate-800">{item.quantity}</span>
                          : <input type="number" min="0" step="1" value={item.quantity || ''}
                              onChange={e => updateItem(item.id, 'quantity', Math.max(0, Number(e.target.value)))}
                              className="w-full px-2 py-1.5 text-sm text-center text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100">
                        {readOnly
                          ? <span className="text-sm text-slate-800 block text-right">{fmtNum(item.unitPrice)}</span>
                          : <input type="number" min="0" step="0.01" value={item.unitPrice || ''}
                              onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                              className="w-full px-2 py-1.5 text-sm text-right text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100 text-right">
                        <span className="text-sm font-medium text-slate-700">{fmtNum(item.quantity * item.unitPrice)}</span>
                      </td>
                      {!readOnly && (
                        <td className="px-1 py-2 border-b border-slate-100 no-print">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {Array.from({ length: placeholders }).map((_, i) => (
                    <tr key={`ph-${i}`}>
                      <td className="px-4 py-3 border-b border-slate-100 h-10">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      {!readOnly && <td className="px-1 py-3 border-b border-slate-100 no-print" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile item cards — hidden on sm+ and never printed */}
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

            {!readOnly && (
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
          <div className="px-4 sm:px-8 print:px-8 py-4 sm:py-5 bg-slate-50/50 border-t border-slate-200">
            <div className="flex justify-end">
              <div className="w-full sm:w-72 print:w-72">
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-[0.04em]">TOTAL H.T.</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(totalHT)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-[0.04em]">TVA ({tvaRate}%)</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(tvaAmount)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2.5 bg-slate-800 -mx-3 px-3 rounded-lg mt-1">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Total T.T.C.</span>
                  <span className="text-lg font-bold text-white">{fmtNum(totalTTC)} DH</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Amount in words ── */}
          <div className="amount-section px-4 sm:px-8 print:px-8 py-4 border-t border-slate-200">
            <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] mb-1.5">
              Arreter la presente facture a la somme de :
            </p>
            <p className="text-sm text-slate-800 font-medium bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200 italic">
              {totalInWords}
            </p>
          </div>

          </div>{/* ── end invoice-body ── */}

          {/* ── Stamp overlay ── */}
          {stampVisible && STAMP_URL && (
            <div
              className={`absolute select-none z-10 ${!readOnly ? 'cursor-move' : ''}`}
              style={{ left: `${stampPos.x}%`, top: `${stampPos.y}%`, transform: 'translate(-50%, -50%)' }}
              onMouseDown={!readOnly ? e => startDrag(e, 'stamp') : undefined}
              onTouchStart={!readOnly ? e => startDragTouch(e, 'stamp') : undefined}
            >
              <img src={STAMP_URL} alt="Cachet" className="w-[265px] h-[265px] object-contain pointer-events-none opacity-90" />
              {!readOnly && (
                <button
                  className="no-print absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center shadow"
                  onClick={e => { e.stopPropagation(); setStampVisible(false); }}
                ><X className="w-3 h-3" /></button>
              )}
            </div>
          )}

          {/* ── Signature overlay ── */}
          {sigVisible && sigData && (
            <div
              className={`absolute select-none z-10 ${!readOnly ? 'cursor-move' : ''}`}
              style={{ left: `${sigPos.x}%`, top: `${sigPos.y}%`, transform: 'translate(-50%, -50%)' }}
              onMouseDown={!readOnly ? e => startDrag(e, 'sig') : undefined}
              onTouchStart={!readOnly ? e => startDragTouch(e, 'sig') : undefined}
            >
              <img src={sigData} alt="Signature" className="h-20 max-w-[160px] object-contain pointer-events-none" />
              {!readOnly && (
                <button
                  className="no-print absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center shadow"
                  onClick={e => { e.stopPropagation(); setSigVisible(false); setSigData(null); }}
                ><X className="w-3 h-3" /></button>
              )}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="border-t border-slate-500 px-4 sm:px-8 print:px-8 py-3 invoice-footer shrink-0">
            <div className="flex justify-center items-baseline gap-4 sm:gap-8 print:gap-8 mb-1 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">Adresse</span>
                <span className="text-[11px] text-slate-700">{COMPANY.address}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">GSM</span>
                <span className="text-[11px] text-slate-700">{COMPANY.gsm}</span>
              </div>
            </div>
            <div className="flex justify-center items-baseline gap-3 sm:gap-6 print:gap-6 flex-wrap">
              {([['ICE', COMPANY.ice], ['RC', COMPANY.rc], ['IF', COMPANY.if], ['Patente', COMPANY.patente], ['CNSS', COMPANY.CNSS]] as [string,string][]).map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">{label}</span>
                  <span className="text-[10px] sm:text-[11px] print:text-[11px] text-slate-700">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Signature modal ── */}
      {showSigModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Ajouter une signature</h2>
              <button onClick={() => setShowSigModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-5">
              <button
                onClick={() => setSigTab('draw')}
                className={`py-2.5 px-1 mr-4 text-sm font-medium border-b-2 transition-colors ${sigTab === 'draw' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >Dessiner</button>
              <button
                onClick={() => setSigTab('upload')}
                className={`py-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${sigTab === 'upload' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >Importer</button>
            </div>
            <div className="p-5">
              {sigTab === 'draw' ? (
                <>
                  <p className="text-xs text-slate-500 mb-3">Dessinez votre signature dans la zone ci-dessous :</p>
                  <canvas
                    ref={canvasRef}
                    width={380} height={140}
                    className="w-full border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 cursor-crosshair touch-none"
                    onMouseDown={canvasDown}
                    onMouseMove={canvasDraw}
                    onMouseUp={canvasUp}
                    onMouseLeave={canvasUp}
                  />
                  <button onClick={clearCanvas} className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">Effacer</button>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setShowSigModal(false)} className="flex-1 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Annuler</button>
                    <button onClick={confirmDrawnSig} className="flex-1 py-2.5 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors font-medium">Confirmer</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">Importez une image de signature (PNG transparent recommandé) :</p>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                    <PenLine className="w-6 h-6 text-slate-400 mb-2" />
                    <span className="text-xs text-slate-500">Cliquez pour choisir un fichier</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleSigUpload} />
                  </label>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setShowSigModal(false)} className="flex-1 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Annuler</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
