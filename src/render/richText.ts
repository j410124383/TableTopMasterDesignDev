export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  sizeMm?: number;
  mark?: boolean;
  sub?: boolean;
  sup?: boolean;
};

type Style = Omit<RichSpan, "text">;

export function parseRichText(input: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const stack: Style[] = [{}];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (!buf) return;
    spans.push({ text: buf, ...stack[stack.length - 1] });
    buf = "";
  };

  while (i < input.length) {
    if (input.startsWith("<br>", i) || input.startsWith("<br/>", i)) {
      flush();
      spans.push({ text: "\n", ...stack[stack.length - 1] });
      i += input.startsWith("<br/>", i) ? 5 : 4;
      continue;
    }
    const open = input.slice(i).match(/^<(b|i|u|s|color|size|mark|sub|sup)(?:=([^>]+))?>/i);
    if (open) {
      flush();
      const tag = open[1].toLowerCase();
      const cur = { ...stack[stack.length - 1] };
      if (tag === "b") cur.bold = true;
      if (tag === "i") cur.italic = true;
      if (tag === "u") cur.underline = true;
      if (tag === "s") cur.strike = true;
      if (tag === "color") cur.color = open[2];
      if (tag === "size") cur.sizeMm = Number(open[2]);
      if (tag === "mark") cur.mark = true;
      if (tag === "sub") cur.sub = true;
      if (tag === "sup") cur.sup = true;
      stack.push(cur);
      i += open[0].length;
      continue;
    }
    const close = input.slice(i).match(/^<\/(b|i|u|s|color|size|mark|sub|sup)>/i);
    if (close) {
      flush();
      if (stack.length > 1) stack.pop();
      i += close[0].length;
      continue;
    }
    buf += input[i];
    i += 1;
  }
  flush();
  return spans;
}
