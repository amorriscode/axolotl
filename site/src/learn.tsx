import { AccountsFigure, CpiFigure, PdaFigure } from "./figures";

export function Learn() {
  return (
    <article className="essay">
      <header className="page-head">
        <p className="eyebrow"><span>Learn</span> Three mechanisms</p>
        <h1>Nothing lives in the program.</h1>
        <p className="lede">
          Solana has no contract storage. A program is an executable account. Everything it remembers lives in other accounts it is allowed to touch.
        </p>
      </header>

      <section>
        <h2><span className="idx">01</span> Accounts are the storage</h2>
        <p>
          An account is an address, a lamport balance, an owner, and a byte array. Anchor writes an 8-byte discriminator in front of the fields. Creating one must leave it rent-exempt, or the runtime refuses the transaction.
        </p>
        <p>
          Axolotl turns each exported function into one instruction. The parameter order is the account order. <code>mut</code>, <code>init</code>, <code>signer</code>, and <code>has_one</code> are constraints in the type, not comments.
        </p>
        <AccountsFigure />
      </section>

      <section>
        <h2><span className="idx">02</span> A PDA has no private key</h2>
        <p>
          Program-derived addresses are public keys that lie off the ed25519 curve. The program finds one by hashing seeds with a bump byte until the result is off the curve. It signs later by repeating those seeds. Nobody holds a secret key for that address.
        </p>
        <p>
          When the account has a <code>bump: u8</code> field, Axolotl stores the canonical bump on init and reads it back instead of searching again.
        </p>
        <PdaFigure />
      </section>

      <section>
        <h2><span className="idx">03</span> A call can only forward what it was given</h2>
        <p>
          Cross-program invocation is <code>invoke</code>. The callee sees a new instruction made of accounts the caller already holds. A PDA signature is rebuilt from the seeds. Return data comes back as bytes, separate from accounts.
        </p>
        <p>
          <code>system.transfer</code>, <code>token.transferChecked</code>, and <code>cpi()</code> are the three forms Axolotl lowers. A token balance is still an account, owned by the token program. The vault example requires the vault PDA to be the destination token account’s authority, and the signer to be the source account’s authority.
        </p>
        <CpiFigure />
      </section>
    </article>
  );
}
