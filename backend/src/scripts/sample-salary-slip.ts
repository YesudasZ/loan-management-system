/**
 * Builds a small, valid one-page PDF for demo salary slips (the seed has no real documents).
 * Plain ASCII only, so string length equals byte length for the xref offsets.
 */
export function createSampleSalarySlipPdf(employeeName: string): Buffer {
  const text = `Demo salary slip - ${employeeName}`.replace(/[^\x20-\x7e]|[()\\]/g, '');
  const content = `BT /F1 20 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  const xrefEntries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries.join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
