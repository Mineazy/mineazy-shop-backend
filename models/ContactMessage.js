const MongoShim = require('../utils/mongoshim');

const ContactMessage = new MongoShim('contactmessages', {
  timestamps: true,
  fields: {
    name: { default: '' },
    email: { default: '' },
    subject: { default: '' },
    message: { default: '' },
    status: { default: 'new' }
  }
});

module.exports = ContactMessage;
