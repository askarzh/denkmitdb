import { CID } from "multiformats/cid";
import { HeliaControllerInterface, OwnedDataType } from "src/types";
import { Optional } from "utility-types";
import { MANIFEST_VERSION, ManifestInput, ManifestInterface, ManifestType } from "../types/manifest";

export class Manifest implements ManifestInterface {
    readonly version = MANIFEST_VERSION;
    readonly name: string;
    readonly type: string;
    readonly pollardOrder: number;
    readonly consensusController: string;
    readonly accessController: string;
    readonly creatorId: string;
    readonly meta?: Record<string, unknown>;
    readonly id: string;

    constructor(manifest: Optional<ManifestType, "version">) {
        this.name = manifest.name;
        this.type = manifest.type;
        this.pollardOrder = manifest.pollardOrder;
        this.consensusController = manifest.consensusController;
        this.accessController = manifest.accessController;
        this.creatorId = manifest.creatorId;
        this.meta = manifest.meta;
        this.id = manifest.id;
    }

    async verify(): Promise<boolean> {
        return true;
    }

    toJSON(): ManifestType {
        return {
            version: this.version,
            name: this.name,
            type: this.type,
            pollardOrder: this.pollardOrder,
            consensusController: this.consensusController,
            accessController: this.accessController,
            creatorId: this.creatorId,
            meta: this.meta,
            id: this.id,
        };
    }
}

export async function createManifest(manifestInput: ManifestInput, heliaController: HeliaControllerInterface): Promise<ManifestInterface> {
    const identity = heliaController.identity;
    const data: ManifestInput = {
        ...manifestInput,
        creatorId: identity.id,
    }

    const dataToSign: OwnedDataType<ManifestInput> = { data, identity }

    const cid = await heliaController.addSigned(dataToSign);
    const id = cid.toString();

    return new Manifest({ ...data, id });
}

export async function fetchManifest(id: string, heliaController: HeliaControllerInterface): Promise<ManifestInterface> {
    const result = await heliaController.getSigned<ManifestInput>(CID.parse(id));
    if (!result || !result.data) throw new Error(`Manifest not found.`);

    return new Manifest({ ...result.data, id });
}
