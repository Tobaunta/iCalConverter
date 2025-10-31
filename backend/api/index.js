import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import ICalUrl from '../models/ICalUrl.js';
import { processICalUrl, fetchICalData, processICalData, generateUniqueId } from '../services/icalService.js';

// Ladda miljövariabler
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/icalconverter';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const UPDATE_API_KEY = process.env.UPDATE_API_KEY;
const TIMEZONE = process.env.TIMEZONE || 'Europe/Stockholm';

// Status-variabler för uppdateringar
let updateStatus = {
  isUpdating: false,
  lastUpdateStarted: null,
  lastUpdateCompleted: null,
  error: null
};

let generateStatus = {
  isGenerating: false,
  lastGenerateStarted: null,
  lastGenerateCompleted: null,
  error: null,
  uniqueId: null
};

// Middleware
const allowedOrigins = [
  CLIENT_URL,
  'https://icalconverter.torkelsson.online',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Tillåt requests utan origin (t.ex. mobila appar eller Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Inte tillåten av CORS policy'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Anslut till MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Ansluten till MongoDB'))
  .catch(err => console.error('MongoDB-anslutningsfel:', err));

// Hjälpfunktion för felhantering
const handleError = (res, error, statusCode = 500) => {
  console.error('API-fel:', error);
  const message = process.env.NODE_ENV === 'production' 
    ? 'Ett internt serverfel inträffade' 
    : error.message;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
};

