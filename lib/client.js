window.__ModuleLoader__.load({
	id: "@citisen/dsh-font",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _citisen_litearea = (function () {
// src/core/format.ts
var DEFAULT_LIST_LIMIT = 12;
function fillTemplate(template, values) {
  return String(template).replace(
    /\{(\w+)\}/g,
    (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match
  );
}
function listPhrase(items, options) {
  const conjunction = options?.conjunction ?? "or";
  const limit = options?.limit ?? DEFAULT_LIST_LIMIT;
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  if (shown.length === 0) return "";
  if (shown.length === 1) {
    return rest > 0 ? `${String(shown[0])} and ${String(rest)} more` : String(shown[0]);
  }
  if (shown.length === 2) {
    const pair = `${String(shown[0])} ${conjunction} ${String(shown[1])}`;
    return rest > 0 ? `${pair}, and ${String(rest)} more` : pair;
  }
  const head = shown.slice(0, -1).join(", ");
  const tail = shown[shown.length - 1];
  const phrase = `${head}, ${conjunction} ${String(tail)}`;
  return rest > 0 ? `${phrase}, and ${String(rest)} more` : phrase;
}
function excerpt(text, limit = 24) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}\u2026`;
}

// src/core/text.ts
function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
function isOffset(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 10) {
      starts.push(index + 1);
    } else if (code === 13) {
      if (source.charCodeAt(index + 1) === 10) index += 1;
      starts.push(index + 1);
    }
  }
  return starts;
}
function lineIndexAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}
function lineAt(source, offset, starts) {
  const position = clamp(offset, 0, source.length);
  const boundaries = starts ?? lineStarts(source);
  const index = lineIndexAt(boundaries, position);
  const from = boundaries[index] ?? 0;
  const rawTo = boundaries[index + 1] ?? source.length;
  let to = rawTo;
  while (to > from) {
    const code = source.charCodeAt(to - 1);
    if (code === 10 || code === 13) to -= 1;
    else break;
  }
  const text = source.slice(from, to);
  const column = clamp(position - from, 0, text.length);
  return {
    from,
    to,
    text,
    number: index,
    column,
    before: text.slice(0, column),
    after: text.slice(column)
  };
}
function isWordChar(char, wordChars) {
  return char !== "" && wordChars.test(char);
}
function wordInfoAt(source, offset, wordChars) {
  const position = clamp(offset, 0, source.length);
  let from = position;
  let to = position;
  while (from > 0 && isWordChar(source.charAt(from - 1), wordChars)) from -= 1;
  while (to < source.length && isWordChar(source.charAt(to), wordChars)) to += 1;
  const text = source.slice(from, to);
  const column = position - from;
  return {
    from,
    to,
    text,
    prefix: text.slice(0, column),
    suffix: text.slice(column)
  };
}
function isEmptyRange(range2) {
  return range2.to <= range2.from;
}
function containsOffset(range2, offset) {
  return offset >= range2.from && offset < range2.to;
}
function tokenAt(tokens, offset) {
  for (const token of tokens) {
    if (token.from <= offset && offset < token.to) return token;
    if (token.from > offset) break;
  }
  return void 0;
}
function scopeAt(tokens, offset) {
  return tokenAt(tokens, offset)?.scope;
}
function tokenBefore(tokens, offset) {
  let found;
  for (const token of tokens) {
    if (token.to > offset) break;
    if (token.text.trim() !== "") found = token;
  }
  return found;
}
function tokenAfter(tokens, offset) {
  for (const token of tokens) {
    if (token.to <= offset) continue;
    if (token.text.trim() !== "") return token;
  }
  return void 0;
}
function tokensOnLine(tokens, line) {
  const number = typeof line === "number" ? line : line.number;
  return tokens.filter((token) => token.line === number && token.text.trim() !== "");
}

// src/core/vocabulary.ts
function defineVocabulary(spec) {
  const caseSensitive = spec.caseSensitive === true;
  const unknownScope = spec.unknownScope ?? "invalid";
  const defaultScope = `vocabulary:${spec.id}`;
  const unknownCode = spec.unknownCode ?? `vocabulary:${spec.id}`;
  const unknownSeverity = spec.unknownSeverity ?? "error";
  const fold = (word) => caseSensitive ? word : word.toLowerCase();
  const memberOf = (word, allowed) => {
    const needle = fold(word);
    return allowed.find((candidate) => fold(candidate) === needle);
  };
  const docOf = (word) => {
    if (spec.docs === void 0) return void 0;
    for (const [key, value] of Object.entries(spec.docs)) {
      if (fold(key) !== fold(word)) continue;
      return typeof value === "string" ? { body: value } : value;
    }
    return void 0;
  };
  return {
    id: spec.id,
    caseSensitive,
    resolve: (context) => {
      const words = typeof spec.words === "function" ? spec.words(context) : spec.words;
      return Array.isArray(words) ? words : [];
    },
    has: (word, context) => {
      const words = typeof spec.words === "function" ? spec.words(context) : spec.words;
      return memberOf(word, Array.isArray(words) ? words : []) !== void 0;
    },
    scopeFor: (word) => {
      if (typeof spec.scope === "function") return spec.scope(memberOf(word, [word]) ?? word);
      return spec.scope ?? defaultScope;
    },
    unknownScope,
    reject: (word, context) => {
      if (spec.unknownMessage === void 0) return void 0;
      const allowed = typeof spec.words === "function" ? spec.words(context) : spec.words;
      const members = Array.isArray(allowed) ? allowed : [];
      const message = typeof spec.unknownMessage === "function" ? spec.unknownMessage(word, members) : fillTemplate(spec.unknownMessage, {
        word,
        allowed: listPhrase(members, { conjunction: "or" })
      });
      return { message, severity: unknownSeverity, code: unknownCode };
    },
    entryFor: (word) => docOf(word),
    format: (word) => spec.format === void 0 ? word : spec.format(word)
  };
}
function vocabularyWords(vocabulary, context) {
  return vocabulary.resolve(context);
}
function asResolvedVocabulary(source) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return void 0;
  const candidate = source;
  return typeof candidate.resolve === "function" ? source : void 0;
}
function resolveWordsSource(source, context) {
  const vocabulary = asResolvedVocabulary(source);
  const raw = vocabulary !== void 0 ? vocabulary.resolve(context) : typeof source === "function" ? source(context) : source;
  return Array.isArray(raw) ? raw.filter((word) => word !== "") : [];
}

// src/core/scan.ts
function isResolvedGrammar(value) {
  return value.__resolved === true;
}
var DEFAULT_WORD_CHARS = /[\p{L}\p{N}_$]/u;
var stickyCache = /* @__PURE__ */ new WeakMap();
function sticky(pattern) {
  const cached = stickyCache.get(pattern);
  if (cached !== void 0) return cached;
  const flags = pattern.flags.replace(/[gy]/g, "");
  const compiled = new RegExp(pattern.source, `${flags}y`);
  stickyCache.set(pattern, compiled);
  return compiled;
}
function execAt(pattern, source, index) {
  pattern.lastIndex = index;
  const match = pattern.exec(source);
  return match !== null && match.index === index ? match : null;
}
function withoutStatefulFlags(pattern) {
  const flags = pattern.flags.replace(/[gy]/g, "");
  return flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
}
function resolveGrammar(grammar) {
  return {
    __resolved: true,
    grammar,
    rules: grammar.rules,
    fallbackScope: grammar.fallbackScope ?? "text",
    wordChars: withoutStatefulFlags(grammar.wordChars ?? DEFAULT_WORD_CHARS)
  };
}
function scan(source, grammar) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const { rules, fallbackScope, wordChars } = resolved;
  const declared = resolved.grammar;
  const sourceId = declared.id;
  const state = declared.analyze === void 0 ? declared.initialState : declared.analyze(source);
  const vocabularyContext = { text: source, state };
  const tokens = [];
  const diagnostics = [];
  const starts = lineStarts(source);
  const length = source.length;
  const wordsCache = /* @__PURE__ */ new Map();
  let cachedLineNumber = -1;
  let cachedLineBounds;
  const prevNotCache = /* @__PURE__ */ new WeakMap();
  const lineInfoAt = (position) => {
    const number = lineIndexAt(starts, position);
    if (number !== cachedLineNumber || cachedLineBounds === void 0) {
      const info = lineAt(source, position, starts);
      cachedLineBounds = { from: info.from, to: info.to, text: info.text };
      cachedLineNumber = number;
    }
    const column = clamp(position - cachedLineBounds.from, 0, cachedLineBounds.text.length);
    return {
      from: cachedLineBounds.from,
      to: cachedLineBounds.to,
      text: cachedLineBounds.text,
      number,
      column,
      before: cachedLineBounds.text.slice(0, column),
      after: cachedLineBounds.text.slice(column)
    };
  };
  const resolveWords = (from) => {
    const cached = wordsCache.get(from);
    if (cached !== void 0) return cached;
    const vocabulary = asResolvedVocabulary(from);
    const caseSensitive = vocabulary?.caseSensitive === true;
    const raw = vocabulary !== void 0 ? vocabulary.resolve(vocabularyContext) : typeof from === "function" ? from(vocabularyContext) : from;
    const list = Array.isArray(raw) ? raw.filter((word) => word !== "") : [];
    const fold = (word) => caseSensitive ? word : word.toLowerCase();
    const entry = {
      list,
      set: new Set(list.map(fold)),
      literal: list.filter((word) => [...word].some((char) => !isWordChar(char, wordChars))).slice().sort((left, right) => right.length - left.length),
      caseSensitive
    };
    wordsCache.set(from, entry);
    return entry;
  };
  const scopeOf = (spec, match, fallback) => spec === void 0 ? fallback : typeof spec === "function" ? spec(match) : spec;
  const contextHolds = (when, index2, previousScope2) => {
    if (when === void 0) return true;
    const info = lineInfoAt(index2);
    if (when.firstOnLine === true && info.text.slice(0, info.column).trim() !== "") return false;
    if (when.after !== void 0) {
      if (previousScope2 === void 0 || !when.after.includes(previousScope2)) return false;
    }
    if (when.notAfter !== void 0 && previousScope2 !== void 0) {
      if (when.notAfter.includes(previousScope2)) return false;
    }
    if (when.line !== void 0 && !when.line.test(info.text)) return false;
    if (when.minColumn !== void 0 && info.column < when.minColumn) return false;
    if (when.maxColumn !== void 0 && info.column > when.maxColumn) return false;
    if (when.prevNot !== void 0 && index2 > 0) {
      let pattern = prevNotCache.get(when);
      if (pattern === void 0) {
        pattern = new RegExp(`[${when.prevNot}]`);
        prevNotCache.set(when, pattern);
      }
      if (pattern.test(source.charAt(index2 - 1))) return false;
    }
    return true;
  };
  let regionScope;
  let previousScope;
  const push = (scope, from, to, region) => {
    if (to <= from) return;
    const text = source.slice(from, to);
    const last = tokens[tokens.length - 1];
    if (last !== void 0 && last.scope === scope && last.to === from && last.region === region && !/[\r\n]/.test(text) && !/[\r\n]/.test(last.text)) {
      last.to = to;
      last.text = source.slice(last.from, to);
    } else {
      const info = lineInfoAt(from);
      tokens.push({ from, to, scope, text, line: info.number, column: from - info.from, region });
    }
    if (text.trim() !== "") previousScope = scope;
  };
  const report = (problem) => {
    diagnostics.push({
      from: problem.from,
      to: problem.to,
      message: problem.message,
      severity: problem.severity ?? "error",
      code: problem.code ?? "lexical",
      source: sourceId
    });
  };
  const ruleMatch = (text, from, groups) => ({ text, source, from, groups, state });
  const readWordRun = (index2) => {
    let to = index2;
    while (to < length && isWordChar(source.charAt(to), wordChars)) to += 1;
    return to;
  };
  const readSegments = (index2, limit) => {
    const segments = [];
    let cursor = index2;
    while (segments.length < limit && cursor < length) {
      const to = readWordRun(cursor);
      if (to === cursor) break;
      segments.push({ from: cursor, to });
      cursor = to;
      const gap = /^[^\S\r\n]+/.exec(source.slice(cursor))?.[0];
      if (gap === void 0) break;
      cursor += gap.length;
    }
    return segments;
  };
  const matchWords = (rule, words, index2) => {
    const fold = (word) => words.caseSensitive ? word : word.toLowerCase();
    const firstTo = readWordRun(index2);
    if (firstTo > index2) {
      if (rule.phrase !== void 0) {
        const segments = readSegments(index2, Math.max(rule.phrase.max ?? 4, 1));
        for (let count = segments.length; count >= 1; count -= 1) {
          const texts = segments.slice(0, count).map((segment) => source.slice(segment.from, segment.to));
          const candidate = texts.join(" ");
          if (words.set.has(fold(candidate))) {
            const last = segments[count - 1];
            if (last !== void 0) return { to: last.to, member: candidate };
          }
        }
      } else {
        const candidate = source.slice(index2, firstTo);
        if (words.set.has(fold(candidate))) return { to: firstTo, member: candidate };
      }
    }
    for (const member of words.literal) {
      if (rule.phrase !== void 0 && /\s/.test(member)) continue;
      if (source.startsWith(member, index2)) return { to: index2 + member.length, member };
    }
    return void 0;
  };
  const anyRuleClaims = (index2, previous) => {
    const openRegion = openRegions[openRegions.length - 1];
    if (openRegion !== void 0) {
      const endMatch = execAt(sticky(openRegion.rule.end), source, index2);
      if (endMatch !== null && endMatch[0].length > 0) return true;
    }
    for (const rule of rules) {
      if (!contextHolds(rule.when, index2, previous)) continue;
      if (rule.kind === "region") {
        const match2 = execAt(sticky(rule.begin), source, index2);
        if (match2 !== null && match2[0].length > 0) return true;
        continue;
      }
      if (rule.kind === "words") {
        if (matchWords(rule, resolveWords(rule.words), index2) !== void 0) return true;
        if (rule.unknown !== void 0 && readWordRun(index2) > index2) return true;
        continue;
      }
      const match = execAt(sticky(rule.pattern), source, index2);
      if (match !== null && match[0].length > 0) return true;
    }
    return false;
  };
  const openRegions = [];
  let index = 0;
  while (index < length) {
    const open = openRegions[openRegions.length - 1];
    if (open !== void 0) {
      const endMatch = execAt(sticky(open.rule.end), source, index);
      if (endMatch !== null && endMatch[0].length > 0) {
        const closeScope = scopeOf(
          open.rule.closeScope ?? open.rule.scope,
          ruleMatch(endMatch[0], index, [...endMatch]),
          open.scope
        );
        push(closeScope, index, index + endMatch[0].length, open.scope);
        index += endMatch[0].length;
        openRegions.pop();
        regionScope = openRegions[openRegions.length - 1]?.scope;
        continue;
      }
      if (open.rule.transparent !== true) {
        if (open.rule.nested === true) {
          const inner = execAt(sticky(open.rule.begin), source, index);
          if (inner !== null && inner[0].length > 0) {
            const innerMatch = ruleMatch(inner[0], index, [...inner]);
            push(
              scopeOf(open.rule.openScope ?? open.rule.scope, innerMatch, open.scope),
              index,
              index + inner[0].length,
              open.scope
            );
            openRegions.push({
              rule: open.rule,
              scope: open.scope,
              beginFrom: index,
              beginTo: index + inner[0].length
            });
            index += inner[0].length;
            continue;
          }
        }
        push(open.scope, index, index + 1, open.scope);
        index += 1;
        continue;
      }
    }
    let matched = false;
    for (const rule of rules) {
      if (!contextHolds(rule.when, index, previousScope)) continue;
      if (rule.kind === "region") {
        const begin = execAt(sticky(rule.begin), source, index);
        if (begin === null || begin[0].length === 0) continue;
        const beginMatch = ruleMatch(begin[0], index, [...begin]);
        const scope = scopeOf(rule.scope, beginMatch, "text");
        const openScope = scopeOf(rule.openScope ?? rule.scope, beginMatch, scope);
        const contentScope = scopeOf(rule.contentScope ?? rule.scope, beginMatch, scope);
        const closeScope = scopeOf(rule.closeScope ?? rule.scope, beginMatch, scope);
        const beginEnd = index + begin[0].length;
        push(openScope, index, beginEnd, regionScope);
        if (rule.nested === true || rule.transparent === true) {
          openRegions.push({ rule, scope: contentScope, beginFrom: index, beginTo: beginEnd });
          regionScope = contentScope;
          index = beginEnd;
          matched = true;
          break;
        }
        const close = findRegionEnd(rule.end, source, beginEnd);
        if (close === void 0) {
          push(
            scopeOf(rule.unclosed?.scope === void 0 ? void 0 : rule.unclosed.scope, beginMatch, contentScope),
            beginEnd,
            length,
            scope
          );
          report({
            from: index,
            to: beginEnd,
            message: rule.unclosed?.message === void 0 ? `Unterminated ${scope}.` : typeof rule.unclosed.message === "function" ? rule.unclosed.message(beginMatch) : rule.unclosed.message,
            severity: rule.unclosed?.severity ?? "error",
            code: rule.unclosed?.code ?? "unclosed-region"
          });
          index = length;
          matched = true;
          break;
        }
        push(contentScope, beginEnd, close.from, scope);
        push(closeScope, close.from, close.to, scope);
        index = close.to;
        matched = true;
        break;
      }
      if (rule.kind === "words") {
        const words = resolveWords(rule.words);
        const vocabulary = asResolvedVocabulary(rule.words);
        const hit = matchWords(rule, words, index);
        if (hit !== void 0) {
          const text = source.slice(index, hit.to);
          const match2 = ruleMatch(text, index, [text]);
          const scope = rule.scope !== void 0 ? scopeOf(rule.scope, match2, "word") : vocabulary?.scopeFor !== void 0 ? vocabulary.scopeFor(hit.member) : "word";
          push(scope, index, hit.to, regionScope);
          index = hit.to;
          matched = true;
          break;
        }
        if (rule.unknown === void 0) continue;
        const candidateTo = readWordRun(index);
        if (candidateTo <= index) continue;
        const word = source.slice(index, candidateTo);
        const rejected = vocabulary?.reject?.(word, vocabularyContext);
        const message = rule.unknown.message === void 0 ? rejected?.message : typeof rule.unknown.message === "function" ? rule.unknown.message(word, ruleMatch(word, index, [word])) : rule.unknown.message.replace(/\{word\}/g, word).replace(/\{allowed\}/g, listPhrase(words.list));
        push(rule.unknown.scope ?? vocabulary?.unknownScope ?? "invalid", index, candidateTo, regionScope);
        if (message !== void 0) {
          report({
            from: index,
            to: candidateTo,
            message,
            severity: rule.unknown.severity ?? rejected?.severity ?? "error",
            code: rule.unknown.code ?? rejected?.code ?? "unknown-word"
          });
        }
        index = candidateTo;
        matched = true;
        break;
      }
      const match = execAt(sticky(rule.pattern), source, index);
      if (match === null || match[0].length === 0) continue;
      const matchInfo = ruleMatch(match[0], index, [...match]);
      push(scopeOf(rule.scope, matchInfo, fallbackScope), index, index + match[0].length, regionScope);
      index += match[0].length;
      matched = true;
      break;
    }
    if (matched) continue;
    const unclaimed = regionScope ?? fallbackScope;
    let to = index;
    let runPrevious = previousScope;
    while (to < length) {
      const char = source.charAt(to);
      if (char === "\n" || char === "\r") break;
      if (anyRuleClaims(to, runPrevious)) break;
      if (/\S/.test(char)) runPrevious = unclaimed;
      to += 1;
    }
    push(unclaimed, index, Math.max(to, index + 1), regionScope);
    index = Math.max(to, index + 1);
  }
  for (let frame = openRegions.length - 1; frame >= 0; frame -= 1) {
    const open = openRegions[frame];
    if (open === void 0) continue;
    const message = open.rule.unclosed?.message === void 0 ? `Unterminated ${open.scope}.` : typeof open.rule.unclosed.message === "function" ? open.rule.unclosed.message(ruleMatch("", open.beginFrom, [""])) : open.rule.unclosed.message;
    report({
      from: open.beginFrom,
      to: open.beginTo,
      message,
      severity: open.rule.unclosed?.severity ?? "error",
      code: open.rule.unclosed?.code ?? "unclosed-region"
    });
  }
  return { tokens, diagnostics, state };
}
function findRegionEnd(pattern, source, from) {
  const probe = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}g`);
  probe.lastIndex = from;
  const match = probe.exec(source);
  if (match === null || match[0].length === 0) return void 0;
  return { from: match.index, to: match.index + match[0].length };
}

// src/core/inspect.ts
function runChecks(source, grammar, tokens, state) {
  const checks = grammar.grammar.checks;
  if (checks === void 0 || checks.length === 0) return [];
  const diagnostics = [];
  const context = { text: source, state };
  for (const check of checks) {
    const members = check.allow === void 0 ? void 0 : resolveWordsSource(check.allow, context);
    const vocabulary = check.allow === void 0 ? void 0 : check.allow;
    const caseSensitive = typeof vocabulary === "object" && vocabulary !== null && !Array.isArray(vocabulary) ? vocabulary.caseSensitive === true : false;
    const fold = (word) => caseSensitive ? word : word.toLowerCase();
    const set = members === void 0 ? void 0 : new Set(members.map((member) => fold(member)));
    const reportedLines = /* @__PURE__ */ new Set();
    for (const token of tokens) {
      if (token.text.trim() === "") continue;
      if (!check.scopes.includes("*") && !check.scopes.includes(token.scope)) continue;
      if (check.except !== void 0 && check.except.test(token.text)) continue;
      if (set !== void 0 && set.has(fold(token.text))) continue;
      if (check.perLine === true) {
        if (reportedLines.has(token.line)) continue;
        reportedLines.add(token.line);
      }
      diagnostics.push({
        from: token.from,
        to: token.to,
        severity: check.severity ?? "error",
        message: check.message.replace(/\{word\}/g, token.text).replace(/\{allowed\}/g, listPhrase(members ?? [])),
        code: check.code,
        detail: check.detail,
        source: grammar.grammar.id
      });
    }
  }
  return diagnostics;
}
function inspect(source, grammar) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const scanned = scan(source, resolved);
  const declared = resolved.grammar;
  const diagnostics = [...scanned.diagnostics];
  diagnostics.push(...runChecks(source, resolved, scanned.tokens, scanned.state));
  if (declared.validate !== void 0) {
    const context = {
      text: source,
      tokens: scanned.tokens,
      state: scanned.state,
      report: (problem) => {
        diagnostics.push({
          from: problem.from,
          to: problem.to,
          severity: problem.severity ?? "error",
          message: problem.message,
          code: problem.code ?? "validate",
          detail: problem.detail,
          source: declared.id
        });
      }
    };
    declared.validate(context);
  }
  const decorations = declared.decorate === void 0 ? [] : [...declared.decorate(source, scanned.state)];
  return {
    text: source,
    tokens: scanned.tokens,
    diagnostics: normalizeDiagnostics(diagnostics),
    decorations: normalizeDecorations(decorations, source.length),
    state: scanned.state
  };
}
function normalizeDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.from}:${diagnostic.to}:${diagnostic.code ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  return out.sort((left, right) => left.from - right.from || left.to - right.to);
}
function normalizeDecorations(decorations, length) {
  const out = [];
  for (const decoration of decorations) {
    const from = Math.max(0, Math.min(decoration.from, length));
    const to = Math.max(from, Math.min(decoration.to, length));
    if (to <= from) continue;
    out.push({ ...decoration, from, to });
  }
  return out.sort((left, right) => left.from - right.from || left.to - right.to);
}

