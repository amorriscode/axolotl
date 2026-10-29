import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useState } from "react";

function Stepper({
  step,
  total,
  onPrev,
  onNext,
  label,
}: {
  step: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={onPrev} disabled={step === 0}>Previous</button>
      <button type="button" onClick={onNext} disabled={step === total - 1}>Next</button>
      <span className="step-count">{label} {step + 1} / {total}</span>
    </div>
  );
}

const ACCOUNT_CAPTIONS = [
  "A transaction names accounts. Nothing has run, so no bytes change.",
  "The runtime checks the signer. Read-only accounts cannot be written.",
  "The program runs. It may change only the writable account.",
  "The discriminator stays. The count field is now 1.",
];

export function AccountsFigure() {
  const [step, setStep] = useState(0);
  const marked = step >= 1;
  const written = step >= 2;
  const counted = step >= 3;
  return (
    <figure className="figure">
      <div className="ampoules" aria-hidden="true">
        <Ampoule
          name="authority"
          owner="system"
          flags={marked ? "signer · writable" : "named"}
          live={marked}
          level={marked ? 46 : 28}
        />
        <Ampoule
          name="counter"
          owner="program"
          flags={marked ? "writable" : "named"}
          live={written}
          level={written ? 62 : 34}
          bytes
          counted={counted}
          written={written}
        />
        <Ampoule
          name="system"
          owner="system"
          flags="read-only"
          level={22}
        />
      </div>
      <figcaption>
        <p aria-live="polite">{ACCOUNT_CAPTIONS[step]}</p>
        <Stepper
          step={step}
          total={ACCOUNT_CAPTIONS.length}
          onPrev={() => setStep((value) => Math.max(0, value - 1))}
          onNext={() => setStep((value) => Math.min(ACCOUNT_CAPTIONS.length - 1, value + 1))}
          label="Account step"
        />
      </figcaption>
    </figure>
  );
}

function Ampoule({
  name,
  owner,
  flags,
  live,
  level,
  bytes,
  written,
  counted,
}: {
  name: string;
  owner: string;
  flags: string;
  live?: boolean;
  level: number;
  bytes?: boolean;
  written?: boolean;
  counted?: boolean;
}) {
  return (
    <div className={live ? "ampoule live" : "ampoule"}>
      <div className="liquid" style={{ height: `${level}%` }} />
      <header>
        <strong>{name}</strong>
        <span>{owner}</span>
      </header>
      <p>{flags}</p>
      {bytes && (
        <div className="bytes">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} className={written ? "on" : ""} />
          ))}
          <b className={counted ? "hot" : ""}>{written ? (counted ? "1" : "0") : ""}</b>
        </div>
      )}
    </div>
  );
}

const BUMPS = [255, 254, 253];
const BUMP_POINTS = [
  { cx: 168, cy: 248 },
  { cx: 318, cy: 142 },
  { cx: 446, cy: 268 },
];

export function PdaFigure() {
  const [index, setIndex] = useState(0);
  const bump = BUMPS[index] ?? 255;
  const found = index === BUMPS.length - 1;
  const point = BUMP_POINTS[index] ?? BUMP_POINTS[0]!;
  return (
    <figure className="figure">
      <div className="pda-layout">
        <ol className="seeds" aria-hidden="true">
          <li><span>seed</span>“profile”</li>
          <li><span>seed</span>user</li>
          <li><span>seed</span>bump {bump}</li>
        </ol>
        <svg className="curve" viewBox="0 0 680 380" aria-hidden="true">
          <defs>
            <linearGradient id="pda-stroke" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#ff5d7a" />
              <stop offset="1" stopColor="#dff56a" />
            </linearGradient>
            <filter id="pda-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M24 300 C 170 304, 250 86, 650 36" fill="none" stroke="rgba(244,239,232,0.18)" strokeWidth="1.5" strokeDasharray="3 8" />
          <path d="M24 300 C 170 304, 250 86, 650 36" fill="none" stroke="url(#pda-stroke)" strokeWidth="2.25" filter="url(#pda-glow)" />
          <circle cx={point.cx} cy={point.cy} r="9" fill={found ? "#dff56a" : "#ff5d7a"} />
          {found && (
            <text x="468" y="276" fill="#dff56a" fontSize="18" fontFamily="IBM Plex Mono, monospace">
              off the curve
            </text>
          )}
        </svg>
      </div>
      <figcaption>
        <p aria-live="polite">
          {found
            ? "Bump 253 is off the curve, so it can be an address. The program signs with the seeds. There is no private key."
            : `Bump ${bump} still lands on the curve, so it is a real public key and cannot be a program address. Try the next bump.`}
        </p>
        <div className="stepper">
          <button type="button" onClick={() => setIndex(0)} disabled={index === 0}>Reset</button>
          <button type="button" onClick={() => setIndex((value) => Math.min(BUMPS.length - 1, value + 1))} disabled={found}>
            Next bump
          </button>
          <span className="step-count">Bump {bump}</span>
        </div>
      </figcaption>
    </figure>
  );
}

const CPI_CAPTIONS = [
  "Relay was given the user, the vault, and the echo program. A mint it was not given stays outside.",
  "Relay may forward only accounts it already holds. The vault is marked writable on the way in.",
  "Echo writes the vault. Relay still cannot touch the mint.",
  "Echo returns the new value in the return data. Relay reads those bytes and does not share an account with Echo except the ones it passed.",
];

export function CpiFigure() {
  const [step, setStep] = useState(0);
  const sent = step >= 1;
  const wrote = step >= 2;
  const returned = step >= 3;
  const reduce = useReducedMotion();
  return (
    <figure className="figure">
      <div className="cpi-stage" aria-hidden="true">
        <p className={step === 0 ? "mint" : "mint dim"}>mint · not in the transaction</p>
        <div className="cpi-field">
          <div className="orb">
            <p className="orb-name">relay</p>
            <ul>
              <li>user · signer</li>
              <li className={sent ? "moving" : ""}>vault · {sent ? "forwarded" : "held"}</li>
              <li>echo program</li>
            </ul>
            {returned && <p className="ret">return data · 42</p>}
          </div>
          <div className="channel">
            <motion.i
              className="bead"
              animate={{ x: sent ? "220%" : "0%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
            />
            <span>{sent ? "invoke" : ""}</span>
          </div>
          <div className="orb">
            <p className="orb-name">echo</p>
            <ul>
              <li className={sent ? "" : "dim"}>{sent ? "vault · writable" : "no accounts yet"}</li>
              {wrote && <li className="wrote">vault.value = 42</li>}
            </ul>
          </div>
        </div>
      </div>
      <figcaption>
        <p aria-live="polite">{CPI_CAPTIONS[step]}</p>
        <Stepper
          step={step}
          total={CPI_CAPTIONS.length}
          onPrev={() => setStep((value) => Math.max(0, value - 1))}
          onNext={() => setStep((value) => Math.min(CPI_CAPTIONS.length - 1, value + 1))}
          label="CPI step"
        />
      </figcaption>
    </figure>
  );
}
