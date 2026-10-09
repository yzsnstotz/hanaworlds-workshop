// Only rejection boundaries; no fixture event is used as live Core evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as supply from '../web/c4-supply.mjs';

test('unregistered session cannot receive a purported user input', async () => {
 assert.equal(typeof supply.appendStartedUserInput, 'function', 'missing started-session user-input guard');
 await assert.rejects(supply.appendStartedUserInput({sessions:{get(){return undefined;}}}, 'unknown', '确认', new AbortController().signal), e => e.code === 'SESSION_NOT_FOUND');
});
test('invalid input is rejected before looking up or mutating a Session', async () => {
 assert.equal(typeof supply.appendStartedUserInput, 'function', 'missing started-session user-input guard');
 let reads = 0;
 await assert.rejects(supply.appendStartedUserInput({sessions:{get(){reads++;}}}, 'unknown', '', new AbortController().signal), e => e.code === 'INVALID_USER_INPUT');
 assert.equal(reads, 0);
});
