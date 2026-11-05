import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  GUEST_APP_URL: z.string().url().default('http://localhost:5173'),
  DASHBOARD_APP_URL: z.string().url().default('http://localhost:5174'),
  // Missed-order alerts (SMS / WhatsApp via Termii). Without a key, alerts are written to the log instead.
  TERMII_API_KEY: z.string().optional(),
  TERMII_BASE_URL: z.string().url().default('https://v3.api.termii.com'),
  TERMII_SENDER_ID: z.string().min(3).max(11).default('ConciergeIQ'),
  TERMII_SMS_CHANNEL: z.enum(['dnd', 'generic']).default('dnd'),
  ESCALATION_SWEEP_SECONDS: z.coerce.number().int().min(5).max(300).default(15),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
