# iCal Converter

Ett fullstack-projekt som konverterar iCal-kalendrar till förenklade arbetsdygn (06:00-06:00).

## Funktioner

- **Arbetsdygnslogik**: Konverterar events till 06:00-06:00 format enligt svensk tidszon
- **Filtrering**: Tar automatiskt bort events som innehåller "Work reduction", "Holiday", "LoA", "Care of Child", eller "Sick"
- **Google Calendar-integration**: Direkt länk för att lägga till i Google Calendar
- **Automatisk uppdatering**: Backend-endpoint för att uppdatera alla kalendrar
- **Status-övervakning**: Realtidsövervakning av generering och uppdateringar

## Teknisk stack

### Backend
- Node.js med ES-moduler
- Express.js för API
- MongoDB med Mongoose
- ical.js för iCal-parsing
- Luxon för tidshantering
- Axios för HTTP-requests

### Frontend
- React med TypeScript
- Vite som build-verktyg
- Material-UI (MUI) för styling och komponenter

## Installation och körning

### Förutsättningar
- Node.js (LTS version)
- MongoDB (lokal installation eller MongoDB Atlas)

### Backend

1. Navigera till backend-mappen:
```bash
cd backend
```

2. Installera dependencies:
```bash
npm install
```

3. Konfigurera miljövariabler i `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/icalconverter
PORT=3000
CLIENT_URL=http://localhost:5173
UPDATE_API_KEY=your-secret-update-key-here
TIMEZONE=Europe/Stockholm
UPDATE_INTERVAL=3600000
```

4. Starta servern:
```bash
npm run dev
```

### Frontend

1. Navigera till frontend-mappen:
```bash
cd frontend
```

2. Installera dependencies:
```bash
npm install
```

3. Starta utvecklingsservern:
```bash
npm run dev
```

## API-dokumentation

### Endpoints

#### `GET /`
Hälsokoll för API:et.

#### `POST /generate`
Genererar en förenklad iCal-kalender.

**Body:**
```json
{
  "url": "https://example.com/calendar.ics",
  "summary": "Jobb"
}
```

**Response:**
```json
{
  "apiUrl": "http://localhost:3000/calendar/abc123",
  "googleLink": "https://www.google.com/calendar/render?cid=...",
  "uniqueId": "abc123",
  "lastUpdated": "2024-01-01T12:00:00.000Z"
}
```

#### `GET /calendar/:id`
Hämtar den förenklade iCal-filen.

#### `GET /update-calendars?apiKey=<key>&batch=<number>&batchSize=<size>`
Uppdaterar en specifik batch av kalendrar (för Vercel timeout-hantering).

**Parametrar:**
- `apiKey`: API-nyckel för autentisering
- `batch`: Batch-nummer (börjar från 0, default: 0)
- `batchSize`: Antal kalendrar per batch (default: 3)

**Svar:**
```json
{
  "message": "Batch 1/3 uppdaterad",
  "totalCalendars": 10,
  "totalBatches": 4,
  "currentBatch": 0,
  "nextBatch": 1,
  "completed": false,
  "result": {
    "processed": 3,
    "updated": 2,
    "errors": ["Fel vid uppdatering av abc123: Timeout"],
    "batchNumber": 0,
    "duration": "8500ms",
    "calendarsInBatch": 3
  }
}
```

#### `GET /update-all-batches?apiKey=<key>`
Startar automatisk uppdatering av alla kalendrar via batch-processing.

**Parametrar:**
- `apiKey`: API-nyckel för autentisering

**Svar:**
```json
{
  "message": "Batch-uppdatering startad",
  "status": "started"
}
```

#### `GET /update-status`
Returnerar status för uppdateringsprocessen.

#### `GET /generate-status`
Returnerar status för genereringsprocessen.

## Arbetsdygnslogik

Projektet implementerar en specifik logik för att konvertera kalenderhändelser till "arbetsdygn":

1. **Arbetsdygn definieras som 06:00-06:00** (nästa dag)
2. **Tidszon**: Europe/Stockholm (konfigurerbar)
3. **Uppdelning**: Events som sträcker sig över 06:00-gränsen delas upp
4. **Aggregering**: Alla events inom samma arbetsdygn slås samman till ett event
5. **Filtrering**: Events som innehåller följande nyckelord i titel eller beskrivning tas bort:
   - "Work reduction"
   - "Holiday" 
   - "LoA" (Leave of Absence)
   - "Care of Child"
   - "Sick"

### Exempel

