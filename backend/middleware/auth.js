const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Please sign in to continue' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development-only-change-me');
    const user = await User.findOne({ _id: decoded.id, isActive: true });
    if (!user) return res.status(401).json({ success: false, error: 'This account is unavailable' });
    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ success: false, error: 'Your session is invalid or has expired' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'You do not have permission to access this page' });
  }
  return next();
};

module.exports = { authorize, protect };