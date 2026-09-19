"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InviteStaffMemberSchema, type InviteStaffMemberInput } from "@/server/staff/schemas";
import { inviteStaffMemberAction } from "./actions";

export function AddStaffForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InviteStaffMemberInput>({ resolver: zodResolver(InviteStaffMemberSchema) });

  const roleId = watch("roleId");

  function onSubmit(values: InviteStaffMemberInput) {
    startTransition(async () => {
      const result = await inviteStaffMemberAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invitation sent to ${values.email}`);
      reset();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="newstaff@finlamma.com"
          {...register("email")}
          className="w-64"
        />
        {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Role</Label>
        <Select value={roleId} onValueChange={(v) => setValue("roleId", v, { shouldValidate: true })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.roleId && <p className="text-xs text-red-600">{errors.roleId.message}</p>}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
