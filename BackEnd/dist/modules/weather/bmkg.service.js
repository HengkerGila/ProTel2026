"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFieldForecast = syncFieldForecast;
exports.syncAllForecasts = syncAllForecasts;
exports.getLatestForecast = getLatestForecast;
exports.getActiveWarnings = getActiveWarnings;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../db/client");
const mst_1 = require("../../db/schema/mst");
const schema_1 = require("../../db/schema");
const config_1 = require("../../config");
const logger_util_1 = require("../../shared/utils/logger.util");
const bmkg_types_1 = require("./bmkg.types");
// ---------------------------------------------------------------------------
// BMKG API constants
// ---------------------------------------------------------------------------
// URL base dibaca dari env BMKG_BASE_URL (default: https://api.bmkg.go.id/publik/prakiraan-cuaca)
// adm4_code per-field diambil dari DB: mst.fields.adm4_code (kode kelurahan Kepmendagri 2022)
const BMKG_FORECAST_URL = config_1.config.BMKG_BASE_URL;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'SmartAWD-Backend/1.0 (research/precision-agriculture)';
// ---------------------------------------------------------------------------
// Fetch & store forecast for one field
// ---------------------------------------------------------------------------
async function syncFieldForecast(field) {
    const startedAt = Date.now();
    let responseStatus;
    try {
        const url = `${BMKG_FORECAST_URL}?adm4=${encodeURIComponent(field.adm4Code)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        responseStatus = res.status;
        if (!res.ok) {
            throw new Error(`BMKG returned HTTP ${res.status} for adm4=${field.adm4Code}`);
        }
        const json = await res.json();
        // Parse semua slot dari BMKG (flatten semua hari)
        const dataEntry = json.data?.[0];
        if (!dataEntry) {
            logger_util_1.logger.warn({ adm4Code: field.adm4Code }, 'BMKG: empty data array');
            return;
        }
        const allSlots = dataEntry.cuaca.flat();
        const parsed = allSlots.map(bmkg_types_1.parseTimeSlot).filter(Boolean);
        if (parsed.length === 0) {
            logger_util_1.logger.warn({ adm4Code: field.adm4Code }, 'BMKG: no parseable time slots');
            return;
        }
        // ── Filter hanya 12 jam ke depan (= max 4 slot × 3 jam) ────────────────
        const now = new Date();
        const horizon = new Date(now.getTime() + 12 * 3_600_000);
        const slots12h = parsed.filter((s) => !!s && s.forecastValidFrom >= now && s.forecastValidFrom < horizon);
        // ── Bangun WeatherSlot[] untuk 12 jam ke depan ──────────────────────────
        const RAIN_THRESHOLD_MM = 2.0;
        const weatherSlots = slots12h.map(s => ({
            valid_from: s.forecastValidFrom.toISOString(),
            valid_until: s.forecastValidUntil.toISOString(),
            tp_mm: s.precipitationMm ?? 0,
            weather_desc: s.weatherDesc ?? '',
            weather_code: s.weatherCode,
            is_wet: (s.precipitationMm ?? 0) >= RAIN_THRESHOLD_MM,
        }));
        // ── Deteksi Rain Events dari slot berurutan yang wet ────────────────────
        const rainEvents = detectRainEvents(weatherSlots, now);
        // ── Cari slot kering terdekat setelah kondisi hujan ─────────────────────
        const firstWetIdx = weatherSlots.findIndex(s => s.is_wet);
        const nextClearAt = firstWetIdx >= 0
            ? (weatherSlots.find((s, i) => i > firstWetIdx && !s.is_wet)?.valid_from ?? null)
            : null;
        // ── Slot terdekat untuk metadata suhu/kelembaban ─────────────────────────
        const nearest = (parsed.find(s => !!s && s.forecastValidFrom >= now) ?? parsed[0]);
        // ── Hitung peak intensity sebagai pengganti precipitation_mm (backward compat) ──
        const peakIntensityMm = weatherSlots.length > 0
            ? Math.max(...weatherSlots.map(s => s.tp_mm))
            : 0;
        // ── Bangun WeatherAnalysis utuh untuk disimpan ke full_response_json ─────
        const weatherAnalysis = {
            fetched_at: now.toISOString(),
            adm4_code: field.adm4Code,
            window_hours: 12,
            slots: weatherSlots,
            rain_events: rainEvents,
            next_clear_window_at: nextClearAt,
        };
        // ── Tandai snapshot sebelumnya sebagai bukan latest ─────────────────────
        await client_1.db.update(schema_1.weatherForecastSnapshots)
            .set({ isLatest: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weatherForecastSnapshots.fieldId, field.id), (0, drizzle_orm_1.eq)(schema_1.weatherForecastSnapshots.isLatest, true)));
        // ── Insert snapshot baru ──────────────────────────────────────────────────
        const validFrom = parsed[0].forecastValidFrom;
        const validUntil = parsed[parsed.length - 1].forecastValidUntil;
        await client_1.db.insert(schema_1.weatherForecastSnapshots).values({
            fieldId: field.id,
            adm4Code: field.adm4Code,
            forecastValidFrom: validFrom,
            forecastValidUntil: validUntil,
            // peak intensity per 3-jam (bukan sum), untuk backward compat
            precipitationMm: peakIntensityMm > 0 ? peakIntensityMm.toFixed(2) : '0',
            temperatureC: nearest.temperatureC?.toFixed(2) ?? null,
            humidityPct: nearest.humidityPct?.toFixed(2) ?? null,
            weatherCode: nearest.weatherCode ? Number(nearest.weatherCode) : null,
            weatherDesc: nearest.weatherDesc ?? null,
            bmkgCategory: nearest.bmkgCategory ?? null,
            fullResponseJson: weatherAnalysis,
            isLatest: true,
            fetchedAt: now,
        });
        logger_util_1.logger.info({ fieldName: field.name, adm4Code: field.adm4Code, slots: parsed.length, peakIntensityMm }, 'BMKG forecast synced');
        await logIntegration({ action: 'forecast_sync', status: 'success', url: BMKG_FORECAST_URL,
            responseStatus, responseTimeMs: Date.now() - startedAt });
    }
    catch (err) {
        logger_util_1.logger.error({ err, adm4Code: field.adm4Code }, 'BMKG forecast sync failed');
        await logIntegration({ action: 'forecast_sync', status: 'failed', url: BMKG_FORECAST_URL,
            responseStatus, responseTimeMs: Date.now() - startedAt, error: String(err) });
    }
}
// ---------------------------------------------------------------------------
// Sync all active fields
// ---------------------------------------------------------------------------
async function syncAllForecasts() {
    const activeFields = await client_1.db
        .select({ id: mst_1.fields.id, adm4Code: mst_1.fields.adm4Code, name: mst_1.fields.name })
        .from(mst_1.fields)
        .where((0, drizzle_orm_1.eq)(mst_1.fields.isActive, true));
    logger_util_1.logger.info({ count: activeFields.length }, 'Starting BMKG forecast sync');
    for (const field of activeFields) {
        if (!field.adm4Code)
            continue;
        await syncFieldForecast(field);
        // Rate limit: BMKG allows 60 req/min → 1 req/sec is safe
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
}
// ---------------------------------------------------------------------------
// Get latest forecast for DSS (used by engine-client)
// ---------------------------------------------------------------------------
async function getLatestForecast(fieldId) {
    const [latest] = await client_1.db
        .select()
        .from(schema_1.weatherForecastSnapshots)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weatherForecastSnapshots.fieldId, fieldId), (0, drizzle_orm_1.eq)(schema_1.weatherForecastSnapshots.isLatest, true)))
        .limit(1);
    return latest ?? null;
}
// ---------------------------------------------------------------------------
// Get active warnings for DSS (placeholder — BMKG warning API varies)
// ---------------------------------------------------------------------------
async function getActiveWarnings(fieldId) {
    const now = new Date();
    return client_1.db
        .select()
        .from(schema_1.weatherWarningSnapshots)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weatherWarningSnapshots.fieldId, fieldId), (0, drizzle_orm_1.eq)(schema_1.weatherWarningSnapshots.isActive, true), (0, drizzle_orm_1.sql) `(${schema_1.weatherWarningSnapshots.warningExpiresAt} IS NULL OR ${schema_1.weatherWarningSnapshots.warningExpiresAt} > ${now})`));
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function logIntegration(params) {
    try {
        await client_1.db.insert(schema_1.integrationLogs).values({
            integrationName: 'bmkg',
            action: params.action,
            status: params.status,
            requestUrl: params.url,
            responseStatus: params.responseStatus,
            responseTimeMs: params.responseTimeMs,
            errorMessage: params.error,
        });
    }
    catch { /* non-critical */ }
}
// ---------------------------------------------------------------------------
// Rain Event Detection helpers
// ---------------------------------------------------------------------------
/**
 * Deteksi semua "kejadian hujan" dari array slot.
 * Slot wet yang berurutan digabung menjadi satu RainEvent.
 */
function detectRainEvents(slots, now) {
    const HEAVY_THRESHOLD_MM = 8.0;
    const events = [];
    let i = 0;
    while (i < slots.length) {
        if (!slots[i].is_wet) {
            i++;
            continue;
        }
        // Kumpulkan semua slot wet berurutan sebagai satu event
        const eventSlots = [slots[i]];
        while (i + 1 < slots.length && slots[i + 1].is_wet) {
            i++;
            eventSlots.push(slots[i]);
        }
        const totalMm = eventSlots.reduce((sum, s) => sum + s.tp_mm, 0);
        const peakMm = Math.max(...eventSlots.map(s => s.tp_mm));
        const startsAt = new Date(eventSlots[0].valid_from);
        const endsAt = new Date(eventSlots[eventSlots.length - 1].valid_until);
        const hoursUntil = Math.max(0, (startsAt.getTime() - now.getTime()) / 3_600_000);
        events.push({
            starts_at: eventSlots[0].valid_from,
            ends_at: eventSlots[eventSlots.length - 1].valid_until,
            hours_until_rain: Math.round(hoursUntil * 10) / 10,
            duration_hours: eventSlots.length * 3,
            total_mm: Math.round(totalMm * 10) / 10,
            peak_intensity_mm: Math.round(peakMm * 10) / 10,
            intensity_label: peakMm >= HEAVY_THRESHOLD_MM ? 'heavy' : 'moderate',
        });
        i++;
    }
    return events;
}
//# sourceMappingURL=bmkg.service.js.map