import { lookupTokens, lookupWords, parseTsv, variants } from '../src/lib/ipa';
import { availableActions, TRANSLATE_MAX_WORDS } from '../src/lib/selection';
import { pickVoice } from '../src/lib/speech';
import {
  containsCJK,
  hardRatio,
  isKnownWord,
  parseExplanation,
  parseResult,
  parseTranslation,
  properNouns,
  reusedHardWords,
  usesTargetWord,
  verify,
  verifyExplanation,
  verifyTranslation,
} from '../src/lib/verify';

const FENCE = String.fromCharCode(96).repeat(3);
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    console.log('  FAIL ' + name + (detail ? '  -> ' + detail : ''));
  }
}

console.log('containsCJK');
check('detects Chinese', containsCJK('\u8fd9\u662f\u4e2d\u6587'));
check('ignores English', !containsCJK('plain english text'));

console.log('parseResult');
const current = parseResult(
  '{"simplified":"Hello.","keyWords":[{"term":"precipitated","simple":"caused"}],"keyPhrases":[{"term":"carry out","simple":"do"}]}',
);
check('reads keyWords', current?.keyWords.length === 1);
check('reads keyPhrases', current?.keyPhrases.length === 1);
check(
  'fenced json',
  parseResult(
    FENCE + 'json\n{"simplified":"Hi.","keyWords":[],"keyPhrases":[{"term":"put off","simple":"delay"}]}\n' + FENCE,
  )?.keyPhrases.length === 1,
);
check(
  'legacy glossary maps to keyWords',
  parseResult('{"simplified":"Hi.","glossary":[{"term":"ban","simple":"forbid"}]}')?.keyWords.length === 1,
);
check(
  'single word in keyPhrases moves to keyWords',
  parseResult('{"simplified":"Hi.","keyPhrases":[{"term":"though","simple":"but"}]}')?.keyWords.length === 1,
);
check(
  'multi word in keyWords moves to keyPhrases',
  parseResult('{"simplified":"Hi.","keyWords":[{"term":"in spite of","simple":"despite"}]}')?.keyPhrases.length === 1,
);
check('garbage -> null', parseResult('no json at all') === null);
check('empty simplified -> null', parseResult('{"simplified":"  ","keyWords":[]}') === null);

console.log('word knowledge');
check('running is known', isKnownWord('running'));
check('studies is known', isKnownWord('studies'));
check('ubiquitous is unknown', !isKnownWord('ubiquitous'));

console.log('properNouns');
const nouns = properNouns('The report says Microsoft and Google will ship the product.');
check('finds mid-sentence names', nouns.has('microsoft') && nouns.has('google'));
check('ignores first word', !nouns.has('the'));
check('ignores sentence starters', !properNouns('Politics is hard. Everything changes.').has('everything'));

console.log('verify: good output');
const original =
  'The organization subsequently initiated a comprehensive investigation into the circumstances that precipitated the unexpected termination of the project, which had been anticipated to conclude in 2024.';
const good =
  'The group started a full check. They wanted to know what caused the sudden end of the project. The project was expected to finish in 2024.';
const goodOutcome = verify(original, {
  simplified: good,
  keyWords: [{ term: 'precipitated', simple: 'caused' }],
  keyPhrases: [{ term: 'carry out', simple: 'do' }],
});
check('passes', goodOutcome.ok, goodOutcome.violations.join(' | '));
check(
  'is actually easier',
  hardRatio(good, new Set()) < hardRatio(original, properNouns(original)),
  'easy=' + hardRatio(good, new Set()).toFixed(2) + ' hard=' + hardRatio(original, properNouns(original)).toFixed(2),
);
check(
  'empty key phrases allowed',
  verify(original, { simplified: good, keyWords: [{ term: 'precipitated', simple: 'caused' }], keyPhrases: [] }).ok,
);

