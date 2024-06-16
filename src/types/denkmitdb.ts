import type Keyv from "keyv";
import { CID } from "multiformats/cid";
import { HeliaController } from "src/functions";
import { Optional } from "utility-types";
import { HeadInterface } from "./head";
import { IdentityInterface } from "./identity";
import { ManifestInterface } from "./manifest";
import { LeafType, PollardInterface } from "./pollard";
import { DenkmitHelia } from "./utils";

export const DENKMITDB_PREFIX = "/denkmitdb/";

export type DenkmitDatabaseType = {
	readonly manifest: ManifestInterface;
	readonly pollardOrder: number;
	readonly maxPollardLength: number;
	readonly layers: PollardInterface[][];
	readonly heliaController: HeliaController;
	readonly storage: Keyv;
	readonly id: string;
}

export type DenkmitDatabaseInput = Optional<Omit<DenkmitDatabaseType, "pollardOrder" | "maxPollardLength" | "layers" | "id">, "storage">

export interface DenkmitDatabaseInterface extends DenkmitDatabaseType {
	set(key: string, value: object): Promise<void>;
	get(key: string): Promise<object | undefined>;
	close(): Promise<void>;
	// filter(filter: (kv: [key: string, value: object]) => boolean): Promise<[key: string, value: object][]>;
	// getManifest(): Promise<ManifestType>;
	iterator(): AsyncGenerator<[key: string, value: object]>;

	getManifest(): Promise<ManifestInterface>;

	createHead(): Promise<HeadInterface>;
	getHead(cid: CID): Promise<HeadInterface>;

	load(head: HeadInterface): Promise<void>;
	compare(head: HeadInterface): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }>;
	merge(head: HeadInterface): Promise<void>;
}


export type DenkmitDatabaseOptions = {
	storage?: Keyv;
	ipfs: DenkmitHelia;
	identity: IdentityInterface;
}

export declare function createDenkmitDatabase(name: string, options: DenkmitDatabaseOptions): Promise<DenkmitDatabaseInterface>;
export declare function openDenkmitDatabase(id: string, options: DenkmitDatabaseOptions): Promise<DenkmitDatabaseInterface>;
