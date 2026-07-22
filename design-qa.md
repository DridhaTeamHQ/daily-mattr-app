**Comparison Target**

- Source visual truth: `C:\Users\Tamada\AppData\Local\Temp\codex-clipboard-8eff5726-a269-4f88-9a78-5bfd46e05926.png` plus the requested scroll-fade and rising-sheet behavior
- Implementation screenshot: the supplied screenshot captures the pre-animation Home state; a post-change interaction capture is unavailable
- Viewport: approximately 459 x 920
- State: Home, For You feed, top of scroll

**Full-view Comparison Evidence**

The supplied implementation screenshot was opened at original resolution. The requested changes were applied without changing the established hero, feed grid, or floating navbar. TypeScript and an Expo web production export pass.

**Focused Region Comparison Evidence**

The hero-to-sheet boundary and missing theme control were inspected in the supplied screenshot. The theme control is now positioned at the hero's top-right. The hero opacity/parallax and sheet lift are driven by the native scroll offset, but a still image cannot verify their timing.

**Findings**

- [P1] Motion timing is not visually verified.
  Location: Hero and rounded feed-sheet boundary during the first 220px of scrolling.
  Evidence: the pre-change screenshot is available, but no post-change scroll recording or rendered capture can be produced through the current in-app browser control environment.
  Impact: animation smoothness and the exact fade/lift balance cannot be signed off visually.
  Fix: review the refreshed app while slowly scrolling through the first hero height and capture any timing issue.

**Comparison History**

- Pass 1: added UI-thread hero fade, parallax, and scale interpolation.
- Pass 1: added extra upward sheet travel and restored the persisted sun/moon theme toggle.
- Pass 1 verification: TypeScript and Expo web production export passed.

**Implementation Checklist**

- Confirm the hero remains legible before scrolling.
- Confirm the image fades smoothly while the rounded sheet rises.
- Confirm the theme control switches both directions and remains visible over bright images.
- Confirm the existing navbar does not move or change style.

**Follow-up Polish**

- Fine-tune the 220px animation range after an on-device motion review if needed.

final result: blocked