// src/core/segments.ts
var SEVERITY_RANK = { error: 4, warning: 3, info: 2, hint: 1 };
function buildSegments(text, input, fallbackScope = "text") {
  const length = text.length;
  if (length === 0) return [];
  const cuts = /* @__PURE__ */ new Set([0, length]);
  for (const token of input.tokens) {
    cuts.add(Math.max(0, Math.min(token.from, length)));
    cuts.add(Math.max(0, Math.min(token.to, length)));
  }
  for (const decoration of input.decorations) {
    cuts.add(Math.max(0, Math.min(decoration.from, length)));
    cuts.add(Math.max(0, Math.min(decoration.to, length)));
  }
  for (const diagnostic of input.diagnostics) {
    cuts.add(Math.max(0, Math.min(diagnostic.from, length)));
    cuts.add(Math.max(0, Math.min(diagnostic.to, length)));
  }
  const bounds = [...cuts].sort((left, right) => left - right);
  const segments = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index] ?? 0;
    const to = bounds[index + 1] ?? 0;
    if (to <= from) continue;
    const scope = coverScope(input.tokens, from, fallbackScope);
    const decorations = coverDecorations(input.decorations, from, to);
    const severity = coverSeverity(input.diagnostics, from, to);
    const title = input.decorations.find(
      (decoration) => decoration.title !== void 0 && from >= decoration.from && to <= decoration.to
    )?.title;
    const last = segments[segments.length - 1];
    if (last !== void 0 && last.scope === scope && last.severity === severity && last.title === title && sameList(last.decorations, decorations)) {
      last.to = to;
      last.text = text.slice(last.from, to);
      continue;
    }
    segments.push({ from, to, text: text.slice(from, to), scope, decorations, severity, title });
  }
  return segments;
}
function coverScope(tokens, offset, fallback) {
  for (const token of tokens) {
    if (token.from > offset) break;
    if (offset >= token.from && offset < token.to) return token.scope;
  }
  return fallback;
}
function coverDecorations(decorations, from, to) {
  const kinds = [];
  for (const decoration of decorations) {
    if (decoration.from <= from && to <= decoration.to) kinds.push(decoration.kind);
  }
  return kinds;
}
function coverSeverity(diagnostics, from, to) {
  let loudest;
  for (const diagnostic of diagnostics) {
    if (diagnostic.from > from || diagnostic.to < to) continue;
    if (loudest === void 0 || SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[loudest]) {
      loudest = diagnostic.severity;
    }
  }
  return loudest;
}
function sameList(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
function segmentClasses(segment, scopeClass2, decorationClass2, severityClass2) {
  const classes = [scopeClass2(segment.scope)];
  for (const kind of segment.decorations) classes.push(decorationClass2(kind));
  if (segment.severity !== void 0) classes.push(severityClass2(segment.severity));
  return classes;
}

// src/core/rank.ts
var TIER_STRIDE = 1e6;
var TIER = {
  /** The needle is the label, in the same case. */
  exact: 5,
  /** The needle is the label, ignoring case. */
  exactFold: 4,
  /** The label starts with the needle. */
  prefix: 3,
  /**
   * Every needle character either starts a word or continues one the match has
   * already started. This is what makes initials work: `fm` finds `Fira Mono` and
   * `IPM` finds `IBM Plex Mono`, without `IPM` being a substring of anything.
   */
  boundary: 2,
  /** The needle appears as one unbroken run inside the label. */
  substring: 1,
  /** The needle's characters appear in order, with gaps. */
  subsequence: 0
};
var SEPARATORS = /[\s\-_./:@()+[\]]/;
function isWordStart(label, index) {
  if (index <= 0) return index === 0;
  const previous = label.charAt(index - 1);
  if (SEPARATORS.test(previous)) return true;
  const current = label.charAt(index);
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}
function wantsExactCase(needle) {
  return needle !== needle.toLowerCase();
}
function localScore(label, needle, indices, exactCase) {
  let score = 0;
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position];
    if (index === void 0) continue;
    if (index === 0) score += 24;
    else if (isWordStart(label, index)) score += 14;
    if (position > 0 && index === (indices[position - 1] ?? -2) + 1) score += 10;
    if (exactCase && label.charAt(index) === needle.charAt(position)) score += 4;
  }
  const first = indices[0] ?? 0;
  const last = indices[indices.length - 1] ?? 0;
  score -= (last - first + 1 - needle.length) * 1.5;
  score -= first * 2;
  score -= label.length * 0.05;
  return score;
}
function fuzzyMatch(needle, label) {
  if (needle === "") return { score: 0, indices: [], tier: 0 };
  const exactCase = wantsExactCase(needle);
  const haystack = exactCase ? label : label.toLowerCase();
  const query = exactCase ? needle : needle.toLowerCase();
  if (label === needle) {
    return { score: TIER.exact * TIER_STRIDE + localScore(label, needle, range(needle.length), true), indices: range(needle.length), tier: TIER.exact };
  }
  if (label.toLowerCase() === query) {
    const indices = range(needle.length);
    return {
      score: TIER.exactFold * TIER_STRIDE + localScore(label, needle, indices, exactCase),
      indices,
      tier: TIER.exactFold
    };
  }
  if (haystack.startsWith(query)) {
    const indices = range(needle.length);
    return {
      score: TIER.prefix * TIER_STRIDE + localScore(label, needle, indices, exactCase),
      indices,
      tier: TIER.prefix
    };
  }
  let best;
  const consider = (candidate) => {
    if (best === void 0 || candidate.score > best.score) best = candidate;
  };
  for (let at = haystack.indexOf(query); at >= 0; at = haystack.indexOf(query, at + 1)) {
    const indices = range(needle.length, at);
    const tier = isWordStart(label, at) ? TIER.boundary : TIER.substring;
    consider({ score: tier * TIER_STRIDE + localScore(label, needle, indices, exactCase), indices, tier });
  }
  for (let start = 0; start < haystack.length; start += 1) {
    if (haystack.charAt(start) !== query.charAt(0)) continue;
    const indices = [start];
    let cursor = start + 1;
    let complete2 = true;
    for (let position = 1; position < query.length; position += 1) {
      const found = haystack.indexOf(query.charAt(position), cursor);
      if (found < 0) {
        complete2 = false;
        break;
      }
      indices.push(found);
      cursor = found + 1;
    }
    if (!complete2) continue;
    const tier = indicesAreBoundaryish(label, indices) ? TIER.boundary : TIER.subsequence;
    consider({ score: tier * TIER_STRIDE + localScore(label, needle, indices, exactCase), indices, tier });
  }
  return best;
}
function indicesAreBoundaryish(label, indices) {
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position];
    if (index === void 0) continue;
    if (isWordStart(label, index)) continue;
    if (position > 0 && index === (indices[position - 1] ?? -2) + 1) continue;
    return false;
  }
  return true;
}
function range(count, from = 0) {
  const out = [];
  for (let index = 0; index < count; index += 1) out.push(from + index);
  return out;
}
function rank(items, needle, options) {
  const out = [];
  for (const item of items) {
    if (needle === "") {
      out.push({ item, score: 0, indices: [] });
      continue;
    }
    const label = options.label(item);
    const subject = options.filterText?.(item) ?? label;
    const match = fuzzyMatch(needle, subject);
    if (match === void 0) continue;
    out.push({ item, score: match.score, indices: subject === label ? match.indices : [] });
  }
  if (options.sortText === void 0) {
    out.sort((left, right) => right.score - left.score);
    return out;
  }
  return out.sort((left, right) => {
    const leftKey = options.sortText?.(left.item) ?? options.label(left.item);
    const rightKey = options.sortText?.(right.item) ?? options.label(right.item);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : right.score - left.score;
  });
}
function highlightSegments(label, indices) {
  if (indices.length === 0) return label === "" ? [] : [{ text: label, matched: false }];
  const marked = new Set(indices);
  const segments = [];
  let current;
  for (let index = 0; index < label.length; index += 1) {
    const matched = marked.has(index);
    if (current === void 0 || current.matched !== matched) {
      if (current !== void 0) segments.push(current);
      current = { text: "", matched };
    }
    current.text += label.charAt(index);
  }
  if (current !== void 0) segments.push(current);
  return segments;
}

// src/core/complete.ts
var DEFAULT_LIMIT = 100;
function complete(inspection, grammar, request) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const sources = resolved.grammar.compose;
  if (sources === void 0 || sources.length === 0) return void 0;
  const text = request.text;
  const caret = clamp(request.caret, 0, text.length);
  const context = completionContext(inspection, resolved, caret, request.trigger);
  const eligible = sources.filter((source) => source.when === void 0 || source.when(context));
  if (eligible.length === 0) return void 0;
  const ordered = [...eligible].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const reopening = request.previousSourceId === void 0 ? void 0 : ordered.find((source) => source.id === request.previousSourceId);
  const winner = reopening ?? ordered[0];
  if (winner === void 0) return void 0;
  const range2 = resolveRange(winner, context);
  const merged = [...winner.items(context)];
  for (const source of ordered) {
    if (source === winner || source.merge !== true) continue;
    merged.push(...source.items(context));
  }
  if (merged.length === 0) return void 0;
  const needleFrom = clamp(range2.from, 0, caret);
  const needleTo = clamp(caret, needleFrom, Math.max(range2.to, needleFrom));
  const needle = text.slice(needleFrom, needleTo);
  const ranked = rank(merged, needle, {
    label: (item) => item.label,
    ...merged.some((item) => item.filterText !== void 0) ? { filterText: (item) => item.filterText ?? item.label } : {},
    ...merged.some((item) => item.sortText !== void 0) ? { sortText: (item) => item.sortText } : {}
  });
  const limit = request.limit ?? DEFAULT_LIMIT;
  return {
    range: range2,
    rows: ranked.slice(0, limit).map((entry) => ({
      item: entry.item,
      score: entry.score,
      indices: entry.indices
    })),
    needle,
    sourceId: winner.id
  };
}
function resolveRange(source, context) {
  if (typeof source.range !== "function") return source.range;
  const range2 = source.range(context);
  return {
    from: Math.min(range2.from, range2.to),
    to: Math.max(range2.from, range2.to)
  };
}
function completionContext(inspection, resolved, caret, trigger) {
  const { text, tokens, diagnostics, state } = inspection;
  const line = lineAt(text, caret, lineStarts(text));
  const lineTokens = tokensOnLine(tokens, line.number);
  const word = wordInfoAt(text, caret, resolved.wordChars);
  return {
    text,
    caret,
    word,
    line,
    tokens,
    diagnostics,
    state,
    scope: scopeAt(tokens, caret),
    scopeBefore: tokenBefore(tokens, caret)?.scope,
    // "First on line" means only whitespace precedes the caret, which is a question
    // about the caret and not about the token under it: a caret in the indentation of
    // a line that already has content is not first on that line. `lineTokens` is what
    // tells the difference, so the tokens are read even though the answer looks like a
    // string test.
    firstOnLine: line.before.trim() === "" && !lineTokens.some((token) => token.to <= caret),
    // "First word" additionally allows the rest of the word the caret is in, which is
    // what keeps a line-head completion alive while the head is being typed.
    firstWord: line.text.slice(0, Math.max(0, word.from - line.from)).trim() === "",
    firstToken: lineTokens[0],
    trigger
  };
}
function applyCompletion(text, range2, item) {
  const from = clamp(Math.min(range2.from, range2.to), 0, text.length);
  const to = clamp(Math.max(range2.from, range2.to), from, text.length);
  const insert = item.insert ?? item.label;
  const append = item.append ?? "";
  const offset = item.caretOffset ?? 0;
  if (item.mode === "before") {
    const head2 = text.slice(0, from);
    const gap = head2 !== "" && !/\s$/.test(head2) ? " " : "";
    const rest2 = text.slice(from).replace(/^\s+/, "");
    const written2 = `${gap}${insert}${redundant(append, rest2) ? "" : append}`;
    return {
      text: `${head2}${written2}${rest2}`,
      caret: head2.length + written2.length + offset,
      range: { from: head2.length, to: head2.length + written2.length },
      from,
      to: from,
      insert: written2
    };
  }
  const head = text.slice(0, from);
  const rest = text.slice(to);
  const written = `${insert}${redundant(append, rest) ? "" : append}`;
  return {
    text: `${head}${written}${rest}`,
    caret: head.length + written.length + offset,
    range: { from: head.length, to: head.length + written.length },
    from,
    to,
    insert: written
  };
}
function redundant(append, rest) {
  if (append === "") return true;
  return append.trim() === "" ? /^\s/.test(rest) : rest.startsWith(append);
}

// src/core/hover.ts
var SEVERITY_TITLE = {
  error: "Error",
  warning: "Warning",
  info: "Info",
  hint: "Hint"
};
function diagnosticHover(diagnostic) {
  return {
    kind: "diagnostic",
    title: SEVERITY_TITLE[diagnostic.severity],
    detail: diagnostic.source,
    body: diagnostic.detail === void 0 ? diagnostic.message : `${diagnostic.message}

${diagnostic.detail}`,
    range: { from: diagnostic.from, to: diagnostic.to }
  };
}
function resolveHover(inspection, grammar, offset) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const { text, tokens, diagnostics, decorations, state } = inspection;
  let covering;
  for (const diagnostic of diagnostics) {
    if (!containsOffset(diagnostic, offset)) continue;
    if (covering === void 0 || diagnostic.to - diagnostic.from < covering.to - covering.from) {
      covering = diagnostic;
    }
  }
  if (covering !== void 0) return diagnosticHover(covering);
  const decoration = decorations.find((entry) => containsOffset(entry, offset));
  const described = describeAt(inspection, resolved, offset);
  if (decoration?.title !== void 0) {
    return {
      kind: "decoration",
      title: decoration.title,
      detail: described?.detail ?? described?.title,
      body: described?.body,
      range: { from: decoration.from, to: decoration.to }
    };
  }
  return described;
}
function describeAt(inspection, resolved, offset) {
  if (resolved.grammar.describe === void 0) return void 0;
  const { text, tokens, diagnostics, state } = inspection;
  const found = tokenAt(tokens, offset);
  const token = found === void 0 || found.text.trim() === "" ? void 0 : found;
  const context = {
    text,
    offset,
    token,
    word: wordInfoAt(text, offset, resolved.wordChars),
    line: lineAt(text, offset, lineStarts(text)),
    tokens,
    diagnostics,
    state
  };
  return resolved.grammar.describe(context) ?? void 0;
}

// src/core/grammar.ts
function defineGrammar(grammar) {
  return grammar;
}
function defineCompletion(source) {
  return source;
}

