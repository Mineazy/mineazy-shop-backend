const express = require('express');
const request = require('supertest');

// NeDB-backed modules are mocked: loading the real ones opens data/*.db
jest.mock('../models/BlogPost', () => ({
  insert: jest.fn(async (doc) => ({ _id: 'p'.repeat(24), ...doc })),
  findById: jest.fn(),
  update: jest.fn().mockResolvedValue(1),
  findByIdAndDelete: jest.fn().mockResolvedValue({}),
  find: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/BlogCategory', () => ({}));
jest.mock('../models/User', () => ({}));
jest.mock('../models/BlogComment', () => ({ remove: jest.fn().mockResolvedValue(0) }));
jest.mock('../models/BlogReaction', () => ({ remove: jest.fn().mockResolvedValue(0) }));
jest.mock('../utils/mongoshim', () => ({ populate: jest.fn() }));

// Tests choose the signed-in user's role with an x-test-role header
jest.mock('../middleware/auth', () => ({
  auth: (req, res, next) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ message: 'No token' });
    req.user = { _id: 'u'.repeat(24), role };
    next();
  },
  optionalAuth: (req, res, next) => next(),
  authorize: (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Forbidden' })
}));

const BlogPost = require('../models/BlogPost');
const blogRoutes = require('../routes/blog');

const app = express();
app.use(express.json());
app.use('/api/blog', blogRoutes);

beforeEach(() => jest.clearAllMocks());

const existingPost = () => ({ _id: 'p'.repeat(24), title: 'Old', content: 'x', status: 'draft', tags: [] });

describe('blog write routes', () => {
  // These are the exact paths the admin portal calls (admin/src/services/blog.js)
  it('POST /api/blog/posts creates a post from multipart form data', async () => {
    const res = await request(app)
      .post('/api/blog/posts')
      .set('x-test-role', 'content_manager')
      .field('title', 'New post')
      .field('content', '<p>Hello</p>')
      .field('tags', 'mining, safety')
      .field('status', 'published');

    expect(res.status).toBe(201);
    expect(BlogPost.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New post',
      tags: ['mining', 'safety'],
      status: 'published'
    }));
  });

  it('PUT /api/blog/posts/:id updates a post', async () => {
    BlogPost.findById.mockResolvedValue(existingPost());

    const res = await request(app)
      .put(`/api/blog/posts/${'p'.repeat(24)}`)
      .set('x-test-role', 'super_admin')
      .field('title', 'Updated');

    expect(res.status).toBe(200);
    expect(BlogPost.update).toHaveBeenCalled();
  });

  it('DELETE /api/blog/posts/:id deletes a post', async () => {
    BlogPost.findById.mockResolvedValue(existingPost());

    const res = await request(app)
      .delete(`/api/blog/posts/${'p'.repeat(24)}`)
      .set('x-test-role', 'super_admin');

    expect(res.status).toBe(200);
    expect(BlogPost.findByIdAndDelete).toHaveBeenCalled();
  });

  it('keeps the original /api/blog and /api/blog/:id paths working', async () => {
    BlogPost.findById.mockResolvedValue(existingPost());

    expect((await request(app).post('/api/blog').set('x-test-role', 'super_admin').field('title', 'T').field('content', 'c')).status).toBe(201);
    expect((await request(app).delete(`/api/blog/${'p'.repeat(24)}`).set('x-test-role', 'super_admin')).status).toBe(200);
  });

  it('still requires a login and an editor role', async () => {
    expect((await request(app).post('/api/blog/posts').field('title', 'T')).status).toBe(401);
    expect((await request(app).post('/api/blog/posts').set('x-test-role', 'customer').field('title', 'T')).status).toBe(403);
    expect(BlogPost.insert).not.toHaveBeenCalled();
  });

  it('does not let /posts/:id shadow the category routes', async () => {
    const res = await request(app).delete('/api/blog/categories/abc').set('x-test-role', 'customer');
    // Reaches the category route's own role check, not the post handler
    expect(res.status).toBe(403);
    expect(BlogPost.findById).not.toHaveBeenCalled();
  });
});
