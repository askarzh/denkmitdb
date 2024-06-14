import { CID } from "multiformats/cid";
import type { Helia } from "@helia/interface";
import type Keyv from "keyv";
import { IdentityInterface } from "./identity";
import { ManifestType } from "./manifest";


export type MerkleDatabaseType = {
	version: number;
	pollard: CID;
};

export interface MerkleDatabaseInterface extends MerkleDatabaseType {
	put(key: string, value: object): Promise<CID>;
	get(key: string): Promise<object>;
	close(): Promise<void>;
	filter(filter: (kv: [key: string, value: object]) => boolean): Promise<[key: string, value: object][]>;
	getManifest(): Promise<ManifestType>;
	iterator(): AsyncGenerator<[key: string, value: object]>;
}


export type MerkleDatabaseOptions = {
	database: string;
	storage?: Keyv;
	ipfs: Helia;
	identity: IdentityInterface;
}

export declare function createMerkleDatabase(name: string): Promise<MerkleDatabaseInterface>;
