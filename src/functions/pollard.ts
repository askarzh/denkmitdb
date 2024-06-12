import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import * as codec from "@ipld/dag-cbor";

import {
  LeafTypes,
  LeafType,
  PollardType,
  PollardInterface,
  PollardOptions,
  DataTypes,
} from "../interfaces";

export function createLeaf(
  type?: LeafTypes,
  data?: Uint8Array,
  sortFields?: number[]
): LeafType {
  if (!type) {
    type = LeafTypes.Empty;
  }
  if (!data) {
    data = new Uint8Array(0);
  }
  const leaf: LeafType = [type, data];
  if (sortFields) {
    leaf.push(sortFields);
  }
  return leaf;
}

function isLeavesEqual(leaf1: LeafType, leaf2: LeafType): boolean {
  if (leaf1[0] !== leaf2[0]) {
    return false;
  }

  if (leaf1[0] == LeafTypes.Empty) {
    return true;
  }

  if (leaf1[1].length !== leaf2[1].length) {
    return false;
  }

  for (let i = 0; i < leaf1[1].length; i++) {
    if (leaf1[1][i] !== leaf2[1][i]) {
      return false;
    }
  }

  return true;
}

class Pollard implements PollardInterface {
  readonly dataType = DataTypes.Pollard;
  readonly order: number;
  readonly maxLength: number;
  readonly codec;
  private readonly _hashFunc: (data: Uint8Array) => Promise<Uint8Array>;
  private _layers: LeafType[][];
  private _length: number = 0;
  private _needUpdate: boolean = true;
  private _cid: CID | undefined;

  constructor(pollard: Partial<PollardType>, options: PollardOptions = {}) {
    if (!pollard.order) {
      throw new Error("Order is required");
    }
    if (pollard.order <= 0 || pollard.order >= 8) {
      throw new Error("Order must be greater than 0 or less than or equal 8");
    }
    this.order = pollard.order;
    this.maxLength = 2 ** pollard.order;
    this.codec = codec.code;
    this._hashFunc = async (data) => (await sha256.digest(data)).digest;
    this._hashFunc = options.hashFunc || this._hashFunc;

    if (pollard.layers && pollard.length) {
      this._layers = Object.assign(pollard.layers);
      this._length = pollard.length;
      this._needUpdate = false;
    } else {
      this._layers = Array.from({ length: this.order }, (_, i) =>
        Array.from({ length: 2 ** (this.order - i) }, () => createLeaf())
      );
    }

    this._cid = options.cid;
  }

  async append(
    type: LeafTypes,
    data: CID | Uint8Array | string,
    sortFields?: number[]
  ): Promise<boolean> {
    let bytes: Uint8Array;

    if (data instanceof Uint8Array) {
      bytes = data;
    } else if (typeof data === "string") {
      bytes = uint8ArrayFromString(data);
    } else if (data instanceof CID) {
      bytes = data.bytes;
    } else {
      throw new Error("Unsupported type");
    }

    const leaf = createLeaf(type, bytes, sortFields);
    return this.addLeaf(leaf);
  }

  isFree(): boolean {
    return this._length < this.maxLength;
  }

  async addLeaf(leaf: LeafType): Promise<boolean> {
    if (this._length >= this.maxLength) {
      return false;
    }
    this._layers[0][this._length] = Object.assign(leaf);
    this._length++;

    this._needUpdate = true;

    return true;
  }

  get length(): number {
    return this._length;
  }

  async updateLayers(): Promise<CID> {
    for (let i = 0; i < this.order - 1; i++) {
      for (let j = 0; j < 2 ** (this.order - i); j += 2) {
        const hash1 = this._layers[i][j][1];
        const hash2 = this._layers[i][j + 1][1];
        const combined = new Uint8Array(hash1.length + hash2.length);
        combined.set(hash1);
        combined.set(hash2, hash1.length);
        const hash = await this._hashFunc(combined);
        this._layers[i + 1][j / 2] = createLeaf(LeafTypes.Hash, hash);
      }
    }

    this._needUpdate = false;

    const buf = this.encode();
    const hash = await sha256.digest(buf);
    this._cid = CID.createV1(codec.code, hash);

    return this._cid;
  }

