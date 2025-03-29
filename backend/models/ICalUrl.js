import { put, list, del } from "@vercel/blob";

class ICalUrlModel {
  constructor() {
    this.prefix = "icalurl-";
  }

  getBlobName(uniqueId) {
    return `${this.prefix}${uniqueId}.json`;
  }

  async findOne({ uniqueId }) {
    try {
      const blobName = this.getBlobName(uniqueId);
      try {
        const { blobs } = await list({ prefix: this.prefix });
        const matchingBlobs = blobs.filter(
          (blob) =>
            blob.pathname.endsWith(blobName) ||
            blob.pathname.includes(`/${blobName}`)
        );
        if (matchingBlobs.length === 0) {
          return null;
        }
        const matchingBlob = matchingBlobs[0];
        const response = await fetch(matchingBlob.url);
        if (!response.ok) {
          console.error(
            `Kunde inte hämta blob-innehåll: ${response.status} ${response.statusText}`
          );
          return null;
        }
        const text = await response.text();
        try {
          const parsed = JSON.parse(text);
          return parsed;
        } catch (parseError) {
          console.error(`Fel vid parsning av JSON: ${parseError.message}`);
          console.error(
            `Första 100 tecken av innehållet: ${text.substring(0, 100)}`
          );
          return null;
        }
      } catch (error) {
        console.error(`Fel vid hämtning av blob: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        return null;
      }
    } catch (error) {
      console.error(`Fel vid hämtning av data: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      return null;
    }
  }

  async save(document) {
    try {
      const blobName = this.getBlobName(document.uniqueId);
      const updatedDocument = {
        ...document,
        lastUpdated: new Date().toISOString(),
      };
      const jsonContent = JSON.stringify(updatedDocument);

      // Hämta alla existerande blobar med samma prefix
      const { blobs } = await list({ prefix: this.prefix });

      // Hitta och ta bort gamla versioner av samma kalender
      const oldBlobs = blobs.filter((blob) =>
        blob.pathname.includes(document.uniqueId)
      );

      // Spara ny version
      const result = await put(blobName, jsonContent, {
        contentType: "application/json",
        access: "public",
      });

      // Ta bort gamla versioner
      for (const oldBlob of oldBlobs) {
        try {
          await del(oldBlob.url);
        } catch (error) {
          console.error(`Failed to delete old blob: ${oldBlob.url}`, error);
        }
      }

      return result;
    } catch (error) {
      console.error("Error in save:", error);
      throw error;
    }
  }

  async find() {
    try {
      const { blobs } = await list({ prefix: this.prefix });
      const values = [];
      for (const blob of blobs) {
        try {
          const response = await fetch(blob.url);
          if (response.ok) {
            const text = await response.text();
            try {
              const parsed = JSON.parse(text);
              values.push(parsed);
            } catch (parseError) {
              console.error(
                `Fel vid parsning av JSON från ${blob.url}: ${parseError.message}`
              );
            }
          } else {
            console.error(
              `Kunde inte hämta blob-innehåll från ${blob.url}: ${response.status} ${response.statusText}`
            );
          }
        } catch (error) {
          console.error(
            `Fel vid hämtning av blob ${blob.url}: ${error.message}`
          );
        }
      }
      return values;
    } catch (error) {
      console.error(`Fel vid hämtning av alla data: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      return [];
    }
  }
}

const ICalUrl = new ICalUrlModel();

export default ICalUrl;
