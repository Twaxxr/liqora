/** Keep SVG filters as retained elements. Only structural changes need an
 * inert SVG template. Motion updates the attributes of the retained graph
 * directly, so image primitives keep their loaded
 * images and filter references stay valid. Rebuilding filter markup instead
 * makes every image reload asynchronously, which shows as the material
 * blinking for a frame whenever a surface animates. Image primitives name
 * their map with a short `data-map` token, resolved to its URL only when the
 * map changes. */
const previousMarkup = new WeakMap<Element, Map<string, string>>();
interface RetainedTag { source: string; shape: string; attributes: [string, string][]; element?: Element }
const retained = new WeakMap<Element, RetainedTag[]>();
/** These strings are generated internally. Entity-bearing markup takes the
 * DOM parser path, which preserves its decoding and namespace semantics. */
function tags(text: string, previous?: RetainedTag[]): RetainedTag[] | undefined {
  if (/&(?:#\w+|\w+);/.test(text)) return;
  return [...text.matchAll(/<\/?[\w:-]+\b[^>]*>/g)].map(([source], index) => ({ source,
    shape: /^<\/?[\w:-]+/.exec(source)![0] + (source.endsWith("/>") ? "/" : ""),
    attributes: previous?.[index]?.source === source ? previous[index]!.attributes
      : [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name!, value!]),
  }));
}
function retain(filter: Element, text: string) {
  const frame = tags(text);
  if (!frame) { retained.delete(filter); return; }
  const elements = [filter, ...filter.querySelectorAll("*")];
  let index = 0;
  for (const tag of frame) if (!tag.source.startsWith("</")) tag.element = elements[index++];
  if (index === elements.length) retained.set(filter, frame);
}
function updateAttributes(filter: Element, text: string, resolve: (token: string) => string | undefined): boolean {
  const before = retained.get(filter), next = tags(text, before);
  if (!before || !next || before.length !== next.length) return false;
  // Validate the complete graph before writing. Result names identify
  // retained primitives when surfaces enter, leave, or change paint order.
  for (let i = 0; i < next.length; i++) {
    const a = before[i]!, b = next[i]!;
    if (a.shape !== b.shape || a.attributes.length !== b.attributes.length ||
      a.attributes.some(([name, value], j) => name !== b.attributes[j]![0] || name === "result" && value !== b.attributes[j]![1])) return false;
    b.element = a.element;
  }
  for (let i = 0; i < next.length; i++) {
    const a = before[i]!, b = next[i]!, element = b.element;
    if (!element || a.source === b.source) continue;
    for (let j = 0; j < b.attributes.length; j++) {
      const [name, value] = b.attributes[j]!;
      if (name === "id" && element === filter || value === a.attributes[j]![1]) continue;
      element.setAttribute(name, value);
      if (name === "data-map") link(element, resolve);
    }
  }
  retained.set(filter, next);
  return true;
}
export function patchFilters(defs: Element, markup: readonly string[], resolve: (token: string) => string | undefined): (id: string) => string {
  const previous = previousMarkup.get(defs);
  const written = new Map<string, string>();
  const live = new Map<string, Element>();
  for (const filter of [...defs.children]) live.set(filter.getAttribute("data-filter")!, filter);
  const ids = new Map<string, string>();
  for (const text of markup) {
    const base = /\bid="([^"]+)"/.exec(text)?.[1];
    if (!base) throw new Error("Glass filter has no id.");
    written.set(base, text);
    const current = live.get(base);
    live.delete(base);
    if (current && previous?.get(base) === text) {
      ids.set(base, current.id);
      continue;
    }
    if (current && updateAttributes(current, text, resolve)) {
      ids.set(base, current.id);
      continue;
    }
    const template = defs.ownerDocument.createElement("template");
    // Only changed filters need parsing; static neighbours retain their graph.
    template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`;
    const filter = template.content.firstElementChild!.firstElementChild!;
    if (current) {
      reconcile(current, filter, resolve);
      retain(current, text);
      ids.set(base, current.id);
      continue;
    }
    // A reference to a removed element is not rebound, so a new filter takes
    // a fresh id; the changed reference string makes it resolve.
    const created = defs.ownerDocument.importNode(filter, true);
    created.setAttribute("data-filter", base);
    created.id = `${base}-${++version}`;
    defs.append(created);
    // Link images once connected: a detached feImage does not repaint its
    // filter when its image arrives.
    for (const image of created.querySelectorAll("[data-map]")) link(image, resolve);
    retain(created, text);
    ids.set(base, created.id);
  }
  for (const filter of live.values()) filter.remove();
  previousMarkup.set(defs, written);
  return (id) => ids.get(id) ?? id;
}
let version = 0;
/** Bring a live filter to the next markup while keeping every primitive that
 * still exists, keyed by its result name. Surfaces entering or leaving the
 * scene then never reload the images of the others. */
function reconcile(live: Element, next: Element, resolve: (token: string) => string | undefined) {
  for (const { name, value } of next.attributes) if (name !== "id" && live.getAttribute(name) !== value) live.setAttribute(name, value);
  const key = (element: Element, index: number) => element.getAttribute("result") ?? `${element.tagName}#${index}`;
  const existing = new Map<string, Element>();
  [...live.children].forEach((child, index) => existing.set(key(child, index), child));
  let changed = false;
  const created: Element[] = [];
  const order = [...next.children].map((child, index) => {
    const match = existing.get(key(child, index));
    if (match && sameStructure(match, child)) {
      existing.delete(key(child, index));
      patch(match, child, resolve);
      return match;
    }
    changed = true;
    const node = live.ownerDocument.importNode(child, true);
    created.push(node);
    return node;
  });
  order.forEach((node, index) => {
    if (live.children[index] !== node) { live.insertBefore(node, live.children[index] ?? null); changed = true; }
  });
  for (const stale of existing.values()) { stale.remove(); changed = true; }
  for (const node of created) for (const image of [node, ...node.querySelectorAll("*")]) if (image.hasAttribute("data-map")) link(image, resolve);
  // Changing a referenced filter's children does not repaint by itself.
  if (changed) live.setAttribute("x", live.getAttribute("x")!);
}
function sameStructure(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName || a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) if (!sameStructure(a.children[i]!, b.children[i]!)) return false;
  return true;
}
/** Point an image primitive at the map its token names. */
function link(image: Element, resolve: (token: string) => string | undefined) {
  const url = resolve(image.getAttribute("data-map")!);
  if (!url || image.getAttribute("href") === url) return;
  image.setAttribute("href", url);
  const defs = image.closest("defs");
  if (defs) settle(defs);
}
const settling = new WeakMap<Element, number>();
/** Chromium does not repaint a filtered element when an `feImage` image
 * becomes ready by itself, and offers no load event to wait for. Writing one
 * unchanged attribute invalidates the filter. Repeating that every frame
 * keeps restarting the image's preparation, so it is repeated a few times
 * with growing gaps: the first repaint that finds the image ready shows it. */
function settle(defs: Element) {
  const generation = (settling.get(defs) ?? 0) + 1;
  settling.set(defs, generation);
  for (const delay of [16, 100, 300, 700, 1500, 3000]) setTimeout(() => {
    if (settling.get(defs) !== generation || !defs.isConnected) return;
    const image = defs.querySelector("feImage");
    image?.setAttribute("x", image.getAttribute("x")!);
  }, delay);
}
function patch(live: Element, next: Element, resolve: (token: string) => string | undefined): void {
  let relink = false;
  for (const { name, value } of next.attributes) if (live.getAttribute(name) !== value) {
    live.setAttribute(name, value);
    relink ||= name === "data-map";
  }
  // The resolved href and the live id are owned by the patcher, not the markup.
  for (const { name } of [...live.attributes]) if (name !== "href" && !next.hasAttribute(name)) live.removeAttribute(name);
  if (relink) link(live, resolve);
  for (let i = 0; i < next.children.length; i++) patch(live.children[i]!, next.children[i]!, resolve);
}
