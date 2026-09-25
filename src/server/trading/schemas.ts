import { z } from "zod";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// Plain Zod, not OpenAPI-registered - instrument-catalog CRUD is a Server
// Action (docs/ARCHITECTURE.md D16), same convention as
// src/server/mentors/schemas.ts. The public, app-facing instrument
// read schemas (registered in the OpenAPI registry) come in Checkpoint 2
// alongside the GET /trade/instruments endpoints they actually back.

export const InstrumentSymbolSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]*$/, "symbol must be uppercase letters/digits only, e.g. RELIANCE");

// A fat-finger guard, not a product limit - same reasoning as
// src/server/economy/schemas.ts's MAX_REWARD_AMOUNT. A real NSE large cap's
// market cap comfortably fits well under this.
export const MAX_INSTRUMENT_MCAP = 500_000_000_000_00; // ₹50 lakh crore, in whole rupees
export const MAX_INSTRUMENT_PE = 1000;
export const MAX_INSTRUMENT_LOT_SIZE = 10_000;

const InstrumentFieldsSchema = z.object({
  symbol: InstrumentSymbolSchema,
  exchange: z.string().min(1).default("NSE"),
  name: z.string().min(1),
  sector: z.string().min(1),
  about: LocalizedTextSchema,
  tip: LocalizedTextSchema,
  tags: z.array(z.string().min(1)).default([]),
  mcap: z.number().int().nonnegative().max(MAX_INSTRUMENT_MCAP).nullable(),
  pe: z.number().nonnegative().max(MAX_INSTRUMENT_PE).nullable(),
  lotSize: z.number().int().positive().max(MAX_INSTRUMENT_LOT_SIZE).default(1),
  active: z.boolean().default(true),
});

export const CreateInstrumentSchema = InstrumentFieldsSchema;
export type CreateInstrumentInput = z.infer<typeof CreateInstrumentSchema>;

export const UpdateInstrumentSchema = InstrumentFieldsSchema.extend({
  id: z.string().uuid(),
}).omit({ symbol: true });
export type UpdateInstrumentInput = z.infer<typeof UpdateInstrumentSchema>;

export const InstrumentIdSchema = z.object({ id: z.string().uuid() });
export type InstrumentIdInput = z.infer<typeof InstrumentIdSchema>;

// --- Market holidays ---

export const MarketHolidayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const CreateMarketHolidaySchema = z.object({
  date: MarketHolidayDateSchema,
  name: z.string().min(1),
});
export type CreateMarketHolidayInput = z.infer<typeof CreateMarketHolidaySchema>;

export const MarketHolidayIdSchema = z.object({ id: z.string().uuid() });
export type MarketHolidayIdInput = z.infer<typeof MarketHolidayIdSchema>;
