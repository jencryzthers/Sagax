// A happy-dom window installed by hand for a test file that runs in the node
// environment. The happy-dom test environment bundles the client graph,
// which cannot hold the server's sqlite code the store reaches; a window
// set on the globals before react-dom/client loads lets such a file click
// through real components anyway. Import react-dom/client dynamically after
// installing it, and call the returned cleanup in afterAll.
import { Window } from "happy-dom";

export function installHappyWindow(): () => Promise<void> {
  const page = new Window({ url: "http://localhost/" });
  const globals: Record<string, unknown> = {
    window: page,
    document: page.document,
    navigator: page.navigator,
    HTMLElement: page.HTMLElement,
    HTMLInputElement: page.HTMLInputElement,
    Node: page.Node,
    MouseEvent: page.MouseEvent,
    KeyboardEvent: page.KeyboardEvent,
    getComputedStyle: page.getComputedStyle.bind(page),
    requestAnimationFrame: page.requestAnimationFrame.bind(page),
    cancelAnimationFrame: page.cancelAnimationFrame.bind(page),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return async () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await page.happyDOM.close();
  };
}
