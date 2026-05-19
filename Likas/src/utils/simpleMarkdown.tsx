import React from 'react';
import {Platform, StyleProp, StyleSheet, Text, TextStyle, View} from 'react-native';

import {COLORS, FONTS} from '../theme';

type MdChunk =
  | {type: 'plain'; text: string}
  | {type: 'bold'; text: string}
  | {type: 'italic'; text: string}
  | {type: 'code'; text: string};

type NumberedListItem = {num: string; text: string};

export type ChatContentBlock =
  | {kind: 'paragraph'; text: string}
  | {kind: 'numbered_list'; intro?: string; items: NumberedListItem[]};

/** Split `s` on `re` (global) into alternating plain segments and full matches (m[0]). */
function splitWithCaptures(s: string, re: RegExp): string[] {
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = r.exec(s)) !== null) {
    if (m.index > last) {
      out.push(s.slice(last, m.index));
    }
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    out.push(s.slice(last));
  }
  return out;
}

function parseItalicAndPlain(s: string): MdChunk[] {
  if (!s) {
    return [];
  }
  const parts = splitWithCaptures(
    s,
    /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)|(?<!_)_(?!_)([^_\n]+?)_(?!_)/g,
  );
  const chunks: MdChunk[] = [];
  for (const p of parts) {
    const star = /^\*([^*\n]+)\*$/.exec(p);
    const unders = /^_([^_\n]+)_$/.exec(p);
    if (star) {
      chunks.push({type: 'italic', text: star[1]});
    } else if (unders) {
      chunks.push({type: 'italic', text: unders[1]});
    } else if (p) {
      chunks.push({type: 'plain', text: p});
    }
  }
  return chunks;
}

function parseCodeThenItalic(s: string): MdChunk[] {
  if (!s) {
    return [];
  }
  const parts = splitWithCaptures(s, /`([^`]+)`/g);
  const out: MdChunk[] = [];
  for (const p of parts) {
    const code = /^`([^`]+)`$/.exec(p);
    if (code) {
      out.push({type: 'code', text: code[1]});
    } else {
      out.push(...parseItalicAndPlain(p));
    }
  }
  return out;
}

function parseNonBold(s: string): MdChunk[] {
  return parseCodeThenItalic(s);
}

/**
 * Parses common LLM markdown: **bold**, `code`, *italic*, _italic_.
 * Not full CommonMark (no links or headings in this pass).
 */
export function parseSimpleMarkdown(text: string): MdChunk[] {
  if (!text) {
    return [];
  }
  const segments = splitWithCaptures(text, /\*\*([\s\S]*?)\*\*/g);
  const chunks: MdChunk[] = [];
  for (const seg of segments) {
    const bold = /^\*\*([\s\S]*?)\*\*$/.exec(seg);
    if (bold) {
      chunks.push({type: 'bold', text: bold[1]});
    } else {
      chunks.push(...parseNonBold(seg));
    }
  }
  return chunks;
}

const NUMBERED_ITEM_RE = /(\d+)\)\s/g;

/** Pull inline `1) … 2) …` protocol steps out of a paragraph. */
export function extractInlineNumberedList(
  paragraph: string,
): {intro?: string; items: NumberedListItem[]} | null {
  const trimmed = paragraph.trim();
  if (!trimmed) return null;

  const matches = [...trimmed.matchAll(NUMBERED_ITEM_RE)];
  if (matches.length < 2 || matches[0].index == null) return null;

  const intro = trimmed.slice(0, matches[0].index).trim() || undefined;
  const items: NumberedListItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index! + match[0].length;
    const end =
      i + 1 < matches.length && matches[i + 1].index != null
        ? matches[i + 1].index!
        : trimmed.length;
    const text = trimmed.slice(start, end).trim();
    if (text) {
      items.push({num: match[1], text});
    }
  }

  return items.length >= 2 ? {intro, items} : null;
}

