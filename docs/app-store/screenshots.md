# App Store screenshots

**Upload the raw captures in `/Users/alanye/Development/nemu/output/appstore-screenshots/`
(not in git), in filename order.** By the owner's decision they are plain: no background,
framing, device mockup, slogans or captions. The styled sets in the same folder (`mist`,
`ink`, `mascot`, `panorama`) are no longer the deliverable, and they show an older build.

Current set: built from `038eb219`, stable Xcode 27.2 (27B52), mostly dark appearance.
Contact sheets: `_contact-sheets/`, one per class, plus `all-classes.png`.

## What Apple requires

From [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/),
read 2026-11-08: `.jpeg`, `.jpg` or `.png`, no alpha, 1 to 10 per size.

| Apple's display | Our folder | Size | Requirement | Sim |
|---|---|---|---|---|
| iPhone with Dynamic Island, large | `iphone-6.9_1260x2736` | 1260 x 2736 | optional, scales down | `shots-air` (iPhone Air) |
| iPhone with Dynamic Island, medium | `iphone-6.3_1206x2622_scaled-from-air` | 1206 x 2622 | **required, at least one** | resampled from `shots-air` |
| iPad 13-inch | `ipad-13_2064x2752`, `ipad-13_2752x2064` | 2064 x 2752, 2752 x 2064 | **required, at least one** (`supportsTablet: true`) | `shots-ipad13` |
| iPhone Duo inner | `iphone-duo-inner_2853x2007` | 2853 x 2007 | required from April 2027 for apps built with the iOS 27.1 SDK or later | `shots-duo` |
| iPhone Duo outer | `iphone-duo-outer_1398x2034` | 1398 x 2034 | same | `shots-duo` |

The owner wants the Duo classes in this submission. Apple's page also shows a badge on the
product page once they are present.

## Order

| # | iPhone 6.9" and 6.3" | iPad 13" | Duo inner | Duo outer |
|---|---|---|---|---|
| 1 | `01-library-empty` | `01-library-empty` | `01-library-empty` | `01-library-empty` |
| 2 | `02-library` | `02-library` | `02-library` | `02-library` |
| 3 | `03-detail` | `03-detail` | `03-detail` | `03-detail` |
| 4 | `04-reader-colour` | `04-reader-colour` | `04-reader-spread` | `04-reader-colour` |
| 5 | `05-reader-rtl` | `05-reader-spread` (in `ipad-13_2752x2064`) | `05-reader-colour` | `05-reader-rtl` |
| 6 | `06-reader-scroll` | `06-reader-scroll` | `06-reader-scroll` | `06-reader-scroll` |
| 7 | `07-search` | `07-search` | `07-search` | `07-search` |
| 8 | `08-reader-settings` | `08-reader-settings` | `08-reader-settings` | `08-reader-settings` |

## Content

| Shot | Content | Licence |
|---|---|---|
| `01-library-empty` | The nemu mascot, empty Library | nemu's own art |
| `02-library` | Covers of all 7 NDL works, Mini Fantasy Theater, Pepper&Carrot | see below |
| `03-detail` | 武蔵百景 Musashi Hyakkei; on iPad Pepper&Carrot, whose chapter list fills the column | public domain; CC BY 4.0 |
| `04-reader-colour`, `05-reader-colour` | Mini Fantasy Theater, chapter 1 | CC BY-SA 4.0 |
| `05-reader-rtl` | Musashi Hyakkei, page 4, Page Fit set to Fill Screen | public domain |
| `04-reader-spread`, `05-reader-spread` | Musashi Hyakkei, pages 4 and 5, right to left | public domain |
| `06-reader-scroll` | Pepper&Carrot, chapter 37 | CC BY 4.0 |
| `07-search` | Search for "Hyakkei": Musashi Hyakkei, Fugaku Hyakkei | public domain |
| `08-reader-settings` | Reader settings on Musashi Hyakkei, RTL selected | public domain |

Rules:

- **Only open-licensed content** from Example Sources. Attribution is in the description
  (`listing.md`).
- **Little Nemo: leave it out of every capture**, including Library. The registry's
  curation note says some strips "contain racist caricatures of the period, including the
  character Imp". Do not install it on the screenshot sims.
