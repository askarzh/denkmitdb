import * as json from "multiformats/codecs/json";

import {
  ENTRY_VERSION,
  EntryInput,
  EntryInterface,
  IdentityInterface,
} from "../interfaces";
import { addBlock } from "./identity";
import { Helia } from "@helia/interface";
import { base64 } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";

export async function createEntry(
  key: string,
  value: object,
  identity: IdentityInterface,
  ipfs: Helia
): Promise<{cid:CID, entry: EntryInterface}> {
  const entryToSign: EntryInput = {
    version: ENTRY_VERSION,
    timestamp: Date.now(),
    key,
    value,
    creatorId: identity.id,
  };

  const jws = await identity.sign(json.encode(entryToSign));
  const cid = await addBlock(jws, ipfs);
  const id = cid.toString(base64.encoder);
  const entry: EntryInterface = { ...entryToSign, id };

  return { cid, entry };
}