// Validering av URL
const isValidUrl = (url) => {
  try {
    const urlObj = new URL(url.replace(/^webcals:\/\//, 'https://'));
    return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
  } catch {
    return false;
  }
};

// Routes

/**
 * GET / - Hälsokoll
 */
app.get('/', (req, res) => {
  res.json({
    message: 'iCal Converter API',
    version: '1.0.0',
    status: 'OK',
    timezone: TIMEZONE
  });
});

/**
 * POST /generate - Generera förenklad iCal
 */
app.post('/generate', async (req, res) => {
  try {
    generateStatus.isGenerating = true;
    generateStatus.lastGenerateStarted = new Date();
    generateStatus.error = null;

    const { url, summary = 'Jobb' } = req.body;

    // Validera input
    if (!url) {
      return res.status(400).json({ error: 'URL krävs' });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Ogiltig URL' });
    }

    // Processa iCal
    const result = await processICalUrl(url, summary, TIMEZONE);
    generateStatus.uniqueId = result.uniqueId;

    // Spara eller uppdatera i databas
    await ICalUrl.findOneAndUpdate(
      { uniqueId: result.uniqueId },
      {
        url,
        summary,
        icalContent: result.icalContent,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || 'http';
    const apiUrl = `${protocol}://${host}/calendar/${result.uniqueId}`;
    const googleLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(apiUrl)}`;

    generateStatus.isGenerating = false;
    generateStatus.lastGenerateCompleted = new Date();

    res.json({
      apiUrl,
      googleLink,
      uniqueId: result.uniqueId,
      lastUpdated: new Date()
    });

  } catch (error) {
    generateStatus.isGenerating = false;
    generateStatus.error = error.message;
    handleError(res, error);
  }
});

/**
 * GET /calendar/:id - Hämta iCal-feed
 */
app.get('/calendar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const icalUrl = await ICalUrl.findOne({ uniqueId: id });
    
    if (!icalUrl) {
      return res.status(404).json({ error: 'Kalender hittades inte' });
    }

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename=calendar.ics'
    });
    
    res.send(icalUrl.icalContent);

  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /update-calendars - Uppdatera alla kalendrar i batches
 */
app.get('/update-calendars', async (req, res) => {
  try {
    const { apiKey, batch = '0', batchSize = '3' } = req.query;

    if (!UPDATE_API_KEY || apiKey !== UPDATE_API_KEY) {
      return res.status(401).json({ error: 'Ogiltig API-nyckel' });
    }

    const batchNumber = parseInt(batch);
    const size = parseInt(batchSize);

    // Hämta total antal kalendrar för att beräkna batches
    const totalCalendars = await ICalUrl.countDocuments({});
    const totalBatches = Math.ceil(totalCalendars / size);

    if (batchNumber >= totalBatches) {
      return res.json({
        message: 'Alla batches är klara',
        totalCalendars,
        totalBatches,
        currentBatch: batchNumber,
        completed: true
      });
    }

    // Uppdatera current batch
    const result = await updateCalendarBatch(batchNumber, size);

    res.json({
      message: `Batch ${batchNumber + 1}/${totalBatches} uppdaterad`,
      totalCalendars,
      totalBatches,
      currentBatch: batchNumber,
      nextBatch: batchNumber + 1,
      completed: batchNumber + 1 >= totalBatches,
      result
    });

  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /update-status - Status för uppdateringar
 */
app.get('/update-status', (req, res) => {
  res.json(updateStatus);
});

/**
 * GET /generate-status - Status för generering
 */
app.get('/generate-status', (req, res) => {
  res.json(generateStatus);
});

/**
 * GET /update-all-batches - Startar automatisk uppdatering av alla batches
 */
app.get('/update-all-batches', async (req, res) => {
  try {
    const { apiKey } = req.query;

    if (!UPDATE_API_KEY || apiKey !== UPDATE_API_KEY) {
      return res.status(401).json({ error: 'Ogiltig API-nyckel' });
    }

    if (updateStatus.isUpdating) {
      return res.json({ 
        message: 'Uppdatering pågår redan',
        status: updateStatus 
      });
    }

    // Starta asynkron batch-uppdatering
    updateAllBatches();

    res.json({
      message: 'Batch-uppdatering startad',
      status: 'started'
    });

  } catch (error) {
    handleError(res, error);
  }
});

/**
 * Uppdatera en batch av kalendrar
 */
async function updateCalendarBatch(batchNumber, batchSize) {
  const startTime = new Date();
  const skip = batchNumber * batchSize;
  
  try {
    // Hämta endast den aktuella batchen
    const calendars = await ICalUrl.find({})
      .skip(skip)
      .limit(batchSize)
      .lean(); // Använd lean() för bättre prestanda

    console.log(`Uppdaterar batch ${batchNumber}: ${calendars.length} kalendrar (skip: ${skip})`);

    const results = {
      processed: 0,
      updated: 0,
      errors: []
    };

    // Processa kalendrar parallellt inom batchen
    const promises = calendars.map(async (calendar) => {
      try {
        results.processed++;
        
        // Hämta ny iCal-data med timeout
        const icalData = await Promise.race([
          fetchICalData(calendar.url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Fetch timeout')), 8000)
          )
        ]);
        
        // Processa enligt arbetsdygnslogik
        const processedICal = processICalData(icalData, calendar.summary, TIMEZONE);
        
        // Uppdatera i databas
        await ICalUrl.findOneAndUpdate(
          { uniqueId: calendar.uniqueId },
          {
            icalContent: processedICal,
            lastUpdated: new Date()
          }
        );

        results.updated++;
        console.log(`Uppdaterade kalender: ${calendar.uniqueId}`);
        return { success: true, uniqueId: calendar.uniqueId };

      } catch (error) {
        const errorMsg = `Fel vid uppdatering av ${calendar.uniqueId}: ${error.message}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
        return { success: false, uniqueId: calendar.uniqueId, error: error.message };
      }
    });

    await Promise.all(promises);

    const duration = new Date() - startTime;
    console.log(`Batch ${batchNumber} klar på ${duration}ms`);

    return {
      ...results,
      batchNumber,
      duration: `${duration}ms`,
      calendarsInBatch: calendars.length
    };

  } catch (error) {
    console.error(`Fel vid batch ${batchNumber}:`, error);
    throw error;
  }
}

/**
 * Asynkron funktion för att uppdatera alla kalendrar via batches
 */
async function updateAllBatches() {
  updateStatus.isUpdating = true;
  updateStatus.lastUpdateStarted = new Date();
  updateStatus.error = null;

  try {
    const totalCalendars = await ICalUrl.countDocuments({});
    const batchSize = 3; // Mindre batches för att undvika timeout
    const totalBatches = Math.ceil(totalCalendars / batchSize);
    
    console.log(`Startar uppdatering av ${totalCalendars} kalendrar i ${totalBatches} batches...`);

    let totalUpdated = 0;
    let totalErrors = 0;

    for (let batchNumber = 0; batchNumber < totalBatches; batchNumber++) {
      try {
        console.log(`Processar batch ${batchNumber + 1}/${totalBatches}...`);
        
        const result = await updateCalendarBatch(batchNumber, batchSize);
        totalUpdated += result.updated;
        totalErrors += result.errors.length;
        
        console.log(`Batch ${batchNumber + 1} klar: ${result.updated} uppdaterade, ${result.errors.length} fel`);
        
        // Kort paus mellan batches för att undvika överbelastning
        if (batchNumber < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Fel i batch ${batchNumber}:`, error.message);
        totalErrors++;
      }
    }

    updateStatus.isUpdating = false;
    updateStatus.lastUpdateCompleted = new Date();
    console.log(`Alla batches klara: ${totalUpdated} uppdaterade, ${totalErrors} fel`);

  } catch (error) {
    updateStatus.isUpdating = false;
    updateStatus.error = error.message;
    console.error('Fel vid batch-uppdatering:', error);
  }
}

// Felhantering för ej hittade routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route hittades inte' });
});

// Global felhantering
app.use((error, req, res, next) => {
  handleError(res, error);
});

// Starta server
app.listen(PORT, () => {
  console.log(`Server körs på port ${PORT}`);
  console.log(`Tidszon: ${TIMEZONE}`);
  console.log(`CORS tillåter: ${CLIENT_URL}`);
});

export default app;
