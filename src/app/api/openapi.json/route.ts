import { NextResponse } from "next/server";
import openapiDocument from "../../../../openapi/openapi.json";

// Serves the committed contract file. The app downloads this over HTTP
// (`pnpm api:sync`) to generate its typed client - see docs/ARCHITECTURE.md.
export function GET() {
  return NextResponse.json(openapiDocument);
}
