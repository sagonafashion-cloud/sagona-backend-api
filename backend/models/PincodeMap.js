import mongoose from 'mongoose';

const pincodeMapSchema = new mongoose.Schema({
  pincode: { type: String, required: true, unique: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  lat: { type: Number },
  lng: { type: Number }
}, { timestamps: false });

const PincodeMap = mongoose.model('PincodeMap', pincodeMapSchema);

export default PincodeMap;