console.log('verify: rejections');
const cjk = verify(original, {
  simplified: '\u8fd9\u662f\u4e00\u4e2a\u7b80\u5355\u7684\u7248\u672c\u3002',
  keyWords: [{ term: 'report', simple: 'a paper' }],
  keyPhrases: [],
});
check('rejects CJK', !cjk.ok && cjk.violations.some((v) => v.includes('Chinese')));

const noKeys = verify(original, { simplified: good, keyWords: [], keyPhrases: [] });
check(
  'rejects missing key words',
  !noKeys.ok && noKeys.violations.some((v) => v.includes('key words')),
  noKeys.violations.join(' | '),
);

const longSentence = verify(original, {
  simplified:
    'The group started a full check and they wanted to know what caused the sudden end of the project that was expected to finish in the year 2024 for the team in the office today.',
  keyWords: [{ term: 'check', simple: 'a look' }],
  keyPhrases: [],
});
check(
  'rejects long sentence',
  !longSentence.ok && longSentence.violations.some((v) => v.includes('longest sentence')),
);

const missing = verify('The company reported revenue of 4821 million in 2024.', {
  simplified: 'The company said it earned a lot of money last year.',
  keyWords: [{ term: 'revenue', simple: 'money earned' }],
  keyPhrases: [{ term: 'last year', simple: 'the year before' }],
});
check(
  'rejects dropped numbers',
  !missing.ok && missing.violations.some((v) => v.includes('4821')),
);

const hard = verify('The team met.', {
  simplified:
    'The ubiquitous ephemeral perspicacious obfuscated defenestrated recalcitrant team convened ostensibly.',
  keyWords: [{ term: 'ubiquitous', simple: 'everywhere' }],
  keyPhrases: [],
});
check(
  'rejects hard words',
  !hard.ok && hard.violations.some((v) => v.includes('uncommon words')),
);

const notSimpler = verify('The group started a full check and found the cause.', {
  simplified: 'The organization commenced a comprehensive verification and ascertained the underlying causation.',
  keyWords: [{ term: 'verify', simple: 'check' }],
  keyPhrases: [],
});
check('rejects harder output', !notSimpler.ok);

console.log('translate: parse a word or a short phrase');
const swapped = parseTranslation(
  '{"plainWords":[{"term":"carry out","simple":"do"},{"term":"investigation","simple":"check"}],"plainSentence":"To try to find out what happened."}',
);
check('reads the swaps', swapped?.plainWords.length === 2);
check('reads the plain sentence', swapped?.plainSentence.startsWith('To try') === true);
check('rejects garbage', parseTranslation('no json at all') === null);
check('rejects a missing sentence', parseTranslation('{"plainWords":[{"term":"a","simple":"b"}]}') === null);
check(
  'drops empty swaps',
  parseTranslation('{"plainWords":[{"term":"ban","simple":""},{"term":"put off","simple":"delay"}],"plainSentence":"Wait."}')
    ?.plainWords.length === 1,
);
check(
  'caps swaps at four',
  parseTranslation(
    '{"plainWords":[{"term":"a","simple":"1"},{"term":"b","simple":"2"},{"term":"c","simple":"3"},{"term":"d","simple":"4"},{"term":"e","simple":"5"}],"plainSentence":"Wait."}',
  )?.plainWords.length === 4,
);

console.log('translate: verification');
const single = verifyTranslation('fascinating', {
  plainWords: [{ term: 'fascinating', simple: 'very interesting' }],
  plainSentence: 'It makes you want to know more.',
});
check('accepts a single word said another way', single.ok, single.violations.join(' | '));

const phrase = verifyTranslation('carry out an investigation', {
  plainWords: [
    { term: 'carry out', simple: 'do' },
    { term: 'investigation', simple: 'check' },
  ],
  plainSentence: 'To try to find out what happened.',
});
check('accepts a short phrase said another way', phrase.ok, phrase.violations.join(' | '));

