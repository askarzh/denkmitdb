import { CID } from "multiformats/cid";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";

import { faker } from "@faker-js/faker";

import { PollardInterface, LeafType, createPollard, comparePollardsOrdered, cidV1sha256Hash } from "./pollard.js";

export type MerkleDatabaseType = {
    version: number;
}

export interface MerkleDatabaseInterface extends MerkleDatabaseType {
    addLeaf(leaf: Uint8Array): Promise<void>;
    getRoot(): Promise<PollardInterface>;
    updateLayers(): Promise<void>;
    length: number;
    layerCount: number;
    layers: Array<PollardInterface>[];
    getLayers(): Promise<PollardInterface[][]>;
    getPollard(layerIndex: number, position: number): Promise<PollardInterface | undefined>;
    size: number;
}

export class MerkleDatabase implements MerkleDatabaseInterface {
    readonly version: number = 1;
    private readonly pollardOrder: number = 3;
    readonly layers: Array<PollardInterface>[] = [[]];
    private _needUpdate: boolean = true;

    constructor() {
    }

    async addLeaf(leaf: LeafType): Promise<void> {
        await this.addLeafToLayer(leaf, 0);
        this._needUpdate = true;
    }

    *iterator(): Generator<LeafType> {
        for (const pollard of this.layers[0]) {
            for (const leaf of pollard.iterator()) {
                yield leaf;
            }
        }
    }

    private async addLeafToLayer(leaf: Uint8Array, layerNumber: number): Promise<void> {
        if (this.layers.length <= layerNumber) {
            this.layers.push([]);
        }

        const leavesLayer = this.layers[layerNumber];
        let pollard: PollardInterface;

        if (leavesLayer.length === 0 || !leavesLayer[leavesLayer.length - 1].isFree()) {
            pollard = await createPollard(this.pollardOrder);
            leavesLayer.push(pollard);
        } else {
            pollard = leavesLayer[leavesLayer.length - 1];
        }

        await pollard.addLeaf(leaf);
    }

    get length(): number {
        return this.layers[0].reduce((acc, pollard) => acc + pollard.length, 0);
    }

    async updateLayers() {
        for (let i = 0; this.layers[i].length > 1; i++) {
            for (const pollard of this.layers[i]) {
                await this.addLeafToLayer((await pollard.getCID()).bytes, i + 1);
            }
        }

        this._needUpdate = false;
    }

    async getRoot(): Promise<PollardInterface> {
        if (this._needUpdate) {
            await this.updateLayers();
        }
        return this.layers[this.layers.length - 1][0];
    }

    async getCID(): Promise<CID> {
        const root = await this.getRoot();
        return root.getCID();
    }

    async getLayers(): Promise<PollardInterface[][]> {
        if (this._needUpdate) {
            await this.updateLayers();
        }
        return this.layers;
    }

    async getLayersCID(): Promise<CID[][]> {
        if (this._needUpdate) {
            await this.updateLayers();
        }
        return Promise.all(this.layers.map(async (pollards) => Promise.all(pollards.map(async (pollard) => pollard.getCID()))));
    }

    get layerCount(): number {
        return this.layers.length;
    }

    async getPollard(layerIndex: number, position: number): Promise<PollardInterface | undefined> {
        if (this._needUpdate) {
            await this.updateLayers();
        }
        if (this.layers.length <= layerIndex || this.layers[layerIndex].length <= position) {
            return undefined;
        }
        return this.layers[layerIndex][position];
    }

    get size(): number {
        return this.layers.reduce((acc, layer) => acc + layer.reduce((acc, pollard) => acc + pollard.size, 0), 0);
    }
}

async function compareMerkleDatabaseNodes(first: MerkleDatabaseInterface, second: MerkleDatabaseInterface, layerIndex: number, position: number): Promise<[Array<LeafType>, Array<LeafType>]> {
    const result: [LeafType[], LeafType[]] = [[], []];
    const firstPollard = await first.getPollard(layerIndex, position);
    const secondPollard = await second.getPollard(layerIndex, position);

    if (!firstPollard && !secondPollard) {
        return result;
    }

    const comp = await comparePollardsOrdered(firstPollard, secondPollard);

    if (comp.isEqual) {
        return result;
    }

    if (layerIndex === 0) {
        result[0] = result[0].concat(comp.difference[0]);
        result[1] = result[1].concat(comp.difference[1]);
        return result;
    }

    const maxPollardLength = Math.max(firstPollard?.maxLength || 0, secondPollard?.maxLength || 0);

    for (let i = 0; i < maxPollardLength; i++) {
        const next = await compareMerkleDatabaseNodes(first, second, layerIndex - 1, position * maxPollardLength + i);
        result[0] = result[0].concat(next[0]);
        result[1] = result[1].concat(next[1]);
    }

    return result;
}


export async function compareMerkleDatabases(first: MerkleDatabaseInterface, second: MerkleDatabaseInterface): Promise<{ isEqual: boolean, difference: [LeafType[], LeafType[]] }> {
    const order = Math.max(first.layerCount, second.layerCount) - 1;

    const difference = await compareMerkleDatabaseNodes(first, second, order, 0);

    difference[0] = difference[0].filter((x) => x.length > 0);
    difference[1] = difference[1].filter((x) => x.length > 0);

    const isEqual = difference.every((x) => x.every((y) => y.length === 0));

    return { isEqual, difference };
}

const md1 = new MerkleDatabase();

const NL1 = 1000000;

const elements1 = Array.from({ length: NL1 }, () => faker.hacker.phrase());

for (const e of elements1) {
    const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
    await md1.addLeaf(leaf);
}

console.time("Execution Time 1 MerkleDatabase");

await md1.updateLayers();

const pollard1 = await md1.getRoot();

console.log("1 MerkleDatabase Length: ", md1.length);
console.log("1 MerkleDatabase Number of Layers: ", md1.layerCount);
console.log("1 MerkleDatabase Size: ", md1.size);
console.log("1 Pollard Order: ", pollard1.order);
console.log("1 Pollard Max Length: ", pollard1.maxLength);
console.log("1 Pollard CID: ", await pollard1.getCID());

console.timeEnd("Execution Time 1 MerkleDatabase");


console.log("\n");

const md2 = new MerkleDatabase();

const NL2 = 500000;

const elements2 = Array.from({ length: NL2 }, () => faker.hacker.phrase());

for (const e of elements1) {
    const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
    await md2.addLeaf(leaf);
}

for (const e of elements2) {
    const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
    await md2.addLeaf(leaf);
}

console.time("Execution Time 2 MerkleDatabase");

await md2.updateLayers();

const pollard2 = await md2.getRoot();

console.log("2 MerkleDatabase Length: ", md2.length);
console.log("2 MerkleDatabase Number of Layers: ", md2.layerCount);
console.log("2 MerkleDatabase Size: ", md2.size);
console.log("2 Pollard Order: ", pollard2.order);
console.log("2 Pollard Max Length: ", pollard2.maxLength);
console.log("2 Pollard CID: ", await pollard2.getCID());

console.timeEnd("Execution Time 2 MerkleDatabase");

console.log("\n");

console.time("Execution Time MerkleDatabase Comparison");

const { isEqual, difference: [firstLeaves, secondLeaves] } = await compareMerkleDatabases(md1, md2);
console.log("MerkleDatabases are equal: ", isEqual);
console.log("First Leaves: ", firstLeaves.length);
console.log("Second Leaves: ", secondLeaves.length);
console.timeEnd("Execution Time MerkleDatabase Comparison");
