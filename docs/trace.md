# Tracing `increment`

This is the path from the counter example to Anchor Rust. Line numbers are the compiler as it is now.

The source, `examples/counter/src/counter.ts`:

```ts
export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  counter.count = counter.count + 1n;
}
```

## 1. Parse

`parseFunction` (`packages/compiler/src/parse.ts`) reads the exported function. The first parameter's type argument `{ mut: true; hasOne: ["authority"] }` becomes account options. The body stays a TypeScript block. Parse does not know that `+` will be checked.

## 2. Lower

`lowerBinary` (`packages/compiler/src/lower.ts`) sees `counter.count + 1n` and builds a `check` node: operation `add`, left the field, right the integer `1`. It does not write `checked_add` itself.

`validateAccounts`, in the same file, refuses `hasOne` unless `authority` is a `Signer`. That is a fact about the instruction, decided before any Rust exists.

The instruction body is a list of statements. The assignment is `{ t: "assign", place, value }` where `value` is the `check` node.

## 3. Print

`renderExpr` (`packages/compiler/src/print.ts`) is the first function allowed to spell `checked_add`. `emitInstruction` (`packages/compiler/src/emit.ts`) asks it for each statement and writes the function into the Anchor module. The account attribute `has_one = authority` is printed from the same options parse recorded.

The Rust a reader should see:

```rust
ctx.accounts.counter.count = ctx.accounts.counter.count
    .checked_add(1u64)
    .ok_or(AxolotlError::ArithmeticOverflow)?;
```

The temporary in the real output (`let __ax_1 = ...`) is the same addition. The `checked_add` is the meaning.
