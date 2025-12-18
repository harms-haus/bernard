export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;
export type Chainable<T> = AnyIterable<T> | null;

export function createDelegateSequencer<T>() {
  const queue: Promise<Chainable<T>>[] = [];
  let resolveNext: (it: Chainable<T>) => void;
  let isDone = false;

  const enqueuePromise = () => {
    let resolve: (it: Chainable<T>) => void;
    const promise = new Promise<Chainable<T>>((r) => {
      resolve = r;
    });

    queue.push(promise);
    resolveNext = (it) => {
      if (isDone) return;
      if (it === null) {
        isDone = true;
      } else {
        enqueuePromise();
      }
      resolve(it);
    };
  };

  enqueuePromise();

  const sequence = (async function* () {
    while (true) {
      const itPromise = queue.shift();
      if (!itPromise) break;
      const it = await itPromise;
      if (it === null) break;
      yield* it;
    }
  })();

  return {
    sequence,
    chain: (it: Chainable<T>) => resolveNext(it),
    done: () => resolveNext(null),
  };
}
