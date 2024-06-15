import { CID } from "multiformats/cid";
import { Optional } from "utility-types";

export enum LeafTypes {
    Empty = 0,
    Hash = 1,
    Pollard = 2,
    Entry = 3,
    Identity = 4,
    SortedEntry = 5,
}

export type LeafType = [type: LeafTypes, data: Uint8Array, sortFields?: number[], key?: string];

export type PollardLocation = {
		layerIndex: number;
		position: number;
};

export const POLLARD_VERSION = 1;
export type PollardVersionType = typeof POLLARD_VERSION;

export type PollardType = {
    readonly version: PollardVersionType;
    readonly order: number;
    readonly maxLength: number;
    readonly length: number;
    readonly layers: LeafType[][];
    readonly id: string; // encoded CID to string
};

export type PollardInput = Optional<Omit<PollardType, "version" | "maxLength">, "id">;

export interface PollardInterface extends PollardType {
    append(
        type: LeafTypes,
        data: CID | Uint8Array | string,
        options?: { sortFields?: number[]; key?: string },
    ): Promise<boolean>;

    getCID(): Promise<CID>;
    getRoot(): Promise<LeafType>;
    toJSON(): Omit<PollardType, "id">;
    iterator(): Generator<LeafType>;
    all(): LeafType[];
    isFree(): boolean;

    getNode(layer: number, index: number): Promise<LeafType>;

    compare(other?: PollardInterface): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }>;

    addLeaf(leaf: LeafType): Promise<boolean>;
    getLeaf(index: number): Promise<LeafType>;
    updateLayers(): Promise<CID>;
    getLayers(): Promise<LeafType[][]>;
}

export type PollardNode = PollardLocation & {
    pollard?: PollardInterface;
};

export declare function createEmptyPollard(order: number): Promise<PollardInterface>;


export type PollardOptions = {
    cid?: CID;
    noUpdate?: boolean;
    hashFunc?: (data: Uint8Array) => Promise<Uint8Array>;
};

export declare function createPollard(
    pollard: Partial<PollardType>,
    options?: PollardOptions,
): Promise<PollardInterface>;

export declare function createLeaf(
    type: LeafTypes,
    data: Uint8Array,
    sortFields?: Uint8Array[],
    key?: string,
): LeafType;
