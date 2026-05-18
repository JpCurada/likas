import {
  extractInlineNumberedList,
  parseChatContentBlocks,
} from '../src/utils/simpleMarkdown';

describe('extractInlineNumberedList', () => {
  it('extracts inline protocol steps with intro', () => {
    const list = extractInlineNumberedList(
      'PHIVOLCS preparedness: 1) Know your distance. 2) Monitor PHIVOLCS. 3) Prepare a Go Bag.',
    );
    expect(list?.intro).toBe('PHIVOLCS preparedness:');
    expect(list?.items).toEqual([
      {num: '1', text: 'Know your distance.'},
      {num: '2', text: 'Monitor PHIVOLCS.'},
      {num: '3', text: 'Prepare a Go Bag.'},
    ]);
  });

  it('returns null for a single numbered item', () => {
    expect(extractInlineNumberedList('Only 1) one item here.')).toBeNull();
  });
});

describe('parseChatContentBlocks', () => {
  it('splits intro, numbered list, and closing paragraph', () => {
    const blocks = parseChatContentBlocks(
      'According to the official protocol:\n\nPHIVOLCS preparedness: 1) Know your distance. 2) Monitor PHIVOLCS.\n\nGe, please ensure you have your Go Bag ready.',
    );
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      text: 'According to the official protocol:',
    });
    expect(blocks[1]).toMatchObject({
      kind: 'numbered_list',
      intro: 'PHIVOLCS preparedness:',
    });
    expect(blocks[2]).toEqual({
      kind: 'paragraph',
      text: 'Ge, please ensure you have your Go Bag ready.',
    });
  });
});
