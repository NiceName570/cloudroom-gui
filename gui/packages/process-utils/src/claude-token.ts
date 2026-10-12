const TOKEN = /(sk-ant-oat[A-Za-z0-9_-]{20,})[^A-Za-z0-9_-]/;

/** Rebuilds the terminal screen from raw `script` output, applying cursor moves and line clears. */
export function screenText(output: string): string {
  const rows: string[][] = [];
  let row = 0, col = 0;
  for (const [, params = "", command, char] of output.matchAll(/\x1b\[([0-9;?<>=]*)([A-Za-z@`])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()*+]?[^\[\]]|([^])/gu)) {
    const n = Number(params) || 1;
    if (command === "G") col = n - 1;
    else if (command === "C") col += n;
    else if (command === "D") col = Math.max(0, col - n);
    else if (command === "A") row = Math.max(0, row - n);
    else if (command === "B") row += n;
    else if (command === "K") rows[row] = params === "2" ? [] : (rows[row] ?? []).slice(0, col);
    else if (char === "\r") col = 0;
    else if (char === "\n") row++;
    else if (char && char >= " ") (rows[row] ??= [])[col++] = char;
  }
  return Array.from(rows, line => Array.from(line ?? [], cell => cell ?? " ").join("")).join("\n");
}

/**
 * The one-year token in `claude setup-token` output, or undefined.
 * Claude Code (2.1.220 and later) skips characters already on screen, so the token is only whole on the rebuilt screen.
 */
export const readClaudeToken = (output: string): string | undefined =>
  (screenText(output).match(TOKEN) ?? output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").match(TOKEN))?.[1];