- **Check every page you show against 4+.** [Guideline 2.3.8](https://developer.apple.com/app-store/review/guidelines/)
  requires screenshots to meet 4+ whatever the app's rating. Being public domain does not
  make a page suitable. Only the pages in the table above have been looked at. 北斎漫画
  Hokusai Manga and 江戸生艶気樺焼 Edo Umare Uwaki no Kabayaki appear as covers only.
- **Don't alter Mini Fantasy Theater (CC BY-SA) pages.** Show them as the reader shows them.
- **Keep Aidoku out of frame.** The Add Sources guide row reads "Add any Aidoku-compatible
  source list for more", so don't capture that sheet. It also lists LANraragi.
- **Don't use the Mini Fantasy Theater detail page on wide layouts.** Its description reaches
  "AI derivation prohibited", and its chapter list is mostly AI jokes.
- **NDL scans:** Musashi's are wider than a phone, so Fit Page leaves bands. Fill Screen fills
  the screen, then drag to frame the figure. Fuji Hyaku Shōkei is portrait but cuts each
  painting at the binding.

## Retake

Run after the release commit is fixed. The helpers are in `$O/_render/tools/`. They expect
to run from `/tmp/shots-tools`, and `build2.sh` uses `/tmp/shots-b2`.

```bash
O=/Users/alanye/Development/nemu/output/appstore-screenshots
```

### 1. Build for the simulators

Use a Release simulator build of the release commit, from a clean worktree
(`release-checklist.md`), so it talks to production. `build2.sh` does this with stable
Xcode 27.2, including the OCR models, the Ichiran kernel and `.env.production.local`.

```bash
xcodebuild -workspace nemu.xcworkspace -scheme nemu -configuration Release \
  -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  -derivedDataPath "$OUT/dd" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
```

### 2. Prepare each sim, one at a time

```bash
xcrun simctl boot "$S"
xcrun simctl uninstall "$S" pm.nemu || true
xcrun simctl install "$S" "$APP"
xcrun simctl ui "$S" appearance dark
xcrun simctl status_bar "$S" override --time 9:41 \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100
```

- `--time` must be `9:41`: this simctl rejected every ISO date tried. iPad's status bar
  therefore shows the real date.
- Use `discharging`: `charged` draws a green charging bolt.
- On iPad, set Settings > General > Multitasking & Gestures > **Full Screen Apps**. Windowed
  mode adds a corner grip and an app-name label to every shot.
- Before using `shots-duo`, check that no other job has it. On 2026-11-09 another job
  installed its Debug build over the capture build, which wiped the seeded state.

### 3. Seed on Air, signed out, in English

1. Get Started > English > Next.
2. On Add Sources keep NDL Public Domain Picks, add Pepper&Carrot and Mini Fantasy Theater,
   leave Little Nemo off. Install & Continue, then Start Reading.
3. Capture `01-library-empty`, then `SNAP=/tmp/shots-v2/state-empty snap.sh save`.
4. Add the 9 titles. In the reader settings set Page Background to Black, and set
   Pepper&Carrot to Scroll.
5. `snap.sh save`, then on each later sim `snap.sh load` and `order.sh`, which puts the
   colourful covers first.

### 4. Input

| Sim | Tap and swipe | Notes |
|---|---|---|
| Air | `t.sh`, `tl.sh` | |
| iPad | `AXETAP=1 SCALE=2 t.sh`, which uses AXe `--tap-style physical` | the HID helper's taps do nothing |
| Duo | `t.sh`, `tl.sh`; `t.sh <udid> pose open` or `closed` | AXe's taps do nothing. Display ids change each boot, so use `dsp.sh` |

If Duo touch fails with `CoreDevice touch capability lookup failed: deviceUnavailable`,
restart the service once no `devicectl` or phone-targeted `xcodebuild` is running. This
happened after a new Xcode's first-launch install replaced CoreDevice.

```bash
launchctl kickstart -k user/$(id -u)/com.apple.CoreDevice.CoreDeviceService
```

The service is in the `user` domain; `gui/` does not find it. `phonebusy.sh` lists anything
that would be interrupted.

Reader traps:

- Folding the Duo mid-book can leave a cover view, not a page, with a Show Pages button.
  Tap that first.
- Reader controls cover the art on the Duo, so hide them for colour pages.
- Page Fit is saved per screen size. Set it back to Fit Page after the RTL shot.

### 5. Capture and install

```bash
xcrun simctl io "$S" screenshot --mask=ignored "$FILE"
# Duo: add --display=$(dsp.sh "$S" inner) or outer
```

Wait for NDL images to finish loading. Save to `/tmp/shots-v2/{air,ipad,inner,outer}`, then
run `install_v2.py air ipad inner outer`, which also makes the 1206 x 2622 class.

### 6. Check and reset

```bash
python3 raw_sheets.py && python3 verify.py
xcrun simctl status_bar "$S" clear; xcrun simctl shutdown "$S"
```

`verify.py` must report `bad 0`. Then look through `_contact-sheets/` for stray content and
anything that fails the rules above.
