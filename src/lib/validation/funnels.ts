import { z } from "zod";

export const funnelConfigSchema = z.object({
  intro: z.object({
    kicker: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    startButton: z.string().min(1).default("Start"),
  }),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        kicker: z.string().min(1),
        title: z.string().min(1),
        subtitle: z.string().min(1),
        options: z
          .array(
            z.object({
              label: z.string().min(1),
              value: z.string().min(1),
              imageUrl: z.string().optional().nullable(),
              imageMediaId: z.string().optional().nullable(),
            })
          )
          .length(2),
      })
    )
    .min(1),
  result: z.object({
    type: z.literal("formula").default("formula"),
    formulaKey: z.literal("missed_call_loss_v1").default("missed_call_loss_v1"),
    currency: z.string().default("USD"),
    constants: z
      .object({
        missedCallsRegular: z.number().default(6),
        missedCallsFloor: z.number().default(1),
        highValuePerMissedCall: z.number().default(450),
        lowValuePerMissedCall: z.number().default(300),
        lossFactor: z.number().default(0.6),
        subscriptionComparisonMonthly: z.number().default(49),
      })
      .partial()
      .optional(),
  }),
  leadFields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(["email", "tel", "text"]),
        required: z.boolean().default(false),
      })
    )
    .default([{ name: "email", type: "email", required: true }]),
  submit: z.object({
    buttonLabel: z.string().min(1).default("Get my result"),
    successMode: z.enum(["message", "redirect"]).default("message"),
    redirectUrl: z.string().url().optional().nullable(),
  }),
});

export const funnelInputSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  configJson: funnelConfigSchema,
  styleJson: z.record(z.unknown()).optional().nullable(),
  trackingJson: z.record(z.unknown()).optional().nullable(),
});

export const placementRuleInputSchema = z.object({
  name: z.string().min(2),
  enabled: z.boolean().default(true),
  matchMode: z.enum(["ANY_TAG", "ALL_TAGS"]).default("ANY_TAG"),
  tagSlugs: z.array(z.string()).default([]),
  placement: z.enum(["AFTER_INTRO", "MIDDLE", "BEFORE_CONCLUSION", "END"]).default("END"),
  priority: z.number().int().default(100),
});

export type FunnelConfig = z.infer<typeof funnelConfigSchema>;
export type FunnelInput = z.infer<typeof funnelInputSchema>;
