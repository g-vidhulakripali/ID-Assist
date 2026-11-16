import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchDom } from '../../src/form-detection/observer';
import { debounce } from '../../src/shared/debounce';

describe('watchDom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="page"></div><div id="ours"></div>';
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of mutations into one callback', async () => {
    const onChange = vi.fn();
    const stop = watchDom(document, onChange, { debounceMs: 100 });
    const page = document.getElementById('page')!;
    for (let i = 0; i < 5; i++) page.appendChild(document.createElement('input'));
    await Promise.resolve(); // let MutationObserver deliver
    vi.advanceTimersByTime(99);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ignores mutations inside our own UI', async () => {
    const onChange = vi.fn();
    const ours = document.getElementById('ours')!;
    const stop = watchDom(document, onChange, { debounceMs: 10, ignore: (n) => ours.contains(n) });
    ours.appendChild(document.createElement('span'));
    await Promise.resolve();
    vi.advanceTimersByTime(20);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('reacts to in-page navigation events', () => {
    const onChange = vi.fn();
    const stop = watchDom(document, onChange, { debounceMs: 10 });
    window.dispatchEvent(new Event('hashchange'));
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event('popstate'));
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once with the last arguments, supports cancel and flush', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d(2);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    d(4);
    d.flush();
    expect(fn).toHaveBeenLastCalledWith(4);
  });
});