Om du har följande events:
- Event 1: 08:00-12:00 (måndag)
- Event 2: 13:00-17:00 (måndag)
- Event 3: 22:00 (måndag) - 02:00 (tisdag)

Blir resultatet:
- Arbetsdygn måndag: 08:00-17:00
- Arbetsdygn tisdag: 22:00-02:00

## Säkerhet

- CORS konfigurerat för att endast tillåta frontend-origin
- API-nyckel krävs för uppdateringsendpoint
- Felmeddelanden maskeras i production

## Utveckling

### Backend-utveckling
```bash
cd backend
npm run dev  # Använder --watch för automatisk omstart
```

### Frontend-utveckling
```bash
cd frontend
npm run dev  # Hot reload aktiverat
```

### Bygga för production
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm start
```

## Miljövariabler

| Variabel | Beskrivning | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB-anslutningssträng | `mongodb://localhost:27017/icalconverter` |
| `PORT` | Backend-port | `3000` |
| `CLIENT_URL` | Frontend-URL för CORS | `http://localhost:5173` |
| `UPDATE_API_KEY` | Hemlig nyckel för uppdateringar | - |
| `TIMEZONE` | Tidszon för arbetsdygn | `Europe/Stockholm` |
| `UPDATE_INTERVAL` | Uppdateringsintervall (ms) | `3600000` |

## Felsökning

### Vanliga problem

1. **MongoDB-anslutning misslyckas**
   - Kontrollera att MongoDB körs
   - Verifiera MONGODB_URI i .env

2. **CORS-fel**
   - Kontrollera CLIENT_URL i backend .env
   - Se till att frontend körs på rätt port

3. **iCal-parsing misslyckas**
   - Kontrollera att URL:en är giltig
   - Testa med en enkel iCal-fil först

4. **MUI TypeScript-fel**
   - Kör `npm install` i frontend-mappen
   - Felen försvinner när MUI-dependencies är installerade

## Deployment

### Vercel Deployment

#### Backend
1. Skapa ett nytt Vercel-projekt för backend
2. Konfigurera miljövariabler i Vercel Dashboard:
   - `MONGODB_URI`: Din MongoDB Atlas connection string
   - `CLIENT_URL`: Frontend-URL (t.ex. `https://icalconverter.torkelsson.online`)
   - `UPDATE_API_KEY`: En säker slumpmässig sträng
   - `TIMEZONE`: `Europe/Stockholm`
3. Deploy med: `vercel --prod`

#### Frontend
1. Skapa ett nytt Vercel-projekt för frontend
2. Uppdatera `.env` med backend-URL:
   ```
   VITE_API_URL=https://your-backend-domain.vercel.app
   ```
3. Deploy med: `vercel --prod`

### CORS-konfiguration
Backend är konfigurerat för att tillåta följande origins:
- `https://icalconverter.torkelsson.online` (production frontend)
- `http://localhost:5173` (development frontend)
- `http://localhost:3000` (development backend)

För att lägga till fler domäner, uppdatera `allowedOrigins` i `backend/api/index.js`.

### Miljövariabler för Production

#### Backend (Vercel Environment Variables)
```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/icalconverter
CLIENT_URL=https://icalconverter.torkelsson.online
UPDATE_API_KEY=your-secure-random-key
TIMEZONE=Europe/Stockholm
NODE_ENV=production
```

#### Frontend (.env)
```
VITE_API_URL=https://calendar.torkelsson.online
```

### Vercel Timeout-hantering

Vercel har en 10-sekunders timeout för serverless functions. För att hantera detta använder systemet batch-processing:

#### Manuell batch-uppdatering
```bash
# Uppdatera första batchen (0-2 kalendrar)
curl "https://calendar.torkelsson.online/update-calendars?apiKey=YOUR_KEY&batch=0&batchSize=3"

# Uppdatera andra batchen (3-5 kalendrar)  
curl "https://calendar.torkelsson.online/update-calendars?apiKey=YOUR_KEY&batch=1&batchSize=3"
```

#### Automatisk batch-uppdatering
```bash
# Startar automatisk uppdatering av alla batches
curl "https://calendar.torkelsson.online/update-all-batches?apiKey=YOUR_KEY"
```

**Optimeringar för timeout:**
- Batch-storlek: 3 kalendrar per batch
- Parallell processing inom batch
- 8-sekunders timeout per iCal-fetch
- 1-sekunds paus mellan batches
- MongoDB `.lean()` för bättre prestanda

## Licens

ISC
