// Autocomprobación: node test.js
const assert = require("assert");
const { VOCAB, VERBS, GRAMMAR, INTERVIEW } = require("./data.js");
const { review, bumpStreak, buildDeck, dueCards, compareWords, INTERVALS } = require("./app.js");

// Repaso espaciado
assert.deepStrictEqual(review(undefined, true, 100), { box: 1, due: 101 });
assert.deepStrictEqual(review({ box: 3 }, true, 100), { box: 4, due: 108 });
assert.deepStrictEqual(review({ box: 5 }, false, 100), { box: 1, due: 101 });
assert.strictEqual(review({ box: INTERVALS.length - 1 }, true, 0).box, INTERVALS.length - 1);

// Racha
assert.deepStrictEqual(bumpStreak({ last: 9, count: 4 }, 10), { last: 10, count: 5 });
assert.deepStrictEqual(bumpStreak({ last: 7, count: 4 }, 10), { last: 10, count: 1 });
assert.deepStrictEqual(bumpStreak({ last: 10, count: 4 }, 10), { last: 10, count: 4 });

// Mazo y tarjetas del día
const deck = buildDeck(VOCAB, VERBS);
assert.strictEqual(new Set(deck.map(c => c.id)).size, deck.length, "ids de tarjetas duplicados");
assert.strictEqual(dueCards(deck, {}, 0, 15).length, 15);
assert.strictEqual(dueCards(deck, { [deck[0].id]: { box: 1, due: 5 } }, 5, 0).length, 1);
assert.strictEqual(dueCards(deck, { [deck[0].id]: { box: 1, due: 6 } }, 5, 0).length, 0);

// Dictado
assert.deepStrictEqual(compareWords("I went home.", "i went house").map(x => x.ok), [true, true, false]);

// Datos coherentes
GRAMMAR.forEach(g => assert.ok(g.a >= 0 && g.a < g.o.length && g.q.includes("___"), g.q));
INTERVIEW.forEach(i => assert.ok(i.q && i.es && i.a));

console.log("OK:", deck.length, "tarjetas,", GRAMMAR.length, "preguntas,", INTERVIEW.length, "de entrevista");