/** Split assistant prose into paragraphs and numbered protocol lists. */
export function parseChatContentBlocks(text: string): ChatContentBlock[] {
  if (!text.trim()) return [];

  const blocks: ChatContentBlock[] = [];
  for (const paragraph of text.split(/\n\n+/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const list = extractInlineNumberedList(trimmed);
    if (list) {
      blocks.push({
        kind: 'numbered_list',
        intro: list.intro,
        items: list.items,
      });
    } else {
      blocks.push({kind: 'paragraph', text: trimmed});
    }
  }

  return blocks.length > 0 ? blocks : [{kind: 'paragraph', text: text.trim()}];
}

const CODE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export type ChatMarkdownTextProps = {
  text: string;
  baseStyle: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  italicStyle?: StyleProp<TextStyle>;
  codeStyle?: StyleProp<TextStyle>;
  listBadgeStyle?: StyleProp<TextStyle>;
  listBadgeTextStyle?: StyleProp<TextStyle>;
};

function MarkdownInline({
  text,
  baseStyle,
  boldStyle,
  italicStyle,
  codeStyle,
}: {
  text: string;
  baseStyle: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  italicStyle?: StyleProp<TextStyle>;
  codeStyle?: StyleProp<TextStyle>;
}) {
  const chunks = parseSimpleMarkdown(text);
  if (chunks.length === 0) {
    return <Text style={baseStyle} />;
  }

  return (
    <Text style={baseStyle}>
      {chunks.map((c, i) => {
        if (c.type === 'plain') {
          return c.text;
        }
        if (c.type === 'bold') {
          return (
            <Text key={i} style={boldStyle}>
              {c.text}
            </Text>
          );
        }
        if (c.type === 'italic') {
          return (
            <Text key={i} style={italicStyle}>
              {c.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={codeStyle}>
            {c.text}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Renders chat bubble text with inline markdown and protocol numbered lists.
 */
export function ChatMarkdownText({
  text,
  baseStyle,
  boldStyle,
  italicStyle,
  codeStyle,
  listBadgeStyle,
  listBadgeTextStyle,
}: ChatMarkdownTextProps) {
  const blocks = parseChatContentBlocks(text);
  const flatBase = StyleSheet.flatten(baseStyle) as TextStyle;
  const listBodyStyle: TextStyle = {
    flex: 1,
    lineHeight: flatBase.lineHeight ?? 22,
    ...(Platform.OS === 'android' ? {includeFontPadding: false} : null),
  };

  if (blocks.length === 1 && blocks[0].kind === 'paragraph') {
    return (
      <MarkdownInline
        text={blocks[0].text}
        baseStyle={baseStyle}
        boldStyle={boldStyle}
        italicStyle={italicStyle}
        codeStyle={codeStyle}
      />
    );
  }

  return (
    <View style={styles.blockStack}>
      {blocks.map((block, blockIndex) => {
        if (block.kind === 'paragraph') {
          return (
            <MarkdownInline
              key={`p-${blockIndex}`}
              text={block.text}
              baseStyle={baseStyle}
              boldStyle={boldStyle}
              italicStyle={italicStyle}
              codeStyle={codeStyle}
            />
          );
        }

        return (
          <View key={`l-${blockIndex}`} style={styles.listBlock}>
            {block.intro ? (
              <MarkdownInline
                text={block.intro}
                baseStyle={[baseStyle, styles.listIntro]}
                boldStyle={boldStyle}
                italicStyle={italicStyle}
                codeStyle={codeStyle}
              />
            ) : null}
            {block.items.map((item, itemIndex) => (
              <View key={`${blockIndex}-${itemIndex}`} style={styles.listRow}>
                <View style={[styles.listBadge, listBadgeStyle]}>
                  <Text style={[styles.listBadgeText, listBadgeTextStyle]}>
                    {item.num}
                  </Text>
                </View>
                <MarkdownInline
                  text={item.text}
                  baseStyle={[baseStyle, listBodyStyle]}
                  boldStyle={boldStyle}
                  italicStyle={italicStyle}
                  codeStyle={codeStyle}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Bold / italic / code / list badge styles that match a chat bubble base `TextStyle`. */
export function chatBubbleMarkdownStyles(
  base: TextStyle,
  opts: {isUserBubble: boolean},
): Pick<
  ChatMarkdownTextProps,
  'boldStyle' | 'italicStyle' | 'codeStyle' | 'listBadgeStyle' | 'listBadgeTextStyle'
> {
  const accent = opts.isUserBubble ? 'rgba(255,255,255,0.95)' : COLORS.darkGreen;
  const codeBg = opts.isUserBubble ? 'rgba(0,0,0,0.22)' : '#e8f5ee';

  return {
    boldStyle: {
      fontFamily: FONTS.primaryBold,
      fontWeight: '700',
      color: base.color,
    },
    italicStyle: {
      fontFamily: FONTS.primaryMedium,
      fontStyle: 'italic',
      color: base.color,
    },
    codeStyle: {
      fontFamily: CODE_FONT,
      fontSize: Math.max(13, (base.fontSize ?? 16) - 2),
      backgroundColor: codeBg,
      color: accent,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    listBadgeStyle: {
      backgroundColor: opts.isUserBubble
        ? 'rgba(255,255,255,0.28)'
        : COLORS.primaryGreen,
    },
    listBadgeTextStyle: {
      color: COLORS.white,
    },
  };
}

const styles = StyleSheet.create({
  blockStack: {
    gap: 12,
  },
  listBlock: {
    gap: 10,
  },
  listIntro: {
    marginBottom: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  listBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  listBadgeText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 12,
    ...(Platform.OS === 'android' ? {includeFontPadding: false} : null),
  },
});
