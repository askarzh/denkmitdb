import { DAGCBOR, dagCbor } from "@helia/dag-cbor";
import * as codec from "@ipld/dag-cbor";
import * as jose from "jose";
import { CID } from "multiformats/cid";
import { DenkmitHelia, IdentityInterface } from "src/types";



export class HeliaController {
    readonly ipfs: DenkmitHelia;
    readonly identity: IdentityInterface;
    private heliaDagCbor: DAGCBOR;

    constructor(ipfs: DenkmitHelia, identity: IdentityInterface) {
        this.ipfs = ipfs;
        this.identity = identity;
        this.heliaDagCbor = dagCbor(ipfs);
    }

    async add(obj: unknown | jose.FlattenedJWS): Promise<CID> {
        const cid = await this.heliaDagCbor.add(obj);
        if (!(await this.ipfs.pins.isPinned(cid))) {
            await this.ipfs.pins.add(cid);
        }

        return cid;
    }

    async addSigned(obj: unknown): Promise<CID> {
        const signed = await this.identity.sign(codec.encode(obj));
        return await this.add(signed);
    }

    async get<T>(cid: CID): Promise<T | undefined> {
        return await this.heliaDagCbor.get<T>(cid);
    }

    async getSigned<T>(cid: CID): Promise<T | undefined> {
        const signed = await this.get<jose.FlattenedJWS>(cid);
        if (!signed) return;
        const verified = await this.identity.verify(signed);
        if (!verified) return;
        const decoded = codec.decode(verified) as T;
        return decoded;
    }

    static async addBlock(ipfs: DenkmitHelia, obj: any): Promise<CID> {
        const d = dagCbor(ipfs);
        const cid = await d.add(obj);
        if (!(await ipfs.pins.isPinned(cid))) {
            await ipfs.pins.add(cid);
        }

        return cid;
    }

    static async getBlock<T>(ipfs: DenkmitHelia, cid: CID): Promise<T | undefined> {
        const d = dagCbor(ipfs);
        return await d.get<T>(cid);
    }

    async close(): Promise<void> {
    }
}
