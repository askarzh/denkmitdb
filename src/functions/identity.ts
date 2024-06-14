import type { Helia } from "@helia/interface";
import * as codec from "@ipld/dag-cbor";
import { Key } from "interface-datastore";
import * as jose from "jose";
import { base64 } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

import {
    DataTypes,
    IdentityInput,
    IdentityInterface,
    IdentityJWS,
    IdentityType,
    IdentityTypes,
    KeyPair,
} from "../interfaces";

import { HeliaController } from "./utils";

const keyPrefix = "/Denkmit/";

class Identity implements IdentityInterface {
    readonly dataType = DataTypes.Identity;
    readonly id: string;
    readonly name: string;
    readonly type: IdentityTypes;
    readonly alg: string;
    readonly publicKey: string;
    private keys: KeyPair;
    private jws: IdentityJWS;
    private ipfs: Helia;

    constructor(identity: IdentityType, jws: IdentityJWS, ipfs:Helia, keys: KeyPair) {
        this.id = identity.id;
        this.name = identity.name;
        this.type = identity.type;
        this.alg = identity.alg;
        this.publicKey = identity.publicKey;
        this.jws = jws;
        this.keys = keys;
        this.ipfs = ipfs;
    }

    toJSON(): IdentityType {
        return {
            dataType: this.dataType,
            id: this.id,
            name: this.name,
            type: this.type,
            alg: this.alg,
            publicKey: this.publicKey,
        };
    }

    async verify(jws: jose.FlattenedJWS): Promise<Uint8Array | undefined> {
        if (!this.keys.publicKey) {
            throw new Error("Public key is not available");
        }

        try {
            const protectedHeader = jose.decodeProtectedHeader(jws);
            const kid = protectedHeader.kid;
            if (!kid) {
                return undefined;
            }
            if(kid === this.id) {
                const result = await jose.flattenedVerify(jws, this.keys.publicKey);
                return result.payload;
            }
            const cid = CID.parse(kid, base64);
            const identity = await getIdentity(cid, this.ipfs);
            const result = await identity.verify(jws);
            return result;
        } catch (error) {
            return undefined;
        }
    }

    async sign(data: Uint8Array): Promise<jose.FlattenedJWS> {
        return await createJWS(data, this.keys, {
            alg: this.alg,
            kid: this.id,
            includeJwk: false,
        });
    }

    async encrypt(data: Uint8Array): Promise<jose.FlattenedJWE> {
        if (!this.keys.publicKey) {
            throw new Error("Public key is not available");
        }
        return await new jose.FlattenedEncrypt(data)
            .setUnprotectedHeader({ alg: "ECDH-ES+A256KW", enc: "A256GCM" })
            .encrypt(this.keys.publicKey);
    }

    async decrypt(jwe: jose.FlattenedJWE): Promise<Uint8Array | boolean> {
        if (!this.keys.privateKey) {
            throw new Error("Private key is not available");
        }

        try {
            const result = await jose.flattenedDecrypt(jwe, this.keys.privateKey);
            return result.plaintext;
        } catch (error) {
            return false;
        }
    }
}

async function exportPrivateKey(keys: KeyPair, passphrase: string): Promise<jose.FlattenedJWE> {
    if (!keys.privateKey) {
        throw new Error("Private key is not available");
    }
    const encryptedPrivateKey = await new jose.FlattenedEncrypt(codec.encode(await jose.exportJWK(keys.privateKey)))
        .setProtectedHeader({ alg: "PBES2-HS256+A128KW", enc: "A128GCM" })
        .encrypt(uint8ArrayFromString(passphrase));

    return encryptedPrivateKey;
}

async function importPrivateKey(
    encryptedPrivateKey: jose.FlattenedJWE,
    passphrase: string,
): Promise<{ keys: KeyPair; publicKey: string }> {
    const result = await jose.flattenedDecrypt(encryptedPrivateKey, uint8ArrayFromString(passphrase), {
        keyManagementAlgorithms: ["PBES2-HS256+A128KW"],
        contentEncryptionAlgorithms: ["A128GCM"],
    });

    const privateJwk = codec.decode(result.plaintext) as jose.JWK;
    const publicJwk = {
        kty: privateJwk.kty,
        x: privateJwk.x,
        y: privateJwk.y,
        crv: privateJwk.crv,
    } as jose.JWK;

    const keys = {
        privateKey: (await jose.importJWK(privateJwk)) as jose.KeyLike,
        publicKey: (await jose.importJWK(publicJwk)) as jose.KeyLike,
    };

    const publicKey = uint8ArrayToString(codec.encode(publicJwk), "base64");

    return { keys, publicKey };
}

