import { useState, useEffect } from 'react'
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Link,
  Divider,
  CircularProgress
} from '@mui/material'
import {
  ContentCopy as CopyIcon,
  CalendarToday as CalendarIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material'

interface GenerateResponse {
  apiUrl: string;
  googleLink: string;
  uniqueId: string;
  lastUpdated: string;
}

interface Status {
  isGenerating?: boolean;
  isUpdating?: boolean;
  lastGenerateStarted?: string;
  lastGenerateCompleted?: string;
  lastUpdateStarted?: string;
  lastUpdateCompleted?: string;
  error?: string;
  uniqueId?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('Jobb');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<Status>({});
  const [updateStatus, setUpdateStatus] = useState<Status>({});
  const [copySuccess, setCopySuccess] = useState(false);

  // Hämta status regelbundet
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [genRes, updateRes] = await Promise.all([
          fetch(`${API_BASE_URL}/generate-status`),
          fetch(`${API_BASE_URL}/update-status`)
        ]);
        
        if (genRes.ok) {
          const genData = await genRes.json();
          setGenerateStatus(genData);
        }
        
        if (updateRes.ok) {
          const updateData = await updateRes.json();
          setUpdateStatus(updateData);
        }
      } catch (error) {
        console.error('Kunde inte hämta status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Uppdatera var 5:e sekund

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, summary }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Något gick fel');
      }

      const data: GenerateResponse = await response.json();
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ett okänt fel inträffade');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Kunde inte kopiera:', error);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom color="primary">
            iCal Converter
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Konvertera din iCal-kalender till förenklade arbetsdygn (06:00-06:00)
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} sx={{ mb: 4 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="iCal URL"
                type="url"
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                placeholder="https://example.com/calendar.ics eller webcals://..."
                required
                variant="outlined"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Sammanfattning (valfritt)"
                value={summary}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSummary(e.target.value)}
                placeholder="Jobb"
                variant="outlined"
              />
            </Grid>
            
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading || !url}
                startIcon={loading ? <CircularProgress size={20} /> : <CalendarIcon />}
              >
                {loading ? 'Genererar...' : 'Generera kalender'}
              </Button>
            </Grid>
          </Grid>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" gutterBottom>
              Resultat
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card variant="outlined" sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      API URL
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box 
                        component="code" 
                        sx={{ 
                          flex: 1, 
                          p: 1, 
                          bgcolor: 'background.paper', 
                          color: 'text.primary',
                          borderRadius: 1,
                          fontSize: '0.875rem',
                          border: 1,
                          borderColor: 'divider'
                        }}
                      >
                        {result.apiUrl}
                      </Box>
                      <IconButton
                        onClick={() => copyToClipboard(result.apiUrl)}
                        color={copySuccess ? 'success' : 'primary'}
                        size="small"
                      >
                        {copySuccess ? <CheckIcon /> : <CopyIcon />}
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Card variant="outlined" sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Google Calendar
                    </Typography>
                    <Button
                      component={Link}
                      href={result.googleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="contained"
                      color="primary"
                      startIcon={<CalendarIcon />}
                    >
                      Lägg till i Google Calendar
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Senast uppdaterad: {new Date(result.lastUpdated).toLocaleString('sv-SE')}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        <Box>
          <Typography variant="h5" gutterBottom>
            Status
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Generering
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Chip
                      icon={generateStatus.isGenerating ? <CircularProgress size={16} /> : <CheckIcon />}
                      label={generateStatus.isGenerating ? 'Pågår' : 'Redo'}
                      color={generateStatus.isGenerating ? 'warning' : 'success'}
                      size="small"
                    />
                  </Box>
                  {generateStatus.lastGenerateCompleted && (
                    <Typography variant="body2" color="text.secondary">
                      Senast: {new Date(generateStatus.lastGenerateCompleted).toLocaleString('sv-SE')}
                    </Typography>
                  )}
                  {generateStatus.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {generateStatus.error}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Uppdatering
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Chip
                      icon={updateStatus.isUpdating ? <CircularProgress size={16} /> : <CheckIcon />}
                      label={updateStatus.isUpdating ? 'Pågår' : 'Redo'}
                      color={updateStatus.isUpdating ? 'warning' : 'success'}
                      size="small"
                    />
                  </Box>
                  {updateStatus.lastUpdateCompleted && (
                    <Typography variant="body2" color="text.secondary">
                      Senast: {new Date(updateStatus.lastUpdateCompleted).toLocaleString('sv-SE')}
                    </Typography>
                  )}
                  {updateStatus.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {updateStatus.error}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  )
}

export default App
