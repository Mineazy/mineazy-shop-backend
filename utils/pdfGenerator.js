const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const moment = require('moment');

class PDFGenerator {
  constructor() {
    this.localLogoPath = path.resolve(__dirname, '../mineazy-logo.png');
  }

  async getLogoSrc() {
    if (process.env.INVOICE_LOGO_URL) return process.env.INVOICE_LOGO_URL;
    try {
      if (!fs.existsSync(this.localLogoPath)) return null;
      const buf = fs.readFileSync(this.localLogoPath);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch { return null; }
  }

  async generateInvoicePDF(order) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', b => buffers.push(b));
    const pdfEnd = new Promise(resolve => doc.on('end', resolve));

    const pageW = doc.page.width - 100;
    const primary = '#1f2f5e';
    const accent = '#f6f451';
    const gray = '#5c6a82';
    const light = '#f7f9fc';
    const border = '#d8deea';

    // Helper functions
    const bold = () => doc.font('Helvetica-Bold');
    const normal = () => doc.font('Helvetica');
    const moveTo = (x, y) => doc.moveTo(x, y);
    const lineTo = (x, y) => doc.lineTo(x, y);

    // ── Header Bar ──
    doc.rect(50, 50, pageW, 110).fill(light).stroke(border);

    let xOff = 60;
    // Logo
    try {
      const logo = await this.getLogoSrc();
      if (logo && logo.startsWith('data:')) {
        const base64 = logo.split(',')[1];
        doc.image(Buffer.from(base64, 'base64'), xOff, 60, { width: 50, height: 50 });
      }
    } catch {}
    xOff += 60;

    bold().fontSize(22).fill(primary).text('MINEAZY', xOff, 62);
    normal().fontSize(10).fill(gray).text('Mining Equipment & Solutions', xOff, 88);
    normal().fontSize(8).fill(gray)
      .text('15 Plumtree Road, Belmont, Bulawayo, Zimbabwe', xOff, 106)
      .text('+263-712-290-046 | info@mineazy.co.zw | www.mineazy.co.zw', xOff, 120);

    // Invoice Panel (right side)
    const panelX = pageW - 200 + 50;
    doc.roundedRect(panelX, 55, 195, 100, 8).fill(primary);
    bold().fontSize(20).fill(accent).text('INVOICE', panelX + 15, 65);
    bold().fontSize(11).fill('#ffffff').text(order.orderNumber || '', panelX + 15, 92);
    normal().fontSize(8).fill('rgba(255,255,255,0.85)');
    const invDate = moment(order.createdAt).format('MMMM DD, YYYY');
    doc.text(`Issued: ${invDate}`, panelX + 15, 112);
    const dueDate = moment(order.createdAt).add(30, 'days').format('MMMM DD, YYYY');
    doc.text(`Due: ${dueDate}`, panelX + 15, 128);

    // ── Billing Section ──
    const billingY = 180;
    const halfW = (pageW - 20) / 2;
    const boxH = 85;

    // Bill To box
    doc.rect(50, billingY, halfW, boxH).fill(light).stroke(border);
    bold().fontSize(8).fill(primary).text('BILL TO', 60, billingY + 8);
    const ci = order.customerInfo || {};
    const nameParts = (ci.name || '').split(' ');
    const fName = ci.firstName || nameParts[0] || '';
    const lName = ci.lastName || nameParts.slice(1).join(' ') || '';
    const addr = ci.address || {};
    const street = (typeof addr === 'string' ? addr : addr?.street) || '';
    const city = addr?.city || '';
    const state = addr?.state || '';
    const country = addr?.country || '';
    const zip = addr?.zipCode || '';

    bold().fontSize(10).fill(primary).text(`${fName} ${lName}`.trim(), 60, billingY + 24);
    normal().fontSize(8).fill(gray);
    const billLines = [ci.email, ci.phone, street, `${city}${state ? ', ' + state : ''} ${zip} ${country}`.trim()].filter(Boolean);
    let by = billingY + 44;
    for (const line of billLines) {
      doc.text(line, 60, by);
      by += 13;
    }

    // Invoice Details box
    const detailsX = 70 + halfW;
    doc.rect(detailsX, billingY, halfW, boxH).fill(light).stroke(border);
    bold().fontSize(8).fill(primary).text('INVOICE DETAILS', detailsX + 10, billingY + 8);
    const payMethod = (order.paymentMethod || '').replace(/_/g, ' ');
    const payStatus = (order.paymentStatus || 'pending').replace(/_/g, ' ');
    const details = [
      ['Payment Method:', payMethod],
      ['Order Date:', invDate],
      ['Due Date:', dueDate],
      ['Payment Status:', payStatus]
    ];
    let dy = billingY + 28;
    for (const [label, val] of details) {
      normal().fontSize(8).fill(gray).text(label, detailsX + 10, dy);
      bold().fontSize(8).fill(primary).text(val, detailsX + 100, dy);
      dy += 14;
    }

    // ── Accent Line ──
    const lineY = billingY + boxH + 16;
    const grad = doc.linearGradient(50, lineY, 50 + pageW, lineY);
    grad.stop(0, primary).stop(1, accent);
    doc.rect(50, lineY, pageW, 3).fill(grad);

    // ── Items Table ──
    const tableY = lineY + 20;
    const colW = [pageW * 0.42, pageW * 0.15, pageW * 0.20, pageW * 0.23];
    const colX = [50, 60 + colW[0], 70 + colW[0] + colW[1], 75 + colW[0] + colW[1] + colW[2]];
    const headers = ['Item Description', 'Qty', 'Unit Price', 'Total'];
    const alignH = ['left', 'center', 'right', 'right'];

    // Table header
    doc.rect(50, tableY, pageW, 22).fill(primary);
    let hx = 50;
    bold().fontSize(8).fill('#ffffff');
    for (let i = 0; i < headers.length; i++) {
      const a = alignH[i];
      const opts = { width: colW[i], align: a };
      if (i > 0) hx += colW[i - 1];
      doc.text(headers[i], hx + (i === 0 ? 10 : i === 3 ? 8 : 5), tableY + 6, opts);
    }

    // Table rows
    const items = order.items || [];
    let rowY = tableY + 22;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowH = 32;
      const bg = i % 2 === 0 ? '#ffffff' : light;
      doc.rect(50, rowY, pageW, rowH).fill(bg);

      hx = 50;
      for (let j = 0; j < 4; j++) {
        const a = alignH[j];
        const pad = j === 0 ? 10 : j === 3 ? 8 : 5;
        let text = '';
        if (j === 0) text = `${item.name}\nSKU: ${item.sku || 'N/A'}`;
        else if (j === 1) text = String(item.quantity || 0);
        else if (j === 2) text = `$${Number(item.price || 0).toFixed(2)}`;
        else text = `$${Number(item.total || item.price * item.quantity || 0).toFixed(2)}`;

        if (j === 0) {
          bold().fontSize(8).fill(primary).text(item.name, hx + pad, rowY + 4, { width: colW[j] - pad * 2 });
          normal().fontSize(7).fill(gray).text(`SKU: ${item.sku || 'N/A'}`, hx + pad, rowY + 18, { width: colW[j] - pad * 2 });
        } else {
          const valY = rowY + 8;
          if (j === 3) bold().fontSize(9).fill(primary);
          else normal().fontSize(9).fill(primary);
          doc.text(text, hx + pad, valY, { width: colW[j] - pad * 2, align: a });
        }
        if (j > 0) hx += colW[j - 1];
      }
      rowY += rowH;
    }

