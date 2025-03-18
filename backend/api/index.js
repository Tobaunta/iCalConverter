import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  saveOrUpdateICalUrl,
  getICalUrl,
  updateAllICalUrls,
} from "../services/icalService.js";

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
    const effectiveSummary = summary || "Jobb";
    const savedUrl = await saveOrUpdateICalUrl(url, effectiveSummary);
    if (!savedUrl) {
      console.error("saveOrUpdateICalUrl returnerade inget resultat");
      return res.status(500).json({
        error: "Kunde inte spara URL:en",
        message: "Ingen data returnerades från tjänsten",
      });
    }
    const apiUrl = `${req.protocol}://${req.get("host")}/calendar/${
      savedUrl.uniqueId
    }`;
    const googleCalendarLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(
      apiUrl
    )}`;
    res.json({
      googleLink: googleCalendarLink,
      apiUrl: apiUrl,
      lastUpdated: savedUrl.lastUpdated,
    });
  } catch (error) {
    console.error("Fel vid generering av iCal:", error);
    console.error("Stack:", error.stack);
    res.status(500).json({
      error: "Ett fel inträffade vid generering av kalendern",
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    });
  }
});

app.get("/calendar/:id", async (req, res) => {
  try {
    const uniqueId = req.params.id;
    const icalUrl = await getICalUrl(uniqueId);
    if (!icalUrl) {
      return res.status(404).json({ error: "Kalendern hittades inte" });
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=calendar.ics");
    res.send(icalUrl.icalContent);
  } catch (error) {
    console.error("Fel vid hämtning av kalender:", error);
    console.error("Stack:", error.stack);
    res.status(500).json({
      error: "Ett fel inträffade vid hämtning av kalendern",
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
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

    if (configuredApiKey && apiKey !== configuredApiKey) {
      return res.status(401).json({ error: "Ogiltig API-nyckel" });
    }

    // Kontrollera om en uppdatering redan pågår
    if (updateStatus.isUpdating) {
      return res.json({
        status: "already_running",
        message: "En uppdatering pågår redan",
        startedAt: updateStatus.lastUpdateStarted,
        timestamp: new Date().toISOString(),
      });
    }

    // Uppdatera status
    updateStatus.isUpdating = true;
    updateStatus.lastUpdateStarted = new Date().toISOString();
    updateStatus.error = null;

    // Starta uppdateringsprocessen i bakgrunden utan att vänta på att den slutförs
    const updatePromise = updateAllICalUrls()
      .then(() => {
        updateStatus.isUpdating = false;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
        updateStatus.error = null;
      })
      .catch((error) => {
        console.error("Fel vid bakgrundsuppdatering av kalendrar:", error);
        updateStatus.error = error;
        updateStatus.isUpdating = false;
      });

    // Returnera direkt med ett svar att uppdateringen har påbörjats
    res.json({
      status: "started",
      message: "Uppdatering av kalendrar har påbörjats",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Fel vid uppdatering av kalendrar:", error);
    res.status(500).json({
      error: "Ett fel inträffade vid uppdatering av kalendrar",
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
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
