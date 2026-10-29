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

`parseFunction` (`packages/compiler/src/parse.ts`, around line 400) reads the exported function. The first parameter's type argument `{ mut: true; hasOne: ["authority"] }` becomes account options. The body stays a TypeScript block. Parse does not know that `+` will be checked.

## 2. Lower

`lowerBinary` (`packages/compiler/src/lower.ts`, around line 1461) sees `counter.count + 1n` and builds a `check` node: operation `add`, left the field, right the integer `1`. It does not write `checked_add` itself.

`validateAccounts`, in the same file, refuses `hasOne` unless `authority` is a `Signer`. That is a fact about the instruction, decided before any Rust exists.

The instruction body is a list of statements. The assignment is `{ t: "assign", temp, place, value }` where `value` is the `check` node. A `for` loop is `{ t: "for", name, ty, init, bound, body }`. `continue` inside that body is a `continue` node. The printer, not a string stored beside the loop, inserts the increment before `continue` and again at the bottom. A `continue` inside a nested `while` or `for` is left alone.

## 3. Print

`renderExpr` (`packages/compiler/src/print.ts`, line 17) is the first function allowed to spell `checked_add`. `renderStmt` for `assign` always binds the value to a temporary, then stores that temporary. `emitInstruction` (`packages/compiler/src/emit.ts`, around line 124) asks the printer for each statement and writes the function into the Anchor module. The account attribute `has_one = authority` is printed from the same options parse recorded.

The Rust a reader should see, which is what `examples/counter/programs/counter/src/lib.rs` contains for `increment`:

```rust
let __ax_1 = ctx.accounts.counter.count.checked_add(1u64).ok_or(AxolotlError::ArithmeticOverflow)?;
ctx.accounts.counter.count = __ax_1;
```
