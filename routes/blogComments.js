const express = require('express');
const rateLimit = require('express-rate-limit');
const BlogPost = require('../models/BlogPost');
const BlogComment = require('../models/BlogComment');
const BlogReaction = require('../models/BlogReaction');
const MongoShim = require('../utils/mongoshim');
const { auth, optionalAuth, authorize } = require('../middleware/auth');

// Mounted inside routes/blog.js *before* its catch-all `/:slug` routes, so
// these paths are relative to /api/blog.
const router = express.Router();

const STAFF_ROLES = ['content_manager', 'super_admin'];
const MODERATION_STATUSES = ['pending', 'approved', 'rejected'];
const REACTION_TYPES = ['like', 'dislike'];
const ID_PATTERN = /^[a-zA-Z0-9]{16,32}$/;
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_COMMENT_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;

const isTest = process.env.NODE_ENV === 'test';

const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You are commenting too quickly. Please wait a few minutes and try again.' }
});

const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

const isStaff = (user) => Boolean(user && STAFF_ROLES.includes(user.role));

// Collapse whitespace runs and strip control characters (keeping newlines).
const cleanText = (value, { multiline = false } = {}) => {
  if (typeof value !== 'string') return '';
  let text = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
  text = multiline
    ? text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');
  return text.trim();
};

const displayName = (user) => {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || (user.email ? user.email.split('@')[0] : 'Reader');
};

// What the public site gets: never the commenter's email.
const publicComment = (comment) => ({
  _id: comment._id,
  name: comment.name,
  content: comment.content,
  isStaff: Boolean(comment.isStaff),
  createdAt: comment.createdAt
});

const findPublishedPost = (slug) => BlogPost.findOne({ slug, status: 'published' });

const voterKeyFor = (req, visitorId) => {
  if (req.user && req.user._id) return `u:${req.user._id}`;
  if (typeof visitorId === 'string' && VISITOR_ID_PATTERN.test(visitorId)) return `v:${visitorId}`;
  return null;
};

const reactionSummary = async (postId, voterKey) => {
  const [likes, dislikes, mine] = await Promise.all([
    BlogReaction.countDocuments({ post: postId, type: 'like' }),
    BlogReaction.countDocuments({ post: postId, type: 'dislike' }),
    voterKey ? BlogReaction.findOne({ key: `${postId}:${voterKey}` }) : null
  ]);
  return { likes, dislikes, myReaction: mine ? mine.type : null };
};

// ---------------------------------------------------------------------------
// Public: comments
// ---------------------------------------------------------------------------