// src/styles.ts
var SCOPE_PALETTE = [
  { scope: "text", light: "var(--litearea-fg)" },
  { scope: "word", light: "var(--litearea-fg)" },
  { scope: "family", light: "var(--litearea-fg)" },
  { scope: "family-generic", light: "#7c3aed", dark: "#c4a2ff" },
  { scope: "family-unknown", light: "var(--litearea-warning)" },
  { scope: "family-unclosed", light: "var(--litearea-error)" },
  { scope: "weight", light: "var(--litearea-accent)" },
  { scope: "weight-missing", light: "var(--litearea-warning)" },
  { scope: "state", light: "var(--litearea-accent)" },
  { scope: "property", light: "#7c3aed", dark: "#c4a2ff" },
  { scope: "operator", light: "var(--litearea-fg-dim)" },
  { scope: "separator", light: "var(--litearea-fg-dim)" },
  { scope: "value-shape", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-color", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-pattern", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-motion", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-number", light: "#b45309", dark: "#fbbf24" },
  { scope: "comment", light: "var(--litearea-fg-dim)" },
  { scope: "invalid", light: "var(--litearea-error)" },
  { scope: "keyword", light: "var(--litearea-accent)" },
  { scope: "string", light: "#0f766e", dark: "#5eead4" },
  { scope: "number", light: "#b45309", dark: "#fbbf24" }
];
function scopeVariables(scheme) {
  return SCOPE_PALETTE.filter((entry) => scheme === "light" || entry.dark !== void 0).map((entry) => {
    const value = scheme === "light" ? entry.light : entry.dark;
    return `  --litearea-scope-${entry.scope}: ${String(value)};`;
  }).join("\n");
}
function scopeRules() {
  return SCOPE_PALETTE.map(
    (entry) => `.litearea-scope-${entry.scope} { color: var(--litearea-scope-${entry.scope}); }`
  ).join("\n");
}
var LITEAREA_STYLES = `
.litearea {
  --litearea-font: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --litearea-font-size: 13px;
  --litearea-line-height: 20px;
  --litearea-padding-block: 6px;
  --litearea-padding-inline: 10px;
  --litearea-radius: 8px;
  --litearea-fg: #1f2328;
  --litearea-fg-dim: #6b7280;
  --litearea-fg-strong: #111827;
  --litearea-bg: #ffffff;
  --litearea-bg-raised: #ffffff;
  --litearea-border: #d8dbe0;
  --litearea-border-focus: #4d6bfe;
  --litearea-accent: #4d6bfe;
  --litearea-accent-soft: rgba(77, 107, 254, 0.12);
  --litearea-selection: rgba(77, 107, 254, 0.22);
  --litearea-error: #e5484d;
  --litearea-warning: #d97706;
  --litearea-info: #4d6bfe;
  --litearea-hint: #8b8f97;
  --litearea-shadow: 0 6px 24px rgba(15, 23, 42, 0.14);

${scopeVariables("light")}

  position: relative;
  display: block;
  color: var(--litearea-fg);
}

@media (prefers-color-scheme: dark) {
  .litearea {
    --litearea-fg: #e6e8eb;
    --litearea-fg-dim: #8b919b;
    --litearea-fg-strong: #ffffff;
    --litearea-bg: #1b1e24;
    --litearea-bg-raised: #23262c;
    --litearea-border: #363b44;
${scopeVariables("dark")}
    --litearea-error: #ff6b6b;
    --litearea-warning: #f59e0b;
    --litearea-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
}

/* \u2500\u2500 the box \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.litearea-box {
  position: relative;
  display: block;
  border: 1px solid var(--litearea-border);
  border-radius: var(--litearea-radius);
  background: var(--litearea-bg);
  transition: border-color 120ms ease;
}

.litearea-box:focus-within {
  border-color: var(--litearea-border-focus);
}

.litearea-invalid .litearea-box {
  border-color: var(--litearea-error);
}

/*
 * The layer and the field share this rule and nothing may be added to one alone.
 * Every property here is a property the mirror copies too \u2014 three elements, one
 * typography, or the paint drifts.
 */
.litearea-layer,
.litearea-input {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: var(--litearea-padding-block) var(--litearea-padding-inline);
  border: none;
  font-family: var(--litearea-font);
  font-size: var(--litearea-font-size);
  font-weight: 400;
  font-style: normal;
  font-stretch: normal;
  font-variant-ligatures: none;
  font-kerning: none;
  font-feature-settings: "liga" 0, "calt" 0, "dlig" 0;
  line-height: var(--litearea-line-height);
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  text-indent: 0;
  text-align: left;
  direction: ltr;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.litearea-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

/*
 * When the box is clamped to its maximum height the field grows a scrollbar, and a
 * scrollbar narrows the text. If the layer kept the full width it would wrap
 * differently from the field and every colour would slide off its character, so the
 * field's measured scrollbar width is published as --litearea-scrollbar and added
 * here. The value is 0 whenever no scrollbar is shown.
 */
.litearea-layer {
  padding-right: calc(var(--litearea-padding-inline) + var(--litearea-scrollbar, 0px));
}

.litearea-paint {
  position: relative;
  min-height: 100%;
  /* A zero-width space keeps the layer's last line box as tall as the field's:
     a trailing newline would otherwise collapse in the paint alone, and the box
     would jump the moment one was typed. */
  will-change: transform;
}

.litearea-input {
  position: relative;
  display: block;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--litearea-fg);
  outline: none;
  overflow-y: hidden;
}

.litearea-growable .litearea-input {
  resize: none;
}

.litearea-resizable .litearea-input {
  resize: vertical;
}

.litearea-input::placeholder {
  color: var(--litearea-fg-dim);
}

.litearea-input::selection {
  background: var(--litearea-selection);
}

.litearea-readonly .litearea-input {
  caret-color: transparent;
}

/*
 * The rules that spend the variables, generated from the same list that declares them. There is
 * deliberately NO catch-all rule setting a property on every painted span: there was one, and a
 * class plus an element outranks a bare class on specificity, so it silently switched off every
 * squiggle in the library.
 *
 * A scope that is not in the list gets no colour from here, and a host writing a grammar of its
 * own styles it with a plain rule \u2014 .litearea-scope-my-thing { color: \u2026 } \u2014 since nothing in
 * this file competes for that selector.
 */
${scopeRules()}

.litearea-dec-effective {
  border-radius: 3px;
  background: var(--litearea-accent-soft);
  box-shadow: 0 0 0 1px var(--litearea-accent-soft);
}

/* The four shapes a diagnostic can take. Wavy for the two that mean "fix this", dotted for
   the two that mean "worth knowing" \u2014 the same distinction VSCode draws, and the reason
   severity is a class rather than an inline colour. */
.litearea-diag-error {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--litearea-error);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-warning {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--litearea-warning);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-info {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--litearea-info);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-hint {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--litearea-hint);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

/* \u2500\u2500 the completion list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

/*
 * The container holds two things and scrolls NEITHER of them: the list scrolls itself, and the
 * documentation is pinned below it. Putting the documentation inside the scroll range \u2014 which is
 * what this used to do \u2014 makes it unreachable with a long list and a long explanation: the
 * arrows move the active row rather than the scrollbar, so a keyboard user never sees it, and a
 * mouse user has to scroll down to read it and back up to reach the next row.
 */
.litearea-popup {
  position: absolute;
  z-index: 30;
  display: none;
  flex-direction: column;
  max-width: 460px;
  padding: 4px;
  border: 1px solid var(--litearea-border);
  border-radius: 10px;
  background: var(--litearea-bg-raised);
  box-shadow: var(--litearea-shadow);
  font-family: var(--litearea-font);
  font-size: 12px;
  line-height: 18px;
  color: var(--litearea-fg);
  overflow: hidden;
}

.litearea-popup[data-open="true"] {
  display: flex;
}

/* The rows, and the only part that scrolls. Its height is bounded so the documentation below
   always has somewhere to live. */
.litearea-list {
  min-height: 0;
  max-height: 208px;
  overflow-y: auto;
}

/*
 * The explanation, pinned. Its own height is bounded and it scrolls ITSELF, so a long
 * explanation stays readable while the rows stay put \u2014 and arrowing to the next row swaps the
 * text in place instead of requiring a scroll back up.
 */
.litearea-docs {
  flex: none;
  max-height: 132px;
  overflow-y: auto;
  margin: 4px -4px -4px;
  padding: 6px 10px;
  border-top: 1px solid var(--litearea-border);
  background: var(--litearea-bg);
  border-radius: 0 0 10px 10px;
  color: var(--litearea-fg);
  white-space: pre-wrap;
}

.litearea-popup[data-docs="false"] .litearea-docs {
  display: none;
}

.litearea-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.litearea-row[aria-selected="true"] {
  background: var(--litearea-accent-soft);
}

.litearea-rowKind {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--litearea-fg-dim);
  transform: translateY(-1px);
}

.litearea-kind-family { background: var(--litearea-scope-family-generic); }
.litearea-kind-generic { background: var(--litearea-scope-family-generic); }
.litearea-kind-weight { background: var(--litearea-scope-weight); }
.litearea-kind-state { background: var(--litearea-scope-state); }
.litearea-kind-property { background: var(--litearea-scope-property); }
.litearea-kind-value { background: var(--litearea-scope-value-shape); }
.litearea-kind-number { background: var(--litearea-scope-value-number); }
.litearea-kind-custom { background: var(--litearea-fg-dim); }

.litearea-rowLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.litearea-rowMatch {
  color: var(--litearea-accent);
  font-weight: 600;
}

.litearea-rowDetail {
  flex: none;
  color: var(--litearea-fg-dim);
  font-size: 11px;
}

.litearea-docsTitle {
  font-weight: 600;
}

.litearea-docsDetail {
  color: var(--litearea-fg-dim);
}

.litearea-docsBody {
  margin-top: 2px;
  color: var(--litearea-fg-dim);
}

/* \u2500\u2500 the hover tooltip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.litearea-tooltip {
  position: absolute;
  z-index: 40;
  display: none;
  max-width: 340px;
  padding: 6px 10px;
  border: 1px solid var(--litearea-border);
  border-radius: 8px;
  background: var(--litearea-bg-raised);
  box-shadow: var(--litearea-shadow);
  font-family: var(--litearea-font);
  font-size: 11px;
  line-height: 16px;
  color: var(--litearea-fg);
  pointer-events: none;
  white-space: pre-wrap;
}

.litearea-tooltip[data-open="true"] {
  display: block;
}

.litearea-tooltipTitle {
  font-weight: 600;
}

.litearea-tooltipDetail {
  color: var(--litearea-fg-dim);
}

.litearea-tooltipBody {
  margin-top: 3px;
  color: var(--litearea-fg-dim);
}

.litearea-srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`.trim();
function injectStyles(ownerDocument, nonce) {
  if (ownerDocument === null || ownerDocument === void 0) return void 0;
  const existing = ownerDocument.querySelector("style[data-litearea-styles]");
  if (existing !== null) return existing;
  const style = ownerDocument.createElement("style");
  style.dataset.liteareaStyles = "";
  if (nonce !== void 0) style.nonce = nonce;
  style.textContent = LITEAREA_STYLES;
  const head = ownerDocument.head ?? ownerDocument.documentElement;
  if (head === null || head === void 0) return void 0;
  head.appendChild(style);
  return style;
}
function scopeClass(scope) {
  const folded = scope.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return folded === "" ? "litearea-scope-text" : `litearea-scope-${folded}`;
}
function decorationClass(kind) {
  return `litearea-dec-${kind.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
function severityClass(severity) {
  return `litearea-diag-${severity.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

// src/dom/support.ts
function hasDocument() {
  return typeof document !== "undefined" && document !== null;
}
function canEditThroughPipeline() {
  return hasDocument() && typeof document.execCommand === "function";
}
function hasCaretHitTest() {
  if (!hasDocument()) return false;
  const probe = document;
  return typeof probe.caretPositionFromPoint === "function" || typeof probe.caretRangeFromPoint === "function";
}
function offsetFromPoint(x, y) {
  if (!hasDocument()) return void 0;
  const probe = document;
  if (typeof probe.caretPositionFromPoint === "function") {
    const position = probe.caretPositionFromPoint(x, y);
    if (position !== null && position !== void 0) return position.offset;
    return void 0;
  }
  if (typeof probe.caretRangeFromPoint === "function") {
    const range2 = probe.caretRangeFromPoint(x, y);
    if (range2 !== null && range2 !== void 0) return range2.startOffset;
  }
  return void 0;
}
function withDefaults(defaults, given) {
  if (given === void 0) return { ...defaults };
  const merged = { ...defaults };
  for (const key of Object.keys(given)) {
    const value = given[key];
    if (value !== void 0) merged[key] = value;
  }
  return merged;
}

// src/dom/editing.ts
function readSelection(field) {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  return { start, end };
}
function writeSelection(field, start, end = start) {
  const length = field.value.length;
  const from = clamp(Math.min(start, end), 0, length);
  const to = clamp(Math.max(start, end), from, length);
  field.setSelectionRange(from, to);
}
function fieldLineHeight(field) {
  const styles = field.ownerDocument.defaultView?.getComputedStyle(field);
  if (styles === null || styles === void 0) return 0;
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.2 : 0;
}
function replaceThroughPipeline(field, from, to, text) {
  const start = clamp(Math.min(from, to), 0, field.value.length);
  const end = clamp(Math.max(from, to), start, field.value.length);
  if (start === end && text === "") return "unchanged";
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  writeSelection(field, start, end);
  const before = field.value;
  if (canEditThroughPipeline()) {
    try {
      field.ownerDocument.execCommand("insertText", false, text);
    } catch {
    }
    if (field.value !== before) return "pipeline";
  }
  field.setRangeText(text, start, end, "end");
  if (field.value === before) return "unchanged";
  dispatchInput(field, text);
  return "direct";
}
function dispatchInput(field, text) {
  const view = field.ownerDocument.defaultView;
  const InputEventCtor = view === null ? void 0 : view.InputEvent;
  if (typeof InputEventCtor === "function") {
    field.dispatchEvent(
      new InputEventCtor("input", { bubbles: true, inputType: "insertText", data: text })
    );
    return;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
function undoField(field) {
  if (!canEditThroughPipeline()) return false;
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  try {
    return field.ownerDocument.execCommand("undo");
  } catch {
    return false;
  }
}
function redoField(field) {
  if (!canEditThroughPipeline()) return false;
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  try {
    return field.ownerDocument.execCommand("redo");
  } catch {
    return false;
  }
}
function writeDocument(field, next, preserveHistory = false) {
  if (field.value === next) return "unchanged";
  if (preserveHistory) return replaceThroughPipeline(field, 0, field.value.length, next);
  field.value = next;
  writeSelection(field, next.length, next.length);
  return "direct";
}

// src/dom/mirror.ts
var COPIED_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariantLigatures",
  "fontKerning",
  "fontFeatureSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textAlign",
  "direction",
  "tabSize",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "hyphens",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "boxSizing"
];
var SENTINEL = "\u200B";
var TextMirror = class {
  /** The measuring element. Kept out of the document's flow by `position: fixed`. */
  element;
  document;
  view;
  /** The field this mirror is currently shaped like. */
  adopted;
  /** The line height measured with the field, or 0 before the first measurement. */
  measuredLineHeight = 0;
  /**
   * @param ownerDocument - the document to create the element in.
   */
  constructor(ownerDocument) {
    this.document = ownerDocument;
    this.view = ownerDocument.defaultView ?? void 0;
    this.element = ownerDocument.createElement("div");
    this.element.setAttribute("aria-hidden", "true");
    this.element.dataset.liteareaPart = "mirror";
    this.element.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "visibility:hidden",
      "pointer-events:none",
      "z-index:-1",
      "margin:0",
      "overflow:hidden",
      "white-space:pre-wrap",
      "overflow-wrap:break-word",
      "word-break:break-word",
      "box-sizing:border-box"
    ].join(";");
  }
  /** Whether the mirror is in a document. */
  get mounted() {
    return this.element.isConnected;
  }
  /**
   * Mount the mirror, once, so measurements have a layout to read.
   * @param parent - where to mount it. The body is right unless the document has none.
   */
  mount(parent) {
    if (this.mounted) return;
    const host = parent ?? this.document.body ?? this.document.documentElement;
    if (host === null || host === void 0) return;
    host.appendChild(this.element);
  }
  /**
   * Shape the mirror like a field.
   *
   * The width is the interesting part. It has to be the field's CONTENT width, or
   * text wraps in one and not the other — and the field's `clientWidth` is its
   * content plus padding but NOT its border, while the mirror is `border-box`. So
   * the borders are added back, and what is deliberately left out is the
   * scrollbar: a field clamped to its maximum height has one, and the text wraps
   * inside the narrower area above it.
   * @param field - the textarea to imitate.
   */
  adopt(field) {
    this.mount();
    this.adopted = field;
    const view = this.view;
    if (view === null || view === void 0) return;
    const styles = view.getComputedStyle(field);
    for (const property of COPIED_PROPERTIES) {
      this.element.style.setProperty(
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        styles.getPropertyValue(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
      );
    }
    const borderLeft = Number.parseFloat(styles.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(styles.borderRightWidth) || 0;
    this.element.style.width = `${String(field.clientWidth + borderLeft + borderRight)}px`;
    this.measuredLineHeight = 0;
  }
  /**
   * The line height in force, measured rather than assumed.
   *
   * `line-height: normal` is a real value and a common one, and it cannot be read
   * as a number — `parseFloat('normal')` is `NaN`. So it is measured by laying one
   * line of text out and taking the height, which is also the only way to be right
   * about a font whose normal leading is not 1.2.
   * @param field - the field to measure against.
   * @returns the line height in pixels.
   */
  lineHeight(field) {
    if (this.measuredLineHeight > 0) return this.measuredLineHeight;
    const view = this.view;
    if (view === null || view === void 0) return 0;
    const styles = view.getComputedStyle(field);
    const declared = Number.parseFloat(styles.lineHeight);
    if (Number.isFinite(declared) && declared > 0) {
      this.measuredLineHeight = declared;
      return declared;
    }
    this.adopt(field);
    this.setText("M");
    const padding = this.verticalPadding();
    const height = this.element.getBoundingClientRect().height - padding;
    const fontSize = Number.parseFloat(styles.fontSize);
    const fallback = (Number.isFinite(fontSize) ? fontSize : 16) * 1.2;
    this.measuredLineHeight = height > 0 ? height : fallback;
    return this.measuredLineHeight;
  }
  /** The mirror's vertical padding plus border, which every height includes. */
  verticalPadding() {
    const view = this.view;
    if (view === null || view === void 0) return 0;
    const styles = view.getComputedStyle(this.element);
    const sum = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0) + (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    return sum;
  }
  /**
   * Put text in the mirror with nothing else in it.
   * @param text - the content.
   */
  setText(text) {
    this.element.textContent = text;
  }
  /**
   * The height a field needs to show a document without scrolling.
   *
   * The trailing-newline problem is handled here. A div with `white-space:
   * pre-wrap` and content ending in `\n` does not lay out a final empty line — the
   * newline breaks the line but nothing follows it — so the measured height comes
   * back one line short and the field grows a scrollbar exactly when the user
   * presses Enter at the end. A zero-width space after the newline gives that last
   * line something to be.
   * @param field - the field being sized.
   * @param value - the text it holds.
   * @returns the border-box height the content requires.
   */
  contentHeight(field, value) {
    this.adopt(field);
    const needsSentinel = value === "" || value.endsWith("\n") || value.endsWith("\r");
    this.setText(needsSentinel ? `${value}${SENTINEL}` : value);
    return this.element.getBoundingClientRect().height;
  }
  /**
   * Where the caret sits, in pixels relative to the field's border box.
   *
   * The trick is a marker element holding the character AFTER the caret, measured
   * against the mirror. Everything before the caret lays out normally, so the
   * marker lands exactly where the next glyph will be — which is where the caret
   * is. At the end of the document there is no next character, so a zero-width
   * space stands in for it.
   *
   * The field's own scroll offset is subtracted, because the caret's position on
   * screen is what the popup has to be placed against, and a scrolled field moves
   * its text without moving its border box.
   *
   * @param field - the field the caret is in.
   * @param offset - the caret's character offset.
   * @returns the caret box, or undefined when there is no layout to measure.
   */
  caretBox(field, offset) {
    const view = this.view;
    if (view === null || view === void 0) return void 0;
    this.adopt(field);
    const value = field.value;
    const position = clamp(offset, 0, value.length);
    const before = value.slice(0, position);
    const after = value.slice(position);
    const next = after === "" ? SENTINEL : after.charAt(0);
    this.element.textContent = "";
    this.element.appendChild(this.document.createTextNode(before));
    const marker = this.document.createElement("span");
    marker.textContent = next;
    marker.style.whiteSpace = "pre";
    this.element.appendChild(marker);
    this.element.appendChild(this.document.createTextNode(after.slice(next.length)));
    const mirrorRect = this.element.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = this.lineHeight(field);
    return {
      x: markerRect.left - mirrorRect.left - field.scrollLeft,
      y: markerRect.top - mirrorRect.top - field.scrollTop,
      height: markerRect.height > 0 ? markerRect.height : lineHeight,
      lineHeight
    };
  }
  /** Take the mirror out of the document. */
  destroy() {
    this.element.remove();
    this.adopted = void 0;
  }
  /**
   * The field this mirror was last shaped like.
   * @returns the field, or undefined before {@link adopt}.
   */
  get field() {
    return this.adopted;
  }
};

// src/dom/overlay.ts
var Overlay = class {
  /** The scroll container. Same box as the field. */
  element;
  /** The element the spans are written into. */
  paint;
  document;
  classNames;
  /** What was painted last, so an unchanged document is not repainted. */
  paintedText;
  paintedKey = "";
  /**
   * @param ownerDocument - the document to build in.
   * @param classNames - the three class-name mappings.
   */
  constructor(ownerDocument, classNames) {
    this.document = ownerDocument;
    this.classNames = classNames;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-layer";
    this.element.setAttribute("aria-hidden", "true");
    this.element.dataset.liteareaPart = "layer";
    this.paint = ownerDocument.createElement("div");
    this.paint.className = "litearea-paint";
    this.element.appendChild(this.paint);
  }
  /**
   * Paint a document.
   *
   * `key` is whatever the caller knows changed. When it and the text both match
   * the last call the work is skipped, which is what keeps a caret move or a
   * mouse hover from rebuilding every span on the page.
   * @param text - the document.
   * @param input - the tokens, decorations, and diagnostics.
   * @param key - a cheap signature of everything that affects the paint.
   * @param fallbackScope - the scope for characters no token covers.
   */
  render(text, input, key, fallbackScope = "text") {
    if (this.paintedText === text && this.paintedKey === key) return;
    const segments = buildSegments(text, input, fallbackScope);
    const fragment = this.document.createDocumentFragment();
    for (const segment of segments) {
      const span = this.document.createElement("span");
      span.className = segmentClasses(
        segment,
        this.classNames.scope,
        this.classNames.decoration,
        this.classNames.severity
      ).join(" ");
      if (segment.title !== void 0) span.title = segment.title;
      span.textContent = segment.text;
      fragment.appendChild(span);
    }
    this.paint.replaceChildren(fragment);
    this.paintedText = text;
    this.paintedKey = key;
  }
  /**
   * Follow the field's scroll position.
   *
   * The layer is `overflow: hidden` and its content is taller than its box exactly
   * when the field is: an auto-grown field has nothing to scroll and a field
   * clamped to its maximum height has everything to scroll. Copying the offset is
   * therefore enough, and it is more reliable than a transform, which can leave
   * the text on a half pixel.
   * @param field - the textarea.
   */
  syncScroll(field) {
    if (this.element.scrollTop !== field.scrollTop) this.element.scrollTop = field.scrollTop;
    if (this.element.scrollLeft !== field.scrollLeft) this.element.scrollLeft = field.scrollLeft;
  }
  /** Forget what was painted, so the next render rebuilds. */
  invalidate() {
    this.paintedText = void 0;
    this.paintedKey = "";
  }
  /** Take the layer out of the document. */
  destroy() {
    this.element.remove();
    this.paint.replaceChildren();
  }
};

// src/dom/popup.ts
var Popup = class {
  /** The positioned container. */
  element;
  /** The scrolling element, which holds the rows and nothing else. */
  list;
  document;
  handlers;
  rows = [];
  active = -1;
  open = false;
  showDocs = true;
  docs;
  prefix;
  /**
   * @param ownerDocument - the document to build in.
   * @param handlers - how to report a pick and a hover.
   * @param idPrefix - a stable prefix for row ids, so two editors do not collide.
   */
  constructor(ownerDocument, handlers, idPrefix) {
    this.document = ownerDocument;
    this.handlers = handlers;
    this.prefix = idPrefix;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-popup";
    this.element.dataset.liteareaPart = "popup";
    this.element.dataset.open = "false";
    this.list = ownerDocument.createElement("div");
    this.list.className = "litearea-list";
    this.list.setAttribute("role", "listbox");
    this.list.id = `${idPrefix}-listbox`;
    this.element.appendChild(this.list);
    this.docs = ownerDocument.createElement("div");
    this.docs.className = "litearea-docs";
    this.docs.hidden = true;
    this.element.appendChild(this.docs);
    this.list.addEventListener("mousedown", this.onMouseDown);
    this.list.addEventListener("mousemove", this.onMouseMove);
  }
  /** Whether the list is showing. */
  get isOpen() {
    return this.open;
  }
  /** The active row's index, or -1. */
  get activeIndex() {
    return this.active;
  }
  /** The rows currently shown. */
  get items() {
    return this.rows;
  }
  /** The active row, when there is one. */
  get activeRow() {
    return this.rows[this.active];
  }
  /** The id the field's `aria-controls` should name. It is the list, not the container. */
  get listId() {
    return this.list.id;
  }
  /**
   * The id of the active row, for the field's `aria-activedescendant`.
   *
   * The list does not write that attribute itself: the field belongs to the editor, and a
   * floating list reaching out of its own subtree to find it is the kind of coupling that
   * breaks the moment the two are mounted somewhere unexpected.
   * @returns the row id, or undefined when no row is active.
   */
  get activeRowId() {
    return this.active >= 0 ? this.rowId(this.active) : void 0;
  }
  /**
   * Show a list.
   * @param rows - the rows, already ranked.
   * @param active - the row to make active.
   * @param showDocs - whether to render the documentation panel.
   */
  show(rows, active, showDocs) {
    this.rows = rows;
    this.active = active;
    this.showDocs = showDocs;
    this.open = true;
    this.element.dataset.open = "true";
    this.element.dataset.docs = showDocs ? "true" : "false";
    this.list.scrollTop = 0;
    this.render();
  }
  /** Hide the list and forget its rows. */
  close() {
    if (!this.open) return;
    this.open = false;
    this.active = -1;
    this.rows = [];
    this.element.dataset.open = "false";
    this.list.replaceChildren();
    this.docs.hidden = true;
    this.docs.replaceChildren();
  }
  /**
   * Make a row active without rebuilding the list.
   * @param index - the row index.
   */
  setActive(index) {
    if (index === this.active) return;
    const previous = this.list.querySelector(`#${this.rowId(this.active)}`);
    if (previous !== null) previous.setAttribute("aria-selected", "false");
    this.active = index;
    const next = this.list.querySelector(`#${this.rowId(index)}`);
    if (next !== null) {
      next.setAttribute("aria-selected", "true");
      const top = next.offsetTop;
      const bottom = top + next.offsetHeight;
      if (top < this.list.scrollTop) this.list.scrollTop = top;
      else if (bottom > this.list.scrollTop + this.list.clientHeight) {
        this.list.scrollTop = bottom - this.list.clientHeight;
      }
    }
    this.renderDocs();
  }
  /**
   * Place the list under an anchor, flipping above it when there is no room below.
   *
   * The container's own box is what is measured, so the documentation panel counts towards the
   * height and a popup whose rows and explanation together would run off the bottom flips as a
   * whole rather than being cut in half.
   * @param anchor - the caret's box, in the container's coordinates.
   * @param container - the element the list is positioned against.
   * @param viewport - the visible area to stay inside.
   */
  place(anchor, container, viewport) {
    const box = this.element.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const gap = 4;
    let top = anchor.y + anchor.height + gap;
    if (containerBox.top + top + box.height > viewport.height - gap) {
      const above = anchor.y - box.height - gap;
      if (containerBox.top + above >= gap) top = above;
    }
    let left = anchor.x;
    const maxLeft = containerBox.width - box.width;
    if (left > maxLeft) left = Math.max(0, maxLeft);
    this.element.style.top = `${String(Math.round(top))}px`;
    this.element.style.left = `${String(Math.round(left))}px`;
  }
  /** Take the list out of the document. */
  destroy() {
    this.list.removeEventListener("mousedown", this.onMouseDown);
    this.list.removeEventListener("mousemove", this.onMouseMove);
    this.element.remove();
    this.list.replaceChildren();
    this.docs.replaceChildren();
  }
  /** The DOM id of a row, which `aria-activedescendant` points at. */
  rowId(index) {
    return `${this.prefix}-row-${String(index)}`;
  }
  // ── internals ────────────────────────────────────────────────────────────
  render() {
    const fragment = this.document.createDocumentFragment();
    this.rows.forEach((row, index) => {
      const element = this.document.createElement("div");
      element.className = "litearea-row";
      element.id = this.rowId(index);
      element.setAttribute("role", "option");
      element.setAttribute("aria-selected", index === this.active ? "true" : "false");
      element.dataset.index = String(index);
      const kind = this.document.createElement("span");
      kind.className = `litearea-rowKind litearea-kind-${row.item.kind ?? "value"}`;
      element.appendChild(kind);
      const label = this.document.createElement("span");
      label.className = "litearea-rowLabel";
      for (const piece of highlightSegments(row.item.label, row.indices)) {
        if (piece.matched) {
          const mark = this.document.createElement("span");
          mark.className = "litearea-rowMatch";
          mark.textContent = piece.text;
          label.appendChild(mark);
        } else {
          label.appendChild(this.document.createTextNode(piece.text));
        }
      }
      element.appendChild(label);
      if (row.item.detail !== void 0) {
        const detail = this.document.createElement("span");
        detail.className = "litearea-rowDetail";
        detail.textContent = row.item.detail;
        element.appendChild(detail);
      }
      fragment.appendChild(element);
    });
    this.list.replaceChildren(fragment);
    this.renderDocs();
  }
  /** Refresh the documentation panel from the active row. */
  renderDocs() {
    const item = this.rows[this.active]?.item;
    const hasDocs = this.showDocs && this.open && item !== void 0 && (item.documentation !== void 0 || item.detail !== void 0);
    this.docs.hidden = !hasDocs;
    if (!hasDocs || item === void 0) {
      this.docs.replaceChildren();
      return;
    }
    const fragment = this.document.createDocumentFragment();
    const title = this.document.createElement("div");
    title.className = "litearea-docsTitle";
    title.textContent = item.label;
    fragment.appendChild(title);
    if (item.detail !== void 0) {
      const detail = this.document.createElement("div");
      detail.className = "litearea-docsDetail";
      detail.textContent = item.detail;
      fragment.appendChild(detail);
    }
    if (item.documentation !== void 0) {
      const body = this.document.createElement("div");
      body.className = "litearea-docsBody";
      body.textContent = item.documentation;
      fragment.appendChild(body);
    }
    this.docs.replaceChildren(fragment);
    this.docs.scrollTop = 0;
  }
  onMouseDown = (event) => {
    const row = event.target?.closest(".litearea-row");
    if (row === null || row === void 0) return;
    event.preventDefault();
    const index = Number.parseInt(row.dataset.index ?? "-1", 10);
    if (Number.isInteger(index) && index >= 0) this.handlers.accept(index);
  };
  onMouseMove = (event) => {
    const row = event.target?.closest(".litearea-row");
    if (row === null || row === void 0) return;
    const index = Number.parseInt(row.dataset.index ?? "-1", 10);
    if (!Number.isInteger(index) || index < 0 || index === this.active) return;
    this.handlers.hover(index);
  };
};

// src/dom/tooltip.ts
var Tooltip = class {
  /** The tooltip element. */
  element;
  document;
  open = false;
  /**
   * @param ownerDocument - the document to build in.
   */
  constructor(ownerDocument) {
    this.document = ownerDocument;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.dataset.liteareaPart = "tooltip";
    this.element.dataset.open = "false";
  }
  /** Whether the tooltip is showing. */
  get isOpen() {
    return this.open;
  }
  /**
   * Show a hover.
   * @param info - what to say.
   * @param anchor - where the thing being described is.
   * @param container - the element the tooltip is positioned against.
   * @param viewport - the visible area to stay inside.
   */
  show(info, anchor, container, viewport) {
    const fragment = this.document.createDocumentFragment();
    if (info.title !== void 0) {
      const title = this.document.createElement("div");
      title.className = "litearea-tooltipTitle";
      title.textContent = info.title;
      fragment.appendChild(title);
    }
    if (info.detail !== void 0 && info.detail !== "") {
      const detail = this.document.createElement("div");
      detail.className = "litearea-tooltipDetail";
      detail.textContent = info.detail;
      fragment.appendChild(detail);
    }
    if (info.body !== void 0 && info.body !== "") {
      const body = this.document.createElement("div");
      body.className = "litearea-tooltipBody";
      body.textContent = info.body;
      fragment.appendChild(body);
    }
    this.element.replaceChildren(fragment);
    this.open = true;
    this.element.dataset.open = "true";
    const box = this.element.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const gap = 6;
    let top = anchor.y + anchor.height + gap;
    if (containerBox.top + top + box.height > viewport.height - gap) {
      const above = anchor.y - box.height - gap;
      top = containerBox.top + above >= gap ? above : Math.max(0, viewport.height - gap - box.height - containerBox.top);
    }
    let left = anchor.x;
    const overflowRight = containerBox.left + left + box.width - (viewport.width - gap);
    if (overflowRight > 0) left = Math.max(0, left - overflowRight);
    this.element.style.top = `${String(Math.round(top))}px`;
    this.element.style.left = `${String(Math.round(left))}px`;
  }
  /** Hide the tooltip. */
  hide() {
    if (!this.open) return;
    this.open = false;
    this.element.dataset.open = "false";
    this.element.replaceChildren();
  }
  /** Take the tooltip out of the document. */
  destroy() {
    this.element.remove();
    this.element.replaceChildren();
  }
};

// src/dom/editor.ts
var PAGE_STEP = 8;
var LiteArea = class {
  /** The positioning container. Put this in the page. */
  element;
  /** The real field. Exposed for a host that needs the element itself. */
  input;
  document;
  view;
  /**
   * The grammar as the host declared it, kept so {@link refresh} can re-resolve it.
   *
   * Mutable on purpose, and it is what lets a host pass a live object — a proxy
   * reading the newest props, say — without the editor having to be rebuilt when the
   * language changes. A rebuild would throw away the undo history, which is the one
   * thing this library must not do, so re-resolving is the only acceptable answer.
   */
  declaredGrammar;
  /** The grammar the engine is currently running, with its defaults filled in. */
  grammar;
  box;
  overlay;
  popup;
  tooltip;
  mirror;
  sizing;
  completion;
  hover;
  paintDecorations;
  handlers;
  injectedStyle;
  instanceId;
  fontsReady;
  /** The current inspection, and the text it was computed from. */
  current;
  currentText;
  /** Bumped whenever the inspection changes, so the painter can skip work. */
  revision = 0;
  /** The list on screen, with the range frozen when it opened. */
  completionState;
  /** True during an IME composition, when no completion may run. */
  composing = false;
  /** True while the editor itself is writing, so its own edit does not re-open the list. */
  applying = false;
  /** The height and overflow last written, so unchanged values are not rewritten. */
  appliedHeight = -1;
  appliedOverflow = "";
  appliedScrollbar = -1;
  /** The offset the tooltip last described, so a resting pointer does not re-query. */
  hoverOffset;
  /** The custom properties this instance set, so one that disappears can be removed. */
  appliedVariables = /* @__PURE__ */ new Set();
  hoverTimer;
  /** Watches for a width change, which invalidates wrapping and the box height. */
  resizeObserver;
  observedWidth = -1;
  /**
   * A signature of the last announced problem list, so the host is told once.
   *
   * Starts as `undefined` rather than as the empty string, because "no problems" is a
   * real signature and a host waiting to be told that the list is clear would otherwise
   * never hear it — it would keep whatever it was showing before the editor existed.
   */
  announced;
  destroyed = false;
  /**
   * @param options - the grammar, the initial text, and the behaviour to use.
   */
  constructor(options) {
    const probe = typeof document === "undefined" ? void 0 : document;
    if (probe === void 0) {
      throw new Error("litearea: an editor needs a document, and there is none in this environment");
    }
    this.document = probe;
    this.view = probe.defaultView ?? void 0;
    this.handlers = options;
    const declared = options.grammar;
    this.declaredGrammar = isResolvedGrammar(declared) ? declared.grammar : declared;
    this.grammar = resolveGrammar(this.declaredGrammar);
    this.instanceId = `litearea-${Math.random().toString(36).slice(2, 9)}`;
    this.sizing = withDefaults(
      { autoGrow: true, minRows: 1 },
      options.sizing
    );
    this.completion = options.completion === false ? void 0 : withDefaults(
      { auto: true, triggerCharacters: " ", limit: 100, showDocumentation: true },
      options.completion
    );
    this.hover = options.hover === false ? void 0 : withDefaults({ enabled: true, delay: 140 }, options.hover);
    this.paintDecorations = options.decorations !== false;
    if (options.injectStyles !== false) {
      this.injectedStyle = injectStyles(this.document, options.styleNonce);
    }
    this.element = this.document.createElement("div");
    this.element.className = options.className === void 0 ? "litearea" : `litearea ${options.className}`;
    this.element.classList.add(this.sizing.autoGrow ? "litearea-growable" : "litearea-resizable");
    if (options.readOnly === true) this.element.classList.add("litearea-readonly");
    if (options.variables !== void 0) this.applyVariables(options.variables);
    this.box = this.document.createElement("div");
    this.box.className = "litearea-box";
    this.element.appendChild(this.box);
    this.overlay = new Overlay(this.document, {
      scope: scopeClass,
      decoration: decorationClass,
      severity: severityClass
    });
    this.box.appendChild(this.overlay.element);
    this.input = this.document.createElement("textarea");
    this.input.className = "litearea-input";
    this.input.dataset.liteareaPart = "input";
    this.input.spellcheck = options.spellCheck === true;
    this.input.autocomplete = "off";
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("wrap", "soft");
    this.input.readOnly = options.readOnly === true;
    this.input.rows = this.sizing.minRows;
    if (options.placeholder !== void 0) this.input.placeholder = options.placeholder;
    if (options.ariaLabel !== void 0) this.input.setAttribute("aria-label", options.ariaLabel);
    this.input.setAttribute("aria-autocomplete", this.completion === void 0 ? "none" : "list");
    this.input.setAttribute("aria-expanded", "false");
    this.input.setAttribute("role", "combobox");
    this.input.value = options.value ?? "";
    this.box.appendChild(this.input);
    this.popup = new Popup(
      this.document,
      {
        accept: (index) => {
          this.acceptCompletion(index);
        },
        hover: (index) => {
          this.setActive(index);
        }
      },
      this.instanceId
    );
    this.element.appendChild(this.popup.element);
    this.input.setAttribute("aria-controls", this.popup.listId);
    this.tooltip = new Tooltip(this.document);
    this.element.appendChild(this.tooltip.element);
    this.mirror = new TextMirror(this.document);
    this.mirror.mount(this.document.body ?? this.document.documentElement);
    const Observer = this.view?.ResizeObserver;
    if (typeof Observer === "function") {
      this.resizeObserver = new Observer(() => {
        const width = this.element.clientWidth;
        if (width === this.observedWidth) return;
        this.observedWidth = width;
        this.mirror.adopt(this.input);
        this.resize(this.input.value);
        this.placePopup();
      });
      this.resizeObserver.observe(this.element);
    }
    const fonts = this.document.fonts;
    this.fontsReady = fonts?.ready;
    this.bind();
    this.sync();
    if (this.fontsReady !== void 0) {
      void this.fontsReady.then(() => {
        if (!this.destroyed) this.refresh();
      });
    }
  }
  // ── what a host reads ──────────────────────────────────────────────────────
  /** The current text. */
  get value() {
    return this.input.value;
  }
  /** The caret or selection. */
  get selection() {
    return readSelection(this.input);
  }
  /** The last inspection, or undefined before the first one. */
  get inspection() {
    return this.current;
  }
  /** The problems the grammar found. */
  get diagnostics() {
    return this.current?.diagnostics ?? [];
  }
  /** The list on screen, when one is. */
  get currentCompletion() {
    return this.completionState;
  }
  /** Whether the editor has focus. */
  get focused() {
    return this.document.activeElement === this.input;
  }
  // ── what a host calls ─────────────────────────────────────────────────────
  /**
   * Replace the text.
   *
   * `preserveHistory` writes through the editing pipeline, so the replacement is
   * one undoable edit and Ctrl+Z brings the old text back — what a Reset button
   * wants. Without it the value property is assigned, which is faster and clears
   * the history, which is what loading a different document wants.
   *
   * This is the only path that writes the text, and it is never used for an edit
   * the user could have made.
   * @param next - the new text.
   * @param preserveHistory - whether Ctrl+Z should be able to undo it.
   * @returns how the write landed.
   */
  setValue(next, preserveHistory = false) {
    if (this.input.value === next) return "unchanged";
    this.applying = true;
    let outcome;
    try {
      outcome = writeDocument(this.input, next, preserveHistory);
    } finally {
      this.applying = false;
    }
    this.sync();
    return outcome;
  }
  /**
   * Put the caret somewhere.
   * @param start - the anchor offset.
   * @param end - the moving offset; defaults to `start`.
   */
  setSelection(start, end = start) {
    writeSelection(this.input, start, end);
    this.updateCompletionForCaret();
  }
  /** Move the caret into the field. */
  focus() {
    this.input.focus();
  }
  /** Undo, through the browser's history. */
  undo() {
    const done = undoField(this.input);
    if (done) this.sync();
    return done;
  }
  /** Redo, through the browser's history. */
  redo() {
    const done = redoField(this.input);
    if (done) this.sync();
    return done;
  }
  /**
   * Set CSS custom properties on the wrapper, replacing whatever this method set last time.
   *
   * A property that has disappeared from the record is removed rather than left behind, so a
   * host can un-theme by passing a smaller object. Properties set by other means — a stylesheet,
   * or the wrapper's inline style directly — are not touched, and a removed one falls back to
   * whatever CSS says.
   *
   * Safe to call at any time after construction. The constructor uses the private write-only
   * half, because re-measuring needs the field, the mirror, and the overlay, none of which exist
   * until it has finished.
   * @param next - the properties, keyed as {@link LiteAreaOptions.variables} describes.
   */
  setVariables(next) {
    this.applyVariables(next);
    this.mirror.adopt(this.input);
    this.appliedHeight = -1;
    this.sync();
  }
  /** Write the properties, and forget the ones that are gone. No re-measure. */
  applyVariables(next) {
    const keep = /* @__PURE__ */ new Set();
    for (const [key, value] of Object.entries(next)) {
      const name = variableName(key);
      keep.add(name);
      this.element.style.setProperty(name, value);
    }
    for (const name of this.appliedVariables) {
      if (!keep.has(name)) this.element.style.removeProperty(name);
    }
    this.appliedVariables = keep;
  }
  /**
   * Re-read the document with the same text.
   *
   * For a host whose grammar depends on something outside it — an installed font
   * list that has just been re-read, a palette that changed — and for the moment a
   * web font finishes loading.
   *
   * The grammar is re-resolved here, which is what makes a live grammar object
   * work: a host that rebuilds its rules on every render can call `refresh()` and
   * the editor picks the new ones up without being rebuilt, so the undo history
   * survives a language change.
   */
  refresh() {
    this.grammar = resolveGrammar(this.declaredGrammar);
    this.current = void 0;
    this.currentText = void 0;
    this.mirror.adopt(this.input);
    this.overlay.invalidate();
    this.appliedHeight = -1;
    this.appliedOverflow = "";
    this.appliedScrollbar = -1;
    this.sync();
  }
  /** Open the completion list on demand, as Ctrl+Space does. */
  showCompletions() {
    if (this.completion === void 0) return;
    this.openCompletion("explicit");
  }
  /** Close the completion list. */
  hideCompletions() {
    this.closeCompletion();
  }
  /** Remove the editor and every listener it owns. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unbind();
    this.resizeObserver?.disconnect();
    this.resizeObserver = void 0;
    if (this.hoverTimer !== void 0) this.view?.clearTimeout(this.hoverTimer);
    this.popup.destroy();
    this.tooltip.destroy();
    this.overlay.destroy();
    this.mirror.destroy();
    void this.injectedStyle;
    this.element.remove();
  }
  // ── the pipeline ──────────────────────────────────────────────────────────
  /**
   * Bring everything up to date with the field.
   *
   * The inspection is cached on the text, so moving the caret or scrolling costs
   * nothing beyond the paint — and the paint itself is skipped when neither the
   * text nor the analysis changed.
   */
  sync() {
    const text = this.input.value;
    if (this.current === void 0 || this.currentText !== text) {
      this.current = inspect(text, this.grammar);
      this.currentText = text;
      this.revision += 1;
    }
    const inspection = this.current;
    this.paint(inspection);
    this.resize(text);
    this.overlay.syncScroll(this.input);
    this.announceDiagnostics(inspection);
  }
  /** Paint the layer, and mark the box when a problem is an error. */
  paint(inspection) {
    const painting = {
      tokens: inspection.tokens,
      decorations: this.paintDecorations ? inspection.decorations : [],
      diagnostics: inspection.diagnostics
    };
    const key = [
      String(this.revision),
      this.paintDecorations ? "d" : "-",
      String(painting.decorations.length),
      String(painting.diagnostics.length)
    ].join(":");
    this.overlay.render(inspection.text, painting, key, this.grammar.fallbackScope);
    const hasError = inspection.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    this.element.classList.toggle("litearea-invalid", hasError);
    this.input.setAttribute("aria-invalid", hasError ? "true" : "false");
  }
  /** Tell the host, once, when the problem list actually changed. */
  announceDiagnostics(inspection) {
    if (this.handlers.onDiagnostics === void 0) return;
    const key = inspection.diagnostics.map(
      (diagnostic) => `${String(diagnostic.from)}:${diagnostic.code ?? ""}:${diagnostic.message}`
    ).join("|");
    if (key === this.announced) return;
    this.announced = key;
    this.handlers.onDiagnostics(inspection.diagnostics);
  }
  /**
   * Size the box to its content.
   *
   * The mirror has no scrollbar, so its measurement is the height the content wants
   * with the full width available — which is exactly the number that decides whether
   * a scrollbar is needed at all. If it fits under the maximum, the height becomes
   * the content height and the overflow stays hidden, which is the promise of "grow
   * and shrink so no scrollbar is ever shown". If it does not fit, the height is
   * clamped and the overflow becomes `auto`.
   *
   * Clamping introduces a second problem that is easy to miss: a scrollbar narrows
   * the text, so the field rewraps, so the PAINT no longer wraps the same way and
   * every coloured span slides off its character. The measured scrollbar width is
   * therefore published as a custom property, and the stylesheet adds it to the
   * layer's own right padding so the two keep wrapping identically.
   *
   * An UNMOUNTED field is skipped rather than measured. Before the element is in the
   * document it has no layout, so its `clientWidth` is zero, the mirror wraps at every
   * character, and the measurement comes back several times too tall — a wrong height
   * that then has to be corrected on the next keystroke, which is what a box that
   * jumps on first focus actually is. The `ResizeObserver` installed at construction
   * does the first real measurement as soon as there is a width to measure against.
   * @param text - the current text.
   */
  resize(text) {
    if (!this.sizing.autoGrow) {
      this.mirror.adopt(this.input);
      return;
    }
    if (!this.input.isConnected || this.input.clientWidth === 0) return;
    const chrome = this.mirror.verticalPadding();
    const lineHeight = this.mirror.lineHeight(this.input);
    const minPx = Math.max(
      this.sizing.minHeight ?? 0,
      lineHeight * (this.sizing.minRows ?? 1) + chrome
    );
    const maxCandidate = Math.min(
      this.sizing.maxHeight ?? Number.POSITIVE_INFINITY,
      this.sizing.maxRows === void 0 ? Number.POSITIVE_INFINITY : lineHeight * this.sizing.maxRows + chrome
    );
    const maxPx = Math.max(maxCandidate, minPx);
    const content = this.mirror.contentHeight(this.input, text);
    const wanted = clamp(Math.max(content, minPx), minPx, maxPx);
    const overflow = content > wanted + 0.5 ? "auto" : "hidden";
    if (Math.abs(wanted - this.appliedHeight) > 0.5) {
      this.input.style.height = `${String(Math.round(wanted))}px`;
      this.appliedHeight = wanted;
    }
    if (overflow !== this.appliedOverflow) {
      this.input.style.overflowY = overflow;
      this.appliedOverflow = overflow;
    }
    const scrollbar = overflow === "auto" ? this.input.offsetWidth - this.input.clientWidth : 0;
    const width = Math.max(0, scrollbar);
    if (width !== this.appliedScrollbar) {
      this.element.style.setProperty("--litearea-scrollbar", `${String(width)}px`);
      this.appliedScrollbar = width;
    }
  }
  // ── completion ────────────────────────────────────────────────────────────
  /** The caret's offset, clamped into the text. */
  caret() {
    return clamp(readSelection(this.input).start, 0, this.input.value.length);
  }
  /** Resolve and show a list for the caret. */
  openCompletion(trigger) {
    if (this.completion === void 0 || this.current === void 0) return;
    const result = complete(this.current, this.grammar, {
      text: this.input.value,
      caret: this.caret(),
      trigger,
      previousSourceId: this.completionState?.sourceId,
      limit: this.completion.limit
    });
    if (result === void 0 || result.rows.length === 0) {
      this.closeCompletion();
      return;
    }
    this.completionState = result;
    this.popup.show(result.rows, 0, this.completion.showDocumentation);
    this.input.setAttribute("aria-expanded", "true");
    this.syncActiveDescendant();
    this.placePopup();
    this.handlers.onCompletion?.(result);
  }
  /** Close the list and tell the host. */
  closeCompletion() {
    if (this.completionState === void 0 && !this.popup.isOpen) return;
    this.completionState = void 0;
    this.popup.close();
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.handlers.onCompletion?.(void 0);
  }
  /** Keep the field's `aria-activedescendant` pointing at the active row. */
  syncActiveDescendant() {
    const id = this.popup.activeRowId;
    if (id === void 0) this.input.removeAttribute("aria-activedescendant");
    else this.input.setAttribute("aria-activedescendant", id);
  }
  /** Put the list under the caret. */
  placePopup() {
    if (this.completionState === void 0) return;
    const box = this.mirror.caretBox(this.input, this.caret());
    if (box === void 0) return;
    const inputRect = this.input.getBoundingClientRect();
    const elementRect = this.element.getBoundingClientRect();
    this.popup.place(
      {
        x: inputRect.left - elementRect.left + box.x,
        y: inputRect.top - elementRect.top + box.y,
        height: box.height
      },
      this.element,
      { width: this.view?.innerWidth ?? 0, height: this.view?.innerHeight ?? 0 }
    );
  }
  /**
   * Take the active row.
   * @param index - the row to take.
   * @param commitCharacter - a character typed to trigger the pick, written after
   *   the completion so the keystroke is not swallowed.
   */
  acceptCompletion(index, commitCharacter) {
    const state = this.completionState;
    const row = this.popup.items[index]?.item;
    if (state === void 0 || row === void 0) return;
    const applied = applyCompletion(this.input.value, state.range, row);
    this.applying = true;
    try {
      replaceThroughPipeline(this.input, applied.from, applied.to, applied.insert);
      writeSelection(this.input, applied.caret);
      if (commitCharacter !== void 0) {
        replaceThroughPipeline(this.input, applied.caret, applied.caret, commitCharacter);
        writeSelection(this.input, applied.caret + commitCharacter.length);
      }
    } finally {
      this.applying = false;
    }
    this.closeCompletion();
    this.sync();
    const inspection = this.current;
    if (inspection !== void 0) {
      this.grammar.grammar.onAccept?.({
        text: this.input.value,
        caret: this.caret(),
        item: row,
        state: inspection.state
      });
    }
  }
  /** Decide what an edit does to the list. */
  updateCompletionAfterInput(data, deletion) {
    if (this.completion === void 0 || this.applying || this.composing) return;
    if (this.input.readOnly) return;
    if (deletion) {
      if (this.completionState !== void 0) this.openCompletion("auto");
      return;
    }
    if (this.completionState !== void 0) {
      this.openCompletion("auto");
      return;
    }
    if (!this.completion.auto) return;
    if (!this.shouldAutoOpen(data)) return;
    this.openCompletion("auto");
  }
  /** Whether a keystroke is a reason to offer suggestions. */
  shouldAutoOpen(data) {
    if (data === "" || this.completion === void 0) return false;
    const last = data.slice(-1);
    if (this.completion.triggerCharacters.includes(last)) return true;
    return this.grammar.wordChars.test(last);
  }
  /** Close a list the caret has left. */
  updateCompletionForCaret() {
    const state = this.completionState;
    if (state === void 0) return;
    const caret = this.caret();
    if (caret < state.range.from || caret > state.range.to) this.closeCompletion();
    else this.placePopup();
  }
  // ── hover ─────────────────────────────────────────────────────────────────
  /** Start, or restart, the timer that shows a tooltip. */
  queueHover(offset, event) {
    if (this.hover === void 0 || !this.hover.enabled || this.current === void 0) return;
    if (offset === this.hoverOffset && this.tooltip.isOpen) return;
    this.hoverOffset = offset;
    this.hideTooltip();
    const clientX = event.clientX;
    const clientY = event.clientY;
    this.hoverTimer = this.view?.setTimeout(() => {
      this.hoverTimer = void 0;
      this.showHover(offset, clientX, clientY);
    }, this.hover.delay);
  }
  /** Resolve and show a tooltip. */
  showHover(offset, clientX, clientY) {
    if (this.current === void 0 || this.destroyed) return;
    const info = resolveHover(this.current, this.grammar, offset);
    if (info === void 0) {
      this.hideTooltip();
      return;
    }
    const rect = this.element.getBoundingClientRect();
    const lineHeight = this.mirror.lineHeight(this.input);
    this.tooltip.show(
      info,
      { x: clientX - rect.left, y: clientY - rect.top, height: lineHeight },
      this.element,
      { width: this.view?.innerWidth ?? 0, height: this.view?.innerHeight ?? 0 }
    );
    this.handlers.onHover?.(info);
  }
  /** Hide the tooltip and forget what it described. */
  hideTooltip() {
    if (this.hoverTimer !== void 0) {
      this.view?.clearTimeout(this.hoverTimer);
      this.hoverTimer = void 0;
    }
    if (!this.tooltip.isOpen) return;
    this.tooltip.hide();
    this.handlers.onHover?.(void 0);
  }
  // ── events ────────────────────────────────────────────────────────────────
  /** Attach every listener. */
  bind() {
    this.input.addEventListener("input", this.onInput);
    this.input.addEventListener("keydown", this.onKeyDown);
    this.input.addEventListener("scroll", this.onScroll);
    this.input.addEventListener("click", this.onCaretMoved);
    this.input.addEventListener("keyup", this.onKeyUp);
    this.input.addEventListener("select", this.onCaretMoved);
    this.input.addEventListener("blur", this.onBlur);
    this.input.addEventListener("mousemove", this.onMouseMove);
    this.input.addEventListener("mouseleave", this.onMouseLeave);
    this.input.addEventListener("compositionstart", this.onCompositionStart);
    this.input.addEventListener("compositionend", this.onCompositionEnd);
    this.document.addEventListener("selectionchange", this.onSelectionChange);
  }
  /** Detach every listener. */
  unbind() {
    this.input.removeEventListener("input", this.onInput);
    this.input.removeEventListener("keydown", this.onKeyDown);
    this.input.removeEventListener("scroll", this.onScroll);
    this.input.removeEventListener("click", this.onCaretMoved);
    this.input.removeEventListener("keyup", this.onKeyUp);
    this.input.removeEventListener("select", this.onCaretMoved);
    this.input.removeEventListener("blur", this.onBlur);
    this.input.removeEventListener("mousemove", this.onMouseMove);
    this.input.removeEventListener("mouseleave", this.onMouseLeave);
    this.input.removeEventListener("compositionstart", this.onCompositionStart);
    this.input.removeEventListener("compositionend", this.onCompositionEnd);
    this.document.removeEventListener("selectionchange", this.onSelectionChange);
  }
  onInput = (event) => {
    this.sync();
    const input = event;
    const type = input.inputType ?? "";
    const deletion = type.startsWith("delete");
    const data = typeof input.data === "string" ? input.data : "";
    this.hideTooltip();
    this.updateCompletionAfterInput(data, deletion);
    if (!this.applying) this.handlers.onChange?.(this.input.value);
  };
  onKeyDown = (event) => {
    if (this.commitCharacter(event)) return;
    if (event.key === "Escape") {
      if (this.popup.isOpen) {
        event.preventDefault();
        this.closeCompletion();
        return;
      }
      this.hideTooltip();
      return;
    }
    if (event.key === " " && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.popup.isOpen) this.closeCompletion();
      else this.openCompletion("explicit");
      return;
    }
    if (!this.popup.isOpen) return;
    const last = this.popup.items.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.setActive(Math.min(this.popup.activeIndex + 1, last));
        return;
      case "ArrowUp":
        event.preventDefault();
        this.setActive(Math.max(this.popup.activeIndex - 1, 0));
        return;
      case "PageDown":
        event.preventDefault();
        this.setActive(Math.min(this.popup.activeIndex + PAGE_STEP, last));
        return;
      case "PageUp":
        event.preventDefault();
        this.setActive(Math.max(this.popup.activeIndex - PAGE_STEP, 0));
        return;
      case "Enter":
        event.preventDefault();
        this.acceptCompletion(this.popup.activeIndex);
        return;
      case "Tab":
        event.preventDefault();
        this.acceptCompletion(this.popup.activeIndex);
        return;
      default:
        return;
    }
  };
  /**
   * Whether a keystroke is a commit character for the active row.
   *
   * Typing `=` at the end of `shape` takes the `shape=` row and keeps the
   * character, rather than either swallowing the keystroke or leaving the row to be
   * clicked. A row opts in; nothing has a commit character by default.
   * @param event - the key event.
   * @returns whether the keystroke was consumed.
   */
  commitCharacter(event) {
    if (!this.popup.isOpen) return false;
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    const characters = this.popup.activeRow?.item.commitCharacters;
    if (characters === void 0 || !characters.includes(event.key)) return false;
    event.preventDefault();
    this.acceptCompletion(this.popup.activeIndex, event.key);
    return true;
  }
  /** Make a row active and keep the ARIA pointer in step. */
  setActive(index) {
    this.popup.setActive(index);
    this.syncActiveDescendant();
  }
  onScroll = () => {
    this.overlay.syncScroll(this.input);
    this.placePopup();
    this.hideTooltip();
  };
  onCaretMoved = () => {
    this.updateCompletionForCaret();
    this.handlers.onSelectionChange?.(readSelection(this.input));
  };
  onKeyUp = (event) => {
    if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
      this.updateCompletionForCaret();
    }
  };
  onSelectionChange = () => {
    if (this.document.activeElement !== this.input) return;
    this.handlers.onSelectionChange?.(readSelection(this.input));
  };
  onBlur = () => {
    this.closeCompletion();
    this.hideTooltip();
  };
  onMouseMove = (event) => {
    if (this.hover === void 0 || !this.hover.enabled) return;
    if (this.popup.isOpen) {
      this.hideTooltip();
      return;
    }
    const offset = caretOffsetFromPoint(this.document, event.clientX, event.clientY);
    if (offset === void 0) return;
    this.queueHover(offset, event);
  };
  onMouseLeave = () => {
    this.hoverOffset = void 0;
    this.hideTooltip();
  };
  onCompositionStart = () => {
    this.composing = true;
    this.closeCompletion();
  };
  onCompositionEnd = () => {
    this.composing = false;
    this.sync();
  };
};
function variableName(key) {
  if (key.startsWith("--")) return key;
  return key.startsWith("litearea-") ? `--${key}` : `--litearea-${key}`;
}
function caretOffsetFromPoint(ownerDocument, x, y) {
  const probe = ownerDocument;
  if (typeof probe.caretPositionFromPoint === "function") {
    return probe.caretPositionFromPoint(x, y)?.offset;
  }
  if (typeof probe.caretRangeFromPoint === "function") {
    return probe.caretRangeFromPoint(x, y)?.startOffset;
  }
  return void 0;
}

// src/dom/create.ts
function createEditor(target, options) {
  const editor = new LiteArea(options);
  target.appendChild(editor.element);
  editor.refresh();
  return editor;
}
		return { LITEAREA_STYLES: LITEAREA_STYLES, LiteArea: LiteArea, Overlay: Overlay, Popup: Popup, TextMirror: TextMirror, Tooltip: Tooltip, applyCompletion: applyCompletion, asResolvedVocabulary: asResolvedVocabulary, buildSegments: buildSegments, canEditThroughPipeline: canEditThroughPipeline, clamp: clamp, complete: complete, containsOffset: containsOffset, createEditor: createEditor, decorationClass: decorationClass, defineCompletion: defineCompletion, defineGrammar: defineGrammar, defineVocabulary: defineVocabulary, diagnosticHover: diagnosticHover, dispatchInput: dispatchInput, excerpt: excerpt, fieldLineHeight: fieldLineHeight, fillTemplate: fillTemplate, fuzzyMatch: fuzzyMatch, hasCaretHitTest: hasCaretHitTest, hasDocument: hasDocument, highlightSegments: highlightSegments, injectStyles: injectStyles, inspect: inspect, isEmptyRange: isEmptyRange, isOffset: isOffset, isResolvedGrammar: isResolvedGrammar, isWordChar: isWordChar, isWordStart: isWordStart, lineAt: lineAt, lineIndexAt: lineIndexAt, lineStarts: lineStarts, listPhrase: listPhrase, normalizeDiagnostics: normalizeDiagnostics, offsetFromPoint: offsetFromPoint, rank: rank, readSelection: readSelection, redoField: redoField, replaceThroughPipeline: replaceThroughPipeline, resolveGrammar: resolveGrammar, resolveHover: resolveHover, resolveWordsSource: resolveWordsSource, scan: scan, scopeAt: scopeAt, scopeClass: scopeClass, segmentClasses: segmentClasses, severityClass: severityClass, tokenAfter: tokenAfter, tokenAt: tokenAt, tokenBefore: tokenBefore, tokensOnLine: tokensOnLine, undoField: undoField, vocabularyWords: vocabularyWords, withDefaults: withDefaults, wordInfoAt: wordInfoAt, writeDocument: writeDocument, writeSelection: writeSelection };
		})();
