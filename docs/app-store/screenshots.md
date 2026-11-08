# App Store screenshots

Drafts: `/Users/alanye/Development/nemu/output/appstore-screenshots/` (not in git).
Four styled, text-free sets: `mist`, `ink`, `mascot`, `panorama`. Render script:
`_render/render_styled.py`. **Use `panorama`.** No slogans or captions, by the owner's
decision.

The drafts show an older build and only Pepper&Carrot, so they are placeholders.
Retake them from the final build.

## What Apple requires

From [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/),
read 2026-11-08: `.jpeg`, `.jpg` or `.png`, no alpha, 1 to 10 per size.

| Apple's display | Our folder | Size | Requirement | Sim |
|---|---|---|---|---|
| iPhone with Dynamic Island, large | `iphone-6.9_1260x2736` | 1260 x 2736 | optional, scales down | `shots-air` (iPhone Air) |
| iPhone with Dynamic Island, medium | `iphone-6.3_1206x2622_scaled-from-air` | 1206 x 2622 | **required, at least one** | resampled from `shots-air` |
| iPad 13-inch | `ipad-13_2064x2752`, `ipad-13_2752x2064` | 2064 x 2752, 2752 x 2064 | **required, at least one** (`supportsTablet: true`) | `shots-ipad13` |
| iPhone Duo inner | `iphone-duo-inner_2853x2007` | 2853 x 2007 | optional now; required from April 2027 for apps built with the iOS 27.1 SDK or later | `shots-duo` |
| iPhone Duo outer | `iphone-duo-outer_1398x2034` | 1398 x 2034 | same | `shots-duo` |

Apple's page now names displays this way, not by the 6.9" and 6.3" of the folder names.
All smaller sizes scale from these.

Upload the Duo sizes now. nemu is built with the 27.1 SDK or later, the app supports
both displays, and Apple shows a badge on the product page once they are present.

## Which content

**Only open-licensed content in every capture**: nothing from a user-added directory,
and the Add Source Directory screen stays empty.

**Replace the Pepper&Carrot-only Library: yes, with both NDL and Mini Fantasy Theater.**
One cover on a white page undersells the app. NDL should lead because it is the
onboarding default and shows right-to-left reading, the thing a manga reader is for.
Mini Fantasy Theater and Pepper&Carrot add the modern colour that Edo prints don't have.

| Use | Content |
|---|---|
| Library | all 7 NDL works, Mini Fantasy Theater, Pepper&Carrot |
| Title page and chapters | an NDL work with a clean cover, such as 富岳百景 Fugaku Hyakkei |
| Reader paged, iPhone and Duo outer | NDL, right to left |
| Reader spread, iPad landscape and Duo inner | 富岳百景 Fugaku Hyakkei or 武蔵百景 Musashi Hyakkei |
| Reader scroll | Pepper&Carrot or Mini Fantasy Theater, for colour |
| Search | a term that hits several example sources |

Rules:

- **Little Nemo: leave it out of every capture**, including Library. The registry's
  curation note says some strips "contain racist caricatures of the period, including
  the character Imp". Picking safe strips is possible but adds nothing the others don't
  show. Do not install it on the screenshot sims.
