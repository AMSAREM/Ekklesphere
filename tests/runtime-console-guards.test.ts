import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Runtime Console & Hook-Order Regression Guards', () => {
  it('places all React hooks above any top-level early return in MemberProfileEditorModal', () => {
    const filePath = path.resolve(
      process.cwd(),
      'src/components/member/MemberProfileEditorModal.tsx'
    );
    const content = fs.readFileSync(filePath, 'utf8');
    const earlyReturnIndex = content.indexOf('if (!isOpen) return null;');
    expect(earlyReturnIndex).toBeGreaterThan(-1);

    const codeAfterEarlyReturn = content.slice(earlyReturnIndex);
    expect(codeAfterEarlyReturn).not.toMatch(
      /\b(React\.)?(useMemo|useEffect|useState|useCallback|useRef|useContext|useLayoutEffect|useReducer)\s*(<|\()/
    );
  });

  it('has zero top-level component hook calls after early returns across src/', () => {
    const files = collectTsxFiles(path.resolve(process.cwd(), 'src'));
    const violations: string[] = [];
    const compRegex = /^(?:export\s+)?(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\b/gm;

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = compRegex.exec(src)) !== null) {
        const compName = m[1];
        let braceIdx = -1;
        let paren = 0;
        for (let i = m.index; i < src.length; i++) {
          const ch = src[i];
          if (ch === '(') paren++;
          else if (ch === ')') paren = Math.max(0, paren - 1);
          else if (ch === '{' && paren === 0) {
            const before = src.slice(Math.max(0, i - 30), i);
            if (/=>\s*$/.test(before) || /\)\s*(?::\s*[\w.<>\[\]| ]+)?\s*$/.test(before)) {
              braceIdx = i;
              break;
            }
          }
        }
        if (braceIdx === -1) continue;

        let depth = 0;
        let endIdx = braceIdx;
        let inStr: string | null = null;
        for (let i = braceIdx; i < src.length; i++) {
          const ch = src[i];
          if (inStr) {
            if (ch === '\\') {
              i++;
              continue;
            }
            if (ch === inStr) inStr = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') {
            inStr = ch;
            continue;
          }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        const bodyLines = src.slice(braceIdx, endIdx + 1).split('\n');
        let d = 0;
        let earlyReturnLine: number | null = null;
        for (let li = 0; li < bodyLines.length; li++) {
          const line = bodyLines[li];
          if (d === 1 && /^\s*if\s*\([^)]*\)\s*return\b/.test(line) && !earlyReturnLine) {
            earlyReturnLine = li + 1;
          }
          if (
            earlyReturnLine &&
            d === 1 &&
            /\b(React\.)?(useMemo|useEffect|useState|useCallback|useRef|useContext|useLayoutEffect|useReducer)\s*(<|\()/.test(
              line
            )
          ) {
            violations.push(`${path.relative(process.cwd(), file)} (${compName}): ${line.trim()}`);
          }
          for (const ch of line) {
            if (ch === '{') d++;
            else if (ch === '}') d--;
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('guards /api/members with directory role check and avoids locked-down Firestore boot/mirror calls', () => {
    const contextSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/EkklesphereContext.tsx'),
      'utf8'
    );
    expect(contextSrc).toContain('canListDirectory');
    expect(contextSrc).not.toContain("from 'firebase/firestore'");
    expect(contextSrc).not.toContain('setDoc(doc(db,');
    expect(contextSrc).not.toContain('deleteDoc(doc(db,');

    const firebaseSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/firebase.ts'), 'utf8');
    expect(firebaseSrc).not.toContain('void testConnection()');
    expect(firebaseSrc).not.toContain('Firebase client is currently offline');

    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain('AppErrorBoundary');
  });
});
