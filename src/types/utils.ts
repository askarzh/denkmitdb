import { GossipsubEvents } from "@chainsafe/libp2p-gossipsub";
import { Identify } from "@libp2p/identify";
import { Libp2p, PubSub } from "@libp2p/interface";
import { HeliaLibp2p } from "helia";
import { IdentityInterface } from "./identity";

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

export type CidString = string;

export type DenkmitHeliaInterface = HeliaLibp2p<Libp2p<{
    identify: Identify;
    pubsub: PubSub<GossipsubEvents>;
}>>


export type IdentifiableData<T> = {
    data?: T;
    identity?: IdentityInterface;
};