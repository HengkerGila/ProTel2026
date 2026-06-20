/** Satu slot waktu dalam forecast BMKG */
export interface BmkgTimeSlot {
    local_datetime: string;
    t?: number;
    hu?: number;
    tp?: number;
    ws?: number;
    wd_to?: string;
    wd_from?: string;
    weather?: number;
    weather_desc?: string;
    weather_desc_en?: string;
    image?: string;
}
/** Lokasi metadata dari BMKG */
export interface BmkgLokasi {
    adm4: string;
    desa: string;
    kecamatan: string;
    kotkab: string;
    provinsi: string;
    lon: number;
    lat: number;
    timezone: string;
}
/** Satu entri data forecast dari BMKG */
export interface BmkgDataEntry {
    lokasi: BmkgLokasi;
    cuaca: BmkgTimeSlot[][];
}
/** Full response pradikaan cuaca dari BMKG */
export interface BmkgForecastResponse {
    data: BmkgDataEntry[];
    lokasi: unknown;
}
/** Parsed/normalized slot yang akan disimpan ke DB */
export interface ParsedForecastSlot {
    forecastValidFrom: Date;
    forecastValidUntil: Date;
    temperatureC: number | null;
    humidityPct: number | null;
    precipitationMm: number | null;
    windSpeedKmh: number | null;
    windDirection: string | null;
    weatherCode: number | null;
    weatherDesc: string | null;
    bmkgCategory: string | null;
}
/** Satu slot waktu 3-jaman yang telah di-normalisasi dari raw BMKG (12 jam ke depan) */
export interface WeatherSlot {
    valid_from: string;
    valid_until: string;
    tp_mm: number;
    weather_desc: string;
    weather_code: number | null;
    is_wet: boolean;
}
/**
 * Satu "Kejadian Hujan" (Rain Event) — kumpulan slot berurutan yang semuanya wet.
 * Menjawab: kapan? seberapa lama? seberapa lebat?
 */
export interface RainEvent {
    starts_at: string;
    ends_at: string;
    hours_until_rain: number;
    duration_hours: number;
    total_mm: number;
    peak_intensity_mm: number;
    intensity_label: 'light' | 'moderate' | 'heavy';
}
/**
 * Hasil lengkap analisa cuaca untuk 12 jam ke depan.
 * Disimpan di kolom `full_response_json` di tabel weather_forecast_snapshots
 * dan dikirimkan ke DSS Python sebagai payload `weather`.
 */
export interface WeatherAnalysis {
    fetched_at: string;
    adm4_code: string;
    window_hours: number;
    slots: WeatherSlot[];
    rain_events: RainEvent[];
    next_clear_window_at: string | null;
}
export declare function getBmkgCategory(weatherCode: number | undefined): string | null;
/** Parse satu time slot dari BMKG ke format normalized */
export declare function parseTimeSlot(slot: BmkgTimeSlot): ParsedForecastSlot | null;
//# sourceMappingURL=bmkg.types.d.ts.map