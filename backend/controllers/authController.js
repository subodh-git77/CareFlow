const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError } = require('../utils/http');

const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role });

const tokenFor = user => jwt.sign(
  { id: user._id.toString(), role: user.role },
  process.env.JWT_SECRET || 'development-only-change-me',
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

const register = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.trim() || !password) throw new HttpError(400, 'Name, email, and password are required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (role && role !== 'patient') throw new HttpError(403, 'Public registration is for patients. Admins create doctor accounts.');

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw new HttpError(409, 'An account already exists with this email');

  const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'patient' });
  res.status(201).json({ success: true, token: tokenFor(user), user: publicUser(user) });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const user = await User.findOne({ email: email.trim().toLowerCase(), isActive: true }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new HttpError(401, 'Invalid email or password');

  res.json({ success: true, token: tokenFor(user), user: publicUser(user) });
};

const getMe = async (req, res) => res.json({ success: true, user: publicUser(req.user) });

module.exports = { getMe, login, register };