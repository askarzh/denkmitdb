import { CID } from 'multiformats/cid';
import { HeliaController } from 'src/functions';

export const HEAD_VERSION = 1;
export type HeadVersionType = typeof HEAD_VERSION;

export type HeadType = {
  readonly version: HeadVersionType;
  readonly manifest: string; // encoded CID to string
  readonly root: string; // encoded CID to string
  readonly timestamp: number;
  readonly layersCount: number;
  readonly size: number;
  readonly creatorId: string; // encoded CID to string
  readonly id: string; // encoded CID to string
};

export type HeadInput = Omit<HeadType, "id">;

export interface HeadInterface extends HeadType {
}

export declare function createHead(head: HeadInput, heliaController:HeliaController): Promise<HeadInterface>;
export declare function getHead(cid: CID, heliaController: HeliaController): Promise<HeadInterface>;