    // ── Totals Section ──
    const totalsX = 50 + pageW - 280;
    const totalsW = 280;
    const totalsY = rowY + 10;
    const totals = [
      ['Subtotal:', order.subtotal, 24],
      ['Tax (VAT 15.5%):', order.tax, 24],
      ['TOTAL AMOUNT:', order.total, 28]
    ];

    const totalH = totals.reduce((s, r) => s + r[2], 0);
    doc.rect(totalsX, totalsY, totalsW, totalH).fill(light).stroke('#d8deea');

    const valWidth = 100;
    const labelWidth = totalsW - valWidth - 28;

    let tY = totalsY;
    for (const [label, val, rowH] of totals) {
      const isTotal = label === 'TOTAL AMOUNT:';
      if (isTotal) {
        doc.rect(totalsX, tY, totalsW, rowH).fill('#1f2f5e');
        bold().fontSize(12).fill('#f6f451').text(label, totalsX + 14, tY + 6, { width: labelWidth });
        bold().fontSize(14).fill('#f6f451').text(`$${Number(val || 0).toFixed(2)}`, totalsX + totalsW - 14 - valWidth, tY + 5, { width: valWidth, align: 'right' });
      } else {
        normal().fontSize(9).fill('#5c6a82').text(label, totalsX + 14, tY + 5, { width: labelWidth });
        normal().fontSize(9).fill('#1f2f5e').text(`$${Number(val || 0).toFixed(2)}`, totalsX + totalsW - 14 - valWidth, tY + 5, { width: valWidth, align: 'right' });
      }
      tY += rowH;
    }

