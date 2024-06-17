import { ENTRY_VERSION, EntryInput, EntryInterface, IdentifiableData } from "../types";
import { HeliaController } from ".";


export async function createEntry(
    key: string,
    value: object,
    heliaController: HeliaController,
): Promise<EntryInterface> {
    if (!heliaController.identity) {
        throw new Error("Identity is required to create an entry");
    }
    const entryToSign: EntryInput = {
        version: ENTRY_VERSION,
        timestamp: Date.now(),
        key,
        value,
        creatorId: heliaController.identity.id,
    };

    const dataToSign: IdentifiableData<EntryInput> = {
        data: entryToSign,
        identity: heliaController.identity,
    }

    const cid = await heliaController.addSigned(dataToSign);
    const id = cid.toString();
    return { ...entryToSign, id };
}
