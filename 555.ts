import * as dagCborCodec from "@ipld/dag-cbor";
import * as json from "multiformats/codecs/json";

let identity = {
  type: 0,
  codec: dagCborCodec.code,
  alg: "ES384",
  publicKey: "",
  ui: new Uint8Array(10),
};

const js1 = json.encode(identity);
console.log(js1);

const dg1 = dagCborCodec.encode(identity);
console.log(dg1);

let a1 = [1, new Uint8Array(10), [1244534543534], null];

let b1 = {
  type: 1,
  data: new Uint8Array(10),
  sortFields: [1244534543534],
  key: null
}

const a11 = dagCborCodec.encode(a1);
const b11 = dagCborCodec.encode(b1);
console.log(a11, b11);