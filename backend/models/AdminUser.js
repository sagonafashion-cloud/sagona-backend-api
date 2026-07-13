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
    lastLoginIP: { type: String }
  },
  { timestamps: true }
);

adminUserSchema.index({ role: 1, isActive: 1 });

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

export default AdminUser;
