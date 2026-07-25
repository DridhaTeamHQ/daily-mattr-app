# Pix — style explorations

Generated while designing the Pix card format. These are mockups **of** the interface,
not assets the app ships — Pix cards use each article's own `image_url`, falling back to
the topic artwork in `assets/images/topics/`.

Kept here because they're the reference the implemented presets were drawn from.

| File | Direction | Presets it informed (`src/lib/pixStyles.ts`) |
| --- | --- | --- |
| `pix-photo-led-a.png` | Full-bleed photo, headline melting out of the bottom, key phrase on a blue fill, bullets with blue dots over the dimmed photo | `bleed-ink`, `bleed-loud`, `bleed-topic` |
| `pix-photo-led-b.png` | Same direction, second variant | `bleed-quiet`, `bleed-duo`, `top-ink` |
| `pix-type-led-a.png` | Type-led: photo as a rounded inset, big dark headline with a blue underline stroke, numbered `01 02 03` key points | `inset-editorial`, `band-type`, `inset-quiet` |
| `pix-type-led-b.png` | Same direction, second variant | `poster`, `poster-topic`, `band-topic` |

The shipped card composes both directions rather than choosing one: the style descriptor
varies frame, headline anchor, scrim, accent (`fill` / `underline` / `bar` / `none`) and
bullet marker (`dot` / `numeral` / `rule`), so a single component covers the range these
mockups explore. The preset is picked by hashing the article id.
