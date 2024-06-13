import { CID } from "multiformats/cid";
import * as codec from "@ipld/dag-cbor";
import * as jose from "jose";
import type { Helia } from "@helia/interface";
import { DAGCBOR, dagCbor } from "@helia/dag-cbor";
import { IdentityInterface } from "src/interfaces";

export class HeliaController<T> {
    private ipfs: Helia;
    readonly identity: IdentityInterface;
    private heilaDagCbor: DAGCBOR;

    constructor(ipfs: Helia, identity: IdentityInterface) {
        this.ipfs = ipfs;
        this.identity = identity;
        this.heilaDagCbor = dagCbor(ipfs);
    }

    async add(obj: T | jose.FlattenedJWS): Promise<CID> {
        const cid = await this.heilaDagCbor.add(obj);
        if (!(await this.ipfs.pins.isPinned(cid))) {
            await this.ipfs.pins.add(cid);
        }

        return cid;
    }

    async addSigned(obj: T): Promise<CID> {
        const signed = await this.identity.sign(codec.encode(obj));
        return await this.add(signed);
    }

    async get<T>(cid: CID): Promise<T | undefined> {
        return await this.heilaDagCbor.get<T>(cid);
    }

    async getSigned<T>(cid: CID): Promise<T | undefined> {
        const signed = await this.get<jose.FlattenedJWS>(cid);
        if (!signed) return;
        const verified = await this.identity.verify(signed);
        if (!verified) return;
        const decoded = codec.decode(verified) as T;
        return decoded;
    }

    static async addBlock(ipfs: Helia, obj: any): Promise<CID> {
        const d = dagCbor(ipfs);
        const cid = await d.add(obj);
        if (!(await ipfs.pins.isPinned(cid))) {
            await ipfs.pins.add(cid);
        }

        return cid;
    }

    static async getBlock<T>(ipfs: Helia, cid: CID): Promise<T | undefined> {
        const d = dagCbor(ipfs);
        return await d.get<T>(cid);
    }
}
