# Site design

Concept: **night water**. An axolotl never metamorphoses. It stays in the water, gills out, and still regenerates a whole limb. The compiler does the same thing. You stay in TypeScript. The program that grows back is an ordinary Anchor binary.

The animal is the only saturated object on the page. Everything else is ivory type on a plum-black field, with one laboratory yellow-green used only when something has compiled or passed.

## What was taken, and from where

Looked at the live sites on 29 October 2026, after two rejected Axolotl designs (a pink gradient with a card grid, then a green-black specimen plate). The notes below are the specific moves that survived that comparison.

**[lusion.co](https://lusion.co) and [activetheory.net](https://activetheory.net).** The WebGL object is the page, and the type is set against it at poster scale. The scene leaves when you scroll. Taken: a lazy-loaded Three.js axolotl, fixed on the first screen, fading as the next section covers it. Not taken: a full-viewport shader as decoration with nothing to look at.

**[bruno-simon.com](https://bruno-simon.com).** The 3D thing is the subject, not a background. Taken: the creature has anatomy (wide head, external gills, eye, limbs, caudal fin) and it follows the pointer. A flat poster stands in until the first frame, and for browsers without WebGL.

**[stripe.com](https://stripe.com) sessions posters.** A high-contrast italic display face, set huge, with a grotesque doing the work underneath. Taken: Bodoni Moda for the claim and the conformance fraction. Bricolage Grotesque for the interface. The two never swap jobs.

**[linear.app](https://linear.app).** The product chrome is the illustration. Taken: the playground is an edge-to-edge instrument. TypeScript, Rust, and the IDL are three panes, not tabs. A lamp is the compile state. No feature grid beside it.

**[rauno.me](https://rauno.me).** Motion is rare and has a job. Taken: the gill mark sways, the account liquid moves when the step changes, the CPI bead travels, the page fades. Nothing else animates. `prefers-reduced-motion` freezes the swim and the fades.

**[solana.com](https://solana.com) and Breakpoint.** A claim, then a number, then a dated list. Taken: home is the animal, one instruction lowered in the page, and `40/47` as type. The scoreboard is a timetable of rows. Status is the word pass, fail, or unsupported, plus a mark.

**[jup.ag](https://jup.ag).** The number is in front of the tool. Taken: the fraction is the scoreboard's headline, not a badge on a card.

**[vercel.com](https://vercel.com) / Next.js conf.** Code is on the first scroll, in the real typeface of the product. Taken: the increment instruction is compiled in the browser, TypeScript beside the Rust this page emitted.

**[phantom.com](https://phantom.com), [backpack.app](https://backpack.app), [helius.dev](https://www.helius.dev), [godly.website](https://godly.website), Awwwards sites of the day.** Used mostly as a refusal list. Logo marquees, persona cards, three-up feature grids, pill buttons, and mesh gradients read as a template even when the type is large. The axolotl is drawn once, as a living animal. It is not a mascot repeated on every card.

## Identity

Night water. Background `#07060b`. Type `#f4efe8`. Secondary text `#c8c0d4`. The gill is `#ff5d7a` and it belongs to the animal and the mark, not to headlines. The signal `#dff56a` means the row passed or the program compiled.

Type:

- Bodoni Moda italic and roman, display only. The claim, the learn and compiler titles, the fraction.
- Bricolage Grotesque for UI, prose, and section headings.
- IBM Plex Mono for code, kickers, and addresses.

The favicon is three gill filaments, not a blob.

## Pages

- **Home.** The animal, then the claim. Scroll: one instruction beside the Rust it became, then the conformance fraction and a tick for every row.
- **Learn.** Three figures: accounts as vessels on a transaction rail, a PDA bump moving on and then off a curve, CPI as two programs and a bead that can only carry what relay was given. Captions are `aria-live`.
- **Compiler.** Parse, model, emit, build. Emit shows the function this page compiled.
- **Playground.** CodeMirror on the TypeScript. Rust and IDL beside it. Diagnostics stay on the pane. The hash is `#play/` plus a gzip payload, so the URL is the program. "Load counter" restores the sample.
- **Scoreboard.** The fraction, a tick per row, filters, then the table. On a narrow screen each row restacks and repeats its column name.

## Motion, speed, access

Three.js is a separate chunk, loaded only for the home scene. The renderer pauses off screen, when the tab is hidden, and when `prefers-reduced-motion` is set (one frame, no swim). Pixel ratio is capped. The canvas is `aria-hidden`; a text alternative sits in the hero.

Skip link, real links, visible focus, `aria-current`, and status text that does not depend on color. The tick ruler is `aria-hidden` because the table has the same information.
