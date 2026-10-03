import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "@/lib/bot-filter";

/**
 * The arrival gate cannot tell "nobody clicked" from "clicked and bounced"
 * if bots inflate it — so the highest-value bot shapes are pinned here.
 * The filter lives in bot-filter.ts (pure, no server-only import) precisely
 * so these cases run in CI; keep it that way.
 */
describe("isBotUserAgent", () => {
  it("excludes our own distribution surfaces (messenger previews)", () => {
    expect(isBotUserAgent("WhatsApp/2.24.10")).toBe(true);
    expect(isBotUserAgent("TelegramBot/1.0")).toBe(true);
    expect(
      isBotUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"),
    ).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
  });

  it("excludes crawlers and uptime monitors", () => {
    expect(
      isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"),
    ).toBe(true);
    expect(isBotUserAgent("curl/8.0.1")).toBe(true);
    expect(isBotUserAgent("UptimeRobot/2.0")).toBe(true);
  });

  it("counts real phone and desktop browsers", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(isBotUserAgent("")).toBe(false);
  });
});
