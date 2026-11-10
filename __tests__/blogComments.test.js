const express = require('express');
const request = require('supertest');

// Use the real models and MongoShim, but keep every datastore in memory so
// the tests never open (or compact) the files in data/.
jest.mock('nedb-promises', () => {
  const actual = jest.requireActual('nedb-promises');
  return { create: () => actual.create({ inMemoryOnly: true }) };
});

// Tests pick the signed-in user with an x-test-user header (JSON)
jest.mock('../middleware/auth', () => {
  const readUser = (req) => {
    const raw = req.header('x-test-user');
    return raw ? JSON.parse(raw) : null;
  };
  return {
    auth: (req, res, next) => {
      const user = readUser(req);
      if (!user) return res.status(401).json({ message: 'No token' });
      req.user = user;
      next();
    },
    optionalAuth: (req, res, next) => {
      const user = readUser(req);
      if (user) req.user = user;
      next();
    },
    authorize: (...roles) => (req, res, next) =>
      roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Forbidden' })
  };
});

jest.mock('../models/User', () => ({ find: jest.fn().mockResolvedValue([]) }));
jest.mock('../models/BlogCategory', () => ({ find: jest.fn().mockResolvedValue([]) }));

const BlogPost = require('../models/BlogPost');
const BlogComment = require('../models/BlogComment');
const BlogReaction = require('../models/BlogReaction');
const blogRoutes = require('../routes/blog');

const app = express();
app.use(express.json());
app.use('/api/blog', blogRoutes);

const admin = JSON.stringify({ _id: 'a'.repeat(24), role: 'content_manager', firstName: 'Ada', lastName: 'Admin', email: 'ada@example.test' });
const customer = JSON.stringify({ _id: 'c'.repeat(24), role: 'customer', firstName: 'Cara', lastName: 'Reader', email: 'Cara@Example.test' });

let post;

beforeEach(async () => {
  await Promise.all([BlogPost.remove({}), BlogComment.remove({}), BlogReaction.remove({})]);
  post = await BlogPost.insert({ title: 'Drilling Safety Tips', status: 'published', tags: [] });
});

const guestComment = (overrides = {}) => ({
  name: 'Guest Reader',
  email: 'guest@example.test',
  content: 'Very useful, thanks!',
  ...overrides
});

