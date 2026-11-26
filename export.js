/**
 * export.js – esportazione in Excel (.xlsx) e stampa/PDF, senza librerie esterne
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Exporter.xlsx(nomeFile, fogli)  crea un vero file .xlsx (Office Open XML) e lo scarica.
 *   fogli: [{ name, title?, subtitle?, columns: [{ header, width?, type? ('text'|'number'|'date') }], rows: [[...]] }]
 *   Le date vanno passate come 'YYYY-MM-DD': in Excel diventano date vere (ordinabili e filtrabili).
 * Exporter.print(titoloDocumento)  stampa la parte della pagina marcata .print-only
 *   (dal menu di stampa si può scegliere "Salva come PDF").
 */
const Exporter = (() => {
  /* ---------- ZIP senza compressione (formato "store") ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let offset = 0;
    files.forEach(([name, text]) => {
      const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nb);
      offset += 30 + nb.length + data.length;
    });
    const csize = central.reduce((s, p) => s + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- Foglio di calcolo ---------- */
  const x = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const serial = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return null; return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000); };
  /* stili: 0 normale, 1 intestazione, 2 titolo, 3 data, 4 sottotitolo, 5 numero in grassetto */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0B2A4E"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5E6776"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2A4E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFC6A15B"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  function sheetXml(sh) {
    const rows = []; let r = 0;
    const cell = (c, v, type, style) => {
      const ref = col(c) + (r + 1);
      if (v === null || v === undefined || v === '') return '';
      if (type === 'date') { const n = serial(v); if (n !== null) return `<c r="${ref}" s="3"><v>${n}</v></c>`; }
      if (type === 'number' && !isNaN(Number(v))) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${Number(v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    };
    if (sh.title) { rows.push(`<row r="${r + 1}" ht="22" customHeight="1">${cell(0, sh.title, 'text', 2)}</row>`); r++; }
    if (sh.subtitle) { rows.push(`<row r="${r + 1}">${cell(0, sh.subtitle, 'text', 4)}</row>`); r++; }
    if (sh.title || sh.subtitle) r++;
    const headRow = r;
    rows.push(`<row r="${r + 1}">${sh.columns.map((c, i) => cell(i, c.header, 'text', 1)).join('')}</row>`); r++;
    sh.rows.forEach((row) => { rows.push(`<row r="${r + 1}">${row.map((v, i) => cell(i, v, (sh.columns[i] || {}).type)).join('')}</row>`); r++; });
    const last = col(sh.columns.length - 1);
    const pane = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow + 1}" topLeftCell="A${headRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    const cols = `<cols>${sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('')}</cols>`;
    const filter = sh.rows.length ? `<autoFilter ref="A${headRow + 1}:${last}${headRow + 1 + sh.rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows.join('')}</sheetData>${filter}</worksheet>`;
  }
  function xlsxBlob(sheets) {
    const names = []; const safe = (n, i) => { let s = String(n || `Foglio${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Foglio${i + 1}`; while (names.includes(s)) s = s.slice(0, 28) + ' ' + (i + 1); names.push(s); return s; };
    const sh = sheets.map((s, i) => ({ ...s, safeName: safe(s.name, i) }));
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sh.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sh.map((s, i) => `<sheet name="${x(s.safeName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sh.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sh.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', STYLES],
      ...sh.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])
    ];
    return zip(files);
  }
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return {
    xlsxBlob,
    xlsx(filename, sheets) { download(xlsxBlob(sheets), filename.endsWith('.xlsx') ? filename : filename + '.xlsx'); },
    /* Stampa la parte .print-only della pagina; il titolo diventa il nome proposto per il PDF */
    print(docTitle) {
      const old = document.title;
      if (docTitle) document.title = docTitle;
      document.documentElement.classList.add('printing');
      const done = () => { document.title = old; document.documentElement.classList.remove('printing'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
    }
  };
})();
window.Exporter = Exporter;
