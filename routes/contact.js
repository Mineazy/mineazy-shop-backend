const express = require('express');
const ContactMessage = require('../models/ContactMessage');
const { auth, authorize } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware
const contactValidation = [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('subject').notEmpty().trim().withMessage('Subject is required'),
  body('message').notEmpty().trim().withMessage('Message is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// @route   POST /api/contact
// @desc    Submit contact form
// @access  Public
router.post('/', contactValidation, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    const contactMessage = new ContactMessage({
      name,
      email,
      phone,
      subject,
      message
    });

    await contactMessage.save();

    // Send notification email to admin
    try {
      await emailService.sendEmail(
        process.env.EMAIL_USER,
        `New Contact Form Submission: ${subject}`,
        `
          <h3>New Contact Form Submission</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `
      );
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
    }

    res.status(201).json({
      message: 'Thank you for your message. We will get back to you soon.',
      contactMessage: {
        id: contactMessage._id,
        name: contactMessage.name,
        subject: contactMessage.subject,
        createdAt: contactMessage.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/contact
// @desc    Get all contact messages (Admin)
// @access  Private (Admin only)
router.get('/', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const query = {};
    if (status !== 'all') {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const messages = await ContactMessage.find(query)
      .populate('respondedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ContactMessage.countDocuments(query);

    res.json({
      messages,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalMessages: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/contact/:id
// @desc    Get single contact message (Admin)
// @access  Private (Admin only)
router.get('/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const message = await ContactMessage.findById(req.params.id)
      .populate('respondedBy', 'firstName lastName');

    if (!message) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    // Mark as read if it's new
    if (message.status === 'new') {
      message.status = 'read';
      await message.save();
    }

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/contact/:id
// @desc    Update contact message status/response (Admin)
// @access  Private (Admin only)
router.put('/:id', auth, authorize('content_manager', 'super_admin'), async (req, res) => {
  try {
    const { status, response } = req.body;

    const message = await ContactMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    if (status) message.status = status;
    
    if (response) {
      message.response = response;
      message.respondedAt = new Date();
      message.respondedBy = req.user._id;

      // Send response email to customer
      try {
        await emailService.sendEmail(
          message.email,
          `Re: ${message.subject}`,
          `
            <h3>Thank you for contacting us</h3>
            <p>Dear ${message.name},</p>
            <p>Thank you for your inquiry. Here is our response:</p>
            <div style="padding: 15px; background-color: #f5f5f5; border-left: 3px solid #007bff;">
              ${response}
            </div>
            <p>If you have any further questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>Mining Equipment Team</p>
          `
        );
        
        message.status = 'replied';
      } catch (emailError) {
        console.error('Failed to send response email:', emailError);
      }
    }

    await message.save();

    res.json({
      message: 'Contact message updated successfully',
      contactMessage: message
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/contact/:id
// @desc    Delete contact message (Admin)
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('super_admin'), async (req, res) => {
  try {
    const message = await ContactMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    await ContactMessage.findByIdAndDelete(req.params.id);

    res.json({ message: 'Contact message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;