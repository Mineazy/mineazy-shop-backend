const express = require('express');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

const normalizeUser = (user) => {
  if (!user) {
    return user;
  }

  const plainUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };

  return {
    ...plainUser,
    isActive: plainUser.isActive !== false
  };
};

// Validation middleware
const profileValidation = [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('phone').optional().isMobilePhone(),
  body('email').optional().isEmail().normalizeEmail(),
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

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(normalizeUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, profileValidation, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      company,
      address
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (company) user.company = company;
    if (address) user.address = address;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        company: user.company,
        address: user.address,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete account' });
    }

    const user = await User.findById(req.user._id);
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    // Prevent super admin deletion
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Super admin account cannot be deleted' });
    }

    await User.findByIdAndDelete(req.user._id);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin routes for user management

// @route   GET /api/users
// @desc    Get all users (Admin)
// @access  Private (Admin only)
router.get('/', auth, authorize('super_admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { company: new RegExp(search, 'i') }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(normalizeUser),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalUsers: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/users/:id
// @desc    Get single user (Admin)
// @access  Private (Admin only)
router.get('/:id', auth, authorize('super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(normalizeUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (Admin)
// @access  Private (Admin only)
router.put('/:id', auth, authorize('super_admin'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      isVerified,
      company,
      address
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent changing super admin role
    if (user.role === 'super_admin' && role !== 'super_admin') {
      return res.status(403).json({ message: 'Cannot change super admin role' });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (isVerified !== undefined) user.isVerified = isVerified;
    if (company) user.company = company;
    if (address) user.address = address;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: normalizeUser(await User.findById(user._id).select('-password'))
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin)
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent super admin deletion
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Super admin account cannot be deleted' });
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/users/:id/toggle-status
// @desc    Toggle user active/inactive status (Admin)
// @access  Private (Admin only)
router.post('/:id/toggle-status', auth, authorize('super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent super admin status change
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot change super admin status' });
    }

    const hasExplicitStatus = typeof req.body?.isActive === 'boolean';
    user.isActive = hasExplicitStatus ? req.body.isActive : !(user.isActive !== false);
    await user.save();

    res.json({
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      user: normalizeUser(await User.findById(user._id).select('-password'))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/users/stats/overview
// @desc    Get user statistics (Admin)
// @access  Private (Admin only)
router.get('/stats/overview', auth, authorize('super_admin'), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const activeUsers = await User.countDocuments({ $or: [{ isActive: true }, { isActive: { $exists: false } }] });
    
    // User role distribution
    const roleDistribution = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentRegistrations = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      totalUsers,
      verifiedUsers,
      activeUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      recentRegistrations,
      roleDistribution
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
