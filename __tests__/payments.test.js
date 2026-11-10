process.env.PAYNOW_INTEGRATION_ID = 'test-id';
process.env.PAYNOW_INTEGRATION_KEY = 'test-key';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

// Every NeDB-backed module is mocked: loading the real ones opens (and
// compacts) the files in data/.
jest.mock('../models/Order', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn()
}));

jest.mock('../models/Transaction', () => ({
  insert: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue(1)
}));

jest.mock('../models/Product', () => ({ find: jest.fn().mockResolvedValue([]) }));
// uuid@14 is ESM-only, which Jest's CommonJS runtime can't load
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
jest.mock('../utils/mongoshim', () => ({ populate: jest.fn() }));

jest.mock('../utils/orderEmailService', () => ({
  sendOrderConfirmationWithInvoice: jest.fn().mockResolvedValue()
}));

// Tests pick the signed-in user with an x-test-user header
jest.mock('../middleware/auth', () => ({
  optionalAuth: (req, res, next) => {
    const raw = req.header('x-test-user');
    if (raw) req.user = JSON.parse(raw);
    next();
  }
}));

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const { sendOrderConfirmationWithInvoice } = require('../utils/orderEmailService');
const PaynowClient = require('../utils/paynow');
const paymentRoutes = require('../routes/payments');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/payments', paymentRoutes);

const id = () => crypto.randomBytes(12).toString('hex');
const ownerId = id();
const strangerId = id();
const TOKEN = 'a'.repeat(64);
const TOKEN_HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');

const makeOrder = (overrides = {}) => ({
  _id: id(),
  orderNumber: 'ORD-20261110-ABC123',
  user: null,
  isGuest: true,
  paymentTokenHash: TOKEN_HASH,
  status: 'pending',
  paymentStatus: 'payment_on_delivery',
  total: 115.5,
  customerInfo: { email: 'guest@example.test', phone: '0770000000' },
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  Order.update.mockResolvedValue(1);
});

