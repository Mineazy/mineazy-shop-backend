const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.client = null;

    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    }
  }

  ensureClient() {
    if (!this.client) {
      throw new Error('Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    }
  }

  /**
   * Send a text message via WhatsApp
   * @param {string} to - Recipient phone number (E.164 format)
   * @param {string} body - Message text
   * @returns {Promise<Object>} Twilio message resource
   */
  async sendTextMessage(to, body) {
    this.ensureClient();

    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const formattedFrom = this.whatsappNumber.startsWith('whatsapp:') ? this.whatsappNumber : `whatsapp:${this.whatsappNumber}`;

    try {
      const message = await this.client.messages.create({
        from: formattedFrom,
        to: formattedTo,
        body
      });
      console.log(`WhatsApp message sent to ${to}, SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error.message);
      throw error;
    }
  }

  /**
   * Send a template message (for initiating conversations outside 24h window)
   * @param {string} to - Recipient phone number
   * @param {string} templateSid - Twilio content template SID
   * @param {Object} variables - Template variables
   * @returns {Promise<Object>}
   */
  async sendTemplateMessage(to, templateSid, variables = {}) {
    this.ensureClient();

    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const formattedFrom = this.whatsappNumber.startsWith('whatsapp:') ? this.whatsappNumber : `whatsapp:${this.whatsappNumber}`;

    try {
      const message = await this.client.messages.create({
        from: formattedFrom,
        to: formattedTo,
        contentSid: templateSid,
        contentVariables: JSON.stringify(variables)
      });
      console.log(`WhatsApp template message sent to ${to}, SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('Failed to send WhatsApp template message:', error.message);
      throw error;
    }
  }

  /**
   * Validate that a request is from Twilio
   * @param {string} url - Full request URL
   * @param {Object} params - Request body params
   * @param {string} signature - X-Twilio-Signature header
   * @returns {boolean}
   */
  validateRequest(url, params, signature) {
    return twilio.validateRequest(this.authToken, signature, url, params);
  }
}

module.exports = new TwilioService();
