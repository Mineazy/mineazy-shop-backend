const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const moment = require('moment');

class PDFGenerator {
  constructor() {
    this.browser = null;
    this.logoDataUri = null;
    this.logoHash = null;
    this.localLogoPath = path.resolve(__dirname, '../mineazy-logo.png');
  }

  isProductionRuntime() {
    return (
      process.env.NODE_ENV === 'production' ||
      process.env.RENDER === 'true' ||
      Boolean(process.env.RENDER_SERVICE_NAME) ||
      process.env.IS_PULL_REQUEST === 'true'
    );
  }

  async getLogoSource() {
    if (process.env.INVOICE_LOGO_URL) {
      return process.env.INVOICE_LOGO_URL;
    }

    try {
      if (!fs.existsSync(this.localLogoPath)) {
        return '';
      }

      const buffer = fs.readFileSync(this.localLogoPath);
      const hash = crypto.createHash('sha1').update(buffer).digest('hex');

      if (this.logoDataUri && this.logoHash === hash) {
        return this.logoDataUri;
      }

      this.logoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      this.logoHash = hash;
      return this.logoDataUri;
    } catch (error) {
      console.warn('ΓÜá∩╕Å Failed to load invoice logo:', error.message);
      return '';
    }
  }

  findChromeFromPuppeteerCache() {
    const cacheRoot = '/opt/render/.cache/puppeteer/chrome';
    try {
      if (!fs.existsSync(cacheRoot)) return null;

      const platformDirs = fs
        .readdirSync(cacheRoot)
        .filter((entry) => entry.startsWith('linux-'))
        .sort()
        .reverse();

      for (const platformDir of platformDirs) {
        const platformPath = path.join(cacheRoot, platformDir);
        const subdirs = fs.readdirSync(platformPath).sort().reverse();

        for (const subdir of subdirs) {
          const candidate = path.join(platformPath, subdir, 'chrome');
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    } catch (error) {
      console.warn('ΓÜá∩╕Å Error searching puppeteer cache:', error.message);
    }

    return null;
  }

  resolveExecutablePath() {
    const candidates = [];

    if (process.env.CHROME_PATH) {
      candidates.push(process.env.CHROME_PATH);
    }

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      // Ignore wildcard-style paths from env and resolve dynamically instead.
      if (!process.env.PUPPETEER_EXECUTABLE_PATH.includes('*')) {
        candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
      }
    }

    candidates.push(this.findChromeFromPuppeteerCache());
    candidates.push('/usr/bin/chromium');
    candidates.push('/usr/bin/chromium-browser');
    candidates.push('/usr/bin/google-chrome-stable');
    candidates.push('/usr/bin/google-chrome');
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (error) {
        // Continue checking remaining candidates.
      }
    }

    return null;
  }

  async initBrowser() {
    if (this.browser) {
      return this.browser;
    }

    console.log('≡ƒÜÇ Initializing invoice PDF browser...');

    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process'
    ];

    const executableFromEnv = this.resolveExecutablePath();
    let executableFromSparticuz = null;

    try {
      executableFromSparticuz = await chromium.executablePath();
    } catch (error) {
      console.warn('ΓÜá∩╕Å Could not resolve @sparticuz/chromium path:', error.message);
    }

    const launchPlans = [];

    if (this.isProductionRuntime()) {
      launchPlans.push({
        name: 'sparticuz',
        executablePath: executableFromSparticuz,
        args: [...baseArgs, ...(chromium.args || [])],
        viewport: chromium.defaultViewport || { width: 1280, height: 720 }
      });
    }

    launchPlans.push({
      name: 'resolved-path',
      executablePath: executableFromEnv,
      args: baseArgs,
      viewport: { width: 1280, height: 720 }
    });

    launchPlans.push({
      name: 'default-chrome',
      executablePath: null,
      args: baseArgs,
      viewport: { width: 1280, height: 720 }
    });

    let lastError = null;

