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

const ICalUrlMongo =
  mongoose.models.ICalUrlMongo || mongoose.model("ICalUrlMongo", ICalUrlSchema);

class ICalUrlModel {
  constructor() {}

  async findOne({ uniqueId }) {
    try {
      const doc = await ICalUrlMongo.findOne({ uniqueId }).lean();
      return doc || null;
    } catch (error) {
      console.error(`Fel vid hämtning av data: ${error.message}`);
      return null;
    }
  }

  async save(document) {
    try {
      await ICalUrlMongo.deleteMany({ uniqueId: document.uniqueId });
      const doc = new ICalUrlMongo({
        ...document,
        lastUpdated: new Date(),
      });
      await doc.save();
      return doc.toObject();
    } catch (error) {
      console.error("Error in save:", error);
      throw error;
    }
  }

  async find() {
    try {
      const docs = await ICalUrlMongo.find({}).lean();
      return docs;
    } catch (error) {
      console.error("Fel vid hämtning av alla kalendrar:", error);
      throw error;
    }
  }
}

const ICalUrl = new ICalUrlModel();

export default ICalUrl;
