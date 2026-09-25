export type StopTicker = () => void;
export type TickerFactory = (intervalMs: number, onTick: () => void) => StopTicker;

// Timers in hidden tabs are throttled hard (down to once a minute in Chrome), which
// would wreck the countdown when audio plays on another device. Timers inside a
// dedicated worker are not throttled that way, so tick from one when possible.
let workerUrl: string | null = null;

export const createTicker: TickerFactory = (intervalMs, onTick) => {
  try {
    workerUrl ??= URL.createObjectURL(
      new Blob(['onmessage=e=>{setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' }),
    );
    const worker = new Worker(workerUrl);
    worker.onmessage = () => onTick();
    worker.postMessage(intervalMs);
    return () => worker.terminate();
  } catch {
    const id = setInterval(onTick, intervalMs);
    return () => clearInterval(id);
  }
};
