'use strict';
const t = require('./_t.js')('scale');
const S = require('../../tools/v3/scale.js');
const UP = require('../../tools/update-prices.js');

t(UP.niceBounds === S.niceBounds, 'update-prices re-exports the same niceBounds function');
const b = S.niceBounds([150, 160, 188], 195);
t.eq(b, UP.niceBounds([150, 160, 188], 195), 'same result through both paths');
t(b.min < 150 && b.max > 195 && b.grid.length >= 1 && b.grid.length <= 5, 'bounds cover data + fair line, ≤5 grid lines');
t.eq(S.num4(0.1 + 0.2), 0.3, 'num4 strips float noise');
t.done();