/**
 * The font query — the small language this plugin's two family settings are
 * edited in — as a grammar for `@citisen/litearea`.
 *
 * `litearea` is a generic editor that receives a grammar as a value: it ships no
 * language of its own, and it must not. A grammar is a fact about a product
 * rather than about an editor, so the description of this language lives here,
 * beside the parser that reads it, and it is built from THAT parser's constants
 * ({@link WEIGHT_WORDS}, {@link GENERIC_FAMILIES}, {@link COMMON_FAMILIES})
 * rather than from a second copy of them. The editor can therefore never offer a
 * family {@link parseFontQuery} would then call unknown.
 *
 * The language
 * ------------
 *
 *     Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
 *     └─────┬────┘ └──┬─┘
 *         family    weight
 *
 * A CSS font-family list, plus the one thing the list cannot carry. `font-family:
 * "Geist Mono" 500, monospace` is an invalid declaration that drops the whole
 * stack, so the weight has to be its own `font-weight` — but it can still be
 * WRITTEN next to the family it belongs to, which is what lets one field describe
 * both. A weight is chosen for a family; having to change them in two places is
 * exactly the problem this language exists to remove.
 *
 *     query  := entry ("," entry)*
 *     entry  := family | weight
 *     family := '"' … '"' | "'" … "'" | word (space word)*
 *     weight := a word from WEIGHT_WORDS
 *
 * Only the LAST word of an unquoted entry may be a weight, and only when the
 * whole entry is not itself a catalogued family: `Book Antiqua` and
 * `Franklin Gothic Medium` are real families, and stripping either would
 * silently retarget the stack at a font nobody picked. Quoting always means
 * "this is the family name, verbatim", so a quoted entry never splits.
 *
 * What it adds over a parse
 * -------------------------
 *
 * The parser is forgiving on purpose: text it cannot place is kept as written and
 * reported, never silently dropped. The grammar keeps that reading — it splits
 * and reads the entries with the parser's own rules — and adds what a parse
 * cannot do: it marks a problem the moment the character is typed, explains a
 * token under the pointer, and offers the next entry before it is spelled out.
 *
 * Two of the scopes below are not lexical at all. `weight.missing` — a weight the
 * chosen family has no face for — depends on the machine's installed faces, and
 * `family.unknown` depends on whether the catalogue was actually read. Both are
 * painted from a `scope` FUNCTION that reads the analysis, because a rule may
 * look at `match.state`. That is this library's answer to VSCode's split between
 * a TextMate grammar and semantic tokens: one rule set, two sources of truth
 * about a span, and the semantic one is allowed to override.
 *
 * How it reaches the bundle
 * -------------------------
 *
 * There is no bundler. `scripts/build-client.mjs` splices this file into the same
 * scope as `src/client.js`, which is why the constants and the helpers named
 * above are readable here with no import. The library's public API is the only
 * import this file may carry.
 *
 * @module dsh-font/font-grammar
 */

		// @citisen/litearea is compiled in above
// ─── the scopes this grammar paints with ────────────────────────────────────
//
// A scope is a plain string: the engine turns it into a CSS class
// (`litearea-scope-<scope>`) and a stylesheet decides how it looks. The dots are
// kept so a group can be themed at once, and the two semantic scopes sit beside
// their lexical siblings deliberately — the same word is `weight` on a family
// that has it and `weight.missing` on one that does not.

/** The scope names this grammar paints with. */
const SCOPE = {
  family: 'family',
  generic: 'family.generic',
  unknown: 'family.unknown',
  unclosed: 'family.unclosed',
  weight: 'weight',
  weightMissing: 'weight.missing',
  separator: 'separator',
}

/**
 * One entry of the query, as the reader found it.
 *
 * The offsets are what the decoration and the completion need: a pick replaces
 * the entry's CORE rather than its whole slice, which is what keeps the
 * whitespace around it — and the comma before it — from being swallowed.
 *
 * @typedef {object} FontGrammarEntry
 * @property {number} from - the entry's first character, whitespace included.
 * @property {number} to - one past the entry's last character.
 * @property {number} coreFrom - the first character of the trimmed core.
 * @property {number} coreTo - one past the trimmed core.
 * @property {string} core - the entry with the whitespace around it removed.
 * @property {boolean} quoted - whether the core opens with a quote.
 * @property {boolean} closed - whether that quote was also closed. An unclosed
 *   one has no name boundary to find, which is what makes the two cases worth
 *   telling apart after the fact.
 * @property {string} name - the family name, quotes and weight word taken out.
 * @property {number} nameFrom - the first character of that name.
 * @property {number} nameTo - one past that name.
 * @property {string|undefined} word - the weight word the entry carries, if any.
 * @property {number} wordFrom - the first character of that word.
 * @property {number} wordTo - one past that word.
 * @property {'empty'|'family'|'generic'|'unknown'|'weight'} kind - what the
 *   reader made of the entry.
 */

/**
 * A problem the structural pass found, and the range to mark.
 *
 * @typedef {object} FontGrammarProblem
 * @property {number} from - the first character to mark.
 * @property {number} to - one past the last character to mark.
 * @property {string} message - what is wrong, in English.
 * @property {string} code - a stable tag, so a host can recognize it.
 * @property {'error'|'warning'|'info'|'hint'} severity - how loudly it speaks.
 */

/**
 * What one pass over the query produced.
 *
 * @typedef {object} FontGrammarState
 * @property {FontGrammarEntry[]} entries - every entry, in order.
 * @property {string[]} families - the family names the entries name, in order.
 * @property {number} effective - which of them the browser will paint with, or
 *   `-1` when none will.
 * @property {number|undefined} weight - the numeric weight the query states.
 * @property {string|undefined} weightWord - the word it states it with.
 * @property {FontGrammarProblem[]} problems - what the pass complained about.
 */

