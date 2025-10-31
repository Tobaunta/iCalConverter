import mongoose from 'mongoose';

const iCalUrlSchema = new mongoose.Schema({
  uniqueId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: 'Jobb'
  },
  icalContent: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export default mongoose.model('ICalUrl', iCalUrlSchema);
