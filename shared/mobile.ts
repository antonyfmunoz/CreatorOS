import { z } from "zod";

export const mobilePlatformSchema = z.enum(["ios", "android"]);
export const mobilePushProviderSchema = z.enum(["apns", "fcm"]);
export const mobileInstallationIdSchema = z.string().uuid();

export const registerMobileDeviceSchema = z
  .object({
    installationId: mobileInstallationIdSchema,
    platform: mobilePlatformSchema,
    provider: mobilePushProviderSchema,
    pushToken: z.string().trim().min(16).max(4096),
    appVersion: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const expected = value.platform === "ios" ? "apns" : "fcm";
    if (value.provider !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: `${value.platform} registrations must use ${expected}`,
      });
    }
  });

export type RegisterMobileDevice = z.infer<typeof registerMobileDeviceSchema>;
