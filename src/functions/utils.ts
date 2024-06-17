import { DAGCBOR, dagCbor } from "@helia/dag-cbor";
import * as codec from "@ipld/dag-cbor";
import * as jose from "jose";
import { CID } from "multiformats/cid";
import { DenkmitHeliaInterface, IdentifiableData, IdentityInterface } from "src/types";
import { fetchIdentity } from "./identity";
import drain from "it-drain";
import { TimeoutController } from "timeout-abort-controller";


const DefaultTimeout = 30000 // 30 seconds


/**
 * Represents a controller for interacting with the Helia database.
 */
export class HeliaController {
    readonly helia: DenkmitHeliaInterface;
    readonly identity?: IdentityInterface;
    private heliaDagCbor: DAGCBOR;

    /**
     * Creates a new instance of the HeliaController class.
     * @param helia The Helia database interface.
     * @param identity The identity interface for signing and verifying data.
     */
    constructor(helia: DenkmitHeliaInterface, identity?: IdentityInterface) {
        this.helia = helia;
        this.identity = identity;
        this.heliaDagCbor = dagCbor(helia);
    }

    /**
     * Adds an object to the Helia database.
     * @param obj The object to add.
     * @returns A Promise that resolves to the CID of the added object.
     */
    async add(data: unknown): Promise<CID> {
        const { signal } = new TimeoutController(DefaultTimeout)
        const cid = await this.heliaDagCbor.add(data, { signal });
        if (!(await this.helia.pins.isPinned(cid))) {
            await drain(this.helia.pins.add(cid));
        }

        return cid;
    }

    /**
     * Retrieves an object from the Helia database.
     * @param cid The CID of the object to retrieve.
     * @returns A Promise that resolves to the retrieved object, or undefined if not found.
     */
    async get<T>(cid: CID): Promise<T | undefined> {
        const { signal } = new TimeoutController(DefaultTimeout)
        return await this.heliaDagCbor.get<T>(cid, { signal });
    }

    async addSigned<T>(data: IdentifiableData<T>): Promise<CID> {
        if (!data.identity) throw new Error("Identity is required to sign data.");
        const signed = await data.identity.sign(codec.encode(data.data));
        return await this.add(signed);
    }

    async getSigned<T>(cid: CID, identity?:IdentityInterface): Promise<IdentifiableData<T> | undefined> {
        const signed = await this.get<jose.FlattenedJWS>(cid);
        if (!signed) return;

        const protectedHeader = jose.decodeProtectedHeader(signed);
        const kid = protectedHeader.kid;
        if (!kid) return;

        identity = identity || await fetchIdentity(CID.parse(kid), this);
        if (!identity) return;

        const verified = await identity.verify(signed);
        const data = verified && codec.decode(verified) as T;
        return { identity, data };
    }

    /*
        async addSigned(obj: unknown): Promise<CID> {
            if (!this.identity) throw new Error("Identity is required to sign data.");
            const signed = await this.identity.sign(codec.encode(obj));
            return await this.add(signed);
        }
    
     
        async getSigned<T>(cid: CID): Promise<{ identity: IdentityInterface, decoded: T | undefined } | undefined> {
            const signed = await this.get<jose.FlattenedJWS>(cid);
            if (!signed) return;
    
            const protectedHeader = jose.decodeProtectedHeader(signed);
            const kid = protectedHeader.kid;
            if (!kid) return;
    
            let identity = this.identity;
            if (identity && kid !== identity.id)
                identity = await fetchIdentity(CID.parse(kid), this);
            if (!identity) return;
    
            const verified = await identity.verify(signed);
            const decoded = verified && codec.decode(verified) as T;
            return { identity, decoded };
        }
    */

    /**
     * Closes the HeliaController instance.
     * @returns A Promise that resolves when the controller is closed.
     */
    async close(): Promise<void> {
        // Implementation for closing the controller
    }
}

/**
 * Creates a new instance of the HeliaController class.
 * @param helia The Helia database interface.
 * @param identity The identity interface for signing and verifying data.
 * @returns A Promise that resolves to a new HeliaController instance.
 */
export async function createHeliaController(helia: DenkmitHeliaInterface, identity: IdentityInterface): Promise<HeliaController> {
    return new HeliaController(helia, identity);
}