# Site design

Concept: **night water**. An axolotl never metamorphoses. It stays in the water, gills out, and still regenerates a whole limb. The compiler does the same thing. You stay in TypeScript. The program that grows back is an ordinary Anchor binary.

The animal is the only saturated object on the page. Everything else is ivory type on a plum-black field, with one laboratory yellow-green used only when something has compiled or passed.

## What was taken, and from where

Visited on 29 October 2026, after two rejected Axolotl designs (a pink gradient with a card grid, then a green-black specimen plate). Breakpoint's host did not resolve. godly.website redirected to recent.design.

**[lusion.co](https://lusion.co).** A lit 3D subject in the middle of the first screen, type kept small so the object can breathe. Taken: the axolotl is the picture, not a texture behind a headline. Lighting has to read as a body, or it is just a blob.

**[activetheory.net](https://activetheory.net).** A particle field behind a short line of type. Their page also ships a styled "browser not supported" state. Taken: the heavy scene is one chunk, and a drawn poster stays up until the first frame, including when WebGL never arrives.

**[bruno-simon.com](https://bruno-simon.com).** The 3D scene is the page. Labels are small and sit on the world. Taken: the creature has anatomy (wide head, external gills, an eye, limbs, a caudal fin) and the head follows the pointer. Not taken: making the whole site a game. Learn, the compiler, and the playground have to stay readable.

**[vincenzomaiorana.com](https://vincenzomaiorana.com), an Awwwards site of the day.** A real serif, cream ground, almost no graphics, spacing doing the work. Taken: Bodoni Moda for the claim and the fraction only. The grotesque does the interface. Not taken: a light editorial theme. That was the specimen plate, and it was already rejected.

**[nextjs.org/conf](https://nextjs.org/conf).** One line at a brutal size, neon used once, nothing else in the hero. Taken: the headline is four short lines, not a paragraph, and yellow-green is only the compiled or passing state.

**[jup.ag](https://jup.ag).** Black field, one ownable neon, a mascot that is drawn rather than a clip-art animal. Taken: `#dff56a` is the signal, and the animal appears once. A repeated mascot would read as a meme-coin site.

**[linear.app](https://linear.app).** Left-aligned claim, and the moving thing is the product UI. Taken: the playground is an edge-to-edge instrument. TypeScript, Rust, and the IDL are three panes. A lamp is the compile state.

**[rauno.me](https://rauno.me).** Black, white type, no illustration, a small name. The lesson is restraint in the chrome, not emptiness. Taken: the nav is a word and four links. The gill mark, the account liquid, the CPI bead, and the page fade are the only motion. `prefers-reduced-motion` freezes the swim.

**[solana.com](https://solana.com).** Giant centered wordmark on a purple mesh. That scale is the useful part. The mesh is the part already rejected as a gradient. Taken: type large enough to be the layout. The scoreboard is still a list of rows, with the word pass, fail, or unsupported, not a badge.

**[stripe.com/sessions](https://stripe.com/sessions), [phantom.com](https://phantom.com), [backpack.app](https://backpack.app), [helius.dev](https://www.helius.dev).** White or dark, then a gradient illustration or a floating product card. Helius is the closest to a template: mesh, headline, card. Their gradients are the thing not to borrow. Stripe's live Sessions page is a grotesque on white with abstract color, not a Bodoni poster. The serif here comes from the Maiorana page, not from Stripe.

**[awwwards.com](https://www.awwwards.com/websites/sites_of_the_day/) and [recent.design](https://recent.design).** Grids of other people's work. Useful as a reminder that a card grid is a catalogue, not a product. Guillaume Colombel's loader was a designed 3D wait, which only pays off if the thing being waited for is the point. Here that thing is the animal, and it is lazy-loaded so the rest of the site does not pay for it.

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
