import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be 16+ chars'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:4000'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:');
  for (const i of parsed.error.issues) {
    console.error(`  ${i.path.join('.')}: ${i.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

/** True when either Brevo or SMTP is set up. */
export const smtpConfigured = Boolean(
  env.BREVO_API_KEY || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
);