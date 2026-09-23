'use strict';
const t = require('./_t.js')('build');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../../build.js');
const IO = require('../../tools/v3/io.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3build-'));
fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'v3', 'ZTS.json'), path.join(dir, 'ZTS.json'));
fs.writeFileSync(path.join(dir, 'AAA.html'), '<!DOCTYPE html><html lang="th"><head><title>AAA</title></head><body></body></html>');
const names = B.reportEntries(dir);
t.eq(names.sort(), ['AAA.html', 'ZTS.json'], 'entries include .json and .html');
const r = B.loadReportSource(dir, 'ZTS.json', { ZTS: '#e8731a' });
t.eq([r.symbol, r.file, r.v3], ['ZTS', 'ZTS.html', true], 'v3 entry publishes as <SYM>.html');
t(r.content.includes('id="report-data"') && r.content.includes('<!--TEMPLATE:STYLE-->'), 'content is v2-shaped source');
t.eq(r.hash, IO.freshHash(IO.read(path.join(dir, 'ZTS.json'))), 'hash = v3 freshHash (ignores market)');
const h = B.loadReportSource(dir, 'AAA.html', {});
t.eq([h.symbol, h.file, h.v3], ['AAA', 'AAA.html', false], 'v2 entry unchanged');
// Review Focus #5 — collision
fs.writeFileSync(path.join(dir, 'ZTS.html'), '<!DOCTYPE html>');
t.throws(() => B.reportEntries(dir), /ZTS.*ทั้ง .html และ .json/, 'same symbol as .html and .json fails loudly');
t.done();
