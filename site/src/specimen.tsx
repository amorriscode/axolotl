export function Specimen() {
  return (
    <figure className="plate specimen">
      <svg viewBox="0 0 640 250" role="img" aria-labelledby="spec-title spec-desc">
        <title id="spec-title">Axolotl, lateral view</title>
        <desc id="spec-desc">
          A line drawing of an axolotl facing left. Three external gills leave the head. The uppermost gill is drawn as it grows back.
        </desc>
        <g fill="none" stroke="#1b1914" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M188 132
            C168 108 176 78 214 68
            C252 58 292 74 318 96
            C360 78 430 82 492 104
            C540 120 568 132 590 140
            C548 156 500 162 456 158
            C390 170 320 176 268 164
            C228 156 196 154 176 142
            C160 132 170 122 188 132 Z" />
          <path d="M176 142 C132 136 96 118 108 96 C122 74 168 72 196 90" />
          <path d="M492 104 C530 78 572 86 604 112 C572 124 534 126 508 122" />
          <path d="M508 150 C552 168 586 176 608 150" />
          <circle cx="132" cy="112" r="4.5" />
          <circle cx="133" cy="112" r="1.4" fill="#1b1914" stroke="none" />
          <path d="M286 164 C278 188 270 204 288 208" />
          <path d="M288 208 l-9 5 M288 208 l0 8 M288 208 l8 4" />
          <path d="M400 160 C408 184 420 198 436 194" />
          <path d="M436 194 l-7 6 M436 194 l2 8 M436 194 l9 3" />
        </g>
        <g fill="none" stroke="#9d1c2c" strokeWidth="1.45" strokeLinecap="round">
          <path d="M196 92 C176 62 158 42 142 22" />
          <path d="M168 58 l-8 -5 M156 42 l-7 -6 M146 30 l-5 -4" />
          <path d="M208 88 C214 54 236 34 258 16" />
          <path d="M216 58 l7 -6 M230 40 l7 -6 M244 26 l5 -4" />
          <path className="gill-regen" d="M214 98 C244 66 274 48 302 28" />
          <path className="gill-regen" d="M238 78 l8 -5 M258 60 l8 -6 M278 44 l6 -5" />
        </g>
      </svg>
      <figcaption>
        <span>Fig. 1</span>
        <span>External gills. The upper filament is drawn again.</span>
      </figcaption>
    </figure>
  );
}
