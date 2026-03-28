/**
 * Export analysis page to PDF using browser's native print dialog.
 * This is far more reliable than html2canvas for capturing Leaflet maps,
 * ECharts canvases, and complex CSS layouts.
 */
export function exportToPDF(options: { filename: string; title: string; date: string }): void {
  // Inject print-specific styles
  const styleId = 'kartpro-print-styles'
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = styleId
    document.head.appendChild(styleEl)
  }

  styleEl.textContent = `
    @media print {
      /* Reset for print */
      body, html {
        background: white !important;
        color: black !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Hide non-essential UI */
      button, input, [data-no-print] {
        display: none !important;
      }

      /* Keep dark theme for visual consistency */
      .bg-gray-950, .bg-gray-900, .bg-gray-800 {
        background-color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Full width layout */
      .h-screen {
        height: auto !important;
      }
      .overflow-hidden, .overflow-y-auto {
        overflow: visible !important;
      }
      .flex-col, .flex {
        page-break-inside: avoid;
      }

      /* Page header */
      body::before {
        content: "${options.title} — ${options.date}";
        display: block;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
        padding: 8px 0;
        border-bottom: 1px solid #374151;
        margin-bottom: 16px;
      }

      /* Page breaks between major sections */
      [data-pdf-section] {
        page-break-inside: avoid;
        margin-bottom: 12px;
      }

      /* Ensure Leaflet tiles and markers print */
      .leaflet-container {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      @page {
        size: A4 landscape;
        margin: 10mm;
      }
    }
  `

  window.print()
}