- **Check every page you show against 4+.** [Guideline 2.3.8](https://developer.apple.com/app-store/review/guidelines/)
  requires screenshots to meet 4+ whatever the app's rating. Being public domain does not
  make a page suitable. Look through 北斎漫画 Hokusai Manga and 江戸生艶気樺焼 Edo Umare Uwaki
  no Kabayaki (a story about a would-be libertine) page by page before using them. No nudity,
  no gore. The NDL pages have not been reviewed for this yet.
- **Don't alter Mini Fantasy Theater (CC BY-SA) pages.** Show them as the reader shows them.
  Attribution is in the description (`listing.md`).
- **Don't capture the Add Sources guide row.** It reads "Add any Aidoku-compatible source
  list for more". The draft `07-sources` shows it. Drop that shot or scroll it out of frame.
- **Reader Settings shows RTL selected** only when the reader is on an RTL work. Take it on NDL.

## Order

`panorama` paints one strip across a class's files **in filename order**, so frames join
at the seams. The file count and order change the art, so decide them before rendering.
Upload in the same order. To change it, renumber the raw files and re-render.

The first three are the ones that show in search results, so lead with reading.

| # | iPhone (both sizes) | iPad portrait | Duo inner | Duo outer |
|---|---|---|---|---|
| 1 | `01-reader-paged` | `01-library` | `01-reader-spread` | `01-reader-paged` |
| 2 | `02-library` | `02-detail` | `02-library` | `02-library` |
| 3 | `03-detail` | `03-reader-paged` | `03-detail` | `03-detail` |
| 4 | `04-chapters` | `04-reader-scroll` | `04-reader-spread-controls` | `04-reader-controls` |
| 5 | `05-reader-scroll` | `05-search` | `05-reader-settings` | |
| 6 | `06-reader-controls` | `06-reader-settings` | | |
| 7 | `07-search` | | | |
| 8 | `08-reader-settings` | | | |

iPad's `ipad-13_2752x2064/01-reader-spread` is its own one-frame class, so it has no
seam. Upload it first in the iPad slot, ahead of the portrait frames.

## Retake after the final build

Run after the release commit is fixed. Paths are from `$O`.

```bash
O=/Users/alanye/Development/nemu/output/appstore-screenshots
```

### 1. Build for the simulators

Use a Release-configuration simulator build of the release commit, from its clean worktree
(`release-checklist.md`), so it talks to production. It installs on all three sims. Pass
exactly these two signing flags (`docs/handoff/mobile-polish-2026-10.md`, section 3).

```bash
cd "$OUT/wt/apps/mobile/ios"
xcodebuild -workspace nemu.xcworkspace -scheme nemu -configuration Release \
  -destination 'platform=iOS Simulator,name=shots-air' -derivedDataPath "$OUT/dd-sim" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY="-" build
APP="$OUT/dd-sim/Build/Products/Release-iphonesimulator/nemu.app"
```

### 2. Prepare each sim: `shots-air`, `shots-ipad13`, `shots-duo`

```bash
S=shots-air   # repeat for each
xcrun simctl boot "$S"
xcrun simctl uninstall "$S" pm.nemu || true
xcrun simctl install "$S" "$APP"
xcrun simctl ui "$S" appearance light
xcrun simctl status_bar "$S" override --time 2026-11-10T09:41:00 \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl launch "$S" pm.nemu
```

`--time` with a date also sets iPad's status-bar date. In Xcode 27 the simulator window
opens through `Xcode.app/Contents/Applications/DeviceHub.app`, and `open -a Simulator`
no longer works.

### 3. Set up the same state in the app on each sim, signed out, in English

1. Get Started > English > Next.
2. On Add Sources keep NDL Public Domain Picks, add Pepper&Carrot and Mini Fantasy Theater,
   leave Little Nemo off. Install & Continue.
3. Add all 7 NDL works, Mini Fantasy Theater and Pepper&Carrot to the Library, adding
   Pepper&Carrot first so NDL and Mini Fantasy Theater sit at the front.
4. Read a few pages of an NDL work so the Library and title page show progress.
5. Check that no directory other than Example Sources is listed.

### 4. Capture into the raw folders

First empty the raw folder: the renderer reads **every** PNG in it, so a leftover
`07-sources` would land in the strip. Name the files by the Order table.

```bash
rm "$O"/iphone-6.9_1260x2736/*.png
xcrun simctl io shots-air screenshot "$O/iphone-6.9_1260x2736/01-reader-paged.png"
# ...one per row; iPad likewise in ipad-13_2064x2752 and ipad-13_2752x2064
```

On the Duo, read the display ids first, because the wrong display comes out black. Then
rotate or switch displays as in the handoff doc.

```bash
xcrun simctl io shots-duo enumerate
xcrun simctl io shots-duo screenshot --display=<inner id> "$O/iphone-duo-inner_2853x2007/01-reader-spread.png"
xcrun simctl io shots-duo screenshot --display=<outer id> "$O/iphone-duo-outer_1398x2034/01-reader-paged.png"
```

The inner set is landscape, and a capture may come out rotated. Check it in step 6.

### 5. Make the 1206 x 2622 class from the Air captures

```bash
D="$O/iphone-6.3_1206x2622_scaled-from-air"
rm "$D"/*.png
for f in "$O"/iphone-6.9_1260x2736/*.png; do
  sips -z 2622 1206 "$f" --out "$D/$(basename "$f")"
done
```

### 6. Render and check

Needs Pillow. `--assets` defaults to this worktree's `apps/mobile/assets`.

```bash
python3 "$O/_render/render_styled.py" --sets panorama
sips -g pixelWidth -g pixelHeight -g hasAlpha "$O"/panorama/*/*.png
```

Every class must match its size with `hasAlpha: no`. Then look through
`panorama/contact-sheet.png` for seams, stray content and anything that fails the rules
above.

### 7. Reset the sims

```bash
for S in shots-air shots-ipad13 shots-duo; do
  xcrun simctl status_bar "$S" clear; xcrun simctl shutdown "$S"
done
```

These retake steps were written from the script and the handoff notes. They have not been
run, per the docs-only scope of this pass.
