import { vi } from "vitest";

// next/font/google's real exports only work inside Next's own build
// pipeline (its SWC transform rewrites the call at compile time) - calling
// one directly under plain Vitest throws "X is not a function". Every font
// loader the app actually uses gets a trivial stand-in here (just the
// className/variable shape callers read) so any test that transitively
// imports a module calling next/font/google doesn't crash - first needed
// when src/components/admin/glass.tsx started loading Inter.
// Every export resolves to the same stand-in loader function, called the
// same way the real ones are (e.g. `Inter({ subsets: [...] })`), returning
// the shape callers actually read. Vitest's ESM mock validation needs each
// named export listed explicitly here (a Proxy's dynamic properties aren't
// visible to it) - add a new font's name below if a future font loader
// needs mocking too, same as Inter/Poppins.
const mockFontLoader = () => ({
  className: "mock-font",
  variable: "--font-mock",
  style: { fontFamily: "mock-font" },
});

vi.mock("next/font/google", () => ({
  Inter: mockFontLoader,
  Poppins: mockFontLoader,
}));
