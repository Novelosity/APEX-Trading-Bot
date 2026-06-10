import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z.string().min(1, 'Password required').max(128),
})

export const SettingsPatchSchema = z.object({
  execMode: z.enum(['manual', 'auto', 'approval']).optional(),
  tradingMode: z.enum(['spot', 'futures']).optional(),
  paperMode: z.boolean().optional(),
  leverage: z.number().int().min(1).max(3).optional(), // Hard cap 3x for safety
  balancePct: z.number().min(1).max(100).optional(),
  riskPct: z.number().min(0.1).max(1).optional(), // Hard cap 1% risk per trade
  maxPositions: z.number().int().min(1).max(3).optional(), // Hard cap 3 concurrent
}).strict()

export const TradeSchema = z.object({
  action: z.enum(['open', 'close', 'close_all']),
  pair: z.string().regex(/^[A-Z0-9]+\/[A-Z0-9]+$/, 'Invalid pair format').optional(),
  direction: z.enum(['long', 'short']).optional(),
  tradeId: z.string().uuid('Invalid trade ID').optional(),
})

export const KillSwitchSchema = z.object({
  action: z.enum(['halt', 'resume']),
  reason: z.string().max(200).optional(),
})

/** Safely parse and return first error message */
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) return { ok: true, data: result.data }
  const first = result.error.issues[0]
  return { ok: false, error: first ? `${first.path.join('.')}: ${first.message}` : 'Validation failed' }
}
