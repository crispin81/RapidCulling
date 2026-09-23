# RapidCulling

A fast, Capture One-style RAW (and JPEG) culling app. Browse a folder,
group near-duplicate frames by visual similarity, rate and pick/reject with
single keystrokes, and drag finished shots straight into a folder — all in
a native desktop app (Tauri: Rust backend, React/TypeScript UI), no separate
runtime to install.

📺 [Video walkthrough](https://youtu.be/23gWnhcKoW8)

Free and open-source, licensed [AGPL-3.0](LICENSE).

## Installing

Grab the latest build for your OS from
[Releases](https://github.com/crispin81/RapidCulling/releases).

**These builds aren't code-signed** (that needs a paid developer
certificate this project doesn't have yet), so your OS will warn that the
publisher is unverified on first launch. That's expected for unsigned
beta software, not a sign anything's wrong:

- **macOS**: [Direct download (.dmg, Apple Silicon + Intel)](https://github.com/crispin81/RapidCulling/releases/download/v1.0.0-beta/RapidCulling_1.0.0_universal.dmg).
  Open the `.dmg`, drag `RapidCulling.app` into Applications. Gatekeeper
  will refuse to open it the first time — recent macOS versions no longer
  reliably let you bypass this with right-click → Open, so use one of
  these instead:
  - **Terminal** (quickest): run this once, then launch normally:
    ```
    xattr -d com.apple.quarantine /Applications/RapidCulling.app
    ```
  - **System Settings**: try to open the app once (it'll be blocked),
    then go to **System Settings → Privacy & Security**, scroll down to
    the security notice about RapidCulling, and click **Open Anyway**.
- **Windows**: [Direct download (.msi installer)](https://github.com/crispin81/RapidCulling/releases/download/v1.0.0-beta/RapidCulling_1.0.0_x64_en-US.msi).
  Run the `.msi` or `.exe`. SmartScreen will show "Windows
  protected your PC" — click **More info**, then **Run anyway**.
- **Linux**: [Direct download (.AppImage)](https://github.com/crispin81/RapidCulling/releases/download/v1.0.0-beta/RapidCulling_1.0.0_amd64.AppImage).
  `chmod +x` the `.AppImage` and run it directly (works on
  Debian, Arch, Fedora and most others), or install the `.deb`/`.rpm` for
  your distro.

## Usage

1. **Browse to a folder** in the Library tree in the sidebar (or pin
   frequently-used ones to Favourites with the star icon), then double-click
   it — or click ▶ — to open it for culling. A second/external drive shows
   up automatically in the "Drives…" picker at the top of the tree if you
   have more than one connected.
2. **Rate and sort.** Single-click a photo to focus it, then:
   - <kbd>0</kbd>–<kbd>5</kbd> — star rating
   - <kbd>P</kbd> — pick
   - <kbd>X</kbd> — reject
   - <kbd>↑</kbd>/<kbd>↓</kbd> — next/previous photo or group
   - <kbd>←</kbd>/<kbd>→</kbd> — scroll through similar shots in a group
   A photo can never be both picked and rejected at once. Use the star/
   picked/rejected filters in the sidebar to narrow the grid to just what
   you're deciding on.
3. **Group near-duplicates.** The Photo similarity slider controls how
   aggressively burst/continuous shots get grouped into one row — 100%
   groups only near-identical frames, lower values group shots further
   apart in time or content. Grouping applies automatically after a scan;
   adjust the slider afterwards and click **Update grouping** to re-run it.
4. **Move your picks.** Drag a photo (or a multi-selection) onto any folder
   in the sidebar tree to move it there — the culling grid updates
   immediately, and a moved file's rating/pick travels with it since both
   live in an XMP sidecar next to the RAW/JPEG, not in the app.

Ratings and picks are written as a standard `xmp:Rating` field plus a
`rapidculling:Pick` boolean in a `.xmp` sidecar next to each photo — never
into the RAW/JPEG file itself, and readable by other tools that honor
`xmp:Rating` (Lightroom, Capture One, Bridge, darktable, etc.).

## Data safety

- **A move never overwrites an existing file.** If the destination folder
  already has a file with that name, the incoming one is saved as
  `name (2).ext` instead — camera-assigned filenames (`IMG_0001.CR2` and
  the like) recur constantly across cards and shoots, and silently
  clobbering a same-named file would be a real way to lose a photo.
- **A photo's RAW, its `.xmp` sidecar, and any paired JPEG always move
  together**, and a partial failure part-way through a large batch move
  leaves already-moved files correctly reflected in the app's state rather
  than stranding them in limbo.
- **Sidecar writes are atomic** (written to a temp file, then renamed into
  place), so a crash or power loss mid-write can't leave a corrupted
  `.xmp` — it's always either the old content or the new, never
  truncated garbage.
- RAW/JPEG files themselves are never rewritten by this app — only their
  `.xmp` sidecars.

## Building / running

Requires Node 18+ and a Rust toolchain (see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # produce a native installer for the current OS
```

`tauri build` produces a `.AppImage`/`.deb`/`.rpm` on Linux, `.dmg`/`.app`
on macOS, and `.msi`/`.exe` on Windows — run it on each target OS (or via
CI) to get that platform's installer; Tauri doesn't cross-compile
installers from one OS to another.
