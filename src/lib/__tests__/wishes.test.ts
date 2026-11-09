import { describe, expect, it } from "vitest";
import { detectFromUrl, guessEmoji, parsePrice, priceInput } from "../wishes";
import { firstUrl } from "../share";
import { scrub } from "../errorlog";

describe("Preise", () => {
  it.each([
    ["12,99", 1299], ["12.99", 1299], ["1.299,00 €", 129900], ["15", 1500], [" 349 € ", 34900], ["", null], ["abc", null],
  ])("„%s“ → %s Cent", (input, cents) => expect(parsePrice(input)).toBe(cents));
  it("formatiert für das Eingabefeld", () => {
    expect(priceInput(1299)).toBe("12,99");
    expect(priceInput(null)).toBe("");
  });
});

describe("Link-Erkennung aus der Adresse", () => {
  it("erkennt Shop und Produktnamen", () => {
    expect(detectFromUrl("https://www.amazon.de/LEGO-Friends-Baumhaus-Spielzeug/dp/B0CFW1Z7J3")).toMatchObject({ shop: "Amazon", title: "LEGO Friends Baumhaus Spielzeug" });
    expect(detectFromUrl("https://www.thalia.de/suche?sq=hoerbuch+kinder")).toMatchObject({ shop: "Thalia", title: "Hoerbuch kinder" });
  });
  it("lehnt Unsinn ab", () => {
    expect(detectFromUrl("keinlink")).toBeNull();
    expect(detectFromUrl("javascript:alert(1)")).toBeNull();
  });
  it("wählt ein passendes Symbol", () => expect(guessEmoji("Kinderfahrrad 24 Zoll")).toBe("🚲"));
});

describe("Geteilte Links", () => {
  it("findet den Link in einem Text", () => {
    expect(firstUrl("Schau mal: https://www.lego.com/de-de/product/x-42652, toll!")).toBe("https://www.lego.com/de-de/product/x-42652");
    expect(firstUrl(null, "nur Text")).toBeNull();
  });
});

describe("Fehlerprotokoll schwärzt Geheimnisse", () => {
  it("entfernt Gast-Links, Einladungen, Codes und E-Mails", () => {
    const out = scrub("Fehler auf #/w/AbC123xyz und #/einladung/QwErTy, Code K7PM-Q3XA, von oma@beispiel.de");
    expect(out).not.toMatch(/AbC123xyz|QwErTy|K7PM-Q3XA|oma@beispiel\.de/);
  });
});
