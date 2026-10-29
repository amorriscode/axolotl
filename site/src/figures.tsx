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
    <figure className="plate">
      <div className="slots" aria-hidden="true">
        <Slot name="authority" owner="system" signer={marked} writable={marked} />
        <Slot name="counter" owner="program" writable={marked} data={written} counted={counted} />
        <Slot name="system" owner="system" readonly />
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

function Slot({
  name,
  owner,
  signer,
  writable,
  readonly,
  data,
  counted,
}: {
  name: string;
  owner: string;
  signer?: boolean;
  writable?: boolean;
  readonly?: boolean;
  data?: boolean;
  counted?: boolean;
}) {
  return (
    <div className={writable ? "slot hot" : "slot"}>
      <header>
        <strong>{name}</strong>
        <span>{owner}</span>
      </header>
      <p className="flags">
        {signer ? "signer" : ""}
        {writable ? " writable" : ""}
        {readonly ? "read-only" : ""}
        {!signer && !writable && !readonly ? "—" : ""}
      </p>
      {data !== undefined && (
        <div className="bytes">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} className={data ? "byte on" : "byte"} />
          ))}
          <b className={counted ? "byte count on" : data ? "byte count" : "byte count"}>{counted ? "1" : data ? "0" : ""}</b>
        </div>
      )}
    </div>
  );
}

const BUMPS = [255, 254, 253];

export function PdaFigure() {
  const [index, setIndex] = useState(0);
  const bump = BUMPS[index] ?? 255;
  const found = index === BUMPS.length - 1;
  return (
    <figure className="plate">
      <div className="pda" aria-hidden="true">
        <ol className="seeds">
          <li><span>seed</span>"profile"</li>
          <li><span>seed</span>user</li>
          <li><span>seed</span>bump {bump}</li>
        </ol>
        <p className="pda-result">
          <span>address</span>
          {found ? "off the ed25519 curve" : "still on the curve"}
        </p>
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
  return (
    <figure className="plate">
      <div className="cpi" aria-hidden="true">
        <div className="program">
          <header>relay</header>
          <ul>
            <li>user · signer</li>
            <li className={sent ? "moving" : ""}>vault · {sent ? "forwarded" : "held"}</li>
            <li>echo program</li>
          </ul>
          {returned && <p className="ret">return data · 42</p>}
        </div>
        <p className="cpi-arrow">{sent ? "invoke" : "—"}</p>
        <div className="program">
          <header>echo</header>
          <ul>
            <li className={sent ? "moving" : "dim"}>{sent ? "vault · writable" : "no accounts yet"}</li>
            {wrote && <li className="wrote">vault.value = 42</li>}
          </ul>
        </div>
        <p className={`outsider ${step === 0 ? "" : "still-out"}`}>mint · not in the transaction</p>
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