const longForm = verifyTranslation(
  'The organization subsequently initiated a comprehensive investigation into the circumstances.',
  {
    plainWords: [
      { term: 'initiated', simple: 'started' },
      { term: 'comprehensive', simple: 'full' },
      { term: 'investigation', simple: 'check' },
      { term: 'circumstances', simple: 'what happened' },
    ],
    plainSentence: 'The group started a full check to find out what happened.',
  },
);
check('accepts a sentence said another way', longForm.ok, longForm.violations.join(' | '));

const echoed = verifyTranslation('fascinating', {
  plainWords: [{ term: 'fascinating', simple: 'very interesting' }],
  plainSentence: 'It was a fascinating thing to see.',
});
check(
  'rejects echoing the hard word back',
  !echoed.ok && echoed.violations.some((v) => v.includes('reused')),
  echoed.violations.join(' | '),
);
check('detects the reuse directly', reusedHardWords('fascinating', 'a fascinating thing').join(',') === 'fascinating');

check(
  'rejects Chinese output',
  !verifyTranslation('fascinating', {
    plainWords: [{ term: 'fascinating', simple: 'very interesting' }],
    plainSentence: '\u8fd9\u662f\u4e2d\u6587\u3002',
  }).ok,
);
check(
  'rejects a missing swap for a hard word',
  !verifyTranslation('ubiquitous', { plainWords: [], plainSentence: 'It is everywhere.' }).ok,
);
check(
  'rejects a swap that is not in the input',
  !verifyTranslation('ubiquitous', {
    plainWords: [{ term: 'widespread', simple: 'everywhere' }],
    plainSentence: 'It is found in many places.',
  }).ok,
);
check(
  'rejects a swap that is not simpler',
  !verifyTranslation('ubiquitous', {
    plainWords: [{ term: 'ubiquitous', simple: 'omnipresent' }],
    plainSentence: 'It is found in many places.',
  }).ok,
);
check(
  'rejects a dropped number',
  !verifyTranslation('a 40 percent rise', {
    plainWords: [{ term: 'rise', simple: 'going up' }],
    plainSentence: 'It went up a lot.',
  }).ok,
);

console.log('selection: which actions a selection can use');
const PASSAGE =
  'The committee said on Tuesday that it would carry out a comprehensive investigation into the circumstances that led to the unexpected termination of the programme, which had originally been expected to conclude sometime during the course of the following year, and that it would publish its findings.';
const ONE_SENTENCE =
  'The organization subsequently initiated a comprehensive investigation into the circumstances.';
check('a single word can only be restated', availableActions('fascinating').join(',') === 'translate');
check('a tiny phrase can only be restated', availableActions('put off').join(',') === 'translate');
check('a phrase can also be simplified', availableActions('carry out an investigation').join(',') === 'translate,simplify');
check('a sentence can be both', availableActions(ONE_SENTENCE).join(',') === 'translate,simplify');
check('a passage can only be simplified', availableActions(PASSAGE).join(',') === 'simplify');
check('a passage really is over the limit', PASSAGE.split(/\s+/).filter(Boolean).length > TRANSLATE_MAX_WORDS);
check(
  'the limit itself is still restatable',
  availableActions(Array(TRANSLATE_MAX_WORDS).fill('word').join(' ')).includes('translate'),
);
check(
  'one word over the limit is refused',
  !availableActions(Array(TRANSLATE_MAX_WORDS + 1).fill('word').join(' ')).includes('translate'),
);
check('the limit is the output budget', TRANSLATE_MAX_WORDS === 40);
check('a passage is still worth simplifying', availableActions(PASSAGE).join(',') !== '');

