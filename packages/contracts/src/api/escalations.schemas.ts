import { z } from 'zod';

export const EscalationChannel = {
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;
export type EscalationChannel = (typeof EscalationChannel)[keyof typeof EscalationChannel];

/** Who is texted, and when, if an order is still waiting. Level 1 is the manager, level 2 the admin. */
export const EscalationLevel = { MANAGER: 1, ADMIN: 2 } as const;
export type EscalationLevel = (typeof EscalationLevel)[keyof typeof EscalationLevel];

export const EscalationStepSchema = z.object({
  enabled: z.boolean(),
  afterSeconds: z.number().int().min(30).max(3600),
  channel: z.nativeEnum(EscalationChannel),
  recipientName: z.string().trim().max(120),
  /** International (+2348031234412) or Nigerian local (08031234412) format. */
  phone: z.string().trim().max(20),
});
export type EscalationStep = z.infer<typeof EscalationStepSchema>;

export const UpdateEscalationRulesSchema = z
  .object({ manager: EscalationStepSchema, admin: EscalationStepSchema })
  .refine((rules) => !rules.admin.enabled || !rules.manager.enabled || rules.admin.afterSeconds > rules.manager.afterSeconds, {
    message: 'The admin alert must come after the manager alert',
    path: ['admin', 'afterSeconds'],
  });
export type UpdateEscalationRulesInput = z.infer<typeof UpdateEscalationRulesSchema>;

export interface EscalationRules {
  manager: EscalationStep;
  admin: EscalationStep;
  /** Null until an admin saves the rules for the first time. */
  updatedAt: string | null;
}

export const SendTestAlertSchema = z.object({ level: z.enum(['manager', 'admin']) });
export type SendTestAlertInput = z.infer<typeof SendTestAlertSchema>;

export const EscalationAlertStatus = { SENDING: 'SENDING', SENT: 'SENT', FAILED: 'FAILED' } as const;
export type EscalationAlertStatus = (typeof EscalationAlertStatus)[keyof typeof EscalationAlertStatus];

export interface EscalationAlert {
  id: string;
  orderId: string;
  orderNumber: number;
  roomNumber: string;
  level: EscalationLevel;
  channel: EscalationChannel;
  recipientName: string;
  status: EscalationAlertStatus;
  /** Why sending failed, when it did. Safe to show to admins. */
  error: string | null;
  sentAt: string;
  /** How long the order waited before someone accepted it; null while it is still waiting or was cancelled. */
  acceptedAfterSeconds: number | null;
  orderStatus: string;
}

export interface TestAlertResult {
  status: EscalationAlertStatus;
  error: string | null;
  message: string;
}