/**
 * What a host supplies to describe the machine the query will run on.
 *
 * Every field is optional, and the three vocabularies default to the parser's
 * own constants, because a host that has nothing to say about the machine still
 * wants the language described.
 *
 * @typedef {object} FontGrammarOptions
 * @property {readonly string[]} [catalogue] - the family names the machine has.
 * @property {boolean} [enumerated] - whether that catalogue was READ from the
 *   machine. It changes what an unrecognized name means: with a read catalogue
 *   the browser will fall through to a later family, which is worth warning
 *   about; without one the catalogue is only a suggestion list.
 * @property {Readonly<Record<string, readonly string[]>>} [styles] - the face
 *   style names of each family, as the Local Font Access API reports them.
 * @property {number} [shippedWeight] - the weight the axis ships with, offered
 *   as a row that takes the word away rather than spelling it out.
 * @property {readonly string[]} [commonFamilies] - families offered even when
 *   they were not detected.
 * @property {readonly string[]} [genericFamilies] - the generic CSS families.
 * @property {number} [phraseWords] - how many words one unquoted family name may
 *   span when it is matched against the catalogue.
 */

/**
 * Whether a lowercase name is a generic CSS family (`monospace`, `serif`, …).
 *
 * The list is an argument rather than a closed-over constant because it is an
 * option of the factory: a host that declares its own generics gets exactly
 * those, and that is also what makes "the vocabulary is not compiled in"
 * something a test can check.
 * @param name - a lowercase family name.
 * @param generics - the generic families in force.
 * @returns whether the name names a generic family.
 */
function isGenericName(name, generics) {
  return generics.includes(name)
}

/**
 * The face style names of one family, matched without regard to case.
 *
 * The keys are the machine's own spelling while the query holds the user's, so
 * the two are folded together here rather than at every call site.
 * @param styles - the faces read off this machine, keyed by family.
 * @param family - the family name as the query writes it.
 * @returns the face style names, or undefined when none were read for it.
 */
function lookupStyles(styles, family) {
  if (Object.hasOwn(styles, family)) return styles[family]
  const lower = family.toLowerCase()
  for (const [name, faces] of Object.entries(styles)) {
    if (name.toLowerCase() === lower) return faces
  }
  return undefined
}

/**
 * The scope a closed quoted entry is painted with.
 *
 * The quotes are punctuation and not part of the name, so what decides the
 * colour is what is INSIDE them: a quoted generic is still a generic, and a
 * quoted name the machine does not have is still worth painting as unknown.
 * @param text - the quoted text, quotes included.
 * @param known - the lowercase catalogue.
 * @param generics - the generic families in force.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns the scope to paint it with.
 */
function quotedScope(text, known, generics, enumerated) {
  const quote = text.charAt(0)
  const inner = text.length >= 2 && text.endsWith(quote) ? text.slice(1, -1) : text.slice(1)
  const lower = inner.trim().toLowerCase()
  if (lower === '') return SCOPE.family
  if (isGenericName(lower, generics)) return SCOPE.generic
  if (known.has(lower)) return SCOPE.family
  return enumerated ? SCOPE.unknown : SCOPE.family
}

/**
 * Take one matching pair of surrounding quotes off a name.
 * @param name - the text as it was written.
 * @returns the text without its quotes, or unchanged when it has none.
 */
function unquote(name) {
  const text = String(name)
  const quote = text.charAt(0)
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Case-insensitive exact lookup in a suggestion space.
 * @param names - the names to search.
 * @param needle - the text to match.
 * @returns the name as the space spells it, or undefined when it has none.
 */
function findExact(names, needle) {
  const lower = needle.toLowerCase()
  return names.find((name) => name.toLowerCase() === lower)
}

/**
 * The entry an offset falls in, when it falls in one.
 *
 * A caret past the last entry's end still belongs to that entry — it is where
 * text is about to be typed — so running off the end returns the last entry
 * rather than nothing.
 * @param entries - the query's entries.
 * @param offset - a caret offset into the query.
 * @returns the entry, or undefined for a query that has none.
 */
function entryAt(entries, offset) {
  for (const entry of entries) {
    if (offset >= entry.from && offset <= entry.to) return entry
  }
  return entries[entries.length - 1]
}

/**
 * The range a completion over the caret replaces: the CORE of the entry it sits
 * in, without the whitespace around it.
 *
 * The whitespace is left out on purpose, and it matters twice. It keeps the
 * replacement from swallowing the separator that belongs to the comma before it,
 * and it keeps the needle honest — the text between the range's start and the
 * caret is what the list is filtered by, and a leading space in it would match
 * nothing while looking like it should match everything.
 * @param state - the analysis.
 * @param caret - the caret offset.
 * @returns the range to replace.
 */
function entryRange(state, caret) {
  const entry = entryAt(state.entries, caret)
  return entry === undefined ? { from: caret, to: caret } : { from: entry.coreFrom, to: entry.coreTo }
}

/**
 * Whether the caret's entry is the last one in the query.
 *
 * Only the last entry is followed by nothing, which is what decides whether a
 * pick should invite the next one with a comma: inside a list the comma is
 * already there, and appending a second would leave `Inter, , monospace`.
 * @param state - the analysis.
 * @param caret - the caret offset.
 * @returns whether it is the last entry.
 */
function lastEntry(state, caret) {
  const entry = entryAt(state.entries, caret)
  return entry === undefined || entry === state.entries[state.entries.length - 1]
}

/**
 * Read one entry into the family it names and the weight it carries.
 *
 * The two shapes a weight can take are both here: a bare entry whose last word
 * is a weight (`Geist Mono medium`), and a quoted family followed by one
 * (`"Geist Mono" medium` — what the canonical serializer writes, which is why a
 * quoted entry cannot simply mean "no weight"). Only the last word of an
 * UNQUOTED entry may be a weight, and only when the whole entry is not itself a
 * catalogued family.
 *
 * @param source - the whole query, for the offsets.
 * @param bounds - one record from {@link splitQueryEntries}.
 * @param known - the lowercase catalogue.
 * @param generics - the generic families in force.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns `{ entry, problems }`.
 */
function readEntry(source, bounds, known, generics, enumerated) {
  const raw = bounds.text
  const trimmed = raw.trim()
  const coreFrom = bounds.start + bounds.lead.length
  const core = trimmed
  const coreTo = coreFrom + core.length
  const problems = []

  const entry = {
    from: bounds.start,
    to: bounds.end,
    coreFrom,
    coreTo,
    core,
    quoted: false,
    closed: false,
    name: '',
    nameFrom: coreFrom,
    nameTo: coreTo,
    word: undefined,
    wordFrom: coreTo,
    wordTo: coreTo,
    kind: 'empty',
  }
  if (core === '') return { entry, problems }

  const quoteChar = core.charAt(0)
  const quote = quoteChar === '"' || quoteChar === "'" ? quoteChar : ''
  const lower = core.toLowerCase()
  /**
   * Whether the entry is still worth looking up.
   *
   * A quote that never closes, or text after a closing one that is neither a
   * weight nor part of the name, means the entry is already reported — and the
   * name the reader salvaged from it is a consequence of that mistake rather
   * than a separate fact about the machine. Warning that the consequence is
   * "not in the font list" would bury the cause under its symptom.
   */
  let lookUp = true

  if (quote !== '') {
    entry.quoted = true
    const close = core.indexOf(quote, 1)
    if (close < 0) {
      // An unclosed quote runs to the end of the document, which is why it is
      // reported rather than repaired: everything after it became one name.
      entry.name = core.slice(1).trim()
      entry.nameFrom = coreFrom + 1
      entry.kind = 'family'
      problems.push({
        from: coreFrom,
        to: coreTo,
        message:
          'This quote is never closed, so everything after it is read as part of one family name.',
        code: 'unclosed-quote',
        severity: 'error',
      })
      return { entry, problems }
    }
    entry.name = core.slice(1, close)
    entry.nameFrom = coreFrom + 1
    entry.nameTo = coreFrom + close
    entry.closed = true
    const rest = core.slice(close + 1).trim()
    if (rest !== '') {
      const restFrom = coreTo - rest.length
      if (Object.hasOwn(WEIGHT_WORDS, rest.toLowerCase())) {
        entry.word = rest.toLowerCase()
        entry.wordFrom = restFrom
        entry.wordTo = coreTo
      } else {
        problems.push({
          from: restFrom,
          to: coreTo,
          message: `"${rest}" follows a quoted family name but is neither a weight nor part of it, so it is ignored.`,
          code: 'trailing-text',
          severity: 'error',
        })
        lookUp = false
      }
    }
    entry.kind = 'family'
  } else if (isGenericName(lower, generics) || known.has(lower)) {
    // The whole entry is one family: there is nothing to strip off it.
    entry.name = core
    entry.kind = isGenericName(lower, generics) ? 'generic' : 'family'
  } else if (Object.hasOwn(WEIGHT_WORDS, lower)) {
    // A bare weight word stands on its own, without a family.
    entry.kind = 'weight'
    entry.word = lower
    entry.wordFrom = coreFrom
    entry.wordTo = coreTo
  } else {
    const cut = lower.lastIndexOf(' ')
    const tail = cut > 0 ? lower.slice(cut + 1) : ''
    if (cut > 0 && Object.hasOwn(WEIGHT_WORDS, tail)) {
      entry.word = tail
      entry.wordFrom = coreFrom + cut + 1
      entry.wordTo = coreTo
      entry.name = core.slice(0, cut).trim()
      entry.nameTo = entry.nameFrom + entry.name.length
    } else {
      entry.name = core
    }
    entry.kind = 'family'
  }

  const nameLower = entry.name.trim().toLowerCase()
  const generic = nameLower !== '' && isGenericName(nameLower, generics)
  const catalogued = nameLower !== '' && known.has(nameLower)
  if (lookUp && nameLower !== '' && !generic && !catalogued && enumerated) {
    entry.kind = 'unknown'
    problems.push({
      from: entry.nameFrom,
      to: entry.nameFrom + entry.name.length,
      message: `"${entry.name}" is not in this machine's font list. It is still written, and the browser will fall back to whatever comes after it.`,
      code: 'unknown-family',
      severity: 'warning',
    })
  } else if (generic) {
    entry.kind = 'generic'
  }
  return { entry, problems }
}

/**
 * Build the grammar for this plugin's font query.
 *
 * The returned value is a plain grammar: `analyze` is this file's parse, and the
 * rules, the completion source, the hover, and the decoration are all derived
 * from the machine description the host passes in. Nothing here holds state, so
 * a host may rebuild it whenever the catalogue changes — and the editor
 * re-resolves it in place on `refresh()`, which is how a list that arrives late
 * grows without the undo history being thrown away.
 *
 * @param options - the machine's catalogue, its faces, and the shipped weight.
 * @returns a grammar that paints, completes, diagnoses, and explains the
 *   language.
 */
function dshFontQueryGrammar(options = {}) {
  const CATALOGUE = options.catalogue ?? []
  const COMMON = options.commonFamilies ?? COMMON_FAMILIES
  const GENERICS = options.genericFamilies ?? GENERIC_FAMILIES
  const STYLES = options.styles ?? {}
  const ENUMERATED = options.enumerated === true
  const SHIPPED_WEIGHT = options.shippedWeight
  const PHRASE_WORDS = options.phraseWords ?? 4

  /** The lowercase catalogue, which is what every lookup folds against. */
  const KNOWN = new Set(CATALOGUE.map((family) => String(family).toLowerCase()))
  /** The suggestion space: the catalogue when there is one, plus the curated list. */
  const SUGGESTION_SPACE = [...new Set([...CATALOGUE, ...COMMON, ...GENERICS])]
  /** Every weight word, as a literal alternation, for the lexical weight rule. */
  const WEIGHT_ALTERNATION = Object.keys(WEIGHT_WORDS).join('|')

  /** The families that explain themselves through hover and complete by name. */
  const FAMILY_VOCAB = _citisen_litearea.defineVocabulary({
    id: 'family',
    words: SUGGESTION_SPACE,
    scope: SCOPE.family,
    format: quoteFamily,
  })

  const GENERIC_VOCAB = _citisen_litearea.defineVocabulary({
    id: 'generic',
    words: GENERICS,
    scope: SCOPE.generic,
    docs: Object.fromEntries(
      GENERICS.map((name) => [
        name,
        {
          detail: 'a generic CSS family',
          body: 'Always valid, and only useful at the end of the list: it is what the browser falls back to when nothing before it resolves.',
        },
      ]),
    ),
  })

  // There is deliberately no `words` rule for the weights. A weight is only a
  // weight in the LAST position of an entry — the same word is part of a family
  // name anywhere else — and a vocabulary matches wherever it finds a member.

  return _citisen_litearea.defineGrammar({
    id: 'dsh-font-query',
    name: 'dsh-font font query',

    // A hyphen belongs to a name (`-apple-system`; `Helvetica Neue` has spaces and
    // is reached by the phrase rule instead), and `.` deliberately does not: no
    // family name in this vocabulary contains one, and leaving it out keeps a
    // stray `Inter.` from being read as a single unknown name.
    wordChars: /[\p{L}\p{N}_-]/u,

    rules: [
      // ── quoted names, before anything can split them ───────────────────
      {
        kind: 'match',
        pattern: /"[^"\n]*"|'[^'\n]*'/,
        // The scope is decided by what is INSIDE the quotes: a quoted generic is
        // still a generic, and a quoted name the machine does not have is still
        // worth painting as unknown.
        scope: (match) => quotedScope(match.text, KNOWN, GENERICS, ENUMERATED),
      },
      {
        kind: 'match',
        pattern: /["'][^\n]*/,
        scope: SCOPE.unclosed,
      },

      { kind: 'match', scope: SCOPE.separator, pattern: /,/ },

      // ── a weight word, but only where a weight may stand ──────────────
      // A weight is the LAST word of an entry, so the rule looks ahead for a
      // comma or the end of the line. Without that lookahead `Book` in
      // `Book Antiqua` would be painted as a weight. `prevNot` stops it matching
      // the tail of a longer word.
      //
      // The scope is decided from the ANALYSIS rather than from the characters,
      // which is the one place this grammar needs that: `weight` and
      // `weight.missing` are the same word, and only the machine knows which one
      // it is. A rule may look at `match.state` precisely so that a semantic
      // judgement does not have to become a second highlighter.
      {
        kind: 'match',
        pattern: new RegExp(`(?:${WEIGHT_ALTERNATION})(?=\\s*(?:,|$))`, 'im'),
        when: { prevNot: '\\w' },
        scope: (match) => {
          const state = match.state
          if (state.weight === undefined || state.effective < 0) return SCOPE.weight
          const family = state.families[state.effective] ?? ''
          const faces = faceWeights(lookupStyles(STYLES, family))
          // An unread face list means "unknown", never "absent".
          if (faces.length === 0 || faces.includes(state.weight)) return SCOPE.weight
          return SCOPE.weightMissing
        },
      },

      // ── the catalogue, longest phrase first ──────────────────────────
      // The generics come first because they are ALSO in the suggestion space,
      // and a generic painted as an installed family would say the wrong thing
      // about a word whose whole point is that it names no particular font.
      { kind: 'words', words: GENERIC_VOCAB },
      {
        kind: 'words',
        words: FAMILY_VOCAB,
        phrase: { max: PHRASE_WORDS },
      },

      // ── anything else is a name the reader has not seen ──────────────
      // `unknown` when the catalogue is authoritative, because then the browser
      // really will fall through; plain `family` when it is only a suggestion
      // list, because the parser has no business doubting the user.
      {
        kind: 'match',
        pattern: /[^\s,]+/,
        scope: ENUMERATED ? SCOPE.unknown : SCOPE.family,
      },
    ],

    fallbackScope: 'text',

    // ── what the query means ──────────────────────────────────────────────
    analyze: (text) => {
      const entries = []
      const problems = []
      for (const bounds of splitQueryEntries(text)) {
        const read = readEntry(text, bounds, KNOWN, GENERICS, ENUMERATED)
        entries.push(read.entry)
        problems.push(...read.problems)
      }

      const families = []
      let weight
      let weightWord
      let sawWeight = false
      for (const entry of entries) {
        if (entry.name.trim() !== '') families.push(entry.name.trim())
        if (entry.word !== undefined) {
          if (!sawWeight) {
            sawWeight = true
            weight = WEIGHT_WORDS[entry.word]
            weightWord = entry.word
          } else {
            problems.push({
              from: entry.wordFrom,
              to: entry.wordTo,
              message: `The weight is stated more than once. The first one is used and this "${entry.word}" is ignored.`,
              code: 'duplicate-weight',
              severity: 'warning',
            })
          }
        }
      }

      // ── the family that is actually in effect ───────────────────────────
      // With a catalogue read from the machine the first INSTALLED family wins,
      // because that is the one the browser will paint with. Without one the
      // catalogue is only a suggestion list, so the first entry stands.
      let effective = -1
      if (families.length > 0) {
        if (!ENUMERATED) {
          effective = 0
        } else {
          for (let index = 0; index < families.length; index += 1) {
            const lower = (families[index] ?? '').toLowerCase()
            if (isGenericName(lower, GENERICS) || KNOWN.has(lower)) {
              effective = index
              break
            }
          }
        }
      }

      // ── a weight the effective family does not have ──────────────────────
      // Only reported when that family's faces are actually known: an empty face
      // list means "not read", never "not installed".
      if (weight !== undefined && effective >= 0) {
        const family = families[effective] ?? ''
        const faces = faceWeights(lookupStyles(STYLES, family))
        if (faces.length > 0 && !faces.includes(weight)) {
          const entry = entries.find((candidate) => candidate.word !== undefined)
          if (entry !== undefined) {
            problems.push({
              from: entry.wordFrom,
              to: entry.wordTo,
              message: `"${family}" has no ${String(weight)} face, so the browser will synthesise one. It does have ${faces.join(', ')}.`,
              code: 'missing-weight',
              severity: 'warning',
            })
          }
        }
      }

      // A list with no generic tail is a list with nothing to fall back to. The
      // note belongs to the document rather than to a character, which is why its
      // range is empty and sits at the end: underlining an entry to say the LIST
      // is incomplete would put a squiggle on text that is perfectly correct, and
      // a diagnostic outranks a description in a tooltip, so it would also hide
      // what that entry has to say about itself.
      if (
        families.length > 0 &&
        !families.some((family) => isGenericName(family.toLowerCase(), GENERICS))
      ) {
        problems.push({
          from: text.length,
          to: text.length,
          message:
            'No generic family at the end, so a name that fails to resolve has nothing to fall back to. Adding one, such as `sans-serif`, is free.',
          code: 'no-generic-fallback',
          severity: 'info',
        })
      }

      return { entries, families, effective, weight, weightWord, problems }
    },

    validate: (context) => {
      for (const problem of context.state.problems) {
        context.report({
          from: problem.from,
          to: problem.to,
          message: problem.message,
          code: problem.code,
          severity: problem.severity,
        })
      }
    },

    // ── the family in effect, marked rather than recoloured ───────────────
    // It is a decoration and not a scope because it depends on the machine, not
    // on the characters: the same text means something else on a computer with
    // different fonts, and re-lexing the document whenever the catalogue changed
    // would be the wrong shape of work.
    decorate: (_text, state) => {
      const decorations = []
      if (state.effective < 0) return decorations
      const family = state.families[state.effective] ?? ''
      const target = state.entries.find((candidate) => candidate.name.trim() === family)
      if (target !== undefined) {
        decorations.push({
          from: target.nameFrom,
          to: target.nameFrom + target.name.length,
          kind: 'effective',
          title: `in effect: ${family}`,
        })
      }
      return decorations
    },

    // ── what can come next ────────────────────────────────────────────────
    compose: [
      {
        id: 'family',
        // The whole query is entries, so this source is always eligible; the
        // entry under the caret decides what it replaces.
        when: () => true,
        range: (context) => entryRange(context.state, context.caret),
        items: (context) => {
          const entry = entryAt(context.state.entries, context.caret)
          const core = entry?.core ?? ''
          const carried = entry?.word
          // The needle is the FAMILY part of the entry: a weight word the entry
          // already carries would otherwise make `"Geist Mono" medium` match no
          // family at all.
          const inner = unquote(core)
          // The entry as WRITTEN, which is not the same question as what it
          // names. The list is filtered by the text inside the completion range,
          // and that text is the raw entry — so a quoted family is searched for
          // with its quotes, and a row that spells the family without them
          // matches no needle at all. Rows therefore carry a filter text in the
          // spelling the entry is written in, while their label and their insert
          // stay canonical: `"Geist Mono" b` is filtered by `"Geist Mono" bold`
          // and still reads and inserts as the family plus its weight.
          const written = entry?.quoted === true
          const asWritten = (name) => (written ? quoteFamily(name) : name)
          // A quoted entry is the case slicing cannot solve. The reader stopped
          // the family at the closing quote, and no cut of the raw core recovers
          // that boundary: the quotes stay on, so `"Geist Mono"` is looked up as
          // a family and matches nothing. That is how the canonical spelling —
          // `"Geist Mono" medium`, which is what the serializer writes for every
          // multi-word family — lost its weight rows while the bare spelling kept
          // them. The reader already resolved it, so ask the reader; an unclosed
          // quote has nothing to ask it about, and keeps the text as typed so the
          // "as typed" row still matches it exactly.
          const needle =
            entry?.closed === true
              ? entry.name.trim()
              : carried === undefined
                ? inner.trim()
                : inner.slice(0, -carried.length).trim()
          const exact = findExact(SUGGESTION_SPACE, needle)
          // What the caret has already spelled, with any weight word still to
          // come left out. This is what makes `Geist Mono b` offer Geist Mono's
          // weights: the entry as a whole is not a family name, but the part
          // before the word being typed is. Without this fallback a weight
          // becomes unreachable the moment its first letter is typed.
          const headFrom = entry?.coreFrom ?? context.word.from
          const head = unquote(
            context.text.slice(headFrom, Math.max(context.word.from, headFrom)),
          ).trim()
          // Where the caret sits decides whether a pick replaces the entry or is
          // inserted ahead of it. A caret at the very start of a COMPLETE entry is
          // a boundary, not an edit: the user put it there to place another family
          // in front, which is how a fallback stays a fallback.
          const atBoundary =
            entry !== undefined && context.caret <= entry.coreFrom && exact !== undefined

          const familyInEntry = exact ?? findExact(SUGGESTION_SPACE, head)
          // Past the family name the user is reaching for a weight (`Geist Mono b`
          // → Bold); inside the name they are still spelling it out, so the family
          // list leads and never fills with weights while a name is half-written.
          const atFamilyEnd = entry === undefined || context.caret >= entry.wordFrom

          // A weight is only offered once the entry names a family.
          const weightRows = []
          if (familyInEntry !== undefined && !atBoundary && atFamilyEnd) {
            const detected = faceWeights(lookupStyles(STYLES, familyInEntry))
            const pool = detected.length > 0 ? detected : [...FONT_WEIGHTS]
            const typedWord = context.word.prefix.toLowerCase()
            for (const value of pool) {
              const word = weightWord(value)
              if (typedWord !== '' && !word.startsWith(typedWord)) continue
              weightRows.push({
                label: `${familyInEntry} ${word}`,
                filterText: `${asWritten(familyInEntry)} ${word}`,
                insert:
                  quoteFamily(familyInEntry) + (value === SHIPPED_WEIGHT ? '' : ` ${word}`),
                kind: 'weight',
                detail: `font-weight ${String(value)}`,
                documentation:
                  value === SHIPPED_WEIGHT
                    ? 'The weight this axis already uses, so picking it takes the word away rather than spelling out a value nobody chose.'
                    : undefined,
                // A weight's position is decided by the SCALE and not by the
                // length of its label, which is what the zero-padded key is for:
                // without it the shortest word would lead, so `bold` would sit
                // above the shipped `regular` and the list would look shuffled.
                // The weight the entry already states outranks all of them, so an
                // Enter that accepts the top row re-applies what is written.
                sortText: word === carried ? '0' : `1${String(value).padStart(3, '0')}`,
              })
            }
          }

          const familyRows = []
          for (const name of SUGGESTION_SPACE) {
            const generic = isGenericName(name.toLowerCase(), GENERICS)
            familyRows.push({
              label: name,
              // The family alone, in the entry's spelling — never with the carried
              // weight word appended. The needle is the whole entry, so a family
              // row beside a completed weight would match it twice and put two
              // rows with the same insert in the list.
              filterText: asWritten(name),
              // A completion never drops a weight the entry already states: the
              // word travels with the pick, so swapping the family does not
              // quietly reset the weight.
              insert: quoteFamily(name) + (carried === undefined ? '' : ` ${carried}`),
              mode: atBoundary ? 'before' : 'replace',
              // A comma invites the next fallback. Only after a family, never
              // after a weight, which completes the entry instead of starting one.
              append: atBoundary || lastEntry(context.state, context.caret) ? ', ' : '',
              kind: generic ? 'generic' : 'family',
              detail: generic
                ? 'generic family'
                : KNOWN.has(name.toLowerCase())
                  ? 'installed'
                  : 'suggested',
              // After the weights when weights lead, which is the whole reason a
              // grammar gets to name the group: `2` sorts above `1xxx` and below
              // `0`.
              sortText: weightRows.length > 0 ? '2' : '0',
            })
          }

          const rows = weightRows.length > 0 ? [...weightRows, ...familyRows] : familyRows
          // The entry exactly as typed, so a name nobody catalogued can still be
          // completed to itself rather than being impossible to accept.
          if (needle !== '' && exact === undefined && !isGenericName(needle.toLowerCase(), GENERICS)) {
            rows.push({
              label: inner,
              filterText: written ? core : inner,
              insert: inner,
              kind: 'custom',
              detail: 'as typed',
              documentation:
                'Written exactly as it stands. A name the browser does not have is still a valid declaration: it is what lets a stack work on a machine this one cannot see.',
              sortText: '3',
            })
          }
          return rows
        },
      },
    ],

    // ── what a thing is ───────────────────────────────────────────────────
    describe: (context) => {
      const token = context.token
      if (token === undefined) return undefined
      const state = context.state
      const entry = entryAt(state.entries, context.offset)

      if (token.scope === SCOPE.separator) return undefined

      if (token.scope === SCOPE.weight || token.scope === SCOPE.weightMissing) {
        const word = token.text.toLowerCase()
        const value = WEIGHT_WORDS[word]
        const family = state.effective >= 0 ? state.families[state.effective] : undefined
        if (value === undefined) return { title: token.text }
        const faces = family === undefined ? [] : faceWeights(lookupStyles(STYLES, family))
        return {
          title: `${word} — font-weight ${String(value)}`,
          detail:
            entry?.name === ''
              ? 'applies to the whole axis'
              : `applies to ${family ?? 'the first family'}`,
          body:
            faces.length === 0
              ? `${family ?? 'This family'} was not read, so whether it has a ${String(value)} face is unknown.`
              : faces.includes(value)
                ? `${family ?? 'This family'} has this face.`
                : `${family ?? 'This family'} has no ${String(value)} face, so the browser will synthesise one.`,
        }
      }

      if (token.scope === SCOPE.generic) {
        return {
          title: token.text,
          detail: 'a generic CSS family',
          body: 'Always valid, and only useful at the end of the list: it is what the browser falls back to when nothing before it resolves.',
        }
      }

      if (token.scope === SCOPE.unclosed) {
        return {
          title: token.text,
          detail: 'unclosed quote',
          body: 'The closing quote is missing, so this and everything after it are read as one family name. A font family containing a quote character has to be written with the other quote style, because backslash escapes are deliberately not interpreted.',
        }
      }

      if (entry !== undefined && entry.kind === 'unknown') {
        return {
          title: entry.name,
          detail: 'not installed here',
          body: 'Still a valid declaration: it is written to the setting, and the browser falls through to the next family in the list when it cannot resolve. Reordering it to the end of the list is what the fallbacks are for.',
        }
      }

      const entryDoc = FAMILY_VOCAB.entryFor(token.text)
      const installed = KNOWN.has(token.text.toLowerCase())
      const faces = faceWeights(lookupStyles(STYLES, token.text))
      return {
        title: token.text,
        detail: installed ? 'installed' : 'not read on this machine',
        body:
          entryDoc?.body ??
          (faces.length > 0
            ? `Faces read from this machine: ${faces.join(', ')}.`
            : 'This family has no faces recorded, so its weights are unknown rather than absent.'),
      }
    },
  })
}

/**
 * Browser half of `dsh-font` — the source of the prebuilt `lib/client.js`.
 *
 * This file is NOT loaded as an ES module. `scripts/build-client.mjs` wraps it
 * in the DSH client-bundle envelope and writes `lib/client.js`, which is what
 * the Web shell fetches. Keep it dependency-light: the only modules it may
 * `import` are the platform-singleton specifiers the shell seeds into its
 * module table, the editor engine the build compiles in, and this plugin's own
 * `./font-grammar.js`, which the build splices into this same scope.
 *
 * Presentation strategy
 * ---------------------
 * Families are *not* written as CSS custom properties directly, because
 * `ui-layout`'s theme presenter owns `document.body.style` and deletes any
 * custom property it did not write on every theme change. Instead the families
 * are stacked onto the design system through the theme service
 * (`ctx.theme.overrideTokens`), which folds them into the active token set so
 * the presenter republishes them — and keeps republishing them — itself.
 *
 * Sizes are a stylesheet, because the shipped components hard-code every
 * interface text size in px and the shipped token scale is a fixed ladder
 * (`--dsw-font-xs-13` is 13px, period). The sheet re-derives each hard-coded
 * step from `--dsh-font-ui-scale` and redefines the conversation text tokens
 * as absolute px, so one integer drives the whole surface.
 *
 * @module dsh-font/client
 */

		let _react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		// @citisen/litearea is compiled in above
		// ./font-grammar.js is compiled in above
/** Settings namespace owned by this plugin (mirrors the host half). */
const FONT_SETTINGS_NAMESPACE = 'ui-font'
/** Locale namespace owning this feature's settings-row copy. */
const SETTINGS_LOCALE_NAMESPACE = 'settings.font'
/** Cosmetic namespace for this plugin's CSS classes and tags. */
const STYLE_PREFIX = 'dsh-font'
/**
 * Id of the single stylesheet this plugin owns. The host half's pre-paint
 * bootstrap looks the same element up by this id, so the two must agree;
 * `scripts/verify-client.mjs` asserts that they do.
 */
const FONT_STYLE_ID = `${STYLE_PREFIX}/variables`
/**
 * The plugin's identity in the theme registry, substituted with the real
 * package name by `scripts/build-client.mjs`. The theme pins one override layer
 * per source, so this must equal the package the roster mounted.
 */
const PLUGIN_ID = "@citisen/dsh-font"

/** Field names — must match the host schema in `lib/index.js`. */
const UI_FONT_FAMILY_FIELD = 'uiFontFamily'
const CODE_FONT_FAMILY_FIELD = 'codeFontFamily'
const CODE_FONT_WEIGHT_FIELD = 'codeFontWeight'
const UI_FONT_WEIGHT_FIELD = 'uiFontWeight'
const UI_FONT_SCALE_FIELD = 'uiFontScale'
const CONTENT_FONT_SIZE_FIELD = 'contentFontSize'
const CODE_FONT_SIZE_FIELD = 'codeFontSize'

/** Defaults — must match the host schema in `lib/index.js`. */
const DEFAULT_UI_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
const DEFAULT_CODE_FONT_FAMILY =
  '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"'

/** Accepted ranges — must match the host schema in `lib/index.js`. */
const UI_FONT_SCALE_MIN = 0.75
const UI_FONT_SCALE_MAX = 1.5
const UI_FONT_SCALE_STEP = 0.05
const CONTENT_FONT_SIZE_MIN = 12
const CONTENT_FONT_SIZE_MAX = 20
const CODE_FONT_SIZE_MIN = 10
const CODE_FONT_SIZE_MAX = 20
/** The shipped code weight — must match `DEFAULT_CODE_FONT_WEIGHT` in the host. */
const DEFAULT_CODE_FONT_WEIGHT = 400
/**
 * The shipped interface weight — must match `DEFAULT_UI_FONT_WEIGHT` in the
 * host. It is the design system's own base weight, so it is the "no override"
 * value: the interface weight rule is emitted only for something else.
 */
const DEFAULT_UI_FONT_WEIGHT = 400

/** The interface text sizes the shipped components hard-code, in px. */
const UI_TEXT_STEPS = [11, 12, 13, 14, 16, 20, 24]

// ─── the code weight: a closed vocabulary ───────────────────────────────────
//
// The design system ships no weight token at all: every `font:` declaration in
// the interface is a literal, and the code ladder is literally `400`. So the
// weight cannot ride the family token the way the family does — `font-family`
// has no slot for it, and `font-family: "Geist Mono" 500, monospace` is simply
// an invalid declaration that would drop the whole stack. It has to be a
// separate `font-weight`, which is what the field below carries.
//
// The list is closed rather than a free number on purpose: a `font-weight` a
// family does not have is synthesized by the browser, and offering faux-bold as
// a normal choice is worse than not offering it. The numbers are the CSS Fonts
// keyword scale, which is also the scale the Local Font Access API reports the
// individual faces of a family on.

/** Selectable code weights, in the order the picker shows them. */
const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** Locale key suffix per weight — `font.weight.medium` and friends. */
const WEIGHT_KEYS = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'regular',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
}

