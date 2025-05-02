import axios from "axios";
import ICAL from "ical.js";
import crypto from "crypto";
import ICalUrl from "../models/ICalUrl.js";

// Hjälpfunktion för att vänta mellan retry-försök
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchICalData(url) {
  try {
    if (!url) {
      throw new Error("Ingen URL angiven för kalendern");
    }

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
    if (!url) {
      throw new Error("Ingen URL angiven för kalendern");
    }
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
    let events = comp.getAllSubcomponents("vevent");
    // Filtrera bort events som innehåller 'Work reduction' i summary eller description
    events = events.filter((event) => {
      const summary = event.getFirstPropertyValue("summary") || "";
      const description = event.getFirstPropertyValue("description") || "";
      return !(
        summary.toLowerCase().includes("work reduction") ||
        description.toLowerCase().includes("work reduction")
      );
    });
    console.log(
      `Bearbetar ${events.length} kalenderhändelser efter filtrering`
    );

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
  console.log("Startar uppdatering av alla iCal-URLs");
  const results = [];

  try {
    const calendars = await ICalUrl.find();
    for (const calendarData of calendars) {
      try {
        console.log(`Behandlar kalender: ${calendarData.uniqueId}`);
        const calendarUrl =
          calendarData?.url ||
          calendarData?.originalUrl ||
          calendarData?.icalUrl;

        if (!calendarData || !calendarUrl) {
          results.push({
            uniqueId: calendarData.uniqueId,
            success: false,
            error: "Saknar URL",
          });
          continue;
        }

        const icalData = await fetchICalData(calendarUrl);
        const dailyEvents = processICalData(icalData, calendarData.summary);
        const icalContent = createICalFile(dailyEvents, calendarData.summary);

        await ICalUrl.save({
          uniqueId: calendarData.uniqueId,
          url: calendarUrl,
          summary: calendarData.summary,
          icalContent,
          lastUpdated: new Date(),
        });

        results.push({
          uniqueId: calendarData.uniqueId,
          success: true,
        });
      } catch (error) {
        results.push({
          uniqueId: calendarData.uniqueId,
          success: false,
          error: error.message,
        });
      }
    }
    return results;
  } catch (error) {
    console.error("Fel vid uppdatering:", error);
    throw error;
  }
}

export async function getCalendarById(uniqueId) {
  try {
    console.log(`Hämtar kalender med ID: ${uniqueId}`);
    const calendar = await ICalUrl.findOne({ uniqueId });
    if (!calendar) {
      console.log(`Hittade ingen kalender för ID: ${uniqueId}`);
      return null;
    }
    return {
      icalContent: calendar.icalContent || "",
      uniqueId: calendar.uniqueId,
    };
  } catch (error) {
    console.error(`Fel vid hämtning av kalender ${uniqueId}:`, error);
    throw error;
  }
}
