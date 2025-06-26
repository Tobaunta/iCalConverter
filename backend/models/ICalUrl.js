import mongoose from "mongoose";

const ICalUrlSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    summary: { type: String },
    icalContent: { type: String },
    lastUpdated: { type: Date, default: Date.now },
  },
  { collection: "icalurls" }
);

// Skapa modellen direkt utan att kasta fel om den redan finns
let ICalUrlModel;
try {
  ICalUrlModel = mongoose.models.ICalUrl || mongoose.model("ICalUrl", ICalUrlSchema);
} catch (e) {
  ICalUrlModel = mongoose.model("ICalUrl");
}

export default ICalUrlModel;