// @route   GET /api/blog/posts/:slug/comments
// @desc    Approved comments for a published post, oldest first
// @access  Public
router.get('/posts/:slug/comments', async (req, res) => {
  try {
    const post = await findPublishedPost(req.params.slug);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comments = await BlogComment.find({ post: post._id, status: 'approved' })
      .sort({ createdAt: 1 });

    res.json({ comments: comments.map(publicComment), total: comments.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/blog/posts/:slug/comments
// @desc    Add a comment (held for moderation unless posted by staff)
// @access  Public (optional auth)
router.post('/posts/:slug/comments', commentLimiter, optionalAuth, async (req, res) => {
  try {
    const post = await findPublishedPost(req.params.slug);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const body = req.body || {};

    // Honeypot: real readers never see or fill the `website` field. Answer
    // like a normal submission so bots get no signal, but store nothing.
    if (body.website) {
      return res.status(201).json({
        message: 'Thanks! Your comment is awaiting moderation.',
        status: 'pending'
      });
    }

    const content = cleanText(body.content, { multiline: true });
    if (content.length < 2) {
      return res.status(400).json({ message: 'Please write a comment.' });
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ message: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` });
    }

    let name;
    let email;
    if (req.user) {
      name = displayName(req.user);
      email = (req.user.email || '').toLowerCase();
    } else {
      name = cleanText(body.name);
      email = cleanText(body.email).toLowerCase();
      if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ message: 'Please enter your name.' });
      }
      if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return res.status(400).json({ message: 'Please enter a valid email address.' });
      }
    }

    const staff = isStaff(req.user);
    const comment = await BlogComment.insert({
      post: post._id,
      user: req.user ? req.user._id : null,
      name,
      email,
      content,
      isStaff: staff,
      status: staff ? 'approved' : 'pending'
    });

    res.status(201).json({
      message: staff
        ? 'Comment published.'
        : 'Thanks! Your comment is awaiting moderation.',
      status: comment.status,
      comment: publicComment(comment)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Public: likes / dislikes
// ---------------------------------------------------------------------------

// @route   GET /api/blog/posts/:slug/reactions?visitorId=
// @desc    Like/dislike counts and the current reader's reaction
// @access  Public (optional auth)
router.get('/posts/:slug/reactions', optionalAuth, async (req, res) => {
  try {
    const post = await findPublishedPost(req.params.slug);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    res.json(await reactionSummary(post._id, voterKeyFor(req, req.query.visitorId)));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/blog/posts/:slug/reactions
// @desc    Set the reader's reaction: { type: 'like' | 'dislike' | 'none', visitorId }
// @access  Public (optional auth)
router.post('/posts/:slug/reactions', reactionLimiter, optionalAuth, async (req, res) => {
  try {
    const { type, visitorId } = req.body || {};
    if (type !== 'none' && !REACTION_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Reaction must be like, dislike or none.' });
    }

    const voterKey = voterKeyFor(req, visitorId);
    if (!voterKey) {
      return res.status(400).json({ message: 'A visitor ID is required.' });
    }

    const post = await findPublishedPost(req.params.slug);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const key = `${post._id}:${voterKey}`;
    const existing = await BlogReaction.findOne({ key });

    if (type === 'none') {
      if (existing) await BlogReaction.remove({ key });
    } else if (existing) {
      if (existing.type !== type) {
        await BlogReaction.update({ key }, { ...existing, type });
      }
    } else {
      try {
        await BlogReaction.insert({ post: post._id, key, type });
      } catch (error) {
        // Two clicks raced past findOne: the unique index rejected the
        // second insert, so update the row the first one created.
        if (error.errorType !== 'uniqueViolated') throw error;
        const row = await BlogReaction.findOne({ key });
        if (row) await BlogReaction.update({ key }, { ...row, type });
      }
    }

    res.json(await reactionSummary(post._id, voterKey));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Admin: moderation
// ---------------------------------------------------------------------------

// @route   GET /api/blog/comments?status=&search=&page=&limit=
// @desc    All comments with commenter details, newest first
// @access  Private (content_manager, super_admin)
router.get('/comments', auth, authorize(...STAFF_ROLES), async (req, res) => {
  try {
    const { status, search } = req.query;
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const query = {};
    if (status && status !== 'all') {
      if (!MODERATION_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Invalid status filter' });
      }
      query.status = status;
    }

    let comments = await BlogComment.find(query).sort({ createdAt: -1 });

    const term = typeof search === 'string' ? search.trim().toLowerCase() : '';
    if (term) {
      comments = comments.filter((c) =>
        [c.name, c.email, c.content].some((field) => (field || '').toLowerCase().includes(term))
      );
    }

    const total = comments.length;
    const page = comments.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    await MongoShim.populate(page, 'post', BlogPost, 'title slug');

    const [pending, approved, rejected] = await Promise.all(
      MODERATION_STATUSES.map((s) => BlogComment.countDocuments({ status: s }))
    );

    res.json({
      comments: page.map((c) => ({
        ...c,
        post: c.post && typeof c.post === 'object'
          ? { _id: c.post._id, title: c.post.title, slug: c.post.slug, status: c.post.status }
          : { _id: c.post, title: '(deleted post)', slug: null }
      })),
      counts: { pending, approved, rejected, all: pending + approved + rejected },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PATCH /api/blog/comments/:id
// @desc    Allow (approve) or disallow (reject) a comment: { status }
// @access  Private (content_manager, super_admin)
router.patch('/comments/:id', auth, authorize(...STAFF_ROLES), async (req, res) => {
  try {
    if (!ID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const { status } = req.body || {};
    if (!MODERATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be pending, approved or rejected.' });
    }

    const comment = await BlogComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    comment.status = status;
    comment.moderatedBy = req.user._id;
    comment.moderatedAt = new Date().toISOString();
    await BlogComment.update({ _id: comment._id }, comment);

    res.json({ message: `Comment ${status}`, comment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/blog/comments/:id
// @desc    Permanently delete a comment
// @access  Private (content_manager, super_admin)
router.delete('/comments/:id', auth, authorize(...STAFF_ROLES), async (req, res) => {
  try {
    if (!ID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const comment = await BlogComment.findByIdAndDelete(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    res.json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