describe('reader comments', () => {
  it('holds a guest comment for moderation and hides it until approved', async () => {
    const res = await request(app)
      .post(`/api/blog/posts/${post.slug}/comments`)
      .send(guestComment());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');

    const list = await request(app).get(`/api/blog/posts/${post.slug}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.comments).toEqual([]);

    const [stored] = await BlogComment.find({});
    expect(stored).toMatchObject({ post: post._id, name: 'Guest Reader', status: 'pending' });
  });

  it('never returns commenter emails publicly', async () => {
    await BlogComment.insert({ post: post._id, name: 'A', email: 'secret@example.test', content: 'Hi there', status: 'approved' });

    const res = await request(app).get(`/api/blog/posts/${post.slug}/comments`);

    expect(res.body.total).toBe(1);
    expect(res.body.comments[0]).toMatchObject({ name: 'A', content: 'Hi there' });
    expect(JSON.stringify(res.body)).not.toContain('secret@example.test');
  });

  it('uses the account name and email for signed-in readers', async () => {
    const res = await request(app)
      .post(`/api/blog/posts/${post.slug}/comments`)
      .set('x-test-user', customer)
      .send({ name: 'Spoofed', email: 'spoof@example.test', content: 'Nice article' });

    expect(res.status).toBe(201);
    const [stored] = await BlogComment.find({});
    expect(stored).toMatchObject({ name: 'Cara Reader', email: 'cara@example.test', status: 'pending', user: 'c'.repeat(24) });
  });

  it('publishes staff comments straight away', async () => {
    const res = await request(app)
      .post(`/api/blog/posts/${post.slug}/comments`)
      .set('x-test-user', admin)
      .send({ content: 'Thanks for reading!' });

    expect(res.body.status).toBe('approved');
    const list = await request(app).get(`/api/blog/posts/${post.slug}/comments`);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].isStaff).toBe(true);
  });

  it.each([
    ['empty comment', { content: '   ' }],
    ['missing name', { name: '' }],
    ['bad email', { email: 'not-an-email' }],
    ['over-long comment', { content: 'x'.repeat(2001) }]
  ])('rejects a %s', async (_label, overrides) => {
    const res = await request(app)
      .post(`/api/blog/posts/${post.slug}/comments`)
      .send(guestComment(overrides));

    expect(res.status).toBe(400);
    expect(await BlogComment.countDocuments({})).toBe(0);
  });

  it('silently drops honeypot submissions', async () => {
    const res = await request(app)
      .post(`/api/blog/posts/${post.slug}/comments`)
      .send(guestComment({ website: 'http://spam.example' }));

    expect(res.status).toBe(201);
    expect(await BlogComment.countDocuments({})).toBe(0);
  });

  it('returns 404 for draft or unknown posts', async () => {
    const draft = await BlogPost.insert({ title: 'Unpublished', status: 'draft' });

    for (const slug of [draft.slug, 'no-such-post']) {
      const res = await request(app).post(`/api/blog/posts/${slug}/comments`).send(guestComment());
      expect(res.status).toBe(404);
    }
  });
});

describe('likes and dislikes', () => {
  const react = (body, user) => {
    const req = request(app).post(`/api/blog/posts/${post.slug}/reactions`);
    if (user) req.set('x-test-user', user);
    return req.send(body);
  };

  it('counts one reaction per visitor and lets them switch or clear it', async () => {
    let res = await react({ type: 'like', visitorId: 'visitor-1111' });
    expect(res.body).toEqual({ likes: 1, dislikes: 0, myReaction: 'like' });

    res = await react({ type: 'like', visitorId: 'visitor-1111' });
    expect(res.body).toEqual({ likes: 1, dislikes: 0, myReaction: 'like' });

    await react({ type: 'like', visitorId: 'visitor-2222' });
    res = await react({ type: 'dislike', visitorId: 'visitor-1111' });
    expect(res.body).toEqual({ likes: 1, dislikes: 1, myReaction: 'dislike' });

    res = await react({ type: 'none', visitorId: 'visitor-1111' });
    expect(res.body).toEqual({ likes: 1, dislikes: 0, myReaction: null });
  });

  it('keys signed-in readers by account, not visitor ID', async () => {
    await react({ type: 'like', visitorId: 'device-aaaa' }, customer);
    const res = await react({ type: 'like', visitorId: 'device-bbbb' }, customer);
    expect(res.body.likes).toBe(1);
  });

  it('reports the current reader reaction on GET', async () => {
    await react({ type: 'dislike', visitorId: 'visitor-3333' });

    const res = await request(app)
      .get(`/api/blog/posts/${post.slug}/reactions`)
      .query({ visitorId: 'visitor-3333' });

    expect(res.body).toEqual({ likes: 0, dislikes: 1, myReaction: 'dislike' });
  });

  it('rejects unknown reaction types and missing visitor IDs', async () => {
    expect((await react({ type: 'love', visitorId: 'visitor-1111' })).status).toBe(400);
    expect((await react({ type: 'like' })).status).toBe(400);
    expect((await react({ type: 'like', visitorId: '../../x' })).status).toBe(400);
  });
});

describe('admin moderation', () => {
  let pending;

  beforeEach(async () => {
    pending = await BlogComment.insert({ post: post._id, name: 'Guest', email: 'g@example.test', content: 'Hello', status: 'pending' });
  });

  it('lists comments with emails, post titles and status counts for staff', async () => {
    const res = await request(app).get('/api/blog/comments').set('x-test-user', admin);

    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ pending: 1, approved: 0, rejected: 0, all: 1 });
    expect(res.body.comments[0]).toMatchObject({
      email: 'g@example.test',
      post: { title: 'Drilling Safety Tips', slug: post.slug }
    });
  });

  it('is not shadowed by GET /api/blog/:slug', async () => {
    const res = await request(app).get('/api/blog/comments');
    expect(res.status).toBe(401);
  });

  it('allows and disallows comments', async () => {
    let res = await request(app)
      .patch(`/api/blog/comments/${pending._id}`)
      .set('x-test-user', admin)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);

    let list = await request(app).get(`/api/blog/posts/${post.slug}/comments`);
    expect(list.body.comments).toHaveLength(1);

    res = await request(app)
      .patch(`/api/blog/comments/${pending._id}`)
      .set('x-test-user', admin)
      .send({ status: 'rejected' });
    expect(res.status).toBe(200);

    list = await request(app).get(`/api/blog/posts/${post.slug}/comments`);
    expect(list.body.comments).toHaveLength(0);
  });

  it('deletes comments', async () => {
    const res = await request(app).delete(`/api/blog/comments/${pending._id}`).set('x-test-user', admin);
    expect(res.status).toBe(200);
    expect(await BlogComment.countDocuments({})).toBe(0);
  });

  it('blocks non-staff and anonymous users', async () => {
    const calls = [
      () => request(app).get('/api/blog/comments'),
      () => request(app).patch(`/api/blog/comments/${pending._id}`).send({ status: 'approved' }),
      () => request(app).delete(`/api/blog/comments/${pending._id}`)
    ];
    for (const call of calls) {
      expect((await call()).status).toBe(401);
      expect((await call().set('x-test-user', customer)).status).toBe(403);
    }
    expect((await BlogComment.findById(pending._id)).status).toBe('pending');
  });

  it('rejects invalid moderation statuses', async () => {
    const res = await request(app)
      .patch(`/api/blog/comments/${pending._id}`)
      .set('x-test-user', admin)
      .send({ status: 'published' });
    expect(res.status).toBe(400);
  });

  it('removes comments and reactions when their post is deleted', async () => {
    await BlogReaction.insert({ post: post._id, key: `${post._id}:v:abc12345`, type: 'like' });

    const res = await request(app).delete(`/api/blog/posts/${post._id}`).set('x-test-user', admin);

    expect(res.status).toBe(200);
    expect(await BlogComment.countDocuments({})).toBe(0);
    expect(await BlogReaction.countDocuments({})).toBe(0);
  });
});
