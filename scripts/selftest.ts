import {
  containsCJK,
  hardRatio,
  isKnownWord,
  parseResult,
  properNouns,
  verify,
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

console.log('');
console.log(failed === 0 ? 'SELFTEST PASS' : 'SELFTEST FAIL (' + failed + ')');
if (failed > 0) throw new Error('SELFTEST FAILED (' + failed + ' checks)');
