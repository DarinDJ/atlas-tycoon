# Security review (self-audit, pre-launch)

Scope: `packages/server` (socket + HTTP), trust boundaries with the web client, and the engine's role as the authority.

## Threat model
Guests with a self-generated `clientId`; no passwords, no PII beyond a display name. Assets at risk: game fairness (cheating), service availability (abuse), paid entitlements, chat safety.

## Controls in place
| Area | Control | Where |
| --- | --- | --- |
| Authority | All rules run server-side; the client only sends intents. Player id comes from the socket session, never the payload. | `rooms/room.ts#dispatch`, `sockets.ts` |
| Input validation | Every socket message and HTTP body parsed with zod; unknown fields dropped; numeric bounds on bids/tiles/cash. | `protocol.ts`, `http.ts` |
| Rate limiting | Token buckets per socket (actions 10/s burst 20, chat 1/s burst 4, general 20/s), per IP for new connections (2/s) and HTTP (40/s burst 120), editor simulate 0.2/s. | `security/rateLimit.ts` |
| Room abuse | Max rooms per server (`MAX_ROOMS`), one empty lobby per host, idle/ended room sweeper, name uniqueness + length limits. | `rooms/manager.ts` |
| Chat safety | Profanity filter (EN + Hindi transliterations, leet-speak normalised), per-player mute, report hook, 200-char limit, system messages distinguished. | `security/profanity.ts`, `sockets.ts` |
| Reconnection | Seat reclaim requires the same `clientId` (random 24 chars, 140+ bits). Kicked seats clear `clientId` so they cannot be reclaimed. | `rooms/room.ts#attach` |
| Payments | Webhook signatures verified with HMAC + constant-time compare; purchases idempotent; test mode gated by `STORE_DEV_MODE`. | `payments/index.ts` |
| HTTP hardening | `x-powered-by` off, `nosniff`, referrer policy, explicit CORS allow-list, JSON body limit 512 KB, socket.io `maxHttpBufferSize` 64 KB. | `http.ts`, `index.ts` |
| Secrets | All via env; `.env.example` documents them; nothing committed. | `config.ts` |
| Client | Only the engine's `legalActions` output enables buttons; the server still re-validates. No `dangerouslySetInnerHTML`; chat rendered as text. | `web/src` |

## Known gaps / recommendations before scale
1. **`clientId` is a bearer token.** Anyone who copies it from localStorage can act as that guest. Acceptable for a no-login game; add optional Google login (session cookie, HttpOnly) before storing anything valuable, and never log client ids.
2. **IP-based limits behind proxies** need `TRUST_PROXY=true` (set in deploy configs) or every user shares one bucket.
3. **Spectators** receive full game state (including other players' pending trades). Fine for a board game; strip `trades` for spectators if private negotiations matter.
4. **Reports** are only logged to stdout; persist them (table + admin endpoint) when moderation is needed.
5. **Denial of service**: a flood of `room:create` from many IPs still costs ~50 KB each. Put the server behind Cloudflare and lower `MAX_ROOMS` per instance accordingly.
6. **Dependency hygiene**: run `npm audit` in CI (add a job) and pin Node 22 LTS.
7. **Content Security Policy**: add a CSP header at the CDN/nginx layer once ad/analytics domains are known (the app itself needs only `self`, Google Fonts, and the API origin).
