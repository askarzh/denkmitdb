import { HeliaStorage } from "src/functions";
import { IdentityInterface } from "./identity";
import { CidString } from "./utils";
import { CID } from "multiformats/cid";

export const ENTRY_VERSION = 1;

export type EntryVersionType = typeof ENTRY_VERSION;

export type EntryType<T> = {
    readonly version: EntryVersionType;
    readonly timestamp: number;
    readonly key: string;
    readonly value: T;
    readonly creatorId: string;
    readonly id: CidString;
};

export type EntryInput<T> = Omit<EntryType<T>, "id">;

export declare function addEntry<T>(key: string, value: T, heliaStorage: HeliaStorage, identity: IdentityInterface): Promise<EntryType<T>>;
export declare function getEntry<T>(cid:CID, heliaStorage: HeliaStorage, identity: IdentityInterface): Promise<EntryType<T>>;