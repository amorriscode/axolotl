# Site design

Written after looking at the live sites on 29 October 2026, and after the previous Axolotl site (Fraunces, a pink gradient, pill buttons, three feature cards, a blob favicon). That combination is the default look of generated marketing pages. This pass refuses it.

## What was taken, and from where

**[solana.com](https://solana.com).** The page opens with one sentence, then large figures (transactions, throughput) and a dated editorial list. It does not put a row of feature cards under the hero. Taken: the home page is a claim, a drawing, and the conformance fraction. The scoreboard is dated and grouped, like their changelog, not a dashboard of badges.

**Solana Breakpoint, as listed from solana.com.** The event reads as a timetable. Taken: conformance rows are a timetable of features. Status is a word next to a tick, not a colored pill.

**[linear.app](https://linear.app).** Sections are labeled as figures. The product, including a real code diff, is the illustration. Taken: learn and compiler sections are numbered figures. The playground is a working editor, not a picture of one.

**[stripe.com/newsroom](https://stripe.com/newsroom).** Serif for the essay, a plain grotesque for the interface, dates, a wide measure, almost no color. Stripe Press describes itself as writing for practitioners. Taken: Newsreader for prose, Atkinson Hyperlegible for UI, paper-colored plates for anything you study. The learn page is an essay with figures.

**[rauno.me](https://rauno.me).** A name, one sentence, and a list of principles ("Make it fast. Make it beautiful."). No hero illustration and no cards. Taken: the masthead is a word and four links. The only motion is the gill that has a reason to move.

**[ciechanow.ski/bicycle](https://ciechanow.ski/bicycle/).** The diagram is the argument. One mechanism per section, drawn in ink on a light ground, text beside it. Taken: accounts, program-derived addresses, and cross-program invocation are stepped figures on paper. The caption changes with the step.

**[joshwcomeau.com](https://www.joshwcomeau.com/).** Widgets sit inside the explanation. Motion teaches (squash and stretch, not a loading shimmer). Taken: each figure has a control, and the caption is an `aria-live` region so the step is available without the picture.

**[www.anchor-lang.com/docs](https://www.anchor-lang.com/docs).** The useful part is the offer to start in the browser, and that the document is the code. Taken: the compiler page shows the real lowered Rust, produced by the same compiler the playground uses, so the prose cannot drift from the toolchain.

**[jup.ag](https://jup.ag).** One claim, then the tool, with the number in front. Taken: `40/47` is set as a fraction with one tick per row, not a percentage badge on a card.

**[vercel.com](https://vercel.com).** The code is on the first screen. Taken: home shows a TypeScript instruction and the Rust function it lowers to, compiled in the page.

**[bruno-simon.com](https://bruno-simon.com).** A WebGL world is the interface. Declined as a page background: a full-viewport shader is slow, and it is the current stand-in for "distinctive." Regeneration is a stroke redraw on the engraving. It stays sharp on a phone and stops when `prefers-reduced-motion` is set.

**[www.helius.dev](https://www.helius.dev), [phantom.com](https://phantom.com), [godly.website](https://godly.website).** Recorded mostly as what to refuse. Helius leads with a logo marquee, persona cards, and stat blocks. Phantom's current page is a feature list. godly.website (now Recent) is still largely giant type over gradients. The axolotl is drawn once, as a lateral specimen, and is not repeated as a mascot.

## Identity

A bench and a plate. The page is a green-black bench (`#121411`). Anything you read closely — the animal, the diagrams, the editor, the scoreboard — sits on warm paper (`#f3efe6`) with ink (`#1b1914`). One red (`#9d1c2c`) is the gill and the error. One green (`#1e5c40`) is a written byte or a passing row. No mesh gradient, no glass, no rounded pills, no three-up card grid.

Type:

- Newsreader for the essay and the wordmark. It is a text serif, not a display font used as a logo treatment.
- Atkinson Hyperlegible for UI and body. The learn page has to be readable, including the captions under the figures.
- IBM Plex Mono for code, addresses, and the kicker labels.

The favicon is the same line drawing, reduced, not a filled blob.

## Pages

- **Home.** Claim, specimen, conformance fraction, then one instruction beside the Rust it becomes.
- **Learn.** Three stepped figures: accounts, PDAs, CPI. Prose around them. Tokens are one paragraph, because a token account is still an account.
- **Compiler.** Parse, model, emit, build, with the emitted function from the in-browser compiler.
- **Playground.** CodeMirror 6 on the TypeScript. Rust and IDL beside it, not behind tabs. Diagnostics stay on the page. The hash is `#play/` plus a gzip payload, so the URL is the program.
- **Scoreboard.** The fraction, a tick per row, then the table. On a narrow screen the table becomes a list of the same rows, still a table in the accessibility tree's terms only by reflow, with the column name repeated on each cell.

## Motion, speed, access

The gill stroke redraws. Account flags, bytes, the bump, and the CPI handoff change when you press Next. Nothing else moves. `prefers-reduced-motion: reduce` removes the stroke animation and the short transitions.

No Three.js. The drawing is SVG. CodeMirror was already the editor; Monaco would add a much larger runtime for the same job.

Skip link, real links in the masthead, visible focus, `aria-current`, `aria-live` captions, and text alternatives on the specimen. The tick ruler is `aria-hidden` because the table carries the same information. Color is not the only signal: status is also the word "pass", "fail", or "unsupported".
