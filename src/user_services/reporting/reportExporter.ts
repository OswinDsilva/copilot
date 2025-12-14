import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { buildMarkdown, buildJSON } from './reportAssembler';
import type { ReportSession } from './reportTypes';

export function exportMarkdown(session: ReportSession): Blob {
  const md = buildMarkdown(session);
  return new Blob([md], { type: 'text/markdown;charset=utf-8' });
}

export function exportJSON(session: ReportSession): Blob {
  const json = buildJSON(session);
  return new Blob([json], { type: 'application/json;charset=utf-8' });
}

export function exportText(summary: string): Blob {
  return new Blob([summary], { type: 'text/plain;charset=utf-8' });
}

export function printToPDF(summary: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let y = 20;

  // Helper to check page break
  const checkPageBreak = (height: number) => {
    if (y + height > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = 20;
    }
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Mining Co-Pilot Session Summary', margin, y);
  y += 15;

  // Process Markdown lines
  const lines = summary.split('\n');
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 5; // Paragraph spacing
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      checkPageBreak(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(trimmed.replace('### ', ''), margin, y);
      y += 7;
    } else if (trimmed.startsWith('## ')) {
      checkPageBreak(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(trimmed.replace('## ', ''), margin, y);
      y += 9;
    } else if (trimmed.startsWith('# ')) {
      checkPageBreak(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(trimmed.replace('# ', ''), margin, y);
      y += 10;
    }
    // Bullet points
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const bulletText = trimmed.substring(2);
      
      // Handle bolding in bullets (simple regex for **text**)
      let xOffset = margin + 5;
      
      // Draw bullet
      doc.text('•', margin, y);
      
      // Draw text parts
      // Note: This is a simplified renderer. Complex wrapping with mixed styles is hard in jsPDF.
      // We will strip bold markers for wrapping calculation but try to render bold if possible.
      // For robustness, we'll just render the whole bullet as normal text but strip markers, 
      // or render the whole line bold if it looks like a key-value pair.
      
      const cleanText = bulletText.replace(/\*\*/g, '');
      const lines = doc.splitTextToSize(cleanText, contentWidth - 5);
      
      checkPageBreak(lines.length * 5);
      doc.text(lines, xOffset, y);
      y += (lines.length * 5) + 2;
    }
    // Normal text
    else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      
      // Check for bold key-value pairs (e.g. "**Target:** 5000 tons")
      if (trimmed.match(/^\*\*.*?\*\*:/)) {
         // Render the whole line
         const cleanText = trimmed.replace(/\*\*/g, '');
         const lines = doc.splitTextToSize(cleanText, contentWidth);
         checkPageBreak(lines.length * 5);
         doc.text(lines, margin, y);
         y += (lines.length * 5) + 2;
      } else {
         const cleanText = trimmed.replace(/\*\*/g, '');
         const lines = doc.splitTextToSize(cleanText, contentWidth);
         checkPageBreak(lines.length * 5);
         doc.text(lines, margin, y);
         y += (lines.length * 5) + 2;
      }
    }
  });
  
  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  doc.save(`mining-copilot-summary-${timestamp}.pdf`);
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  let html = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      html += '<br>';
      continue;
    }
    
    let processedLine = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    if (processedLine.startsWith('### ')) {
      html += `<h3>${processedLine.substring(4)}</h3>`;
    } else if (processedLine.startsWith('## ')) {
      html += `<h2>${processedLine.substring(3)}</h2>`;
    } else if (processedLine.startsWith('# ')) {
      html += `<h1>${processedLine.substring(2)}</h1>`;
    } else if (processedLine.startsWith('- ') || processedLine.startsWith('* ')) {
      html += `<p style="margin-left: 20px; text-indent: -15px; margin-top: 0; margin-bottom: 5px;">• ${processedLine.substring(2)}</p>`;
    } else {
      html += `<p>${processedLine}</p>`;
    }
  }

  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Export</title>
      <style>
        body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.15; }
        h1 { font-size: 18pt; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
        h2 { font-size: 14pt; font-weight: bold; color: #2c3e50; margin-top: 15px; margin-bottom: 8px; }
        h3 { font-size: 12pt; font-weight: bold; color: #34495e; margin-top: 10px; margin-bottom: 5px; }
        p { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      ${html}
    </body>
    </html>
  `;
}

export async function exportDocx(summary: string): Promise<Blob> {
  const lines = summary.split('\n');
  const children: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: trimmed.substring(4), bold: true })]
      }));
    } else if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: trimmed.substring(3), bold: true })]
      }));
    } else if (trimmed.startsWith('# ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: trimmed.substring(2), bold: true })]
      }));
    }
    // Bullets
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.substring(2);
      // Parse bold markers **text**
      const runs = parseBoldText(bulletText);
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: runs
      }));
    }
    // Normal text
    else {
      const runs = parseBoldText(trimmed);
      children.push(new Paragraph({ children: runs }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });

  return await Packer.toBlob(doc);
}

function parseBoldText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    runs.push(new TextRun({ text: match[1], bold: true }));
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
