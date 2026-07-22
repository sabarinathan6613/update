// src/utils/timeService.js

// 1. Centralized Plant Local Timezone Configuration
export function getPlantTimeZone(plantId) {
  const cleanId = plantId ? String(plantId).trim() : 'Mettur';
  switch (cleanId) {
    case 'plant-1': return 'America/New_York';
    case 'plant-2': return 'Europe/Berlin';
    case 'plant-3': return 'Asia/Tokyo';
    case 'plant-4':
    case 'plant':
    case 'Mettur':
    case 'mettur':
      return 'Asia/Kolkata';
    default: 
      return 'Asia/Kolkata'; // Configured Plant Local Timezone default
  }
}

// 2. Centralized Date Formatter (safely returns strings, handles Date objects)
export function formatTimestampToPlantTime(timestampStr, plantId, options = {}) {
  if (!timestampStr) return '—';

  // If it's a string, try direct regex formatting first to preserve exact local database values
  if (typeof timestampStr === 'string') {
    const cleanStr = timestampStr.trim();
    
    // Match YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM:SS, potentially with decimal seconds/milliseconds
    // This represents a local database timestamp (without timezone offset/Z)
    const match = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (match) {
      const [_, year, month, day, hour, minute, second] = match;
      return `${month}/${day}/${year}, ${hour}:${minute}:${second}`;
    }

    // Match ISO format ending with Z: YYYY-MM-DDTHH:MM:SSZ
    // This represents a UTC database timestamp, so we shift it to the target plant timezone
    const matchZ = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/);
    if (matchZ) {
      const [_, year, month, day, hour, minute, second] = matchZ;
      const date = new Date(Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      ));
      const tz = getPlantTimeZone(plantId);
      return date.toLocaleString('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: options.hour12 !== undefined ? options.hour12 : false,
        ...options
      });
    }
  }

  const tz = getPlantTimeZone(plantId);
  try {
    let date;
    if (timestampStr instanceof Date) {
      date = timestampStr;
    } else {
      let cleanStr = String(timestampStr).trim();
      if (!cleanStr.endsWith('Z') && !cleanStr.includes('+') && !/-\d{2}:\d{2}$/.test(cleanStr)) {
        if (!cleanStr.includes('T')) {
          cleanStr = cleanStr.replace(' ', 'T');
        }
        cleanStr += 'Z';
      }
      date = new Date(cleanStr);
    }
    if (isNaN(date.getTime())) return String(timestampStr);
    return date.toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: options.hour12 !== undefined ? options.hour12 : false,
      ...options
    });
  } catch (e) {
    console.error("formatTimestampToPlantTime error:", e);
    return String(timestampStr);
  }
}

// 3. Centralized Time-only Formatter (safely returns strings, handles Date objects)
export function formatTimeToPlantTime(timestampStr, plantId) {
  if (!timestampStr) return '—';
  const tz = getPlantTimeZone(plantId);
  try {
    let date;
    if (timestampStr instanceof Date) {
      date = timestampStr;
    } else {
      let cleanStr = String(timestampStr).trim();
      if (!cleanStr.endsWith('Z') && !cleanStr.includes('+') && !/-\d{2}:\d{2}$/.test(cleanStr)) {
        if (!cleanStr.includes('T')) {
          cleanStr = cleanStr.replace(' ', 'T');
        }
        cleanStr += 'Z';
      }
      date = new Date(cleanStr);
    }
    if (isNaN(date.getTime())) return String(timestampStr);
    return date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (e) {
    console.error("formatTimeToPlantTime error:", e);
    return String(timestampStr);
  }
}

// 4. Centralized TimeZone Offset Ms
export function getTimeZoneOffsetMs(timeZone, date = new Date()) {
  try {
    const tzString = date.toLocaleString('en-US', { timeZone });
    const localDate = new Date(tzString);
    const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const utcDate = new Date(utcString);
    return localDate.getTime() - utcDate.getTime();
  } catch (e) {
    console.error("getTimeZoneOffsetMs error:", e);
    return 0;
  }
}

// 5. Centralized Local to UTC Time conversion
export function convertLocalToUtcTime(localTimeStr, plantId) {
  if (!localTimeStr) return '00:00';
  const [hour, min] = localTimeStr.split(':').map(Number);
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const tz = getPlantTimeZone(plantId);
  const offsetMs = getTimeZoneOffsetMs(tz, date);
  const targetLocalDate = new Date(date);
  targetLocalDate.setUTCHours(hour, min, 0, 0);
  const targetUtcDate = new Date(targetLocalDate.getTime() - offsetMs);
  const utcHourStr = String(targetUtcDate.getUTCHours()).padStart(2, '0');
  const utcMinStr = String(targetUtcDate.getUTCMinutes()).padStart(2, '0');
  return `${utcHourStr}:${utcMinStr}`;
}

// 6. Centralized UTC to Local Time conversion
export function convertUtcToLocalTime(utcTimeStr, plantId) {
  if (!utcTimeStr) return '00:00';
  const [hour, min] = utcTimeStr.split(':').map(Number);
  const date = new Date();
  date.setUTCHours(hour, min, 0, 0);
  const tz = getPlantTimeZone(plantId);
  const offsetMs = getTimeZoneOffsetMs(tz, date);
  const targetLocalDate = new Date(date.getTime() + offsetMs);
  const localHourStr = String(targetLocalDate.getUTCHours()).padStart(2, '0');
  const localMinStr = String(targetLocalDate.getUTCMinutes()).padStart(2, '0');
  return `${localHourStr}:${localMinStr}`;
}

// 7. Centralized Timezone Abbreviation
export function getTimeZoneAbbreviation(plantId) {
  const tz = getPlantTimeZone(plantId);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : tz;
  } catch {
    return tz;
  }
}

