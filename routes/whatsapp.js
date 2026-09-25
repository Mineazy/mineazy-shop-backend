const express = require('express');
const router = express.Router();
const twilioService = require('../utils/twilioService');
const chatbot = require('../utils/chatbot');

// Store messages to prevent duplicate processing
const processedMessages = new Set();

/**
 * GET /api/whatsapp/webhook
 * Webhook verification endpoint for Twilio
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.TWILIO_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * POST /api/whatsapp/webhook
 * Receive incoming WhatsApp messages from Twilio
 */
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { MessageSid, From, Body, NumMedia } = req.body;

    // Skip if no message or from group
    if (!From || !Body) {
      return res.sendStatus(200);
    }

    // Prevent duplicate processing
    if (processedMessages.has(MessageSid)) {
      return res.sendStatus(200);
    }
    processedMessages.add(MessageSid);

    // Clean old message IDs (keep last 1000)
    if (processedMessages.size > 1000) {
      const iterator = processedMessages.values();
      for (let i = 0; i < 500; i++) {
        processedMessages.delete(iterator.next().value);
      }
    }

    const phoneNumber = From.replace('whatsapp:', '');
    const messageBody = Body.trim();

    console.log(`WhatsApp message from ${phoneNumber}: ${messageBody}`);

    // Handle media messages
    if (NumMedia && parseInt(NumMedia) > 0) {
      await twilioService.sendTextMessage(
        phoneNumber,
        'Sorry, I can only process text messages. Please send a text message instead.'
      );
      return res.sendStatus(200);
    }

    // Process message through chatbot
    const response = await chatbot.handleMessage(phoneNumber, messageBody);

    // Send response
    await twilioService.sendTextMessage(phoneNumber, response);

    res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.sendStatus(200);
  }
});

/**
 * POST /api/whatsapp/send
 * Manually send a WhatsApp message (admin use)
 * Body: { to: "+263XXXXXXXXX", message: "Hello" }
 */
router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    const result = await twilioService.sendTextMessage(to, message);

    res.json({
      success: true,
      messageSid: result.sid,
      status: result.status
    });
  } catch (error) {
    console.error('Send WhatsApp message error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whatsapp/chat
 * Web chat endpoint - sends message to chatbot and returns response
 * Body: { message: "hi", sessionId?: "optional-session-id" }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const chatSessionId = sessionId || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const response = await chatbot.handleMessage(chatSessionId, message.trim());

    res.json({
      success: true,
      response,
      sessionId: chatSessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Sorry, Ezzie is having trouble right now. Please try again later.'
    });
  }
});

/**
 * GET /api/whatsapp/status
 * Check WhatsApp service status
 */
router.get('/status', (req, res) => {
  const configured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER
  );

  res.json({
    configured,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'Not configured',
    webhookUrl: process.env.TWILIO_WEBHOOK_URL || 'Not configured'
  });
});

module.exports = router;
