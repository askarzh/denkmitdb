import { ENTRY_VERSION, EntryInput, EntryType, HeliaControllerInterface, OwnedDataType } from "../types";
import { CID } from "multiformats/cid";


export async function createEntry<T>(key: string, value: T, heliaController: HeliaControllerInterface): Promise<EntryType<T>> {
    const identity = heliaController.identity;
    const data: EntryInput<T> = {
        version: ENTRY_VERSION,
        timestamp: Date.now(),
        key,
        value,
        creatorId: identity.id,
    };

    const dataToSign: OwnedDataType<EntryInput<T>> = { data, identity }

    const cid = await heliaController.addSigned(dataToSign);
    const id = cid.toString();
    return { ...data, id };
}

export async function fetchEntry<T>(cid: CID, heliaController: HeliaControllerInterface): Promise<EntryType<T>> {
    const entry = await heliaController.getSigned<EntryInput<T>>(cid);
    if (!entry) throw new Error("Entry not found");
    if (!entry.data) throw new Error("Entry data not found");

    return { ...entry.data, id: cid.toString() };
}
