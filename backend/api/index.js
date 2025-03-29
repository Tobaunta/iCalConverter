import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { updateAllICalUrls, getCalendarById } from "../services/icalService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 3600000;

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

app.post("/generate", async (req, res) => {
  const { url, summary } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL saknas" });
  }
  try {
    // Temporärt inaktiverad
    return res.status(503).json({
      error: "Tjänsten är temporärt inaktiverad",
      message: "Generering av nya kalendrar är för närvarande inte tillgänglig",
    });
  } catch (error) {
    console.error("Fel vid generering:", error);
    res.status(500).json({
      error: "Ett fel uppstod vid generering av kalendern",
      message: error.message,
    });
  }
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

// Lägg till en global variabel för att hålla koll på uppdateringsstatus
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

    console.log("Startar uppdatering av kalendrar...");
    const result = await updateAllICalUrls();

    return res.json({
      status: "success",
      message: result.message,
      results: result.results,
    });
  } catch (error) {
    console.error("Fel vid uppdatering:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Ett fel uppstod vid uppdatering av kalendrar",
      details: error.results || [],
    });
  }
});

app.get("/update-status", async (req, res) => {
  try {
    const apiKey = req.query.apiKey;
    const configuredApiKey = process.env.UPDATE_API_KEY;

    if (configuredApiKey && apiKey !== configuredApiKey) {
      return res.status(401).json({ error: "Ogiltig API-nyckel" });
    }

    res.json({
      ...updateStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Fel vid hämtning av uppdateringsstatus:", error);
    res.status(500).json({
      error: "Ett fel inträffade vid hämtning av uppdateringsstatus",
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    });
  }
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