console.log('ipa');
const table = parseTsv(
  'cat\tkæt\tkæt\ncolour\tkʌlə\t\ncolor\t\tkʌlɚ\nbanana\tbəˈnɑːnə\t\norange\t\tˈɔɹɪndʒ\n',
);
check('parses rows', table.size === 5);
const cat = lookupWords(table, ['cat']).cat;
check('exact match both accents', cat?.uk === 'kæt' && cat?.us === 'kæt' && !cat?.ukApprox && !cat?.usApprox);
const color = lookupWords(table, ['color']).color;
check('us spelling finds uk via variant', color?.uk === 'kʌlə' && !color.ukApprox);
check('us side stays exact', color?.us === 'kʌlɚ' && !color.usApprox);
const colour = lookupWords(table, ['colour']).colour;
check('uk spelling finds us via variant', colour?.us === 'kʌlɚ' && !colour.usApprox);
const banana = lookupWords(table, ['banana']).banana;
check('borrows uk from us', banana?.us === 'bəˈnɑːnə' && banana.usApprox);
const orange = lookupWords(table, ['orange']).orange;
check('borrows us from uk', orange?.uk === 'ˈɔɹɪndʒ' && orange.ukApprox);
check('unknown word is omitted', !('zzz' in lookupWords(table, ['zzz'])));
check('lowercases input', lookupWords(table, ['CAT']).cat?.uk === 'kæt');
check('organization gets a uk variant', variants('organization', 'uk').includes('organisation'));
check('tokens ignore punctuation', lookupTokens('Hello, world!').join(',') === 'hello,world');

console.log('voice picking');
const voices = [
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Google US English', lang: 'en-US' },
  { name: 'Daniel', lang: 'en-GB' },
] as unknown as SpeechSynthesisVoice[];
check('picks a british voice', pickVoice('uk', voices)?.name === 'Daniel');
check('prefers samantha for us', pickVoice('us', voices)?.name === 'Samantha');
check(
  'no exact locale returns null',
  pickVoice('uk', [{ name: 'Amelie', lang: 'fr-FR' }] as unknown as SpeechSynthesisVoice[]) === null,
);

console.log('drill-down explanations');
const okExplain = parseExplanation(
  '{"explanation":"very interesting","synonyms":["intriguing","gripping"]}',
  'fascinating',
);
check('parses the explanation', okExplain?.explanation === 'very interesting');
check('parses synonyms', okExplain?.synonyms.length === 2);
check(
  'drops a synonym equal to the word',
  parseExplanation('{"explanation":"very big","synonyms":["enormous","huge"]}', 'enormous')?.synonyms.join(',') ===
    'huge',
);
check(
  'caps synonyms at three',
  parseExplanation('{"explanation":"a b c","synonyms":["w","x","y","z"]}', 'q')?.synonyms.length === 3,
);
check('rejects garbage', parseExplanation('nope', 'q') === null);

check(
  'accepts a simple explanation',
  verifyExplanation('fascinating', { explanation: 'very interesting and fun', synonyms: [] }).ok,
);
check('detects the word itself', usesTargetWord('enormous', 'it was enormous').join(',') === 'enormous');
check('detects an inflected form', usesTargetWord('run', 'he runs fast').join(',') === 'runs');
check(
  'rejects an explanation that repeats the word',
  !verifyExplanation('fascinating', { explanation: 'something fascinating to see', synonyms: [] }).ok,
);
check(
  'rejects a non-English explanation',
  !verifyExplanation('fascinating', { explanation: '\u5f88\u6709\u610f\u601d\u7684', synonyms: [] }).ok,
);
const longExplain = verifyExplanation('fascinating', {
  explanation:
    'this is a very long explanation that keeps going and going with many many words that are all common and simple and easy to read for anyone at all',
  synonyms: [],
});
check(
  'rejects an over-long explanation',
  !longExplain.ok && longExplain.violations.some((v) => v.includes('Keep it under')),
  longExplain.violations.join(' | '),
);
const hardExplain = verifyExplanation('enormous', {
  explanation: 'of considerable magnitude and prodigious extent',
  synonyms: [],
});
check(
  'rejects hard words in the explanation',
  !hardExplain.ok && hardExplain.violations.some((v) => v.includes('uncommon words')),
  hardExplain.violations.join(' | '),
);

console.log('');
console.log(failed === 0 ? 'SELFTEST PASS' : 'SELFTEST FAIL (' + failed + ')');
if (failed > 0) throw new Error('SELFTEST FAILED (' + failed + ' checks)');
