import { GossipsubEvents } from "@chainsafe/libp2p-gossipsub";
import { Identify } from "@libp2p/identify";
import { Libp2p, PubSub } from "@libp2p/interface";
import { HeliaLibp2p } from "helia";

export enum DataTypes {
	Entry = 0,
	Pollard = 1,
	Identity = 2,
	Manifest = 3,
	Head = 4
}

export type DataType = {
	dataType: DataTypes;
};

export type CIDstring = string;

export type DenkmitHelia = HeliaLibp2p<Libp2p<{
    identify: Identify;
    pubsub: PubSub<GossipsubEvents>;
}>>