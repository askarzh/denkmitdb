import * as json from "multiformats/codecs/json";

import { ENTRY_VERSION, EntryInput, EntryInterface } from "../types";
import { HeliaController } from ".";
import { base64 } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";

export async function createEntry(
    key: string,
    value: object,
    heliaController: HeliaController,
): Promise<EntryInterface> {
    const entryToSign: EntryInput = {
        version: ENTRY_VERSION,
        timestamp: Date.now(),
        key,
        value,
        creatorId: heliaController.identity.id,
    };

    const cid = await heliaController.addSigned(entryToSign);
    const id = cid.toString();
    return { ...entryToSign, id };
}