/**
 * Weight words a typed family name may end with, mapped to their number.
 *
 * This is what makes `Geist Mono Medium` mean "Geist Mono at 500" rather than a
 * literal family called `Geist Mono Medium`, which resolves to nothing. A
 * variable font like Geist Mono has one family and the whole weight axis, so
 * every one of these words — and each static `Light`/`Medium`/`Bold` face file
 * — is a weight, never a family.
 *
 * Deliberately absent: the bare numbers. `400` is far too easy to hit as part
 * of a real family name (`Mono 2`, `JBMono 400`), and the picker has a control
 * for the weight, so a numeric suffix is left alone.
 */
const WEIGHT_WORDS = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  book: 400,
  normal: 400,
  regular: 400,
  roman: 400,
  medium: 500,
  demibold: 600,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 900,
  ultrablack: 900,
}

// ─── the font query: a small language over `font-family` ────────────────────
//
// What the settings row edits is a *query*, not a CSS value:
//
//     Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
//     └─────┬────┘ └──┬─┘
//         family    weight
//
// The grammar is the CSS font-family list plus the one thing the list cannot
// carry: the weight. `font-family: "Geist Mono" 500, monospace` is an invalid
// declaration that drops the whole stack, so the weight has to be its own
// `font-weight` — but it can still be *written* next to the family it belongs
// to, which is what makes one field able to describe both. A weight is chosen
// for a family; having to change them in two separate places is exactly the
// problem this language exists to remove.
//
//   query  := entry ("," entry)*
//   entry  := family | weight
//   family := '"' … '"' | "'" … "'" | word (space word)*
//   weight := a word from WEIGHT_WORDS
//
// Only the LAST word of an unquoted entry may be a weight word, and only when
// the whole entry is not itself a catalogued family: `Book Antiqua` and
// `Franklin Gothic Medium` are real families, and stripping either would
// silently retarget the stack at a font nobody picked. Quoting always means
// "this is the family name, verbatim", so a quoted entry never splits.
//
// The weight is one value for the whole axis, so where it is written does not
// change what it means. The canonical form puts it after the FIRST family —
// the one that is in effect — where it reads as a property of that family.
//
// The parser is forgiving on purpose. This text is typed by hand into a small
// box, not generated, so anything it cannot place is kept as written and
// reported as a diagnostic instead of being silently dropped.

/** One diagnostic code the reader can raise; the row localizes each one. */
const QUERY_DIAGNOSTIC = {
  unknownFamily: 'unknown-family',
  missingWeight: 'missing-weight',
  duplicateWeight: 'duplicate-weight',
  unclosedQuote: 'unclosed-quote',
  trailingText: 'trailing-text',
}

/**
 * The word a numeric weight is spelled with in a query: 500 -> `medium`.
 * @param weight - a numeric weight, or anything `normalizeWeight` accepts.
 * @returns the canonical word for it.
 */
function weightWord(weight) {
  return WEIGHT_KEYS[normalizeWeight(weight)] ?? String(weight)
}

/**
 * The weights one family actually has, read off its faces' style names.
 *
 * The Local Font Access API reports a face's `style` (`Regular`, `SemiBold`,
 * `Bold Italic`) rather than a number, so the mapping is the same vocabulary
 * the query itself accepts — which is also why `Semi Bold` has to be folded
 * back into one word before the lookup: the API's spelling is not guaranteed.
 *
 * An empty result means "unknown", not "none": enumerating faces is
 * permission-gated and a family may report styles this vocabulary cannot read.
 * Callers must treat it as the absence of evidence.
 * @param styles - the face style names of one family.
 * @returns the distinct weights, ascending.
 */
function faceWeights(styles) {
  if (!Array.isArray(styles)) return []
  const found = new Set()
  for (const style of styles) {
    const text = String(style)
      .toLowerCase()
      .replace(/\b(semi|demi)\s+(?=[a-z])/g, 'semi')
      .replace(/\b(extra|ultra)\s+(?=[a-z])/g, 'extra')
    for (const word of text.split(/[^a-z]+/)) {
      if (Object.hasOwn(WEIGHT_WORDS, word)) found.add(WEIGHT_WORDS[word])
    }
  }
  return [...found].sort((left, right) => left - right)
}

/**
 * Whether a lowercase name is a generic CSS family (`monospace`, `serif`, …).
 * Generic families are always valid in a list, but picking one is a different
 * intent from picking an installed font, so the language colours them apart.
 * @param name - a lowercase family name.
 * @returns whether it is generic.
 */
function isGenericFamilyName(name) {
  return GENERIC_FAMILIES.includes(name)
}

/**
 * Split a query into its comma-separated entries, keeping every raw slice.
 *
 * The raw slices are what makes an edit able to rewrite the text without
 * reformatting it: `lead + core + trail` is always exactly the entry as it was
 * found, so a rewrite that only reorders entries cannot lose a space.
 *
 * Commas inside quotes are not separators. Backslash escapes are deliberately
 * not interpreted — consistent with {@link parseFamilyList} — so a family name
 * containing the quote character has to be written with the other quote style.
 *
 * @param text - the query.
 * @returns one record per entry, in order; a blank query yields one empty entry.
 */
function splitQueryEntries(text) {
  const source = typeof text === 'string' ? text : ''
  const bounds = []
  let start = 0
  let quote = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ',') {
      bounds.push([start, index])
      start = index + 1
    }
  }
  bounds.push([start, source.length])

  return bounds.map(([from, to]) => {
    const text = source.slice(from, to)
    const trimmed = text.trim()
    const lead = trimmed === '' ? text : text.slice(0, text.indexOf(trimmed))
    const core = trimmed
    const trail = text.slice(lead.length + core.length)
    return {
      text,
      start: from,
      end: to,
      lead,
      core,
      trail,
    }
  })
}

/**
 * Read one entry into the family it names and the weight word it carries.
 *
 * The two shapes a weight can take are both here: a bare entry whose last word
 * is a weight (`Geist Mono medium`), and a quoted family followed by one
 * (`"Geist Mono" medium` — which is what the canonical form writes, and why a
 * quoted entry cannot simply mean "no weight"). A quoted name whose closing
 * quote is the last character carries no weight, so `"Book Antiqua"` stays a
 * name even though a bare `Book Antiqua` could split if it were not catalogued.
 *
 * This is the same reading the editor's grammar performs, and the grammar is
 * built on this function rather than on a second copy of it.
 *
 * @param entry - one record from {@link splitQueryEntries}.
 * @param known - the lowercase catalogue.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns `{ name, word, diagnostics }`.
 */
function readQueryEntry(entry, known, enumerated) {
  const core = entry.core
  const diagnostics = []
  if (core === '') return { name: '', word: undefined, diagnostics }

  const quoteChar = core[0]
  const quote = quoteChar === '"' || quoteChar === "'" ? quoteChar : ''
  const lower = core.toLowerCase()
  let name = core
  let word

  if (quote !== '') {
    const close = core.indexOf(quote, 1)
    if (close < 0) {
      diagnostics.push({ code: QUERY_DIAGNOSTIC.unclosedQuote })
      name = core.slice(1).trim()
    } else {
      name = core.slice(1, close)
      const rest = core.slice(close + 1).trim()
      if (rest !== '') {
        if (Object.hasOwn(WEIGHT_WORDS, rest.toLowerCase())) {
          word = rest.toLowerCase()
        } else {
          diagnostics.push({ code: QUERY_DIAGNOSTIC.trailingText, text: rest })
        }
      }
    }
  } else if (isGenericFamilyName(lower) || known.has(lower)) {
    // The whole entry is one family: there is nothing to strip off it.
  } else if (Object.hasOwn(WEIGHT_WORDS, lower)) {
    // A bare weight word stands on its own, without a family.
    name = ''
    word = lower
  } else {
    const cut = lower.lastIndexOf(' ')
    if (cut > 0 && Object.hasOwn(WEIGHT_WORDS, lower.slice(cut + 1))) {
      word = lower.slice(cut + 1)
      name = core.slice(0, core.length - word.length).trim()
    }
  }

  const nameLower = name.trim().toLowerCase()
  const generic = nameLower !== '' && isGenericFamilyName(nameLower)
  const catalogued = nameLower !== '' && known.has(nameLower)
  if (nameLower !== '' && !generic && !catalogued && enumerated) {
    diagnostics.push({ code: QUERY_DIAGNOSTIC.unknownFamily, name: name.trim() })
  }
  return { name: name.trim(), word, diagnostics }
}

/** The diagnostic-free pieces a query resolves to. */
function emptyQueryRead() {
  return {
    families: [],
    weight: undefined,
    weightWord: undefined,
    effective: -1,
    diagnostics: [],
  }
}

/**
 * Read a query into the families it names, the weight it carries, and the
 * problems a reader is owed — the one pass behind {@link parseFontQuery}.
 * @param text - the query.
 * @param options - `{ catalogue, styles, enumerated }`. `enumerated` declares
 *   the catalogue authoritative (read from the machine), which is what makes an
 *   unrecognized family worth warning about.
 * @returns `{ entries, families, weight, weightWord, effective, diagnostics }`.
 */
function readFontQuery(text, options) {
  const read = emptyQueryRead()
  if (typeof text !== 'string' || text === '') return read

  const catalogue = Array.isArray(options?.catalogue) ? options.catalogue : []
  const known = new Set(catalogue.map((family) => String(family).toLowerCase()))
  const styles = options?.styles ?? {}
  const styleKeys = new Map()
  for (const key of Object.keys(styles)) styleKeys.set(key.toLowerCase(), key)
  const enumerated = options?.enumerated === true

  let sawWeight = false

  for (const entry of splitQueryEntries(text)) {
    const readEntry = readQueryEntry(entry, known, enumerated)
    for (const diagnostic of readEntry.diagnostics) read.diagnostics.push(diagnostic)
    if (readEntry.name !== '') read.families.push(readEntry.name)

    if (readEntry.word !== undefined) {
      if (!sawWeight) {
        sawWeight = true
        read.weight = WEIGHT_WORDS[readEntry.word]
        read.weightWord = readEntry.word
      } else {
        read.diagnostics.push({ code: QUERY_DIAGNOSTIC.duplicateWeight, word: readEntry.word })
      }
    }
  }

  // ── the family that is actually in effect ────────────────────────────────
  // With an authoritative catalogue the first *installed* family wins, because
  // that is the one the browser will paint with. Without one the catalogue is
  // only a suggestion list, so the parser cannot second-guess the first entry.
  if (read.families.length > 0) {
    if (!enumerated) {
      read.effective = 0
    } else {
      for (let index = 0; index < read.families.length; index += 1) {
        const lower = read.families[index].toLowerCase()
        if (isGenericFamilyName(lower) || known.has(lower)) {
          read.effective = index
          break
        }
      }
    }
  }

  // ── a weight the effective family does not have ──────────────────────────
  // Only reported when the faces of that family are actually known: an empty
  // face list means "not read", never "not installed".
  if (read.weight !== undefined && read.effective >= 0) {
    const family = read.families[read.effective]
    const key = styleKeys.get(family.toLowerCase())
    const weights = key === undefined ? [] : faceWeights(styles[key])
    if (weights.length > 0 && !weights.includes(read.weight)) {
      read.diagnostics.push({
        code: QUERY_DIAGNOSTIC.missingWeight,
        name: family,
        weight: read.weight,
        word: read.weightWord,
      })
    }
  }

  return read
}

/**
 * Parse a query into the two stored fields it stands for.
 * @param text - the query.
 * @param options - see {@link readFontQuery}.
 * @returns `{ families, weight, weightWord, effective, diagnostics }`.
 */
function parseFontQuery(text, options) {
  const read = readFontQuery(text, options)
  return {
    families: read.families,
    weight: read.weight,
    weightWord: read.weightWord,
    effective: read.effective,
    diagnostics: read.diagnostics,
  }
}

/**
 * Write families and a weight back out as the canonical query.
 *
 * The weight is attached to the first family — the one in effect — and is
 * omitted entirely for `undefined`, which is how an axis says "no weight of my
 * own". Everything else is quoted the way CSS requires.
 * @param families - family names in priority order.
 * @param weight - the numeric weight, or undefined.
 * @returns the query text.
 */
function serializeFontQuery(families, weight) {
  const list = Array.isArray(families) ? families : []
  const word = weight === undefined || weight === null ? undefined : weightWord(weight)
  return list
    .map((family, index) =>
      index === 0 && word !== undefined ? `${quoteFamily(family)} ${word}` : quoteFamily(family),
    )
    .filter((token) => token !== '')
    .join(', ')
}

/**
 * Families plus a weight, as the text the editor edits.
 *
 * The axis's shipped weight carries no word. Nobody chose it, so spelling it out
 * would put a `regular` after every interface font, and for the interface axis
 * 400 literally means "no override"; the readout under the field is where the
 * value in force is stated instead.
 * @param families - family names in priority order.
 * @param weight - the axis's weight.
 * @param shippedWeight - the weight the axis ships with.
 * @returns the query text.
 */
function asQuery(families, weight, shippedWeight) {
  return serializeFontQuery(families, weight === shippedWeight ? undefined : weight)
}

/**
 * The two stored fields read as the one query the editor edits.
 *
 * The family list is parsed rather than trusted: a weight word left inside the
 * stored string by a hand edit belongs to the weight field, so the two values
 * are read as one query instead of the raw string being shown. A value that
 * parses to no family at all is kept as written, which is what stops a stack
 * the parser cannot place from being silently emptied on load.
 * @param value - the stored family list.
 * @param weight - the stored weight.
 * @param options - see {@link readFontQuery}.
 * @param shippedWeight - the weight the axis ships with.
 * @returns `{ text, families }`: the text the editor starts from, and the family
 *   names it stands for, which is what the readout under the box states.
 */
function storedQuery(value, weight, options, shippedWeight) {
  const read = parseFontQuery(value, options)
  const families = read.families.length > 0 ? read.families : parseFamilyList(value)
  return { text: asQuery(families, weight, shippedWeight), families }
}

/**
 * Tell the row what a query means: the two settings fields it names.
 *
 * This is the whole hand-off between the editor and the settings, and it is a
 * pure function of the text, so the verifier can drive it without a browser. It
 * runs on EVERY change rather than on a commit: the library owns the text, so
 * there is no controlled field to re-render and nothing to wait for.
 *
 * A query that names no family is an unfinished edit and writes nothing — the
 * saved stack is still in use, and silently refilling a box the user just
 * cleared is indistinguishable from a bug. A query that names a weight but no
 * family still moves that axis, because a weight alone is a complete statement
 * about it.
 * @param text - the query as it stands in the editor.
 * @param options - see {@link readFontQuery}.
 * @param write - `{ onFamilies, onWeight }`, the row's two write paths.
 * @returns the parse, so a caller can report the same reading it wrote.
 */
function applyFontQuery(text, options, write) {
  const read = parseFontQuery(text, options)
  if (read.families.length > 0) write.onFamilies(serializeFamilyList(read.families))
  if (read.weight !== undefined) write.onWeight(read.weight)
  return read
}

/**
 * Move the entry a caret sits in one slot earlier or later.
 *
 * This is the editor's answer to drag-and-drop: order is still significant (the
 * first installed family wins), but it is edited as text, so the keyboard never
 * has to reach for a pointer. Only the entries swap; every space and comma
 * stays exactly where it was.
 *
 * @param text - the query.
 * @param caret - the caret offset, which selects the entry to move.
 * @param delta - `-1` for earlier, `1` for later.
 * @returns `{ text, caret }`; unchanged when the move leaves the list.
 */
function moveFontQueryEntry(text, caret, delta) {
  const source = typeof text === 'string' ? text : ''
  const entries = splitQueryEntries(source)
  if (entries.length < 2) return { text: source, caret }

  let index = entries.length - 1
  for (let position = 0; position < entries.length; position += 1) {
    if (caret <= entries[position].end) {
      index = position
      break
    }
  }
  const target = index + delta
  if (target < 0 || target >= entries.length) return { text: source, caret }

  const cores = entries.map((entry) => entry.core)
  const moved = cores[index]
  cores[index] = cores[target]
  cores[target] = moved

  const parts = entries.map((entry, position) => `${entry.lead}${cores[position]}${entry.trail}`)
  const starts = []
  let cursor = 0
  for (const part of parts) {
    starts.push(cursor)
    cursor += part.length + 1 // the comma this part is joined with
  }
  const offset = Math.min(
    Math.max(caret - (entries[index].start + entries[index].lead.length), 0),
    cores[target].length,
  )
  return {
    text: parts.join(','),
    caret: starts[target] + entries[target].lead.length + offset,
  }
}

/**
 * Alt+Arrow: move the entry the caret sits in, and put the caret back on it.
 *
 * This is the plugin's own binding, not an editor feature. The library has no
 * such key — reordering is a fact about a font stack, where the first resolvable
 * family wins, and not about text in general — so it is implemented here, on the
 * editor's own `input`, and it is the only keyboard gesture this plugin adds.
 *
 * It is a TEXT edit rather than a settings write. `setValue(…, true)` is what
 * makes it one undoable edit rather than a document load, which is what keeps
 * Ctrl+Z from throwing away everything the user typed before the move; the caret
 * is restored afterwards because the reorder moved the text under it.
 *
 * @param editor - the editor handle: `value`, `input`, `setValue`, `setSelection`.
 * @param event - the `keydown` event.
 * @param options - see {@link readFontQuery}.
 * @param write - `{ onFamilies, onWeight }`, the row's two write paths.
 * @returns `{ text, caret }` when the key moved an entry, `undefined` when it was
 *   not a reorder or the entry was already at the end of the list.
 */
function reorderFontQueryEntry(editor, event, options, write) {
  if (event.altKey !== true) return undefined
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return undefined
  const moved = moveFontQueryEntry(
    editor.value,
    editor.input.selectionStart ?? 0,
    event.key === 'ArrowUp' ? -1 : 1,
  )
  if (moved.text === editor.value) return undefined
  event.preventDefault()
  editor.setValue(moved.text, true)
  editor.setSelection(moved.caret)
  applyFontQuery(moved.text, options, write)
  return moved
}

/**
 * The weight an interface step keeps when the whole interface is moved.
 *
 * The interface has a weight hierarchy — headings 700, table heads 500, body
 * 400 — and setting the interface weight has to preserve the *contrast* between
 * those steps rather than flatten it, or every heading would sink below the body
 * once the base goes past it. So each step keeps its shipped distance from 400
 * and is never allowed below the base.
 *
 * @param shipped - the step's shipped weight.
 * @param weight - the interface weight.
 * @returns the weight that step takes.
 */
function emphasisWeight(shipped, weight) {
  if (weight === DEFAULT_UI_FONT_WEIGHT) return shipped
  return Math.min(900, Math.max(shipped, shipped + weight - DEFAULT_UI_FONT_WEIGHT))
}

/**
 * Whether a diagnostic is a syntax error or a note about the machine.
 *
 * Text the reader cannot make sense of is marked as an error — the red line the
 * user is owed when their input is wrong — while a family or a weight that is
 * merely not installed here stays a warning: it is still a valid query, and the
 * browser may well resolve it.
 * @param code - a `QUERY_DIAGNOSTIC` code.
 * @returns `'error'` or `'warn'`.
 */
function diagnosticKind(code) {
  return code === QUERY_DIAGNOSTIC.unclosedQuote || code === QUERY_DIAGNOSTIC.trailingText
    ? 'error'
    : 'warn'
}

/** Substitute `{name}`-style placeholders in one locale template. */
function fillTemplate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  )
}

/**
 * Localize one query diagnostic.
 * @param diagnostic - a record from {@link parseFontQuery}'s `diagnostics`.
 * @param labels - the row's copy: `unknownFamily`, `missingWeight`,
 *   `duplicateWeight`, `unclosedQuote`.
 * @returns the message to show, or `''` for a code this build does not know.
 */
