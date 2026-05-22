const emailService = require('./emailService');
const pdfGenerator = require('./pdfGenerator');

async function sendOrderConfirmationWithInvoice(order) {
  const attachments = [];

  try {
    const invoiceResult = await pdfGenerator.generateInvoice(order, { allowHtmlFallback: false });
    if (invoiceResult && Buffer.isBuffer(invoiceResult)) {
      attachments.push({
        filename: `invoice-${order.orderNumber}.pdf`,
        content: invoiceResult,
        contentType: 'application/pdf'
      });
    }
  } catch (invoiceError) {
    console.error('ΓÜá∩╕Å Failed to generate invoice attachment:', invoiceError.message);
  }

  await emailService.sendOrderConfirmation(order, attachments);
}

module.exports = {
  sendOrderConfirmationWithInvoice
};
