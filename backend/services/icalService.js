import axios from "axios";
import ICAL from "ical.js";
import crypto from "crypto";
import { put, list } from "@vercel/blob";

// Hjälpfunktion för att vänta mellan retry-försök
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchICalData(url) {
  try {
    let modifiedUrl = url;
    if (url.startsWith("webcals://")) {
      modifiedUrl = url.replace("webcals://", "https://");
    }

    const response = await axios.get(modifiedUrl, {
      timeout: 120000,
      headers: {
        "User-Agent": "Calendar-Converter",
        Accept: "text/calendar",
        "Cache-Control": "no-cache",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Fel vid hämtning av iCal-data:", error.message);
    throw error;
  }
}

export function processICalData(data, summary = "Jobb") {
  try {
    if (!data || typeof data !== "string") {
      throw new Error("Ogiltig iCal-data: data måste vara en sträng");
    }

    const jcalData = ICAL.parse(data);
    const comp = new ICAL.Component(jcalData);
    const events = comp.getAllSubcomponents("vevent");
    console.log(`Bearbetar ${events.length} kalenderhändelser`);

    const dailyEvents = {};
    events.forEach((event) => {
      const dtstart = event.getFirstPropertyValue("dtstart");
      const dtend = event.getFirstPropertyValue("dtend");
      if (!dtstart || !dtend) return;

      const startDate = dtstart.toJSDate();
      const endDate = dtend.toJSDate();
      const date = startDate.toISOString().substr(0, 10);

      if (!dailyEvents[date]) {
        dailyEvents[date] = {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          summary: summary,
        };
      } else {
        if (endDate > new Date(dailyEvents[date].end)) {
          dailyEvents[date].end = endDate.toISOString();
        }
        if (startDate < new Date(dailyEvents[date].start)) {
          dailyEvents[date].start = startDate.toISOString();
        }
      }
    });

    return dailyEvents;
  } catch (error) {
    console.error("Fel vid bearbetning av iCal-data:", error);
    throw error;
  }
}

export function createICalFile(dailyEvents, summary = "Jobb") {
  const component = new ICAL.Component(["vcalendar", [], []]);
  component.addPropertyWithValue("version", "2.0");
  component.addPropertyWithValue("prodid", "-//iCal Converter//Calendar//SV");

  Object.entries(dailyEvents).forEach(([date, { start, end }]) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const vevent = new ICAL.Component("vevent");
    const uid = `${date}-${crypto.randomBytes(8).toString("hex")}`;
    vevent.addPropertyWithValue("uid", uid);
    vevent.addPropertyWithValue("summary", summary);

    const startTime = new ICAL.Time({
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      day: startDate.getDate(),
      hour: startDate.getHours(),
      minute: startDate.getMinutes(),
      second: 0,
      isDate: false,
    });

    const endTime = new ICAL.Time({
      year: endDate.getFullYear(),
      month: endDate.getMonth() + 1,
      day: endDate.getDate(),
      hour: endDate.getHours(),
      minute: endDate.getMinutes(),
      second: 0,
      isDate: false,
    });

    vevent.addPropertyWithValue("dtstart", startTime);
    vevent.addPropertyWithValue("dtend", endTime);
    component.addSubcomponent(vevent);
  });

  return component.toString();
}

export async function updateAllICalUrls() {
  try {
    console.log("Hämtar alla kalendrar från Vercel Blob...");
    const { blobs } = await list();
    const calendarBlobs = blobs.filter((blob) =>
      blob.pathname.endsWith(".json")
    );
    console.log(`Hittade ${calendarBlobs.length} kalendrar att uppdatera`);

    const results = [];
    for (const blob of calendarBlobs) {
      try {
        console.log(`Hämtar data för kalender: ${blob.pathname}`);
        const response = await axios.get(blob.url);
        const calendarData = response.data;

        if (!calendarData || !calendarData.originalUrl) {
          console.error(`Ogiltig kalenderdata för ${blob.pathname}`);
          results.push({
            pathname: blob.pathname,
            success: false,
            error: "Ogiltig kalenderdata",
          });
          continue;
        }

        // Hämta och bearbeta ny kalenderdata
        const data = await fetchICalData(calendarData.originalUrl);
        const processedData = processICalData(
          data,
          calendarData.summary || "Jobb"
        );
        const icalContent = createICalFile(
          processedData,
          calendarData.summary || "Jobb"
        );

        // Spara den uppdaterade kalenderfilen
        const icsBlob = await put(calendarData.uniqueId + ".ics", icalContent, {
          access: "public",
        });

        // Uppdatera metadata
        const updatedData = {
          ...calendarData,
          processedData,
          icalContent,
          blobUrl: icsBlob.url,
          lastUpdated: new Date().toISOString(),
        };

        // Spara uppdaterad metadata
        await put(blob.pathname, JSON.stringify(updatedData, null, 2), {
          access: "public",
        });

        results.push({
          pathname: blob.pathname,
          success: true,
        });
      } catch (error) {
        console.error(`Fel vid uppdatering av ${blob.pathname}:`, error);
        results.push({
          pathname: blob.pathname,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      message: "Uppdatering slutförd",
      results,
    };
  } catch (error) {
    console.error("Fel vid uppdatering av kalendrar:", error);
    throw {
      success: false,
      message: "Fel vid uppdatering av kalendrar",
      error: error.message,
    };
  }
}

export async function getCalendarById(uniqueId) {
  try {
    console.log(`Hämtar kalender med ID: ${uniqueId}`);
    const { blobs } = await list();

    // Leta efter .ics-filen direkt
    const icsBlob = blobs.find((blob) => blob.pathname === `${uniqueId}.ics`);

    if (!icsBlob) {
      console.log(`Hittade ingen .ics-fil för ID: ${uniqueId}`);
      return null;
    }

    // Hämta .ics-innehållet
    const icsResponse = await axios.get(icsBlob.url);
    const icalContent = icsResponse.data;

    return {
      icalContent,
      blobUrl: icsBlob.url,
    };
  } catch (error) {
    console.error(`Fel vid hämtning av kalender ${uniqueId}:`, error);
    throw error;
  }
}
