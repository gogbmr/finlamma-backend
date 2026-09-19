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