// 8. Centralized Telemetry Statistics Calculation Utility
export function calculateTelemetryStats(records, tagIndex) {
  // Normalize a TagIndex to a comparable integer: "T0" -> 0, "0" -> 0, 0 -> 0
  const normIdx = v => {
    const s = String(v).trim();
    if (/^[Tt](\d+)$/.test(s)) return parseInt(s.substring(1), 10);
    const n = parseInt(s, 10);
    return isNaN(n) ? s : n;
  };
  const normTarget = normIdx(tagIndex);
  const tagRecs = records.filter(r => normIdx(r.TagIndex) === normTarget);
  if (tagRecs.length === 0) {
    return { min: null, max: null, avg: null, current: null, count: 0, goodPct: 100, lastTimestamp: null, sparkPoints: [] };
  }
  
  // Sort descending to easily get the latest (most recent) record
  const sorted = [...tagRecs].sort((a, b) => new Date(b.DateAndTime) - new Date(a.DateAndTime));
  const latest = sorted[0];
  const previous = sorted[1];
  
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let goodCount = 0;
  
  for (const r of tagRecs) {
    const v = Number(r.Val);
    if (isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (r.Status === 192) {
      goodCount++;
    }
  }
  
  let trend = 'stable';
  if (previous) {
    if (latest.Val > previous.Val) trend = 'up';
    else if (latest.Val < previous.Val) trend = 'down';
  }
  
  const sparkPoints = sorted.slice(0, 12).map(r => r.Val).reverse();
  
  return {
    min: min === Infinity ? null : min,
    max: max === -Infinity ? null : max,
    avg: tagRecs.length > 0 ? (sum / tagRecs.length) : null,
    current: latest.Val,
    count: tagRecs.length,
    goodPct: tagRecs.length > 0 ? ((goodCount / tagRecs.length) * 100) : 100,
    lastTimestamp: latest.DateAndTime,
    trend,
    sparkPoints
  };
}

// 9. Format date for datetime-local input
export function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 10. Robust Centralized Timestamp parsing (always returns milliseconds)
export function parseTimestampToMs(timestampStr, timeZone = 'Asia/Kolkata') {
  if (!timestampStr) return NaN;
  try {
    if (timestampStr instanceof Date) return timestampStr.getTime();
    let cleanStr = String(timestampStr).trim();
    let isLocal = false;
    if (!cleanStr.endsWith('Z') && !cleanStr.includes('+') && !/-\d{2}:\d{2}$/.test(cleanStr)) {
      if (!cleanStr.includes('T')) {
        cleanStr = cleanStr.replace(' ', 'T');
      }
      cleanStr += 'Z';
      isLocal = true;
    }
    let t = Date.parse(cleanStr);
    if (isNaN(t)) {
      t = Date.parse(timestampStr);
    } else if (isLocal) {
      // Subtract timezone offset to get the actual UTC epoch
      const offsetMs = getTimeZoneOffsetMs(timeZone, new Date(t));
      t -= offsetMs;
    }
    return t;
  } catch (e) {
    return NaN;
  }
}
