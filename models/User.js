const bcrypt = require('bcryptjs');
const MongoShim = require('../utils/mongoshim');

const User = new MongoShim('users', {
  timestamps: true,
  fields: {
    email: { default: '' },
    password: { default: '' },
    firstName: { default: '' },
    lastName: { default: '' },
    role: { default: 'customer' },
    isActive: { default: true },
    isVerified: { default: false }
  },
  preSave: async (doc, isNew) => {
    if (isNew && doc.password && !doc.password.startsWith('$2')) {
      doc.password = await bcrypt.hash(doc.password, 12);
    }
  }
});

User.comparePassword = async function (candidatePassword, hashedPassword) {
  return bcrypt.compare(candidatePassword, hashedPassword);
};

User.getFullName = function (doc) {
  return `${doc.firstName} ${doc.lastName}`;
};

module.exports = User;
