"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMarketHolidayAction, deleteMarketHolidayAction } from "./actions";

type HolidayRow = { id: string; date: string; name: string };

export function HolidayEditor({ holidays, canManage }: { holidays: HolidayRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  function add() {
    startTransition(async () => {
      const result = await createMarketHolidayAction({ date, name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Holiday added");
      setDate("");
      setName("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMarketHolidayAction({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Holiday removed");
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holidays recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-mono text-foreground">{h.date}</span>{" "}
                <span className="text-muted-foreground">{h.name}</span>
              </span>
              {canManage && (
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => remove(h.id)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali - Laxmi Pujan" />
          </div>
          <Button type="button" onClick={add} disabled={isPending || !date || !name}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
