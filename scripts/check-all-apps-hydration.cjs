const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const {renderToString} = require('react-dom/server');
const ts = require('typescript');
const source = fs.readFileSync('src/components/all-apps-switcher.tsx', 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
}}).outputText, {exports: exportsObject, require});
// React 18 must emit CSS as raw style text: HTML entities are not decoded inside style.
// Compare the actual server markup with the same static CSS the client hydrates.
const css = source.match(/(?:__html:\s*|<style>\{)`([\s\S]*?)`/)[1];
for (const timezone of ['UTC', 'America/Puerto_Rico', 'Pacific/Auckland']) {
  process.env.TZ = timezone;
  for (const compact of [false, true]) {
    const html = renderToString(React.createElement(exportsObject.AllAppsSwitcher, {compact}));
    const actual = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
    assert.equal(actual, css, `SSR style text must exactly match client CSS (${timezone}, ${compact})`);
    assert.ok(!actual.includes('&quot;') && !actual.includes('&gt;'));
  }
}
console.log('React SSR style text matches client CSS in six timezone/compact cases');
