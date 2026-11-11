# Mandatory security policy

These rules apply to this public GitHub Pages website and its Cloudflare helper,
`Aditya-Mehta1/ps-website-helper`. They apply to every change and release, including
changes made by agents. MUST is a release requirement, not a suggestion. Fix a
violation or explicitly obtain an owner-approved policy change before publishing.
Never describe a planned control as already enforced.

## Credentials and account authority

- MUST keep API keys, tokens, passwords and session credentials out of website
  files, URLs sent to the browser, logs, screenshots, commits and Git history.
  A private repository does not make committing a secret acceptable.
- MUST use Worker secrets in production. Local `.dev.vars`/`.env` files and their
  variants MUST be ignored by Git and readable only by their owner. Tracked
  examples MUST contain placeholders only. Do not use Wrangler `vars` for secrets.
- MUST use dedicated integration credentials with the smallest available
  permissions. Last.fm needs an application key only: no account password,
  authenticated user session, shared secret, scrobbling or write permissions.
- MUST keep the account and operation fixed on the server. The listening endpoint
  may read only `aditya-mehta` with `user.getRecentTracks`. No arbitrary user,
  upstream URL, API method, credential, result count or forwarded request headers.
- MUST treat everything returned by a public endpoint as publicly readable.
  Private data, writes, message sending and privileged actions require real
  server-side authentication and authorization before they can be added.

## Requests and origin checks

- MUST require the exact origin `https://aditya-mehta1.github.io` before cache or
  upstream work. Reject missing, `null`, lookalike and unapproved origins. Never
  use wildcard CORS, arbitrary origin reflection, or a production localhost bypass.
- MUST NOT treat Origin, Referer, CORS, an obscure URL or a token in public
  JavaScript as authentication. Scripts can spoof browser headers.
- MUST allow only explicit routes and methods. Listening is GET-only, with no
  body. Unknown paths/methods fail closed; no generic proxy or fallback forwarding.
- MUST accept only one optional `page` parameter with decoded values `1` through
  `10`. Reject duplicate/unknown parameters, zero, negative, fractional, padded,
  exponential and out-of-range page numbers before accessing caches or Last.fm.
- MUST make future features explicit routes with their own validation, secrets,
  safe response schema and upstream budget. A new feature must not inherit broader
  authority just because the Worker already holds another integration's key.

## Abuse controls and caching

- MUST apply the visitor throttle before cache reads. Use Cloudflare's trusted
  client-IP header, never `X-Forwarded-For` or a caller-selected limiter key.
  Missing IP, missing credentials or failing limiter bindings MUST fail closed.
- MUST consume an upstream allowance before every cache-miss fetch, including
  attempts that fail. All listening pages MUST share one upstream allowance;
  changing a page, account-like input, hostname or query MUST NOT create a new
  upstream budget. Do not raise limits without reviewing abuse and account usage.
- Current configured limits MUST remain approximately 45 visitor requests per
  minute per IP/location and three Last.fm attempts per minute per location unless
  the owner explicitly approves a change. Shared IPs share the visitor allowance.
- MUST serve all ten pages from one canonical, versioned snapshot cache key.
  Fetch up to 100 past plays plus the optional current track in one fixed Last.fm
  request; paginate the normalized snapshot locally. Caller page choices MUST NOT
  create extra upstream calls while that snapshot remains cached. Cache only
  successful normalized public data for 60 seconds.
  Never cache credentials, raw upstream failures or caller-specific authorization.
- MUST retain origin and visitor checks on cache hits. Browser-facing responses
  and errors MUST use `Cache-Control: no-store`; 429 MUST carry `Retry-After` and
  cross-origin permission for the approved website so it can respect the cooldown.
- MUST stop at page ten or the end of history. Ten past plays per page; an extra
  current track on page one MUST NOT cause a past play to be dropped.
- MUST keep browser paging sequential, prevent duplicate in-flight loads, respect
  `Retry-After`, and avoid automatic retry loops. Fetch older pages only while
  history is open. Background/hidden tabs MUST NOT poll listening status.
