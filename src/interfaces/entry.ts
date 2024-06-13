import { CID } from "multiformats/cid";
import { Helia } from "@helia/interface";

import { IdentityInterface } from ".";
import { HeliaController } from "src/functions";

export const ENTRY_VERSION = 1;

export type EntryVersionType = typeof ENTRY_VERSION;

export type idCID = {
    id: string; // encoded CID to string
};

export type EntryInput = { // TODO: Rename it to something more descriptive
    version: EntryVersionType;
    timestamp: number;
    key: string;
    value: object;
    creatorId: string;
};

export type EntryType = idCID & EntryInput;

export interface EntryInterface extends EntryType {}

export declare function createEntry(
    key: string,
    value: object,
    heliaController: HeliaController<EntryInput>,
): Promise<{ cid: CID; entry: EntryInterface }>;
