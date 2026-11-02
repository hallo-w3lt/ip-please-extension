# IP Please

Extension for Brave / Chrome / Edge (Manifest V3) that checks your public IP at a set interval, detects its country and blocks the domains you choose whenever your IP isn't from an allowed country. It keeps you from opening sites that penalize VPNs, such as Facebook, while your VPN is on.

## Installation (developer mode)

Get the code with `git clone https://github.com/hallo-w3lt/ip-please-extension.git`, or download the ZIP from GitHub and unpack it. Then:

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this repository's folder (the one that contains `manifest.json`).
4. Pin the icon to the toolbar. The badge shows the current country code:
   green = nothing blocked, red = some sites are blocked, gray = unknown country.

## Usage

1. Click the icon, then **⚙ Rules**, or right-click the icon and choose *Options*.
2. In **+ Add rule…**, pick a preset (Facebook, Instagram, ChatGPT, Steam…) or a blank rule.
3. Enter the domains, one per line. `facebook.com` also covers `www.facebook.com`, `m.facebook.com`, and so on.
4. Choose the condition:
   - **Allow only if my IP is from…**: an allowlist of countries (the usual choice).
   - **Block if my IP is from…**: a blocklist of countries.
5. Add the countries. The **+ My current country** button adds the country detected at that moment.

Changes are saved automatically.

**Language**: English and Spanish. Under *General → Language* you can choose *Automatic* (the default: Spanish if the browser is in Spanish, English otherwise), *English* or *Español*. The UI strings live in `i18n.js`; `_locales/` only translates the manifest's name and description.

## How blocking works

- **IP and country**: queries `cloudflare.com/cdn-cgi/trace` and, if that fails, `api.country.is`, `ipinfo.io` and `ipwho.is`. No API keys needed.
- **Blocking**: uses `declarativeNetRequest`. The main page is redirected to a block page, and every other request (scripts, images, XHR, iframes) is blocked, even when another site makes it.
- **Open tabs**: if the country changes and a site becomes blocked, tabs that already have it open are sent to the block page.
- **Automatic unblock**: the block page waits and opens the site on its own as soon as your IP meets the rule again.
- **Check the IP on every visit** (on by default): when you open a protected site in a tab, it first goes through the check page, which verifies your IP at that moment. That way, a VPN you just turned on can't slip through between two periodic checks.
- **Block if the country can't be determined** (on by default): if there's no connection or the services fail, protected sites stay blocked.
- **On browser start**: the last known country is discarded and checked again.

## Limitations

- The country comes from geolocation databases. Sometimes it doesn't match what the site sees, especially with mobile IPs or "residential" VPN IPs.
- If your network has both IPv4 and IPv6, the site might see a different IP from the one that was checked.
- Mobile and desktop apps (for example, Messenger for desktop) don't go through the browser, so they aren't blocked.
- An already-authorized tab that stays open relies on the periodic check. At 30 s or 1 min, the window is small.

## Related

[my-country](https://github.com/hallo-w3lt/claude-plus-plus) is a Claude Code plugin that shows the country of your IP under the prompt, using the same lookup services.

## License

MIT. See [LICENSE](LICENSE).