function describeDiagnostic(diagnostic, labels) {
  switch (diagnostic.code) {
    case QUERY_DIAGNOSTIC.unknownFamily:
      return fillTemplate(labels.unknownFamily, { name: diagnostic.name })
    case QUERY_DIAGNOSTIC.missingWeight:
      return fillTemplate(labels.missingWeight, {
        family: diagnostic.name,
        weight: diagnostic.weight,
        word: diagnostic.word,
      })
    case QUERY_DIAGNOSTIC.duplicateWeight:
      return fillTemplate(labels.duplicateWeight, { word: diagnostic.word })
    case QUERY_DIAGNOSTIC.unclosedQuote:
      return labels.unclosedQuote
    case QUERY_DIAGNOSTIC.trailingText:
      return fillTemplate(labels.trailingText, { text: diagnostic.text })
    default:
      return ''
  }
}

/**
 * The number a stored weight token stands for.
 * @param weight - a stored value or a weight word.
 * @returns the numeric weight, falling back to the shipped one.
 */
function normalizeWeight(weight) {
  if (typeof weight === 'number' && FONT_WEIGHTS.includes(weight)) return weight
  if (typeof weight === 'string' && Object.hasOwn(WEIGHT_WORDS, weight.toLowerCase())) {
    return WEIGHT_WORDS[weight.toLowerCase()]
  }
  return DEFAULT_CODE_FONT_WEIGHT
}

// ─── the font-family list: parse, serialize, discover ───────────────────────
//
// The stored value stays a plain CSS font-family string (that is what the host
// schema declares and what the theme token consumes), so this section is purely
// a presentation layer over it: parse the string into an ordered list for the
// chips, and serialize the chips back. The weight is the one thing the string
// cannot express, so it is a second field rather than anything added here.

/** Generic CSS families. Valid anywhere in a list, but only useful at the end. */
const GENERIC_FAMILIES = [
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'math',
  'emoji',
  'fangsong',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
]

/**
 * Popular families offered as suggestions even when not detected. Detection
 * cannot see every font, and a family may be installed later, so the picker
 * must not present itself as the complete truth.
 */
const COMMON_FAMILIES = [
  'Inter',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'Noto Sans',
  'Noto Sans SC',
  'Noto Serif',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'JetBrains Mono',
  'Fira Code',
  'Fira Sans',
  'Cascadia Code',
  'Cascadia Mono',
  'Maple Mono',
  'Roboto',
  'Roboto Mono',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Ubuntu',
  'Ubuntu Mono',
  'DejaVu Sans',
  'DejaVu Sans Mono',
  'Hack',
  'Inconsolata',
  'Iosevka',
  'Comic Sans MS',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'Microsoft JhengHei',
  'SimSun',
  'SimHei',
  'KaiTi',
  'Segoe UI',
  'Segoe UI Variable',
  'Helvetica Neue',
  'Arial',
  'Consolas',
  'Menlo',
  'Monaco',
  'SF Mono',
  'Courier New',
  'Times New Roman',
  'Georgia',
]

/**
 * Families worth probing for when the Local Font Access API is unavailable.
 * Each entry costs two text measurements, so this stays curated rather than
 * exhaustive.
 */
const PROBE_FAMILIES = [
  ...new Set([...COMMON_FAMILIES, ...GENERIC_FAMILIES]),
  '-apple-system',
  'BlinkMacSystemFont',
  'Meiryo',
  'Yu Gothic',
  'Malgun Gothic',
  'Segoe UI Emoji',
  'Noto Color Emoji',
  'Apple Color Emoji',
  'Cambria',
  'Calibri',
  'Candara',
  'Corbel',
  'Franklin Gothic Medium',
  'Trebuchet MS',
  'Verdana',
  'Tahoma',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Book Antiqua',
  'Garamond',
  'FangSong',
  'Microsoft Himalaya',
  'Sarasa Mono SC',
  'LXGW WenKai',
  'HarmonyOS Sans SC',
  'MiSans',
  'Source Code Pro',
  'Roboto Condensed',
  'Roboto Slab',
  'PT Sans',
  'PT Mono',
  'Nunito',
  'Rubik',
  'Work Sans',
  'Space Mono',
  'Victor Mono',
  'Cousine',
  'Anonymous Pro',
  'Liberation Mono',
  'Liberation Sans',
  'Nimbus Mono PS',
  'Droid Sans Mono',
]

/** The family used as the "not installed" baseline when probing. */
const PROBE_BASELINE = 'monospace'
/** Text that renders differently across families in both width and height. */
const PROBE_TEXT = 'mmmmmmmmmmlliWWQ@#中永'
/** Probe font size, in px. */
const PROBE_SIZE = 72
/** One finished discovery result. */
const FONT_DISCOVERY_CACHE_KEY = 'dsh-font:discovery:v2'

/**
 * Split a CSS font-family string into its individual family names, unwrapping
 * quotes. Commas inside quotes are preserved, which a naive `split(',')` gets
 * wrong for the `"Foo, Bar"` form.
 * @param value - a CSS font-family value.
 * @returns family names in order; `[]` for a blank value.
 */
function parseFamilyList(value) {
  if (typeof value !== 'string') return []
  const families = []
  let current = ''
  let quote = ''
  for (const char of value) {
    if (quote !== '') {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ',') {
      families.push(current)
      current = ''
      continue
    }
    current += char
  }
  families.push(current)
  return families.map((family) => family.trim()).filter((family) => family !== '')
}

/**
 * Render one family name for a CSS list, quoting it when CSS requires it.
 * A family is a sequence of identifiers, so anything with a space or a leading
 * digit must be quoted; names are emitted double-quoted because that is the
 * form the shipped defaults already use.
 * @param family - a bare family name.
 * @returns the CSS token for it.
 */
function quoteFamily(family) {
  const name = family.trim()
  if (name === '') return ''
  // A CSS-wide keyword or a generic family must not be quoted: `"sans-serif"`
  // would name a literal font instead of the generic family. A single leading
  // hyphen is part of an identifier (`-apple-system`), so it survives unquoted
  // too — which is what lets the shipped interface stack round-trip unchanged.
  if (/^-?[A-Za-z][\w-]*$/.test(name)) return name
  return `"${name.replaceAll('"', '')}"`
}

/**
 * Join family names back into a CSS font-family string.
 * @param families - family names in priority order.
 * @returns the CSS value.
 */
function serializeFamilyList(families) {
  return families.map(quoteFamily).filter((token) => token !== '').join(', ')
}

/**
 * Measure whether one family is actually installed.
 *
 * The technique is the classic width/height comparison: render the probe text
 * in `<family>, <baseline>` and again in the bare baseline. When the family is
 * absent both renders lay out identically, because the browser fell through to
 * the same baseline font. This needs no permission and works in every browser,
 * which is why it is the fallback rather than the primary.
 * @param family - family name to test.
 * @returns whether it renders differently from the baseline.
 */
function isFamilyAvailable(family) {
  if (typeof document === 'undefined') return false
  if (family === PROBE_BASELINE) return true
  const probe = document.createElement('span')
  probe.textContent = PROBE_TEXT
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:-9999px',
    'visibility:hidden',
    'white-space:nowrap',
    `font-size:${String(PROBE_SIZE)}px`,
    'line-height:normal',
  ].join(';')
  const parent = document.body ?? document.documentElement
  if (parent === null || parent === undefined) return false
  parent.appendChild(probe)
  try {
    probe.style.fontFamily = PROBE_BASELINE
    const baseWidth = probe.offsetWidth
    const baseHeight = probe.offsetHeight
    probe.style.fontFamily = `${quoteFamily(family)}, ${PROBE_BASELINE}`
    return probe.offsetWidth !== baseWidth || probe.offsetHeight !== baseHeight
  } finally {
    probe.remove()
  }
}

/**
 * Ask the browser for the real installed families and their face styles.
 *
 * Chromium's Local Font Access API is the only way to enumerate actual fonts.
 * It is permission-gated, absent in Firefox and Safari, and — per the spec —
 * browsers are not obliged to return the complete list, so the result is a
 * supplement to the curated catalogue, never a replacement.
 *
 * The per-face `style` names (`Regular`, `Medium`, `Bold Italic`) are collected
 * alongside the families because they are what lets the editor offer *this*
 * family's weights and catch a weight the family does not have, instead of
 * offering the whole CSS vocabulary blindly.
 * @returns `{ families, styles }`, or undefined when unavailable or declined.
 */
async function queryInstalledFamilies() {
  if (typeof window === 'undefined') return undefined
  const query = window.queryLocalFonts
  if (typeof query !== 'function') return undefined
  try {
    const fonts = await query.call(window)
    const families = new Set()
    const styles = {}
    for (const font of fonts) {
      if (typeof font?.family !== 'string' || font.family.trim() === '') continue
      const family = font.family.trim()
      families.add(family)
      const style = typeof font.style === 'string' ? font.style.trim() : ''
      if (style === '') continue
      const list = styles[family] ?? (styles[family] = [])
      if (!list.includes(style)) list.push(style)
    }
    return {
      families: [...families].sort((left, right) => left.localeCompare(right)),
      styles,
    }
  } catch {
    // A denied or dismissed permission prompt lands here. Fall back quietly:
    // the picker still works, just with a smaller catalogue.
    return undefined
  }
}

