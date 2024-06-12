import { tr } from "@faker-js/faker";
import { OrderedMap } from "js-sdsl";

const tree = new OrderedMap([], (x:number, y:number) => x - y, true);

tree.setElement(40, "four");
tree.setElement(10, "one");
tree.setElement(30, "three");
tree.setElement(50, "five");
const pos = tree.setElement(20, "two");
console.log(pos);
const it = tree.find(20);
console.log(it.index);
tree.setElement(30, "три");

const end = tree.rEnd();
console.log(end.pointer[1]);
for (const it = tree.reverseUpperBound(40); !it.equals(tree.end()); it.next()) {
  console.log(it.pointer[1]);
}

console.log(10%3)