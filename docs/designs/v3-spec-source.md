# Ride4Ride — Design Doc

## 1. Concept
A ride-matching website, inspired by how university WhatsApp groups already work: someone posts that they need a ride, someone else offers one (or vice versa), and they coordinate directly. Ride4Ride recreates that pattern as a proper product — open to anyone, anywhere, not tied to any single university or group.

Ride4Ride is a **matching and communication platform**, not a dispatch, payment, or transportation service. It connects people; what happens after that (the actual ride, any cost-sharing) is arranged directly between the users involved.

## 2. Roles
- **Rider**: a user posting a ride request (needs a ride).
- **Captain**: a user posting a ride offer (is driving, has room).
- These are not separate account types. Every user can act as a rider or a captain depending on the specific post — the same person might be a captain on the way in and a rider on the way home.

## 3. Feed & Scoping
- The feed is scoped by **city** and, separately, by **airport** (airport runs are a distinct, common use case — e.g., "need a ride to O'Hare at 5am").
- No university/organization/community-membership scoping. Anyone can select a city or airport and see the relevant feed.

## 4. Accounts & Authentication
- **Phone number + OTP only.** No email, ever — not for signup, login, verification, or as a fallback.
- **Signup collects**: full name, date of birth, and a unique username (Instagram-style handle, separate from real name).
- **Minimum age requirement: 18+.**
- **Sessions**: each login creates a session; a session auto-logs-out after **24 hours of inactivity**.
- **OTP rate limit**: max **10 OTPs per user in a rolling 24-hour window**, to control SMS cost and abuse.
- **Development note**: use phone number + password for local development/testing (no OTP in dev). Production auth remains phone + OTP.

## 5. Posts
- A user posts a **ride request** (as rider) or a **ride offer** (as captain): origin, destination, date/time, seats/capacity, optional notes.
- **Auto-expiration: hard 7 days.** Every post expires exactly 7 days after posting — hardcoded, not flexible or caller-supplied.

## 6. Messaging (In-App Only)
- All communication happens via in-app/in-website chat. No redirects to WhatsApp, SMS, or other external messengers.
- **Contact info (phone number) is private by default.** It's only revealed to the other party after **both sides explicitly agree** within the chat (mutual-consent reveal).

### Conversation States
- A conversation is **"ongoing"** while active — either party can leave and return to it any number of times without it closing.
- **Cap: 5 ongoing conversations per user.** To start a 6th, the user must first end/exit an existing one.
- **Ongoing conversations do not expire** — they persist indefinitely until a user actively closes them.
- **Non-ongoing (closed) conversations expire on a hard 7 days**, same rule as posts.

### Ending a Conversation
Either party can end/exit a conversation. Doing so prompts a choice of exactly three outcomes:
1. **Dismiss — "didn't work out"**: closes the chat; the ride is not counted.
2. **"Changed mind, go back"**: cancels the exit, returns to the chat.
3. **"Ride completed"**: closes the chat and counts the ride — increments the user's public stats, adds it to their private ride history, and immediately triggers the rating prompt (see §8).

This is the platform's sole mechanism for marking a ride "finished" — no separate completion button, no auto-timeout.

**Known trade-off (accepted):** completion is **single-sided** — either party alone can mark "ride completed," with no mutual confirmation required. This means a ride could theoretically be marked complete by one party even if the other disputes it happened. This risk is accepted for v1; abuse is handled through the reporting/blocking system rather than added confirmation logic, to keep the exit flow simple.

## 7. Ride History & Public Stats
- **Public**: a user's profile shows completed ride counts, split by role (e.g., "42 rides as captain, 15 rides as rider").
- **Private**: the detailed ride history (dates, routes, who they rode with) is visible only to that user — never shown publicly.
- **Current status**: ride-count incrementing is **paused during development**, tied to the $ offers decision below — will resume once that's revisited.

## 8. Ratings & Reputation
- **Two separate rating tracks**: a rider rating and a captain rating for each user, since behavior/expectations differ by role.
- **No star ratings.** Simple thumbs up / thumbs down after each completed ride, fired by the "ride completed" action.
- **Select-all tags accompany the thumbs**, giving context without a written review:
  - **Thumbs up (select all that apply)**: polite, punctual, good communication, fast response, cleanliness, hygiene, smooth driving.
  - **Thumbs down (select all that apply)**: rude, loud on phone, wasted time, behaviour issue, driving intoxicated, rash driving.
- Kept intentionally lightweight — quick tap-based feedback, not a review form.

## 9. Dollar Offers — Shelved
A feature allowing $ offers on posts (unlimited private bids from would-be captains/riders, editable not stackable, tied 1:1 to a single conversation, with in-chat highlighting when a number is attached) was designed but is **shelved indefinitely**, not part of the active build. Reasoning: a structured, numbered bidding field risks reading as a ride marketplace/dispatch service rather than a matching board, which complicates the platform's legal positioning (§10). This will be reconsidered later with a better approach — the original design notes are preserved separately for reference, not as active spec.

## 10. Legal & Trust Positioning
- Ride4Ride is a matching/classifieds platform, not a licensed rideshare, taxi, or dispatch service.
- The platform does not vet, background-check, or verify the driving ability, licensing, or insurance of any user.
- No payments are processed by the platform. Any cost-sharing is a private, off-platform arrangement between users.
- Full disclaimer language: see companion document, `legal-disclaimer-draft.md`.

## 11. Design Philosophy
- **Clean, minimal, modern — utility over polish.** This is a tool to get a job done, not a product meant to impress.
- **No graphics-heavy UI.** Avoid large animations, heavy illustrations, video backgrounds, parallax — anything that risks lag, especially on mobile data or lower-end devices.
- **Simplicity over decoration.** Fast load times, plain typography, generous whitespace, obvious navigation.
- **Function-first**: every screen should make the next action obvious without onboarding tours.

## 12. Safety & Abuse Prevention
- Reporting and blocking tools are available to all users.
- Rate limiting applies to both post creation and OTP requests (see §4) to reduce spam/abuse.
- Clear in-app disclaimers reinforce that the platform doesn't vet users and that safety precautions are the users' responsibility.
