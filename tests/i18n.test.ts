import { describe, expect, it } from "vitest";
import { bi, dayLabel, labels, langFromHeader, makeT, pickMsg } from "@/lib/i18n";

describe("i18n", () => {
  it("t() picks the reader's language", () => {
    expect(makeT("en")("Save", "Guardar")).toBe("Save");
    expect(makeT("es")("Save", "Guardar")).toBe("Guardar");
  });

  it("bilingual server messages split per reader; plain text passes through", () => {
    const m = bi("Wrong PIN", "PIN incorrecto");
    expect(pickMsg(m, "en")).toBe("Wrong PIN");
    expect(pickMsg(m, "es")).toBe("PIN incorrecto");
    expect(pickMsg("plain", "es")).toBe("plain");
  });

  it("defaults to the phone's language", () => {
    expect(langFromHeader("es-US,es;q=0.9,en;q=0.8")).toBe("es");
    expect(langFromHeader("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(langFromHeader(null)).toBe("en");
  });

  it("keeps store daypart names in both languages and translates units", () => {
    expect(labels("es").daypart.LUNCH).toBe("Lunch");
    expect(labels("es").unitShort.EACH).toBe("unid.");
    expect(labels("es").type.DONATION).toBe("Donación");
  });

  it("relative day labels", () => {
    expect(dayLabel("2026-10-05", "2026-10-05", "es")).toBe("Hoy");
    expect(dayLabel("2026-10-04", "2026-10-05", "es")).toBe("Ayer");
    expect(dayLabel("2026-10-01", "2026-10-05", "en")).toMatch(/Oct/);
  });
});