async function generateKeyPair(alg: string): Promise<{ keys: KeyPair; publicKey: string }> {
    const keys = await jose.generateKeyPair(alg);

    const publicJwk = await jose.exportJWK(keys.publicKey);
    const publicKey = uint8ArrayToString(codec.encode(publicJwk), "base64");
    return { keys, publicKey };
}

type createJWSOptions = {
    alg: string;
    kid?: string;
    includeJwk?: boolean;
};

async function createJWS(payload: Uint8Array, keys: KeyPair, options?: createJWSOptions): Promise<jose.FlattenedJWS> {
    options = options || { alg: "ES384", includeJwk: false };

    let headers: jose.JWSHeaderParameters = {
        alg: options.alg,
        kid: options.kid,
    };
    if (!keys.privateKey) {
        throw new Error("Private key is not available");
    }
    if (keys.publicKey && options.includeJwk) {
        headers.jwk = await jose.exportJWK(keys.publicKey);
    }

    return await new jose.FlattenedSign(payload).setProtectedHeader(headers).sign(keys.privateKey);
}

export async function getIdentity(cid: CID, ipfs: Helia, keys?: KeyPair): Promise<IdentityInterface> {
    const identityJWS = await HeliaController.getBlock<IdentityJWS>(ipfs, cid);
    if (!identityJWS) throw new Error("Identity not found");

    const verifyResult = await jose.flattenedVerify(identityJWS, jose.EmbeddedJWK);
    const identityInput: IdentityInput = codec.decode(verifyResult.payload);
    const id = cid.toString(base64.encoder);
    const identity: IdentityType = { ...identityInput, id };

    const publicJwk = codec.decode(uint8ArrayFromString(identity.publicKey, "base64"));
    const publicKey = (await jose.importJWK(publicJwk as jose.JWK)) as jose.KeyLike;

    return new Identity(identity, identityJWS, ipfs, { ...keys, publicKey });
}

type IdentityDatastore = {
    cid: string;
    encryptedPrivateKey: jose.FlattenedJWE;
};

type IdentityConfig = {
    ipfs: Helia;
    alg?: string;
    name?: string;
    passphrase?: string;
};

export async function createIdentity({ ipfs, alg, name, passphrase }: IdentityConfig): Promise<IdentityInterface> {
    (alg = alg || "ES384"), (name = name || "default"), (passphrase = passphrase || "password");

    const key = new Key(`${keyPrefix}/${name}`);

    if (await ipfs.datastore.has(key)) {
        const data = await ipfs.datastore.get(key);

        const { cid, encryptedPrivateKey } = codec.decode(data) as IdentityDatastore;

        const importedKeys = await importPrivateKey(encryptedPrivateKey, passphrase);

        return await getIdentity(CID.parse(cid), ipfs, importedKeys.keys);
    }

    const { keys, publicKey } = await generateKeyPair(alg);

    const encryptedPrivateKey = await exportPrivateKey(keys, passphrase);

    const identityToSign: IdentityInput = {
        dataType: DataTypes.Identity,
        name,
        type: IdentityTypes.publicKey,
        alg,
        publicKey,
    };

    const identityJWS = await createJWS(codec.encode(identityToSign), keys, { alg, includeJwk: true });

    const cid = await HeliaController.addBlock(ipfs, identityJWS);
    const id = cid.toString();
    const identity: IdentityType = { ...identityToSign, id };

    const identityDatastore: IdentityDatastore = {
        cid: cid.toString(),
        encryptedPrivateKey,
    };

    await ipfs.datastore.put(key, codec.encode(identityDatastore));

    return new Identity(identity, identityJWS, ipfs, keys);
}
