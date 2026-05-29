import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  childProfileId: mongoose.Schema.Types.ObjectId,
  orderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  recommendedSize: String,
  chosenSize:      String,
  fitFeedback: {
    type: String,
    enum: ['perfect', 'slightly_tight', 'too_tight', 'slightly_loose', 'too_loose']
  },
  measurementMethod: String,
  childMeasurements: {
    height:   Number,
    chest:    Number,
    waist:    Number,
    hip:      Number,
    shoulder: Number
  },
  returnedForSize: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('SizingFeedback', schema);