  async getNode(layerIndex: number, position: number): Promise<LeafType> {
    if (this._needUpdate) {
      await this.updateLayers();
    }

    if (layerIndex > this.order || position >= 2 ** (this.order - layerIndex)) {
      return createLeaf();
    }

    if (layerIndex === this.order && position === 0) {
      return await this.getRoot();
    }

    return this._layers[layerIndex][position];
  }

  all(): LeafType[] {
    return this._layers[0];
  }

  *iterator(): Generator<LeafType> {
    for (const leaf of this._layers[0]) {
      yield leaf;
    }
  }

  async getRoot(): Promise<LeafType> {
    if (this._needUpdate || !this._cid) {
      this._cid = await this.updateLayers();
    }

    return createLeaf(LeafTypes.Pollard, this._cid.bytes);
  }

  get layers(): LeafType[][] {
    if (this._needUpdate) {
      // throw new Error("Pollard is not updated. Please, use getLayers() method to get layers.");
    }
    return this._layers;
  }

  async getLayers(): Promise<LeafType[][]> {
    if (this._needUpdate) {
      await this.updateLayers();
    }
    return this._layers;
  }

  get cid(): CID {
    if (!this._cid || this._needUpdate) {
      throw new Error("Pollard is not updated");
    }
    return this._cid;
  }

  async getCID(): Promise<CID> {
    if (this._needUpdate || !this._cid) {
      this._cid = await this.updateLayers();
    }

    return this._cid;
  }

  toJSON(): PollardType {
    if (this._needUpdate) {
      throw new Error("Pollard is not updated");
    }
    return {
      dataType: this.dataType,
      order: this.order,
      maxLength: this.maxLength,
      length: this._length,
      layers: this._layers,
    };
  }

  encode(): Uint8Array {
    return codec.encode(this.toJSON());
  }

  get size(): number {
    if (this._needUpdate) {
      return 0;
    }
    return this.layers.reduce(
      (acc, layer) => acc + layer.reduce((acc, u) => acc + u.length, 0),
      0
    );
  }

  private async comparePollardNodesOrdered(
    other: PollardInterface,
    layerIndex: number,
    position: number
  ): Promise<[LeafType[], LeafType[]]> {
    const result: [LeafType[], LeafType[]] = [[], []];
    const leaf1 = await this.getNode(layerIndex, position);
    const leaf2 = await other.getNode(layerIndex, position);
    let next;

    if (isLeavesEqual(leaf1, leaf2)) {
      result[0] = new Array(2 ** layerIndex).fill(createLeaf());
      result[1] = new Array(2 ** layerIndex).fill(createLeaf());
      return result;
    }

    if (layerIndex === 0) {
      result[0][0] = leaf1;
      result[1][0] = leaf2;
      return result;
    }

    const nextPosition = position * 2;

    next = await this.comparePollardNodesOrdered(
      other,
      layerIndex - 1,
      nextPosition
    );

    result[0] = result[0].concat(next[0]);
    result[1] = result[1].concat(next[1]);

    next = await this.comparePollardNodesOrdered(
      other,
      layerIndex - 1,
      nextPosition + 1
    );

    result[0] = result[0].concat(next[0]);
    result[1] = result[1].concat(next[1]);

    return result;
  }

  async compare(
    other?: PollardInterface
  ): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }> {
    if (this.order !== other?.order) {
      throw new Error("Orders are different");
    }

    other = other || new Pollard({ order: this.order });

    const difference = await this.comparePollardNodesOrdered(
      other,
      this.order,
      0
    );

    const isEqual = difference.every((x) =>
      x.every((y) => y[0] === LeafTypes.Empty)
    );

    return { isEqual, difference };
  }
}

