import { Pubkey } from './pubkey'

export type AccountInfo = {
  /** Public key of the account  */
  key: Pubkey
  /** Was the transaction signed by this account's public key?  */
  is_signer: boolean
  /** Is the account writable? */
  is_writable: boolean
  /** The lamports in the account.  Modifiable by programs. */
  lamports: any // Rc<RefCell<&'a mut u64>>
  /** The data held in this account.  Modifiable by programs. */
  data: any // Rc<RefCell<&'a mut [u8]>>
  /** Program that owns this account */
  owner: Pubkey
  /** This account's data contains a loaded program (and is now read-only) */
  executable: boolean
  /** The epoch at which this account will next owe rent */
  rent_epoch: any
}
