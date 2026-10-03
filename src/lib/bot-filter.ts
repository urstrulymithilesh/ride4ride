/**
 * Bot/user-agent filter for arrival tracking. Pure and free of
 * `server-only` (which vitest cannot resolve) so the day-21 gate's
 * honesty filter has unit coverage in bot-filter.test.ts.
 */
const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|embedly|quora|pinterest|vkshare|preview|scanner|monitor|uptime|curl|wget|headless|lighthouse|pagespeed|gtmetrix/i;

/**
 * Crawlers, preview fetchers and uptime checks are not arrivals. Matching
 * on the UA is imperfect, but the failure mode is mild (a bot counted as a
 * person) and this catches the high-volume ones — including the messenger
 * previews this product's own distribution generates, which would
 * otherwise inflate the number every time a link is pasted.
 */
export function isBotUserAgent(ua: string): boolean {
  return BOT_RE.test(ua);
}
