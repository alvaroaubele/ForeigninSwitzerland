/**
 * Tests for the PC-Axis reader.
 *
 * The row-major stride arithmetic is the part that fails silently: a wrong
 * stride still returns numbers, just the wrong cells, and against a real cube
 * there is nothing to compare them to. So we build a synthetic cube whose value
 * at every position *is* its own flat index, which makes an indexing error
 * immediately visible.
 *
 * Run with:  npx tsx --test scripts/harvest/px.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readPxHeader, pxExtract } from "./px.js";

// dims: A(2) x "Nat (Auswahl)"(3) x C(2) = 12 cells, last varying fastest.
// The middle dimension name carries parentheses on purpose — cube 399's
// "Staatsangehörigkeit (Auswahl)" breaks any parser that finds the subkey by
// scanning for the first ')'.
function writeFixture(): string {
  const values = Array.from({ length: 12 }, (_, i) => (i === 7 ? '"..."' : String(i)));
  const px = [
    'CHARSET="ANSI";',
    'AXIS-VERSION="2010";',
    'CODEPAGE="iso-8859-15";',
    'MATRIX="test-cube";',
    'DESCRIPTION="Synthetic fixture with Ümlaut";',
    'LAST-UPDATED="20240822 08:30";',
    'STUB="A","Nat (Auswahl)";',
    'HEADING="C";',
    'VALUES("A")="Alpha","Beta";',
    'CODES("A")="a1","a2";',
    'VALUES("Nat (Auswahl)")="One","Two","Three";',
    'CODES("Nat (Auswahl)")="n1","n2","n3";',
    'VALUES("C")="Cee1","Cee2";',
    'CODES("C")="c1","c2";',
    `DATA=\r\n${values.join("\r\n")};\r\n`,
  ].join("\r\n");
  const dir = mkdtempSync(join(tmpdir(), "pxtest-"));
  const path = join(dir, "test-cube.px");
  writeFileSync(path, px, "utf8");
  return path;
}

test("reads the header, including a dimension name containing parentheses", () => {
  const h = readPxHeader(writeFixture());
  assert.equal(h.matrix, "test-cube");
  assert.equal(h.lastUpdated, "20240822 08:30");
  assert.deepEqual(
    h.dims.map((d) => d.name),
    ["A", "Nat (Auswahl)", "C"], // STUB then HEADING — the data order
  );
  assert.deepEqual(h.dims[1].codes, ["n1", "n2", "n3"]);
  assert.deepEqual(h.dims[1].values, ["One", "Two", "Three"]);
});

test("resolves each selection to the correct row-major flat index", () => {
  const path = writeFixture();
  const h = readPxHeader(path);
  // strides are A=6, Nat=2, C=1, so (a2,n1,c2) = 6+0+1 = 7 and (a2,n3,c2) = 6+4+1 = 11
  const cells = pxExtract(path, h, { A: ["a2"], "Nat (Auswahl)": ["n3"], C: ["c2"] });
  assert.equal(cells.length, 1);
  assert.equal(cells[0].value, 11);
  assert.deepEqual(cells[0].coord, { A: "a2", "Nat (Auswahl)": "n3", C: "c2" });
});

test("returns every requested cell, and only those", () => {
  const path = writeFixture();
  const h = readPxHeader(path);
  const cells = pxExtract(path, h, { A: ["a1", "a2"], "Nat (Auswahl)": ["n2"], C: ["c1", "c2"] });
  // (a1,n2,c1)=2, (a1,n2,c2)=3, (a2,n2,c1)=8, (a2,n2,c2)=9
  assert.deepEqual(cells.map((c) => c.value).sort((x, y) => Number(x) - Number(y)), [2, 3, 8, 9]);
});

test("a dimension left out of the selection is returned in full, like the API", () => {
  const path = writeFixture();
  const h = readPxHeader(path);
  const cells = pxExtract(path, h, { A: ["a1"], C: ["c1"] });
  // all three Nat values: (a1,n1,c1)=0, (a1,n2,c1)=2, (a1,n3,c1)=4
  assert.deepEqual(cells.map((c) => c.value), [0, 2, 4]);
});

test("treats a dot-run as missing rather than a number", () => {
  const path = writeFixture();
  const h = readPxHeader(path);
  const cells = pxExtract(path, h, { A: ["a2"], "Nat (Auswahl)": ["n1"], C: ["c2"] });
  assert.equal(cells[0].value, null); // cell 7 is "..."
  assert.equal(cells[0].raw, '"..."');
});

test("rejects a code that does not exist in the cube", () => {
  const path = writeFixture();
  const h = readPxHeader(path);
  assert.throws(() => pxExtract(path, h, { A: ["nope"] }), /not in dimension/);
});
