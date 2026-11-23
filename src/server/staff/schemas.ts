import { z } from "zod";

// Plain Zod (no OpenAPI registration): these back admin-only Server Actions,
// not /api/v1 routes - docs/API_ENDPOINTS.md documents the mobile app's
// contract, which the admin dashboard isn't part of. Shared between the
// server action and the client form (react-hook-form's zodResolver), so
// validation messages match on both sides.
export const InviteStaffMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  roleId: z.uuid("Pick a role"),
});
export type InviteStaffMemberInput = z.infer<typeof InviteStaffMemberSchema>;

export const UpdateStaffRoleSchema = z.object({
  staffId: z.uuid(),
  roleId: z.uuid(),
});
export type UpdateStaffRoleInput = z.infer<typeof UpdateStaffRoleSchema>;

export const SetStaffActiveSchema = z.object({
  staffId: z.uuid(),
  active: z.boolean(),
});
export type SetStaffActiveInput = z.infer<typeof SetStaffActiveSchema>;

// HR-record fields only (never identity/auth - Clerk still owns that).
// Every field optional/nullable: a staff member filling in only some of
// these, or an admin clearing one back out, are both normal, not errors.
export const StaffGenderSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);

export const UpdateStaffProfileSchema = z.object({
  staffId: z.uuid(),
  gender: StaffGenderSchema.nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
});
export type UpdateStaffProfileInput = z.infer<typeof UpdateStaffProfileSchema>;

export const CreateRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers and underscores only, starting with a letter"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z.object({
  roleId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const DeleteRoleSchema = z.object({
  roleId: z.uuid(),
});
export type DeleteRoleInput = z.infer<typeof DeleteRoleSchema>;

// Full replace, not incremental grant/revoke - the Roles & Permissions UI
// shows every permission as a checkbox already checked/unchecked to its
// current state, so "save" always sends the complete intended set. Safer
// than N individual grant/revoke calls racing each other.
export const SetRolePermissionsSchema = z.object({
  roleId: z.uuid(),
  permissionIds: z.array(z.uuid()),
});
export type SetRolePermissionsInput = z.infer<typeof SetRolePermissionsSchema>;
