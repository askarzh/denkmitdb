import { Key } from "interface-datastore";
import * as jose from "jose";
import { CID } from "multiformats/cid";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

import {
    CidString,
    IDENTITY_VERSION,
    IdentityAlgorithms,
    IdentityConfig,
    IdentityInput,
    IdentityInterface,
    IdentityJWS,
    IdentityType,
    IdentityTypes,
    KeyPair
} from "../types";

import { Optional } from "utility-types";
import {  HeliaStorage } from "./utils/helia";

const keyPrefix = "/Denkmit/";

class Identity implements IdentityInterface {
    readonly version = IDENTITY_VERSION;
    readonly id: CidString;
    readonly name: string;
    readonly type: IdentityTypes;
    readonly alg: IdentityAlgorithms;
    readonly publicKey: string;
    private keys: KeyPair;

    constructor(identity: Optional<IdentityType, "version">, keys?: KeyPair) {
        this.id = identity.id;
        this.name = identity.name;
        this.type = identity.type;
        this.alg = identity.alg;
        this.publicKey = identity.publicKey;
        this.keys = keys || {};
    }

    toJSON(): IdentityType {
        return {
            version: this.version,
            name: this.name,
            type: this.type,
            alg: this.alg,
            publicKey: this.publicKey,
            id: this.id,
        };
    }

    private async getPublicKeyLike(): Promise<jose.KeyLike> {
        if (this.keys.publicKey) return this.keys.publicKey;

        const publicJwk = HeliaStorage.decode<jose.JWK>(uint8ArrayFromString(this.publicKey, "base64"));
        const pk = await jose.importJWK(publicJwk);
        if (pk instanceof Uint8Array) throw new Error("Public key is not available");
        this.keys.publicKey = pk;

        return this.keys.publicKey;
    }

    async verify(jws: jose.FlattenedJWS): Promise<Uint8Array | undefined> {
        const protectedHeader = jose.decodeProtectedHeader(jws);
        const kid = protectedHeader.kid;

        if (!kid) throw new Error("Key ID not found in JWS header");
        if (kid !== this.id) throw new Error("Key ID does not match identity ID");

        const pk = await this.getPublicKeyLike();

        try {
            const result = await jose.flattenedVerify(jws, pk);

            return result.payload;
        } catch (error) {
            return undefined;
        }
    }

    async sign(data: Uint8Array): Promise<jose.FlattenedJWS> {
        if (!this.keys.privateKey) throw new Error("Private key is not available");

        return await createJWS(data, this.keys, { alg: this.alg, kid: this.id, includeJwk: false });
    }

    async encrypt(data: Uint8Array): Promise<jose.FlattenedJWE> {
        const pk = await this.getPublicKeyLike();

        return await new jose.FlattenedEncrypt(data)
            .setProtectedHeader({ alg: "ECDH-ES+A256KW", kid: this.id, enc: "A256GCM" })
            .encrypt(pk);
    }

    async decrypt(jwe: jose.FlattenedJWE): Promise<Uint8Array | boolean> {
        if (!this.keys.privateKey) throw new Error("Private key is not available");

        try {
            const result = await jose.flattenedDecrypt(jwe, this.keys.privateKey);
            return result.plaintext;
        } catch (error) {
            return false;
        }
    }
}

async function exportPrivateKey(keys: KeyPair, passphrase: string): Promise<jose.FlattenedJWE> {
    if (!keys.privateKey) throw new Error("Private key is not available");

    const jwk = await jose.exportJWK(keys.privateKey);
    const encryptedPrivateKey = await new jose.FlattenedEncrypt(HeliaStorage.encode(jwk))
        .setProtectedHeader({ alg: "PBES2-HS256+A128KW", enc: "A128GCM" })
        .encrypt(uint8ArrayFromString(passphrase));

    return encryptedPrivateKey;
}

async function importPrivateKey(encryptedPrivateKey: jose.FlattenedJWE, passphrase: string): Promise<KeyPair> {
    const result = await jose.flattenedDecrypt(encryptedPrivateKey, uint8ArrayFromString(passphrase), {
        keyManagementAlgorithms: ["PBES2-HS256+A128KW"],
        contentEncryptionAlgorithms: ["A128GCM"],
    });

    const privateJwk = HeliaStorage.decode<jose.JWK>(result.plaintext);
    const privateKey = await jose.importJWK(privateJwk);
    if (privateKey instanceof Uint8Array) throw new Error("Cannot import private key");

    return { privateKey };
}

async function encodePublicKey(publicKey: jose.KeyLike): Promise<string> {
    const publicJwk = await jose.exportJWK(publicKey);
    return uint8ArrayToString(HeliaStorage.encode(publicJwk), "base64");
}

type createJWSOptions = {
    alg: string;
    kid?: string;
    includeJwk?: boolean;
};

async function createJWS(payload: Uint8Array, keys: KeyPair, options?: createJWSOptions): Promise<jose.FlattenedJWS> {
    options = options || { alg: "ES384", includeJwk: false };

    const headers: jose.JWSHeaderParameters = {
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

export async function fetchIdentity(cid: CID | CidString, heliaStorage: HeliaStorage, keys?: KeyPair): Promise<IdentityInterface> {
    cid = cid instanceof CID ? cid : CID.parse(cid);

    const identityJWS = await heliaStorage.get<IdentityJWS>(cid);
    if (!identityJWS) throw new Error("Identity not found");

    const verifyResult = await jose.flattenedVerify(identityJWS, jose.EmbeddedJWK);
    const identityInput: IdentityInput = HeliaStorage.decode(verifyResult.payload);
    const id = cid.toString();
    const identity: IdentityType = { ...identityInput, id };

    return new Identity(identity, keys);
}

type IdentityDatastore = {
    id: CidString;
    encryptedPrivateKey: jose.FlattenedJWE;
};

export async function createIdentity(config: IdentityConfig): Promise<IdentityInterface> {
    const alg = config.alg || "ES384";
    const name = config.name || "default";
    const passphrase = config.passphrase || "password";
    const key = new Key(`${keyPrefix}/${name}`);

    const heliaStorage = new HeliaStorage(config.helia);

    if (await heliaStorage.datastore.has(key)) {
        const data = await heliaStorage.datastore.get(key);
        const { id, encryptedPrivateKey } = HeliaStorage.decode<IdentityDatastore>(data);
        const keys = await importPrivateKey(encryptedPrivateKey, passphrase);

        return await fetchIdentity(CID.parse(id), heliaStorage, keys);
    } else {
        const keys = await jose.generateKeyPair(alg);
        const encryptedPrivateKey = await exportPrivateKey(keys, passphrase);
        const publicKey = await encodePublicKey(keys.publicKey);
        const identityToSign: IdentityInput = {
            version: IDENTITY_VERSION,
            name,
            type: IdentityTypes.publicKey,
            alg,
            publicKey,
        };

        const identityJWS = await createJWS(HeliaStorage.encode(identityToSign), keys, { alg, includeJwk: true });
        const cid = await heliaStorage.add(identityJWS);
        const id = cid.toString();
        const identity: IdentityType = { ...identityToSign, id };
        const identityDatastore: IdentityDatastore = {
            id,
            encryptedPrivateKey,
        };

        await heliaStorage.datastore.put(key, HeliaStorage.encode(identityDatastore));

        return new Identity(identity, keys);
    }
}
