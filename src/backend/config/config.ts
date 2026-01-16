import type { LogLevel, ReceiverConfig, ServiceMode } from '@backend/types'
import { z } from 'zod'

const envSchema = z.object({
  // Service mode: 'full' (default), 'sdr-relay', or 'server'
  SERVICE_MODE: z.enum(['full', 'sdr-relay', 'server']).default('full'),

  // SDR Relay settings (when SERVICE_MODE='server')
  SDR_RELAY_URL: z.string().optional(),

  // SDR Relay server settings (when SERVICE_MODE='sdr-relay')
  SDR_RELAY_PORT: z.coerce.number().default(3001),
  SDR_RELAY_HOST: z.string().default('0.0.0.0'),

  STATION_LATITUDE: z.coerce.number().min(-90).max(90),
  STATION_LONGITUDE: z.coerce.number().min(-180).max(180),
  STATION_ALTITUDE: z.coerce.number().default(0),
  SDR_GAIN: z.coerce.number().min(0).max(50).default(45),
  SDR_SAMPLE_RATE: z.coerce.number().default(48000),
  SDR_PPM_CORRECTION: z.coerce.number().default(0),
  MIN_ELEVATION: z.coerce.number().min(0).max(90).default(20),
  MIN_SIGNAL_STRENGTH: z.coerce.number().default(-30),
  SKIP_SIGNAL_CHECK: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  RECORDINGS_DIR: z.string().default('./recordings'),
  IMAGES_DIR: z.string().default('./images'),
  TLE_UPDATE_INTERVAL_HOURS: z.coerce.number().default(24),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/captures.db'),
  ISS_SSTV_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
})

function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n')
    throw new Error(`Environment validation failed:\n${errors}`)
  }

  return result.data
}

export function loadConfig(): ReceiverConfig {
  const env = parseEnv()

  return {
    serviceMode: env.SERVICE_MODE as ServiceMode,
    sdrRelay: {
      url: env.SDR_RELAY_URL,
      port: env.SDR_RELAY_PORT,
      host: env.SDR_RELAY_HOST,
    },
    station: {
      latitude: env.STATION_LATITUDE,
      longitude: env.STATION_LONGITUDE,
      altitude: env.STATION_ALTITUDE,
    },
    sdr: {
      gain: env.SDR_GAIN,
      sampleRate: env.SDR_SAMPLE_RATE,
      ppmCorrection: env.SDR_PPM_CORRECTION,
    },
    recording: {
      minElevation: env.MIN_ELEVATION,
      minSignalStrength: env.MIN_SIGNAL_STRENGTH,
      skipSignalCheck: env.SKIP_SIGNAL_CHECK,
      recordingsDir: env.RECORDINGS_DIR,
      imagesDir: env.IMAGES_DIR,
    },
    tle: {
      updateIntervalHours: env.TLE_UPDATE_INTERVAL_HOURS,
    },
    web: {
      port: env.WEB_PORT,
      host: env.WEB_HOST,
    },
    database: {
      path: env.DATABASE_PATH,
    },
    logLevel: env.LOG_LEVEL as LogLevel,
    issSstvEnabled: env.ISS_SSTV_ENABLED,
  }
}
