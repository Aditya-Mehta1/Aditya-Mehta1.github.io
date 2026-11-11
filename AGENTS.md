# Required security rules

Read [SECURITY.md](SECURITY.md) before changing this website or its helper.
Its MUST rules are release requirements. If a change cannot satisfy one, stop
that part and explain the specific conflict; do not silently weaken the policy.

Do not add comments to HTML, CSS, or JavaScript: the repository's lint check rejects them.
Run `npm run check` before publishing. Rebuild `homepage.css` with `npm run build`
when changing its CSS sources. Keep security documentation aligned with actual
behavior and list any unverified deployment properties honestly.
Run `node scripts/listening-refresh.test.cjs` when changing the listening widget.
