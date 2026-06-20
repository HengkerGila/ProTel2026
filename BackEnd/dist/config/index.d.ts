export declare const config: {
    LOG_LEVEL: "info" | "fatal" | "error" | "warn" | "debug" | "trace";
    NODE_ENV: "production" | "development" | "test";
    PORT: number;
    CORS_ORIGIN: string;
    DATABASE_URL: string;
    DB_POOL_MIN: number;
    DB_POOL_MAX: number;
    JWT_SECRET: string;
    JWT_ACCESS_EXPIRES_IN: string;
    JWT_REFRESH_EXPIRES_IN: string;
    DECISION_ENGINE_URL: string;
    DECISION_ENGINE_TIMEOUT_MS: number;
    R2_BUCKET_NAME: string;
    GISPROC_API_BASE_URI: string;
    MQTT_URL: string;
    BMKG_BASE_URL: string;
    R2_ENDPOINT?: string | undefined;
    R2_ACCESS_KEY_ID?: string | undefined;
    R2_SECRET_ACCESS_KEY?: string | undefined;
    R2_PUBLIC_URL?: string | undefined;
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map