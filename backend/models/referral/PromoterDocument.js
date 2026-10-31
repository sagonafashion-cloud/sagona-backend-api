import mongoose from 'mongoose';

// Metadata for an encrypted KYC / agreement file stored in GridFS (bucket
// "promoter_docs"). The file bytes are encrypted before upload; downloads are
// decrypted server-side and every download is audit-logged.
const promoterDocumentSchema = new mongoose.Schema({
  promoterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promoter', required: true, index: true },
  type:       { type: String, enum: ['pan', 'bank_proof', 'gst_certificate', 'id_proof', 'agreement'], required: true },
  filename:   { type: String, required: true },
  mime:       { type: String, required: true },
  size:       { type: Number, required: true },          // original (plaintext) size
  gridFsId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: true });

export default mongoose.models.PromoterDocument || mongoose.model('PromoterDocument', promoterDocumentSchema);