function isEqualBytes(bytes1: Uint8Array, bytes2: Uint8Array): boolean {
  if (!bytes1 && !bytes2) {
    return true;
  }

  if (!bytes1 || !bytes2) {
    return false;
  }

  if (bytes1.length !== bytes2.length) {
    return false;
  }

  for (let i = 0; i < bytes1.length; i++) {
    if (bytes1[i] !== bytes2[i]) {
      return false;
    }
  }

  return true;
}

async function comparePollardNodes(
  first: PollardInterface,
  second: PollardInterface,
  layerIndex: number,
  position: number
): Promise<[LeafType[], LeafType[]]> {
  const result: [LeafType[], LeafType[]] = [[], []];
  const leaf1 = await first.getNode(layerIndex, position);
  const leaf2 = await second.getNode(layerIndex, position);
  let next;

  if (!isLeavesEqual(leaf1, leaf2)) {
    if (layerIndex === 0) {
      if (leaf1) {
        result[0].push(leaf1);
      }
      if (leaf2) {
        result[1].push(leaf2);
      }
    } else {
      next = await comparePollardNodes(
        first,
        second,
        layerIndex - 1,
        position * 2
      );

      result[0] = result[0].concat(next[0]);
      result[1] = result[1].concat(next[1]);

      next = await comparePollardNodes(
        first,
        second,
        layerIndex - 1,
        position * 2 + 1
      );

      result[0] = result[0].concat(next[0]);
      result[1] = result[1].concat(next[1]);
    }
  }

  return result;
}

export async function comparePollards(
  first: PollardInterface,
  second: PollardInterface
): Promise<[LeafType[], LeafType[]]> {
  if (first.order !== second.order) {
    throw new Error("Pollards' orders are different");
  }

  return await comparePollardNodes(first, second, first.order, 0);
}

export async function createPollard(
  pollard: Partial<PollardType>,
  options: PollardOptions = {}
): Promise<PollardInterface> {
  const res = new Pollard(pollard, options);
  await res.updateLayers();
  return res;
}

/*
function byteArray2d2Str(
  byteArrays: Array<Array<Uint8Array>>
): Array<Array<string>> {
  return byteArrays.map((r) =>
    r.map((x) => (x ? uint8ArrayToString(x, "hex") : "null"))
  );
}

function byteArray1d2Str(byteArrays: Array<Uint8Array>): Array<string> {
  return byteArrays.map((x) => (x ? uint8ArrayToString(x, "hex") : "null"));
}


const pollard1 = await createPollard(3);

const NL1 = 4;

const elements1 = Array.from({ length: NL1 }, () => faker.hacker.phrase());

for (const e of elements1) {
	const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
	await pollard1.addLeaf(leaf);
}

const pollard2 = await createPollard(3);

const NL2 = 4;

const elements2 = Array.from({ length: NL2 }, () => faker.hacker.phrase());

for (const e of elements1) {
	const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
	await pollard2.addLeaf(leaf);
}

for (const e of elements2) {
	const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
	await pollard2.addLeaf(leaf);
}

const NL3 = 1;
const elements3 = Array.from({ length: NL3 }, () => faker.hacker.phrase());
for (const e of elements3) {
	const leaf = await cidV1sha256Hash(uint8ArrayFromString(e));
	await pollard1.addLeaf(leaf);
}

console.log("Pollard 1 Layers: \n", byteArray2d2Str(await pollard1.getLayers()));

console.log("Pollard 2 Layers: \n", byteArray2d2Str(await pollard2.getLayers()));

const { isEqual, difference: [firstLeaves, secondLeaves] } = await comparePollardsOrdered(pollard1, pollard2);

console.log("Pollards are equal: ", isEqual);
console.log("First Leaves: ", byteArray1d2Str(firstLeaves));
console.log("Second Leaves: ", byteArray1d2Str(secondLeaves));
*/
