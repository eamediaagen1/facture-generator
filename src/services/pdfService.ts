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

  // Temporarily force explicit dimensions on the element and ensure no parent clips
  const parent = printElement.parentElement as HTMLElement;
  const originalParentOverflow = parent?.style.overflow;
  const originalElementWidth = printElement.style.width;
  const originalElementHeight = printElement.style.height;

  try {
    // Ensure parent doesn't clip content during capture
    if (parent) parent.style.overflow = 'visible';

    // Force explicit A4 dimensions on the element
    printElement.style.width = `${A4_W_PX}px`;
    printElement.style.height = `${A4_H_PX}px`;

    // Give the DOM time to apply the styles
    await new Promise<void>(r => requestAnimationFrame(() => r()));

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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    // Calculate dimensions to preserve aspect ratio and fit exactly on A4
    const imgWidth = 210;  // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, imgWidth, imgHeight);
    return pdf.output('blob');
  } finally {
    // Restore original styles
    printElement.style.width = originalElementWidth;
    printElement.style.height = originalElementHeight;
    if (parent && originalParentOverflow !== undefined) {
      parent.style.overflow = originalParentOverflow;
    }
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