/** Read the cached discovery result, if it is still valid. */
function readDiscoveryCache() {
  try {
    const raw = sessionStorage.getItem(FONT_DISCOVERY_CACHE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    if (!Array.isArray(parsed.families)) return undefined
    // A cache written before the face styles existed has the families but not
    // the weights, so it is treated as a miss rather than half-adopted.
    const styles = parsed.styles
    if (styles === null || typeof styles !== 'object' || Array.isArray(styles)) return undefined
    return { families: parsed.families, styles, enumerated: parsed.enumerated === true }
  } catch {
    return undefined
  }
}

/** Remember a discovery result for the rest of the session. */
function writeDiscoveryCache(result) {
  try {
    sessionStorage.setItem(FONT_DISCOVERY_CACHE_KEY, JSON.stringify(result))
  } catch {
    /* private mode or a full quota; the in-memory copy still serves this render */
  }
}

/**
 * Discover selectable families, cheapest source first: the session cache, then
 * the Local Font Access API when the browser offers it, then the measurement
 * probe. Measured families are verified as present; enumerated and curated ones
 * are offered without that guarantee, and the UI says so.
 * @returns `{ families, styles, enumerated, measured }`.
 */
async function discoverFamilies() {
  const cached = readDiscoveryCache()
  if (cached !== undefined) {
    const result = { families: cached.families, styles: cached.styles, enumerated: cached.enumerated }
    writeDiscoveryCache(result)
    return { ...result, measured: true }
  }

  const enumerated = await queryInstalledFamilies()
  if (enumerated !== undefined && enumerated.families.length > 0) {
    const families = [...new Set([...enumerated.families, ...COMMON_FAMILIES])].sort((left, right) =>
      left.localeCompare(right),
    )
    const result = { families, styles: enumerated.styles, enumerated: true }
    writeDiscoveryCache(result)
    return { ...result, measured: true }
  }

  const installed = PROBE_FAMILIES.filter((family) => {
    try {
      return isFamilyAvailable(family)
    } catch {
      return false
    }
  })
  const families = [...new Set([...installed, ...COMMON_FAMILIES])].sort((left, right) =>
    left.localeCompare(right),
  )
  const result = { families, styles: {}, enumerated: false }
  writeDiscoveryCache(result)
  return { ...result, measured: true }
}

/** Row copy, keyed by locale. `zh` is the key-set source of truth. */
const zh = {
  'font.title': '字体',
  'font.description': '自定义界面与代码字体、字号，设置会保存到本机',
  'font.uiFamily': '界面字体',
  'font.uiFamilyHint':
    '字体查询：字体族，后面可以跟字重，例如 Inter, "PingFang SC", sans-serif；逗号分隔，靠前的优先',
  'font.codeFamily': '代码字体',
  'font.codeFamilyHint':
    '用于代码块、行内代码与终端等宽文本，例如 Geist Mono medium, monospace',
  'font.uiWeight': '界面字重',
  'font.codeWeight': '代码字重',
  'font.weightShipped': '（出厂值，未覆盖）',
  'font.emptyQuery': '这个查询还是空的：没有写入任何字体，当前仍在用已保存的设置；要回到出厂值请按「恢复默认」',
  'font.diag.unknownFamily': '本机字体列表里没有 {name}，仍会写入，浏览器可能回退到后面的字体',
  'font.diag.missingWeight': '{family} 在本机没有 {weight} 这个字面（{word}），浏览器会合成',
  'font.diag.duplicateWeight': '字重只能写一次，已采用第一个；多余的 {word} 被忽略',
  'font.diag.unclosedQuote': '引号没有闭合，之后的内容都会被当作同一个字体名',
  'font.diag.trailingText': '引号后面多了“{text}”，它既不是字重也不属于这个字体名，已被忽略',
  'font.weight.thin': '极细',
  'font.weight.extralight': '特细',
  'font.weight.light': '细体',
  'font.weight.regular': '常规',
  'font.weight.medium': '中等',
  'font.weight.semibold': '半粗',
  'font.weight.bold': '粗体',
  'font.weight.extrabold': '特粗',
  'font.weight.black': '黑体',
  'font.uiScale': '界面字号',
  'font.uiScaleHint': '按比例缩放整个界面的文字大小',
  'font.contentSize': '会话正文字号',
  'font.contentSizeHint': '对话正文、标题与表格的字号',
  'font.codeSize': '代码字号',
  'font.codeSizeHint': '代码块与行内代码的字号',
  'font.unit': 'px',
  'font.reset': '恢复默认',
  'font.increase': '增大',
  'font.decrease': '减小',
  'font.catalogProbed':
    '字体列表只包含探测到的常用字体（读取本机字体的权限不可用或被拒绝）；任何字体名仍然可以直接写',
  'font.genericWarning': '末尾缺少通用字体族（如 sans-serif），指定字体都缺失时可能回退到意外字体',
}

/** English dictionary, checked complete against the `zh` key set. */
const en = {
  'font.title': 'Fonts',
  'font.description':
    'Customize the interface and code fonts and sizes; values are saved on this machine',
  'font.uiFamily': 'Interface font',
  'font.uiFamilyHint':
    'A font query: a family, optionally followed by a weight — e.g. Inter, "PingFang SC", sans-serif. Comma-separated, earlier wins',
  'font.codeFamily': 'Code font',
  'font.codeFamilyHint':
    'Used for code blocks, inline code, and monospace text, e.g. Geist Mono medium, monospace',
  'font.uiWeight': 'Interface weight',
  'font.codeWeight': 'Code weight',
  'font.weightShipped': ' (shipped, not overridden)',
  'font.emptyQuery':
    'This query is empty: nothing is written, the saved setting is still in use — press Reset to defaults to go back to the shipped stack',
  'font.diag.unknownFamily':
    'No {name} in this machine\u2019s font list; it is still stored, but the browser may fall through to the next family',
  'font.diag.missingWeight':
    '{family} has no {weight} face on this machine ({word}), so the browser will synthesize it',
  'font.diag.duplicateWeight': 'A query carries one weight; the first wins and {word} is ignored',
  'font.diag.unclosedQuote':
    'The quote is never closed, so everything after it is read as the same family name',
  'font.diag.trailingText':
    '“{text}” follows the closing quote; it is neither a weight nor part of that name, so it is ignored',
  'font.weight.thin': 'Thin',
  'font.weight.extralight': 'ExtraLight',
  'font.weight.light': 'Light',
  'font.weight.regular': 'Regular',
  'font.weight.medium': 'Medium',
  'font.weight.semibold': 'SemiBold',
  'font.weight.bold': 'Bold',
  'font.weight.extrabold': 'ExtraBold',
  'font.weight.black': 'Black',
  'font.uiScale': 'Interface text size',
  'font.uiScaleHint': 'Scales every interface text size proportionally',
  'font.contentSize': 'Conversation text size',
  'font.contentSizeHint': 'Size of message bodies, headings, and tables',
  'font.codeSize': 'Code text size',
  'font.codeSizeHint': 'Size of code blocks and inline code',
  'font.unit': 'px',
  'font.reset': 'Reset to defaults',
  'font.increase': 'Increase',
  'font.decrease': 'Decrease',
  'font.catalogProbed':
    'The font list holds only common fonts found by probing (reading this machine\u2019s fonts is unavailable or was declined); any family can still be typed',
  'font.genericWarning':
    'No generic family at the end (such as sans-serif), so a missing font may fall back unpredictably',
}

/** The stylesheet this plugin owns, keyed by the resolved settings section. */
function fontStyleSheet(section) {
  const scale = section[UI_FONT_SCALE_FIELD]
  const contentSize = section[CONTENT_FONT_SIZE_FIELD]
  const codeSize = section[CODE_FONT_SIZE_FIELD]
  const codeWeight = normalizeWeight(section[CODE_FONT_WEIGHT_FIELD])
  const uiWeight = normalizeWeight(section[UI_FONT_WEIGHT_FIELD])

  const scaleRules = UI_TEXT_STEPS.map(
    (step) => `.dsh-font-size-${String(step)}{font-size:calc(${String(step)}px * var(--dsh-font-ui-scale,1)) !important}`,
  ).join('')

  // The interface weight is opt-in. At the shipped 400 nothing below changes,
  // which keeps a default install's sheet byte-identical to the shipped one; at
  // anything else the base of every `font:` shorthand has to be written out,
  // because a shorthand with no weight component resets `font-weight` to
  // `normal` and would silently defeat an inherited value.
  const shippedUiWeight = uiWeight === DEFAULT_UI_FONT_WEIGHT
  const baseWeight = shippedUiWeight ? '' : `${String(uiWeight)} `
  const emphasis = (shipped) => (shippedUiWeight ? shipped : emphasisWeight(shipped, uiWeight))
  const uiWeightRules = shippedUiWeight
    ? []
    : [
        '/* The interface weight: the base of interface text. Only the text that',
        '   inherits its weight moves — a label or a button whose weight the design',
        '   system fixes keeps it — and the heading steps keep their shipped',
        '   distance from the base so the hierarchy survives the change. */',
        `html body{font-weight:${String(uiWeight)}}`,
      ]

  return [
    '/* dsh-font: interface scale + conversation text sizes.',
    '   The scale is emitted as one utility class per hard-coded UI text size and',
    '   stamped onto every element by applyFonts(), so it is a deterministic',
    '   override that never inherits into a subtree. */',
    'html body{',
    `--dsh-font-ui-scale:${String(scale)};`,
    `--dsh-font-code-size:${String(codeSize)}px;`,
    `--dsh-font-code-weight:${String(codeWeight)};`,
    // A CSS-side mirror of the content size. The authoritative declaration is
    // inline on `body` (written by applyFonts), because ui-layout's theme
    // presenter owns that one and an inline value outranks any stylesheet.
    `--dsh-font-conversation-size:${String(contentSize)}px;`,
    '}',
    ...uiWeightRules,
    scaleRules,
    '/* Conversation text sizes: absolute px, replacing the shipped 12..17px',
    '   ladder that ui-layout drives from the `ui-theme` namespace. This is the',
    '   size axis for conversation content; the scale above is the axis for the',
    '   surrounding interface, and the two never compose. */',
    'html body{',
    `--dsh-font-markdown-base:${baseWeight}var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h1:${String(emphasis(700))} calc(${String(contentSize)}px + 7px) / calc(${String(contentSize)}px + 16px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h2:${String(emphasis(700))} calc(${String(contentSize)}px + 5px) / calc(${String(contentSize)}px + 14px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h3:${String(emphasis(700))} calc(${String(contentSize)}px + 4px) / calc(${String(contentSize)}px + 12px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h4:${String(emphasis(600))} var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table:${baseWeight}calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table-head:${String(emphasis(500))} calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    '}',
    '/* Code text sizes, on their own axis. */',
    'html body{',
    `--dsw-font-markdown-code:var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 7px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block:var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 8px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block-small:var(--dsh-font-code-weight,400) calc(var(--dsh-font-code-size,12px) - 1px) / calc(var(--dsh-font-code-size,12px) + 5px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-small-font-size:calc(var(--dsh-font-code-size,12px) - 1px) !important;`,
    '}',
    '/* The code weight, which the design system has no token for. The three',
    '   `font:` shorthands above carry it for the surfaces that read a token,',
    '   but most code in the interface is styled directly with',
    '   `font-family: var(--ds-font-family-code)` in a component stylesheet with',
    '   its own literal weight — the tool I/O cards, the terminal output, the',
    '   diff and source previews. Those are matched structurally instead, and',
    '   the `!important` is what outranks `font: 500 12px/18px …`.',
    '   Note that this is deliberately NOT a universal rule: it reaches code the',
    '   interface owns, never the surrounding labels. */',
    'html body pre,html body code,html body [class*="code" i]{',
    `font-family:var(--ds-font-family-code) !important;`,
    `font-weight:var(--dsh-font-code-weight,${String(DEFAULT_CODE_FONT_WEIGHT)}) !important;`,
    '}',
  ].join('\n')
}

/** The most recent resolved section; the observer re-stamps against it. */
let currentSection

/**
 * Keep the interface-scale stamps current as the interface mounts new
 * elements. A single coalesced pass per frame is enough: the conversation,
 * tool panels, and dialogs all grow by appending nodes.
 * @param ctx - client context owning the observer's lifetime.
 */
function observeScale(ctx) {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
  const target = document.body
  if (target === null || target === undefined) return
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled || currentSection === undefined) return
    scheduled = true
    const run = () => {
      scheduled = false
      stampScaleClasses(currentSection[UI_FONT_SCALE_FIELD])
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  })
  ctx.effect(() => {
    observer.observe(target, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-font: interface scale observer')
}

/**
 * Write the owned stylesheet and the two family tokens onto the document.
 * @param section - resolved settings section.
 */
function applyFonts(section) {
  if (typeof document === 'undefined') return
  currentSection = section
  const uiFamily = section[UI_FONT_FAMILY_FIELD]
  const codeFamily = section[CODE_FONT_FAMILY_FIELD]

  let tag = document.getElementById(FONT_STYLE_ID)
  if (tag === null) {
    tag = document.createElement('style')
    tag.id = FONT_STYLE_ID
    tag.dataset.plugin = STYLE_PREFIX
    const parent = document.head || document.documentElement
    parent.appendChild(tag)
  }
  tag.textContent = fontStyleSheet(section)

  // Pre-paint parity. The theme presenter re-asserts both of these on `body`
  // from the override layer installed by `publishFamilyTokens`.
  const root = document.documentElement.style
  root.setProperty('--dsw-font-family', uiFamily)
  root.setProperty('--ds-font-family-code', codeFamily)

  // `--dsh-content-font-size` is an INLINE custom property on `body`, written
  // by ui-layout's presenter from the `ui-theme` namespace. Inline declarations
  // outrank a stylesheet regardless of `!important`, so the one authoritative
  // value has to be written here too, in the same place the presenter writes.
  if (document.body !== null && document.body !== undefined) {
    document.body.style.setProperty(
      '--dsh-content-font-size',
      `${String(section[CONTENT_FONT_SIZE_FIELD])}px`,
    )
  }

  stampScaleClasses(section[UI_FONT_SCALE_FIELD])
}

/** The stamped utility class for one shipped text size. */
function sizeClass(step) {
  return `dsh-font-size-${String(step)}`
}

/** Selector matching any element already stamped by {@link stampScaleClasses}. */
const SCALE_STAMPED_SELECTOR = UI_TEXT_STEPS.map((step) => `.${sizeClass(step)}`).join(',')

/**
 * The shipped text size measured for each element, so a later pass reuses the
 * measurement instead of calling `getComputedStyle` again. Cleared whenever the
 * stamps are removed, which is what makes a re-measure exact.
 * @type {WeakMap<Element, number>}
 */
const measuredScaleStep = new WeakMap()

/**
 * Stamp the interface-scale utility class onto every element whose shipped
 * stylesheet fixes a font size in px.
 *
 * The shipped design system has no interface size variable — each component
 * hard-codes one of {@link UI_TEXT_STEPS} — so the scale is applied per element
 * rather than through inheritance. That keeps it a deterministic override with
 * no compounding, and it needs no knowledge of any component's class names.
 *
 * An element is measured while it carries no stamp; changing the scale clears
 * every stamp first, which restores the shipped value and re-measures.
 * @param scale - current interface scale; 1 means "shipped sizes" and stamps nothing.
 */
function stampScaleClasses(scale) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const root = document.body
  if (root === null || root === undefined) return
  if (typeof root.querySelectorAll !== 'function') return

  const stamped = [...root.querySelectorAll(SCALE_STAMPED_SELECTOR)]
  if (scale === 1) {
    for (const element of stamped) {
      for (const step of UI_TEXT_STEPS) element.classList.remove(sizeClass(step))
      measuredScaleStep.delete(element)
    }
    return
  }

  const candidates = [...stamped, ...root.querySelectorAll('*')].filter(
    (element) =>
      element.classList !== undefined &&
      (element.className !== '' ||
        (typeof element.getAttribute === 'function' && element.getAttribute('style') !== null)),
  )

  for (const element of candidates) {
    let step = measuredScaleStep.get(element)
    if (step === undefined) {
      const measured = getComputedStyle(element).fontSize
      if (typeof measured !== 'string' || !measured.endsWith('px')) continue
      const exact = Number.parseFloat(measured)
      const rounded = Math.round(exact)
      if (!UI_TEXT_STEPS.includes(rounded) || Math.abs(exact - rounded) > 0.01) continue
      step = rounded
      measuredScaleStep.set(element, step)
    }
    // Move the element to the stamp for its measured size, dropping any other.
    for (const candidate of UI_TEXT_STEPS) {
      if (candidate !== step) element.classList.remove(sizeClass(candidate))
    }
    element.classList.add(sizeClass(step))
  }
}

/**
 * Stack the two family tokens onto the design system through the theme
 * service, so the theme presenter keeps them applied across palette changes.
 * @param ctx - client context carrying the theme service.
 * @param section - resolved settings section.
 */
function publishFamilyTokens(ctx, section) {
  const theme = ctx.get('theme')
  if (theme === undefined) return
  theme.overrideTokens(PLUGIN_ID, {
    '--dsw-font-family': {
      light: section[UI_FONT_FAMILY_FIELD],
      dark: section[UI_FONT_FAMILY_FIELD],
    },
    '--ds-font-family-code': {
      light: section[CODE_FONT_FAMILY_FIELD],
      dark: section[CODE_FONT_FAMILY_FIELD],
    },
  })
}

/** Live-state store behind the General settings row. */
function createFontRowStore() {
  return _deepseek_ai_dsh_client_store.defineStore({
    init: () => ({
      uiFontFamily: DEFAULT_UI_FONT_FAMILY,
      codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
      codeFontWeight: DEFAULT_CODE_FONT_WEIGHT,
      uiFontWeight: DEFAULT_UI_FONT_WEIGHT,
      uiFontScale: 1,
      contentFontSize: 14,
      codeFontSize: 12,
      revision: -1,
    }),
    actions: {
      sync: (draft, section, revision) => {
        if (revision !== undefined && revision <= draft.revision) return
        draft.uiFontFamily = section[UI_FONT_FAMILY_FIELD]
        draft.codeFontFamily = section[CODE_FONT_FAMILY_FIELD]
        draft.codeFontWeight = normalizeWeight(section[CODE_FONT_WEIGHT_FIELD])
        draft.uiFontWeight = normalizeWeight(section[UI_FONT_WEIGHT_FIELD])
        draft.uiFontScale = section[UI_FONT_SCALE_FIELD]
        draft.contentFontSize = section[CONTENT_FONT_SIZE_FIELD]
        draft.codeFontSize = section[CODE_FONT_SIZE_FIELD]
        if (revision !== undefined) draft.revision = revision
      },
    },
  })
}

/** The stylesheet for the row's own chrome. */
const ROW_CSS = [
  '.dsh-font-row{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:16px;padding:16px 0;display:flex}',
  '.dsh-font-head{flex-direction:column;gap:4px;display:flex}',
  '.dsh-font-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
  '.dsh-font-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
  '.dsh-font-field{flex-direction:column;gap:6px;display:flex}',
  '.dsh-font-labelRow{align-items:center;justify-content:space-between;gap:8px;display:flex}',
  '.dsh-font-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-font-value{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums;line-height:18px}',
  '.dsh-font-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-font-code{font-family:var(--ds-font-family-code);font-weight:var(--dsh-font-code-weight,400)}',
  '.dsh-font-sliderRow{align-items:center;gap:10px;display:flex}',
  '.dsh-font-slider{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}',
  '.dsh-font-stepper{background:var(--dsw-alias-bg-module-platform);border-radius:16px;justify-content:center;align-items:center;gap:2px;min-width:96px;height:32px;display:inline-flex;flex:none;padding:0 4px}',
  '.dsh-font-step{border:none;background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;width:20px;height:20px;border-radius:4px;justify-content:center;align-items:center;padding:0;display:inline-flex}',
  '.dsh-font-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-step:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
  '.dsh-font-stepValue{text-align:center;min-width:32px;color:var(--dsw-alias-label-primary);font-size:13px;font-variant-numeric:tabular-nums;line-height:20px}',
  '.dsh-font-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-font-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // ── the query editor ──────────────────────────────────────────────────────
  //
  // The editor is `@citisen/litearea`'s, and it carries its own stylesheet: the
  // layer it paints behind the textarea, the completion list, the tooltip, and
  // the one typography rule that keeps the paint on the characters. Its
  // appearance comes from custom properties, which `EDITOR_VARIABLES` binds to
  // the interface's own tokens per instance, so nothing here restates any of it.
  //
  // The border is the one exception: every field in this interface is a hairline,
  // which is a fact about the design system rather than about the editor.
  '.dsh-font-query{flex-direction:column;gap:4px;display:flex}',
  '.dsh-font-editor{display:block}',
  '.dsh-font-editor .litearea-box{border-width:.5px}',
  '.dsh-font-meta{flex-wrap:wrap;gap:8px;justify-content:space-between;display:flex}',
  '.dsh-font-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
  // Text the reader could not parse: a red line, not a suggestion.
  '.dsh-font-warn.dsh-font-error{color:var(--dsw-alias-state-error-primary)}',
].join('')

/** Install the row chrome stylesheet for the plugin's lifetime. */
function installRowStyles(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = STYLE_PREFIX
    tag.dataset.pluginCss = `${STYLE_PREFIX}/row.css`
    tag.textContent = ROW_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-font: row stylesheet')
}

/**
 * One labelled field wrapper.
 * @param props - _react props.
 * @returns the field element.
 */
function Field({ label, value, hint, children }) {
  return _react.createElement(
    'div',
    { className: 'dsh-font-field' },
    _react.createElement(
      'div',
      { className: 'dsh-font-labelRow' },
      _react.createElement('span', { className: 'dsh-font-label' }, label),
      value === undefined
        ? null
        : _react.createElement('span', { className: 'dsh-font-value' }, value),
    ),
    children,
    hint === undefined
      ? null
      : _react.createElement('div', { className: 'dsh-font-hint' }, hint),
  )
}

/**
 * The design tokens the editor is themed with, as litearea custom properties.
 *
 * CSS stays the theme language: the editor's whole appearance is already
 * described by custom properties, so binding them to the interface's own tokens
 * is what makes the box look native instead of like a control that wandered in
 * from somewhere else. Setting them here rather than in the stylesheet also
 * means they follow the INTERFACE's theme switch, not the operating system's —
 * the library's own dark palette is driven by `prefers-color-scheme`, and those
 * two are not the same thing.
 *
 * The type is the one thing deliberately not inherited from the interface. The
 * box edits a query rather than prose: one system monospace at a fixed size
 * keeps the entries aligned as the list they are, and keeps the text from
 * reflowing the moment the query changes the interface font. The weight is
 * fixed too — a face whose 400 is synthesized differently from its 700 would
 * move the glyphs under the paint.
 *
 * Deliberately not mapped: the per-scope colours. Every hue the grammar paints
 * with is derived from one of these except the generic-family one, and that one
 * is legible on either surface.
 */
const EDITOR_VARIABLES = {
  font: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  'font-size': '13px',
  'line-height': '20px',
  'padding-block': '5px',
  'padding-inline': '10px',
  radius: '8px',
  fg: 'var(--dsw-alias-label-primary)',
  'fg-dim': 'var(--dsw-alias-label-tertiary)',
  'fg-strong': 'var(--dsw-alias-label-primary)',
  bg: 'var(--dsw-alias-bg-module-platform)',
  'bg-raised': 'var(--dsw-alias-bg-layer-2)',
  border: 'var(--dsw-alias-border-l4)',
  'border-focus': 'var(--dsw-alias-state-business-primary)',
  accent: 'var(--dsw-alias-state-business-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  shadow: 'var(--dsw-elevation-panel)',
}

/**
 * The font-query editor: the library's editor over this plugin's grammar.
 *
 * The hand-written half is gone — the painted token layer, the completion
 * popup, the highlight index, the caret bookkeeping, and the alignment contract
 * between two stacked elements — and with it every reason this field was hard
 * to get right. What stays is the plugin's own: the query's parse, its
 * localized diagnostics, the two settings it writes, and the keyboard reorder.
 *
 * THE RULE THIS COMPONENT STILL FOLLOWS: the text belongs to the user.
 *
 * Nothing here rewrites it — not quoting, not reordering, not tidying, not
 * refilling an empty box. The editor owns the text, so the settings follow
 * EVERY keystroke: the old field had to wait for Enter because writing on each
 * change re-rendered a controlled textarea, and that round trip is exactly what
 * destroyed the browser's undo stack and reset the caret. A value that arrives
 * from outside takes the field over only when it MEANS something different from
 * what is on screen, and never while the user is in the field.
 *
 * @param props - _react props.
 * @returns the editor element.
 */
function FontQueryEditor({
  value,
  weight,
  catalogue,
  styles,
  enumerated,
  monospace,
  label,
  labels,
  onFamilies,
  onWeight,
}) {
  const hostRef = _react.useRef(null)
  const editorRef = _react.useRef(undefined)
  /**
   * The axis's shipped weight. A query at this weight carries no word: the
   * shipped value is not something the user chose, and spelling it out put a
   * `regular` after every interface font that nobody asked for. What applies is
   * still always stated in the line under the field.
   */
  const shippedWeight = monospace === true ? DEFAULT_CODE_FONT_WEIGHT : DEFAULT_UI_FONT_WEIGHT
  const options = { catalogue, styles, enumerated }
  /** The stored settings as the text the editor starts from, and the stack. */
  const stored = storedQuery(value, weight, options, shippedWeight)
  /** The text the editor holds, mirrored into state for the readouts below. */
  const [text, setText] = _react.useState(stored.text)

  /**
   * The grammar as the library resolves it: a live view of the newest options.
   *
   * The catalogue is the machine's and it answers late — discovery finishes long
   * after this row has mounted — so the vocabulary cannot be fixed at mount. The
   * library re-resolves a grammar in place on `refresh()`, so a proxy onto the
   * current build is what lets the list grow without rebuilding the editor,
   * which would throw the undo history away.
   */
  const grammarRef = _react.useRef(undefined)
  grammarRef.current = dshFontQueryGrammar({
    catalogue,
    enumerated,
    styles,
    shippedWeight,
    // The vocabularies come from this plugin's own constants, so the editor
    // cannot offer a family the plugin's own parser would then call unknown.
    commonFamilies: COMMON_FAMILIES,
    genericFamilies: GENERIC_FAMILIES,
  })
  const liveGrammar = _react.useRef(
    new Proxy({}, { get: (_target, key) => Reflect.get(grammarRef.current, key) }),
  ).current
  // The newest props, so the editor's own callbacks are never a render behind.
  const latest = _react.useRef({})
  latest.current = { options, write: { onFamilies, onWeight }, setText }

  _react.useEffect(() => {
    const host = hostRef.current
    if (host === null || host === undefined) return undefined
    const editor = _citisen_litearea.createEditor(host, {
      grammar: liveGrammar,
      // Read once, at construction: later external values go through the effect
      // below, which is the only place that decides whether one wins.
      value: stored.text,
      ariaLabel: label,
      // No placeholder. A ghost of the shipped stack in an empty box reads as a
      // value the plugin put there; the hint above the field is the example.
      //
      // 32px to 120px, which is what the field this replaces was bounded by: one
      // row of the type above, and four before the box scrolls rather than
      // pushing the rest of the settings off the panel.
      sizing: { minRows: 1, minHeight: 32, maxHeight: 120 },
      variables: EDITOR_VARIABLES,
      // A family explains itself on hover, including the faces read off this
      // machine — which is the question the old popup answered by listing them.
      hover: { enabled: true, delay: 140 },
      onChange: (next) => {
        const current = latest.current
        current.setText(next)
        applyFontQuery(next, current.options, current.write)
      },
    })
    editorRef.current = editor

    /**
     * The keyboard's reorder, kept from the field this replaces.
     *
     * Order is significant — the first family the browser can resolve wins — and
     * this moves the entry the caret sits in without the pointer. The library's
     * own handler may have moved a completion row first, which costs nothing: the
     * text is about to change underneath it.
     */
    const onKeyDown = (event) => {
      const current = latest.current
      const moved = reorderFontQueryEntry(editor, event, current.options, current.write)
      if (moved !== undefined) current.setText(moved.text)
    }
    editor.input.addEventListener('keydown', onKeyDown)

    return () => {
      editor.input.removeEventListener('keydown', onKeyDown)
      editor.destroy()
      editorRef.current = undefined
    }
  }, [])

  // The catalogue arrives after this row mounts, so the grammar the editor is
  // running is REFRESHED when it changes — re-read, never rebuilt, because a
  // rebuild is what would throw the undo history away.
  _react.useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    editor.refresh()
  }, [catalogue, styles, enumerated])

  // A value that arrived from elsewhere — the Reset button, another tab — takes
  // the field over. Our own write coming back does not, and neither does
  // anything at all while the user is in the field: that would be the plugin
  // rewriting their typing.
  //
  // The comparison is by MEANING rather than by characters, because the setting
  // holds the canonical serialization of what the box says: a value that spells
  // the same stack differently is the same value, and adopting it would rewrite
  // the user's spelling — quoting, spacing, case — under their eyes.
  _react.useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    if (editor.focused) return
    const read = parseFontQuery(editor.value, latest.current.options)
    if (asQuery(read.families, read.weight ?? weight, shippedWeight) === stored.text) return
    editor.setValue(stored.text)
    setText(stored.text)
  }, [stored.text])

  const read = parseFontQuery(text, options)
  const appliedWeight = normalizeWeight(weight)
  /** A query that names no family is an unfinished edit, and writes nothing. */
  const unfilled = read.families.length === 0
  const messages = read.diagnostics
    .map((diagnostic) => ({
      text: describeDiagnostic(diagnostic, labels),
      kind: diagnosticKind(diagnostic.code),
    }))
    .filter((message) => message.text !== '')
  if (read.families.length > 0 && !read.families.some((f) => isGenericFamilyName(f.toLowerCase()))) {
    messages.push({ text: labels.genericWarning, kind: 'warn' })
  }

  return _react.createElement(
    'div',
    { className: 'dsh-font-query' },
    // The editor mounts here, from the effect above. _react never renders the
    // field itself: a textarea whose value _react rewrites is the bug this whole
    // migration is about.
    _react.createElement('div', { className: 'dsh-font-editor', ref: hostRef }),
    // What the SETTINGS hold, in canonical form. The box is allowed to spell it
    // differently — it is the user's text — so this is the line that says what
    // the stack actually is.
    _react.createElement(
      'div',
      { className: 'dsh-font-meta' },
      _react.createElement(
        'span',
        { className: monospace === true ? 'dsh-font-hint dsh-font-code' : 'dsh-font-hint' },
        `font-family: ${serializeFamilyList(stored.families)}`,
      ),
    ),
    // The value the axis is SET to — not what the text parses to. Nothing here
    // pretends the typed query has been applied: the setting follows every
    // change, and this line is the value in force.
    _react.createElement(
      'div',
      { className: 'dsh-font-hint' },
      `${labels.weightLine}: ${labels.weightName(appliedWeight)} ${String(appliedWeight)}${
        appliedWeight === shippedWeight ? labels.weightShipped : ''
      }`,
    ),
    // An unfinished edit is reported, never "corrected": the stored stack is
    // still in use, and the text is left exactly as it was typed.
    unfilled ? _react.createElement('div', { className: 'dsh-font-hint' }, labels.emptyQuery) : null,
    // The library marks the same problems in the box, and explains a token on
    // hover, but its words are English only. This list is the field's own
    // explanation, in the interface's language, and it is the one the reader is
    // owed when something is wrong.
    messages.map((message, index) =>
      _react.createElement(
        'div',
        {
          key: `${String(index)}`,
          className: message.kind === 'error' ? 'dsh-font-warn dsh-font-error' : 'dsh-font-warn',
        },
        message.text,
      ),
    ),
  )
}

/**
 * A horizontal slider plus an exact stepper.
 * @param props - _react props.
 * @returns the control element.
 */
function SliderControl({ min, max, step, value, format, onChange, ariaLabel, increase, decrease }) {
  return _react.createElement(
    'div',
    { className: 'dsh-font-sliderRow' },
    _react.createElement('input', {
      type: 'range',
      className: 'dsh-font-slider',
      min,
      max,
      step,
      value,
      'aria-label': ariaLabel,
      onChange: (event) => {
        onChange(Number(event.target.value))
      },
    }),
    _react.createElement(
      'div',
      { className: 'dsh-font-stepper' },
      _react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-font-step',
          'aria-label': decrease,
          disabled: value <= min,
          onClick: () => {
            onChange(Number((value - step).toFixed(2)))
          },
        },
        _react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 9 }),
      ),
      _react.createElement('span', { className: 'dsh-font-stepValue' }, format(value)),
      _react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-font-step',
          'aria-label': increase,
          disabled: value >= max,
          onClick: () => {
            onChange(Number((value + step).toFixed(2)))
          },
        },
        _react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, { size: 9 }),
      ),
    ),
  )
}

/**
 * The General-settings row: the two font queries plus the four size axes.
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function FontRow({ t, useStore, setField, reset }) {
  const uiFontFamily = useStore((s) => s.uiFontFamily)
  const codeFontFamily = useStore((s) => s.codeFontFamily)
  const codeFontWeight = useStore((s) => s.codeFontWeight)
  const uiFontWeight = useStore((s) => s.uiFontWeight)
  const uiFontScale = useStore((s) => s.uiFontScale)
  const contentFontSize = useStore((s) => s.contentFontSize)
  const codeFontSize = useStore((s) => s.codeFontSize)

  // Discovery runs once per session (the result is cached) and only when this
  // row is actually rendered, so the cost is never paid by a user who never
  // opens Settings.
  const [catalog, setCatalog] = _react.useState({
    families: COMMON_FAMILIES,
    styles: {},
    enumerated: false,
  })
  _react.useEffect(() => {
    let cancelled = false
    discoverFamilies()
      .then((result) => {
        if (!cancelled) setCatalog(result)
      })
      .catch(() => {
        /* the curated catalogue is already in state */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The catalogue's provenance is worth one line, and only when it is BAD news:
  // an enumerated list is the machine's own and needs no announcing, while the
  // probe fallback is a short curated list the completion popup can never
  // complete — which the user would otherwise read as "my font is missing".
  // `measured` distinguishes a finished fallback from discovery still running.
  const catalogueNotice =
    catalog.measured === true && catalog.enumerated !== true ? t('font.catalogProbed') : undefined

  /**
   * The editors' copy, resolved once per render so the components stay free of
   * the locale service and remain pure functions of their props.
   *
   * Only what the plugin still says is here. The completion list, the tooltips,
   * and the syntax colours are the library's now, and so are its words.
   * @param weightLine - the axis's weight label (`代码字重` / `界面字重`).
   * @returns the label bag both {@link FontQueryEditor}s consume.
   */
  const editorLabels = (weightLine) => ({
    weightLine,
    weightShipped: t('font.weightShipped'),
    emptyQuery: t('font.emptyQuery'),
    genericWarning: t('font.genericWarning'),
    unknownFamily: t('font.diag.unknownFamily'),
    missingWeight: t('font.diag.missingWeight'),
    duplicateWeight: t('font.diag.duplicateWeight'),
    unclosedQuote: t('font.diag.unclosedQuote'),
    trailingText: t('font.diag.trailingText'),
    weightName: (weight) => t(`font.weight.${WEIGHT_KEYS[normalizeWeight(weight)]}`),
  })

  return _react.createElement(
    'div',
    { className: 'dsh-font-row' },
    _react.createElement(
      'div',
      { className: 'dsh-font-head' },
      _react.createElement('div', { className: 'dsh-font-title' }, t('font.title')),
      _react.createElement('div', { className: 'dsh-font-desc' }, t('font.description')),
      catalogueNotice === undefined
        ? null
        : _react.createElement('div', { className: 'dsh-font-hint' }, catalogueNotice),
    ),
    _react.createElement(
      Field,
      { label: t('font.uiFamily'), hint: t('font.uiFamilyHint') },
      _react.createElement(FontQueryEditor, {
        value: uiFontFamily,
        weight: normalizeWeight(uiFontWeight),
        catalogue: catalog.families,
        styles: catalog.styles,
        enumerated: catalog.enumerated,
        label: t('font.uiFamily'),
        labels: editorLabels(t('font.uiWeight')),
        // The editor reports every change, so these run on each keystroke. A
        // write that resolves to what is already stored writes nothing: the
        // settings document is durable, and a no-op round trip is still a write.
        onFamilies: (value) => {
          if (value !== uiFontFamily) setField(UI_FONT_FAMILY_FIELD, value)
        },
        onWeight: (weight) => {
          if (normalizeWeight(weight) !== normalizeWeight(uiFontWeight)) {
            setField(UI_FONT_WEIGHT_FIELD, weight)
          }
        },
      }),
    ),
    _react.createElement(
      Field,
      { label: t('font.codeFamily'), hint: t('font.codeFamilyHint') },
      _react.createElement(FontQueryEditor, {
        value: codeFontFamily,
        weight: normalizeWeight(codeFontWeight),
        catalogue: catalog.families,
        styles: catalog.styles,
        enumerated: catalog.enumerated,
        monospace: true,
        label: t('font.codeFamily'),
        labels: editorLabels(t('font.codeWeight')),
        onFamilies: (value) => {
          if (value !== codeFontFamily) setField(CODE_FONT_FAMILY_FIELD, value)
        },
        onWeight: (weight) => {
          if (normalizeWeight(weight) !== normalizeWeight(codeFontWeight)) {
            setField(CODE_FONT_WEIGHT_FIELD, weight)
          }
        },
      }),
    ),
    _react.createElement(
      Field,
      {
        label: t('font.uiScale'),
        value: `${String(Math.round(uiFontScale * 100))}%`,
        hint: t('font.uiScaleHint'),
      },
      _react.createElement(SliderControl, {
        min: UI_FONT_SCALE_MIN,
        max: UI_FONT_SCALE_MAX,
        step: UI_FONT_SCALE_STEP,
        value: uiFontScale,
        format: (value) => `${String(Math.round(value * 100))}%`,
        ariaLabel: t('font.uiScale'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(UI_FONT_SCALE_FIELD, value)
        },
      }),
    ),
    _react.createElement(
      Field,
      {
        label: t('font.contentSize'),
        value: `${String(contentFontSize)} ${t('font.unit')}`,
        hint: t('font.contentSizeHint'),
      },
      _react.createElement(SliderControl, {
        min: CONTENT_FONT_SIZE_MIN,
        max: CONTENT_FONT_SIZE_MAX,
        step: 1,
        value: contentFontSize,
        format: (value) => `${String(value)} ${t('font.unit')}`,
        ariaLabel: t('font.contentSize'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(CONTENT_FONT_SIZE_FIELD, value)
        },
      }),
    ),
    _react.createElement(
      Field,
      {
        label: t('font.codeSize'),
        value: `${String(codeFontSize)} ${t('font.unit')}`,
        hint: t('font.codeSizeHint'),
      },
      _react.createElement(SliderControl, {
        min: CODE_FONT_SIZE_MIN,
        max: CODE_FONT_SIZE_MAX,
        step: 1,
        value: codeFontSize,
        format: (value) => `${String(value)} ${t('font.unit')}`,
        ariaLabel: t('font.codeSize'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(CODE_FONT_SIZE_FIELD, value)
        },
      }),
    ),
    _react.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-font-reset',
        onClick: () => {
          reset()
        },
      },
      t('font.reset'),
    ),
  )
}

/**
 * The services this plugin waits for: the settings transport plus slots/locale
 * for the row. The theme service is read through `ctx.get` (optional) so a
 * composition without `ui-theme` still gets families from the stylesheet path.
 */
const inject = ['slots', 'locale', 'settingsScope']

/**
 * Client plugin body: resolve the durable section, paint it, and register the
 * feature-owned Fonts row into the General section's item slot.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
  installRowStyles(ctx)
  observeScale(ctx)

  const scope = ctx.settingsScope.bind({
    namespace: FONT_SETTINGS_NAMESPACE,
    decode: (section) => {
      if (section === null || typeof section !== 'object') return undefined
      const raw = section
      const text = (key, fallback) =>
        typeof raw[key] === 'string' && raw[key] !== '' ? raw[key] : fallback
      const number = (key, fallback, min, max) => {
        const value = Number(raw[key])
        return Number.isFinite(value) && value >= min && value <= max ? value : fallback
      }
      return {
        [UI_FONT_FAMILY_FIELD]: text(UI_FONT_FAMILY_FIELD, DEFAULT_UI_FONT_FAMILY),
        [CODE_FONT_FAMILY_FIELD]: text(CODE_FONT_FAMILY_FIELD, DEFAULT_CODE_FONT_FAMILY),
        [CODE_FONT_WEIGHT_FIELD]: normalizeWeight(raw[CODE_FONT_WEIGHT_FIELD]),
        [UI_FONT_WEIGHT_FIELD]: normalizeWeight(raw[UI_FONT_WEIGHT_FIELD]),
        [UI_FONT_SCALE_FIELD]: number(UI_FONT_SCALE_FIELD, 1, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX),
        [CONTENT_FONT_SIZE_FIELD]: Math.round(
          number(CONTENT_FONT_SIZE_FIELD, 14, CONTENT_FONT_SIZE_MIN, CONTENT_FONT_SIZE_MAX),
        ),
        [CODE_FONT_SIZE_FIELD]: Math.round(
          number(CODE_FONT_SIZE_FIELD, 12, CODE_FONT_SIZE_MIN, CODE_FONT_SIZE_MAX),
        ),
      }
    },
  })

  const store = createFontRowStore()

  ctx.effect(
    () =>
      ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, {
        zh,
        en,
      }),
    'dsh-font: settings row dictionaries',
  )

  const defaults = {
    [UI_FONT_FAMILY_FIELD]: DEFAULT_UI_FONT_FAMILY,
    [CODE_FONT_FAMILY_FIELD]: DEFAULT_CODE_FONT_FAMILY,
    [CODE_FONT_WEIGHT_FIELD]: DEFAULT_CODE_FONT_WEIGHT,
    [UI_FONT_WEIGHT_FIELD]: DEFAULT_UI_FONT_WEIGHT,
    [UI_FONT_SCALE_FIELD]: 1,
    [CONTENT_FONT_SIZE_FIELD]: 14,
    [CODE_FONT_SIZE_FIELD]: 12,
  }

  let actions

  const paint = (section, revision) => {
    actions?.sync(section, revision)
    applyFonts(section)
    publishFamilyTokens(ctx, section)
  }

  ctx.effect(
    () =>
      scope.subscribe(() => {
        const snapshot = scope.getSnapshot()
        if (snapshot.value === undefined) return
        paint(snapshot.value, snapshot.revision)
      }),
    'dsh-font: settings adoption',
  )

  const initial = scope.getSnapshot()
  paint(initial.value ?? defaults, initial.revision)

  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'font',
        order: 12,
        store,
        locale: SETTINGS_LOCALE_NAMESPACE,
        inject: (bound) => {
          actions = bound
          const snapshot = scope.getSnapshot()
          paint(snapshot.value ?? defaults, snapshot.revision)
          return {
            setField: (field, value) => {
              scope.set(field, value)
            },
            reset: () => {
              for (const field of Object.keys(defaults)) scope.unset(field)
            },
          }
        },
      },
      FontRow,
    ),
  )
}
		exports.apply = apply;
		exports.inject = inject;
		exports.fontStyleSheet = fontStyleSheet;
		exports.applyFonts = applyFonts;
		exports.parseFamilyList = parseFamilyList;
		exports.serializeFamilyList = serializeFamilyList;
		exports.normalizeWeight = normalizeWeight;
		exports.weightWord = weightWord;
		exports.faceWeights = faceWeights;
		exports.GENERIC_FAMILIES = GENERIC_FAMILIES;
		exports.COMMON_FAMILIES = COMMON_FAMILIES;
		exports.emphasisWeight = emphasisWeight;
		exports.parseFontQuery = parseFontQuery;
		exports.serializeFontQuery = serializeFontQuery;
		exports.asQuery = asQuery;
		exports.storedQuery = storedQuery;
		exports.applyFontQuery = applyFontQuery;
		exports.moveFontQueryEntry = moveFontQueryEntry;
		exports.reorderFontQueryEntry = reorderFontQueryEntry;
		exports.describeDiagnostic = describeDiagnostic;
		exports.diagnosticKind = diagnosticKind;
		exports.dshFontQueryGrammar = dshFontQueryGrammar;
		exports.FontQueryEditor = FontQueryEditor;
		return module.exports;
	}
});