    for (const plan of launchPlans) {
      if (!plan.executablePath && plan.name !== 'default-chrome') continue;

      try {
        const config = {
          headless: 'new',
          args: plan.args,
          defaultViewport: plan.viewport,
          ignoreHTTPSErrors: true,
          ignoreDefaultArgs: ['--disable-extensions']
        };

        if (plan.executablePath) {
          config.executablePath = plan.executablePath;
        }

        console.log(`≡ƒöº Launching browser with plan: ${plan.name}`);
        if (plan.executablePath) {
          console.log(`≡ƒôü Chrome path: ${plan.executablePath}`);
        }

        this.browser = await puppeteer.launch(config);
        console.log('Γ£à Invoice PDF browser initialized');
        return this.browser;
      } catch (error) {
        lastError = error;
        console.warn(`ΓÜá∩╕Å Browser launch plan failed (${plan.name}):`, error.message);
      }
    }

    throw new Error(`Unable to launch browser for PDF generation: ${lastError?.message || 'unknown error'}`);
  }

  async generateInvoice(order, options = {}) {
    const { allowHtmlFallback = true } = options;

    try {
      const pdfBuffer = await this.renderInvoicePdfBuffer(order);
      return pdfBuffer;
    } catch (error) {
      console.error('Γ¥î Invoice PDF generation failed:', error.message);

      if (!allowHtmlFallback) {
        throw error;
      }

      const logoSrc = await this.getLogoSource();
      const html = this.generateInvoiceHTML(order, logoSrc);
      return {
        isHtml: true,
        buffer: Buffer.from(html, 'utf-8'),
        html
      };
    }
  }

  async renderInvoicePdfBuffer(order) {
    let page = null;

    try {
      await this.initBrowser();
      page = await this.browser.newPage();

      await page.setViewport({ width: 1200, height: 1600 });

      const logoSrc = await this.getLogoSource();
      const html = this.generateInvoiceHTML(order, logoSrc);

      await page.setContent(html, {
        waitUntil: ['domcontentloaded', 'networkidle0'],
        timeout: 45000
      });

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        timeout: 45000,
        preferCSSPageSize: false
      });

      // Puppeteer may return a Uint8Array in some runtimes; normalize to Buffer.
      const pdfBuffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
      const isPdf = pdfBuffer.slice(0, 4).toString() === '%PDF';
      if (!isPdf) {
        throw new Error('Generated file is not a valid PDF');
      }

      return pdfBuffer;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          console.warn('ΓÜá∩╕Å Failed to close invoice page:', closeError.message);
        }
      }
    }
  }

  generateInvoiceHTML(order, logoSrc = '') {
    const invoiceDate = moment(order.createdAt).format('MMMM DD, YYYY');
    const dueDate = moment(order.createdAt).add(30, 'days').format('MMMM DD, YYYY');

    const firstName = order?.customerInfo?.firstName || '';
    const lastName = order?.customerInfo?.lastName || '';
    const email = order?.customerInfo?.email || '';
    const phone = order?.customerInfo?.phone || '';
    const address = order?.customerInfo?.address || {};
    const street = address?.street || '';
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
          .logo-wrap { background: #ffffff; border: 1px solid #e3e8f2; border-radius: 10px; padding: 14px; width: fit-content; margin-bottom: 14px; }
          .logo { height: 52px; width: auto; display: block; object-fit: contain; }
          .company-name { font-size: 24px; font-weight: 700; color: #1f2f5e; margin-bottom: 4px; letter-spacing: 0.5px; }
          .company-tagline { font-size: 13px; color: #4f5e78; margin-bottom: 12px; }
          .company-details { color: #5c6a82; font-size: 12px; line-height: 1.75; }
          .invoice-panel { width: 320px; background: #1f2f5e; color: #ffffff; padding: 28px; }
          .invoice-title { font-size: 26px; font-weight: 700; color: #f6f451; margin-bottom: 8px; letter-spacing: 1.2px; }
          .invoice-number { font-size: 16px; font-weight: 600; margin-bottom: 14px; }
          .invoice-date-info { font-size: 12px; color: rgba(255, 255, 255, 0.9); line-height: 1.8; }

          .main-content { background-color: #ffffff; border-left: 2px solid #d8deea; border-right: 2px solid #d8deea; border-bottom: 2px solid #d8deea; padding: 32px; border-radius: 0 0 12px 12px; }
          .billing-section { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 24px; }
          .billing-info, .invoice-details { flex: 1; background-color: #f7f9fc; padding: 20px; border-radius: 8px; border: 1px solid #e3e8f2; }
          .section-title { font-size: 13px; font-weight: 700; color: #1f2f5e; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.8px; }
          .customer-name { font-weight: 700; font-size: 15px; color: #1f2f5e; margin-bottom: 6px; }
          .customer-details { color: #4f5e78; line-height: 1.8; }
          .detail-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e3e8f2; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { font-weight: 600; color: #5c6a82; }
          .detail-value { color: #223047; font-weight: 500; }
          .payment-status { display: inline-block; padding: 6px 14px; border-radius: 16px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
          .status-paid { background-color: #e6f6eb; color: #0f7a3d; border: 1px solid #bde7cb; }
          .status-pending { background-color: #fff6e0; color: #9b6a00; border: 1px solid #ffe0a3; }
          .status-awaiting { background-color: #e8f4ff; color: #0b5e9f; border: 1px solid #c6e2ff; }

          .accent-line { height: 3px; background: linear-gradient(90deg, #1f2f5e 0%, #f6f451 100%); margin: 20px 0 24px 0; border-radius: 2px; }

          .items-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 26px; border-radius: 8px; overflow: hidden; border: 1px solid #d8deea; }
          .items-table thead { background: #1f2f5e; }
          .items-table th { color: white; padding: 13px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.8px; }
          .items-table td { padding: 13px; border-bottom: 1px solid #e7ecf4; background-color: white; }
          .items-table tbody tr:last-child td { border-bottom: none; }
          .item-name { font-weight: 600; color: #1f2f5e; margin-bottom: 3px; }
          .item-sku { color: #6b7890; font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }

          .totals-section { display: flex; justify-content: flex-end; margin-top: 18px; }
          .totals-table { width: 360px; border-radius: 8px; overflow: hidden; border: 1px solid #d8deea; }
          .totals-table td { padding: 12px 16px; background-color: #f7f9fc; }
          .totals-table tr { border-bottom: 1px solid #e3e8f2; }
          .totals-table tr:last-child { border-bottom: none; }
          .totals-label { font-weight: 600; color: #5c6a82; }
          .totals-value { text-align: right; color: #223047; font-weight: 600; }
          .total-row { background: #1f2f5e !important; }
          .total-row td { color: white !important; font-size: 17px; font-weight: 700; padding: 14px 16px !important; background: transparent !important; }
          .total-amount { color: #f6f451 !important; font-size: 21px !important; }

          .notes-section { margin-top: 28px; padding: 16px; background-color: #fffaf0; border: 1px solid #ffe2a8; border-radius: 8px; }
          .notes-title { font-weight: 700; color: #1f2f5e; margin-bottom: 8px; }
          .notes-content { color: #4f5e78; line-height: 1.7; }

          .footer { margin-top: 34px; padding-top: 18px; border-top: 1px solid #d8deea; text-align: center; }
          .footer-thank-you { font-size: 16px; font-weight: 700; color: #1f2f5e; margin-bottom: 8px; }
          .footer-contact { color: #5c6a82; font-size: 12px; line-height: 1.8; }
          .footer-highlight { color: #1f2f5e; font-weight: 700; }

          @media print {
            body { background-color: white; }
            .container { max-width: 100%; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-content">
              <div class="company-panel">
                ${logoSrc ? `
                  <div class="logo-wrap">
                    <img src="${logoSrc}" alt="MineAzy Logo" class="logo" />
                  </div>
                ` : ''}
                <div class="company-name">MINEAZY</div>
                <div class="company-tagline">Mining Equipment & Solutions</div>
                <div class="company-details">
                  15 Plumtree Road, Belmont<br>
                  Bulawayo, Zimbabwe<br>
                  +263-712-290-046<br>
                  info@mineazy.co.zw<br>
                  www.mineazy.co.zw
                </div>
              </div>

              <div class="invoice-panel">
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">${order.orderNumber}</div>
                <div class="invoice-date-info">
                  <div>Issued: ${invoiceDate}</div>
                  <div>Due: ${dueDate}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="main-content">
            <div class="billing-section">
              <div class="billing-info">
                <div class="section-title">Bill To</div>
                <div class="customer-name">${firstName} ${lastName}</div>
                <div class="customer-details">
                  ${email}<br>
                  ${phone}<br>
                  ${street}<br>
                  ${city}${state ? `, ${state}` : ''}<br>
                  ${zipCode} ${country}
                </div>
              </div>

              <div class="invoice-details">
                <div class="section-title">Invoice Details</div>
                <div class="detail-row">
                  <span class="detail-label">Payment Method:</span>
                  <span class="detail-value" style="text-transform: capitalize;">${paymentMethod}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Order Date:</span>
                  <span class="detail-value">${invoiceDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Due Date:</span>
                  <span class="detail-value">${dueDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Payment Status:</span>
                  <span class="payment-status ${this.getStatusClass(order.paymentStatus)}">${paymentStatus}</span>
                </div>
              </div>
            </div>

            <div class="accent-line"></div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 45%;">Item Description</th>
                  <th class="text-center" style="width: 15%;">Quantity</th>
                  <th class="text-right" style="width: 20%;">Unit Price</th>
                  <th class="text-right" style="width: 20%;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map((item) => `
                  <tr>
                    <td>
                      <div class="item-name">${item.name}</div>
                      <div class="item-sku">SKU: ${item.sku || 'N/A'}</div>
                    </td>
                    <td class="text-center" style="font-weight: 600; color: #1f2f5e;">${item.quantity}</td>
                    <td class="text-right" style="font-weight: 500;">$${Number(item.price || 0).toFixed(2)}</td>
                    <td class="text-right" style="font-weight: 600; color: #1f2f5e;">$${Number(item.total || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="totals-section">
              <table class="totals-table">
                <tr>
                  <td class="totals-label">Subtotal:</td>
                  <td class="totals-value">$${subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="totals-label">Tax (VAT 15.5%):</td>
                  <td class="totals-value">$${tax.toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                  <td>TOTAL AMOUNT</td>
                  <td class="text-right total-amount">$${total.toFixed(2)}</td>
                </tr>
              </table>
            </div>

            ${order.notes ? `
              <div class="notes-section">
                <div class="notes-title">Additional Notes</div>
                <div class="notes-content">${order.notes}</div>
              </div>
            ` : ''}

            <div class="footer">
              <div class="footer-thank-you">Thank you for your business</div>
              <div class="footer-contact">
                For invoice questions, contact
                <span class="footer-highlight">accounts@mineazy.co.zw</span>
                or
                <span class="footer-highlight">+263-712-290-046</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getStatusClass(status) {
    switch (status) {
      case 'paid':
        return 'status-paid';
      case 'pending':
        return 'status-pending';
      case 'awaiting_payment':
      case 'payment_on_delivery':
      case 'payment_on_collection':
        return 'status-awaiting';
      default:
        return 'status-pending';
    }
  }

  async closeBrowser() {
    if (!this.browser) return;

    try {
      await this.browser.close();
    } catch (error) {
      console.error('Γ¥î Error closing invoice browser:', error.message);
    } finally {
      this.browser = null;
    }
  }
}

module.exports = new PDFGenerator();
