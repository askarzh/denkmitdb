import { CID } from "multiformats/cid";
import { DataType } from ".";

export enum LeafTypes {
	Empty = 0,
	Hash = 1,
	Pollard = 2,
	Entry = 3,
	Identity = 4,
	SortedEntry = 5,
}

export type LeafType = [type: LeafTypes, data: Uint8Array, sortFields?: number[]];

export type PollardType = DataType & {
	readonly order: number;
	readonly maxLength: number;
	readonly length: number;
	readonly layers: LeafType[][];
};

export interface PollardInterface extends PollardType {
	append(type: LeafTypes, data: CID | Uint8Array | string, sortFields?: number[]): Promise<boolean>;

	getCID(): Promise<CID>;
	getRoot(): Promise<LeafType>;
	toJSON(): PollardType;
	iterator(): Generator<LeafType>;
	all(): LeafType[];
	isFree(): boolean;

	getNode(layer: number, index: number): Promise<LeafType>;

	compare(other?: PollardInterface): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }>;

	addLeaf(leaf: LeafType): Promise<boolean>;
	updateLayers(): Promise<CID>;
	getLayers(): Promise<LeafType[][]>;
}

export type PollardNode = {
	layerIndex: number;
	position: number;
	pollard?: PollardInterface;
};

export type PollardOptions = {
	cid?: CID;
	noUpdate?: boolean;
	hashFunc?: (data: Uint8Array) => Promise<Uint8Array>;
};

export declare function createPollard(
	pollard: Partial<PollardType>,
	options?: PollardOptions,
): Promise<PollardInterface>;

export declare function createLeaf(type: LeafTypes, data: Uint8Array, sortFields?: Uint8Array[]): LeafType;
