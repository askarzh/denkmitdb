import * as dagCborCodec from "@ipld/dag-cbor";
import * as Block from "multiformats/block";
import * as codec from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import * as json from "multiformats/codecs/json";
import { sha256 as hasher, sha256 } from "multiformats/hashes/sha2";
import { KeyObject } from "crypto";
import * as jose from "jose";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

let identity = {
  type: 0,
  codec: dagCborCodec.code,
  alg: "ES384",
  publicKey: "",
};

const key = await jose.generateKeyPair("ES384");

const publicKey = await jose.exportSPKI(key.publicKey);

// const publicKey = (key.publicKey as KeyObject).export({ type: "spki", format: "der" }).toString("base64");

identity.publicKey = publicKey;

console.log(identity);
// console.log((key.privateKey as KeyObject).);
console.log(await jose.exportJWK(key.publicKey));

const jws1 = await new jose.FlattenedSign(json.encode(identity))
  .setUnprotectedHeader({
    alg: "ES384",
    // b64: false,
    // crit: ["b64"],
    kid: "undefined",
    jwk: await jose.exportJWK(key.publicKey),
  })
  .sign(key.privateKey);

  // jws1.payload = json.encode(identity);

console.log({ jws1 });

const jws2 = await new jose.FlattenedSign(json.encode(identity))
  .setUnprotectedHeader({
    alg: "ES384",
    // b64: false,
    // crit: ["b64"],
    kid: "undefined",
    jwk: await jose.exportJWK(key.publicKey),
  })
  .sign(key.privateKey);

let block = await Block.encode({
  value: jws1,
  codec: dagCborCodec,
  hasher: sha256,
});

console.log({ jws2 });
process.exit(0);

console.log({ block });

// jws1.payload = json.encode(identity);

const verified1Data = await jose.flattenedVerify(jws1, jose.EmbeddedJWK);
console.log({ verified1Data });

const identity2: typeof identity = json.decode(verified1Data.payload);
console.log(identity2);

const publicKey2 = await jose.importSPKI(identity2.publicKey, identity2.alg);
console.log(publicKey2);
