import axios from 'axios';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import crypto from 'crypto';

/**
 * Hämtar iCal-data från en URL
 */
export async function fetchICalData(url) {
  try {
    // Konvertera webcals:// till https://
    const httpsUrl = url.replace(/^webcals:\/\//, 'https://');
    
    const response = await axios.get(httpsUrl, {
      headers: {
        'User-Agent': 'Calendar-Converter'
      },
      timeout: 120000 // 120 sekunder timeout
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Kunde inte hämta iCal-data: ${error.message}`);
  }
}

/**
 * Beräknar unikt ID baserat på URL och summary
 */
export function generateUniqueId(url, summary = 'Jobb') {
  const hash = crypto.createHash('sha256');
  hash.update(url + summary);
  return hash.digest('hex').slice(0, 16);
}

/**
 * Bestämmer vilket arbetsdygn en tidsstämpel tillhör
 * Arbetsdygn: 06:00 - 06:00 nästa dag
 */
function getWorkdayAnchor(dateTime, timezone) {
  const dt = dateTime.setZone(timezone);
  
  if (dt.hour >= 6) {
    // Om klockan är 06:00 eller senare, tillhör samma dag
    return dt.startOf('day');
  } else {
    // Om klockan är före 06:00, tillhör föregående dag
    return dt.minus({ days: 1 }).startOf('day');
  }
}

/**
 * Delar upp ett event i segment baserat på arbetsdygn (06:00-06:00)
 */
function splitEventByWorkdays(startTime, endTime, timezone) {
  const segments = [];
  let currentStart = startTime.setZone(timezone);
  const finalEnd = endTime.setZone(timezone);
  
  while (currentStart < finalEnd) {
    const workdayAnchor = getWorkdayAnchor(currentStart, timezone);
    const workdayEnd = workdayAnchor.plus({ days: 1 }).set({ hour: 6, minute: 0, second: 0 });
    
    const segmentEnd = DateTime.min(finalEnd, workdayEnd);
    
    segments.push({
      start: currentStart,
      end: segmentEnd,
      workdayDate: workdayAnchor.toISODate()
    });
    
    currentStart = workdayEnd;
  }
  
  return segments;
}

/**
 * Filtrerar bort events som innehåller specifika nyckelord
 */
function shouldFilterEvent(event) {
  const summary = event.summary || '';
  const description = event.description || '';
  
  // Lista över nyckelord som ska filtreras bort
  const filterKeywords = [
    'work reduction',
    'holiday',
    'loa',
    'care of child',
    'sick'
  ];
  
  const summaryLower = summary.toLowerCase();
  const descriptionLower = description.toLowerCase();
  
  // Kontrollera om någon av nyckelorden finns i summary eller description
  return filterKeywords.some(keyword => 
    summaryLower.includes(keyword) || descriptionLower.includes(keyword)
  );
}

/**
 * Processerar iCal-data enligt arbetsdygnslogik
 */
export function processICalData(icalData, summary = 'Jobb', timezone = 'Europe/Stockholm') {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    // Map för att aggregera events per arbetsdygn
    const workdayMap = new Map();
    
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      
      // Filtrera bort "Work reduction" events
      if (shouldFilterEvent(event)) {
        continue;
      }
      
      // Hämta start- och sluttider
      let startTime, endTime;
      
      try {
        startTime = DateTime.fromJSDate(event.startDate.toJSDate());
        endTime = DateTime.fromJSDate(event.endDate.toJSDate());
      } catch (error) {
        console.warn('Kunde inte parsa datum för event:', error.message);
        continue;
      }
      
      // Dela upp event i arbetsdygn-segment
      const segments = splitEventByWorkdays(startTime, endTime, timezone);
      
      for (const segment of segments) {
        const workdayDate = segment.workdayDate;
        
        if (!workdayMap.has(workdayDate)) {
          workdayMap.set(workdayDate, {
            earliestStart: segment.start,
            latestEnd: segment.end
          });
        } else {
          const existing = workdayMap.get(workdayDate);
          existing.earliestStart = DateTime.min(existing.earliestStart, segment.start);
          existing.latestEnd = DateTime.max(existing.latestEnd, segment.end);
        }
      }
    }
    
    // Skapa förenklad iCal
    return createSimplifiedICal(workdayMap, summary, timezone);
    
  } catch (error) {
    throw new Error(`Kunde inte processa iCal-data: ${error.message}`);
  }
}

/**
 * Skapar en förenklad iCal med ett event per arbetsdygn
 */
function createSimplifiedICal(workdayMap, summary, timezone) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iCal Converter//Calendar//SV',
    'CALSCALE:GREGORIAN'
  ];
  
  // Lägg till tidszon-information
  if (timezone === 'Europe/Stockholm') {
    lines.push(
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Stockholm',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    );
  }
  
  // Skapa events för varje arbetsdygn
  for (const [workdayDate, times] of workdayMap) {
    const randomHex = crypto.randomBytes(4).toString('hex');
    const uid = `${workdayDate}-${randomHex}`;
    
    // Formatera datum för iCal (YYYYMMDDTHHMMSS)
    const startStr = times.earliestStart.toFormat("yyyyMMdd'T'HHmmss");
    const endStr = times.latestEnd.toFormat("yyyyMMdd'T'HHmmss");
    
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;TZID=${timezone}:${startStr}`,
      `DTEND;TZID=${timezone}:${endStr}`,
      `SUMMARY:${summary}`,
      `DTSTAMP:${DateTime.now().toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
      'END:VEVENT'
    );
  }
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

/**
 * Huvudfunktion för att processa en iCal-URL
 */
export async function processICalUrl(url, summary = 'Jobb', timezone = 'Europe/Stockholm') {
  const icalData = await fetchICalData(url);
  const processedICal = processICalData(icalData, summary, timezone);
  const uniqueId = generateUniqueId(url, summary);
  
  return {
    uniqueId,
    icalContent: processedICal
  };
}
