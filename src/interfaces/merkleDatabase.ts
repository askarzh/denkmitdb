import { CID } from "multiformats/cid";
import type { Helia } from "@helia/interface";
import type Keyv from "keyv";
import { IdentityInterface } from "./identity";

const MANIFEST_VERSION = 1;
export type ManifestVersionType = typeof MANIFEST_VERSION;

export enum DataTypes {
	Entry = 0,
	Pollard = 1,
	Identity = 2,
	Manifest = 3,
	Head = 4,
}

export type DataType = {
	dataType: DataTypes;
};

export type ManifestType = DataType & {
	version: ManifestVersionType;
	database: string;
	type: string;
	consensusController: string;
	accessController: string;
	creatorId: string;
};

export interface ManifestInterface extends ManifestType {
	verify(): Promise<boolean>;
}

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