describe.each(['cash-on-delivery', 'collection'])('POST /api/payments/%s', (route) => {
  it('rejects a guest order without the payment token', async () => {
    const order = makeOrder();
    Order.findById.mockResolvedValue(order);

    const res = await request(app).post(`/api/payments/${route}`).send({ orderId: order._id });

    expect(res.status).toBe(404);
    expect(Order.update).not.toHaveBeenCalled();
  });

  it('rejects a guest order with the wrong payment token', async () => {
    const order = makeOrder();
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .send({ orderId: order._id, paymentToken: 'b'.repeat(64) });

    expect(res.status).toBe(404);
    expect(Order.update).not.toHaveBeenCalled();
  });

  it('rejects someone who sends the stored hash instead of the token', async () => {
    const order = makeOrder();
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .send({ orderId: order._id, paymentToken: TOKEN_HASH });

    expect(res.status).toBe(404);
  });

  it('accepts a guest order with the right payment token and returns only a summary', async () => {
    const order = makeOrder();
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .send({ orderId: order._id, paymentToken: TOKEN });

    expect(res.status).toBe(200);
    expect(Order.update).toHaveBeenCalledWith({ _id: order._id }, expect.objectContaining({ status: 'processing' }));
    expect(Transaction.insert).toHaveBeenCalled();
    expect(Object.keys(res.body.order).sort()).toEqual(['_id', 'orderNumber', 'paymentStatus', 'status']);
  });

  it("rejects another user's order", async () => {
    const order = makeOrder({ user: ownerId, isGuest: false });
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .set('x-test-user', JSON.stringify({ _id: strangerId, role: 'customer' }))
      .send({ orderId: order._id, paymentToken: TOKEN });

    expect(res.status).toBe(404);
    expect(Order.update).not.toHaveBeenCalled();
  });

  it('accepts the signed-in owner', async () => {
    const order = makeOrder({ user: ownerId, isGuest: false });
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .set('x-test-user', JSON.stringify({ _id: ownerId, role: 'customer' }))
      .send({ orderId: order._id });

    expect(res.status).toBe(200);
  });

  it('refuses to touch an order that is already paid', async () => {
    const order = makeOrder({ paymentStatus: 'paid', status: 'processing' });
    Order.findById.mockResolvedValue(order);

    const res = await request(app)
      .post(`/api/payments/${route}`)
      .send({ orderId: order._id, paymentToken: TOKEN });

    expect(res.status).toBe(409);
    expect(Order.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid or non-string order id', async () => {
    expect((await request(app).post(`/api/payments/${route}`).send({ orderId: 'nope' })).status).toBe(400);
    expect((await request(app).post(`/api/payments/${route}`).send({ orderId: { $ne: null } })).status).toBe(400);
    expect(Order.findById).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/paynow/initiate', () => {
  it('rejects a guest order without the payment token', async () => {
    const order = makeOrder({ paymentStatus: 'awaiting_payment' });
    Order.findById.mockResolvedValue(order);

    const res = await request(app).post('/api/payments/paynow/initiate').send({ orderId: order._id });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/paynow/callback', () => {
  const signer = new PaynowClient('test-id', 'test-key');
  const signed = (fields) => ({ ...fields, hash: signer.generateHash(fields) });
  const paidFields = (amount = '115.50') => ({
    reference: 'ORD-20261110-ABC123',
    paynowreference: '987654',
    amount,
    status: 'Paid'
  });
  const post = (body) => request(app).post('/api/payments/paynow/callback').type('form').send(body);

  it('rejects a bad hash', async () => {
    const res = await post({ ...paidFields(), hash: 'DEADBEEF' });

    expect(res.status).toBe(400);
    expect(Order.findOne).not.toHaveBeenCalled();
  });

  it('marks the order paid with a guarded update when the amount matches', async () => {
    const order = makeOrder({ paymentStatus: 'awaiting_payment' });
    Order.findOne.mockResolvedValue(order);
    Transaction.findOne.mockResolvedValue({ _id: id(), paynowData: {} });

    const res = await post(signed(paidFields()));

    expect(res.status).toBe(200);
    expect(Order.update).toHaveBeenCalledWith(
      { _id: order._id, paymentStatus: { $ne: 'paid' } },
      expect.objectContaining({ paymentStatus: 'paid', status: 'processing' })
    );
    expect(Transaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'completed' }));
    expect(sendOrderConfirmationWithInvoice).toHaveBeenCalledTimes(1);
  });

  it('rejects a paid callback whose amount does not match the order total', async () => {
    Order.findOne.mockResolvedValue(makeOrder({ paymentStatus: 'awaiting_payment' }));

    const res = await post(signed(paidFields('1.00')));

    expect(res.status).toBe(400);
    expect(Order.update).not.toHaveBeenCalled();
    expect(sendOrderConfirmationWithInvoice).not.toHaveBeenCalled();
  });

  it('ignores repeat callbacks for an already-paid order', async () => {
    Order.findOne.mockResolvedValue(makeOrder({ paymentStatus: 'paid', status: 'processing' }));

    const res = await post(signed(paidFields()));

    expect(res.status).toBe(200);
    expect(Order.update).not.toHaveBeenCalled();
    expect(sendOrderConfirmationWithInvoice).not.toHaveBeenCalled();
  });

  it('does not let a cancelled callback downgrade a paid order', async () => {
    Order.findOne.mockResolvedValue(makeOrder({ paymentStatus: 'paid', status: 'processing' }));

    const res = await post(signed({ ...paidFields(), status: 'Cancelled' }));

    expect(res.status).toBe(200);
    expect(Order.update).not.toHaveBeenCalled();
  });

  it('marks an unpaid order failed on a cancelled callback', async () => {
    const order = makeOrder({ paymentStatus: 'awaiting_payment' });
    Order.findOne.mockResolvedValue(order);

    const res = await post(signed({ ...paidFields(), status: 'Cancelled' }));

    expect(res.status).toBe(200);
    expect(Order.update).toHaveBeenCalledWith(
      { _id: order._id, paymentStatus: { $ne: 'paid' } },
      expect.objectContaining({ paymentStatus: 'failed' })
    );
    expect(sendOrderConfirmationWithInvoice).not.toHaveBeenCalled();
  });

  it('sends no email when a concurrent callback already confirmed the order', async () => {
    Order.findOne.mockResolvedValue(makeOrder({ paymentStatus: 'awaiting_payment' }));
    Order.update.mockResolvedValue(0);

    const res = await post(signed(paidFields()));

    expect(res.status).toBe(200);
    expect(sendOrderConfirmationWithInvoice).not.toHaveBeenCalled();
  });
});
