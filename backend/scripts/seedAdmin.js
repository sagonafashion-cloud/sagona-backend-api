import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../config/db.js';
import AdminUser from '../models/AdminUser.js';

const seed = async () => {
  await connectDB();

  const exists = await AdminUser.findOne({ email: 'admin@sagona.in' });
  if (exists) {
    console.log('Admin already exists — skipping.');
    process.exit(0);
  }

  const password = await bcrypt.hash('Admin@2026#Sagona', 10);
  await AdminUser.create({
    name: 'Super Admin',
    email: 'admin@sagona.in',
    password,
    role: 'super_admin',
    isActive: true,
    twoFactorEnabled: false,
  });

  console.log('✅ Admin created: admin@sagona.in / Admin@2026#Sagona');
  process.exit(0);
};

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
