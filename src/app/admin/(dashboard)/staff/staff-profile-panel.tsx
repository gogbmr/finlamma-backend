"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateStaffProfileAction, uploadStaffPhotoAction } from "./actions";
import type { StaffRow } from "./staff-table";

const GENDER_OPTIONS: { value: StaffRow["gender"] & string; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// HR-record fields only (gender/phone/address/photo) - email and role live
// elsewhere (invite-time, the role Select in the table). Self-service and
// staff.edit admin editing share this exact panel; the server decides
// which path applies (src/server/staff/service.ts's updateStaffProfile/
// uploadStaffPhoto), this UI never needs to know which case it is.
export function StaffProfilePanel({
  staff,
  onClose,
}: {
  staff: StaffRow;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [gender, setGender] = useState<string>(staff.gender ?? "");
  const [phone, setPhone] = useState(staff.phone ?? "");
  const [address, setAddress] = useState(staff.address ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateStaffProfileAction({
        staffId: staff.id,
        gender: gender === "" ? null : gender,
        phone: phone.trim() === "" ? null : phone.trim(),
        address: address.trim() === "" ? null : address.trim(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
    });
  }

  function uploadPhoto(file: File) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("staffId", staff.id);
      formData.set("file", file);
      const result = await uploadStaffPhotoAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Photo updated");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Profile - {staff.email ?? staff.clerkUserId}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="flex items-center gap-4">
        {staff.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
          <img
            src={staff.photoUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-border object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
            No photo
          </div>
        )}
        <div className="space-y-1">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2MB.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Gender</Label>
          <Select value={gender} onValueChange={setGender} disabled={isPending}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={phone} disabled={isPending} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Address</Label>
        <Textarea value={address} disabled={isPending} onChange={(e) => setAddress(e.target.value)} />
      </div>

      <Button type="button" onClick={save} disabled={isPending}>
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
