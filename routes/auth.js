const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { userValidation } = require('../middleware/validation');
const emailService = require('../utils/emailService');

const router = express.Router();

const getEmailUrl = () => {
  const configuredUrl = process.env.EMAIL_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  return configuredUrl.split(',')[0].trim().replace(/\/+$/, '');
};

const getVerificationUrl = (verificationToken) => {
  return `${getEmailUrl()}/verify-email/${encodeURIComponent(verificationToken)}`;
};

const getResetPasswordUrl = (resetToken) => {
  return `${getEmailUrl()}/reset-password/${encodeURIComponent(resetToken)}`;
};

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', userValidation.register, async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'customer' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      verificationToken: crypto.randomBytes(32).toString('hex')
    });

    await user.save();

    // Send verification email
    try {
      const verificationUrl = getVerificationUrl(user.verificationToken);
      await emailService.sendEmail(
        user.email,
        'Verify Your Email Address',
        `
          <h2>Welcome to Mining Equipment!</h2>
          <p>Hello ${user.firstName},</p>
          <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
          <p>
            <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
          </p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;"><a href="${verificationUrl}" target="_blank" rel="noopener noreferrer">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
        `
      );
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification.',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', userValidation.login, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account is deactivated. Please contact support.' });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified,
        isActive: user.isActive !== false
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Send reset email
    try {
      const resetUrl = getResetPasswordUrl(resetToken);
      await emailService.sendEmail(
        user.email,
        'Password Reset Request',
        `
          <h2>Password Reset Request</h2>
          <p>Hello ${user.firstName},</p>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <p>
            <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #dc3545; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
          </p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;"><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>
          <p>This link will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      );
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      return res.status(500).json({ message: 'Failed to send reset email' });
    }

    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Hash the token to match stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    // Generate new token
    const newToken = generateToken(user._id);

    res.json({
      message: 'Password reset successful',
      token: newToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Private
router.post('/resend-verification', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    user.verificationToken = crypto.randomBytes(32).toString('hex');
    await user.save();

    // Send verification email
    try {
      const verificationUrl = getVerificationUrl(user.verificationToken);
      await emailService.sendEmail(
        user.email,
        'Verify Your Email Address',
        `
          <h2>Email Verification</h2>
          <p>Hello ${user.firstName},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <p>
            <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
          </p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;"><a href="${verificationUrl}" target="_blank" rel="noopener noreferrer">${verificationUrl}</a></p>
        `
      );
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return res.status(500).json({ message: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change password
// @access  Private
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user._id);
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
