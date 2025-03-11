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

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på http://localhost:${PORT}`);
    setInterval(async () => {
      try {
        await updateAllICalUrls();
      } catch (error) {
        console.error("Fel vid uppdatering av iCal URLs:", error);
      }
    }, UPDATE_INTERVAL);
  });
}

export default app;
