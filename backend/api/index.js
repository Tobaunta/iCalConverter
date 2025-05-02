import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import ICalUrl from "../models/ICalUrl.js";
import {
  fetchICalData,
  processICalData,
  createICalFile,
  updateAllICalUrls,
  getCalendarById,
} from "../services/icalService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 3600000;

async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB ansluten");
  } catch (err) {
    console.error("Fel vid anslutning till MongoDB:", err);
    process.exit(1);
  }
}
connectToMongoDB();

app.use(
  cors({
    origin: process.env.CLIENT_URL,
  })
);

app.use(express.json());

app.use((err, req, res, next) => {
  console.error("Serverfel:", err);
  res.status(500).json({
    error: "Ett serverfel inträffade",
    message: err.message,
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "API körs korrekt",
  });
});

export const generateStatus = {
  isGenerating: false,
  lastGenerateStarted: null,
  lastGenerateCompleted: null,
  error: null,
  uniqueId: null,
};

app.post("/generate", async (req, res) => {
  const { url, summary } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL saknas" });
  }
  try {
    const effectiveSummary = summary || "Jobb";
    const icalData = await fetchICalData(url);
    const dailyEvents = processICalData(icalData, effectiveSummary);
    const icalContent = createICalFile(dailyEvents, effectiveSummary);

    const crypto = await import("crypto");
    const uniqueId = crypto
      .createHash("sha256")
      .update(url + effectiveSummary)
      .digest("hex")
      .slice(0, 16);

    const saved = await ICalUrl.save({
      uniqueId,
      url,
      summary: effectiveSummary,
      icalContent,
      lastUpdated: new Date(),
    });

    if (!saved) {
      return res.status(500).json({
        error: "Kunde inte spara kalendern",
        message: "Ingen data returnerades från tjänsten",
      });
    }

    const apiUrl = `${req.protocol}://${req.get("host")}/calendar/${uniqueId}`;
    const googleCalendarLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(
      apiUrl
    )}`;
    res.json({
      googleLink: googleCalendarLink,
      apiUrl: apiUrl,
      lastUpdated: saved.lastUpdated,
    });
  } catch (error) {
    console.error("Fel vid generering av iCal:", error);
    res.status(500).json({
      error: "Ett fel inträffade vid generering av kalendern",
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    });
  }
});

app.get("/generate-status", (req, res) => {
  res.json(generateStatus);
});

app.get("/calendar/:id", async (req, res) => {
  try {
    const uniqueId = req.params.id;
    const calendar = await getCalendarById(uniqueId);

    if (!calendar) {
      return res.status(404).json({ error: "Kalendern hittades inte" });
    }

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=calendar.ics");
    res.send(calendar.icalContent);
  } catch (error) {
    console.error("Fel vid hämtning av kalender:", error);
    res.status(500).json({
      error: "Ett fel uppstod vid hämtning av kalendern",
      message: error.message,
    });
  }
});

export const updateStatus = {
  isUpdating: false,
  lastUpdateStarted: null,
  lastUpdateCompleted: null,
  error: null,
};

app.get("/update-calendars", async (req, res) => {
  try {
    const apiKey = req.query.apiKey;
    const configuredApiKey = process.env.UPDATE_API_KEY;

    if (!apiKey || apiKey !== configuredApiKey) {
      return res.status(401).json({
        error: "Ogiltig API-nyckel",
      });
    }

    if (updateStatus.isUpdating) {
      return res.status(202).json({
        message: "Uppdatering pågår redan",
        updateStatus,
      });
    }

    updateStatus.isUpdating = true;
    updateStatus.lastUpdateStarted = new Date().toISOString();
    updateStatus.error = null;

    (async () => {
      try {
        await updateAllICalUrls();
        updateStatus.isUpdating = false;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
      } catch (err) {
        updateStatus.isUpdating = false;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
        updateStatus.error = err.message || String(err);
      }
    })();

    res.json({
      message: "Uppdatering startad",
      updateStatus,
    });
  } catch (error) {
    updateStatus.isUpdating = false;
    updateStatus.error = error.message || String(error);
    res.status(500).json({
      error: "Ett fel uppstod vid start av uppdatering",
      message: error.message,
    });
  }
});

app.get("/update-status", (req, res) => {
  res.json(updateStatus);
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på http://localhost:${PORT}`);
    setInterval(async () => {
      try {
        updateStatus.isUpdating = true;
        updateStatus.lastUpdateStarted = new Date().toISOString();
        await updateAllICalUrls();
        updateStatus.isUpdating = false;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
        updateStatus.error = null;
      } catch (error) {
        console.error("Fel vid uppdatering av iCal URLs:", error);
        updateStatus.error = error;
        updateStatus.isUpdating = false;
      }
    }, UPDATE_INTERVAL);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT} i produktionsmiljö`);
  });
}

export default app;
