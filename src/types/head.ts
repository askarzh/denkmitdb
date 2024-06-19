import { CID } from 'multiformats/cid';
import { HeliaStorage } from 'src/functions';
import { CidString } from './utils';

export const HEAD_VERSION = 1;
export type HeadVersionType = typeof HEAD_VERSION;

export type HeadType = {
  readonly version: HeadVersionType;
  readonly manifest: CidString;
  readonly root: CidString;
  readonly timestamp: number;
  readonly layersCount: number;
  readonly size: number;
  readonly creatorId: CidString;
  readonly id: CidString;
};

export type HeadInput = Omit<HeadType, "id">;

export interface HeadInterface extends HeadType {
}

export declare function createHead(head: HeadInput, heliaStorage:HeliaStorage): Promise<HeadInterface>;
export declare function getHead(cid: CID, heliaStorage: HeliaStorage): Promise<HeadInterface>;
