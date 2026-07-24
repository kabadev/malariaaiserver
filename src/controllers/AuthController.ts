import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import logger from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth';

function generateToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'secret-jwt-key';
  return jwt.sign({ userId }, secret, { expiresIn: '90d' });
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      isOnboarded: false,
    });

    const token = generateToken(user._id.toString());

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        organizationName: user.organizationName,
        country: user.country,
        organizationType: user.organizationType,
        isOnboarded: user.isOnboarded,
      },
    });
  } catch (err) {
    logger.error('Register error', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user._id.toString());

    res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        organizationName: user.organizationName,
        country: user.country,
        organizationType: user.organizationType,
        isOnboarded: user.isOnboarded,
      },
    });
  } catch (err) {
    logger.error('Login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

// ── POST /api/auth/onboarding ────────────────────────────────────────────────
export async function saveOnboarding(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { organizationName, country, organizationType } = req.body;

    if (!organizationName || !country || !organizationType) {
      res.status(400).json({ error: 'Organization name, country, and organization type are required' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          organizationName,
          country,
          organizationType,
          isOnboarded: true,
        },
      },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        organizationName: user.organizationName,
        country: user.country,
        organizationType: user.organizationType,
        isOnboarded: user.isOnboarded,
      },
    });
  } catch (err) {
    logger.error('saveOnboarding error', err);
    res.status(500).json({ error: 'Failed to save onboarding data' });
  }
}

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        organizationName: user.organizationName,
        country: user.country,
        organizationType: user.organizationType,
        isOnboarded: user.isOnboarded,
      },
    });
  } catch (err) {
    logger.error('getMe error', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}
