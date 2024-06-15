import { Optional } from "utility-types";
import { MANIFEST_VERSION, ManifestInput, ManifestInterface, ManifestType } from "../types/manifest";
import { HeliaController } from "./utils";
import { CID } from "multiformats/cid";

export class Manifest implements ManifestInterface {
    readonly version = MANIFEST_VERSION;
    readonly name: string;
    readonly type: string;
    readonly pollardOrder: number;
    readonly consensusController: string;
    readonly accessController: string;
    readonly creatorId: string;
    readonly meta?: Record<string, any>;
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

export async function createManifest(manifestInput: ManifestInput, heliaController: HeliaController): Promise<ManifestInterface> {
    const manifestEntry: ManifestInput = {
        ...manifestInput,
        creatorId: heliaController.identity.id,
    }

    const cid = await heliaController.addSigned(manifestEntry);
    const id = cid.toString();

    return new Manifest({ ...manifestEntry, id });
}

export async function openManifest(id: string, heliaController: HeliaController): Promise<ManifestInterface> {
    const manifest = await heliaController.getSigned<ManifestInput>(CID.parse(id));
    if (!manifest) throw new Error(`Manifest not found.`);
 
    return new Manifest({...manifest, id});
}
