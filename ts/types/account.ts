import { Pubkey } from './pubkey'

export type AccountInfo = {
  key: Pubkey
  is_signer: boolean
  is_writable: boolean
  lamports: any
  data: any
  owner: Pubkey
  executable: boolean
  rent_epoch: any
}
