import React from 'react';
import {Platform, StyleProp, Text, TextStyle} from 'react-native';

import {COLORS, FONTS} from '../theme';

type MdChunk =
  | {type: 'plain'; text: string}
  | {type: 'bold'; text: string}
  | {type: 'italic'; text: string}
  | {type: 'code'; text: string};

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
 * Not full CommonMark (no lists, links, or headings in this pass).
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
};

/**
 * Renders inline markdown for chat bubbles (nested Text for bold / italic / code).
 */
export function ChatMarkdownText({
  text,
  baseStyle,
  boldStyle,
  italicStyle,
  codeStyle,
}: ChatMarkdownTextProps) {
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

/** Bold / italic / code styles that match a chat bubble base `TextStyle`. */
export function chatBubbleMarkdownStyles(
  base: TextStyle,
  opts: {isUserBubble: boolean},
): Pick<ChatMarkdownTextProps, 'boldStyle' | 'italicStyle' | 'codeStyle'> {
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
  };
}
