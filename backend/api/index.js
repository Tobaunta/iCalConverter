import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import ICalUrl from "../models/ICalUrl.js";
import * as icalService from "../services/icalService.js";

// Hjälpfunktioner
const { 
  fetchICalData, 
  processICalData, 
  createICalFile,
  getCalendarById 
} = icalService;

// Skapa en instans av vår modell
const Calendar = ICalUrl;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 3600000;

async function connectToMongoDB() {
  // Om vi redan är anslutna, returnera direkt
  if (mongoose.connection.readyState === 1) {
    console.log("Redan ansluten till MongoDB");
    return true;
  }

  try {
    console.log("Försöker ansluta till MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000, // 30 sekunder timeout
      socketTimeoutMS: 45000, // 45 sekunder
      maxPoolSize: 10, // Max antal anslutningar i poolen
    });
    
    console.log("MongoDB ansluten");
    return true;
    
  } catch (err) {
    console.error("Fel vid anslutning till MongoDB:", err);
    console.error("Kontrollera att MONGODB_URI är korrekt och att MongoDB är igång");
    return false;
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

    // Sätt statusen till uppdaterar
    updateStatus.isUpdating = true;
    updateStatus.lastUpdateStarted = new Date().toISOString();
    updateStatus.error = null;

    // Spara en kopia av statusen för att skicka tillbaka
    const responseStatus = { ...updateStatus };
    
    // Skicka tillbaka svar direkt
    res.json({
      message: "Uppdatering startad",
      updateStatus: responseStatus,
    });
    
    // Kör uppdateringen i bakgrunden
    (async () => {
      let conn;
      try {
        console.log("Startar asynkron uppdatering...");
        // Skapa en ny anslutning specifikt för denna uppdatering
        // Hämta anslutningssträngen från miljövariabeln
        const connectionString = process.env.MONGODB_URI;
        
        // Logga en del av anslutningssträngen för felsökning (utan känslig info)
        const logSafeString = connectionString
          .replace(/\/\/([^:]+):([^@]+)@/, '//$1:*****@')
          .replace(/\?.*$/, '?*****');
        
        console.log("Försöker ansluta till MongoDB...");
        console.log("Anslutningssträng:", logSafeString);
        
        // Skapa en enklare anslutning med färre inställningar
        // MongoDB Atlas hanterar de flesta inställningarna automatiskt via SRV-URI:n
        const connectionOptions = {
          serverSelectionTimeoutMS: 10000,  // 10 sekunder
          socketTimeoutMS: 45000,           // 45 sekunder
          connectTimeoutMS: 10000,          // 10 sekunder
          maxPoolSize: 1,                   // Använd bara en anslutning
          retryWrites: true,
          w: 'majority',
          appName: 'iCalConverter-Update'
        };
        
        console.log("Skapar anslutning till MongoDB...");
        
        // Skapa en ny anslutning med async/await
        try {
          conn = await new Promise((resolve, reject) => {
            const newConn = mongoose.createConnection(connectionString, connectionOptions);
            
            newConn.on('connected', () => {
              console.log('MongoDB ansluten');
              resolve(newConn);
            });
            
            newConn.on('error', (err) => {
              console.error('MongoDB anslutningsfel:', err);
              reject(err);
            });
          });
          
          // Testa anslutningen
          console.log("Testar anslutningen med ping...");
          await conn.db.admin().ping();
          console.log("MongoDB svarar på ping");
          
        } catch (error) {
          console.error("Kunde inte ansluta till MongoDB:", error);
          throw error; // Kasta vidare felet för att fångas av den yttre try-catchen
        }
        
        // Ladda modellen med den nya anslutningen
        const CalendarModel = conn.model('ICalUrl', ICalUrl.schema);
        
        console.log("Hämtar kalendrar från databasen...");
        const calendars = await CalendarModel.find({}).maxTimeMS(5000).lean();
        console.log(`Hittade ${calendars.length} kalendrar att uppdatera`);
        
        for (const calendarData of calendars) {
          try {
            console.log(`\n=== Behandlar kalender: ${calendarData.uniqueId} ===`);
            const calendarUrl = calendarData?.url || calendarData?.originalUrl || calendarData?.icalUrl;

            if (!calendarData || !calendarUrl) {
              console.error(`Saknar URL för kalender: ${calendarData.uniqueId}`);
              continue;
            }

            console.log(`Hämtar iCal-data från: ${calendarUrl.substring(0, 50)}...`);
            const icalData = await fetchICalData(calendarUrl);
            console.log("iCal-data hämtad, bearbetar händelser...");
            
            const dailyEvents = processICalData(icalData, calendarData.summary);
            console.log(`Bearbetade ${dailyEvents.length} händelser`);
            
            console.log("Uppdaterar kalendern i databasen...");
            
            // Ta bort befintligt dokument med samma uniqueId
            await CalendarModel.deleteMany({ uniqueId: calendarData.uniqueId });
            
            // Skapa och spara nytt dokument
            const newCalendar = new CalendarModel({
              uniqueId: calendarData.uniqueId,
              url: calendarUrl,
              summary: calendarData.summary,
              icalContent: createICalFile(dailyEvents, calendarData.summary),
              lastUpdated: new Date()
            });
            
            await newCalendar.save();
            console.log("Kalender uppdaterad");
          } catch (error) {
            console.error(`Fel vid uppdatering av kalender ${calendarData.uniqueId}:`, error);
            // Fortsätt med nästa kalender vid fel
          }
        }
        
        // Uppdatera status vid lyckad uppdatering
        updateStatus.isUpdating = false;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
        updateStatus.error = null;
        
      } catch (err) {
        console.error("Fel i uppdateringsprocessen:", err);
        updateStatus.isUpdating = false;
        updateStatus.error = err.message;
        updateStatus.lastUpdateCompleted = new Date().toISOString();
      } finally {
        // Stäng anslutningen om den skapades
        if (conn) {
          try {
            await conn.close();
          } catch (closeErr) {
            console.error("Fel vid stängning av anslutning:", closeErr);
          }
        }
      }
    })();
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
