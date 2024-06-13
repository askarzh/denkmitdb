import { CID } from 'multiformats/cid';

export type HeadDatabaseType = {
  version: number;
  manifest: CID;
  root: CID;
  timestamp: number;
  creatorId: string;
  layersCount: number;
  size: number;
};
