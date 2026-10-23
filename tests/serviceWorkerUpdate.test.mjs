import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activateWaitingWorker } from '../src/utils/serviceWorkerUpdate.ts';

class WorkerStub extends EventTarget {
  state = 'installed';
  messages = [];
  listeners = new Set();

  addEventListener(type, listener, options) {
    this.listeners.add(listener);
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.listeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  postMessage(message) { this.messages.push(message); }

  transition(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

test('an update already activated by another tab needs no skip-waiting message', async () => {
  await activateWaitingWorker(null);
  const worker = new WorkerStub();
  worker.state = 'activated';
  await activateWaitingWorker(worker);
  assert.deepEqual(worker.messages, []);
  assert.equal(worker.listeners.size, 0);
});

test('waits for activation without depending on a page controller', async () => {
  const worker = new WorkerStub();
  let completed = false;
  const pending = activateWaitingWorker(worker).then(() => { completed = true; });
  assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
  worker.transition('activating');
  await Promise.resolve();
  assert.equal(completed, false);
  worker.transition('activated');
  await pending;
  assert.equal(completed, true);
  assert.equal(worker.listeners.size, 0);
});

test('rejects a replaced worker and removes its listener', async () => {
  const worker = new WorkerStub();
  const pending = assert.rejects(activateWaitingWorker(worker), /replaced/);
  worker.transition('redundant');
  await pending;
  assert.equal(worker.listeners.size, 0);
});

test('bounds the wait and ignores a late activation after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = new WorkerStub();
  const pending = assert.rejects(activateWaitingWorker(worker), /timed out/);
  t.mock.timers.tick(10000);
  await pending;
  assert.equal(worker.listeners.size, 0);
  worker.transition('activated');
  assert.equal(worker.listeners.size, 0);
});

test('a failed skip-waiting message does not leave an activation listener behind', async () => {
  const worker = new WorkerStub();
  worker.postMessage = () => { throw new Error('Message failed'); };
  await assert.rejects(activateWaitingWorker(worker), /Message failed/);
  assert.equal(worker.listeners.size, 0);
});
