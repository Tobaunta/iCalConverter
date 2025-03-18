import axios from "axios";
import ICAL from "ical.js";
import ICalUrl from "../models/ICalUrl.js";
import crypto from "crypto";

export async function fetchICalData(url) {
  try {
    let modifiedUrl = url;
    if (url.startsWith("webcals://")) {
      modifiedUrl = url.replace("webcals://", "https://");
    }
    const response = await axios.get(modifiedUrl, {
      timeout: 10000,
      headers: {
        "User-Agent": "Calendar-Converter",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Fel vid hämtning av iCal-data:", error.message);
    if (error.response) {
      console.error(`Statuskod: ${error.response.status}`);
      console.error(`Svarsdata: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Kunde inte hämta iCal-data: ${error.message}`);
  }
}

export function processICalData(data, summary = "Jobb") {
  try {
    if (!data || typeof data !== "string") {
      console.error("Ogiltig iCal-data:", typeof data);
      throw new Error("Ogiltig iCal-data: data måste vara en sträng");
    }
    const jcalData = ICAL.parse(data);
    const comp = new ICAL.Component(jcalData);
    const events = comp.getAllSubcomponents("vevent");
    const dailyEvents = {};
    events.forEach((event) => {
      try {
        const dtstart = event.getFirstPropertyValue("dtstart");
        const dtend = event.getFirstPropertyValue("dtend");
        if (!dtstart || !dtend) {
          return;
        }
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
      } catch (eventError) {
        console.error("Fel vid bearbetning av enskild händelse:", eventError);
      }
    });
    return dailyEvents;
  } catch (error) {
    console.error("Fel vid bearbetning av iCal-data:", error);
    throw new Error(`Kunde inte bearbeta iCal-data: ${error.message}`);
  }
}

export function createICalFile(dailyEvents, summary = "Jobb") {
  const component = new ICAL.Component(["vcalendar", [], []]);
  component.addPropertyWithValue("version", "2.0");
  component.addPropertyWithValue("prodid", "-//iCal Converter//Calendar//SV");
  Object.keys(dailyEvents).forEach((date) => {
    const { start, end } = dailyEvents[date];
    if (!start || !end) {
      console.error("Start eller slut är undefined:", start, end);
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error("Ogiltigt datum:", start, end);
      return;
    }
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

export function generateUniqueId(url) {
  return crypto.createHash("md5").update(url).digest("hex");
}

export async function saveOrUpdateICalUrl(url, summary = "Jobb") {
  try {
    const uniqueId = generateUniqueId(url);
    const data = await fetchICalData(url);
    const processedData = processICalData(data, summary);
    const icalContent = createICalFile(processedData, summary);
    const existingUrl = await ICalUrl.findOne({ uniqueId });
    if (existingUrl) {
      existingUrl.processedData = processedData;
      existingUrl.icalContent = icalContent;
      existingUrl.lastUpdated = new Date().toISOString();
      existingUrl.summary = summary;
      const updatedUrl = await ICalUrl.save(existingUrl);
      return updatedUrl;
    } else {
      const newUrl = {
        originalUrl: url,
        processedData,
        icalContent,
        uniqueId,
        summary,
        lastUpdated: new Date().toISOString(),
      };
      const savedUrl = await ICalUrl.save(newUrl);
      return savedUrl;
    }
  } catch (error) {
    console.error("Fel vid sparande av iCal URL:", error);
    throw new Error(`Kunde inte spara iCal URL: ${error.message}`);
  }
}

export async function getICalUrl(uniqueId) {
  try {
    if (!uniqueId) {
      console.error("getICalUrl: Inget uniqueId angavs");
      return null;
    }
    const icalUrl = await ICalUrl.findOne({ uniqueId });
    return icalUrl;
  } catch (error) {
    console.error(`Fel vid hämtning av iCal URL: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    throw new Error(`Kunde inte hämta iCal URL: ${error.message}`);
  }
}

export async function updateAllICalUrls() {
  try {
    // Importera updateStatus från index.js om det finns tillgängligt
    let updateStatus;
    try {
      const { updateStatus: importedStatus } = await import("../api/index.js");
      updateStatus = importedStatus;
    } catch (importError) {
      console.log(
        "Kunde inte importera updateStatus, fortsätter utan statusuppdatering"
      );
    }

    const urls = await ICalUrl.find();
    console.log(`Uppdaterar ${urls.length} kalendrar...`);

    // Uppdatera en kalender i taget för att undvika att överbelasta systemet
    for (const url of urls) {
      try {
        console.log(
          `Uppdaterar kalender: ${url.uniqueId} (${url.originalUrl})`
        );
        const data = await fetchICalData(url.originalUrl);
        const processedData = processICalData(data, url.summary || "Jobb");
        const icalContent = createICalFile(
          processedData,
          url.summary || "Jobb"
        );
        url.processedData = processedData;
        url.icalContent = icalContent;
        url.lastUpdated = new Date().toISOString();
        await ICalUrl.save(url);
        console.log(`Uppdatering slutförd för kalender: ${url.uniqueId}`);
      } catch (error) {
        console.error(`Fel vid uppdatering av ${url.originalUrl}:`, error);
      }

      // Lägg till en kort paus mellan varje kalenderuppdatering för att undvika att överbelasta systemet
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Uppdatera status om det är tillgängligt
    if (updateStatus) {
      updateStatus.isUpdating = false;
      updateStatus.lastUpdateCompleted = new Date().toISOString();
      updateStatus.error = null;
    }

    console.log("Alla kalendrar har uppdaterats");
    return { success: true, count: urls.length };
  } catch (error) {
    console.error("Fel vid uppdatering av alla iCal URLs:", error);
    throw new Error(`Kunde inte uppdatera alla iCal URLs: ${error.message}`);
  }
}
