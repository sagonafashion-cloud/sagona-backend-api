import mongoose from 'mongoose';

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },   // bcrypt hash

    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'finance_manager', 'store_manager', 'content_editor', 'viewer']
    },

    assignedStores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],

    twoFactorSecret: { type: String, select: false },  // TOTP secret (speakeasy)
    twoFactorEnabled: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    lastLoginIP: { type: String },

    // Account-level brute-force lockout — mirrors User.js's customer lockout.
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    // Bumped on logout to invalidate any outstanding admin JWTs server-side
    // (JWTs are otherwise stateless/unrevocable for their full lifetime).
    tokenVersion: { type: Number, default: 0 }
  },
  { timestamps: true }
);

adminUserSchema.index({ role: 1, isActive: 1 });

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

export default AdminUser;
