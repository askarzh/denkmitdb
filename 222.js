import { CID } from "multiformats/cid";
import * as json from "multiformats/codecs/json";
import { sha256 } from "multiformats/hashes/sha2";
import { identity } from "multiformats/hashes/identity";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { faker } from "@faker-js/faker";

import * as Block from "multiformats/block";
import * as codec from "@ipld/dag-cbor";

import { createHash } from "crypto";
import { code } from "@ipld/dag-cbor";

const value = {
  hello: "world",
  l: [[new Uint8Array(8), 2, 3], [4, 5, 6], [7, 8, 9]],
};

console.log(value);
// encode a block
const block = await Block.encode({ value, codec, hasher: sha256 });

const cid = block.cid
console.log(cid);

const tc = typeof cid;
console.log({ tc });

const cid1 = CID.decode(cid.bytes);
console.log(cid1);
process.exit(0);

/*console.log(block);

const buf = codec.encode(value);
console.log(buf);
const hash = await sha256.digest(buf);
console.log(hash);
const cid = CID.createV1(code, hash);
console.log(cid);

process.exit(0);

const res = await Block.decode({ bytes: block.bytes, codec, hasher: sha256 });
console.log(res.value);
*/