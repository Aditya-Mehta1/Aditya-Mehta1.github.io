import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseJavaScript } from 'acorn';
import { parse as parseHtml } from 'parse5';
import postcss from 'postcss';

let errors = 0;

function report(file, line, column) {
  console.error(`${file}:${line}:${column}: no-comments: Comments are not allowed.`);
  errors++;
}

function lintJavaScript(source, file, lineOffset = 0, sourceType = 'module') {
  parseJavaScript(source, {
    ecmaVersion: 'latest',
    sourceType,
    locations: true,
    onComment(_block, _text, _start, _end, start) {
      report(file, start.line + lineOffset, start.column + 1);
    },
  });
}

function lintCss(source, file, lineOffset = 0) {
  postcss.parse(source, { from: file }).walkComments(comment => {
    report(file, comment.source.start.line + lineOffset, comment.source.start.column);
  });
}

function lintHtml(source, file) {
  function visit(node) {
    if (node.nodeName === '#comment') {
      report(file, node.sourceCodeLocation.startLine, node.sourceCodeLocation.startCol);
    }
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
    const text = (node.childNodes ?? []).filter(child => child.nodeName === '#text')
      .map(child => child.value).join('');
    const lineOffset = (node.sourceCodeLocation?.startTag?.endLine ?? 1) - 1;
    if (node.tagName === 'style') lintCss(text, file, lineOffset);
    if (node.tagName === 'script' && !('src' in attrs)) {
      const type = (attrs.type ?? '').trim().toLowerCase();
      if (['', 'module', 'text/javascript', 'application/javascript'].includes(type)) {
        lintJavaScript(text, file, lineOffset, type === 'module' ? 'module' : 'script');
      } else if (['application/ld+json', 'application/json', 'importmap', 'speculationrules'].includes(type)) {
        JSON.parse(text);
      }
    }
    for (const attr of node.attrs ?? []) {
      const line = (node.sourceCodeLocation?.attrs?.[attr.name]?.startLine ?? 1) - 1;
      if (attr.name === 'style') lintCss(attr.value, file, line);
      if (attr.name.startsWith('on')) lintJavaScript(`function handler(event) {\n${attr.value}\n}`, file, line - 1);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(parseHtml(source, { sourceCodeLocationInfo: true }));
}

async function lintDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await lintDirectory(file);
      continue;
    }
    const extension = path.extname(file);
    if (!['.html', '.css', '.js', '.mjs', '.cjs'].includes(extension)) continue;
    const source = await readFile(file, 'utf8');
    try {
      if (extension === '.html') lintHtml(source, file);
      else if (extension === '.css') lintCss(source, file);
      else lintJavaScript(source, file, 0, extension === '.cjs' ? 'script' : 'module');
    } catch (error) {
      console.error(`${file}: ${error.message}`);
      errors++;
    }
  }
}

await lintDirectory('.');
if (errors) process.exitCode = 1;
else console.log('No comments found in HTML, CSS, or JavaScript.');
