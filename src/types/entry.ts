import { CID } from "multiformats/cid";

import { HeliaController } from "src/functions";

export const ENTRY_VERSION = 1;

export type EntryVersionType = typeof ENTRY_VERSION;

export type EntryType = {
    readonly version: EntryVersionType;
    readonly timestamp: number;
    readonly key: string;
    readonly value: object;
    readonly creatorId: string;
    readonly id: string; // encoded CID to string
};

export type EntryInput = Omit<EntryType, "id">;

export interface EntryInterface extends EntryType {}

export declare function createEntry(
    key: string,
    value: object,
    heliaController: HeliaController,
): Promise<EntryInterface>;
