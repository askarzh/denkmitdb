import * as json from "multiformats/codecs/json";

import { ENTRY_VERSION, EntryInput, EntryInterface, IdentityInterface } from "../interfaces";
import { HeliaController } from ".";
import { Helia } from "@helia/interface";
import { base64 } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";
import * as codec from "@ipld/dag-cbor";

export async function createEntry(
    key: string,
    value: object,
    heliaController: HeliaController<EntryInput>,
): Promise<{ cid: CID; entry: EntryInterface }> {
    const entryToSign: EntryInput = {
        version: ENTRY_VERSION,
        timestamp: Date.now(),
        key,
        value,
        creatorId: heliaController.identity.id,
    };

    const cid = await heliaController.addSigned(entryToSign);
    const id = cid.toString(base64.encoder);
    const entry: EntryInterface = { ...entryToSign, id };

    return { cid, entry };
}
