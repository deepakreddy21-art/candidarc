# Marketing video capture and export

## Deliverables

| Asset | Target | Location |
| --- | --- | --- |
| 16:9 product demo (30–45s) | web MP4 H.264 | `public/marketing/demo-product.mp4` |
| 9:16 social cut (15s) | web MP4 H.264 | `public/marketing/demo-vertical.mp4` |
| Poster | SVG/PNG | `public/marketing/demo-poster.svg` (shipped) |
| Captions | WebVTT | `public/marketing/demo-captions.vtt` (shipped) |

## Storyboard (vertical 15s)

1. **0–3s** — “Your experience deserves a better introduction.” Show sample résumé.
2. **3–7s** — Sourced team signal + matching experience connected by the arc.
3. **7–12s** — Tailored wording + clean document preview.
4. **12–15s** — CandidArc wordmark + “Bring your experience into focus.”

## Storyboard (16:9 demo)

Upload/build → structured review → Jobs → team signal → tailoring progress (label as edited/condensed) → preview/download.

## Local capture (reproducible)

1. Run `npm run build && npm run start` with mock providers.
2. Use a fictional seeded account; never record personal data.
3. Capture with OS tools (Xbox Game Bar / QuickTime) or Playwright `page.video()`.
4. Edit for length; burn captions or ship WebVTT beside the file.
5. Compress with ffmpeg, e.g.  
   `ffmpeg -i raw.mov -vcodec libx264 -crf 28 -movflags +faststart public/marketing/demo-product.mp4`
6. Confirm homepage “Watch product demo” loads the MP4 only after open (HEAD/lazy).

## Status

Poster and captions are in-repo. **MP4 files are intentionally omitted** until capture is run on a machine with recording tooling. The homepage player must not claim an MP4 exists when HEAD fails.