- MUST preserve already displayed history on failure, distinguish temporary
  throttling from other failures, and show the remaining retry delay accurately.
  Ending a cooldown MUST NOT promise fresh data or start an automatic retry loop.

## Upstream and browser data

- MUST fetch only the fixed HTTPS Last.fm endpoint with fresh headers. Disable
  redirects, make no automatic retries, keep a five-second deadline active through
  body reading, and enforce the actual streamed 128 KiB byte cap rather than
  trusting `Content-Length`.
- MUST validate HTTP status, Last.fm JSON errors, pagination, track counts and
  field types/lengths. Return only selected normalized fields. Errors MUST be
  generic and MUST NOT include upstream bodies, exceptions or credentialed URLs.
- MUST restrict returned track links to credential-free HTTPS on `www.last.fm`
  and artwork to `lastfm.freetls.fastly.net` or `lastfm-img.freetls.fastly.net`.
  Do not permit arbitrary ports or proxy arbitrary artwork through the Worker.
- MUST render API text with `textContent` or equivalent text APIs, never raw HTML,
  `document.write`, `eval` or `new Function`. Treat third-party responses as
  untrusted even when fetched with our own key. Preserve safe URL validation.
- MUST hide stale now-playing status after two minutes without fresh data.
  Failure may leave safe recent-history data visible, but MUST NOT imply it is live.
- MUST review new script sources, embeds, analytics, storage and network
  destinations before adding them. Do not introduce a third-party script CDN,
  browser credential storage, or an arbitrary HTML embed as a shortcut.

## Dependencies, release and incident response

- MUST keep dependency lockfiles tracked and use `npm ci` for reproducible setup.
  Add no runtime dependency without a concrete need and supply-chain review.
  Review installation scripts before enabling new ones; audit changed dependencies
  and investigate reported vulnerabilities rather than automatically ignoring them.
- MUST run website `npm run check` and Worker `npm run check` for changes touching
  their respective code. Security-sensitive branches require regression checks.
  Run `node scripts/listening-refresh.test.cjs` for listening-widget changes; CI
  also checks that a delayed refresh cannot strand an opened history panel.
  Rebuild and commit generated CSS with its source. Do not bypass failed checks.
- MUST check that the actual local key is absent from tracked files and Git history
  before a first push or credential-handling change, without printing that key.
  Git-ignored files MUST NOT be force-added, bundled or uploaded as site assets.
- MUST preserve account/remote identity, deployment secret bindings, disabled
  Worker preview URLs and current audiences. Do not upgrade billing plans,
  broaden permissions, force-push, or discard unrelated work without authorization.
- MUST smoke-test changed production API behavior with bounded requests: allowed
  origin, denied origin, invalid input, response schema, secret exclusion and cache
  reuse. Do not load-test the public endpoint. Record what was actually checked;
  local mocks do not prove distributed platform behavior.
- On suspected secret exposure, MUST revoke/rotate the credential first, update
  the Worker secret, identify affected logs/artifacts/history and remove exposure.
  Deleting a file or making a repository private does not revoke a leaked key.
- On abuse, MUST reduce exposure or disable the affected feature and inspect
  account usage. Do not log credentials or personal visitor data while diagnosing.
  Re-enable only after the specific failure is understood and bounded.

## Limits we must keep explicit

- A public, unauthenticated widget cannot guarantee website-only invocation.
- Native Cloudflare throttles are approximate per location and can overshoot;
  caches are local and concurrent misses can race. A strict global upstream
  budget requires one coordinating Durable Object per credential.
- All Worker invocations can consume the account's shared Free request allowance,
  including rejections and internal-cache hits. This endpoint can still exhaust
  that allowance. Free-tier usage monitoring and deployment checks are operational
  duties, not protections guaranteed by this code.
- A cached snapshot keeps page boundaries consistent for its 60-second lifetime.
  A later snapshot can shift while new plays arrive or old plays are removed.
  UI deduplication reduces overlap; exact archival continuity is not guaranteed.
- A written policy is not continuous enforcement. Existing checks cover syntax,
  generated CSS and tested application boundaries. No automated account-wide
  monitoring, global quota isolation or Content Security Policy is claimed here.

Update this policy and its regression checks whenever a trust boundary changes.
