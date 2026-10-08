import { expect, test } from "bun:test";
import { patchFilters } from "./filter-patch.js";

/** A small SVG tree double: counts parsing and attribute writes without a browser. */
class Svg {
  values = new Map<string, string>();
  children: Svg[] = [];
  parent?: Svg;
  writes: string[] = [];
  constructor(readonly tagName: string, readonly ownerDocument: Doc) {}
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value: string) { this.setAttribute("id", value); }
  get attributes() { return [...this.values].map(([name, value]) => ({ name, value })); }
  get firstElementChild() { return this.children[0]; }
  getAttribute(name: string) { return this.values.get(name) ?? null; }
  hasAttribute(name: string) { return this.values.has(name); }
  setAttribute(name: string, value: string) { this.values.set(name, value); this.writes.push(name); }
  removeAttribute(name: string) { this.values.delete(name); }
  append(child: Svg) { child.remove(); child.parent = this; this.children.push(child); }
  insertBefore(child: Svg, next: Svg | null) {
    child.remove(); child.parent = this;
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, child);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
  closest() { return null; } // Image settling belongs to the browser integration.
  querySelectorAll(selector: string): Svg[] {
    return this.children.flatMap((child) => [
      ...(selector === "*" || selector === "[data-map]" && child.hasAttribute("data-map") ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}
class Doc {
  parses = 0;
  createElement() {
    const content = new Svg("fragment", this), template = { content };
    Object.defineProperty(template, "innerHTML", { set: (text: string) => {
      this.parses++;
      const stack = [content];
      for (const [tag, closing, name, attributes] of text.matchAll(/<(\/)?([\w:-]+)\b([^>]*)>/g)) {
        if (closing) { stack.pop(); continue; }
        const element = new Svg(name!, this);
        for (const [, key, value] of attributes!.matchAll(/([\w:-]+)="([^"]*)"/g)) element.values.set(key!, value!);
        stack.at(-1)!.append(element);
        if (!tag.endsWith("/>")) stack.push(element);
      }
    } });
    return template;
  }
  importNode(source: Svg, deep: boolean): Svg {
    const copy = new Svg(source.tagName, this);
    copy.values = new Map(source.values);
    if (deep) for (const child of source.children) copy.append(this.importNode(child, true));
    return copy;
  }
}
const markup = (x: number, token = "a", extra = "") => `<filter id="scene" x="0" y="0" width="1" height="1"><feImage data-map="${token}" x="${x}" y="0" width="10" height="10" result="map"/><feComponentTransfer in="map" result="mask"><feFuncA type="linear" slope="1"/></feComponentTransfer>${extra}</filter>`;

test("motion updates retained SVG attributes without parsing or relinking static images", () => {
  const doc = new Doc(), defs = new Svg("defs", doc);
  let links = 0;
  const resolve = (token: string) => { links++; return `pixels-${token}`; };
  const apply = (text: string) => patchFilters(defs as unknown as Element, [text], resolve)("scene");
  const id = apply(markup(0)), image = defs.children[0]!.children[0]!;
  image.writes = [];
  for (let x = 1; x <= 60; x++) expect(apply(markup(x))).toBe(id);
  expect(doc.parses).toBe(1);
  expect(links).toBe(1);
  expect(image.writes).toEqual(Array(60).fill("x"));
  expect(image.getAttribute("x")).toBe("60");
  expect(image.getAttribute("href")).toBe("pixels-a");
  apply(markup(60));
  expect(image.writes).toHaveLength(60);
  apply(markup(60, "b"));
  expect(doc.parses).toBe(1);
  expect(links).toBe(2);
  expect(image.getAttribute("href")).toBe("pixels-b");
});

test("structural changes parse once and retain surviving map primitives and filter references", () => {
  const doc = new Doc(), defs = new Svg("defs", doc);
  const apply = (text: string) => patchFilters(defs as unknown as Element, [text], (token) => token)("scene");
  const id = apply(markup(0)), image = defs.children[0]!.children[0]!;
  const extra = '<feGaussianBlur in="mask" stdDeviation="2" result="blur"/>';
  expect(apply(markup(1, "a", extra))).toBe(id);
  expect(doc.parses).toBe(2);
  expect(defs.children[0]!.children[0]).toBe(image);
  expect(defs.children[0]!.children).toHaveLength(3);
  apply(markup(2, "a", extra));
  expect(doc.parses).toBe(2);
  apply(markup(2));
  expect(doc.parses).toBe(3);
  expect(defs.children[0]!.children[0]).toBe(image);
  patchFilters(defs as unknown as Element, [], () => undefined);
  expect(defs.children).toHaveLength(0);
});
