import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from './supabaseClient';

const BUCKET = 'invoice-pdfs';

// Exported so InvoiceForm can size its hidden print container identically.
export const A4_W_PX = 794;   // 210 mm × (96 / 25.4)
export const A4_H_PX = 1123;  // 297 mm × (96 / 25.4)

// ── Capture ───────────────────────────────────────────────────────────────────

// Captures the dedicated hidden A4 print container as a PDF blob.
// The container lives at position:fixed top:0 left:0 with opacity:0 — always
// fully rasterized by the browser — so no clone, no off-screen paint deferral,
// and no CSS workarounds are needed.
export async function captureInvoiceAsPdf(printElement: HTMLElement): Promise<Blob> {
  // Wait for fonts and images to be fully loaded
  await document.fonts.ready;
  await Promise.all(
    Array.from(document.images).map(img =>
      new Promise<void>((resolve) => {
        if (img.complete) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      })
    )
  );

  // Frame 1: style recalculation on the print container.
  // Frame 2: layout and paint have settled.
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  // ── DEBUG: Log element before capture ──
  const rect = printElement.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(printElement);
  console.log('=== PDF CAPTURE DEBUG ===');
  console.log('Element className:', printElement.className);
  console.log('Element id:', printElement.id);
  console.log('getBoundingClientRect():', { width: rect.width, height: rect.height, top: rect.top, left: rect.left });
  console.log('scrollWidth/scrollHeight:', { scrollWidth: printElement.scrollWidth, scrollHeight: printElement.scrollHeight });
  console.log('clientWidth/clientHeight:', { clientWidth: printElement.clientWidth, clientHeight: printElement.clientHeight });
  console.log('offsetWidth/offsetHeight:', { offsetWidth: printElement.offsetWidth, offsetHeight: printElement.offsetHeight });
  console.log('Computed style width:', computedStyle.width);
  console.log('Computed style height:', computedStyle.height);
  console.log('Computed style overflow:', computedStyle.overflow);
  console.log('Computed style transform:', computedStyle.transform);
  console.log('Computed style scale:', computedStyle.scale);
  console.log('Computed style zoom:', computedStyle.zoom);
  console.log('Computed style max-width:', computedStyle.maxWidth);
  console.log('Parent element:', printElement.parentElement?.tagName, printElement.parentElement?.className);
  console.log('Parent overflow:', window.getComputedStyle(printElement.parentElement!).overflow);

  // Check for visible vs hidden preview
  const visibleEditor = document.querySelector('.invoice-page:not([aria-hidden])');
  const visibleEditorRect = visibleEditor?.getBoundingClientRect();
  console.log('Visible editor preview exists:', !!visibleEditor);
  if (visibleEditorRect) {
    console.log('Visible editor dimensions:', { width: visibleEditorRect.width, height: visibleEditorRect.height });
  }
  console.log('Captured element is hidden?', printElement.getAttribute('aria-hidden') === 'true');

  try {
    const canvas = await html2canvas(printElement, {
      scale:           2,
      useCORS:         true,
      allowTaint:      true,
      logging:         false,
      backgroundColor: '#ffffff',
      width:           A4_W_PX,
      height:          A4_H_PX,
      windowWidth:     A4_W_PX,
      windowHeight:    A4_H_PX,
    });

    console.log('Canvas dimensions:', { width: canvas.width, height: canvas.height });
    console.log('Canvas aspect ratio:', canvas.width / canvas.height);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    // Add image at full A4 size (210mm x 297mm) to preserve exact PDF dimensions
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297);
    console.log('PDF image added: 210mm x 297mm');
    console.log('=== PDF CAPTURE COMPLETE ===');
    return pdf.output('blob');
  } catch (err) {
    console.error('PDF capture failed:', err);
    throw err;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadInvoicePdf(invoiceId: string, blob: Blob): Promise<string> {
  const path = `${invoiceId}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  return path;
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function downloadInvoicePdf(pdfPath: string, filename: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(pdfPath);
  if (error) throw error;

  const url = URL.createObjectURL(data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