    // ── Footer ──
    const footerY = Math.max(tY + 20, doc.page.height - 120);
    const remaining = doc.page.height - footerY - 50;
    if (remaining > 60) {
      doc.rect(50, footerY, pageW, 1).fill(border);
      bold().fontSize(11).fill(primary).text('Thank you for your business', 50, footerY + 12, { align: 'center', width: pageW });
      normal().fontSize(8).fill(gray).text(
        'For invoice questions, contact accounts@mineazy.co.zw or +263-712-290-046',
        50, footerY + 30, { align: 'center', width: pageW }
      );
    }

    doc.end();
    await pdfEnd;
    return Buffer.concat(buffers);
  }

  async generateInvoice(order, options = {}) {
    try {
      const pdfBuffer = await this.generateInvoicePDF(order);
      return pdfBuffer;
    } catch (error) {
      console.error('PDF generation with pdfkit failed:', error.message);
      if (options.allowHtmlFallback !== false) {
        const logoSrc = await this.getLogoSrc();
        const html = this.generateInvoiceHTML(order, logoSrc || '');
        return { isHtml: true, html };
      }
      throw error;
    }
  }

  generateInvoiceHTML(order, logoSrc = '') {
    const invoiceDate = moment(order.createdAt).format('MMMM DD, YYYY');
    const dueDate = moment(order.createdAt).add(30, 'days').format('MMMM DD, YYYY');

    const ci = order?.customerInfo || {};
    const nameParts = (ci.name || '').split(' ');
    const firstName = ci.firstName || nameParts[0] || '';
    const lastName = ci.lastName || nameParts.slice(1).join(' ') || '';
    const email = ci.email || '';
    const phone = ci.phone || '';
    const address = ci.address || {};
    const street = (typeof address === 'string' ? address : address?.street) || '';
    const city = address?.city || '';
    const state = address?.state || '';
    const country = address?.country || '';
    const zipCode = address?.zipCode || '';

    const paymentMethod = (order.paymentMethod || '').replace(/_/g, ' ');
    const paymentStatus = (order.paymentStatus || 'pending').replace(/_/g, ' ');

    const subtotal = Number(order.subtotal || 0);
    const tax = Number(order.tax || 0);
    const total = Number(order.total || 0);

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8">
        <title>Invoice ${order.orderNumber}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; line-height: 1.6; color: #223047; background-color: #ffffff; }
          .container { max-width: 900px; margin: 0 auto; padding: 30px; }
          .header { background: #ffffff; border: 2px solid #d8deea; border-radius: 12px 12px 0 0; overflow: hidden; }
          .header-content { display: flex; justify-content: space-between; align-items: stretch; }
          .company-panel { flex: 1; background: #ffffff; padding: 28px; }
          .company-name { font-size: 24px; font-weight: 700; color: #1f2f5e; margin-bottom: 4px; letter-spacing: 0.5px; }
          .company-tagline { font-size: 13px; color: #4f5e78; margin-bottom: 12px; }
          .company-details { color: #5c6a82; font-size: 12px; line-height: 1.75; }
          .invoice-panel { width: 320px; background: #1f2f5e; color: #ffffff; padding: 28px; }
          .invoice-title { font-size: 26px; font-weight: 700; color: #f6f451; margin-bottom: 8px; letter-spacing: 1.2px; }
          .main-content { background-color: #ffffff; border-left: 2px solid #d8deea; border-right: 2px solid #d8deea; border-bottom: 2px solid #d8deea; padding: 32px; border-radius: 0 0 12px 12px; }
          .billing-section { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 24px; }
          .billing-info, .invoice-details { flex: 1; background-color: #f7f9fc; padding: 20px; border-radius: 8px; border: 1px solid #e3e8f2; }
          .section-title { font-size: 13px; font-weight: 700; color: #1f2f5e; text-transform: uppercase; margin-bottom: 12px; }
          .items-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 26px; border-radius: 8px; overflow: hidden; border: 1px solid #d8deea; }
          .items-table thead { background: #1f2f5e; }
          .items-table th { color: white; padding: 13px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 11px; }
          .items-table td { padding: 13px; border-bottom: 1px solid #e7ecf4; background-color: white; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .totals-section { display: flex; justify-content: flex-end; margin-top: 18px; }
          .totals-table { width: 360px; border-radius: 8px; overflow: hidden; border: 1px solid #d8deea; }
          .totals-table td { padding: 12px 16px; background-color: #f7f9fc; }
          .total-row { background: #1f2f5e !important; }
          .total-row td { color: white !important; font-size: 17px; font-weight: 700; }
          .total-amount { color: #f6f451 !important; font-size: 21px !important; }
          .footer { margin-top: 34px; padding-top: 18px; border-top: 1px solid #d8deea; text-align: center; }
          @media print { .container { max-width: 100%; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-content">
              <div class="company-panel">
                <div class="company-name">MINEAZY</div>
                <div class="company-tagline">Mining Equipment & Solutions</div>
                <div class="company-details">15 Plumtree Road, Belmont<br>Bulawayo, Zimbabwe<br>+263-712-290-046<br>info@mineazy.co.zw<br>www.mineazy.co.zw</div>
              </div>
              <div class="invoice-panel">
                <div class="invoice-title">INVOICE</div>
                <div style="font-size:14px;font-weight:600;margin-bottom:10px;">${order.orderNumber}</div>
                <div style="font-size:12px;opacity:0.9;">Issued: ${invoiceDate}<br>Due: ${dueDate}</div>
              </div>
            </div>
          </div>
          <div class="main-content">
            <div class="billing-section">
              <div class="billing-info">
                <div class="section-title">Bill To</div>
                <div style="font-weight:700;font-size:15px;color:#1f2f5e;margin-bottom:6px;">${firstName} ${lastName}</div>
                <div style="color:#4f5e78;line-height:1.8;">${email}<br>${phone}<br>${street}<br>${city}${state ? ', ' + state : ''}<br>${zipCode} ${country}</div>
              </div>
              <div class="invoice-details">
                <div class="section-title">Invoice Details</div>
                <div style="margin-bottom:6px;"><strong>Payment:</strong> ${paymentMethod}</div>
                <div style="margin-bottom:6px;"><strong>Order Date:</strong> ${invoiceDate}</div>
                <div style="margin-bottom:6px;"><strong>Due Date:</strong> ${dueDate}</div>
                <div><strong>Status:</strong> ${paymentStatus}</div>
              </div>
            </div>
            <div style="height:3px;background:linear-gradient(90deg,#1f2f5e 0%,#f6f451 100%);margin:20px 0 24px;border-radius:2px;"></div>
            <table class="items-table">
              <thead><tr>
                <th style="width:45%;">Item Description</th>
                <th class="text-center" style="width:15%;">Quantity</th>
                <th class="text-right" style="width:20%;">Unit Price</th>
                <th class="text-right" style="width:20%;">Total</th>
              </tr></thead>
              <tbody>
                ${(order.items || []).map(item => `
                  <tr>
                    <td><div style="font-weight:600;color:#1f2f5e;">${item.name}</div><div style="color:#6b7890;font-size:11px;">SKU: ${item.sku || 'N/A'}</div></td>
                    <td class="text-center" style="font-weight:600;">${item.quantity}</td>
                    <td class="text-right">$${Number(item.price || 0).toFixed(2)}</td>
                    <td class="text-right" style="font-weight:600;color:#1f2f5e;">$${Number(item.total || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals-section">
              <table class="totals-table">
                <tr><td style="font-weight:600;">Subtotal:</td><td class="text-right">$${subtotal.toFixed(2)}</td></tr>
                <tr><td style="font-weight:600;">Tax (VAT 15.5%):</td><td class="text-right">$${tax.toFixed(2)}</td></tr>
                <tr class="total-row"><td>TOTAL AMOUNT</td><td class="text-right total-amount">$${total.toFixed(2)}</td></tr>
              </table>
            </div>
            <div class="footer">
              <div style="font-size:16px;font-weight:700;color:#1f2f5e;margin-bottom:8px;">Thank you for your business</div>
              <div style="color:#5c6a82;font-size:12px;">For invoice questions, contact accounts@mineazy.co.zw or +263-712-290-046</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new PDFGenerator();
