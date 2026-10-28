import {
  emit,
  require,
  type Account,
  type Event,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type bytes32,
  type u64,
  type u8,
} from "@axolotl-sol/core";

export interface Profile {
  authority: Pubkey;
  bump: u8;
  visits: u64;
  nickname: bytes32;
}

export interface Visited extends Event {
  user: Pubkey;
  visits: u64;
  note: string;
}

export function createProfile(
  profile: Account<Profile, {
    init: true;
    payer: "user";
    seeds: ["profile", { account: "user" }];
    bump: true;
  }>,
  user: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
  nickname: bytes32,
): void {
  profile.authority = user.key;
  profile.visits = 0n;
  profile.nickname = nickname;
}

export function visit(
  profile: Account<Profile, {
    mut: true;
    seeds: ["profile", { account: "user" }];
    bump: true;
  }>,
  user: Signer,
  note: string,
): void {
  require(user.key === profile.authority, "Unauthorized");
  profile.visits = profile.visits + 1n;
  emit<Visited>({ user: user.key, visits: profile.visits, note });
}
