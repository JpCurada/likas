// Manual Jest mock for the `llama.rn` native module so the AI service can be
// unit-tested in plain Node without the JNI/Obj-C runtime.
//
// Tests drive model behavior with `__setScriptedTurns([...])`: each entry is
// the full raw string the "model" should emit for one completion() call. The
// mocked completion() streams it back token-by-token (so the speak-streamer is
// exercised) and resolves with { text }.

let scriptedTurns = [];
let turnIndex = 0;

const __setScriptedTurns = turns => {
  scriptedTurns = turns;
  turnIndex = 0;
};

const __reset = () => {
  scriptedTurns = [];
  turnIndex = 0;
};

const makeContext = () => ({
  getFormattedChat: jest.fn(async () => ({type: 'jinja', prompt: ''})),
  completion: jest.fn(async (_params, onToken) => {
    const raw = scriptedTurns[turnIndex] ?? '{"action":"speak","text":""}';
    turnIndex += 1;
    // Stream in small chunks so escape/unicode parsing in the streamer runs.
    for (let i = 0; i < raw.length; i += 3) {
      onToken?.({token: raw.slice(i, i + 3)});
    }
    return {text: raw};
  }),
});

const initLlama = jest.fn(async () => makeContext());
const releaseAllLlama = jest.fn(async () => {});

class LlamaContext {}

module.exports = {
  initLlama,
  releaseAllLlama,
  LlamaContext,
  __setScriptedTurns,
  __reset,
};
