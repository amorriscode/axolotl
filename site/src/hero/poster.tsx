export function AxolotlPoster() {
  return (
    <div className="poster">
      <svg viewBox="0 0 760 460" aria-hidden="true">
        <defs>
          <linearGradient id="poster-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8e4df" />
            <stop offset="0.45" stopColor="#f0c4c2" />
            <stop offset="1" stopColor="#d48996" />
          </linearGradient>
          <linearGradient id="poster-gill" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff2d55" />
            <stop offset="0.7" stopColor="#ff8fa6" />
            <stop offset="1" stopColor="#ffe1c8" />
          </linearGradient>
          <linearGradient id="poster-fin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb3c0" stopOpacity="0.15" />
            <stop offset="1" stopColor="#ff5d7a" stopOpacity="0.55" />
          </linearGradient>
          <filter id="poster-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <ellipse cx="470" cy="150" rx="120" ry="70" fill="#ff5d7a" opacity="0.18" filter="url(#poster-blur)" />
        <path
          fill="url(#poster-fin)"
          d="M250 168 C180 70, 90 78, 28 168 C90 150, 170 158, 250 176 Z"
        />
        <path
          fill="url(#poster-fin)"
          d="M210 250 C140 330, 70 320, 30 250 C90 268, 160 262, 220 246 Z"
        />
        <path
          fill="url(#poster-skin)"
          d="M642 196
            C674 176, 656 142, 600 136
            C548 128, 508 154, 474 166
            C410 146, 320 150, 230 164
            C150 176, 86 162, 42 190
            C22 206, 30 236, 62 246
            C118 262, 190 252, 268 256
            C370 268, 470 274, 548 250
            C590 236, 618 228, 642 208
            C652 202, 650 198, 642 196 Z"
        />
        <path
          fill="none"
          stroke="#fff6f2"
          strokeOpacity="0.35"
          strokeWidth="3"
          strokeLinecap="round"
          d="M180 186 C280 170, 420 168, 560 156"
        />
        <path fill="#e7aeb6" d="M430 248 C438 292, 458 312, 486 318 C470 300, 454 274, 446 248 Z" />
        <path fill="#e7aeb6" d="M300 252 C306 300, 328 322, 360 326 C342 306, 322 280, 314 252 Z" />
        <g fill="none" stroke="url(#poster-gill)" strokeLinecap="round">
          <path strokeWidth="5" d="M500 150 C452 104, 392 64, 328 40" />
          <path strokeWidth="4" d="M508 166 C468 124, 410 96, 348 78" />
          <path strokeWidth="3.5" d="M506 184 C474 154, 430 136, 384 124" />
          <path strokeWidth="1.4" d="M468 112 C446 92, 424 82, 398 72" />
          <path strokeWidth="1.4" d="M452 124 C428 108, 404 100, 376 92" />
          <path strokeWidth="1.4" d="M436 136 C412 124, 388 118, 360 112" />
          <path strokeWidth="1.3" d="M478 138 C458 122, 436 114, 410 108" />
          <path strokeWidth="1.3" d="M460 150 C438 138, 414 132, 388 128" />
          <path strokeWidth="1.2" d="M486 160 C470 148, 450 142, 428 138" />
          <path strokeWidth="1.2" d="M470 172 C452 164, 432 158, 410 156" />
          <path strokeWidth="1.15" d="M488 176 C474 168, 456 164, 436 162" />
        </g>
        <circle cx="604" cy="174" r="16" fill="none" stroke="#e2a15a" strokeWidth="3" />
        <circle cx="604" cy="174" r="8" fill="#140c10" />
        <circle cx="608" cy="170" r="2.4" fill="#fff8f4" />
        <path fill="none" stroke="#7a3a48" strokeWidth="2" strokeLinecap="round" d="M628 196 C636 202, 644 202, 650 198" />
      </svg>
    </div>
  );
}
