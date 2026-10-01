import exifr from "exifr";

export type PhotoExifLocation = {
  latitude: number;
  longitude: number;
  capturedAt: string | null;
};

const EXIF_DATE_KEYS = ["DateTimeOriginal", "CreateDate", "ModifyDate"];

export async function readPhotoExifLocation(file: File): Promise<PhotoExifLocation | null> {
  try {
    const [gps, dates] = await Promise.all([
      exifr.gps(file),
      exifr.parse(file, EXIF_DATE_KEYS),
    ]);

    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
      return null;
    }

    let capturedAt: string | null = null;
    if (dates && typeof dates === "object") {
      for (const key of EXIF_DATE_KEYS) {
        const value = dates[key];
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          capturedAt = value.toISOString();
          break;
        }
      }
    }

    if (!capturedAt && file.lastModified > 0) {
      capturedAt = new Date(file.lastModified).toISOString();
    }

    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
      capturedAt,
    };
  } catch {
    return null;
  }
}

/** Typical phone camera GPS tag; EXIF does not include accuracy metadata. */
export const PHOTO_EXIF_ASSUMED_ACCURACY_METERS = 30;
