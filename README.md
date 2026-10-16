# Pricepic

Snap a photo, get a value estimate, share it to a feed, and message sellers.

## Run it on your Mac (about 5 minutes)

1. Install Node.js (version 20 or newer) from https://nodejs.org (the LTS download).
2. Get an Anthropic API key at https://console.anthropic.com (this powers the photo scanning).
3. Open the Terminal app, go into this folder, and run:

   cd path/to/pricepic
   ANTHROPIC_API_KEY=your-key-here node server.js

4. Open http://localhost:3000 in your browser.
5. To use it on your phone, join the same Wi-Fi and open http://YOUR-MAC-IP:3000
   (System Settings > Wi-Fi > Details shows your IP address).

No installs or npm packages are needed. Data is saved in data.json next to server.js.

## Install it as an app (no browser bars)
- On your Mac, in Chrome: open http://localhost:3000, then click the install icon at the right end of the address
  bar (or the three-dot menu > Cast, save and share > Install page as app). Pricepic gets its own window and
  Dock icon. In Safari: File > Add to Dock.
- On your phone: once Pricepic is hosted online (https), open the link, then Share > Add to Home Screen
  (iPhone) or menu > Install app (Android). Installing from your Mac's local address won't offer the full
  install on a phone, because phones need a secure (https) address for that.

## What works
- Accounts (sign up, log in, log out)
- Scan up to 3 photos for a value estimate (Quick sale / Market / Patient)
- Share an item to the endless-scroll feed, search it, remove your own listings
- Private messages between buyer and seller, plus an inbox
- Report button on listings
- Likes, follow sellers (with a Following tab), make an offer (sent as a message), and seller star ratings
  (you can only rate a seller after messaging them)
- A price range bar showing where your list price sits between quick-sale and patient prices

## Not built yet
- Price estimates from real sold listings. Today they are AI estimates. eBay's sold-listing data is
  restricted to approved partners as far as I know, so check eBay's developer docs for what your
  account can access. Active-listing comparisons are available through their Browse API.
- Real one-tap eBay posting. For now "Copy for eBay" copies the listing and opens eBay's sell page.
  Real posting needs a free eBay developer account and OAuth set up in server.js.
- Before real strangers use it: put it on proper hosting with HTTPS, switch data.json to a real
  database, add rate limiting, and add a way for you to review reported listings (they are saved
  in data.json under "reports").
