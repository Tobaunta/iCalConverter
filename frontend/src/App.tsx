import { useState } from "react";
import {
  TextField,
  Button,
  Typography,
  Container,
  Box,
  CircularProgress,
  Alert,
  Link,
  Card,
  CardContent,
  Paper,
} from "@mui/material";
import axios from "axios";

interface CalendarResponse {
  googleLink: string;
  apiUrl: string;
  lastUpdated: string;
}

function App() {
  const [icalUrl, setIcalUrl] = useState("");
  const [eventSummary, setEventSummary] = useState("Jobb");
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post<CalendarResponse>(
        `${import.meta.env.VITE_API_URL}/generate`,
        {
          url: icalUrl,
          summary: eventSummary,
        }
      );
      setCalendarData(response.data);
    } catch (error) {
      console.error("Fel vid hämtning av ny URL:", error);
      setError(
        "Ett fel inträffade vid generering av kalendern. Kontrollera att URL:en är korrekt."
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("sv-SE", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Container
      sx={{
        minHeight: "98vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        py: 4,
      }}
    >
      <Typography variant="h4" component="h1" gutterBottom>
        Kalenderförenklare
      </Typography>

      <Typography
        variant="body1"
        sx={{ mb: 3, textAlign: "center", maxWidth: "600px" }}
      >
        Ange en iCal-adress för att skapa en förenklad kalender som visar en
        händelse per dag från första till sista händelsen.
      </Typography>

      <Paper
        elevation={3}
        sx={{
          width: "100%",
          maxWidth: "600px",
          mb: 4,
          overflow: "hidden",
          borderRadius: 2,
        }}
      >
        <Box
          component="img"
          src="/printscreen.png"
          alt="Exempel på kalenderkonvertering"
          sx={{
            width: "100%",
            height: "auto",
            display: "block",
          }}
        />
        <Box sx={{ p: 2, bgcolor: "background.paper" }}>
          <Typography variant="subtitle2" color="text.secondary" align="center">
            Exempel på hur den förenklade kalendern kan se ut
          </Typography>
        </Box>
      </Paper>

      <Card sx={{ width: "100%", maxWidth: "600px", mb: 4 }}>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              label="iCal URL"
              placeholder="https://example.com/calendar.ics eller webcals://example.com/calendar.ics"
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              label="Händelsenamn"
              placeholder="Vad ska händelserna heta i kalendern?"
              value={eventSummary}
              onChange={(e) => setEventSummary(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              disabled={loading || !icalUrl || !eventSummary}
              sx={{ mt: 2 }}
            >
              {loading ? (
                <CircularProgress size={24} />
              ) : (
                "Generera förenklad kalender"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert
          severity="error"
          sx={{ width: "100%", maxWidth: "600px", mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {calendarData && (
        <Card sx={{ width: "100%", maxWidth: "600px" }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Din förenklade kalender är klar!
            </Typography>

            <Typography variant="body2" color="text.secondary" gutterBottom>
              Senast uppdaterad: {formatDate(calendarData.lastUpdated)}
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Google Calendar-länk:
              </Typography>
              <Link
                href={calendarData.googleLink}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ wordBreak: "break-all" }}
              >
                Klicka här för att lägga till i Google Calendar
              </Link>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Direkt iCal-länk:
              </Typography>
              <TextField
                variant="outlined"
                size="small"
                fullWidth
                value={calendarData.apiUrl}
                InputProps={{
                  readOnly: true,
                }}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                Använd denna länk för att prenumerera på kalendern i valfri
                kalenderapp. Kalendern uppdateras automatiskt varje timme.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default App;
