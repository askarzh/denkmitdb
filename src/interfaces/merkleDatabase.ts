import { CID } from "multiformats/cid";
import * as Block from 'multiformats/block'
import type { BlockView } from "multiformats";
import type { Helia } from "@helia/interface";
import * as jose from "jose";
import { Optional, Required } from "utility-types";
import { EntryInterface } from ".";

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

export type ManifestType = DataType &{
  version: ManifestVersionType;
  database: string;
  type: string;
  consensusController: string;
  accessController: string;
  identity: string;
  signature: string;
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

export declare function createMerkleDatabase(
  name: string
): Promise<MerkleDatabaseInterface>;
